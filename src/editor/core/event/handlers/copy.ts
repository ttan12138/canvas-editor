import { ControlComponent } from '../../../dataset/enum/Control'
import { ElementType } from '../../../dataset/enum/Element'
import { CONTROL_STYLE_ATTR } from '../../../dataset/constant/Element'
import { IElement } from '../../../interface/Element'
import { ICopyOption } from '../../../interface/Event'
import { ITr } from '../../../interface/table/Tr'
import { writeElementList } from '../../../utils/clipboard'
import { getTextFromElementList, zipElementList } from '../../../utils/element'
import { IOverrideResult } from '../../override/Override'
import { CanvasEvent } from '../CanvasEvent'

export async function copy(host: CanvasEvent, options?: ICopyOption) {
  const draw = host.getDraw()
  // 自定义粘贴事件
  const { copy } = draw.getOverride()
  if (copy) {
    const overrideResult = copy()
    // 默认阻止默认事件
    if ((<IOverrideResult>overrideResult)?.preventDefault !== false) return
  }
  const rangeManager = draw.getRange()
  // 光标闭合时复制整行
  let copyElementList: IElement[] | null = null
  const range = rangeManager.getRange()
  if (range.isCrossRowCol) {
    // 原始表格信息
    const tableElement = rangeManager.getRangeTableElement()
    if (!tableElement) return
    // 选区行列信息
    const rowCol = draw.getTableParticle().getRangeRowCol()
    if (!rowCol) return
    // 构造表格
    const copyTableElement: IElement = {
      type: ElementType.TABLE,
      value: '',
      colgroup: [],
      trList: []
    }
    const firstRow = rowCol[0]
    const colStartIndex = firstRow[0].colIndex!
    const lastCol = firstRow[firstRow.length - 1]
    const colEndIndex = lastCol.colIndex! + lastCol.colspan - 1
    for (let c = colStartIndex; c <= colEndIndex; c++) {
      copyTableElement.colgroup!.push(tableElement.colgroup![c])
    }
    for (let r = 0; r < rowCol.length; r++) {
      const row = rowCol[r]
      const tr = tableElement.trList![row[0].rowIndex!]
      const coptTr: ITr = {
        tdList: [],
        height: tr.height,
        minHeight: tr.minHeight
      }
      for (let c = 0; c < row.length; c++) {
        coptTr.tdList.push(row[c])
      }
      copyTableElement.trList!.push(coptTr)
    }
    copyElementList = zipElementList([copyTableElement])
  } else {
    copyElementList = rangeManager.getIsCollapsed()
      ? rangeManager.getRangeRowElementList()
      : rangeManager.getSelectionElementList()
  }
  // 粘贴单选/多选/数字等控件内容时，仅保留 VALUE 文本内容（含选项间分隔符），
  // 移除控件前缀/后缀（PREFIX/PRE_TEXT/POST_TEXT/POSTFIX），
  // 并剥离 VALUE 元素继承的全部文字样式
  if (copyElementList?.length) {
    copyElementList = copyElementList
      .filter(el => el.controlComponent === undefined ||
        el.controlComponent === ControlComponent.VALUE)
      .map(el => {
        if (el.controlComponent === ControlComponent.VALUE) {
          const plain: IElement = { ...el, type: ElementType.TEXT }
          delete plain.control
          delete plain.controlId
          delete plain.controlComponent
          delete plain.groupIds
          // 删除控件继承的样式（font/size/bold/highlight/italic/strikeout）
          // 及控件专有样式（underline/color）
          CONTROL_STYLE_ATTR.forEach(key => {
            delete (plain as IElement)[key]
          })
          delete plain.underline
          delete plain.color
          return plain
        }
        return el
      })
  }
  if (options?.isPlainText && copyElementList?.length) {
    copyElementList = [
      {
        value: getTextFromElementList(copyElementList)
      }
    ]
  }
  if (!copyElementList?.length) return
  await writeElementList(copyElementList, draw.getOptions())
}
