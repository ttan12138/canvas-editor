import {
  CURSOR_AGENT_OFFSET_HEIGHT,
  CURSOR_AGENT_WIDTH
} from '../../dataset/constant/Cursor'
import { EDITOR_PREFIX } from '../../dataset/constant/Editor'
import { MoveDirection } from '../../dataset/enum/Observer'
import { DeepRequired } from '../../interface/Common'
import { ICursorOption } from '../../interface/Cursor'
import { IEditorOption } from '../../interface/Editor'
import { IElementPosition } from '../../interface/Element'
import { findScrollContainer, getScrollableViewport, nextTick } from '../../utils'
import { isMobile } from '../../utils/ua'
import { Draw } from '../draw/Draw'
import { CanvasEvent } from '../event/CanvasEvent'
import { Position } from '../position/Position'
import { CursorAgent } from './CursorAgent'
import { GlobalEvent } from '../event/GlobalEvent'

export type IDrawCursorOption = ICursorOption & {
  isShow?: boolean
  isBlink?: boolean
  isFocus?: boolean
  hitLineStartIndex?: number
  // 覆盖全局 options.isMoveCursorToVisible，强制本次绘制是否滚动到光标可见
  isMoveCursorToVisible?: boolean
  // 显式指定光标移动方向，用于决定滚动到首行(UP)还是尾行(DOWN)。
  // 由键盘方向键等调用方传入，避免依赖 style.top 推断（量纲不一致导致误判）
  direction?: MoveDirection
}

export interface IMoveCursorToVisibleOption {
  direction: MoveDirection
  cursorPosition: IElementPosition
}

export class Cursor {
  private readonly ANIMATION_CLASS = `${EDITOR_PREFIX}-cursor--animation`

  private draw: Draw
  private container: HTMLDivElement
  private options: DeepRequired<IEditorOption>
  private position: Position
  private cursorDom: HTMLDivElement
  private cursorAgent: CursorAgent
  private blinkTimeout: number | null
  private hitLineStartIndex: number | undefined
  // 记录最近一次 drawCursor 实际把光标 DOM 定位到的元素 index。
  // 用于 moveCursorToVisible 判断能否信任 cursorDom.getBoundingClientRect()：
  // 仅当传入的 cursorPosition.index 与该值一致（即 DOM 已重定位到该位置）时，
  // 才使用 DOM 坐标；否则（如非闭合选区传入的是活动端、而 DOM 尚未 drawCursor 重定位）
  // 回退到基于 pageNo/坐标的估算，避免用旧的 DOM 坐标算错 delta 导致不滚动。
  private lastCursorIndex: number | null = null
  // 多编辑器诊断：每个实例唯一ID，用于定位是哪个编辑器操作了光标

  constructor(draw: Draw, canvasEvent: CanvasEvent) {
    this.draw = draw
    this.container = draw.getContainer()
    this.position = draw.getPosition()
    this.options = draw.getOptions()

    this.cursorDom = document.createElement('div')
    this.cursorDom.classList.add(`${EDITOR_PREFIX}-cursor`)
    this.container.append(this.cursorDom)
    this.cursorAgent = new CursorAgent(draw, canvasEvent)
    this.blinkTimeout = null
  }

  public getCursorDom(): HTMLDivElement {
    return this.cursorDom
  }

  public getAgentDom(): HTMLTextAreaElement {
    return this.cursorAgent.getAgentCursorDom()
  }

  public getAgentIsActive(): boolean {
    return this.getAgentDom() === document.activeElement
  }

  public getAgentDomValue(): string {
    return this.getAgentDom().value
  }

  public clearAgentDomValue() {
    this.getAgentDom().value = ''
  }

  public getHitLineStartIndex() {
    return this.hitLineStartIndex
  }

  private _blinkStart() {
    this.cursorDom.classList.add(this.ANIMATION_CLASS)
  }

  private _blinkStop() {
    this.cursorDom.classList.remove(this.ANIMATION_CLASS)
  }

