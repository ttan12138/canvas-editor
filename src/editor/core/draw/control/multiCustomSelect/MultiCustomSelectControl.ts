import {
  EDITOR_COMPONENT,
  EDITOR_PREFIX
} from '../../../../dataset/constant/Editor'
import {
  CONTROL_STYLE_ATTR,
  EDITOR_ELEMENT_STYLE_ATTR,
  TEXTLIKE_ELEMENT_TYPE
} from '../../../../dataset/constant/Element'
import { ControlComponent, ControlType } from '../../../../dataset/enum/Control'
import {
  ControlRenderMode,
  EditorComponent
} from '../../../../dataset/enum/Editor'
import { ElementType } from '../../../../dataset/enum/Element'
import { KeyMap } from '../../../../dataset/enum/KeyMap'
import { DeepRequired } from '../../../../interface/Common'
import {
  IControlContext,
  IControlInstance,
  IControlRuleOption,
  IControlSelectValue,
  IValueSet
} from '../../../../interface/Control'
import { IEditorOption } from '../../../../interface/Editor'
import { IElement } from '../../../../interface/Element'
import {
  deepClone,
  isArrayEqual,
  isNonValue,
  omitObject,
  pickObject,
  splitText
} from '../../../../utils'
import {
  applyTextDiffToStructSegments,
  formatElementContext,
  inferMultiSelectDelimiter
} from '../../../../utils/element'
import { detectMultiUnitPattern } from '../../../../utils/unitParser'
import { Draw } from '../../Draw'
import { Control } from '../Control'
import { AssociationStateManager } from '../association/AssociationStateManager'
function hex16toRgba(hex: string, alpha: number = 1): string {
  return `rgba(${hex.slice(1, 3)}, ${hex.slice(3, 5)}, ${hex.slice(5, 7)}, ${hex.slice(7, 16)}, ${alpha})`
}
export class MultiCustomSelectControl implements IControlInstance {
  private draw: Draw
  private element: IElement
  private control: Control
  private isPopup: boolean
  private selectDom: HTMLDivElement | null
  private options: DeepRequired<IEditorOption>
  private DEFAULT_MULTI_SELECT_DELIMITER = ','
  private stateManager: AssociationStateManager
  private valueSetCache: Map<string, Map<string, IValueSet>> = new Map()

  constructor(element: IElement, control: Control) {
    const draw = control.getDraw()
    this.draw = draw
    this.options = draw.getOptions()
    this.element = element
    this.control = control
    this.isPopup = false
    this.selectDom = null
    this.stateManager = AssociationStateManager.getInstance()
  }

  public setElement(element: IElement) {
    this.element = element
  }

  public getElement(): IElement {
    return this.element
  }

  public getIsPopup(): boolean {
    return this.isPopup
  }

  public getCodes(): string[] {
    if (!this.element?.control?.code) return []
    const delimiter = this.getEffectiveDelimiter()
    return this.element.control.code.split(delimiter)
  }

  private getValueSetMap(): Map<string, IValueSet> | null {
    const control = this.element?.control
    if (!control?.valueSets?.length) return null
    const controlId = this.element.controlId || ''
    if (!controlId) return null
    let cacheMap = this.valueSetCache.get(controlId)
    if (!cacheMap) {
      cacheMap = new Map()
      for (const valueSet of control.valueSets) {
        cacheMap.set(valueSet.code, valueSet)
      }
      this.valueSetCache.set(controlId, cacheMap)
    }
    return cacheMap
  }

  // 获取有效的多选分隔符：优先显式设置，否则从 code 与 valueSets 推断并回写
  private getEffectiveDelimiter(): string {
    const control = this.element?.control
    if (!control) return this.DEFAULT_MULTI_SELECT_DELIMITER
    const delimiter = inferMultiSelectDelimiter(
      control.code,
      control.valueSets,
      control.multiSelectDelimiter
    )
    // 回写以保证后续取值一致性
    if (control.multiSelectDelimiter !== delimiter) {
      control.multiSelectDelimiter = delimiter
    }
    return delimiter
  }

  public getText(codes: string[]): string | null {
    if (!this.element?.control) return null
    const control = this.element.control
    if (!control.valueSets?.length) return null
    const multiSelectDelimiter = this.getEffectiveDelimiter()
    const valueSetMap = this.getValueSetMap()
    const valueList: string[] = []
    codes.forEach(code => {
      const valueSet = valueSetMap?.get(code)
      if (valueSet && !isNonValue(valueSet.value)) {
        valueList.push(valueSet.value)
      }
    })
    return valueList.join(multiSelectDelimiter) || null
  }

  public getValue(context: IControlContext = {}): IElement[] {
    const elementList = context.elementList || this.control.getElementList()
    const range = context.range || this.control.getRange()
    const data: IElement[] = []
    const startElement = elementList[range.startIndex]
    // 向左查找
    let preIndex = range.startIndex
    while (preIndex > 0) {
      const preElement = elementList[preIndex]
      if (
        preElement.controlId !== startElement.controlId ||
        preElement.controlComponent === ControlComponent.PREFIX ||
        preElement.controlComponent === ControlComponent.PRE_TEXT
      ) {
        break
      }
      if (preElement.controlComponent === ControlComponent.VALUE) {
        data.unshift(preElement)
      }
      preIndex--
    }
    // 向右查找
    let nextIndex = range.startIndex + 1
    while (nextIndex < elementList.length) {
      const nextElement = elementList[nextIndex]
      if (
        nextElement.controlId !== startElement.controlId ||
        nextElement.controlComponent === ControlComponent.POSTFIX ||
        nextElement.controlComponent === ControlComponent.POST_TEXT
      ) {
        break
      }
      if (nextElement.controlComponent === ControlComponent.VALUE) {
        data.push(nextElement)
      }
      nextIndex++
    }
    return data
  }

  public getHTML(): string {
    const valueElementList = this.getValue()
    if (!valueElementList.length) return ''
    return valueElementList
      .map(element => {
        if (element.type === ElementType.TEXT) {
          return element.value || ''
        }
        return ''
      })
      .join('')
  }

  // 依据选中 codes 重建 values（优先保留已有选项的 structValues）
  private buildValuesFromCodes(codes: string[]): IControlSelectValue[] {
    const control = this.element.control!
    const valueSets = control.valueSets || []
    const existingValues = control.values || []
    const values: IControlSelectValue[] = []
    codes.forEach(code => {
      if (!code) return
      const existing = existingValues.find(v => v.code === code)
      if (existing) {
        values.push({ ...existing })
        return
      }
      const valueSet = valueSets.find(v => v.code === code)
      if (valueSet) {
        values.push({ value: valueSet.value, code: valueSet.code })
      }
    })
    return values
  }

