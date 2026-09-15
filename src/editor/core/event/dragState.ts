import type { Draw } from '../draw/Draw'
import type { IElement } from '../../interface/Element'
import { ElementType } from '../../dataset/enum/Element'
import { ControlType } from '../../dataset/enum/Control'
import { ZERO } from '../../dataset/constant/Common'

// 记录当前拖拽操作的源编辑器实例，用于判断“跨编辑器拖拽”。
// 每次 dragstart 会重置，仅在存在一次进行中的拖拽时有效。
let dragSourceDraw: Draw | null = null

export function setDragSourceDraw(draw: Draw): void {
  dragSourceDraw = draw
}

export function isCrossEditorDrag(draw: Draw): boolean {
  return dragSourceDraw !== null && dragSourceDraw !== draw
}

export function getDragSourceDraw(): Draw | null {
  return dragSourceDraw
}

export function clearDragSourceDraw(): void {
  dragSourceDraw = null
}

// ====== 跨编辑器拖拽的列表处理策略 ======
// 多编辑器实例间拖拽内容时，源编辑器的列表结构（listId/listType/listStyle）
// 不应直接带入目标编辑器，统一按下述策略处理：
// 1. 拍平：拖入元素携带列表结构时，剥离列表属性，仅保留文字与换行标记
//    （列表项标记 ZERO 失去 listId 后会渲染为普通段落换行）；
// 2. 继承：目标落点位于列表项中（插入点前一元素带 listId）时，拍平后的
//    文本类元素继承落点列表属性，使拖入内容并入目标编辑器的列表；
// 3. 同编辑器内拖拽不经过本策略，保留原有行为（样式随内容移动）。

// 判断元素是否携带列表结构。扁平 elementList 中列表项为带 listId/listType 的
// 普通元素；兼容渲染期聚合产生的 LIST 父元素（type === LIST，文字在 valueList 中）。
export function isListElement(el: IElement): boolean {
  return (
    el.type === ElementType.LIST ||
    el.listType !== undefined ||
    el.listId !== undefined
  )
}

// 获取落点处的列表锚点：插入点前一元素携带 listId 时，认为落点在列表内。
// 落点在列表开始之前（前一元素为普通文本/空行）时不继承，与列表外落点一致。
export function getListAnchorAtInsertIndex(
  elementList: IElement[],
  insertIndex: number
): IElement | null {
  const prevElement = elementList[insertIndex - 1]
  return prevElement && prevElement.listId ? prevElement : null
}

// 拍平单个列表元素：剥离列表属性，保留文字与换行标记
function flattenListElement(el: IElement): IElement {
  const flatElement: IElement = { ...el }
  if (el.type === ElementType.LIST) {
    // LIST 父元素：valueList 内文字拼接为普通文本（项标记 ZERO 转为换行符）
    const text = (el.valueList || [])
      .map(item => (item.value === ZERO ? '\n' : item.value || ''))
      .join('')
    flatElement.type = ElementType.TEXT
    flatElement.value = text.endsWith('\n') ? text : text + '\n'
    delete flatElement.valueList
  }
  delete flatElement.listId
  delete flatElement.listType
  delete flatElement.listStyle
  delete flatElement.listWrap
  return flatElement
}

// 跨编辑器拖拽的统一列表策略入口，返回处理后的元素数组
export function applyCrossEditorListPolicy(
  dragElementList: IElement[],
  targetElementList: IElement[],
  insertIndex: number
): IElement[] {
  const hasListElement = dragElementList.some(isListElement)
  const listAnchor = getListAnchorAtInsertIndex(targetElementList, insertIndex)
  console.log('[DEBUG drag] applyCrossEditorListPolicy 入参 insertIndex=', insertIndex,
    'hasListElement=', hasListElement, 'listAnchor=', !!listAnchor,
    '拖入元素列表=', dragElementList.map(e => ({
      type: e.type, value: e.value, control: e.control?.type, listId: e.listId, listType: e.listType
    })))
  // 既无列表结构需要拍平，落点也无需继承列表时，保持原样
  if (!hasListElement && !listAnchor) {
    return dragElementList
  }
  const result = dragElementList.map(element => {
    let newElement = element
    if (isListElement(element)) {
      newElement = flattenListElement(element)
    }
    if (listAnchor && newElement.type !== ElementType.LIST) {
      newElement = {
        ...newElement,
        listId: listAnchor.listId,
        listType: listAnchor.listType,
        listStyle: listAnchor.listStyle
      }
    }
    return newElement
  })
  console.log('[DEBUG drag] applyCrossEditorListPolicy 结果=', result.map(e => ({
    type: e.type, value: e.value, control: e.control?.type, listId: e.listId, listType: e.listType
  })))
  return result
}

// 获取元素的实际取值，与 Draw._getElementActualValue 保持一致：
// - 列表元素：取 valueList 最后一个元素的 value
// - 单选/多选/下拉等选择类控件：优先 structValues，其次依据 code 映射
//   valueSets，再兜底 control.value
// - 其余元素：直接取 value
// 用于判断插入点前后是否存在“段落换行”。
export function getElementActualValue(element?: IElement): string {
  if (!element) return ''
  if (element.type === ElementType.LIST) {
    const valueList = element.valueList
    if (Array.isArray(valueList) && valueList.length) {
      const last = valueList[valueList.length - 1]
      return last?.value ?? ''
    }
    return element.value
  }
  const control = element.control
  if (
    control &&
    (control.type === ControlType.RADIO ||
      control.type === ControlType.CHECKBOX ||
      control.type === ControlType.SELECT ||
      control.type === ControlType.CUSTOM_SELECT ||
      control.type === ControlType.MULTI_CUSTOM_SELECT)
  ) {
    if (Array.isArray(control.structValues) && control.structValues.length) {
      return control.structValues.map(structValue => structValue.value).join('')
    }
    const code = control.code
    if (code) {
      const delimiter = control.multiSelectDelimiter || ','
      const valueSets = control.valueSets || []
      return code
        .split(delimiter)
        .map(
          c => valueSets.find(valueSet => valueSet.code === c?.trim())?.value
        )
        .filter((value): value is string => !!value)
        .join(delimiter)
    }
    if (typeof control.value === 'string' && control.value) {
      return control.value
    }
  }
  return element.value
}

// 插入点换行去重：落点前一个元素以段落换行结尾（空值 / ZERO / 含 \n）时，
// 忽略拖入内容开头的段落换行，避免产生多余空行。
// 与 appendElementList 对追加内容开头换行的处理逻辑保持一致。
export function stripRedundantLeadingBreak(
  elementList: IElement[],
  prevElement?: IElement
): void {
  const firstElement = elementList[0]
  if (!firstElement) return
  const prevValue = getElementActualValue(prevElement)
  const prevEndsWithBreak =
    prevValue === '' || prevValue === ZERO || prevValue.includes('\n')
  if (!prevEndsWithBreak) return
  // 带列表标记的元素（列表项开始标记）不属于段落换行，不参与去重
  if (firstElement.listId) return
  const firstValue = firstElement.value || ''
  // 首元素整体为段落标记 / 空值：直接移除
  if (firstValue === ZERO || firstValue === '') {
    elementList.shift()
    return
  }
  // 首元素以 \n 开头：剥离开头连续换行符
  if (firstValue.includes('\n')) {
    const stripped = firstValue.replace(/^\n+/, '')
    if (stripped) {
      firstElement.value = stripped
    } else {
      elementList.shift()
    }
  }
}