  private _setBlinkTimeout() {
    this._clearBlinkTimeout()
    this.blinkTimeout = window.setTimeout(() => {
      this._blinkStart()
    }, 500)
  }

  private _clearBlinkTimeout() {
    if (this.blinkTimeout) {
      this._blinkStop()
      window.clearTimeout(this.blinkTimeout)
      this.blinkTimeout = null
    }
  }

  public focus() {
    // 移动端只读模式禁用聚焦避免唤起输入法，web端允许聚焦避免事件无法捕获
    if (isMobile && this.draw.isReadonly()) return
    const container = this.draw.getContainer()
    const agentCursorDom = this.cursorAgent.getAgentCursorDom()
    // 多编辑器实例：聚焦当前实例前，先隐藏其他实例的光标，避免同时出现多个光标。
    // 注意：focus() 仅在“用户主动点击/输入恢复”等场景被调用，必须无条件聚焦当前实例，
    // 否则从其他实例切换过来时 activeElement 尚停留在旧实例，会被误判而跳过聚焦，
    // 导致光标闪烁但 textarea 未真正聚焦（无法键入、ctrl+z/y 失效）。
    GlobalEvent.blurOtherEditors(container)
    // 光标不聚焦时重新定位（同步执行，不再使用 setTimeout 抢焦点）
    if (document.activeElement !== agentCursorDom) {
      // 阻止聚焦隐藏输入框时浏览器自动把它滚入视口，避免选区拖拽时产生滚动跳跃
      agentCursorDom.focus({ preventScroll: true })
      agentCursorDom.setSelectionRange(0, 0)
    }
  }