  // 文本模式编辑后，将 VALUE 元素列表中的文字同步回每个选项的 value / structValues
  // 保持数据一致性：
  // - 选项数量未变：按索引逐选项同步内部字符（保留 code 与 structValues 引用及属性）
  // - 选项数量变化（增/删）：依据文字匹配重建选项，尽量保留原有 code 与 structValues，
  //   避免按分隔符索引错位导致 value 与 code 错配
  public syncValueWithStructValues(context: IControlContext = {}) {
    const control = this.element.control
    if (!control || !control.values?.length) return
    const delimiter = this.getEffectiveDelimiter()
    const newText = this.getValue(context)
      .map(el => el.value)
      .join('')
    // 控件已清空：移除所有选项
    if (!newText) {
      this.control.setControlProperties({ values: [], value: null }, context)
      return
    }
    // 旧文本：选项有 structValues 时用其文字，否则用 value 字段
    const oldValues = control.values
    const getOptionText = (v: IControlSelectValue) =>
      v.structValues?.length
        ? v.structValues.map(s => s.value).join('')
        : v.value
    const oldParts = oldValues.map(getOptionText)
    const oldText = oldParts.join(delimiter)
    if (newText === oldText) return
    const newParts = newText.split(delimiter)
    const newValues: IControlSelectValue[] = []
    if (newParts.length === oldParts.length) {
      // 选项数量未变：按索引逐选项同步内部字符（保留 code 与 structValues 引用）
      newParts.forEach((partText, i) => {
        const oldOption = oldValues[i]
        const newOption: IControlSelectValue = { ...oldOption, value: partText }
        if (oldOption.structValues?.length) {
          const synced = applyTextDiffToStructSegments(
            oldOption.structValues,
            oldParts[i],
            partText
          )
          // 移除 value 为空的 structValue 片段，保持数据一致性
          newOption.structValues = synced.filter(sv => sv.value)
        }
        newValues.push(newOption)
      })
    } else {
      // 选项数量变化（增/删）：依据文字匹配重建选项，尽量保留原有 code 与 structValues
      newParts.forEach(partText => {
        const matchedOld = oldValues.find(v => getOptionText(v) === partText)
        if (matchedOld) {
          const newOption: IControlSelectValue = {
            ...matchedOld,
            value: partText
          }
          if (matchedOld.structValues?.length) {
            const synced = applyTextDiffToStructSegments(
              matchedOld.structValues,
              getOptionText(matchedOld),
              partText
            )
            // 移除 value 为空的 structValue 片段，保持数据一致性
            newOption.structValues = synced.filter(sv => sv.value)
          }
          newValues.push(newOption)
          return
        }
        const matchedValueSet = (control.valueSets || []).find(
          vs => vs.value === partText
        )
        if (matchedValueSet) {
          newValues.push({
            value: matchedValueSet.value,
            code: matchedValueSet.code
          })
          return
        }
        // 自由文本新增项（无匹配 code）
        newValues.push({ value: partText, code: '' })
      })
    }
    const code =
      newValues
        .map(v => v.code)
        .filter(Boolean)
        .join(delimiter) || null
    this.control.setControlProperties(
      { values: newValues, value: null, code },
      context
    )
  }

  public setValue(
    data: IElement[],
    context: IControlContext = {},
    options: IControlRuleOption = {}
  ): number {
    if (
      !options.isIgnoreDisabledRule &&
      this.control.getIsDisabledControl(context)
    ) {
      return -1
    }
    const elementList = context.elementList || this.control.getElementList()
    const range = context.range || this.control.getRange()
    this.control.shrinkBoundary(context)
    const { startIndex, endIndex } = range
    const draw = this.control.getDraw()
    if (startIndex !== endIndex) {
      draw.spliceElementList(elementList, startIndex + 1, endIndex - startIndex)
    } else {
      this.control.removePlaceholder(startIndex, context)
    }
    const startElement = elementList[startIndex]
    const anchorElement =
      (startElement.type &&
        !TEXTLIKE_ELEMENT_TYPE.includes(startElement.type)) ||
      startElement.controlComponent === ControlComponent.PREFIX ||
      startElement.controlComponent === ControlComponent.PRE_TEXT
        ? pickObject(startElement, [
            'control',
            'controlId',
            ...CONTROL_STYLE_ATTR
          ])
        : omitObject(startElement, ['type'])
    // 将多字符元素拆为单字符元素（粘贴数据可能来自zipElementList压缩）
    const splitData: IElement[] = []
    for (const item of data) {
      const charList = splitText(item.value)
      for (const char of charList) {
        splitData.push({ ...item, value: char })
      }
    }
    const start = range.startIndex + 1
    for (let i = 0; i < splitData.length; i++) {
      const newElement: IElement = {
        ...anchorElement,
        ...splitData[i],
        controlComponent: ControlComponent.VALUE,
        color: this.options.selector.multiSelectValueColor
      }
      formatElementContext(elementList, [newElement], startIndex, {
        editorOptions: this.options
      })
      draw.spliceElementList(elementList, start + i, 0, [newElement])
    }
    // 同步 value / structValues，保持数据一致性
    this.syncValueWithStructValues({ elementList, range })
    return start + data.length - 1
  }

