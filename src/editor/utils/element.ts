import {
  cloneProperty,
  deepClone,
  deepCloneOmitKeys,
  deleteProperty,
  getUUID,
  isArrayEqual,
  omitObject,
  pickObject,
  splitText
} from '.'
import { IFrameBlock } from '../core/draw/particle/block/modules/IFrameBlock'
import { LaTexParticle } from '../core/draw/particle/latex/LaTexParticle'
import { NON_BREAKING_SPACE, ZERO } from '../dataset/constant/Common'
import {
  AREA_CONTEXT_ATTR,
  BLOCK_ELEMENT_TYPE,
  CONTROL_STYLE_ATTR,
  EDITOR_ELEMENT_CONTEXT_ATTR,
  EDITOR_ELEMENT_ZIP_ATTR,
  EDITOR_ROW_ATTR,
  INLINE_NODE_NAME,
  TABLE_CONTEXT_ATTR,
  TABLE_TD_ZIP_ATTR,
  TEXTLIKE_ELEMENT_TYPE,
  TITLE_CONTEXT_ATTR
} from '../dataset/constant/Element'
import {
  listStyleCSSMapping,
  listTypeElementMapping,
  ulStyleMapping
} from '../dataset/constant/List'
import { START_LINE_BREAK_REG } from '../dataset/constant/Regular'
import {
  titleNodeNameMapping,
  titleOrderNumberMapping,
  titleSizeMapping
} from '../dataset/constant/Title'
import { BlockType } from '../dataset/enum/Block'
import { ImageDisplay, LocationPosition } from '../dataset/enum/Common'
import { ControlComponent, ControlType } from '../dataset/enum/Control'
import { EditorMode } from '../dataset/enum/Editor'
import { ElementType } from '../dataset/enum/Element'
import { ListStyle, ListType, UlStyle } from '../dataset/enum/List'
import { RowFlex } from '../dataset/enum/Row'
import { TableBorder, TdBorder } from '../dataset/enum/table/Table'
import { VerticalAlign } from '../dataset/enum/VerticalAlign'
import { DeepRequired } from '../interface/Common'
import { IControlSelect, IControlSelectValue, IValueSet } from '../interface/Control'
import { IEditorOption } from '../interface/Editor'
import { IElement } from '../interface/Element'
import { IRowElement } from '../interface/Row'
import { ITd } from '../interface/table/Td'
import { ITr } from '../interface/table/Tr'
import { mergeOption } from './option'

// 多选分隔符候选列表（按优先级排序）
const MULTI_SELECT_DELIMITER_CANDIDATES = [
  ',',
  '，',
  ';',
  '；',
  '|',
  '、',
  '/',
  '\\',
  '\n',
  '\t',
  ' '
]

/**
 * 从 code 取值中推断多选分隔符
 * 当 multiSelectDelimiter 未显式设置时，通过尝试常见分隔符，
 * 找到能让所有拆分部分都匹配 valueSets 中 code 的分隔符
 */
export function inferMultiSelectDelimiter(
  code: string | null | undefined,
  valueSets: IValueSet[] | undefined,
  explicitDelimiter?: string
): string {
  // 1. 优先使用显式指定的分隔符
  if (explicitDelimiter) return explicitDelimiter
  // 2. 没有 code 或 valueSets 时使用默认逗号
  if (!code || !valueSets?.length) return ','
  // 3. 尝试常见分隔符，找到能让所有拆分部分都匹配 valueSets 的分隔符
  const codeSet = new Set(valueSets.map(v => v.code))
  for (const delimiter of MULTI_SELECT_DELIMITER_CANDIDATES) {
    // code 中不包含该分隔符则跳过
    if (!code.includes(delimiter)) continue
    const parts = code.split(delimiter).map(p => p.trim())
    // 所有部分都必须匹配 valueSets 中的 code，且至少有两个部分
    if (parts.length > 1 && parts.every(p => codeSet.has(p))) {
      return delimiter
    }
  }
  // 4. 未找到匹配的分隔符，使用默认逗号
  return ','
}

export function unzipElementList(elementList: IElement[]): IElement[] {
  const result: IElement[] = []
  for (let v = 0; v < elementList.length; v++) {
    const valueItem = elementList[v]
    const textList = splitText(valueItem.value)
    for (let d = 0; d < textList.length; d++) {
      result.push({ ...valueItem, value: textList[d] })
    }
  }
  return result
}

interface IFormatElementListOption {
  isHandleFirstElement?: boolean // 根据上下文确定首字符处理逻辑（处理首字符补偿）
  isForceCompensation?: boolean // 强制补偿字符
  editorOptions: DeepRequired<IEditorOption>
}

