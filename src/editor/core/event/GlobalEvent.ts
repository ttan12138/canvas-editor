import { EDITOR_COMPONENT, EDITOR_PREFIX } from '../../dataset/constant/Editor'
import { EditorComponent } from '../../dataset/enum/Editor'
import { IEditorOption } from '../../interface/Editor'
import { deepClone, findParent } from '../../utils'
import { Cursor } from '../cursor/Cursor'
import { Control } from '../draw/control/Control'
import { Draw } from '../draw/Draw'
import { HyperlinkParticle } from '../draw/particle/HyperlinkParticle'
import { DateParticle } from '../draw/particle/date/DateParticle'
import { Previewer } from '../draw/particle/previewer/Previewer'
import { TableTool } from '../draw/particle/table/TableTool'
import { RangeManager } from '../range/RangeManager'
import { CanvasEvent } from './CanvasEvent'
import { ImageParticle } from '../draw/particle/ImageParticle'
import { INTERNAL_SHORTCUT_KEY } from '../../dataset/constant/Shortcut'
import { Magnifier } from '../draw/interactive/Magnifier'

export class GlobalEvent {
  private static editorInstances: Map<Element, CanvasEvent> = new Map()

  private draw: Draw
  private options: Required<IEditorOption>
  private cursor: Cursor | null
  private canvasEvent: CanvasEvent
  private range: RangeManager
  private previewer: Previewer
  private tableTool: TableTool
  private hyperlinkParticle: HyperlinkParticle
  private control: Control
  private magnifier: Magnifier
  private dateParticle: DateParticle
  private imageParticle: ImageParticle
  private dprMediaQueryList: MediaQueryList