  public keydown(evt: KeyboardEvent): number | null {
    if (this.control.getIsDisabledControl()) {
      return null
    }
    const elementList = this.control.getElementList()
    const range = this.control.getRange()
    this.control.shrinkBoundary()
    const { startIndex, endIndex } = range
    const startElement = elementList[startIndex]
    const endElement = elementList[endIndex]
    if (evt.key === KeyMap.Backspace) {
      if (startIndex !== endIndex) {
        this.draw.spliceElementList(
          elementList,
          startIndex + 1,
          endIndex - startIndex
        )
        const value = this.getValue()
        if (!value.length) {
          this.control.addPlaceholder(startIndex)
        }
        // 同步 value / structValues，保持数据一致性
        this.syncValueWithStructValues()
        return startIndex
      } else {
        if (
          startElement.controlComponent === ControlComponent.PREFIX ||
          startElement.controlComponent === ControlComponent.PRE_TEXT ||
          endElement.controlComponent === ControlComponent.POSTFIX ||
          endElement.controlComponent === ControlComponent.POST_TEXT ||
          startElement.controlComponent === ControlComponent.PLACEHOLDER
        ) {
          return this.control.removeControl(startIndex)
        } else {
          this.draw.spliceElementList(elementList, startIndex, 1)
          const value = this.getValue()
          if (!value.length) {
            this.control.addPlaceholder(startIndex - 1)
          }
          // 同步 value / structValues，保持数据一致性
          this.syncValueWithStructValues()
          return startIndex - 1
        }
      }
    } else if (evt.key === KeyMap.Delete) {
      if (startIndex !== endIndex) {
        this.draw.spliceElementList(
          elementList,
          startIndex + 1,
          endIndex - startIndex
        )
        const value = this.getValue()
        if (!value.length) {
          this.control.addPlaceholder(startIndex)
        }
        // 同步 value / structValues，保持数据一致性
        this.syncValueWithStructValues()
        return startIndex
      } else {
        const endNextElement = elementList[endIndex + 1]
        if (
          ((startElement.controlComponent === ControlComponent.PREFIX ||
            startElement.controlComponent === ControlComponent.PRE_TEXT) &&
            endNextElement.controlComponent === ControlComponent.PLACEHOLDER) ||
          endNextElement.controlComponent === ControlComponent.POSTFIX ||
          endNextElement.controlComponent === ControlComponent.POST_TEXT ||
          startElement.controlComponent === ControlComponent.PLACEHOLDER
        ) {
          return this.control.removeControl(startIndex)
        } else {
          this.draw.spliceElementList(elementList, startIndex + 1, 1)
          const value = this.getValue()
          if (!value.length) {
            this.control.addPlaceholder(startIndex)
          }
          // 同步 value / structValues，保持数据一致性
          this.syncValueWithStructValues()
          return startIndex
        }
      }
    }
    return endIndex
  }

  public cut(): number {
    if (this.control.getIsDisabledControl()) {
      return -1
    }
    this.control.shrinkBoundary()
    const { startIndex, endIndex } = this.control.getRange()
    if (startIndex === endIndex) {
      return startIndex
    }
    return this.clearSelect()
  }

  public clearSelect(
    context: IControlContext = {},
    options: IControlRuleOption = {}
  ): number {
    const { isIgnoreDisabledRule = false, isAddPlaceholder = true } = options
    if (!isIgnoreDisabledRule && this.control.getIsDisabledControl(context)) {
      return -1
    }
    const elementList = context.elementList || this.control.getElementList()
    const { startIndex } = context.range || this.control.getRange()
    const startElement = elementList[startIndex]
    let leftIndex = -1
    let rightIndex = -1
    let preIndex = startIndex
    while (preIndex > 0) {
      const preElement = elementList[preIndex]
      if (
        preElement.controlId !== startElement.controlId ||
        preElement.controlComponent === ControlComponent.PREFIX ||
        preElement.controlComponent === ControlComponent.PRE_TEXT
      ) {
        leftIndex = preIndex
        break
      }
      preIndex--
    }
    let nextIndex = startIndex + 1
    while (nextIndex < elementList.length) {
      const nextElement = elementList[nextIndex]
      if (
        nextElement.controlId !== startElement.controlId ||
        nextElement.controlComponent === ControlComponent.POSTFIX ||
        nextElement.controlComponent === ControlComponent.POST_TEXT
      ) {
        rightIndex = nextIndex - 1
        break
      }
      nextIndex++
    }
    if (!~leftIndex || !~rightIndex) return -1
    const draw = this.control.getDraw()
    draw.spliceElementList(
      elementList,
      leftIndex + 1,
      rightIndex - leftIndex,
      [],
      {
        isIgnoreDeletedRule: options.isIgnoreDeletedRule
      }
    )
    if (isAddPlaceholder) {
      this.control.addPlaceholder(preIndex, context)
    }
    this.control.setControlProperties(
      {
        code: null,
        value: null,
        values: []
      },
      {
        elementList,
        range: { startIndex: preIndex, endIndex: preIndex }
      }
    )
    return preIndex
  }

  public setSelect(
    code: string,
    context: IControlContext = {},
    options: IControlRuleOption = {}
  ) {
    if (
      !options.isIgnoreDisabledRule &&
      this.control.getIsDisabledControl(context)
    ) {
      return
    }
    const elementList = context.elementList || this.control.getElementList()
    const range = context.range || this.control.getRange()
    const control = this.element.control!
    // 使用当前有效的分隔符（可从 code 推断），而不是固定的 VALUE_DELIMITER
    const delimiter = this.getEffectiveDelimiter()
    const newCodes = code?.split(delimiter) || []
    const oldCode = control.code
    const oldCodes = control.code?.split(delimiter) || []
    if (isArrayEqual(oldCodes, newCodes) && !options.isForceUpdate) {
      this.control.repaintControl({
        curIndex: range.startIndex,
        isCompute: false,
        isSubmitHistory: false
      })
      this.destroy()
      return
    }
    const valueSets = control.valueSets
    if (!Array.isArray(valueSets) || !valueSets.length) return
    // 依据选中 codes 重建 values（保留已有的 structValues），并据其拼接渲染文本
    const values = this.buildValuesFromCodes(newCodes)
    const text = values.map(v => v.value).join(delimiter) || null
    if (!text) {
      if (oldCode) {
        const prefixIndex = this.clearSelect(context, {
          isIgnoreDeletedRule: options.isIgnoreDeletedRule
        })
        if (~prefixIndex) {
          this.control.repaintControl({
            curIndex: prefixIndex,
            isSetCursor: options.isSyncAssociation !== false
          })
          this.control.emitControlContentChange({
            controlValue: []
          })
        }
      }
      return
    }
    const valueElement = this.getValue(context)[0]
    const styleElement = valueElement
      ? pickObject(valueElement, EDITOR_ELEMENT_STYLE_ATTR)
      : pickObject(elementList[range.startIndex], CONTROL_STYLE_ATTR)
    const prefixIndex = this.clearSelect(context, {
      isAddPlaceholder: false,
      isIgnoreDeletedRule: options.isIgnoreDeletedRule
    })
    if (!~prefixIndex) return
    if (!oldCode) {
      this.control.removePlaceholder(prefixIndex, context)
    }
    const propertyElement = omitObject(
      elementList[prefixIndex],
      EDITOR_ELEMENT_STYLE_ATTR
    )
    const start = prefixIndex + 1
    const draw = this.control.getDraw()
    // 按选项逐段生成 VALUE 元素：选项有 structValues 时优先渲染片段（保留 groupIds、underline、highlight 等属性），
    // 否则渲染整个 value 字段；选项间插入分隔符元素。与 formatElementList 渲染方式保持一致。
    const valueElements: IElement[] = []
    values.forEach((optionValue, optionIndex) => {
      if (optionIndex > 0 && delimiter) {
        const delimiterStrList = splitText(delimiter)
        delimiterStrList.forEach(d => {
          valueElements.push({
            ...styleElement,
            ...propertyElement,
            type: ElementType.TEXT,
            value: d,
            controlComponent: ControlComponent.VALUE,
            color: this.options.control.selectValueColor
          })
        })
      }
      if (optionValue.structValues?.length) {
        optionValue.structValues.forEach(sv => {
          if (!sv.value) return
          valueElements.push({
            ...styleElement,
            ...propertyElement,
            ...deepClone(sv),
            type: ElementType.TEXT,
            controlComponent: ControlComponent.VALUE,
            color: this.options.control.selectValueColor
          })
        })
      } else {
        // 无 structValues：按字符拆分渲染，确保光标可在字符间切换、可在选项内容内逐字修改
        const charList = splitText(optionValue.value)
        charList.forEach(char => {
          valueElements.push({
            ...styleElement,
            ...propertyElement,
            type: ElementType.TEXT,
            value: char,
            controlComponent: ControlComponent.VALUE,
            color: this.options.control.selectValueColor
          })
        })
      }
    })
    for (let i = 0; i < valueElements.length; i++) {
      const newElement = valueElements[i]
      formatElementContext(elementList, [newElement], prefixIndex, {
        editorOptions: this.options
      })
      draw.spliceElementList(elementList, start + i, 0, [newElement])
    }
    this.control.setControlProperties(
      {
        code,
        values,
        value: null
      },
      {
        elementList,
        range: { startIndex: prefixIndex, endIndex: prefixIndex }
      }
    )
    const newIndex = start + valueElements.length - 1
    this.control.repaintControl({
      curIndex: newIndex,
      isSetCursor: options.isSyncAssociation !== false,
      // 实时更新（oninput）不污染撤销历史
      isSubmitHistory: !options.isSkipDestroy
    })
    this.control.emitControlContentChange({
      context
    })
    // 实时更新（如下拉面板内输入框 oninput）时保留已打开的弹窗
    if (!options.isSkipDestroy) {
      this.destroy()
    }

    // 设置光标到控件末尾（仅用户主动操作场景）
    if (options.isSyncAssociation !== false) {
      const draw = this.control.getDraw()
      const rangeManager = draw.getRange()
      // 找到控件末尾位置（POSTFIX 后面）
      let endIndex = newIndex
      const curElementList =
        context.elementList || this.control.getElementList()
      while (endIndex < curElementList.length - 1) {
        const nextElement = curElementList[endIndex + 1]
        if (nextElement.controlId === this.element.controlId) {
          endIndex++
        } else {
          break
        }
      }
      rangeManager.setRange(endIndex, endIndex)
    }

    const associationId = control.associationId
    if (
      associationId &&
      this.element.controlId &&
      options.isSyncAssociation !== false
    ) {
      this.stateManager.setValue(
        associationId,
        code,
        ControlType.MULTI_CUSTOM_SELECT,
        this.draw,
        this.element.controlId,
        this.getEffectiveDelimiter(),
        control.valueSets
      )
    }
  }