export function formatElementList(
  elementList: IElement[],
  options: IFormatElementListOption
) {
  const {
    isHandleFirstElement = true,
    isForceCompensation = false,
    editorOptions
  } = options
  // 规范化换行符：文本元素 value 中内嵌的换行符需拆分为独立的段落元素（value === '\n'），
  // 否则会被当作单个整体元素绘制成一行（多行文本被压成一行；setValue 后撤销/重做恢复同一份数据也会同样表现为一行）。
  const __normalized: IElement[] = []
  for (const __el of elementList) {
    const __isPlainText = !__el.type || __el.type === ElementType.TEXT
    if (
      __isPlainText &&
      typeof __el.value === 'string' &&
      __el.value.includes('\n')
    ) {
      const __parts = __el.value.split('\n')
      __parts.forEach((__part, __idx) => {
        if (__part.length) {
          __normalized.push({ ...__el, value: __part })
        }
        if (__idx !== __parts.length - 1) {
          __normalized.push({ value: '\n' })
        }
      })
    } else {
      __normalized.push(__el)
    }
  }
  elementList.length = 0
  elementList.push(...__normalized)
  const startElement = elementList[0]
  // 非首字符零宽节点文本元素则补偿-列表元素内部会补偿此处忽略
  if (
    startElement?.type !== ElementType.LIST &&
    (isForceCompensation ||
      (isHandleFirstElement &&
        ((startElement?.type && startElement.type !== ElementType.TEXT) ||
          !START_LINE_BREAK_REG.test(startElement?.value))))
  ) {
    elementList.unshift({
      value: ZERO
    })
  }
  let i = 0
  while (i < elementList.length) {
    let el = elementList[i]
    // 优先处理虚拟元素
    if (el.type === ElementType.TITLE) {
      // 移除父节点
      elementList.splice(i, 1)
      // 格式化元素
      const valueList = el.valueList || []
      formatElementList(valueList, {
        ...options,
        isHandleFirstElement: false,
        isForceCompensation: false
      })
      // 追加节点
      if (valueList.length) {
        const titleId = el.titleId || getUUID()
        const titleOptions = editorOptions.title
        for (let v = 0; v < valueList.length; v++) {
          const value = valueList[v]
          value.title = el.title
          if (el.level) {
            value.titleId = titleId
            value.level = el.level
          }
          // 文本型元素设置字体及加粗
          if (isTextLikeElement(value)) {
            if (!value.size) {
              value.size = titleOptions[titleSizeMapping[value.level!]]
            }
            if (value.bold === undefined) {
              value.bold = true
            }
          }
          elementList.splice(i, 0, value)
          i++
        }
      }
      i--
    } else if (el.type === ElementType.LIST) {
      // 移除父节点
      elementList.splice(i, 1)
      // 格式化元素
      const valueList = el.valueList || []
      formatElementList(valueList, {
        ...options,
        isHandleFirstElement: true,
        isForceCompensation: false
      })
      // 追加节点
      if (valueList.length) {
        const listId = el.listId || getUUID()
        for (let v = 0; v < valueList.length; v++) {
          const value = valueList[v]
          value.listId = listId
          value.listType = el.listType
          value.listStyle = el.listStyle
          elementList.splice(i, 0, value)
          i++
        }
        // 尾部如果不是换行符则补充一个换行符
        if (
          elementList[i] &&
          (elementList[i].valueList?.length
            ? !START_LINE_BREAK_REG.test(elementList[i].valueList![0].value)
            : !START_LINE_BREAK_REG.test(elementList[i].value))
        ) {
          elementList.splice(i, 0, {
            value: ZERO
          })
          i++
        }
      }
      i--
    } else if (el.type === ElementType.AREA) {
      // 移除父节点
      elementList.splice(i, 1)
      // 格式化元素
      const valueList = el?.valueList || []
      formatElementList(valueList, {
        ...options,
        isHandleFirstElement: true,
        isForceCompensation: true
      })
      if (valueList.length) {
        const areaId = getUUID()
        for (let v = 0; v < valueList.length; v++) {
          const value = valueList[v]
          value.areaId = el.areaId || areaId
          value.area = el.area
          value.areaIndex = v
          if (value.type === ElementType.TABLE) {
            const trList = value.trList!
            for (let r = 0; r < trList.length; r++) {
              const tr = trList[r]
              for (let d = 0; d < tr.tdList.length; d++) {
                const td = tr.tdList[d]
                const tdValueList = td.value
                for (let t = 0; t < tdValueList.length; t++) {
                  const tdValue = tdValueList[t]
                  tdValue.areaId = el.areaId || areaId
                  tdValue.area = el.area
                }
              }
            }
          }
          elementList.splice(i, 0, value)
          i++
        }
      }
      i--
    } else if (el.type === ElementType.TABLE) {
      const tableId = el.id || getUUID()
      el.id = tableId
      if (el.trList) {
        const {
          table: { defaultTrMinHeight, defaultColMinWidth },
          margins
        } = editorOptions
        // 当colgroup未传入时，默认使用编辑器宽度平分
        if (!el.colgroup?.length && el.trList.length) {
          const colCount = el.trList[0].tdList.reduce(
            (pre, cur) => pre + cur.colspan,
            0
          )
          const innerWidth = editorOptions.width - margins[1] - margins[3]
          const colWidth = Math.max(innerWidth / colCount, defaultColMinWidth)
          el.colgroup = []
          for (let c = 0; c < colCount; c++) {
            el.colgroup.push({ width: colWidth })
          }
        }
        for (let t = 0; t < el.trList.length; t++) {
          const tr = el.trList[t]
          const trId = tr.id || getUUID()
          tr.id = trId
          if (!tr.minHeight || tr.minHeight < defaultTrMinHeight) {
            tr.minHeight = defaultTrMinHeight
          }
          if (tr.height < tr.minHeight) {
            tr.height = tr.minHeight
          }
          for (let d = 0; d < tr.tdList.length; d++) {
            const td = tr.tdList[d]
            const tdId = td.id || getUUID()
            td.id = tdId
            formatElementList(td.value, {
              ...options,
              isHandleFirstElement: true,
              isForceCompensation: true
            })
            // 首字符字体大小默认使用首个字符元素字体大小
            if (
              !td.value[0].size &&
              td.value[1]?.size &&
              isTextLikeElement(td.value[1])
            ) {
              td.value[0].size = td.value[1].size
            }
            for (let v = 0; v < td.value.length; v++) {
              const value = td.value[v]
              value.tdId = tdId
              value.trId = trId
              value.tableId = tableId
            }
          }
        }
      }
    } else if (el.type === ElementType.HYPERLINK) {
      // 移除父节点
      elementList.splice(i, 1)
      // 元素展开
      const valueList = unzipElementList(el.valueList || [])
      // 追加节点
      if (valueList.length) {
        const hyperlinkId = getUUID()
        for (let v = 0; v < valueList.length; v++) {
          const value = valueList[v]
          value.type = el.type
          value.url = el.url
          value.hyperlinkId = hyperlinkId
          elementList.splice(i, 0, value)
          i++
        }
      }
      i--
    } else if (el.type === ElementType.DATE) {
      // 移除父节点
      elementList.splice(i, 1)
      // 元素展开
      const valueList = unzipElementList(el.valueList || [])
      // 追加节点
      if (valueList.length) {
        const dateId = getUUID()
        for (let v = 0; v < valueList.length; v++) {
          const value = valueList[v]
          value.type = el.type
          value.dateFormat = el.dateFormat
          value.dateId = dateId
          elementList.splice(i, 0, value)
          i++
        }
      }
      i--
    } else if (el.type === ElementType.CONTROL) {
      // 兼容控件内容类型错误
      if (!el.control) {
        i++
        continue
      }
      const {
        prefix,
        postfix,
        preText,
        postText,
        value,
        placeholder,
        code,
        type,
        valueSets
      } = el.control
      const {
        editorOptions: {
          control: controlOption,
          checkbox: checkboxOption,
          radio: radioOption
        }
      } = options
      const controlId = el.controlId || getUUID()
      // 移除父节点
      elementList.splice(i, 1)
      // 控件上下文提取（压缩后的控件上下文无法提取）
      const controlContext = pickObject(el, [
        ...EDITOR_ELEMENT_CONTEXT_ATTR,
        ...EDITOR_ROW_ATTR
      ])
      // 控件设置的默认样式（以前缀为基准）
      const controlDefaultStyle = pickObject(
        <IElement>(<unknown>el.control),
        CONTROL_STYLE_ATTR
      )
      // 前后缀个性化设置
      const thePrePostfixArg: Omit<IElement, 'value'> = {
        ...controlDefaultStyle,
        color: editorOptions.control.bracketColor
      }
      // 前缀
      const prefixStrList = splitText(prefix || controlOption.prefix)
      for (let p = 0; p < prefixStrList.length; p++) {
        const value = prefixStrList[p]
        elementList.splice(i, 0, {
          ...controlContext,
          ...thePrePostfixArg,
          controlId,
          value,
          type: el.type,
          control: el.control,
          controlComponent: ControlComponent.PREFIX
        })
        i++
      }
      // 前文本
      if (preText) {
        const preTextStrList = splitText(preText)
        for (let p = 0; p < preTextStrList.length; p++) {
          const value = preTextStrList[p]
          elementList.splice(i, 0, {
            ...controlContext,
            ...controlDefaultStyle,
            controlId,
            value,
            type: el.type,
            control: el.control,
            controlComponent: ControlComponent.PRE_TEXT
          })
          i++
        }
      }
      // 值
      // CUSTOM_SELECT：存在 structValues 时优先渲染 structValues 中的文字
      const singleStructValues =
        type === ControlType.CUSTOM_SELECT && el.control.structValues?.length
          ? el.control.structValues
          : null
      // MULTI_CUSTOM_SELECT：使用 values 渲染（每个选项优先使用 structValues）
      const multiSelectValues =
        type === ControlType.MULTI_CUSTOM_SELECT && el.control.values?.length
          ? el.control.values
          : null
      // 对于 CUSTOM_SELECT 和 MULTI_CUSTOM_SELECT：当 value 或 code 为 null 时，自动选择第一个选项
      const shouldAutoSelectFirst =
        (type === ControlType.CUSTOM_SELECT || type === ControlType.MULTI_CUSTOM_SELECT) &&
        !singleStructValues &&
        !multiSelectValues &&
        (value == null || code == null) &&
        Array.isArray(valueSets) &&
        valueSets.length > 0
      // MULTI_CUSTOM_SELECT 支持 code 包含多个值（逗号分隔）
      const isMultiCustomSelectWithCode =
        type === ControlType.MULTI_CUSTOM_SELECT &&
        !multiSelectValues &&
        code &&
        (!value || !value.length)
      if (
        (value && value.length) ||
        !!singleStructValues ||
        !!multiSelectValues ||
        type === ControlType.CHECKBOX ||
        type === ControlType.RADIO ||
        (type === ControlType.SELECT && code && (!value || !value.length)) ||
        (type === ControlType.CUSTOM_SELECT && code && (!value || !value.length)) ||
        isMultiCustomSelectWithCode ||
        shouldAutoSelectFirst
      ) {
        // 处理 value 可能是字符串的情况，转换为 IElement[] 格式
        let valueList: IElement[] = []
        if (singleStructValues) {
          // 单选控件：渲染 structValues 中的文字（保留 groupIds、underline、highlight 等属性）
          valueList = singleStructValues.map(sv => ({
            ...deepClone(sv),
            color: sv.color ?? editorOptions.selector.customSelectValueColor
          })) as IElement[]
          // 同步 value 字段，保持数据一致性
          el.control.value = singleStructValues.map(sv => sv.value).join('')
        } else if (multiSelectValues) {
          // 多选控件：渲染 values 中的每个选项（选项优先渲染 structValues）
          // 分隔符优先从 code 推断，并回写到 control 以保证后续一致性
          const multiSelectValueColor = editorOptions.selector.multiSelectValueColor
          const delimiter = inferMultiSelectDelimiter(
            el.control.code,
            el.control.valueSets,
            el.control.multiSelectDelimiter
          )
          el.control.multiSelectDelimiter = delimiter
          multiSelectValues.forEach((optionValue, optionIndex) => {
            // 选项间分隔符
            if (optionIndex > 0 && delimiter) {
              const delimiterStrList = splitText(delimiter)
              delimiterStrList.forEach(d => {
                valueList.push({
                  value: d,
                  color: multiSelectValueColor
                })
              })
            }
            if (optionValue.structValues?.length) {
              // 优先渲染 structValues 中的文字（保留 groupIds、underline、highlight 等属性）
              // 注意：此处只读取数据生成元素，不修改原始 control.values，避免污染源数据
              optionValue.structValues.forEach(sv => {
                valueList.push({
                  ...deepClone(sv),
                  color: sv.color ?? multiSelectValueColor
                } as IElement)
              })
            } else {
              valueList.push({
                value: optionValue.value,
                color: multiSelectValueColor
              })
            }
          })
          // 多选控件移除 value 字段，由 values 派生
          el.control.value = null
          // 同步 code 字段，保持数据一致性（使用记录的分隔符）
          el.control.code =
            multiSelectValues
              .filter(v => v.code)
              .map(v => v.code)
              .join(delimiter) || null
        } else if (value) {
          if (Array.isArray(value)) {
            valueList = deepClone(value)
          } else if (typeof value === 'string') {
            // 字符串类型转换为 IElement 数组
            valueList = [{ value }]
          }
        }
        if (type === ControlType.CHECKBOX) {
          const codeList = code ? code.split(',') : []
          if (Array.isArray(valueSets) && valueSets.length) {
            // 拆分valueList优先使用其属性
            const valueStyleList = valueList.reduce(
              (pre, cur) =>
                pre.concat(
                  cur.value.split('').map(v => ({ ...cur, value: v }))
                ),
              [] as IElement[]
            )
            let valueStyleIndex = 0
            for (let v = 0; v < valueSets.length; v++) {
              const valueSet = valueSets[v]
              // checkbox组件
              elementList.splice(i, 0, {
                ...controlContext,
                ...controlDefaultStyle,
                controlId,
                value: '',
                type: el.type,
                control: el.control,
                controlComponent: ControlComponent.CHECKBOX,
                checkbox: {
                  code: valueSet.code,
                  value: codeList.includes(valueSet.code)
                }
              })
              i++
              // 文本
              const valueStrList = splitText(valueSet.value)
              for (let e = 0; e < valueStrList.length; e++) {
                const value = valueStrList[e]
                const isLastLetter = e === valueStrList.length - 1
                elementList.splice(i, 0, {
                  ...controlContext,
                  ...controlDefaultStyle,
                  ...valueStyleList[valueStyleIndex],
                  controlId,
                  value: value === '\n' ? ZERO : value,
                  letterSpacing: isLastLetter ? checkboxOption.gap : 0,
                  control: el.control,
                  controlComponent: ControlComponent.VALUE
                })
                valueStyleIndex++
                i++
              }
            }
          }
        } else if (type === ControlType.RADIO) {
          if (Array.isArray(valueSets) && valueSets.length) {
            // 拆分valueList优先使用其属性
            const valueStyleList = valueList.reduce(
              (pre, cur) =>
                pre.concat(
                  cur.value.split('').map(v => ({ ...cur, value: v }))
                ),
              [] as IElement[]
            )
            let valueStyleIndex = 0
            for (let v = 0; v < valueSets.length; v++) {
              const valueSet = valueSets[v]
              // radio组件
              elementList.splice(i, 0, {
                ...controlContext,
                ...controlDefaultStyle,
                controlId,
                value: '',
                type: el.type,
                control: el.control,
                controlComponent: ControlComponent.RADIO,
                radio: {
                  code: valueSet.code,
                  value: code === valueSet.code
                }
              })
              i++
              // 文本
              const valueStrList = splitText(valueSet.value)
              for (let e = 0; e < valueStrList.length; e++) {
                const value = valueStrList[e]
                const isLastLetter = e === valueStrList.length - 1
                elementList.splice(i, 0, {
                  ...controlContext,
                  ...controlDefaultStyle,
                  ...valueStyleList[valueStyleIndex],
                  controlId,
                  value: value === '\n' ? ZERO : value,
                  letterSpacing: isLastLetter ? radioOption.gap : 0,
                  control: el.control,
                  controlComponent: ControlComponent.VALUE
                })
                valueStyleIndex++
                i++
              }
            }
          }
        } else {
          if (!value || !value.length) {
            if (Array.isArray(valueSets) && valueSets.length) {
              // 当 value 或 code 为 null 时，自动选择第一个选项
              if (shouldAutoSelectFirst) {
                const firstValueSet = valueSets[0]
                valueList = [
                  {
                    value: firstValueSet.value,
                    color:
                      type === ControlType.MULTI_CUSTOM_SELECT
                        ? editorOptions.selector.multiSelectValueColor
                        : editorOptions.selector.customSelectValueColor
                  }
                ]
                // 更新 control.code 为第一个选项的 code
                el.control!.code = firstValueSet.code
              } else if (code) {
                // MULTI_CUSTOM_SELECT: code 可以包含多个值（分隔符可从 code 推断）
                if (type === ControlType.MULTI_CUSTOM_SELECT) {
                  const delimiter = inferMultiSelectDelimiter(
                    code,
                    valueSets,
                    el.control?.multiSelectDelimiter
                  )
                  // 回写推断出的分隔符，保证后续取值一致性
                  if (el.control) {
                    el.control.multiSelectDelimiter = delimiter
                  }
                  const codes = code.split(delimiter)
                  const values: IElement[] = []
                  const controlValues: IControlSelectValue[] = []
                  codes.forEach(c => {
                    const valueSet = valueSets.find(v => v.code === c.trim())
                    if (valueSet) {
                      values.push({
                        value: valueSet.value,
                        color: editorOptions.selector.multiSelectValueColor
                      })
                      controlValues.push({
                        value: valueSet.value,
                        code: valueSet.code
                      })
                    }
                  })
                  if (values.length > 0) {
                    valueList = values
                    // 同步 values 字段，确保 getValueById / zipElementList 能正确派生显示文本
                    el.control!.values = controlValues
                  }
                } else {
                  // 其他控件：根据 code 查找对应的值
                  const valueSet = valueSets.find(v => v.code === code)
                  if (valueSet) {
                    valueList = [
                      {
                        value: valueSet.value,
                        color:
                          type === ControlType.CUSTOM_SELECT
                            ? editorOptions.selector.customSelectValueColor
                            : editorOptions.selector.optionColor
                      }
                    ]
                  }
                }
              }
            }
          }
          formatElementList(valueList, {
            ...options,
            isHandleFirstElement: false,
            isForceCompensation: false
          })
          for (let v = 0; v < valueList.length; v++) {
            const element = valueList[v]
            const value = element.value
            elementList.splice(i, 0, {
              ...controlContext,
              ...controlDefaultStyle,
              ...element,
              controlId,
              value: value === '\n' ? ZERO : value,
              type: element.type || ElementType.TEXT,
              control: el.control,
              controlComponent: ControlComponent.VALUE
            })
            i++
          }
        }
      } else if (placeholder) {
        // placeholder
        const thePlaceholderArgs: Omit<IElement, 'value'> = {
          ...controlDefaultStyle,
          color: editorOptions.control.placeholderColor
        }
        const placeholderStrList = splitText(placeholder)
        for (let p = 0; p < placeholderStrList.length; p++) {
          const value = placeholderStrList[p]
          elementList.splice(i, 0, {
            ...controlContext,
            ...thePlaceholderArgs,
            controlId,
            value: value === '\n' ? ZERO : value,
            type: el.type,
            control: el.control,
            controlComponent: ControlComponent.PLACEHOLDER
          })
          i++
        }
      }
      // 后文本
      if (postText) {
        const postTextStrList = splitText(postText)
        for (let p = 0; p < postTextStrList.length; p++) {
          const value = postTextStrList[p]
          elementList.splice(i, 0, {
            ...controlContext,
            ...controlDefaultStyle,
            controlId,
            value,
            type: el.type,
            control: el.control,
            controlComponent: ControlComponent.POST_TEXT
          })
          i++
        }
      }
      // 后缀
      const postfixStrList = splitText(postfix || controlOption.postfix)
      for (let p = 0; p < postfixStrList.length; p++) {
        const value = postfixStrList[p]
        elementList.splice(i, 0, {
          ...controlContext,
          ...thePrePostfixArg,
          controlId,
          value,
          type: el.type,
          control: el.control,
          controlComponent: ControlComponent.POSTFIX
        })
        i++
      }
      i--
    } else if (
      (!el.type || TEXTLIKE_ELEMENT_TYPE.includes(el.type)) &&
      el.value?.length > 1
    ) {
      elementList.splice(i, 1)
      const valueList = splitText(el.value)
      for (let v = 0; v < valueList.length; v++) {
        elementList.splice(i + v, 0, { ...el, value: valueList[v] })
      }
      el = elementList[i]
    }
    if (el.value === '\n' || el.value == '\r\n') {
      el.value = ZERO
    }
    if (el.type === ElementType.IMAGE || el.type === ElementType.BLOCK) {
      el.id = el.id || getUUID()
    }
    if (el.type === ElementType.LATEX) {
      const { svg, width, height } = LaTexParticle.convertLaTextToSVG(el.value)
      el.width = el.width || width
      el.height = el.height || height
      el.laTexSVG = svg
      el.id = el.id || getUUID()
    }
    i++
  }
}

