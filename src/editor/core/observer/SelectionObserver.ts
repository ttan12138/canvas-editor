import { Draw } from '../draw/Draw'
import { RangeManager } from '../range/RangeManager'
import { ControlComponent } from '../../dataset/enum/Control'
import { findScrollContainer } from '../../utils/index'

// 每帧最大滚动距离，避免鼠标大幅越界时滚动过快产生跳跃
const MAX_SCROLL_SPEED = 30

export class SelectionObserver {
  private draw: Draw
  private rangeManager: RangeManager
  private scrollContainerSelector: string
  private isMousedown: boolean
  private scrollContainer: Element | Document
  private visibleRect: DOMRect | null
  private visibleWidth: number
  private visibleHeight: number
  private requestAnimationFrameId: number | null
  private scrollDelta: { x: number; y: number }
  private lastClientX: number
  private lastClientY: number
  private buttons: number

  constructor(draw: Draw) {
    this.draw = draw
    this.rangeManager = draw.getRange()
    this.scrollContainerSelector = draw.getOptions().scrollContainerSelector || ''
    // 构造期仅做初始解析（DOM 可能未就绪）；真正解析在 _mousedown 时进行
    this.scrollContainer = this._resolveScrollContainer()
    this.isMousedown = false
    this.visibleRect = null
    this.visibleWidth = 0
    this.visibleHeight = 0
    this.requestAnimationFrameId = null
    this.scrollDelta = { x: 0, y: 0 }
    this.lastClientX = 0
    this.lastClientY = 0
    this.buttons = 0
    this._addEvent()
  }

  private _isDocScroll(): boolean {
    return this.scrollContainer instanceof Document || this.scrollContainer === document.documentElement
  }

  // 复用 findScrollContainer：优先用配置的 scrollContainerSelector，否则向上找最近的可滚动祖先。
  // 关键：在 mousedown 时（DOM 已就绪）重新解析，避免构造期 querySelector 命中失败而回退到 document（整屏视口）。
  private _resolveScrollContainer(): Element | Document {
    return findScrollContainer(this.draw.getContainer(), this.scrollContainerSelector)
  }

  private _computeVisibleRect() {
    if (this._isDocScroll()) {
      // 文档滚动（无明确滚动容器）：可见区即整个视口
      this.visibleRect = null
      this.visibleWidth = window.innerWidth
      this.visibleHeight = window.innerHeight
    } else {
      // 取滚动容器的可视矩形（裁剪到视口），作为“可见区”边界
      const rect = (this.scrollContainer as HTMLElement).getBoundingClientRect()
      const left = Math.max(rect.left, 0)
      const top = Math.max(rect.top, 0)
      const right = Math.min(rect.right, window.innerWidth)
      const bottom = Math.min(rect.bottom, window.innerHeight)
      this.visibleRect = new DOMRect(left, top, right - left, bottom - top)
      this.visibleWidth = right - left
      this.visibleHeight = bottom - top
    }
  }

  private _addEvent() {
    document.addEventListener('mousedown', this._mousedown)
    document.addEventListener('mousemove', this._mousemove)
    document.addEventListener('mouseup', this._mouseup)
  }

  public removeEvent() {
    document.removeEventListener('mousedown', this._mousedown)
    document.removeEventListener('mousemove', this._mousemove)
    document.removeEventListener('mouseup', this._mouseup)
  }

  private _mousedown = () => {
    this.isMousedown = true
    // 每次按下时重新解析滚动容器与可见区（确保 DOM 已就绪，选择器此时可命中）
    this.scrollContainer = this._resolveScrollContainer()
    this._computeVisibleRect()
  }

  private _mouseup = () => {
    this.isMousedown = false
    this._stopMove()
  }

  // 拖拽选区时，仅当鼠标“超出”编辑器可见区域（相对可见区坐标越界）才自动滚动：
  // 滚动速度 = 鼠标超出边界的距离（向上超出多少就向上滚多少，超出一行高度即滚一行）。
  // 鼠标仍在可见区域内时不滚动；使用 rAF 持续滚动，鼠标移出窗口后选区仍可跟随。
  private _mousemove = (evt: MouseEvent) => {
    if (!this.isMousedown || this.rangeManager.getIsCollapsed()) {
      this._stopMove()
      return
    }
    this.lastClientX = evt.clientX
    this.lastClientY = evt.clientY
    this.buttons = evt.buttons
    let x = evt.clientX
    let y = evt.clientY
    if (this.visibleRect) {
      x = x - this.visibleRect.left
      y = y - this.visibleRect.top
    }
    // 仅在坐标越界（鼠标移出可见区域）时计算滚动量，超出多少滚多少
    let deltaX = 0
    let deltaY = 0
    if (y < 0) {
      deltaY = y
    } else if (y > this.visibleHeight) {
      deltaY = y - this.visibleHeight
    }
    if (x < 0) {
      deltaX = x
    } else if (x > this.visibleWidth) {
      deltaX = x - this.visibleWidth
    }
    if (deltaX === 0 && deltaY === 0) {
      this._stopMove()
      return
    }
    this.scrollDelta = { x: deltaX, y: deltaY }
    this._startMove()
  }