  private _createSelectPopupDom() {
    const control = this.element.control!
    const valueSets = control.valueSets
    if (!Array.isArray(valueSets) || !valueSets.length) return
    const position = this.control.getPosition()
    if (!position) return

    const selectPopupContainer = document.createElement('div')
    selectPopupContainer.classList.add(`${EDITOR_PREFIX}-select-control-popup`)
    selectPopupContainer.setAttribute(EDITOR_COMPONENT, EditorComponent.POPUP)
    // 阻止 mousedown/click 冒泡至 document，避免编辑器全局失焦逻辑/宿主页面的全局点击处理销毁弹窗，
    // 保证弹窗内数值输入框可正常聚焦
    selectPopupContainer.addEventListener('mousedown', e => {
      // 记录本次按下是否发生在数值输入框上：click 的 target 是 mousedown/mouseup 的公共祖先，
      // 按下在 input、抬起在父容器时 click target 会变成 SPAN，需借此标志识别
      ;(selectPopupContainer as any).__ceMousedownOnInput = !!(
        e.target as HTMLElement
      ).closest?.('input')
      e.stopPropagation()
    })
    selectPopupContainer.addEventListener('click', e => {
      e.stopPropagation()
    })
    selectPopupContainer.style.display = 'flex'
    selectPopupContainer.style.flexDirection = 'column'
    selectPopupContainer.style.minWidth = '400px'

    const ul = document.createElement('ul')
    ul.style.flex = '1'
    ul.style.overflowY = 'auto'
    ul.style.maxHeight = '300px'
    ul.style.margin = '0'
    ul.style.padding = '0'

    const selectedCodes = new Set(this.getCodes())
    const checkboxMap = new Map<
      string,
      { li: HTMLLIElement; checkbox: HTMLSpanElement }
    >()
    const inputValues = new Map<string, string>()
    const inputElements = new Map<string, HTMLInputElement[]>()

    for (let v = 0; v < valueSets.length; v++) {
      const valueSet = valueSets[v]
      const li = document.createElement('li')
      li.style.display = 'flex'
      li.style.alignItems = 'flex-start'
      li.style.padding = '0px 6px'
      li.style.cursor = 'pointer'
      li.style.listStyle = 'none'
      li.style.minHeight = '28px'
      li.style.lineHeight = '28px'
      li.style.flexWrap = 'wrap'
      li.style.wordBreak = 'break-word'
      li.style.overflowWrap = 'break-word'
      li.style.height = 'auto'

      const checkboxWrapper = document.createElement('span')
      checkboxWrapper.style.display = 'inline-flex'
      checkboxWrapper.style.alignItems = 'center'
      checkboxWrapper.style.marginRight = '8px'
      checkboxWrapper.style.flexShrink = '0'

      const checkbox = document.createElement('span')
      checkbox.style.display = 'inline-block'
      checkbox.style.width = '16px'
      checkbox.style.height = '16px'
      checkbox.style.border = '1px solid #DCDFE6'
      checkbox.style.borderRadius = '2px'
      checkbox.style.position = 'relative'
      checkbox.style.boxSizing = 'border-box'
      checkbox.style.flexShrink = '0'
      checkbox.style.transition = 'all 0.2s'
      checkbox.style.marginTop = '3px'

      const isChecked = selectedCodes.has(valueSet.code)
      if (isChecked) {
        checkbox.style.backgroundColor =
          'var(--ce-selector-checkbox-bg, #409EFF)'
        checkbox.style.borderColor =
          'var(--ce-selector-checkbox-border, #409EFF)'
        const checkmark = document.createElement('span')
        checkmark.style.position = 'absolute'
        checkmark.style.left = '4px'
        checkmark.style.top = '2px'
        checkmark.style.width = '6px'
        checkmark.style.height = '10px'
        checkmark.style.border = 'solid var(--ce-selector-checkbox-mark, white)'
        checkmark.style.borderWidth = '0 2px 2px 0'
        checkmark.style.transform = 'rotate(45deg)'
        checkmark.style.boxSizing = 'content-box'
        checkbox.appendChild(checkmark)
        li.classList.add('active')
      }

      checkboxWrapper.appendChild(checkbox)
      li.appendChild(checkboxWrapper)

      const multiUnitMatch = detectMultiUnitPattern(valueSet.value)

      if (
        multiUnitMatch &&
        multiUnitMatch.parts.some(p => p.type === 'input')
      ) {
        const contentContainer = document.createElement('span')
        contentContainer.style.display = 'flex'
        contentContainer.style.alignItems = 'center'
        contentContainer.style.flexWrap = 'wrap'
        contentContainer.style.flex = '1'
        contentContainer.style.lineHeight = '1.8'
        contentContainer.style.wordBreak = 'break-word'

        // 用于跟踪输入框索引
        let inputIndex = 0

        multiUnitMatch.parts.forEach(part => {
          if (part.type === 'text') {
            // 文本部分
            const textSpan = document.createElement('span')
            textSpan.textContent = part.text || ''
            textSpan.style.whiteSpace = 'pre-wrap'
            textSpan.style.wordBreak = 'break-word'
            textSpan.style.marginRight = '2px'
            contentContainer.appendChild(textSpan)
          } else if (part.type === 'input') {
            // 输入框部分
            const input = document.createElement('input')
            input.type = 'text'
            input.style.width = 'auto'
            input.style.minWidth = '60px'
            input.style.height = '24px'
            input.style.borderWidth = '0 0 1px 0'
            input.style.borderRadius = '0px'
            input.style.padding = '0 6px'
            input.style.fontSize = '14px'
            input.style.margin = '0 2px'
            input.style.outline = 'none'
            input.style.textAlign = 'center'

            // 获取初始值
            const inputKey = `${valueSet.code}_${inputIndex}`
            let initialValue = inputValues.get(inputKey)
            if (!initialValue && part.value) {
              initialValue = part.value
            }
            input.value = initialValue || ''
            input.placeholder = ''

            input.onfocus = () => {
              input.style.boxShadow = `0 0 0 2px ${hex16toRgba(this.options.selector.activeOptionColor, 0.2)}`
              this.showHint(selectPopupContainer)
            }

            input.onblur = () => {
              input.style.boxShadow = 'none'
            }

            input.onkeydown = e => {
              e.stopPropagation()
              if (e.key === KeyMap.TAB) {
                e.preventDefault()
                this.navigateToNextInput(selectPopupContainer, input)
              } else if (e.key === KeyMap.ESC) {
                e.preventDefault()
                input.blur()
                this.hideHint(selectPopupContainer)
              } else if (e.key === KeyMap.Enter) {
                e.preventDefault()
                input.blur()
                this.hideHint(selectPopupContainer)
                const isCurrentlyChecked = selectedCodes.has(valueSet.code)
                if (isCurrentlyChecked) {
                  selectedCodes.delete(valueSet.code)
                  checkbox.style.backgroundColor = ''
                  checkbox.style.borderColor =
                    'var(--ce-selector-checkbox-border, #DCDFE6)'
                  const checkmark = checkbox.querySelector('span')
                  if (checkmark) checkmark.remove()
                  li.classList.remove('active')
                } else {
                  selectedCodes.add(valueSet.code)
                  checkbox.style.backgroundColor =
                    'var(--ce-selector-checkbox-bg, #409EFF)'
                  checkbox.style.borderColor =
                    'var(--ce-selector-checkbox-border, #409EFF)'
                  const checkmark = document.createElement('span')
                  checkmark.style.position = 'absolute'
                  checkmark.style.left = '4px'
                  checkmark.style.top = '0px'
                  checkmark.style.width = '6px'
                  checkmark.style.height = '10px'
                  checkmark.style.border =
                    'solid var(--ce-selector-checkbox-mark, white)'
                  checkmark.style.borderWidth = '0 2px 2px 0'
                  checkmark.style.transform = 'rotate(45deg)'
                  checkmark.style.boxSizing = 'content-box'
                  checkbox.appendChild(checkmark)
                  li.classList.add('active')
                }
              }
            }

            input.oninput = () => {
              // 只允许数字、负号、±和小数点
              let value = input.value
              // let lastValidValue = inputValues.get(inputKey) || ''

              // 移除所有不允许的字符
              value = value.replace(/[^\d.\-±]/g, '')

              // 处理负号和±：只能出现在开头，且只能有一个
              let prefix = ''
              if (value.startsWith('±')) {
                prefix = '±'
                value = value.substring(1)
              } else if (value.startsWith('-')) {
                prefix = '-'
                value = value.substring(1)
              }
              // 移除剩余的负号和±
              value = value.replace(/[\-±]/g, '')

              // 处理小数点：只能有一个
              const parts = value.split('.')
              if (parts.length > 2) {
                value = parts[0] + '.' + parts.slice(1).join('')
              }

              // 组合最终值
              value = prefix + value

              // 更新输入框值
              if (input.value !== value) {
                input.value = value
              }
              inputValues.set(inputKey, value)

              // 动态调整 input 宽度
              this.adjustInputWidth(input)

              // 实时将已选选项的输入框值渲染到正文（不关闭弹窗、不提交历史）
              this.setSelectWithInputValues(
                Array.from(selectedCodes),
                inputValues,
                this.getEffectiveDelimiter(),
                true,
                true
              )
            }

            // 将输入框存储到 inputElements Map
            if (!inputElements.has(valueSet.code)) {
              inputElements.set(valueSet.code, [])
            }
            inputElements.get(valueSet.code)!.push(input)

            contentContainer.appendChild(input)

            // 初始化 input 宽度
            this.adjustInputWidth(input)

            inputIndex++

            // 添加单位文本
            if (part.unit) {
              const unitSpan = document.createElement('span')
              unitSpan.textContent = part.unit
              unitSpan.style.whiteSpace = 'pre-wrap'
              unitSpan.style.wordBreak = 'break-word'
              unitSpan.style.marginRight = '2px'
              contentContainer.appendChild(unitSpan)
            }
          }
        })

        li.appendChild(contentContainer)
      } else {
        const textSpan = document.createElement('span')
        textSpan.textContent = valueSet.value
        textSpan.style.flex = '1'
        textSpan.style.lineHeight = '1.8'
        textSpan.style.wordBreak = 'break-word'
        textSpan.style.whiteSpace = 'pre-wrap'
        li.appendChild(textSpan)
      }

      li.onmouseenter = () => {
        li.style.backgroundColor = 'var(--ce-selector-option-hover-bg, #EEF2FD)'
      }
      li.onmouseleave = () => {
        li.style.backgroundColor = ''
      }

      li.onclick = e => {
        // click target 可能是 input 的父容器（mousedown 在 input、mouseup 在容器时公共祖先为 SPAN），
        // 仅判断 tagName === 'INPUT' 会误放行，导致点击输入框时触发选中并销毁弹窗
        const isInputInteraction =
          (e.target as HTMLElement).tagName === 'INPUT' ||
          (selectPopupContainer as any).__ceMousedownOnInput === true
        if (isInputInteraction) {
          return
        }

        const hasInput =
          inputElements.has(valueSet.code) &&
          inputElements.get(valueSet.code)!.length > 0
        if (hasInput) {
          const inputs = inputElements.get(valueSet.code)!
          inputs.forEach(input => input.blur())
          this.hideHint(selectPopupContainer)
        }

        e.stopPropagation()
        const isCurrentlyChecked = selectedCodes.has(valueSet.code)
        if (isCurrentlyChecked) {
          selectedCodes.delete(valueSet.code)
          checkbox.style.backgroundColor = ''
          checkbox.style.borderColor =
            'var(--ce-selector-checkbox-border, #DCDFE6)'
          const checkmark = checkbox.querySelector('span')
          if (checkmark) checkmark.remove()
          li.classList.remove('active')
        } else {
          selectedCodes.add(valueSet.code)
          checkbox.style.backgroundColor =
            'var(--ce-selector-checkbox-bg, #409EFF)'
          checkbox.style.borderColor =
            'var(--ce-selector-checkbox-border, #409EFF)'
          const checkmark = document.createElement('span')
          checkmark.style.position = 'absolute'
          checkmark.style.left = '4px'
          checkmark.style.top = '0px'
          checkmark.style.width = '6px'
          checkmark.style.height = '10px'
          checkmark.style.border =
            'solid var(--ce-selector-checkbox-mark, white)'
          checkmark.style.borderWidth = '0 2px 2px 0'
          checkmark.style.transform = 'rotate(45deg)'
          checkmark.style.boxSizing = 'content-box'
          checkbox.appendChild(checkmark)
          li.classList.add('active')
        }
      }

      checkboxMap.set(valueSet.code, { li, checkbox })

      // 选项右侧“移除”按钮：从 valueSets 删除该项
      this._appendRemoveOptionBtn(li, valueSet!.code)

      ul.append(li)
    }
    selectPopupContainer.append(ul)

    // “添加选项”按钮：用于动态追加额外选项
    this._appendAddOptionBar(selectPopupContainer)

    const divider = document.createElement('div')
    divider.style.height = '1px'
    divider.style.backgroundColor = '#EBEEF5'
    divider.style.margin = '0'
    selectPopupContainer.append(divider)

    const bottomBar = document.createElement('div')
    bottomBar.style.display = 'flex'
    bottomBar.style.alignItems = 'center'
    bottomBar.style.justifyContent = 'space-between'
    bottomBar.style.padding = '0px 6px'
    bottomBar.style.gap = '12px'

    const delimiterContainer = document.createElement('div')
    delimiterContainer.style.display = 'flex'
    delimiterContainer.style.alignItems = 'center'
    delimiterContainer.style.gap = '6px'

    const delimiterLabel = document.createElement('span')
    delimiterLabel.textContent = ''
    delimiterLabel.style.fontSize = '12px'
    delimiterLabel.style.color = 'var(--ce-selector-option-color, #606266)'
    delimiterContainer.appendChild(delimiterLabel)

    const delimiters = [',', ';', '，']
    const currentDelimiter = this.getEffectiveDelimiter()
    delimiters.forEach(delim => {
      const delimBtn = document.createElement('button')
      delimBtn.textContent = delim
      delimBtn.style.padding = '2px 8px'
      delimBtn.style.fontSize = '12px'
      delimBtn.style.border =
        '1px solid var(--ce-selector-checkbox-border, #DCDFE6)'
      delimBtn.style.borderRadius = '3px'
      delimBtn.style.backgroundColor =
        delim === currentDelimiter
          ? 'var(--ce-selector-checkbox-bg, #409EFF)'
          : 'var(--ce-selector-popup-bg, #fff)'
      delimBtn.style.color = 'var(--ce-selector-option-color, #606266)'
      delimBtn.style.cursor = 'pointer'
      delimBtn.style.outline = 'none'
      delimBtn.onclick = e => {
        e.stopPropagation()
        delimiters.forEach(d => {
          const btn = delimiterContainer.querySelector(
            `button[data-delim="${d}"]`
          ) as HTMLButtonElement
          if (btn) {
            btn.style.backgroundColor =
              d === delim
                ? 'var(--ce-selector-checkbox-bg, #409EFF)'
                : 'var(--ce-selector-popup-bg, #fff)'
            btn.style.color =
              d === delim ? '#fff' : 'var(--ce-selector-option-color, #606266)'
          }
        })
        ;(selectPopupContainer as any).currentDelimiter = delim
      }
      delimBtn.setAttribute('data-delim', delim)
      delimiterContainer.appendChild(delimBtn)
    })
    ;(selectPopupContainer as any).currentDelimiter = currentDelimiter

    bottomBar.appendChild(delimiterContainer)

    const confirmBtn = document.createElement('button')
    confirmBtn.textContent = '确认'
    confirmBtn.style.padding = '6px 16px'
    confirmBtn.style.fontSize = '12px'
    confirmBtn.style.border = 'none'
    confirmBtn.style.borderRadius = '4px'
    confirmBtn.style.border =
      '1px solid var(--ce-selector-checkbox-border, #DCDFE6)'
    confirmBtn.style.backgroundColor = 'var(--ce-selector-checkbox-bg, #409EFF)'
    confirmBtn.style.color = '#000'
    confirmBtn.style.cursor = 'pointer'
    confirmBtn.style.outline = 'none'
    confirmBtn.style.whiteSpace = 'nowrap'
    confirmBtn.onclick = e => {
      e.stopPropagation()

      // 从 DOM 输入框读取最新值，确保数据同步
      inputElements.forEach((inputs, code) => {
        inputs.forEach((input, index) => {
          const inputKey = `${code}_${index}`
          inputValues.set(inputKey, input.value)
        })
      })

      const delimiter = (selectPopupContainer as any).currentDelimiter || ','
      const currentDelimiter = this.getEffectiveDelimiter()
      if (delimiter !== currentDelimiter) {
        const elementList = this.control.getElementList()
        const range = this.control.getRange()
        this.control.setControlProperties(
          { multiSelectDelimiter: delimiter },
          { elementList, range }
        )
        this.valueSetCache.delete(this.element.controlId || '')
      }
      let codesArray = Array.from(selectedCodes)
      // 如果没有任何选中，自动选择第一个选项
      if (codesArray.length === 0 && valueSets.length > 0) {
        codesArray = [valueSets[0].code]
      }
      const delimiterChanged = delimiter !== currentDelimiter
      this.setSelectWithInputValues(
        codesArray,
        inputValues,
        delimiter,
        delimiterChanged
      )
    }
    confirmBtn.onmouseenter = () => {
      confirmBtn.style.backgroundColor = 'var(--ce-selector-active-bg, #66B1FF)'
    }
    confirmBtn.onmouseleave = () => {
      confirmBtn.style.backgroundColor =
        'var(--ce-selector-checkbox-bg, #409EFF)'
    }
    bottomBar.appendChild(confirmBtn)

    selectPopupContainer.append(bottomBar)

    selectPopupContainer.style.zIndex = '1000'
    // 统一使用 options.selector 配置的颜色（通过 CSS 变量注入，select.css 消费）
    const selectorOption = this.options.selector
    selectPopupContainer.style.setProperty(
      '--ce-selector-popup-bg',
      selectorOption.popupBackgroundColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-option-color',
      selectorOption.optionColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-option-hover-bg',
      selectorOption.optionHoverBackgroundColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-option-hover-color',
      selectorOption.optionHoverColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-active-color',
      selectorOption.activeOptionColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-active-bg',
      selectorOption.activeOptionBackgroundColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-input-border',
      selectorOption.inputBorderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-input-hover-border',
      selectorOption.inputHoverBorderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-input-active-border',
      selectorOption.inputActiveBorderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-input-placeholder',
      selectorOption.inputPlaceholderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-input-hover-placeholder',
      selectorOption.inputHoverPlaceholderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-input-active-placeholder',
      selectorOption.inputActivePlaceholderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-checkbox-bg',
      selectorOption.checkboxBackgroundColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-divider',
      selectorOption.dividerColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-checkbox-border',
      selectorOption.checkboxBorderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-checkbox-mark',
      selectorOption.checkboxMarkColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-arrow-bg',
      selectorOption.arrowBackgroundColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-arrow-color',
      selectorOption.arrowColor
    )
    selectPopupContainer.style.backgroundColor =
      'var(--ce-selector-popup-bg, #fff)'
    selectPopupContainer.style.border =
      '1px solid var(--ce-selector-active-bg, #e2e6ed)'
    selectPopupContainer.style.borderRadius = '4px'
    selectPopupContainer.style.boxShadow = '0 2px 12px 0 rgba(0, 0, 0, 0.1)'

    // 打开前获取控件在视口中的位置，避免打开动作（插入 DOM / 重渲染）导致坐标漂移。
    // 下拉归属于控件，故 X 锚定控件左缘、Y 取控件行底；与右键菜单、预输入下拉一致，
    // 规避容器 transform/overflow 裁剪与滚动错位。
    const controlXY = this.draw.getCursor().getPositionViewportXY(position)
    document.body.append(selectPopupContainer)
    // fixed 定位，使弹出层可超出编辑器区域展示（与右键菜单、预输入下拉一致）
    selectPopupContainer.style.position = 'fixed'

    const popupRect = selectPopupContainer.getBoundingClientRect()
    const popupW = popupRect.width
    const popupH = popupRect.height

    // 以控件位置为锚点：水平对齐控件左缘、垂直显示在控件正下方（仅 y 方向偏移约 5px）
    let finalLeft = controlXY.x
    let finalTop = controlXY.y + 5

    // document 层级贴边处理：保证弹出框始终落在视口内
    // 1) 下方空间不足则翻转到控件上方
    if (finalTop + popupH > window.innerHeight) {
      finalTop = controlXY.y - popupH - 5
    }
    // 2) 纵向兜底夹紧到视口
    if (finalTop < 0) {
      finalTop = 0
    }
    if (finalTop + popupH > window.innerHeight) {
      finalTop = Math.max(0, window.innerHeight - popupH)
    }
    // 3) 横向兜底夹紧到视口
    if (finalLeft + popupW > window.innerWidth) {
      finalLeft = Math.max(0, window.innerWidth - popupW)
    }
    if (finalLeft < 0) {
      finalLeft = 0
    }

    selectPopupContainer.style.left = `${finalLeft}px`
    selectPopupContainer.style.top = `${finalTop}px`
    this.selectDom = selectPopupContainer
  }