export function isSameElementExceptValue(
  source: IElement,
  target: IElement
): boolean {
  const sourceKeys = Object.keys(source)
  const targetKeys = Object.keys(target)
  if (sourceKeys.length !== targetKeys.length) return false
  for (let s = 0; s < sourceKeys.length; s++) {
    const key = sourceKeys[s] as never
    // 值不需要校验
    if (key === 'value') continue
    // groupIds数组需特殊校验数组是否相等
    if (
      key === 'groupIds' &&
      Array.isArray(source[key]) &&
      Array.isArray(target[key]) &&
      isArrayEqual(source[key], target[key])
    ) {
      continue
    }
    if (source[key] !== target[key]) {
      return false
    }
  }
  return true
}
interface IPickElementOption {
  extraPickAttrs?: Array<keyof IElement>
}
export function pickElementAttr(
  payload: IElement,
  option: IPickElementOption = {}
): IElement {
  const { extraPickAttrs } = option
  const zipAttrs = [...EDITOR_ELEMENT_ZIP_ATTR]
  if (extraPickAttrs) {
    zipAttrs.push(...extraPickAttrs)
  }
  const element: IElement = {
    value: payload.value === ZERO ? `\n` : payload.value
  }
  zipAttrs.forEach(attr => {
    const value = payload[attr] as never
    if (value !== undefined) {
      element[attr] = value
    }
  })
  return element
}