  private _startMove() {
    if (this.requestAnimationFrameId === null) {
      this.requestAnimationFrameId = requestAnimationFrame(this._move)
    }
  }

  // 鼠标越界时，选区端点“粘”在可见区边缘对应的文档位置，随滚动持续扩展，
  // 从而实现“选区跟随滚动”（即使鼠标已移出窗口/可视区）。
  private _updateSelection() {
    const canvasEvent = this.draw.getCanvasEvent()
    const start = canvasEvent.mouseDownStartPosition
    if (!start) return
    const pageRect = this.draw.getPageContainer().getBoundingClientRect()
    const containerTop = this.visibleRect ? this.visibleRect.top : 0
    const containerLeft = this.visibleRect ? this.visibleRect.left : 0
    // 可见区边缘在 page 元素内的坐标
    const px0 = containerLeft - pageRect.left
    const py0 = containerTop - pageRect.top
    const px1 = px0 + this.visibleWidth
    const py1 = py0 + this.visibleHeight
    let px = this.lastClientX - pageRect.left
    let py = this.lastClientY - pageRect.top
    if (this.scrollDelta.y < 0) py = py0
    else if (this.scrollDelta.y > 0) py = py1
    if (this.scrollDelta.x < 0) px = px0
    else if (this.scrollDelta.x > 0) px = px1
    const positionResult = this.draw.getPosition().getPositionByXY({
      x: px,
      y: py
    })
    if (!~positionResult.index) return
    const {
      index,
      isTable,
      tdValueIndex,
      tdIndex,
      trIndex,
      tableId,
      trId,
      tdId
    } = positionResult
    const {
      index: startIndex,
      isTable: startIsTable,
      tdIndex: startTdIndex,
      trIndex: startTrIndex,
      tableId: startTableId
    } = start
    const endIndex = isTable ? tdValueIndex! : index
    const rangeManager = this.draw.getRange()
    if (
      isTable &&
      startIsTable &&
      (tdIndex !== startTdIndex || trIndex !== startTrIndex)
    ) {
      rangeManager.setRange(
        endIndex,
        endIndex,
        tableId,
        startTdIndex,
        tdIndex,
        startTrIndex,
        trIndex
      )
      this.draw.getPosition().setPositionContext({
        isTable,
        index,
        trIndex,
        tdIndex,
        tdId,
        trId,
        tableId
      })
    } else {
      let end = ~endIndex ? endIndex : 0
      if ((startIsTable || isTable) && startTableId !== tableId) return
      let s = startIndex
      if (s > end) {
        ;[s, end] = [end, s]
      }
      if (s === end) return
      const elementList = this.draw.getElementList()
      const startElement = elementList[s + 1]
      const endElement = elementList[end]
      if (
        startElement?.controlComponent === ControlComponent.PLACEHOLDER &&
        endElement?.controlComponent === ControlComponent.PLACEHOLDER &&
        startElement.controlId === endElement.controlId
      ) {
        return
      }
      rangeManager.setRange(s, end)
    }
    if (this.buttons === 2) {
      this.draw.getControl().destroyControl({ isEmitEvent: false })
    }
    this.draw.render({
      isSubmitHistory: false,
      isSetCursor: false,
      isCompute: false
    })
  }

  private _move = () => {
    const dx = Math.max(
      -MAX_SCROLL_SPEED,
      Math.min(MAX_SCROLL_SPEED, this.scrollDelta.x)
    )
    const dy = Math.max(
      -MAX_SCROLL_SPEED,
      Math.min(MAX_SCROLL_SPEED, this.scrollDelta.y)
    )
    // 滚动目标：文档滚动→window，否则滚动容器自身
    if (this._isDocScroll()) {
      window.scrollTo(window.scrollX + dx, window.scrollY + dy)
    } else {
      const el = this.scrollContainer as HTMLElement
      el.scrollTo(el.scrollLeft + dx, el.scrollTop + dy)
    }
    // 滚动后同步更新选区端点，使选区随滚动持续扩展
    this._updateSelection()
    this.requestAnimationFrameId = requestAnimationFrame(this._move)
  }

  private _stopMove() {
    if (this.requestAnimationFrameId !== null) {
      cancelAnimationFrame(this.requestAnimationFrameId)
      this.requestAnimationFrameId = null
    }
  }
}
