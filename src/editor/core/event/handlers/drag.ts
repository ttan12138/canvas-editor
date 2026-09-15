import { ImageDisplay } from '../../../dataset/enum/Common'
import { ElementType } from '../../../dataset/enum/Element'
import { findParent } from '../../../utils'
import { CanvasEvent } from '../CanvasEvent'
import { IElement } from '../../../interface/Element'
import { setDragSourceDraw } from '../dragState'

function dragover(evt: DragEvent | MouseEvent, host: CanvasEvent) {
  const draw = host.getDraw()
  const isReadonly = draw.isReadonly()
  if (isReadonly) return
  evt.preventDefault()

  const pageContainer = draw.getPageContainer()
  const containerRect = pageContainer.getBoundingClientRect()
  const mouseX = evt.clientX
  const mouseY = evt.clientY
  const isInsideCurrentEditor =
    mouseX >= containerRect.left &&
    mouseX <= containerRect.right &&
    mouseY >= containerRect.top &&
    mouseY <= containerRect.bottom

  if (!isInsideCurrentEditor) {
    return
  }

  const composedPath = evt.composedPath ? evt.composedPath() : []
  const target = <Element>(composedPath[0] || evt.target)
  const editorRegion = findParent(
    target,
    (node: Element) => node === pageContainer,
    true
  )
  if (!editorRegion) return
  const targetElement = evt.target as HTMLDivElement
  const pageIndex = targetElement.dataset.index
  if (pageIndex) {
    draw.setPageNo(Number(pageIndex))
  }
  const rect = editorRegion.getBoundingClientRect()
  const x = mouseX - rect.left
  const y = mouseY - rect.top
  const position = draw.getPosition()
  const positionContext = position.adjustPositionContext({
    x,
    y
  })
  if (!positionContext) return
  const { isTable, tdValueIndex, index } = positionContext
  const positionList = position.getPositionList()
  const curIndex = isTable ? tdValueIndex! : index
  if (~index) {
    const rangeManager = draw.getRange()
    rangeManager.setRange(curIndex, curIndex)
    position.setCursorPosition(positionList[curIndex])
  }
  const cursor = draw.getCursor()
  const {
    cursor: { dragColor, dragWidth, dragFloatImageDisabled }
  } = draw.getOptions()
  if (dragFloatImageDisabled) {
    const dragElement = host.cacheElementList?.[host.cacheRange!.startIndex]
    if (
      dragElement?.type === ElementType.IMAGE &&
      (dragElement.imgDisplay === ImageDisplay.FLOAT_TOP ||
        dragElement.imgDisplay === ImageDisplay.FLOAT_BOTTOM ||
        dragElement.imgDisplay === ImageDisplay.SURROUND)
    ) {
      return
    }
  }
  cursor.drawCursor({
    width: dragWidth,
    color: dragColor,
    isBlink: false,
    isFocus: false
  })
}

function dragstart(evt: DragEvent, host: CanvasEvent) {
  const draw = host.getDraw()
  if (draw.isReadonly()) return
  // 记录拖拽源编辑器实例，供 drop 时判断是否为跨编辑器拖拽
  setDragSourceDraw(draw)
  const rangeManager = draw.getRange()
  const range = rangeManager.getRange()
  const { startIndex, endIndex } = range
  if (startIndex === endIndex && startIndex < 0) return
  const elementList = draw.getElementList()
  const dragElementList: IElement[] = elementList.slice(
    startIndex + 1,
    endIndex + 1
  )
  console.log('[DEBUG drag] dragstart 拖出元素列表 startIndex=', startIndex, 'endIndex=', endIndex,
    '元素=', dragElementList.map(e => ({
      type: e.type, value: e.value, control: e.control?.type, listId: e.listId, listType: e.listType
    })))
  if (!dragElementList.length) return
  try {
    const data = JSON.stringify(dragElementList)
    evt.dataTransfer?.setData('canvas-editor-elements', data)
    evt.dataTransfer!.effectAllowed = 'copyMove'
  } catch (e) {
    console.error('Failed to serialize drag elements:', e)
  }
}

export default {
  dragover,
  dragstart
}