interface IZipElementListOption {
  extraPickAttrs?: Array<keyof IElement>
  isClassifyArea?: boolean
  isClone?: boolean
}
export function zipElementList(
  payload: IElement[],
  options: IZipElementListOption = {}
): IElement[] {
  const { extraPickAttrs, isClassifyArea = false, isClone = true } = options
  const elementList = isClone ? deepClone(payload) : payload
  const zipElementListData: IElement[] = []
  let e = 0
  while (e < elementList.length) {
    let element = elementList[e]
    // 上下文首字符（占位符）-列表首字符要保留避免是复选框
    if (
      e === 0 &&
      element.value === ZERO &&
      !element.listId &&
      (!element.type || element.type === ElementType.TEXT)
    ) {
      e++
      continue
    }
    // 优先处理虚拟元素，后表格、超链接、日期、控件特殊处理
    if (element.areaId) {
      const areaId = element.areaId
      const area = element.area
      // 收集并压缩数据
      const valueList: IElement[] = []
      while (e < elementList.length) {
        const areaE = elementList[e]
        if (areaId !== areaE.areaId) {
          e--
          break
        }
        delete areaE.area
        delete areaE.areaId
        valueList.push(areaE)
        e++
      }
      const areaElementList = zipElementList(valueList, options)
      // 不归类区域元素
      if (isClassifyArea) {
        const areaElement: IElement = {
          type: ElementType.AREA,
          value: '',
          areaId,
          area
        }
        areaElement.valueList = areaElementList
        element = areaElement
      } else {
        zipElementListData.splice(e, 0, ...areaElementList)
        continue
      }
    } else if (element.titleId && element.level) {
      // 标题处理
      const titleId = element.titleId
      if (titleId) {
        const level = element.level
        const titleElement: IElement = {
          type: ElementType.TITLE,
          title: element.title,
          titleId,
          value: '',
          level
        }
        const valueList: IElement[] = []
        while (e < elementList.length) {
          const titleE = elementList[e]
          if (titleId !== titleE.titleId) {
            e--
            break
          }
          delete titleE.level
          delete titleE.title
          valueList.push(titleE)
          e++
        }
        titleElement.valueList = zipElementList(valueList, options)
        element = titleElement
      }
    } else if (element.listId && element.listType) {
      // 列表处理
      const listId = element.listId
      if (listId) {
        const listType = element.listType
        const listStyle = element.listStyle
        const listElement: IElement = {
          type: ElementType.LIST,
          value: '',
          listId,
          listType,
          listStyle
        }
        const valueList: IElement[] = []
        while (e < elementList.length) {
          const listE = elementList[e]
          if (listId !== listE.listId) {
            e--
            break
          }
          delete listE.listType
          delete listE.listStyle
          valueList.push(listE)
          e++
        }
        listElement.valueList = zipElementList(valueList, options)
        element = listElement
      }
    } else if (element.type === ElementType.TABLE) {
      // 分页表格先进行合并
      if (element.pagingId) {
        let tableIndex = e + 1
        let combineCount = 0
        while (tableIndex < elementList.length) {
          const nextElement = elementList[tableIndex]
          if (nextElement.pagingId === element.pagingId) {
            element.height! += nextElement.height!
            element.trList!.push(...nextElement.trList!)
            tableIndex++
            combineCount++
          } else {
            break
          }
        }
        e += combineCount
      }
      if (element.trList) {
        for (let t = 0; t < element.trList.length; t++) {
          const tr = element.trList[t]
          delete tr.id
          for (let d = 0; d < tr.tdList.length; d++) {
            const td = tr.tdList[d]
            const zipTd: ITd = {
              colspan: td.colspan,
              rowspan: td.rowspan,
              value: zipElementList(td.value, {
                ...options,
                isClassifyArea: false
              })
            }
            // 压缩单元格属性
            TABLE_TD_ZIP_ATTR.forEach(attr => {
              const value = td[attr] as never
              if (value !== undefined) {
                zipTd[attr] = value
              }
            })
            tr.tdList[d] = zipTd
          }
        }
      }
    } else if (element.type === ElementType.HYPERLINK) {
      // 超链接处理
      const hyperlinkId = element.hyperlinkId
      if (hyperlinkId) {
        const hyperlinkElement: IElement = {
          type: ElementType.HYPERLINK,
          value: '',
          url: element.url
        }
        const valueList: IElement[] = []
        while (e < elementList.length) {
          const hyperlinkE = elementList[e]
          if (hyperlinkId !== hyperlinkE.hyperlinkId) {
            e--
            break
          }
          delete hyperlinkE.type
          delete hyperlinkE.url
          valueList.push(hyperlinkE)
          e++
        }
        hyperlinkElement.valueList = zipElementList(valueList, options)
        element = hyperlinkElement
      }
    } else if (element.type === ElementType.DATE) {
      const dateId = element.dateId
      if (dateId) {
        const dateElement: IElement = {
          type: ElementType.DATE,
          value: '',
          dateFormat: element.dateFormat
        }
        const valueList: IElement[] = []
        while (e < elementList.length) {
          const dateE = elementList[e]
          if (dateId !== dateE.dateId) {
            e--
            break
          }
          delete dateE.type
          delete dateE.dateFormat
          valueList.push(dateE)
          e++
        }
        dateElement.valueList = zipElementList(valueList, options)
        element = dateElement
      }
    } else if (element.controlId) {
      const controlId = element.controlId
      // 控件包含前后缀则转换为控件
      if (element.controlComponent === ControlComponent.PREFIX) {
        const valueList: IElement[] = []
        let isFull = false
        let start = e
        while (start < elementList.length) {
          const controlE = elementList[start]
          if (controlId !== controlE.controlId) break
          if (controlE.controlComponent === ControlComponent.VALUE) {
            delete controlE.control
            delete controlE.controlId
            valueList.push(controlE)
          }
          if (controlE.controlComponent === ControlComponent.POSTFIX) {
            isFull = true
          }
          start++
        }
        if (isFull) {
          // 以前缀为基准更新控件默认样式
          const controlDefaultStyle = <IControlSelect>(
            (<unknown>pickObject(element, CONTROL_STYLE_ATTR))
          )
          const control = {
            ...element.control!,
            ...controlDefaultStyle
          }
          const controlElement: IElement = {
            ...pickObject(element, EDITOR_ROW_ATTR),
            type: ElementType.CONTROL,
            value: '',
            control,
            controlId
          }
          if (control.type === ControlType.CUSTOM_SELECT) {
            // 单选控件：value 字段与 structValues 已同步维护（字符串形式）
            if (typeof control.value !== 'string') {
              const displayText = valueList.map(v => v.value).join('')
              controlElement.control!.value = displayText
              controlElement.value = displayText
            }
          } else if (control.type === ControlType.MULTI_CUSTOM_SELECT) {
            // 多选控件：value 设为显示文本，code/values 保留用于数据交互
            const displayText = valueList.map(v => v.value).join('')
            controlElement.control!.value = displayText
            controlElement.value = displayText
          } else {
            controlElement.control!.value = zipElementList(valueList, options)
          }
          element = pickElementAttr(controlElement, { extraPickAttrs })
          // 控件元素数量 - 1（当前元素）
          e += start - e - 1
        }
      }
      // 不完整的控件元素不转化为控件，如果不是文本则直接忽略
      if (element.controlComponent) {
        delete element.control
        delete element.controlId
        if (
          element.controlComponent !== ControlComponent.VALUE &&
          element.controlComponent !== ControlComponent.PRE_TEXT &&
          element.controlComponent !== ControlComponent.POST_TEXT
        ) {
          e++
          continue
        }
      }
    }
    // 组合元素
    const pickElement = pickElementAttr(element, { extraPickAttrs })
    if (
      !element.type ||
      element.type === ElementType.TEXT ||
      element.type === ElementType.SUBSCRIPT ||
      element.type === ElementType.SUPERSCRIPT
    ) {
      while (e < elementList.length) {
        const nextElement = elementList[e + 1]
        e++
        if (
          nextElement &&
          isSameElementExceptValue(
            pickElement,
            pickElementAttr(nextElement, { extraPickAttrs })
          )
        ) {
          const nextValue =
            nextElement.value === ZERO ? '\n' : nextElement.value
          pickElement.value += nextValue
        } else {
          break
        }
      }
    } else {
      e++
    }
    zipElementListData.push(pickElement)
  }
  return zipElementListData
}