  public drawCursor(payload?: IDrawCursorOption) {
    let cursorPosition = this.position.getCursorPosition()
    if (!cursorPosition) return
    const { scale, cursor } = this.options
    const {
      color,
      width,
      isShow = true,
      isBlink = true,
      isFocus = true,
      hitLineStartIndex
    } = { ...cursor, ...payload }
    // 设置光标代理
    const height = this.draw.getHeight()
    const pageGap = this.draw.getPageGap()
    // 光标位置
    this.hitLineStartIndex = hitLineStartIndex
    if (hitLineStartIndex) {
      const positionList = this.position.getPositionList()
      cursorPosition = positionList[hitLineStartIndex]
    }
    const {
      metrics,
      coordinate: { leftTop, rightTop },
      ascent,
      pageNo
    } = cursorPosition
    const zoneManager = this.draw.getZone()
    const curPageNo = zoneManager.isMainActive()
      ? pageNo
      : this.draw.getPageNo()
    const preY = curPageNo * (height + pageGap)
    // 默认偏移高度
    const defaultOffsetHeight = CURSOR_AGENT_OFFSET_HEIGHT * scale
    // 增加1/4字体大小（最小为defaultOffsetHeight即默认偏移高度）
    const increaseHeight = Math.min(metrics.height / 4, defaultOffsetHeight)
    const cursorHeight = metrics.height + increaseHeight * 2
    const agentCursorDom = this.cursorAgent.getAgentCursorDom()
    if (isFocus) {
      const container = this.draw.getContainer()
      // 必须在当前事件循环（浏览器默认焦点处理）之后再聚焦，
      // 否则在 mousedown 中同步 focus 会被浏览器默认焦点行为覆盖，
      // 导致 textarea 无法真正获得焦点（光标闪烁但无法录入）。
      setTimeout(() => {
        // 多编辑器实例：若焦点已落在“其他”实例，不抢回焦点（避免竞态）
        if (GlobalEvent.isActiveElementOtherEditor(container)) {
          return
        }
        this.focus()
      })
    }
    // fillText位置 + 文字基线到底部距离 - 模拟光标偏移量
    const descent =
      metrics.boundingBoxDescent < 0 ? 0 : metrics.boundingBoxDescent
    const cursorTop =
      leftTop[1] + ascent + descent - (cursorHeight - increaseHeight) + preY
    const cursorLeft = hitLineStartIndex ? leftTop[0] : rightTop[0]
    // 代理输入框（隐藏 textarea）随光标定位：IME 预输入时光标右移，
    // 其 100px 宽可能超出页面右边界，在祖先 overflow-x:auto 时触发横向滚动条。
    // 将其左边界限制在页面宽度内（代理框不可见，不影响内容渲染与输入）。
    const agentWidth = agentCursorDom.offsetWidth || CURSOR_AGENT_WIDTH
    const maxAgentLeft = this.draw.getWidth() - agentWidth
    const agentLeft = Math.max(0, Math.min(cursorLeft, maxAgentLeft))
    agentCursorDom.style.left = `${agentLeft}px`
    agentCursorDom.style.top = `${
      cursorTop + cursorHeight - defaultOffsetHeight
    }px`
    // 模拟光标显示
    if (!isShow) {
      this.recoveryCursor()
      return
    }
    // 设置光标位置
    const isReadonly = this.draw.isReadonly()
    this.cursorDom.style.width = `${width * scale}px`
    this.cursorDom.style.backgroundColor = color
    this.cursorDom.style.left = `${cursorLeft}px`
    this.cursorDom.style.top = `${cursorTop}px`
    this.cursorDom.style.display = isReadonly ? 'none' : 'block'
    this.cursorDom.style.height = `${cursorHeight}px`
    this.lastCursorIndex = cursorPosition.index
    if (isBlink) {
      this._setBlinkTimeout()
    } else {
      this._clearBlinkTimeout()
    }
    // 移动到视野范围内（仅在聚焦时）
    // payload.isMoveCursorToVisible 可覆盖全局 options.isMoveCursorToVisible
    const isMoveCursorToVisible =
      payload?.isMoveCursorToVisible ?? this.options.isMoveCursorToVisible !== false
    if (isFocus && isMoveCursorToVisible) {
      nextTick(() => {
        // nexttick后执行 => 避免画布没有渲染完成造成残影
        // 所有光标变化统一采用 auto 模式：调用方显式传入 direction 时使用之（通常为 AUTO），
        // 否则回退到 AUTO —— 由 moveCursorToVisible 依据“结果所在行”是否越界自动判断：
        // 顶部被截/完全在视口顶之上 → 滚到视口顶部；底部被截/完全在视口底之下 → 滚到视口底部；
        // 整行已完整展示 → 不滚动。不再依赖旧的方向键方向推断（style.top 量纲不一致易误判）。
        const direction = payload?.direction ?? MoveDirection.AUTO
        this.moveCursorToVisible({
          cursorPosition: cursorPosition!,
          direction
        })
      })
    }
  }

  public recoveryCursor() {
    this.cursorDom.style.display = 'none'
    this._clearBlinkTimeout()
    // 重置光标和代理光标的位置，避免旧top值撑开容器scrollHeight
    this.cursorDom.style.top = '0px'
    this.cursorAgent.getAgentCursorDom().style.top = '0px'
  }

