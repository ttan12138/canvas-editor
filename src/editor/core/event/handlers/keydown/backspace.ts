import { ZERO } from '../../../../dataset/constant/Common'
import { LocationPosition } from '../../../../dataset/enum/Common'
import { ControlComponent } from '../../../../dataset/enum/Control'
import { ControlRenderMode } from '../../../../dataset/enum/Editor'
import { getNonHideElementIndex, getElementIndexFromPositionListIndex, removeControlIfEmpty } from '../../../../utils/element'
import { CanvasEvent } from '../../CanvasEvent'

// 删除光标前隐藏元素
function backspaceHideElement(host: CanvasEvent) {
  const draw = host.getDraw()
  // 文本模式下不删除整个控件
  const controlRenderMode = draw.getControlRenderMode()
  if (controlRenderMode === ControlRenderMode.TEXT) {
    return
  }

  const rangeManager = draw.getRange()
  const range = rangeManager.getRange()
  // 光标所在位置为隐藏元素时触发循环删除
  const elementList = draw.getElementList()
  const element = elementList[range.startIndex]
  if (!element.hide && !element.control?.hide && !element.area?.hide) return
  // 向前删除所有隐藏元素
  let index = range.startIndex
  while (index > 0) {
    const element = elementList[index]
    let newIndex: number | null = null
    if (element.controlId) {
      newIndex = draw.getControl().removeControl(index)
      if (newIndex !== null) {
        index = newIndex
      }
    } else {
      draw.spliceElementList(elementList, index, 1)
      newIndex = index - 1
      index--
    }
    const newElement = elementList[newIndex!]
    if (
      !newElement ||
      (!newElement.hide && !newElement.control?.hide && !newElement.area?.hide)
    ) {
      // 更新上下文信息
      if (newIndex) {
        // 更新选区信息
        range.startIndex = newIndex
        range.endIndex = newIndex
        rangeManager.replaceRange(range)
        // 更新位置信息
        const position = draw.getPosition()
        const positionList = position.getPositionList()
        position.setCursorPosition(positionList[newIndex])
      }
      break
    }
  }
}