  private showHint(container: HTMLDivElement): void {
    let hint = container.querySelector('.select-hint') as HTMLDivElement
    if (!hint) {
      hint = document.createElement('div')
      hint.className = 'select-hint'
      hint.textContent =
        '按 Tab 键切换到下一个输入框，按 Enter 键确认选择，按 Esc 键退出'
      hint.style.padding = '8px 12px'
      hint.style.backgroundColor = '#FFFBE6'
      hint.style.borderTop = '1px solid #E4E7ED'
      hint.style.fontSize = '12px'
      hint.style.color = '#E6A23C'
      hint.style.whiteSpace = 'nowrap'
      hint.style.borderRadius = '0 0 4px 4px'
      hint.style.textWrap = 'auto'
      container.appendChild(hint)
    }
    hint.style.display = 'block'
  }

  private hideHint(container: HTMLDivElement): void {
    const hint = container.querySelector('.select-hint') as HTMLDivElement
    if (hint) {
      hint.style.display = 'none'
    }
  }

  private navigateToNextInput(
    container: HTMLDivElement,
    currentInput: HTMLInputElement
  ): void {
    const inputs = Array.from(container.querySelectorAll('input'))
    const currentIndex = inputs.indexOf(currentInput)
    const nextIndex = (currentIndex + 1) % inputs.length
    inputs[nextIndex].focus()
    inputs[nextIndex].select()
  }