  public moveCursorToVisible(payload: IMoveCursorToVisibleOption) {
    const { cursorPosition, direction } = payload
    if (!cursorPosition || !direction) return
    // 滚动容器（document 滚动时为 document.documentElement）
    const scrollContainer = findScrollContainer(
      this.container,
      this.options.scrollContainerSelector
    )
    const isDocumentScroll = scrollContainer === document.documentElement
    // 视口边界：优先使用配置的滚动容器选择器，否则取可滚动祖先与窗口的交集
    const viewport = getScrollableViewport(
      this.container,
      this.options.scrollContainerSelector
    )
    let viewTop = viewport.top
    let viewBottom = viewport.bottom
    // 计算光标所在行的真实视口坐标。
    // 优先使用已正确定位的 cursorDom.getBoundingClientRect()：它由 drawCursor 按真实渲染
    // 摆放（含缩放、滚动、跨分页/连页的页面堆叠），因此跨模式都准确。
    // 仅当调用方传入的 cursorPosition 与当前光标 DOM 不是同一处（如 shift 扩选传入的是
    // 选区活动端而非当前 caret，且此时 cursorDom 尚未重定位）时，回退到基于
    // “pageNo*(页高+页距)+容器视口顶部”的坐标估算作为兜底。
    const domRect = this.cursorDom.getBoundingClientRect()
    const useCursorDom =
      this.lastCursorIndex === cursorPosition.index && domRect.height > 0
    let lineTop: number
    let lineBottom: number
    if (useCursorDom) {
      lineTop = domRect.top
      lineBottom = domRect.bottom
    } else {
      const {
        pageNo,
        coordinate: { leftTop, leftBottom }
      } = cursorPosition
      const preY = pageNo * (this.draw.getHeight() + this.draw.getPageGap())
      const containerTop = this.container.getBoundingClientRect().top
      lineTop = leftTop[1] + preY + containerTop
      lineBottom = leftBottom[1] + preY + containerTop
    }
    // 可选留白边距，避免贴边（仅用垂直方向）
    const { maskMargin } = this.options
    viewTop += maskMargin[0]
    viewBottom -= maskMargin[2]
    // 上键：仅当行顶超出视口上边界 → 该行滚到视口第一行；
    // 下键：仅当行底超出视口下边界 → 该行滚到视口最后一行；
    // 二者皆不满足（光标已在可视范围内）→ 视口不动。
    let delta = 0
    if (direction === MoveDirection.AUTO) {
      // 自动模式：仅当点击行“只显示一半”（顶部被截或底部被截）时滚动，使其完整展示。
      // 顶部被截 → 滚到视口顶部；底部被截 → 滚到视口底部。整行已完整可见则 delta=0 不滚动。
      if (lineTop < viewTop) {
        delta = lineTop - viewTop
      } else if (lineBottom > viewBottom) {
        delta = lineBottom - viewBottom
      }
    } else if (direction === MoveDirection.UP) {
      if (lineTop < viewTop) delta = lineTop - viewTop
    } else {
      if (lineBottom > viewBottom) delta = lineBottom - viewBottom
    }
    if (delta === 0) return
    if (isDocumentScroll) {
      const curScrollTop =
        window.scrollY || document.documentElement.scrollTop || 0
      const curScrollLeft =
        window.scrollX || document.documentElement.scrollLeft || 0
      window.scrollTo(curScrollLeft, curScrollTop + delta)
    } else {
      const el = scrollContainer as HTMLElement
      el.scroll(el.scrollLeft, el.scrollTop + delta)
    }
  }

  // 将元素坐标换算为视口坐标（扣除滚动容器偏移），用于浮层定位
  public getPositionViewportXY(
    position: IElementPosition
  ): { x: number; y: number } {
    const { pageNo, coordinate } = position
    const preY = pageNo * (this.draw.getHeight() + this.draw.getPageGap())
    // 编辑器容器自身即滚动端口（border-box 的 top 不随内容滚动变化），
    // 内容坐标需扣除滚动容器的 scrollTop/scrollLeft 才是真实视口坐标。
    const containerRect = this.container.getBoundingClientRect()
    const scrollContainer = findScrollContainer(
      this.container,
      this.options.scrollContainerSelector
    )
    const isDocumentScroll = scrollContainer === document.documentElement
    const scrollTop = isDocumentScroll
      ? window.scrollY || document.documentElement.scrollTop || 0
      : (scrollContainer as HTMLElement).scrollTop
    const scrollLeft = isDocumentScroll
      ? window.scrollX || document.documentElement.scrollLeft || 0
      : (scrollContainer as HTMLElement).scrollLeft
    return {
      x: coordinate.leftTop[0] + containerRect.left - scrollLeft,
      y: coordinate.leftBottom[1] + preY + containerRect.top - scrollTop
    }
  }

  // 返回当前光标在 viewport 中的坐标（用于下拉等浮层定位）
  public getCursorViewportXY(): { x: number; y: number } | null {
    const cursorPosition = this.draw.getPosition().getCursorPosition()
    if (!cursorPosition) return null
    return this.getPositionViewportXY(cursorPosition)
  }
}
