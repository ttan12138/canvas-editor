import { ControlComponent } from '../../../../dataset/enum/Control'
import { ControlRenderMode } from '../../../../dataset/enum/Editor'
import { LocationPosition } from '../../../../dataset/enum/Common'
import { getNonHideElementIndex, removeControlIfEmpty } from '../../../../utils/element'
import { CanvasEvent } from '../../CanvasEvent'

// 删除光标后隐藏元素
function deleteHideElement(host: CanvasEvent) {
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
  const nextElement = elementList[range.startIndex + 1]
  if (
    !nextElement.hide &&
    !nextElement.control?.hide &&
    !nextElement.area?.hide
  ) {
    return
  }
  // 向后删除所有隐藏元素
  const index = range.startIndex + 1
  while (index < elementList.length) {
    const element = elementList[index]
    let newIndex: number | null = null
    if (element.controlId) {
      newIndex = draw.getControl().removeControl(index)
    } else {
      draw.spliceElementList(elementList, index, 1)
      newIndex = index
    }
    const newElement = elementList[newIndex!]
    if (
      !newElement ||
      (!newElement.hide && !newElement.control?.hide && !newElement.area?.hide)
    ) {
      break
    }
  }
}

export function del(evt: KeyboardEvent, host: CanvasEvent) {
  const draw = host.getDraw()
  if (draw.isReadonly()) return
  // 可输入性验证
  const rangeManager = draw.getRange()
  if (!rangeManager.getIsCanInput()) {
    return
  }
  const { startIndex, endIndex, isCrossRowCol } = rangeManager.getRange()
  // 隐藏控件删除
  const elementList = draw.getElementList()
  const control = draw.getControl()
  if (rangeManager.getIsCollapsed()) {
    deleteHideElement(host)
  }
  // 列表边界合并：光标在列表末项、其后紧跟非同列表内容时，
  // 向前删除分隔符应把后续内容并入列表继续编号，而非仅删字符。
  if (rangeManager.getIsCollapsed()) {
    const position = draw.getPosition()
    const cursorPosition = position.getCursorPosition()
    const elementIndex = cursorPosition?.index
    if (
      elementIndex != null &&
      draw.getListParticle().isListMergeBoundary(elementList, elementIndex + 1)
    ) {
      const boundaryIndex = elementIndex + 1
      draw.getListParticle().mergeFollowingIntoList(boundaryIndex)
      rangeManager.setRange(boundaryIndex, boundaryIndex)
      draw.render({ curIndex: boundaryIndex })
      return
    }
  }
  // 删除操作
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
  } else if (control.getActiveControl() && control.getIsRangeWithinControl()) {
    // 光标在控件内
    // 文本模式下，如果光标在控件的值边界，不调用控件的删除逻辑
    if (draw.getControlRenderMode() === ControlRenderMode.TEXT) {
      // 执行普通文本删除
      const position = draw.getPosition()
      const cursorPosition = position.getCursorPosition()
      if (!cursorPosition) return
      const elementList = draw.getElementList()
      const elementIndex = cursorPosition.index
      const nextElement = elementList[elementIndex + 1]

      // 检查是否需要跳过 PREFIX/POSTFIX/PLACEHOLDER
      if (
        nextElement?.controlComponent === ControlComponent.PREFIX ||
        nextElement?.controlComponent === ControlComponent.POSTFIX ||
        nextElement?.controlComponent === ControlComponent.PLACEHOLDER
      ) {
        // 跳过这些元素，不删除
        return
      }

      // 删除下一个元素
      if (!elementList[elementIndex + 1]) return
      const deletedControlId = nextElement?.controlId
      draw.spliceElementList(elementList, elementIndex + 1, 1)

      // 检查删除后控件是否为空，若为空则移除整个控件（PREFIX/POSTFIX/PLACEHOLDER）
      if (deletedControlId) {
        const removedStart = removeControlIfEmpty(
          elementList,
          deletedControlId,
          (list, start, count) => draw.spliceElementList(list, start, count)
        )
        curIndex = removedStart !== null ? removedStart - 1 : elementIndex
      } else {
        curIndex = elementIndex
      }
    } else {
      // 控件模式下调用控件的删除逻辑
      curIndex = control.keydown(evt)
      if (curIndex) {
        control.emitControlContentChange()
      }
    }
  } else if (elementList[endIndex + 1]?.controlId) {
    // 光标在控件前
    const controlRenderMode = draw.getControlRenderMode()
    if (controlRenderMode === ControlRenderMode.TEXT) {
      // 文本模式下只删除一个字符，不删除整个控件
      const position = draw.getPosition()
      const cursorPosition = position.getCursorPosition()
      if (!cursorPosition) return
      const elementIndex = cursorPosition.index
      const isCollapsed = rangeManager.getIsCollapsed()

      if (!isCollapsed) {
        draw.spliceElementList(elementList, elementIndex + 1, endIndex - startIndex)
        curIndex = elementIndex
      } else {
        if (!elementList[elementIndex + 1]) return
        const deletedElement = elementList[elementIndex + 1]
        // 不删除控件结构元素
        if (
          deletedElement?.controlComponent === ControlComponent.PREFIX ||
          deletedElement?.controlComponent === ControlComponent.POSTFIX ||
          deletedElement?.controlComponent === ControlComponent.PLACEHOLDER
        ) {
          return
        }
        const deletedControlId = deletedElement?.controlId
        draw.spliceElementList(elementList, elementIndex + 1, 1)
        // 检查删除后控件是否为空，若为空则移除整个控件
        if (deletedControlId) {
          const removedStart = removeControlIfEmpty(
            elementList,
            deletedControlId,
            (list, start, count) => draw.spliceElementList(list, start, count)
          )
          curIndex = removedStart !== null ? removedStart - 1 : elementIndex
        } else {
          curIndex = elementIndex
        }
      }
    } else {
      // 控件模式下删除整个控件
      curIndex = control.removeControl(endIndex + 1)
    }
  } else {
      // 普通元素
      const position = draw.getPosition()
      const cursorPosition = position.getCursorPosition()
      if (!cursorPosition) return
      const elementIndex = cursorPosition.index
      // 命中图片直接删除
      const positionContext = position.getPositionContext()
      if (positionContext.isDirectHit && positionContext.isImage) {
        draw.spliceElementList(elementList, elementIndex, 1)
        curIndex = elementIndex - 1
      } else {
        const isCollapsed = rangeManager.getIsCollapsed()

        if (!isCollapsed) {
          // 选中状态下使用选区起点 startIndex 定位，而非光标位置
          // （光标可能在选区末尾 endIndex，用其会导致删除选区之后的内容）
          draw.spliceElementList(
            elementList,
            startIndex + 1,
            endIndex - startIndex
          )
          curIndex = startIndex
        } else {
          if (!elementList[elementIndex + 1]) return
          draw.spliceElementList(elementList, elementIndex + 1, 1)
          curIndex = elementIndex
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
    // 文本模式下调整光标位置，跳过 PREFIX/POSTFIX 元素
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