// 依据新旧文本差异，将变更同步到结构化片段列表（保留 groupIds、underline、highlight 等属性）
// 插入的文字根据位置归属对应片段：位于片段内部或紧邻片段尾部时继承该片段属性
export function applyTextDiffToStructSegments<T extends { value: string }>(
  segments: T[],
  oldText: string,
  newText: string,
  canInsert?: (segment: T) => boolean
): T[] {
  if (oldText === newText) {
    return segments.map(segment => ({ ...segment }))
  }
  // 计算公共前缀长度
  let prefixLen = 0
  const maxPrefix = Math.min(oldText.length, newText.length)
  while (prefixLen < maxPrefix && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++
  }
  // 计算公共后缀长度
  let suffixLen = 0
  const maxSuffix = Math.min(oldText.length, newText.length) - prefixLen
  while (
    suffixLen < maxSuffix &&
    oldText[oldText.length - 1 - suffixLen] ===
      newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++
  }
  // 删除区间与插入文字
  const deleteStart = prefixLen
  const deleteEnd = oldText.length - suffixLen
  const insertText = newText.slice(prefixLen, newText.length - suffixLen)
  // 计算每个片段删除后保留的左右部分
  const parts: {
    keepLeft: string
    keepRight: string
    segStart: number
    segEnd: number
  }[] = []
  let cursor = 0
  for (const segment of segments) {
    const segStart = cursor
    const segEnd = cursor + segment.value.length
    cursor = segEnd
    const leftEnd = Math.max(segStart, Math.min(segEnd, deleteStart))
    const rightStart = Math.max(segStart, Math.min(segEnd, deleteEnd))
    parts.push({
      keepLeft: segment.value.slice(0, leftEnd - segStart),
      keepRight: segment.value.slice(rightStart - segStart),
      segStart,
      segEnd
    })
  }
  // 查找插入目标片段
  let insertIndex = -1
  if (insertText) {
    const insertable = (i: number) => !canInsert || canInsert(segments[i])
    // 优先：插入点位于片段内部
    for (let i = 0; i < parts.length; i++) {
      if (deleteStart > parts[i].segStart && deleteStart < parts[i].segEnd) {
        insertIndex = i
        break
      }
    }
    // 其次：插入点紧邻片段尾部（继承前一片段属性）
    if (!~insertIndex) {
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].segEnd === deleteStart && insertable(i)) {
          insertIndex = i
          break
        }
      }
    }
    // 最后：插入点紧邻片段头部
    if (!~insertIndex) {
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].segStart === deleteStart && insertable(i)) {
          insertIndex = i
          break
        }
      }
    }
  }
  // 重建片段列表（删除后为空的片段移除）
  const result: T[] = []
  segments.forEach((segment, i) => {
    const { keepLeft, keepRight } = parts[i]
    const newValue =
      i === insertIndex ? keepLeft + insertText + keepRight : keepLeft + keepRight
    if (newValue) {
      result.push({ ...segment, value: newValue })
    }
  })
  // 兜底：无法定位插入位置时追加纯文本片段
  if (insertText && !~insertIndex) {
    result.push({ value: insertText } as T)
  }
  return result
}

export function convertTextAlignToRowFlex(node: HTMLElement) {
  const textAlign = window.getComputedStyle(node).textAlign
  switch (textAlign) {
    case 'left':
    case 'start':
      return RowFlex.LEFT
    case 'center':
      return RowFlex.CENTER
    case 'right':
    case 'end':
      return RowFlex.RIGHT
    case 'justify':
      return RowFlex.ALIGNMENT
    case 'justify-all':
      return RowFlex.JUSTIFY
    default:
      return RowFlex.LEFT
  }
}

export function convertRowFlexToTextAlign(rowFlex: RowFlex) {
  return rowFlex === RowFlex.ALIGNMENT ? 'justify' : rowFlex
}

export function convertRowFlexToJustifyContent(rowFlex: RowFlex) {
  switch (rowFlex) {
    case RowFlex.LEFT:
      return 'flex-start'
    case RowFlex.CENTER:
      return 'center'
    case RowFlex.RIGHT:
      return 'flex-end'
    case RowFlex.ALIGNMENT:
    case RowFlex.JUSTIFY:
      return 'space-between'
    default:
      return 'flex-start'
  }
}

export function isTextLikeElement(element: IElement): boolean {
  return !element.type || TEXTLIKE_ELEMENT_TYPE.includes(element.type)
}

export function isTextElement(element: IElement): boolean {
  return !element.type || element.type === ElementType.TEXT
}

export function getElementListText(elementList: IElement[]): string {
  return elementList
    .filter(el => isTextLikeElement(el))
    .map(el => el.value)
    .join('')
    .replace(new RegExp(ZERO, 'g'), '')
}

export function getAnchorElement(
  elementList: IElement[],
  anchorIndex: number
): IElement | null {
  const anchorElement = elementList[anchorIndex]
  if (!anchorElement) return null
  const anchorNextElement = elementList[anchorIndex + 1]
  // 非列表元素 && 当前元素是换行符 && 下一个元素不是换行符 && 区域相同 => 则以下一个元素作为参考元素
  return !anchorElement.listId &&
    anchorElement.value === ZERO &&
    anchorNextElement &&
    anchorNextElement.value !== ZERO &&
    anchorElement.areaId === anchorNextElement.areaId
    ? anchorNextElement
    : anchorElement
}

export interface IFormatElementContextOption {
  isBreakWhenWrap?: boolean
  ignoreContextKeys?: Array<keyof IElement>
  editorOptions?: DeepRequired<IEditorOption>
}

export function formatElementContext(
  sourceElementList: IElement[],
  formatElementList: IElement[],
  anchorIndex: number,
  options?: IFormatElementContextOption
) {
  let copyElement = getAnchorElement(sourceElementList, anchorIndex)
  if (!copyElement) return
  const {
    isBreakWhenWrap = false,
    editorOptions,
    ignoreContextKeys = []
  } = options || {}
  const { mode } = editorOptions || {}
  // 非设计模式时：标题元素禁用时不复制标题属性
  if (mode !== EditorMode.DESIGN && copyElement.title?.disabled) {
    copyElement = omitObject(copyElement, TITLE_CONTEXT_ATTR)
  }
  // 是否已经换行
  let isBreakWarped = false
  for (let e = 0; e < formatElementList.length; e++) {
    const targetElement = formatElementList[e]
    if (
      isBreakWhenWrap &&
      !copyElement.listId &&
      START_LINE_BREAK_REG.test(targetElement.value)
    ) {
      isBreakWarped = true
    }
    // 1. 即使换行停止也要处理表格上下文信息
    // 2. 定位元素非列表，无需处理粘贴列表的上下文，仅处理表格及行上下文信息
    if (
      isBreakWarped ||
      (!copyElement.listId && targetElement.type === ElementType.LIST)
    ) {
      const cloneAttr = [
        ...TABLE_CONTEXT_ATTR,
        ...EDITOR_ROW_ATTR,
        ...AREA_CONTEXT_ATTR
      ]
      deleteProperty(cloneAttr, ignoreContextKeys)
      cloneProperty<IElement>(cloneAttr, copyElement!, targetElement)
      targetElement.valueList?.forEach(valueItem => {
        cloneProperty<IElement>(cloneAttr, copyElement!, valueItem)
      })
      continue
    }
    if (targetElement.valueList?.length) {
      formatElementContext(
        sourceElementList,
        targetElement.valueList,
        anchorIndex,
        options
      )
    }
    // 非块类元素，需处理行属性
    const cloneAttr = [...EDITOR_ELEMENT_CONTEXT_ATTR]
    if (!getIsBlockElement(targetElement)) {
      cloneAttr.push(...EDITOR_ROW_ATTR)
    }
    deleteProperty(cloneAttr, ignoreContextKeys)
    cloneProperty<IElement>(cloneAttr, copyElement, targetElement)
  }
}

export function convertElementToDom(
  element: IElement,
  options: DeepRequired<IEditorOption>
): HTMLElement {
  let tagName: keyof HTMLElementTagNameMap = 'span'
  if (element.type === ElementType.SUPERSCRIPT) {
    tagName = 'sup'
  } else if (element.type === ElementType.SUBSCRIPT) {
    tagName = 'sub'
  }
  const dom = document.createElement(tagName)
  dom.style.fontFamily = element.font || options.defaultFont
  if (element.rowFlex) {
    dom.style.textAlign = convertRowFlexToTextAlign(element.rowFlex)
  }
  if (element.color) {
    dom.style.color = element.color
  }
  if (element.bold) {
    dom.style.fontWeight = '600'
  }
  if (element.italic) {
    dom.style.fontStyle = 'italic'
  }
  dom.style.fontSize = `${element.size || options.defaultSize}px`
  if (element.highlight) {
    dom.style.backgroundColor = element.highlight
  }
  if (element.underline) {
    dom.style.textDecoration = 'underline'
    dom.style.textDecorationStyle = element.textDecoration?.style || 'solid'
  }
  if (element.strikeout) {
    dom.style.textDecoration += ' line-through'
  }
  if (element.type) {
    dom.setAttribute('data-type', element.type)
  }
  if (element.rowMargin) {
    dom.style.lineHeight = (
      element.rowMargin ?? options.defaultRowMargin
    ).toString()
  }
  dom.innerText = element.value.replace(new RegExp(`${ZERO}`, 'g'), '\n')
  return dom
}

export function splitListElement(
  elementList: IElement[]
): Map<number, IElement[]> {
  let curListIndex = 0
  const listElementListMap: Map<number, IElement[]> = new Map()
  for (let e = 0; e < elementList.length; e++) {
    const element = elementList[e]
    // 移除列表首行换行字符-如果是复选框直接忽略
    if (e === 0) {
      if (element.checkbox) continue
      element.value = element.value.replace(START_LINE_BREAK_REG, '')
    }
    if (element.listWrap) {
      const listElementList = listElementListMap.get(curListIndex) || []
      listElementList.push(element)
      listElementListMap.set(curListIndex, listElementList)
    } else {
      const valueList = element.value.split('\n')
      for (let c = 0; c < valueList.length; c++) {
        if (c > 0) {
          curListIndex += 1
        }
        const value = valueList[c]
        const listElementList = listElementListMap.get(curListIndex) || []
        listElementList.push({
          ...element,
          value
        })
        listElementListMap.set(curListIndex, listElementList)
      }
    }
  }
  return listElementListMap
}