  private setSelectWithInputValues(
    codes: string[],
    inputValues: Map<string, string>,
    delimiter: string,
    forceUpdate: boolean = false,
    realtime: boolean = false
  ): void {
    const control = this.element.control!
    const valueSets = control.valueSets
    if (!Array.isArray(valueSets) || !valueSets.length) return

    const newCodesWithValues: string[] = []
    let hasValueChanged = false

    for (const code of codes) {
      const valueSet = valueSets.find(v => v.code === code)
      if (!valueSet) continue

      const unitMatch = detectMultiUnitPattern(valueSet.value)
      const originalValue = valueSet.value

      if (unitMatch && unitMatch.parts.some(p => p.type === 'input')) {
        // 构建新的值
        let newValue = ''
        let inputIndex = 0

        unitMatch.parts.forEach(part => {
          if (part.type === 'text') {
            newValue += part.text || ''
          } else if (part.type === 'input') {
            const inputKey = `${code}_${inputIndex}`
            const inputValue = inputValues.get(inputKey)
            newValue +=
              inputValue && inputValue.trim() !== ''
                ? inputValue.trim()
                : part.value || ''
            newValue += part.unit || ''
            inputIndex++
          }
        })

        // 直接更新原有选项的值
        if (newValue !== originalValue) {
          valueSet.value = newValue
          // 同步 control.values 中对应选项，确保 buildValuesFromCodes
          // 优先使用最新输入值渲染正文（否则其会沿用旧值）
          const existing = control.values?.find(v => v.code === code)
          if (existing) {
            existing.value = newValue
          }
          hasValueChanged = true
        }
        newCodesWithValues.push(code)
      } else {
        newCodesWithValues.push(code)
      }
    }

    // 如果值有变化，或分隔符发生变化，需要强制更新正文
    if (hasValueChanged || forceUpdate) {
      // 清除缓存，确保获取最新值
      this.valueSetCache.delete(this.element.controlId || '')
      // 调用 setSelect 并强制更新；realtime 模式保留已打开的弹窗
      this.setSelect(newCodesWithValues.join(delimiter), {}, {
        isForceUpdate: true,
        isSkipDestroy: realtime,
        isSyncAssociation: !realtime
      })
    } else if (!realtime) {
      this.setSelect(newCodesWithValues.join(delimiter))
    }
  }

