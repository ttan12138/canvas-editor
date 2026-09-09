import { ImageDisplay } from '../../../dataset/enum/Common'
import { ControlComponent } from '../../../dataset/enum/Control'
import { ElementType } from '../../../dataset/enum/Element'
import { CanvasEvent } from '../CanvasEvent'

// 视为“单纯点击”的指针抖动容差（像素），小于该距离不进入拖拽扩选
const CLICK_TOLERANCE = 3

export function mousemove(evt: MouseEvent, host: CanvasEvent) {
  const draw = host.getDraw()
  // 是否是拖拽文字
  if (host.isAllowDrag) {
    // 是否允许拖拽到选区
    const x = evt.offsetX
    const y = evt.offsetY
    const { startIndex, endIndex } = host.cacheRange!
    const positionList = host.cachePositionList!
    for (let p = startIndex + 1; p <= endIndex; p++) {
      const {
        coordinate: { leftTop, rightBottom }
      } = positionList[p]
      if (
        x >= leftTop[0] &&
        x <= rightBottom[0] &&
        y >= leftTop[1] &&
        y <= rightBottom[1]
      ) {
        return
      }
    }
    const cacheStartIndex = host.cacheRange?.startIndex
    if (cacheStartIndex) {
      // 浮动元素拖拽调整位置
      const dragElement = host.cacheElementList![cacheStartIndex]
      if (
        dragElement?.type === ElementType.IMAGE &&
        (dragElement.imgDisplay === ImageDisplay.SURROUND ||
          dragElement.imgDisplay === ImageDisplay.FLOAT_TOP ||
          dragElement.imgDisplay === ImageDisplay.FLOAT_BOTTOM)
      ) {
        draw.getPreviewer().clearResizer()
        draw.getImageParticle().dragFloatImage(evt.movementX, evt.movementY)
      }
    }
    host.dragover(evt)
    host.isAllowDrop = true
    return
  }
  // console.log('mousemove - isAllowSelection:', host.isAllowSelection, 'mouseDownStartPosition:', host.mouseDownStartPosition)
  if (!host.isAllowSelection || !host.mouseDownStartPosition) return
  // 防止“点击抖动”把光标定位到行/页边缘时误拉出一大段选区：
  // 按下后指针几乎未移动（可视为一次单纯点击）时，不进入拖拽扩选逻辑，
  // 保持 mousedown 已设置的闭合光标，避免 getPositionByXY 在折叠行附近
  // 微小抖动下把起点/终点快照到相距很远的位置。
  const start = host.mouseDownStartPosition
  const { offsetX: moveX, offsetY: moveY } = evt
  if (
    typeof start.x === 'number' &&
    typeof start.y === 'number' &&
    Math.abs(moveX - start.x) < CLICK_TOLERANCE &&
    Math.abs(moveY - start.y) < CLICK_TOLERANCE
  ) {
    return
  }
  // console.log('mousemove - offsetX:', evt.offsetX, 'offsetY:', evt.offsetY)
  const target = evt.target as HTMLDivElement
  const pageIndex = target.dataset.index
  // console.log('mousemove - target:', target, 'pageIndex:', pageIndex)
  // 设置pageNo
  if (pageIndex) {
    draw.setPageNo(Number(pageIndex))
  }
  // 结束位置
  const position = draw.getPosition()
  const positionResult = position.getPositionByXY({
    x: evt.offsetX,
    y: evt.offsetY
  })
  // console.log('mousemove - positionResult.index:', positionResult.index)
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
  } = host.mouseDownStartPosition
  const endIndex = isTable ? tdValueIndex! : index
  // 判断是否是表格跨行/列
  const rangeManager = draw.getRange()
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
    position.setPositionContext({
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
    // 开始或结束位置存在表格，但是非相同表格则忽略选区设置
    if ((startIsTable || isTable) && startTableId !== tableId) return
    // 开始位置
    let start = startIndex
    if (start > end) {
      ;[start, end] = [end, start]
    }
    if (start === end) return
    // 背景文本禁止选区
    const elementList = draw.getElementList()
    const startElement = elementList[start + 1]
    const endElement = elementList[end]
    if (
      startElement?.controlComponent === ControlComponent.PLACEHOLDER &&
      endElement?.controlComponent === ControlComponent.PLACEHOLDER &&
      startElement.controlId === endElement.controlId
    ) {
      return
    }
    rangeManager.setRange(start, end)
  }
  // 绘制
  // 右键拖拽时关闭弹窗类控件，避免下拉列表与右键菜单同时显示
  if (evt.buttons === 2) {
    draw.getControl().destroyControl({ isEmitEvent: false })
  }
  draw.render({
    isSubmitHistory: false,
    isSetCursor: false,
    isCompute: false
  })
}