export interface IElementListGroupRowFlex {
  rowFlex: RowFlex | null
  data: IElement[]
}

export function groupElementListByRowFlex(
  elementList: IElement[]
): IElementListGroupRowFlex[] {
  const elementListGroupList: IElementListGroupRowFlex[] = []
  if (!elementList.length) return elementListGroupList
  let currentRowFlex: RowFlex | null = elementList[0]?.rowFlex || null
  elementListGroupList.push({
    rowFlex: currentRowFlex,
    data: [elementList[0]]
  })
  for (let e = 1; e < elementList.length; e++) {
    const element = elementList[e]
    const rowFlex = element.rowFlex || null
    // 行布局相同&非块元素时追加数据，否则新增分组
    if (
      currentRowFlex === rowFlex &&
      !getIsBlockElement(element) &&
      !getIsBlockElement(elementList[e - 1])
    ) {
      const lastElementListGroup =
        elementListGroupList[elementListGroupList.length - 1]
      lastElementListGroup.data.push(element)
    } else {
      elementListGroupList.push({
        rowFlex,
        data: [element]
      })
      currentRowFlex = rowFlex
    }
  }
  // 压缩数据
  for (let g = 0; g < elementListGroupList.length; g++) {
    const elementListGroup = elementListGroupList[g]
    elementListGroup.data = zipElementList(elementListGroup.data)
  }
  return elementListGroupList
}

export function createDomFromElementList(
  elementList: IElement[],
  options?: IEditorOption
) {
  const editorOptions = mergeOption(options)
  function buildDom(payload: IElement[]): HTMLDivElement {
    const clipboardDom = document.createElement('div')
    for (let e = 0; e < payload.length; e++) {
      const element = payload[e]
      // 构造表格
      if (element.type === ElementType.TABLE) {
        const tableDom: HTMLTableElement = document.createElement('table')
        tableDom.setAttribute('cellSpacing', '0')
        tableDom.setAttribute('cellpadding', '0')
        tableDom.setAttribute('border', '0')
        const borderStyle = '1px solid #000000'
        // 表格边框
        if (!element.borderType || element.borderType === TableBorder.ALL) {
          tableDom.style.borderTop = borderStyle
          tableDom.style.borderLeft = borderStyle
        } else if (element.borderType === TableBorder.EXTERNAL) {
          tableDom.style.border = borderStyle
        }
        tableDom.style.width = `${element.width}px`
        // colgroup
        const colgroupDom = document.createElement('colgroup')
        for (let c = 0; c < element.colgroup!.length; c++) {
          const colgroup = element.colgroup![c]
          const colDom = document.createElement('col')
          colDom.setAttribute('width', `${colgroup.width}`)
          colgroupDom.append(colDom)
        }
        tableDom.append(colgroupDom)
        // tr
        const trList = element.trList!
        for (let t = 0; t < trList.length; t++) {
          const trDom = document.createElement('tr')
          const tr = trList[t]
          trDom.style.height = `${tr.height}px`
          for (let d = 0; d < tr.tdList.length; d++) {
            const tdDom = document.createElement('td')
            if (!element.borderType || element.borderType === TableBorder.ALL) {
              tdDom.style.borderBottom = tdDom.style.borderRight = '1px solid'
            }
            const td = tr.tdList[d]
            tdDom.colSpan = td.colspan
            tdDom.rowSpan = td.rowspan
            tdDom.style.verticalAlign = td.verticalAlign || 'top'
            // 单元格边框
            if (td.borderTypes?.includes(TdBorder.TOP)) {
              tdDom.style.borderTop = borderStyle
            }
            if (td.borderTypes?.includes(TdBorder.RIGHT)) {
              tdDom.style.borderRight = borderStyle
            }
            if (td.borderTypes?.includes(TdBorder.BOTTOM)) {
              tdDom.style.borderBottom = borderStyle
            }
            if (td.borderTypes?.includes(TdBorder.LEFT)) {
              tdDom.style.borderLeft = borderStyle
            }
            const childDom = createDomFromElementList(td.value!, options)
            tdDom.innerHTML = childDom.innerHTML
            if (td.backgroundColor) {
              tdDom.style.backgroundColor = td.backgroundColor
            }
            trDom.append(tdDom)
          }
          tableDom.append(trDom)
        }
        clipboardDom.append(tableDom)
      } else if (element.type === ElementType.HYPERLINK) {
        const a = document.createElement('a')
        a.innerText = element.valueList!.map(v => v.value).join('')
        if (element.url) {
          a.href = element.url
        }
        clipboardDom.append(a)
      } else if (element.type === ElementType.TITLE) {
        const h = document.createElement(
          `h${titleOrderNumberMapping[element.level!]}`
        )
        const childDom = buildDom(element.valueList!)
        h.innerHTML = childDom.innerHTML
        clipboardDom.append(h)
      } else if (element.type === ElementType.LIST) {
        const list = document.createElement(
          listTypeElementMapping[element.listType!]
        )
        if (element.listStyle) {
          list.style.listStyleType = listStyleCSSMapping[element.listStyle]
        }
        // 按照换行符拆分
        const zipList = zipElementList(element.valueList!)
        const listElementListMap = splitListElement(zipList)
        listElementListMap.forEach(listElementList => {
          const li = document.createElement('li')
          const childDom = buildDom(listElementList)
          li.innerHTML = childDom.innerHTML
          list.append(li)
        })
        clipboardDom.append(list)
      } else if (element.type === ElementType.IMAGE) {
        const img = document.createElement('img')
        if (element.value) {
          img.src = element.value
          img.width = element.width!
          img.height = element.height!
        }
        clipboardDom.append(img)
      } else if (element.type === ElementType.BLOCK) {
        if (element.block?.type === BlockType.VIDEO) {
          const src = element.block.videoBlock?.src
          if (src) {
            const video = document.createElement('video')
            video.style.display = 'block'
            video.controls = true
            video.src = src
            video.width = element.width! || options?.width || window.innerWidth
            video.height = element.height!
            clipboardDom.append(video)
          }
        } else if (element.block?.type === BlockType.IFRAME) {
          const { src, srcdoc, sandbox, allow } =
            element.block.iframeBlock || {}
          if (src || srcdoc) {
            const iframe = document.createElement('iframe')
            iframe.sandbox.add(...(sandbox || IFrameBlock.sandbox))
            iframe.setAttribute('allow', [allow || IFrameBlock.allow].join(' '))
            iframe.style.display = 'block'
            iframe.style.border = 'none'
            if (src) {
              iframe.src = src
            } else if (srcdoc) {
              iframe.srcdoc = srcdoc
            }
            iframe.width = `${
              element.width || options?.width || window.innerWidth
            }`
            iframe.height = `${element.height!}`
            clipboardDom.append(iframe)
          }
        }
      } else if (element.type === ElementType.SEPARATOR) {
        const hr = document.createElement('hr')
        if (element.dashArray?.length) {
          hr.setAttribute('data-dash-array', element.dashArray.join(','))
        }
        clipboardDom.append(hr)
      } else if (element.type === ElementType.CHECKBOX) {
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        if (element.checkbox?.value) {
          checkbox.setAttribute('checked', 'true')
        }
        clipboardDom.append(checkbox)
      } else if (element.type === ElementType.RADIO) {
        const radio = document.createElement('input')
        radio.type = 'radio'
        if (element.radio?.value) {
          radio.setAttribute('checked', 'true')
        }
        clipboardDom.append(radio)
      } else if (element.type === ElementType.TAB) {
        const tab = document.createElement('span')
        tab.innerHTML = `${NON_BREAKING_SPACE}${NON_BREAKING_SPACE}`
        clipboardDom.append(tab)
      } else if (element.type === ElementType.CONTROL) {
        const controlElement = document.createElement('span')
        const controlValue = element.control?.value
        const plainText =
          typeof controlValue === 'string'
            ? controlValue
            : (controlValue || []).map(v => v.value).join('')
        controlElement.innerText = `${element.control?.preText || ''}${plainText}${element.control?.postText || ''}`
        clipboardDom.append(controlElement)
      } else if (element.type === ElementType.PAGE_BREAK) {
        const pageBreakElement = document.createElement('div')
        pageBreakElement.style.breakAfter = 'page'
        clipboardDom.append(pageBreakElement)
      } else if (
        !element.type ||
        element.type === ElementType.LATEX ||
        TEXTLIKE_ELEMENT_TYPE.includes(element.type)
      ) {
        let text = ''
        if (element.type === ElementType.DATE) {
          text = element.valueList?.map(v => v.value).join('') || ''
        } else {
          text = element.value
        }
        if (!text) continue
        const dom = convertElementToDom(element, editorOptions)
        // 前一个元素是标题，移除首行换行符
        if (payload[e - 1]?.type === ElementType.TITLE) {
          text = text.replace(/^\n/, '')
        }
        dom.innerText = text.replace(new RegExp(`${ZERO}`, 'g'), '\n')
        clipboardDom.append(dom)
      }
    }
    return clipboardDom
  }
  // 按行布局分类创建dom
  const clipboardDom = document.createElement('div')
  const groupElementList = groupElementListByRowFlex(elementList)
  for (let g = 0; g < groupElementList.length; g++) {
    const elementGroupRowFlex = groupElementList[g]
    // 行布局样式设置
    const isDefaultRowFlex =
      !elementGroupRowFlex.rowFlex ||
      elementGroupRowFlex.rowFlex === RowFlex.LEFT
    // 块元素使用flex否则使用text-align
    const rowFlexDom = document.createElement('div')
    if (!isDefaultRowFlex) {
      const firstElement = elementGroupRowFlex.data[0]
      if (getIsBlockElement(firstElement)) {
        rowFlexDom.style.display = 'flex'
        rowFlexDom.style.justifyContent = convertRowFlexToJustifyContent(
          firstElement.rowFlex!
        )
      } else {
        rowFlexDom.style.textAlign = convertRowFlexToTextAlign(
          elementGroupRowFlex.rowFlex!
        )
        if (elementGroupRowFlex.rowFlex === 'justify') {
          rowFlexDom.style.textAlignLast = 'justify'
        }
      }
    }
    // 布局内容
    rowFlexDom.innerHTML = buildDom(elementGroupRowFlex.data).innerHTML
    // 未设置行布局时无需行布局容器
    if (!isDefaultRowFlex) {
      clipboardDom.append(rowFlexDom)
    } else {
      rowFlexDom.childNodes.forEach(child => {
        clipboardDom.append(child.cloneNode(true))
      })
    }
  }
  return clipboardDom
}