  public awake() {
    // 纯文本模式下不显示下拉列表
    if (this.draw.getControlRenderMode() === ControlRenderMode.TEXT) {
      return
    }
    if (
      this.control.getIsDisabledControl() ||
      !this.control.getIsRangeWithinControl()
    ) {
      return
    }
    const { startIndex } = this.control.getRange()
    const elementList = this.control.getElementList()
    if (elementList[startIndex + 1]?.controlId !== this.element.controlId) {
      return
    }
    if (!this.isPopup) {
      this._createSelectPopupDom()
      this.isPopup = true
    }
  }

  public destroy() {
    if (this.isPopup) {
      this.selectDom?.remove()
      this.isPopup = false
    }
  }

  // 在弹窗底部追加“添加选项”按钮，点击后可内联新增一项到 valueSets
  private _appendAddOptionBar(container: HTMLDivElement): void {
    if (!this.options.selector.showAddOption) return
    const addBar = document.createElement('div')
    addBar.className = `${EDITOR_PREFIX}-selector-add-bar`
    const addBtn = document.createElement('div')
    addBtn.className = `${EDITOR_PREFIX}-selector-add-btn`
    addBtn.textContent = '+ 添加选项'
    addBar.append(addBtn)
    container.append(addBar)

    const reset = () => {
      const row = addBar.querySelector(
        `.${EDITOR_PREFIX}-selector-add-row`
      ) as HTMLDivElement | null
      row?.remove()
      addBtn.style.display = ''
    }

    addBtn.addEventListener('click', () => {
      // 已处于编辑态则忽略
      if (addBar.querySelector('input')) return
      addBtn.style.display = 'none'
      const row = document.createElement('div')
      row.className = `${EDITOR_PREFIX}-selector-add-row`
      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = '输入新选项'
      const ok = document.createElement('span')
      ok.className = `${EDITOR_PREFIX}-selector-add-ok`
      ok.textContent = '确认'
      const cancel = document.createElement('span')
      cancel.className = `${EDITOR_PREFIX}-selector-add-cancel`
      cancel.textContent = '取消'

      const confirm = () => {
        const value = input.value.trim()
        if (!value) {
          input.focus()
          return
        }
        const control = this.element.control!
        const existingCodes = new Set(
          control.valueSets?.map(v => v.code) || []
        )
        let code = value
        let i = 1
        while (existingCodes.has(code)) {
          code = `${value}_${i++}`
        }
        control.valueSets = control.valueSets || []
        control.valueSets.push({ value, code })
        // 新增选项后使缓存失效，确保后续可正常选中
        this.valueSetCache.delete(this.element.controlId || '')
        // 重建弹窗以展示新选项
        this.destroy()
        this._createSelectPopupDom()
        this.isPopup = true
      }

      ok.addEventListener('click', confirm)
      cancel.addEventListener('click', reset)
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          confirm()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          reset()
        }
      })
      row.append(input, ok, cancel)
      addBar.append(row)
      input.focus()
    })
  }

  // 在多选项 li 右侧追加“移除”按钮，点击后从 valueSets 删除该项
  private _appendRemoveOptionBtn(li: HTMLLIElement, code: string): void {
    if (!this.options.selector.showRemoveOption) return
    const removeBtn = document.createElement('span')
    removeBtn.className = `${EDITOR_PREFIX}-selector-remove-btn`
    removeBtn.textContent = '×'
    removeBtn.title = '移除该选项'
    removeBtn.addEventListener('click', e => {
      e.stopPropagation()
      const control = this.element.control!
      const valueSets = control.valueSets || []
      const idx = valueSets.findIndex(v => v.code === code)
      if (idx < 0) return
      valueSets.splice(idx, 1)
      control.valueSets = valueSets
      // 删除选项后使缓存失效
      this.valueSetCache.delete(this.element.controlId || '')
      // 同步清理选中值中被删除的 code
      const currentCodes = (this.getCodes() || []).filter(c => c !== code)
      this.setSelectWithInputValues(
        currentCodes,
        new Map(),
        this.getEffectiveDelimiter()
      )
      // 重建弹窗以反映变化
      this.destroy()
      this._createSelectPopupDom()
      this.isPopup = true
    })
    li.append(removeBtn)
  }

  private adjustInputWidth(input: HTMLInputElement): void {
    // 创建临时 span 测量文本宽度
    const span = document.createElement('span')
    span.style.fontSize = input.style.fontSize
    span.style.fontFamily = input.style.fontFamily || 'inherit'
    span.style.padding = input.style.padding
    span.style.visibility = 'hidden'
    span.style.position = 'absolute'
    span.style.whiteSpace = 'pre'
    span.textContent = input.value || input.placeholder
    document.body.appendChild(span)

    // 计算宽度（最小 60px，根据内容调整）
    const width = Math.max(60, span.offsetWidth + 20)
    input.style.width = `${width}px`

    document.body.removeChild(span)
  }
}
