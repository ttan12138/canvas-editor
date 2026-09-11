import { ZERO } from '../../../dataset/constant/Common'
import {
  EDITOR_ELEMENT_COPY_ATTR,
  EDITOR_ELEMENT_STYLE_ATTR
} from '../../../dataset/constant/Element'
import { ElementType } from '../../../dataset/enum/Element'
import { IElement } from '../../../interface/Element'
import { IRangeElementStyle } from '../../../interface/Range'
import { splitText } from '../../../utils'
import { formatElementContext } from '../../../utils/element'
import { CanvasEvent } from '../CanvasEvent'

export function input(data: string, host: CanvasEvent) {
  const draw = host.getDraw()
  if (draw.isReadonly() || draw.isDisabled()) {
    return
  }
  const position = draw.getPosition()
  let cursorPosition = position.getCursorPosition()
  if (!data) return
  // 前缀预输入：手动键入触发字符时，正常写入字符后打开下拉
  const prefixAutocomplete = draw.getPrefixAutocomplete()
  if (
    !host.isComposing &&
    data.length === 1 &&
    prefixAutocomplete.hasPrefix(data)
  ) {
    // 先走正常输入写入触发字符，再打开下拉
    prefixAutocomplete.markManualTrigger(data)
  } else if (prefixAutocomplete.getIsOpen()) {
    // 下拉打开时键入普通字符：关闭下拉，字符照常写入
    prefixAutocomplete.handleInputFallback()
  }
  // cursorPosition 为空时尝试从选区恢复（异步粘贴回调场景）
  if (!cursorPosition) {
    const cursor = draw.getCursor()
    cursor.focus()
    const rangeManager = draw.getRange()
    const { startIndex, endIndex } = rangeManager.getRange()
    if (~startIndex && ~endIndex) {
      const positionList = position.getPositionList()
      const cursorIndex = rangeManager.getIsCollapsed() ? startIndex : endIndex
      if (positionList[cursorIndex]) {
        position.setCursorPosition(positionList[cursorIndex])
        cursorPosition = position.getCursorPosition()
      }
    }
  }
  if (!cursorPosition) {
    return
  }
  const isComposing = host.isComposing
  // 正在合成文本进行非输入操作
  if (isComposing && host.compositionInfo?.value === data) return
  const rangeManager = draw.getRange()
  const canInput = rangeManager.getIsCanInput()
  if (!canInput) {
    return
  }
  // 移除合成前，缓存设置的默认样式设置
  const defaultStyle =
    rangeManager.getDefaultStyle() || host.compositionInfo?.defaultStyle || null
  // 移除合成输入
  removeComposingInput(host)
  if (!isComposing) {
    const cursor = draw.getCursor()
    cursor.clearAgentDomValue()
  }
  const { TEXT, HYPERLINK, SUBSCRIPT, SUPERSCRIPT, DATE, TAB } = ElementType
  const text = data.replaceAll(`\n`, ZERO)
  const { startIndex, endIndex } = rangeManager.getRange()
  // 格式化元素
  const inputElementList = draw.getElementList()
  const copyElement = rangeManager.getRangeAnchorStyle(inputElementList, endIndex)
  if (!copyElement) return
  const isDesignMode = draw.isDesignMode()
  const inputData: IElement[] = splitText(text).map(value => {
    const newElement: IElement = {
      value
    }
    if (
      isDesignMode ||
      (!copyElement.title?.disabled && !copyElement.control?.disabled)
    ) {
      const nextElement = inputElementList[endIndex + 1]
      // 文本、超链接、日期、上下标：复制所有信息（元素类型、样式、特殊属性）
      if (
        !copyElement.type ||
        copyElement.type === TEXT ||
        (copyElement.type === HYPERLINK && nextElement?.type === HYPERLINK) ||
        (copyElement.type === DATE && nextElement?.type === DATE) ||
        (copyElement.type === SUBSCRIPT && nextElement?.type === SUBSCRIPT) ||
        (copyElement.type === SUPERSCRIPT && nextElement?.type === SUPERSCRIPT)
      ) {
        EDITOR_ELEMENT_COPY_ATTR.forEach(attr => {
          // 分组信息仅在「同组内连续」时向下传递：
          // 仅当下一个元素与当前元素同属某一分组（groupIds 有交集）才复制，
          // 否则（下一个元素是不同分组或普通元素）跳过，避免把分组标识延伸到
          // 分组之外，导致新输入的字符被并入分组、破坏「实际值从头部包含即把尾部
          // 拆分出去作为单独元素」的预期结构。
          if (attr === 'groupIds') {
            const copyGroupIds = copyElement.groupIds
            const nextGroupIds = nextElement?.groupIds
            const isSameGroup =
              !!copyGroupIds?.length &&
              !!nextGroupIds?.length &&
              nextGroupIds.some(g => copyGroupIds.includes(g))
            if (!isSameGroup) {
              return
            }
          }
          const value = copyElement[attr] as never
          if (value !== undefined) {
            newElement[attr] = value
          }
        })
      }
      // 仅复制样式：存在默认样式设置 || 无法匹配文本类元素时（TAB）
      if (defaultStyle || copyElement.type === TAB) {
        EDITOR_ELEMENT_STYLE_ATTR.forEach(attr => {
          const value =
            defaultStyle?.[attr as keyof IRangeElementStyle] ||
            copyElement[attr]
          if (value !== undefined) {
            newElement[attr] = value as never
          }
        })
      }
    }
    return newElement
  })
  // 控件-移除placeholder
  const control = draw.getControl()
  let curIndex: number
  if (control.getActiveControl() && control.getIsRangeWithinControl()) {
    curIndex = control.setValue(inputData)
    if (!isComposing) {
      control.emitControlContentChange()
    }
  } else {
    const start = startIndex + 1
    if (startIndex !== endIndex) {
      draw.spliceElementList(inputElementList, start, endIndex - startIndex)
    }
    formatElementContext(inputElementList, inputData, startIndex, {
      editorOptions: draw.getOptions()
    })
    draw.spliceElementList(inputElementList, start, 0, inputData)
    curIndex = startIndex + inputData.length
  }
  if (~curIndex) {
    rangeManager.setRange(curIndex, curIndex)
    draw.render({
      curIndex,
      isSubmitHistory: !isComposing
    })
    // 确保异步粘贴回调后光标可见
    requestAnimationFrame(() => {
      const position = draw.getPosition()
      if (!position.getCursorPosition()) {
        const positionList = position.getPositionList()
        if (positionList[curIndex]) {
          position.setCursorPosition(positionList[curIndex])
        }
      }
      draw.getCursor().drawCursor()
    })
  }
  if (isComposing && ~curIndex) {
    host.compositionInfo = {
      elementList: inputElementList,
      value: text,
      startIndex: curIndex - inputData.length,
      endIndex: curIndex,
      defaultStyle
    }
  }
  // 前缀预输入：字符写入完成后打开下拉
  const triggerPrefix = prefixAutocomplete.consumeManualTrigger()
  if (triggerPrefix) {
    prefixAutocomplete.open(triggerPrefix)
  }
}

export function removeComposingInput(host: CanvasEvent) {
  if (!host.compositionInfo) return
  const { elementList, startIndex, endIndex } = host.compositionInfo
  elementList.splice(startIndex + 1, endIndex - startIndex)
  const rangeManager = host.getDraw().getRange()
  rangeManager.setRange(startIndex, startIndex)
  host.compositionInfo = null
}