export function convertTextNodeToElement(
  textNode: Element | Node
): IElement | null {
  if (!textNode || textNode.nodeType !== 3) return null
  const parentNode = <HTMLElement>textNode.parentNode
  const anchorNode =
    parentNode.nodeName === 'FONT'
      ? <HTMLElement>parentNode.parentNode
      : parentNode
  const rowFlex = convertTextAlignToRowFlex(anchorNode)
  const value = textNode.textContent
  const style = window.getComputedStyle(anchorNode)
  if (!value || anchorNode.nodeName === 'STYLE') return null
  const element: IElement = {
    value,
    color: style.color,
    bold: Number(style.fontWeight) > 500,
    italic: style.fontStyle.includes('italic'),
    size: Math.floor(parseFloat(style.fontSize))
  }
  // 元素类型-默认文本
  if (anchorNode.nodeName === 'SUB' || style.verticalAlign === 'sub') {
    element.type = ElementType.SUBSCRIPT
  } else if (anchorNode.nodeName === 'SUP' || style.verticalAlign === 'super') {
    element.type = ElementType.SUPERSCRIPT
  }
  // 行对齐
  if (rowFlex !== RowFlex.LEFT) {
    element.rowFlex = rowFlex
  }
  // 高亮色
  if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
    element.highlight = style.backgroundColor
  }
  // 下划线
  if (style.textDecorationLine.includes('underline')) {
    element.underline = true
  }
  // 删除线
  if (style.textDecorationLine.includes('line-through')) {
    element.strikeout = true
  }
  return element
}

export interface IGetElementListByHTMLOption {
  innerWidth: number
}

export function getElementListByHTML(
  htmlText: string,
  options: IGetElementListByHTMLOption
): IElement[] {
  const elementList: IElement[] = []
  function findTextNode(dom: Element | Node) {
    if (dom.nodeType === 3) {
      const element = convertTextNodeToElement(dom)
      if (element) {
        elementList.push(element)
      }
    } else if (dom.nodeType === 1) {
      const childNodes = dom.childNodes
      for (let n = 0; n < childNodes.length; n++) {
        const node = childNodes[n]
        // br元素与display:block元素需换行
        if (node.nodeName === 'BR') {
          elementList.push({
            value: '\n'
          })
        } else if (node.nodeName === 'A') {
          const aElement = node as HTMLLinkElement
          const value = aElement.innerText
          if (value) {
            elementList.push({
              type: ElementType.HYPERLINK,
              value: '',
              valueList: [
                {
                  value
                }
              ],
              url: aElement.href
            })
          }
        } else if (/H[1-6]/.test(node.nodeName)) {
          const hElement = node as HTMLTitleElement
          const valueList = getElementListByHTML(
            replaceHTMLElementTag(hElement, 'div').outerHTML,
            options
          )
          elementList.push({
            value: '',
            type: ElementType.TITLE,
            level: titleNodeNameMapping[node.nodeName],
            valueList
          })
          if (
            node.nextSibling &&
            !INLINE_NODE_NAME.includes(node.nextSibling.nodeName)
          ) {
            elementList.push({
              value: '\n'
            })
          }
        } else if (node.nodeName === 'UL' || node.nodeName === 'OL') {
          const listNode = node as HTMLOListElement | HTMLUListElement
          const listElement: IElement = {
            value: '',
            type: ElementType.LIST,
            valueList: []
          }
          if (node.nodeName === 'OL') {
            listElement.listType = ListType.OL
          } else {
            listElement.listType = ListType.UL
            listElement.listStyle = <ListStyle>(
              (<unknown>listNode.style.listStyleType)
            )
          }
          listNode.querySelectorAll('li').forEach(li => {
            const liValueList = getElementListByHTML(li.innerHTML, options)
            liValueList.forEach(list => {
              if (list.value === '\n') {
                list.listWrap = true
              }
            })
            liValueList.unshift({
              value: '\n'
            })
            listElement.valueList!.push(...liValueList)
          })
          elementList.push(listElement)
        } else if (node.nodeName === 'HR') {
          elementList.push({
            value: '\n',
            type: ElementType.SEPARATOR
          })
        } else if (node.nodeName === 'IMG') {
          const { src, width, height } = node as HTMLImageElement
          if (src && width && height) {
            elementList.push({
              width,
              height,
              value: src,
              type: ElementType.IMAGE,
              rowFlex: convertTextAlignToRowFlex(node.parentElement!)
            })
          }
        } else if (node.nodeName === 'VIDEO') {
          const { src, width, height } = node as HTMLVideoElement
          if (src && width && height) {
            elementList.push({
              value: '',
              type: ElementType.BLOCK,
              block: {
                type: BlockType.VIDEO,
                videoBlock: {
                  src
                }
              },
              width,
              height
            })
          }
        } else if (node.nodeName === 'IFRAME') {
          const { src, srcdoc, width, height } = node as HTMLIFrameElement
          if ((src || srcdoc) && width && height) {
            elementList.push({
              value: '',
              type: ElementType.BLOCK,
              block: {
                type: BlockType.IFRAME,
                iframeBlock: {
                  src,
                  srcdoc
                }
              },
              width: parseInt(width),
              height: parseInt(height)
            })
          }
        } else if (node.nodeName === 'TABLE') {
          const tableElement = node as HTMLTableElement
          const element: IElement = {
            type: ElementType.TABLE,
            value: '\n',
            colgroup: [],
            trList: []
          }
          // colgroup
          const colElements = tableElement.querySelectorAll('colgroup col')
          // 基础数据
          tableElement.querySelectorAll('tr').forEach(trElement => {
            const trHeightStr = Number(
              window.getComputedStyle(trElement).height.replace('px', '')
            )
            const tr: ITr = {
              height: trHeightStr,
              minHeight: trHeightStr,
              tdList: []
            }
            trElement.querySelectorAll('th,td').forEach(tdElement => {
              const tableCell = <HTMLTableCellElement>tdElement
              const valueList = getElementListByHTML(
                tableCell.innerHTML,
                options
              )
              const td: ITd = {
                colspan: tableCell.colSpan,
                rowspan: tableCell.rowSpan,
                value: valueList,
                verticalAlign: window.getComputedStyle(tdElement)
                  .verticalAlign as VerticalAlign,
                width: parseFloat(window.getComputedStyle(tdElement).width)
              }
              if (tableCell.style.backgroundColor) {
                td.backgroundColor = tableCell.style.backgroundColor
              }
              tr.tdList.push(td)
            })
            element.trList!.push(tr)
          })
          if (element.trList!.length) {
            // 列选项数据
            const tdCount = element.trList![0].tdList.reduce(
              (pre, cur) => pre + cur.colspan,
              0
            )
            const width = Math.ceil(options.innerWidth / tdCount)
            for (let i = 0; i < tdCount; i++) {
              const colElement = colElements[i]?.getAttribute('width')
              element.colgroup!.push({
                width: colElement ? parseFloat(colElement) : width
              })
            }
            elementList.push(element)
          }
        } else if (
          node.nodeName === 'INPUT' &&
          (<HTMLInputElement>node).type === ControlComponent.CHECKBOX
        ) {
          elementList.push({
            type: ElementType.CHECKBOX,
            value: '',
            checkbox: {
              value: (<HTMLInputElement>node).checked
            }
          })
        } else if (
          node.nodeName === 'INPUT' &&
          (<HTMLInputElement>node).type === ControlComponent.RADIO
        ) {
          elementList.push({
            type: ElementType.RADIO,
            value: '',
            radio: {
              value: (<HTMLInputElement>node).checked
            }
          })
        } else {
          findTextNode(node)
          if (node.nodeType === 1 && n !== childNodes.length - 1) {
            const nodeElement = node as Element
            const display = window.getComputedStyle(nodeElement).display
            if (
              display === 'block' &&
              !/(\n|\r\n)$/.test(nodeElement.textContent!)
            ) {
              elementList.push({
                value: '\n'
              })
            }
          }
        }
      }
    }
  }
  // 追加dom - 使用Shadow DOM隔离外部样式影响
  const clipboardHost = document.createElement('div')
  document.body.appendChild(clipboardHost)
  const shadowRoot = clipboardHost.attachShadow({ mode: 'open' })
  const clipboardDom = document.createElement('div')
  clipboardDom.innerHTML = htmlText
  shadowRoot.appendChild(clipboardDom)
  const deleteNodes: ChildNode[] = []
  clipboardDom.childNodes.forEach(child => {
    if (child.nodeType !== 1 && !child.textContent?.trim()) {
      deleteNodes.push(child)
    }
  })
  deleteNodes.forEach(node => node.remove())
  // 搜索文本节点
  findTextNode(clipboardDom)
  // 移除dom
  clipboardHost.remove()
  return elementList
}