  constructor(draw: Draw, canvasEvent: CanvasEvent) {
    this.draw = draw
    this.options = draw.getOptions()
    this.canvasEvent = canvasEvent
    this.cursor = null
    this.range = draw.getRange()
    this.previewer = draw.getPreviewer()
    this.tableTool = draw.getTableTool()
    this.hyperlinkParticle = draw.getHyperlinkParticle()
    this.dateParticle = draw.getDateParticle()
    this.imageParticle = draw.getImageParticle()
    this.control = draw.getControl()
    this.magnifier = draw.getMagnifier()
    this.dprMediaQueryList = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`
    )
    GlobalEvent.editorInstances.set(draw.getContainer(), canvasEvent)
  }

  // 多编辑器实例：让除当前编辑器外的其他编辑器隐藏光标
  public static blurOtherEditors(currentContainer: Element) {
    GlobalEvent.editorInstances.forEach((canvasEvent, container) => {
      if (container !== currentContainer) {
        canvasEvent.getDraw().getCursor().recoveryCursor()
      }
    })
  }

  // 多编辑器实例：根据 document.activeElement 归属判断当前真正聚焦的编辑器容器
  public static getActiveEditorContainer(): Element | null {
    let el = document.activeElement as Element | null
    while (el) {
      if (el.getAttribute(EDITOR_COMPONENT) === EditorComponent.MAIN) {
        return el
      }
      el = el.parentElement
    }
    return null
  }

  // 多编辑器实例：当前焦点是否落在“其他”编辑器实例上
  public static isActiveElementOtherEditor(currentContainer: Element): boolean {
    const activeContainer = GlobalEvent.getActiveEditorContainer()
    if (!activeContainer) return false
    return activeContainer !== currentContainer
  }

  public register() {
    this.cursor = this.draw.getCursor()
    this.addEvent()
  }

  private addEvent() {
    // console.log('[GLOBAL EVENT] Registering global drag listeners')
    window.addEventListener('blur', this.clearSideEffect)
    document.addEventListener('mousedown', this.clearSideEffect)
    document.addEventListener('mouseup', this.setCanvasEventAbility)
    document.addEventListener('wheel', this.setPageScale, { passive: false })
    document.addEventListener('visibilitychange', this._handleVisibilityChange)
    document.addEventListener('dragover', this.handleGlobalDragover, { capture: true })
    document.addEventListener('drop', this.handleGlobalDrop, { capture: true })
    document.addEventListener('mousemove', this.handleGlobalMousemove)
    document.addEventListener('mouseup', this.handleGlobalMouseup, { capture: true })
    this.dprMediaQueryList.addEventListener('change', this._handleDprChange)
    // console.log('[GLOBAL EVENT] Global drag listeners registered (capture phase)')
  }

  public removeEvent() {
    GlobalEvent.editorInstances.delete(this.draw.getContainer())
    window.removeEventListener('blur', this.clearSideEffect)
    document.removeEventListener('mousedown', this.clearSideEffect)
    document.removeEventListener('mouseup', this.setCanvasEventAbility)
    document.removeEventListener('wheel', this.setPageScale)
    document.removeEventListener(
      'visibilitychange',
      this._handleVisibilityChange
    )
    document.removeEventListener('dragover', this.handleGlobalDragover, true)
    document.removeEventListener('drop', this.handleGlobalDrop, true)
    document.removeEventListener('mousemove', this.handleGlobalMousemove)
    document.removeEventListener('mouseup', this.handleGlobalMouseup, true)
    this.dprMediaQueryList.removeEventListener('change', this._handleDprChange)
  }

  public clearSideEffect = (evt: Event) => {
    if (!this.cursor) return
    const composedPath = evt.composedPath ? evt.composedPath() : []
    const target = <Element>(composedPath[0] || evt.target)
    // target 可能不是 Node（如 window/document 触发），需要做防御性检查
    if (!target || !(target instanceof Node)) {
      return
    }
    // const targetInfo = {
    //   tag: target?.tagName,
    //   className: target?.className,
    //   hasActiveControl: !!this.control.getActiveControl(),
    //   activeControlType: this.control.getActiveControl()?.constructor?.name
    // }
    // 当点击的元素及其父级元素带有允许禁止失焦的class时，直接return
    if (target.closest('.disable-blur-course')) {
      return
    }
    const contextMenuDom = findParent(
      target,
      (node: Node & Element) =>
        !!node &&
        node.nodeType === 1 &&
        node.getAttribute(EDITOR_COMPONENT) === EditorComponent.CONTEXTMENU,
      true
    )
    if (contextMenuDom) {
      return
    }
    // 前缀预输入：点击下拉外部时关闭
    const prefixAutocomplete = this.draw.getPrefixAutocomplete()
    if (prefixAutocomplete.getIsOpen()) {
      const prefixDom = findParent(
        target,
        (node: Node & Element) =>
          !!node &&
          node.nodeType === 1 &&
          node.getAttribute(EDITOR_COMPONENT) === EditorComponent.POPUP &&
          node.classList.contains(`${EDITOR_PREFIX}-prefix-autocomplete`),
        true
      )
      if (!prefixDom) {
        prefixAutocomplete.close()
      }
    }

    const pageList = this.draw.getPageList()
    const innerEditorDom = findParent(
      target,
      (node: HTMLCanvasElement) => pageList.includes(node),
      true
    )
    if (innerEditorDom) {
      return
    }

    const agentCursorDom = this.cursor.getAgentDom()
    if (
      target === agentCursorDom ||
      (target instanceof Node && agentCursorDom.contains(target))
    ) {
      return
    }
    // 弹窗类控件(下拉/日期/数字)的弹窗属于 popup 组件，不应销毁控件
    const popupDom = findParent(
      target,
      (node: Node & Element) =>
        !!node &&
        node.nodeType === 1 &&
        node.getAttribute(EDITOR_COMPONENT) === EditorComponent.POPUP,
      true
    )
    if (popupDom) {
      return
    }
    const outerEditorDom = findParent(
      target,
      (node: Node & Element) =>
        !!node && node.nodeType === 1 && !!node.getAttribute(EDITOR_COMPONENT),
      true
    )
    if (outerEditorDom) {
      const mouseEvt = evt as MouseEvent
      if (mouseEvt.button !== undefined && mouseEvt.button !== 0) {
        this.cursor.recoveryCursor()
        this.range.recoveryRangeStyle()
        this.control.destroyControl()
        return
      }
      const range = this.range.getRange()
      if (range.startIndex !== range.endIndex) {
        this.range.setRange(range.endIndex, range.endIndex)
        this.draw.render({
          isSetCursor: false,
          isSubmitHistory: false
        })
      }
      this.cursor.recoveryCursor()
      this.range.recoveryRangeStyle()
      this.control.destroyControl()
      return
    }
    this.cursor.recoveryCursor()
    this.range.recoveryRangeStyle()
    this.previewer.clearResizer()
    this.tableTool.dispose()
    this.hyperlinkParticle.clearHyperlinkPopup()
    this.control.destroyControl()
    this.dateParticle.clearDatePicker()
    this.imageParticle.destroyFloatImage()
    this.magnifier.hide()
  }

  public setCanvasEventAbility = () => {
    this.canvasEvent.setIsAllowDrag(false)
    this.canvasEvent.setIsAllowSelection(false)
  }

  private handleGlobalDragover = (evt: DragEvent) => {
    // console.log('[GLOBAL DRAG] capture phase - clientX/Y:', evt.clientX, evt.clientY)

    const pageContainer = this.draw.getPageContainer()
    const containerRect = pageContainer.getBoundingClientRect()
    // console.log('[GLOBAL DRAG] current editor rect:', containerRect)

    const mouseX = evt.clientX
    const mouseY = evt.clientY
    const isInsideCurrentEditor =
      mouseX >= containerRect.left &&
      mouseX <= containerRect.right &&
      mouseY >= containerRect.top &&
      mouseY <= containerRect.bottom

    // console.log('[GLOBAL DRAG] isInsideCurrentEditor:', isInsideCurrentEditor)

    if (!isInsideCurrentEditor) {
      // console.log('[GLOBAL DRAG] Mouse outside current editor, skipping')
      return
    }

    const pageList = this.draw.getPageList()
    const composedPath = evt.composedPath ? evt.composedPath() : []
    const target = <Element>(composedPath[0] || evt.target)
    const innerEditorDom = findParent(
      target,
      (node: HTMLCanvasElement) => pageList.includes(node),
      true
    )
    // console.log('[GLOBAL DRAG] innerEditorDom found:', !!innerEditorDom)

    if (innerEditorDom) {
      // console.log('[GLOBAL DRAG] handling dragover for current editor')
      this.canvasEvent.dragover(evt)
    }
  }

  private handleGlobalDrop = (evt: DragEvent) => {
    const pageList = this.draw.getPageList()
    const composedPath = evt.composedPath ? evt.composedPath() : []
    const target = <Element>(composedPath[0] || evt.target)
    const innerEditorDom = findParent(
      target,
      (node: HTMLCanvasElement) => pageList.includes(node),
      true
    )
    // console.log('[GLOBAL DRAG] drop, innerEditorDom found:', !!innerEditorDom, 'target:', target)
    if (innerEditorDom) {
      this.canvasEvent.drop(evt)
      // 已在捕获阶段处理，阻止事件继续冒泡到 pageContainer 的 drop 监听，
      // 避免同一落下被重复插入（如本编辑器内拖拽出现 “文字A文字A”）
      evt.stopPropagation()
    }
  }

  private handleGlobalMousemove = (evt: MouseEvent) => {
    // 处理选区拖拽：鼠标超出编辑器范围时仍能调整选区
    if (this.canvasEvent.isAllowSelection && this.canvasEvent.mouseDownStartPosition) {
      // console.log('GlobalEvent - 检测到选区拖拽状态')
      const pageList = this.draw.getPageList()
      const pageNo = this.draw.getPageNo()
      const currentCanvas = pageList[pageNo]

      // console.log('GlobalEvent - pageNo:', pageNo, 'currentCanvas:', currentCanvas)

      if (!currentCanvas) {
        // console.log('GlobalEvent - 无法获取当前canvas，返回')
        return
      }

      const canvasRect = currentCanvas.getBoundingClientRect()
      const mouseX = evt.clientX
      const mouseY = evt.clientY

      // console.log('GlobalEvent - mouseX:', mouseX, 'mouseY:', mouseY)
      // console.log('GlobalEvent - canvasRect:', canvasRect.left, canvasRect.top, canvasRect.width, canvasRect.height)

      // 计算相对于当前 canvas 的位置，限制在 canvas 范围内
      const clampedX = Math.max(0, Math.min(canvasRect.width, mouseX - canvasRect.left))
      const clampedY = Math.max(0, Math.min(canvasRect.height, mouseY - canvasRect.top))

      // console.log('GlobalEvent - clampedX:', clampedX, 'clampedY:', clampedY)

      // 构造模拟事件
      const fakeEvent = {
        offsetX: clampedX,
        offsetY: clampedY,
        target: currentCanvas,
        preventDefault: () => {}
      } as unknown as MouseEvent

      // console.log('GlobalEvent - 调用 mousemove')

      // 调用 mousemove 处理
      this.canvasEvent.mousemove(fakeEvent)
      return
    }

    if (!this.canvasEvent.isAllowDrag) return

    const pageContainer = this.draw.getPageContainer()
    const containerRect = pageContainer.getBoundingClientRect()
    const mouseX = evt.clientX
    const mouseY = evt.clientY

    const isInsideCurrentEditor =
      mouseX >= containerRect.left &&
      mouseX <= containerRect.right &&
      mouseY >= containerRect.top &&
      mouseY <= containerRect.bottom

    if (!isInsideCurrentEditor) {
      // 鼠标移出源编辑器，清除源编辑器的预览光标
      const cursor = this.draw.getCursor()
      cursor.recoveryCursor()

      // console.log('[GLOBAL MOUSEMOVE] Mouse outside source editor, checking for target editor')

      const editors = document.querySelectorAll(`[${EDITOR_COMPONENT}]`)
      let foundTargetPageContainer: HTMLElement | null = null

      for (const editor of editors) {
        const pageContainerEl = editor.querySelector('.ce-page-container')
        if (pageContainerEl && pageContainerEl !== pageContainer) {
          const rect = pageContainerEl.getBoundingClientRect()
          if (
            mouseX >= rect.left &&
            mouseX <= rect.right &&
            mouseY >= rect.top &&
            mouseY <= rect.bottom
          ) {
            foundTargetPageContainer = pageContainerEl as HTMLElement
            break
          }
        }
      }

      if (foundTargetPageContainer !== null) {
        // console.log('[GLOBAL MOUSEMOVE] Found target editor, pageContainer:', foundTargetPageContainer)

        const rect = foundTargetPageContainer.getBoundingClientRect()
        const x = mouseX - rect.left
        const y = mouseY - rect.top

        const targetCanvas = foundTargetPageContainer.querySelector('canvas')
        if (targetCanvas) {
          const pageIndex = targetCanvas.dataset.index
          if (pageIndex) {
            // console.log('[GLOBAL MOUSEMOVE] Target page index:', pageIndex)
          }
        }

        const fakeEvent = {
          clientX: mouseX,
          clientY: mouseY,
          offsetX: x,
          offsetY: y,
          preventDefault: () => {},
          composedPath: () => [targetCanvas || foundTargetPageContainer, foundTargetPageContainer],
          target: targetCanvas || foundTargetPageContainer,
          type: 'mousemove'
        } as unknown as DragEvent

        // 查找目标编辑器的 CanvasEvent 实例
        const targetEditorDom = foundTargetPageContainer.closest(`[${EDITOR_COMPONENT}]`)
        // console.log('[GLOBAL MOUSEMOVE] targetEditorDom:', targetEditorDom)
        // console.log('[GLOBAL MOUSEMOVE] editorInstances keys:', Array.from(GlobalEvent.editorInstances.keys()))
        // console.log('[GLOBAL MOUSEMOVE] editorInstances size:', GlobalEvent.editorInstances.size)

        if (targetEditorDom) {
          const targetCanvasEvent = GlobalEvent.editorInstances.get(targetEditorDom as Element)
          // console.log('[GLOBAL MOUSEMOVE] targetCanvasEvent found:', !!targetCanvasEvent)
          if (targetCanvasEvent) {
            // console.log('[GLOBAL MOUSEMOVE] Calling target editor dragover')
            targetCanvasEvent.dragover(fakeEvent)
            // 设置目标编辑器的 isAllowDrop 标记
            targetCanvasEvent.isAllowDrop = true
          } else {
            // console.log('[GLOBAL MOUSEMOVE] Target editor CanvasEvent not found in registry')
          }
        } else {
          // console.log('[GLOBAL MOUSEMOVE] targetEditorDom is null')
        }
      }
    }
  }

  private handleGlobalMouseup = (evt: MouseEvent) => {
    // 检查是否有编辑器正在进行拖拽
    if (!this.canvasEvent.isAllowDrag) return

    const pageContainer = this.draw.getPageContainer()
    const containerRect = pageContainer.getBoundingClientRect()
    const mouseX = evt.clientX
    const mouseY = evt.clientY

    const isInsideCurrentEditor =
      mouseX >= containerRect.left &&
      mouseX <= containerRect.right &&
      mouseY >= containerRect.top &&
      mouseY <= containerRect.bottom

    // 如果鼠标在源编辑器内，让源编辑器的 mouseup 处理
    if (isInsideCurrentEditor) return

    // console.log('[GLOBAL MOUSEUP] Mouse outside source editor, checking for cross-editor drop')

    // 查找目标编辑器
    const editors = document.querySelectorAll(`[${EDITOR_COMPONENT}]`)
    let foundTargetPageContainer: HTMLElement | null = null

    for (const editor of editors) {
      const pageContainerEl = editor.querySelector('.ce-page-container')
      if (pageContainerEl && pageContainerEl !== pageContainer) {
        const rect = pageContainerEl.getBoundingClientRect()
        if (
          mouseX >= rect.left &&
          mouseX <= rect.right &&
          mouseY >= rect.top &&
          mouseY <= rect.bottom
        ) {
          foundTargetPageContainer = pageContainerEl as HTMLElement
          break
        }
      }
    }

    if (!foundTargetPageContainer) {
      // console.log('[GLOBAL MOUSEUP] No target editor found')
      return
    }

    const targetEditorDom = foundTargetPageContainer.closest(`[${EDITOR_COMPONENT}]`)
    if (!targetEditorDom) {
      // console.log('[GLOBAL MOUSEUP] Target editor DOM not found')
      return
    }

    const targetCanvasEvent = GlobalEvent.editorInstances.get(targetEditorDom as Element)
    if (!targetCanvasEvent) {
      // console.log('[GLOBAL MOUSEUP] Target editor CanvasEvent not found')
      return
    }

    // 检查目标编辑器是否允许放置
    if (!targetCanvasEvent.isAllowDrop) {
      // console.log('[GLOBAL MOUSEUP] Target editor does not allow drop')
      return
    }

    // console.log('[GLOBAL MOUSEUP] Cross-editor drop detected!')

    // 获取源编辑器的拖拽数据
    const sourceDraw = this.draw
    const sourceRangeManager = sourceDraw.getRange()
    const cacheRange = this.canvasEvent.cacheRange
    const cacheElementList = this.canvasEvent.cacheElementList

    if (!cacheRange || !cacheElementList) {
      // console.log('[GLOBAL MOUSEUP] No cached drag data')
      return
    }

    // 获取拖拽的元素
    const { startIndex, endIndex } = cacheRange
    const isCacheRangeCollapsed = startIndex === endIndex
    const cacheStartIndex = isCacheRangeCollapsed ? startIndex - 1 : startIndex
    const cacheEndIndex = endIndex

    const dragElementList = cacheElementList.slice(cacheStartIndex + 1, cacheEndIndex + 1)
    if (!dragElementList.length) {
      // console.log('[GLOBAL MOUSEUP] No drag elements')
      return
    }

    // 获取目标编辑器的当前光标位置
    const targetDraw = targetCanvasEvent.getDraw()
    const targetRangeManager = targetDraw.getRange()
    const targetRange = targetRangeManager.getRange()

    if (targetRange.startIndex < 0) {
      // console.log('[GLOBAL MOUSEUP] Invalid target range')
      return
    }

    // 深拷贝拖拽元素
    const replaceElementList = deepClone(dragElementList)

    // 获取目标编辑器的元素列表
    const targetElementList = targetDraw.getElementList()

    // 在目标位置插入元素
    targetDraw.spliceElementList(targetElementList, targetRange.startIndex + 1, 0, replaceElementList)

    // 从源编辑器删除原有元素
    const sourceElementList = sourceDraw.getElementList()
    sourceDraw.spliceElementList(sourceElementList, cacheStartIndex + 1, cacheEndIndex - cacheStartIndex)

    // 重置拖拽状态
    this.canvasEvent.setIsAllowDrag(false)
    targetCanvasEvent.isAllowDrop = false

    // 清除缓存
    this.canvasEvent.cacheRange = null
    this.canvasEvent.cacheElementList = null
    this.canvasEvent.cachePositionList = null
    this.canvasEvent.cachePositionContext = null

    // 渲染源编辑器
    sourceRangeManager.setRange(cacheStartIndex, cacheStartIndex)
    sourceDraw.render({
      isSetCursor: true,
      isSubmitHistory: true
    })

    // 渲染目标编辑器
    const newEndIndex = targetRange.startIndex + replaceElementList.length
    targetRangeManager.setRange(targetRange.startIndex, newEndIndex)
    targetDraw.render({
      isSetCursor: false,
      isSubmitHistory: true
    })

    // console.log('[GLOBAL MOUSEUP] Cross-editor drop completed!')
  }

  public watchCursorActive() {
    // 选区闭合&实际光标移出光标代理
    if (!this.range.getIsCollapsed()) return
    setTimeout(() => {
      // 将模拟光标变成失活显示状态
      if (!this.cursor?.getAgentIsActive()) {
        this.cursor?.drawCursor({
          isFocus: false,
          isBlink: false
        })
      }
    })
  }

  public setPageScale = (evt: WheelEvent) => {
    // 设置禁用快捷键
    if (
      this.options.shortcutDisableKeys.includes(
        INTERNAL_SHORTCUT_KEY.PAGE_SCALE
      )
    ) {
      return
    }
    // 仅在按下Ctrl键时生效
    if (!evt.ctrlKey) return
    evt.preventDefault()
    const { scale } = this.options
    if (evt.deltaY < 0) {
      // 放大
      const nextScale = scale * 10 + 1
      if (nextScale <= 30) {
        this.draw.setPageScale(nextScale / 10)
      }
    } else {
      // 缩小
      const nextScale = scale * 10 - 1
      if (nextScale >= 5) {
        this.draw.setPageScale(nextScale / 10)
      }
    }
  }

  private _handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      // 页面可见时重新渲染激活页面
      const range = this.range.getRange()
      const isSetCursor =
        !!~range.startIndex &&
        !!~range.endIndex &&
        range.startIndex === range.endIndex
      this.range.replaceRange(range)
      this.draw.render({
        isSetCursor,
        isCompute: false,
        isSubmitHistory: false,
        curIndex: range.startIndex
      })
    }
  }

  private _handleDprChange = () => {
    this.draw.setPageDevicePixel()
  }
}
