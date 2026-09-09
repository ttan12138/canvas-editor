import { writeElementList } from '../../../utils/clipboard'
import { CanvasEvent } from '../CanvasEvent'

export async function cut(host: CanvasEvent) {
  const draw = host.getDraw()
  const rangeManager = draw.getRange()
  const { startIndex, endIndex } = rangeManager.getRange()
  if (!~startIndex && !~endIndex) return
  if (draw.isReadonly() || !rangeManager.getIsCanInput()) return

  // 无选区（光标折叠）时不允许剪切；仅当处于控件内（如表格跨格选择）才继续
  if (startIndex === endIndex) {
    const control = draw.getControl()
    const inControl =
      control.getActiveControl() && control.getIsRangeWithinControl()
    if (!inControl) return
  }
  const elementList = draw.getElementList()
  let start = startIndex
  let end = endIndex
  // 控件内（如表格跨格选中）仍按原逻辑计算选区
  if (startIndex === endIndex) {
    const position = draw.getPosition()
    const positionList = position.getPositionList()
    const startPosition = positionList[startIndex]
    const curRowNo = startPosition.rowNo
    const curPageNo = startPosition.pageNo
    const cutElementIndexList: number[] = []
    for (let p = 0; p < positionList.length; p++) {
      const position = positionList[p]
      if (position.pageNo > curPageNo) break
      if (position.pageNo === curPageNo && position.rowNo === curRowNo) {
        cutElementIndexList.push(p)
      }
    }
    const firstElementIndex = cutElementIndexList[0] - 1
    start = firstElementIndex < 0 ? 0 : firstElementIndex
    end = cutElementIndexList[cutElementIndexList.length - 1]
  }
  const options = draw.getOptions()
  // 写入粘贴板
  await writeElementList(elementList.slice(start + 1, end + 1), options, draw.getContainer())
  const control = draw.getControl()
  let curIndex: number
  if (control.getActiveControl() && control.getIsRangeWithinControl()) {
    curIndex = control.cut()
    control.emitControlContentChange()
  } else {
    draw.spliceElementList(elementList, start + 1, end - start)
    curIndex = start
  }
  rangeManager.setRange(curIndex, curIndex)
  draw.render({ curIndex })
}