export function getTextFromElementList(elementList: IElement[]) {
  function buildText(payload: IElement[]): string {
    let text = ''
    for (let e = 0; e < payload.length; e++) {
      const element = payload[e]
      // 构造表格
      if (element.type === ElementType.TABLE) {
        text += `\n`
        const trList = element.trList!
        for (let t = 0; t < trList.length; t++) {
          const tr = trList[t]
          for (let d = 0; d < tr.tdList.length; d++) {
            const td = tr.tdList[d]
            const tdText = buildText(zipElementList(td.value!))
            const isFirst = d === 0
            const isLast = tr.tdList.length - 1 === d
            text += `${!isFirst ? `  ` : ``}${tdText}${isLast ? `\n` : ``}`
          }
        }
      } else if (element.type === ElementType.TAB) {
        text += `\t`
      } else if (element.type === ElementType.HYPERLINK) {
        text += element.valueList!.map(v => v.value).join('')
      } else if (element.type === ElementType.TITLE) {
        text += `${buildText(zipElementList(element.valueList!))}`
      } else if (element.type === ElementType.LIST) {
        // 按照换行符拆分
        const zipList = zipElementList(element.valueList!)
        const listElementListMap = splitListElement(zipList)
        // 无序列表前缀
        let ulListStyleText = ''
        if (element.listType === ListType.UL) {
          ulListStyleText =
            ulStyleMapping[<UlStyle>(<unknown>element.listStyle)]
        }
        listElementListMap.forEach((listElementList, listIndex) => {
          const isLast = listElementListMap.size - 1 === listIndex
          text += `${text.endsWith('\n') ? '' : '\n'}${ulListStyleText || `${listIndex + 1}\uFEFF.`}${buildText(
            listElementList
          )}${isLast ? `\n` : ``}`
        })
      } else if (element.type === ElementType.CHECKBOX) {
        text += element.checkbox?.value ? `☑` : `□`
      } else if (element.type === ElementType.RADIO) {
        text += element.radio?.value ? `☉` : `○`
      } else if (
        !element.type ||
        element.type === ElementType.LATEX ||
        TEXTLIKE_ELEMENT_TYPE.includes(element.type)
      ) {
        let textLike = ''
        if (element.type === ElementType.CONTROL) {
          const rawControlValue = element.control!.value
          const controlValue =
            typeof rawControlValue === 'string'
              ? rawControlValue
              : (rawControlValue || []).map(v => v.value).join('')
          textLike = controlValue
            ? `${element.control?.preText || ''}${controlValue}${
                element.control?.postText || ''
              }`
            : ''
        } else if (element.type === ElementType.DATE) {
          textLike = element.valueList?.map(v => v.value).join('') || ''
        } else {
          textLike = element.value
        }
        text += textLike.replace(new RegExp(`${ZERO}`, 'g'), '\n')
      }
    }
    return text
  }
  return buildText(zipElementList(elementList))
}

export function getSlimCloneElementList(elementList: IElement[]) {
  return deepCloneOmitKeys<IElement[], IRowElement>(elementList, [
    'metrics',
    'style'
  ])
}

export function getIsBlockElement(element?: IElement) {
  return (
    !!element?.type &&
    (BLOCK_ELEMENT_TYPE.includes(element.type) ||
      element.imgDisplay === ImageDisplay.INLINE)
  )
}

export function replaceHTMLElementTag(
  oldDom: HTMLElement,
  tagName: keyof HTMLElementTagNameMap
): HTMLElement {
  const newDom = document.createElement(tagName)
  for (let i = 0; i < oldDom.attributes.length; i++) {
    const attr = oldDom.attributes[i]
    newDom.setAttribute(attr.name, attr.value)
  }
  newDom.innerHTML = oldDom.innerHTML
  return newDom
}

export function pickSurroundElementList(elementList: IElement[]) {
  const surroundElementList = []
  for (let e = 0; e < elementList.length; e++) {
    const element = elementList[e]
    if (element.imgDisplay === ImageDisplay.SURROUND) {
      surroundElementList.push(element)
    }
  }
  return surroundElementList
}

export function deleteSurroundElementList(
  elementList: IElement[],
  pageNo: number
) {
  for (let s = elementList.length - 1; s >= 0; s--) {
    const surroundElement = elementList[s]
    if (surroundElement.imgFloatPosition?.pageNo === pageNo) {
      elementList.splice(s, 1)
    }
  }
}

export function getNonHideElementIndex(
  elementList: IElement[],
  index: number,
  position: LocationPosition = LocationPosition.BEFORE,
  isTextMode?: boolean
) {
  const element = elementList[index]

  // 在文本模式下，检查当前元素是否是 PREFIX 或 POSTFIX
  // 如果是，需要跳到前一个或后一个元素
  if (isTextMode &&
    (element?.controlComponent === ControlComponent.PREFIX ||
      element?.controlComponent === ControlComponent.POSTFIX)) {
    let i = index
    if (position === LocationPosition.BEFORE) {
      // 向前查找：找到前一个非 PREFIX/POSTFIX 元素
      i = index - 1
      while (i >= 0) {
        const el = elementList[i]
        if (
          el?.controlComponent !== ControlComponent.PREFIX &&
          el?.controlComponent !== ControlComponent.POSTFIX
        ) {
          return i
        }
        i--
      }
    } else {
      // 向后查找：找到后一个非 PREFIX/POSTFIX 元素
      i = index + 1
      while (i < elementList.length) {
        const el = elementList[i]
        if (
          el?.controlComponent !== ControlComponent.PREFIX &&
          el?.controlComponent !== ControlComponent.POSTFIX
        ) {
          return i
        }
        i++
      }
    }
    // 如果找不到，返回原索引（边界情况）
    return index
  }

  // 非文本模式或当前元素不是 PREFIX/POSTFIX，直接返回原索引
  return index
}

/**
 * 在文本模式下获取非 PREFIX/POSTFIX 元素的索引
 * 用于处理文本模式下光标移动时跳过控件前缀和后缀
 * 只有当 index 指向的元素本身是 PREFIX/POSTFIX 时才进行跳过
 */
export function getTextModeElementIndex(
  elementList: IElement[],
  index: number,
  position: LocationPosition = LocationPosition.BEFORE
) {
  const element = elementList[index]
  // 如果当前元素不是 PREFIX 或 POSTFIX，或者索引越界，直接返回
  if (
    !element ||
    (element.controlComponent !== ControlComponent.PREFIX &&
      element.controlComponent !== ControlComponent.POSTFIX)
  ) {
    return index
  }

  // 当前元素是 PREFIX 或 POSTFIX，根据方向查找最近的非 PREFIX/POSTFIX 元素
  if (position === LocationPosition.BEFORE) {
    // 向前查找
    let i = index - 1
    while (i >= 0) {
      const el = elementList[i]
      if (
        el &&
        el.controlComponent !== ControlComponent.PREFIX &&
        el.controlComponent !== ControlComponent.POSTFIX
      ) {
        return i
      }
      i--
    }
    return index // 没有找到，返回原索引
  } else {
    // 向后查找
    let i = index + 1
    while (i < elementList.length) {
      const el = elementList[i]
      if (
        el &&
        el.controlComponent !== ControlComponent.PREFIX &&
        el.controlComponent !== ControlComponent.POSTFIX
      ) {
        return i
      }
      i++
    }
    return index // 没有找到，返回原索引
  }
}

/**
 * 检查控件是否已无 VALUE 元素，若是则从 elementList 中移除整个控件
 * 用于文本模式下删除最后一个字符后清理 PREFIX/POSTFIX/PLACEHOLDER
 * @param elementList 元素列表
 * @param controlId 要检查的控件 ID
 * @param spliceFn 删除元素列表片段的函数
 * @returns 移除的起始索引，若未移除则返回 null
 */
export function removeControlIfEmpty(
  elementList: IElement[],
  controlId: string,
  spliceFn: (elementList: IElement[], startIndex: number, count: number) => void
): number | null {
  // 查找控件范围并检查是否还有 VALUE 元素
  let startIndex = -1
  let endIndex = -1
  let hasValue = false

  for (let i = 0; i < elementList.length; i++) {
    const el = elementList[i]
    if (el.controlId === controlId) {
      if (startIndex === -1) startIndex = i
      endIndex = i + 1
      if (el.controlComponent === ControlComponent.VALUE) {
        hasValue = true
      }
    } else if (startIndex !== -1) {
      // 已遍历完该控件范围
      break
    }
  }

  if (!hasValue && startIndex !== -1 && endIndex !== -1) {
    spliceFn(elementList, startIndex, endIndex - startIndex)
    return startIndex
  }
  return null
}