export function backspace(evt: KeyboardEvent, host: CanvasEvent) {
  const draw = host.getDraw()
  if (draw.isReadonly()) return
  // 可输入性验证
  const rangeManager = draw.getRange()
  if (!rangeManager.getIsCanInput()) return
  // 隐藏元素删除
  if (rangeManager.getIsCollapsed()) {
    backspaceHideElement(host)
  }
  // 删除操作
  const control = draw.getControl()
  const { startIndex, endIndex, isCrossRowCol } = rangeManager.getRange()
  let curIndex: number | null
  if (isCrossRowCol) {
    // 表格跨行列选中时清空单元格内容
    const rowCol = draw.getTableParticle().getRangeRowCol()
    if (!rowCol) return
    let isDeleted = false
    for (let r = 0; r < rowCol.length; r++) {
      const row = rowCol[r]
      for (let c = 0; c < row.length; c++) {
        const col = row[c]
        if (col.value.length > 1) {
          draw.spliceElementList(col.value, 1, col.value.length - 1)
          isDeleted = true
        }
      }
    }
    // 删除成功后定位
    curIndex = isDeleted ? 0 : null
  } else if (
    control.getActiveControl() &&
    control.getIsRangeCanCaptureEvent()
  ) {
    // 光标在控件内
    // 文本模式下，如果光标在控件的值边界，不调用控件的删除逻辑
    if (draw.getControlRenderMode() === ControlRenderMode.TEXT) {
      // 执行普通文本删除
      const cursorPosition = draw.getPosition().getCursorPosition()
      if (!cursorPosition) return
      const elementList = draw.getElementList()
      const positionList = draw.getPosition().getPositionList()
      // cursorPosition 是 positionList 中的引用，找到其在 positionList 中的索引
      const positionListIndex = positionList.indexOf(cursorPosition)
      if (positionListIndex === -1) return
      // 将 positionList 索引映射到 elementList 索引
      const elementIndex = getElementIndexFromPositionListIndex(
        elementList,
        positionListIndex,
        true
      )
      const element = elementList[elementIndex]

      // 检查是否需要跳过 PREFIX/POSTFIX/PLACEHOLDER
      if (
        element?.controlComponent === ControlComponent.PREFIX ||
        element?.controlComponent === ControlComponent.POSTFIX ||
        element?.controlComponent === ControlComponent.PLACEHOLDER
      ) {
        // 跳过这些元素，不删除
        return
      }

      // 删除当前元素
      const deletedControlId = element.controlId
      draw.spliceElementList(elementList, elementIndex, 1)

      // 检查删除后控件是否为空，若为空则移除整个控件（PREFIX/POSTFIX/PLACEHOLDER）
      if (deletedControlId) {
        const removedStart = removeControlIfEmpty(
          elementList,
          deletedControlId,
          (list, start, count) => draw.spliceElementList(list, start, count)
        )
        curIndex = removedStart !== null ? removedStart - 1 : elementIndex - 1
      } else {
        curIndex = elementIndex - 1
      }
    } else {
      // 控件模式下调用控件的删除逻辑
      curIndex = control.keydown(evt)
      if (curIndex) {
        control.emitControlContentChange()
      }
    }
  } else {
    // 普通元素删除
    const cursorPosition = draw.getPosition().getCursorPosition()
    if (!cursorPosition) return
    const isTextMode = draw.getControlRenderMode() === ControlRenderMode.TEXT
    const elementList = draw.getElementList()
    // 文本模式下 cursorPosition.index 不是 elementList 索引
    // positionList 跳过了 PREFIX/POSTFIX/PLACEHOLDER 元素
    const positionIndex = isTextMode
      ? getElementIndexFromPositionListIndex(
          elementList,
          draw.getPosition().getPositionList().indexOf(cursorPosition),
          true
        )
      : cursorPosition.index
    const isCollapsed = rangeManager.getIsCollapsed()
    // 判断是否允许删除
    if (isCollapsed && positionIndex === 0) {
      const firstElement = elementList[positionIndex]
      if (firstElement.value === ZERO) {
        // 取消首字符列表设置
        if (firstElement.listId) {
          draw.getListParticle().unsetList()
        }
        evt.preventDefault()
        return
      }
    }
    //  替换当前行对齐方式
    const startElement = elementList[startIndex]
    if (isCollapsed && startElement.rowFlex && startElement.value === ZERO) {
      const rowFlexElementList = rangeManager.getRangeRowElementList()
      if (rowFlexElementList) {
        const preElement = elementList[startIndex - 1]
        rowFlexElementList.forEach(element => {
          element.rowFlex = preElement?.rowFlex
        })
      }
    }
    // 如果在标题中删除内容，恢复titleId
    const preElement =
      startElement.value === ZERO ? elementList[startIndex - 1] : startElement
    const nextElement = elementList[endIndex + 1]
    if (
      preElement?.titleId &&
      nextElement?.titleId &&
      preElement.level === nextElement.level &&
      preElement.titleId !== nextElement.titleId
    ) {
      const preTitleId = preElement.titleId
      const nextTitleId = nextElement.titleId
      // 循环处理后面的元素修改为前面标题的titleId
      let nextIndex = endIndex + 1
      while (
        nextIndex < elementList.length &&
        elementList[nextIndex]?.titleId === nextTitleId
      ) {
        elementList[nextIndex].titleId = preTitleId
        nextIndex++
      }
    }
    if (!isCollapsed) {
      draw.spliceElementList(elementList, startIndex + 1, endIndex - startIndex)
      curIndex = startIndex
    } else {
      // 文本模式下，检查是否需要跳过 PREFIX/POSTFIX/PLACEHOLDER
      // positionIndex 已在 else 分支顶部通过映射计算为正确的 elementList 索引
      const element = elementList[positionIndex]
      if (
        isTextMode &&
        element.controlComponent === ControlComponent.PLACEHOLDER
      ) {
        // 跳过占位符，删除前一个元素
        if (positionIndex > 0) {
          draw.spliceElementList(elementList, positionIndex - 1, 1)
          curIndex = positionIndex - 2
        } else {
          curIndex = positionIndex - 1
        }
      } else {
        draw.spliceElementList(elementList, positionIndex, 1)
        curIndex = positionIndex - 1
      }
    }
  }
  draw.getGlobalEvent().setCanvasEventAbility()
  if (curIndex === null) {
    rangeManager.setRange(startIndex, startIndex)
    draw.render({
      curIndex: startIndex,
      isSubmitHistory: false
    })
  } else {
    // 文本模式下，curIndex 已经是 elementList 索引
    // 需要跳过 PREFIX/POSTFIX 元素，确保光标在有效文本位置
    const controlRenderMode = draw.getControlRenderMode()
    const isTextMode = controlRenderMode === ControlRenderMode.TEXT
    if (isTextMode) {
      const newElementList = draw.getElementList()
      curIndex = getNonHideElementIndex(
        newElementList,
        curIndex,
        LocationPosition.BEFORE,
        isTextMode
      )
    }
    rangeManager.setRange(curIndex, curIndex)
    draw.render({
      curIndex
    })
  }
}
