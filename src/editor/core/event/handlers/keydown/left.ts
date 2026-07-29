import { ZERO } from '../../../../dataset/constant/Common'
import { LocationPosition } from '../../../../dataset/enum/Common'
import { ControlComponent } from '../../../../dataset/enum/Control'
import { ControlRenderMode, EditorMode } from '../../../../dataset/enum/Editor'
import { ElementType } from '../../../../dataset/enum/Element'
import { MoveDirection } from '../../../../dataset/enum/Observer'
import {
  getIsBlockElement,
  getNonHideElementIndex
} from '../../../../utils/element'
import { isApple } from '../../../../utils/ua'
import { CanvasEvent } from '../../CanvasEvent'

export function left(evt: KeyboardEvent, host: CanvasEvent) {
  const draw = host.getDraw()
  const isReadonly = draw.isReadonly()
  if (isReadonly) return
  const position = draw.getPosition()
  const cursorPosition = position.getCursorPosition()
  if (!cursorPosition) return
  const positionContext = position.getPositionContext()
  const { index } = cursorPosition
  if (index <= 0 && !positionContext.isTable) return
  const rangeManager = draw.getRange()
  const { startIndex, endIndex } = rangeManager.getRange()
  const isCollapsed = rangeManager.getIsCollapsed()
  const elementList = draw.getElementList()
  // 表单模式下控件移动
  const control = draw.getControl()
  if (
    draw.getMode() === EditorMode.FORM &&
    control.getActiveControl() &&
    (elementList[index]?.controlComponent === ControlComponent.PREFIX ||
      elementList[index]?.controlComponent === ControlComponent.PRE_TEXT)
  ) {
    control.initNextControl({
      direction: MoveDirection.UP
    })
    return
  }
  // 单词整体移动
  let moveCount = 1
  const controlRenderMode = draw.getControlRenderMode()
  if (isApple ? evt.altKey : evt.ctrlKey) {
    const LETTER_REG = draw.getLetterReg()
    // 起始位置
    const moveStartIndex =
      evt.shiftKey && !isCollapsed && startIndex === cursorPosition?.index
        ? endIndex
        : startIndex
    if (LETTER_REG.test(elementList[moveStartIndex]?.value)) {
      let i = moveStartIndex - 1
      while (i > 0) {
        const element = elementList[i]
        // 文本模式下跳过 PREFIX/POSTFIX 元素
        if (
          controlRenderMode === ControlRenderMode.TEXT &&
          (element.controlComponent === ControlComponent.PREFIX ||
            element.controlComponent === ControlComponent.POSTFIX)
        ) {
          i--
          continue
        }
        if (!LETTER_REG.test(element.value)) {
          break
        }
        moveCount++
        i--
      }
    }
  }
  const curIndex = startIndex - moveCount
  // 调试日志：记录光标移动计算过程
  console.log('[Left Arrow Debug]', {
    startIndex,
    endIndex,
    moveCount,
    curIndex,
    isCollapsed,
    controlRenderMode: draw.getControlRenderMode(),
    'current element': elementList[startIndex]?.value,
    'current controlComponent': elementList[startIndex]?.controlComponent
  })
  // shift则缩放选区
  let anchorStartIndex = curIndex
  let anchorEndIndex = curIndex
  if (evt.shiftKey && cursorPosition) {
    if (startIndex !== endIndex) {
      if (startIndex === cursorPosition.index) {
        // 减小选区
        anchorStartIndex = startIndex
        anchorEndIndex = endIndex - moveCount
      } else {
        anchorStartIndex = curIndex
        anchorEndIndex = endIndex
      }
    } else {
      anchorEndIndex = endIndex
    }
  }
  // 表格单元格间跳转
  if (!evt.shiftKey) {
    const element = elementList[startIndex]
    // 之前是表格则进入最后一个单元格最后一个元素
    if (element.type === ElementType.TABLE) {
      const trList = element.trList!
      const lastTrIndex = trList.length - 1
      const lastTr = trList[lastTrIndex]
      const lastTdIndex = lastTr.tdList.length - 1
      const lastTd = lastTr.tdList[lastTdIndex]
      position.setPositionContext({
        isTable: true,
        index: startIndex,
        trIndex: lastTrIndex,
        tdIndex: lastTdIndex,
        tdId: lastTd.id,
        trId: lastTr.id,
        tableId: element.id
      })
      anchorStartIndex = lastTd.value.length - 1
      anchorEndIndex = anchorStartIndex
      draw.getTableTool().render()
    } else if (element.tableId) {
      // 在表格单元格内&在首位则往前移动单元格
      if (startIndex === 0) {
        const originalElementList = draw.getOriginalElementList()
        const trList = originalElementList[positionContext.index!].trList!
        outer: for (let r = 0; r < trList.length; r++) {
          const tr = trList[r]
          if (tr.id !== element.trId) continue
          const tdList = tr.tdList
          for (let d = 0; d < tdList.length; d++) {
            const td = tdList[d]
            if (td.id !== element.tdId) continue
            // 移动到表格前
            if (r === 0 && d === 0) {
              position.setPositionContext({
                isTable: false
              })
              anchorStartIndex = positionContext.index! - 1
              anchorEndIndex = anchorStartIndex
              draw.getTableTool().dispose()
            } else {
              // 上一个单元格
              let preTrIndex = r
              let preTdIndex = d - 1
              if (preTdIndex < 0) {
                preTrIndex = r - 1
                preTdIndex = trList[preTrIndex].tdList.length - 1
              }
              const preTr = trList[preTrIndex]
              const preTd = preTr.tdList[preTdIndex]
              position.setPositionContext({
                isTable: true,
                index: positionContext.index,
                trIndex: preTrIndex,
                tdIndex: preTdIndex,
                tdId: preTd.id,
                trId: preTr.id,
                tableId: element.tableId
              })
              anchorStartIndex = preTd.value.length - 1
              anchorEndIndex = anchorStartIndex
              draw.getTableTool().render()
            }
            break outer
          }
        }
      }
    }
  }
  // 执行跳转
  if (!~anchorStartIndex || !~anchorEndIndex) return
  // 隐藏元素跳过
  const newElementList = draw.getElementList()
  const isTextMode = draw.getControlRenderMode() === ControlRenderMode.TEXT

  console.log('[Left Arrow Before getNonHideElementIndex]', {
    anchorStartIndex,
    anchorEndIndex,
    isTextMode,
    'anchorStartIndex element': newElementList[anchorStartIndex]?.value,
    'anchorStartIndex controlComponent': newElementList[anchorStartIndex]?.controlComponent
  })

  anchorStartIndex = getNonHideElementIndex(
    newElementList,
    anchorStartIndex,
    LocationPosition.BEFORE,
    isTextMode
  )
  anchorEndIndex = getNonHideElementIndex(
    newElementList,
    anchorEndIndex,
    LocationPosition.BEFORE,
    isTextMode
  )

  console.log('[Left Arrow After getNonHideElementIndex]', {
    finalAnchorStartIndex: anchorStartIndex,
    finalAnchorEndIndex: anchorEndIndex,
    'final element': newElementList[anchorStartIndex]?.value,
    'final controlComponent': newElementList[anchorStartIndex]?.controlComponent
  })

  // 设置上下文
  rangeManager.setRange(anchorStartIndex, anchorEndIndex)
  const isAnchorCollapsed = anchorStartIndex === anchorEndIndex
  draw.render({
    curIndex: isAnchorCollapsed ? anchorStartIndex : undefined,
    isSetCursor: isAnchorCollapsed,
    isSubmitHistory: false,
    isCompute: false
  })
  // 优化行首光标位置定位（自然换行元素定位到下一行的行首）
  if (isAnchorCollapsed) {
    const positionList = position.getPositionList()
    const anchorPosition = positionList[anchorStartIndex]
    if (
      anchorPosition?.isLastLetter &&
      anchorPosition.value !== ZERO &&
      anchorStartIndex + 1 < positionList.length
    ) {
      const nextPosition = positionList[anchorStartIndex + 1]
      const element = newElementList[anchorStartIndex]
      const nextElement = newElementList[anchorStartIndex + 1]
      if (
        nextPosition.value !== ZERO &&
        !getIsBlockElement(nextElement) &&
        element.listId === nextElement.listId
      ) {
        draw.getCursor().drawCursor({
          hitLineStartIndex: anchorStartIndex + 1
        })
      }
    }
  }
  evt.preventDefault()
}
