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
  IControl,
  IControlContext,
  IControlInstance,
  IControlRuleOption,
  IValueSet
} from '../../../../interface/Control'
import { IEditorOption } from '../../../../interface/Editor'
import { IElement } from '../../../../interface/Element'
import {
  isArrayEqual,
  isNonValue,
  omitObject,
  pickObject,
  splitText
} from '../../../../utils'
import {
  applyTextDiffToStructSegments,
  formatElementContext
} from '../../../../utils/element'
import { detectMultiUnitPattern } from '../../../../utils/unitParser'
import { Draw } from '../../Draw'
import { Control } from '../Control'
import { AssociationStateManager } from '../association/AssociationStateManager'
import {
  SELECT_CHECK_SVG,
  SELECT_CLOSE_SVG,
  SELECT_TRASH_SVG
} from '../selectPopupIcons'

// 编辑模式下的候选项工作副本（isNew 标记本次新增项，提交时重新生成 code）
type IPendingValueSet = IValueSet & { isNew?: boolean }

function hex16toRgba(hex: string, alpha: number = 1): string {
  return `rgba(${hex.slice(1, 3)}, ${hex.slice(3, 5)}, ${hex.slice(5, 7)}, ${hex.slice(7, 16)}, ${alpha})`
}

export class CustomSelectControl implements IControlInstance {
  private draw: Draw
  private element: IElement
  private control: Control
  private isPopup: boolean
  private selectDom: HTMLDivElement | null
  private options: DeepRequired<IEditorOption>
  private VALUE_DELIMITER = '、'
  private DEFAULT_MULTI_SELECT_DELIMITER = '、'
  private stateManager: AssociationStateManager
  private valueSetCache: Map<string, Map<string, IValueSet>> = new Map()
  // 候选项编辑模式状态
  private isEditMode: boolean = false
  private pendingValueSets: IPendingValueSet[] = []
  private pendingCodes: string[] = []
  private editOutsideHandler: ((e: MouseEvent) => void) | null = null
  private editTitleSpan: HTMLSpanElement | null = null

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
    return this.element?.control?.code
      ? this.element.control.code.split(',')
      : []
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

  public getText(codes: string[]): string | null {
    if (!this.element?.control) return null
    const control = this.element.control
    if (!control.valueSets?.length) return null
    const multiSelectDelimiter =
      control?.multiSelectDelimiter || this.DEFAULT_MULTI_SELECT_DELIMITER
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
    const { startIndex } = context.range || this.control.getRange()
    const startElement = elementList[startIndex]
    const data: IElement[] = []
    // 向左查找
    let preIndex = startIndex
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
    let nextIndex = startIndex + 1
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

  // 同步控件 value 字段与 structValues，保持数据一致性
  // structValues 存在时：依据文字位置将增删同步到对应片段（保留 groupIds、underline、highlight 等属性）
  // structValues 不存在时：仅同步 value 字段
  public syncValueWithStructValues(context: IControlContext = {}) {
    const control = this.element.control
    if (!control) return
    const newText = this.getValue(context)
      .map(el => el.value)
      .join('')
    const oldText =
      typeof control.value === 'string'
        ? control.value
        : control.structValues?.map(sv => sv.value).join('') || ''
    const properties: Partial<IControl> = { value: newText }
    if (control.structValues?.length) {
      const synced = applyTextDiffToStructSegments(
        control.structValues,
        oldText,
        newText
      )
      // 移除 value 为空的 structValue 片段，保持数据一致性
      properties.structValues = synced.filter(sv => sv.value)
    }
    this.control.setControlProperties(properties, context)
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
    // 收缩边界到Value内
    this.control.shrinkBoundary(context)
    const { startIndex, endIndex } = range
    const draw = this.control.getDraw()
    // 移除选区元素
    if (startIndex !== endIndex) {
      draw.spliceElementList(elementList, startIndex + 1, endIndex - startIndex)
    } else {
      // 移除空白占位符
      this.control.removePlaceholder(startIndex, context)
    }
    // 非文本类元素或前缀过渡掉样式属性
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
    // 插入起始位置
    const start = range.startIndex + 1
    for (let i = 0; i < splitData.length; i++) {
      const newElement: IElement = {
        ...anchorElement,
        ...splitData[i],
        controlComponent: ControlComponent.VALUE,
        color: this.options.selector.customSelectValueColor
      }
      formatElementContext(elementList, [newElement], startIndex, {
        editorOptions: this.options
      })
      draw.spliceElementList(elementList, start + i, 0, [newElement])
    }
    // 同步 value 字段与 structValues，保持数据一致性
    this.syncValueWithStructValues({ elementList, range })
    return start + splitData.length - 1
  }

  public keydown(evt: KeyboardEvent): number | null {
    if (this.control.getIsDisabledControl()) {
      return null
    }
    const elementList = this.control.getElementList()
    const range = this.control.getRange()
    // 收缩边界到Value内
    this.control.shrinkBoundary()
    const { startIndex, endIndex } = range
    const startElement = elementList[startIndex]
    const endElement = elementList[endIndex]
    // backspace
    if (evt.key === KeyMap.Backspace) {
      // 清空选项
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
        // 同步 value 字段与 structValues，保持数据一致性
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
          // 同步 value 字段与 structValues，保持数据一致性
          this.syncValueWithStructValues()
          return startIndex - 1
        }
      }
    } else if (evt.key === KeyMap.Delete) {
      // 移除选区元素
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
        // 同步 value 字段与 structValues，保持数据一致性
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
          // 同步 value 字段与 structValues，保持数据一致性
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
    // 清空选项
    return this.clearSelect()
  }

  public clearSelect(
    context: IControlContext = {},
    options: IControlRuleOption = {}
  ): number {
    const { isIgnoreDisabledRule = false, isAddPlaceholder = true } = options
    // 校验是否可以设置
    if (!isIgnoreDisabledRule && this.control.getIsDisabledControl(context)) {
      return -1
    }
    const elementList = context.elementList || this.control.getElementList()
    const { startIndex } = context.range || this.control.getRange()
    const startElement = elementList[startIndex]
    let leftIndex = -1
    let rightIndex = -1
    // 向左查找
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
    // 向右查找
    // 起始元素本身为 POSTFIX/POST_TEXT 时（如光标位于控件末尾），从当前元素开始查找，
    // 使右边界落在后缀前一元素，避免清除选项时误删后缀图标
    const isStartPostfix =
      startElement.controlComponent === ControlComponent.POSTFIX ||
      startElement.controlComponent === ControlComponent.POST_TEXT
    let nextIndex = isStartPostfix ? startIndex : startIndex + 1
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
    // 删除元素
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
    // 增加占位符
    if (isAddPlaceholder) {
      this.control.addPlaceholder(preIndex, context)
    }
    this.control.setControlProperties(
      {
        code: null,
        value: '',
        structValues: undefined
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
    // 校验是否可以设置
    if (
      !options.isIgnoreDisabledRule &&
      this.control.getIsDisabledControl(context)
    ) {
      return
    }
    const elementList = context.elementList || this.control.getElementList()
    const range = context.range || this.control.getRange()
    const control = this.element.control!
    const newCodes = code?.split(this.VALUE_DELIMITER) || []
    // 缓存旧值
    const oldCode = control.code
    const oldCodes = control.code?.split(this.VALUE_DELIMITER) || []
    // 选项相同时无需重复渲染
    const isMultiSelect = control.isMultiSelect
    if (
      (!isMultiSelect && code === oldCode && !options.isForceUpdate) ||
      (isMultiSelect &&
        isArrayEqual(oldCodes, newCodes) &&
        !options.isForceUpdate)
    ) {
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
    // 转换文本
    const text = this.getText(newCodes)
    if (!text) {
      // 之前存在内容时清空文本
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
    // 样式赋值元素-默认值的第一个字符样式，否则取默认样式
    const valueElement = this.getValue(context)[0]
    const styleElement = valueElement
      ? pickObject(valueElement, EDITOR_ELEMENT_STYLE_ATTR)
      : pickObject(elementList[range.startIndex], CONTROL_STYLE_ATTR)
    // 清空选项
    const prefixIndex = this.clearSelect(context, {
      isAddPlaceholder: false,
      isIgnoreDeletedRule: options.isIgnoreDeletedRule
    })
    if (!~prefixIndex) return
    // 当前无值时清空占位符
    if (!oldCode) {
      this.control.removePlaceholder(prefixIndex, context)
    }
    // 属性赋值元素-默认为前缀属性
    const propertyElement = omitObject(
      elementList[prefixIndex],
      EDITOR_ELEMENT_STYLE_ATTR
    )
    const start = prefixIndex + 1
    const data = splitText(text)
    const draw = this.control.getDraw()
    for (let i = 0; i < data.length; i++) {
      const newElement: IElement = {
        ...styleElement,
        ...propertyElement,
        type: ElementType.TEXT,
        value: data[i],
        controlComponent: ControlComponent.VALUE,
        color: this.options.selector.customSelectValueColor
      }
      formatElementContext(elementList, [newElement], prefixIndex, {
        editorOptions: this.options
      })
      draw.spliceElementList(elementList, start + i, 0, [newElement])
    }
    // 设置状态：同步 value 字段；选择新选项后原结构化标注失效，清空 structValues
    this.control.setControlProperties(
      {
        code,
        value: text,
        structValues: undefined
      },
      {
        elementList,
        range: { startIndex: prefixIndex, endIndex: prefixIndex }
      }
    )
    // 重新渲染控件
    const newIndex = start + data.length - 1
    this.control.repaintControl({
      curIndex: newIndex,
      isSetCursor: options.isSyncAssociation !== false
    })
    this.control.emitControlContentChange({
      context
    })
    if (!isMultiSelect) {
      this.destroy()
    }

    // 设置光标到控件末尾（仅用户主动操作场景）
    if (options.isSyncAssociation !== false) {
      const draw = this.control.getDraw()
      const rangeManager = draw.getRange()
      // 找到控件末尾位置（POSTFIX 后面）
      let endIndex = newIndex
      while (endIndex < elementList.length - 1) {
        const nextElement = elementList[endIndex + 1]
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
        ControlType.CUSTOM_SELECT,
        this.draw,
        this.element.controlId,
        undefined,
        control.valueSets
      )
    }
  }

  // private _togglePopup() {
  //   if (this.isPopup) {
  //     this.destroy()
  //   } else {
  //     this._createSelectPopupDom()
  //     this.isPopup = true
  //   }
  // }

  private _createSelectPopupDom() {
    const control = this.element.control!
    // 编辑模式渲染 pendingValueSets（工作副本），普通模式渲染 valueSets
    const valueSets: IValueSet[] = this.isEditMode
      ? this.pendingValueSets
      : Array.isArray(control.valueSets)
        ? control.valueSets
        : []
    if (!this.isEditMode && !valueSets.length) return
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

    const inputValues = new Map<string, string>()
    const inputElements = new Map<string, HTMLInputElement[]>()
    const isMultiSelect = control.isMultiSelect
    const currentCodes = this.isEditMode
      ? this.pendingCodes
      : this.getCodes() || []
    const activeCodes = isMultiSelect ? new Set(currentCodes) : currentCodes[0]

    // 弹窗头部：模式 · N 个候选（编辑模式时附【编辑模式】及 √ / ×）
    const header = document.createElement('div')
    header.className = `${EDITOR_PREFIX}-select-popup-header`
    const titleSpan = document.createElement('span')
    titleSpan.className = `${EDITOR_PREFIX}-select-popup-title`
    titleSpan.textContent = `${this._getTitleLabel()}`
    header.append(titleSpan)
    if (this.isEditMode) {
      this.editTitleSpan = titleSpan
      const editLabel = document.createElement('span')
      editLabel.className = `${EDITOR_PREFIX}-select-popup-edit-label`
      editLabel.textContent = ''
      const okBtn = document.createElement('span')
      okBtn.className = `${EDITOR_PREFIX}-select-popup-edit-ok`
      okBtn.innerHTML = SELECT_CHECK_SVG
      okBtn.title = '完成编辑'
      okBtn.onclick = e => {
        e.stopPropagation()
        this._commitEditMode(false)
      }
      const cancelBtn = document.createElement('span')
      cancelBtn.className = `${EDITOR_PREFIX}-select-popup-edit-cancel`
      cancelBtn.innerHTML = SELECT_CLOSE_SVG
      cancelBtn.title = '退出编辑并关闭'
      cancelBtn.onclick = e => {
        e.stopPropagation()
        this._commitEditMode(true)
      }
      header.append(editLabel, okBtn, cancelBtn)
    } else {
      this.editTitleSpan = null
    }

    for (let v = 0; v < valueSets.length; v++) {
      const valueSet = valueSets[v]
      const li = document.createElement('li')
      li.style.display = 'flex'
      li.style.alignItems = 'flex-start'
      li.style.padding = '2px 12px 4px'
      li.style.cursor = 'pointer'
      li.style.listStyle = 'none'
      li.style.minHeight = '28px'
      li.style.lineHeight = '28px'
      li.style.position = 'relative'
      li.style.flexWrap = 'wrap'
      li.style.wordBreak = 'break-word'
      li.style.overflowWrap = 'break-word'
      li.style.height = 'auto'

      const isSelected = isMultiSelect
        ? (activeCodes as Set<string>).has(valueSet.code)
        : activeCodes === valueSet.code

      if (isSelected) {
        li.classList.add('active')
      }

      // 编辑模式：候选项渲染为 textarea + 删除图标，保留选中高亮
      if (this.isEditMode) {
        this._buildEditOptionLi(li, valueSet)
        ul.append(li)
        continue
      }

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
        contentContainer.style.lineHeight = '1'

        contentContainer.style.padding = '4px'
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
            input.placeholder = '请输入数值'

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
                // 从 DOM 输入框读取最新值，确保数据同步
                inputElements.forEach((inputs, code) => {
                  inputs.forEach((input, index) => {
                    const inputKey = `${code}_${index}`
                    inputValues.set(inputKey, input.value)
                  })
                })
                this.handleEnterSelect(
                  valueSet.code,
                  isMultiSelect || false,
                  activeCodes,
                  inputValues
                )
              }
            }

            input.oninput = () => {
              // 只允许数字、负号、±和小数点
              let value = input.value

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
        textSpan.style.lineHeight = '1'
        textSpan.style.padding = '4px'
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

        // 从 DOM 输入框读取最新值，确保数据同步
        inputElements.forEach((inputs, code) => {
          inputs.forEach((input, index) => {
            const inputKey = `${code}_${index}`
            inputValues.set(inputKey, input.value)
          })
        })

        // 隐藏提示
        this.hideHint(selectPopupContainer)

        let newCodes: string[]
        if (isMultiSelect) {
          const currentCodes = new Set(activeCodes as Set<string>)
          if (currentCodes.has(valueSet.code)) {
            currentCodes.delete(valueSet.code)
          } else {
            currentCodes.add(valueSet.code)
          }
          newCodes = Array.from(currentCodes)
        } else {
          // 单选时不允许清空，必须有选中值
          newCodes = [valueSet.code]
        }

        this.setSelectWithInputValues(newCodes, inputValues)
      }

      // 选中项右侧显示对勾图标
      if (isSelected) {
        const checkSpan = document.createElement('span')
        checkSpan.className = `${EDITOR_PREFIX}-select-option-check`
        checkSpan.innerHTML = SELECT_CHECK_SVG
        li.append(checkSpan)
      }

      ul.append(li)
    }

    selectPopupContainer.append(ul)
    // 头部始终显示实际渲染的候选项数量
    titleSpan.textContent = `${this._getTitleLabel()}`
    // 头部插入到选项列表上方
    selectPopupContainer.insertBefore(header, ul)

    // 底部操作条：非编辑模式为“管理候选项”，编辑模式为“+ 新增候选项”
    this._appendManageBar(selectPopupContainer)

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
      '--ce-selector-checkbox-active-bg',
      selectorOption.checkboxActiveBackgroundColor
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
    selectPopupContainer.style.setProperty(
      '--ce-selector-edit-textarea-border',
      selectorOption.editTextareaBorderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-edit-textarea-hover-border',
      selectorOption.editTextareaHoverBorderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-edit-textarea-active-border',
      selectorOption.editTextareaActiveBorderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-manage-color',
      selectorOption.manageOptionColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-manage-hover-color',
      selectorOption.manageOptionHoverColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-manage-border',
      selectorOption.manageOptionBorderColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-popup-title',
      selectorOption.popupTitleColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-popup-header-bg',
      selectorOption.popupHeaderBackgroundColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-popup-title-options',
      selectorOption.popupTitleOptionsColor
    )
    selectPopupContainer.style.setProperty(
      '--ce-selector-popup-title-options-hover',
      selectorOption.popupTitleOptionsHoverColor
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
      hint.style.padding = '2px 12px 4px'
      hint.style.backgroundColor = '#FFFBE6'
      hint.style.borderTop = '1px solid #E4E7ED'
      hint.style.fontSize = '12px'
      hint.style.color = '#E6A23C'
      hint.style.whiteSpace = 'wrap'
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

  // 创建选项 li 的基础样式
  private _createBaseOptionLi(): HTMLLIElement {
    const li = document.createElement('li')
    li.style.display = 'flex'
    li.style.alignItems = 'flex-start'
    li.style.padding = '2px 12px 4px'
    li.style.cursor = 'pointer'
    li.style.listStyle = 'none'
    li.style.minHeight = '28px'
    li.style.lineHeight = '28px'
    li.style.position = 'relative'
    li.style.flexWrap = 'wrap'
    li.style.wordBreak = 'break-word'
    li.style.overflowWrap = 'break-word'
    li.style.height = 'auto'
    return li
  }

  // 编辑模式：候选项渲染为 textarea + 删除图标（高亮由外层通过 active class 控制）
  private _buildEditOptionLi(li: HTMLLIElement, valueSet: IValueSet): void {
    const textarea = document.createElement('textarea')
    textarea.className = `${EDITOR_PREFIX}-selector-edit-textarea`
    textarea.value = valueSet.value
    textarea.placeholder = '输入候选文字'
    textarea.rows = 1
    // 阻止按键冒泡至编辑器全局快捷键处理
    textarea.addEventListener('keydown', e => e.stopPropagation())
    textarea.addEventListener('input', () => {
      valueSet.value = textarea.value
      this._adjustTextareaHeight(textarea)
    })
    textarea.addEventListener('focus', () =>
      this._adjustTextareaHeight(textarea)
    )
    li.append(textarea)
    const removeBtn = document.createElement('span')
    removeBtn.className = `${EDITOR_PREFIX}-selector-edit-remove`
    removeBtn.innerHTML = SELECT_TRASH_SVG
    removeBtn.title = '删除该候选项'
    removeBtn.onclick = e => {
      e.stopPropagation()
      const index = this.pendingValueSets.findIndex(v => v === valueSet)
      if (~index) this.pendingValueSets.splice(index, 1)
      this.pendingCodes = this.pendingCodes.filter(c => c !== valueSet.code)
      li.remove()
      this._updateEditTitle()
    }
    li.append(removeBtn)
    li.onmouseenter = () => {
      li.style.backgroundColor = 'var(--ce-selector-option-hover-bg, #EEF2FD)'
    }
    li.onmouseleave = () => {
      li.style.backgroundColor = ''
    }
    requestAnimationFrame(() => this._adjustTextareaHeight(textarea))
  }

  // 编辑模式 textarea 高度自适应，最多显示三行（超出滚动）
  private _adjustTextareaHeight(textarea: HTMLTextAreaElement): void {
    const cs = getComputedStyle(textarea)
    const lineHeight = parseFloat(cs.lineHeight) || 20
    const paddingV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    const borderV =
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
    const maxLines = 3
    const maxHeight = lineHeight * maxLines + paddingV + borderV
    textarea.style.height = 'auto'
    // scrollHeight 不含边框，补上 borderV 得到 border-box 总高，
    // 保证正好三行完整显示、第四行起才出现滚动条
    const target = Math.min(textarea.scrollHeight + borderV, maxHeight)
    textarea.style.height = `${target}px`
  }

  // 弹窗标题标签：编辑模式为【管理候选项】；普通模式按类型显示
  // 【单选】/【多选】，可联动元素显示【关联选择】
  private _getTitleLabel(): string {
    if (this.isEditMode) return '管理候选项'
    const control = this.element.control
    if (control?.associationId) return '关联选择'
    return control?.isMultiSelect ? '多选' : '单选'
  }

  // 编辑模式下同步头部标题（按当前模式显示对应标签）
  private _updateEditTitle(): void {
    if (!this.editTitleSpan) return
    this.editTitleSpan.textContent = `${this._getTitleLabel()}`
  }

  // 弹窗底部操作条：非编辑模式为“管理候选项”，编辑模式为“+ 新增候选项”
  private _appendManageBar(container: HTMLDivElement): void {
    const { showAddOption } = this.options.selector
    const bar = document.createElement('div')
    bar.className = `${EDITOR_PREFIX}-selector-manage-bar`
    if (this.isEditMode) {
      bar.textContent = '+ 新增候选项'
      bar.onclick = e => {
        e.stopPropagation()
        const code = `__new_${Date.now()}_${this.pendingValueSets.length}`
        const item: IPendingValueSet = { code, value: '', isNew: true }
        this.pendingValueSets.push(item)
        const ul = container.querySelector('ul')
        if (!ul) return
        const li = this._createBaseOptionLi()
        this._buildEditOptionLi(li, item)
        ul.append(li)
        this._updateEditTitle()
        li.querySelector('textarea')?.focus()
      }
    } else {
      // showAddOption 控制是否显示“管理候选项”入口
      if (!showAddOption) return
      bar.textContent = '管理候选项'
      bar.onclick = e => {
        e.stopPropagation()
        this._enterEditMode()
      }
    }
    container.append(bar)
  }

  // 进入候选项编辑模式
  private _enterEditMode(): void {
    // 刷新 element 引用：control 对象可能已被 setControlProperties 重建，避免读取过期候选项
    const elementList = this.control.getElementList()
    if (this.element.controlId) {
      const liveElement = elementList.find(
        el => el.controlId === this.element.controlId
      )
      if (liveElement) this.setElement(liveElement)
    }
    const control = this.element.control!
    this.destroy()
    this.pendingValueSets = (control.valueSets || []).map(v => ({ ...v }))
    this.pendingCodes = [...(this.getCodes() || [])]
    this.isEditMode = true
    this._createSelectPopupDom()
    this.isPopup = true
    // 编辑模式下点击选项列表外区域：提交编辑并关闭选项列表
    // （capture 阶段触发，先于全局失焦销毁逻辑执行）
    this.editOutsideHandler = (e: MouseEvent) => {
      const dom = this.selectDom
      if (dom && dom.contains(e.target as Node)) return
      if (this.isEditMode) this._commitEditMode(true)
    }
    document.addEventListener('mousedown', this.editOutsideHandler, true)
  }

  private _removeEditOutsideListener(): void {
    if (this.editOutsideHandler) {
      document.removeEventListener('mousedown', this.editOutsideHandler, true)
      this.editOutsideHandler = null
    }
  }

  // 退出编辑模式：移除空白候选项并提交；无有内容的候选项时直接删除控件
  private _commitEditMode(isClose: boolean): void {
    this._removeEditOutsideListener()
    const kept = this.pendingValueSets
      .filter(v => (v.value || '').trim() !== '')
      .map(v => {
        const item = { ...v }
        delete item.isNew
        return item as IValueSet
      })
    this.isEditMode = false
    this.valueSetCache.delete(this.element.controlId || '')
    if (!kept.length) {
      this.destroy()
      const elementList = this.control.getElementList()
      const index = elementList.findIndex(
        el => el.controlId === this.element.controlId
      )
      if (~index) {
        const newIndex = this.control.removeControl(index)
        if (newIndex !== null) {
          this.draw.getRange().setRange(newIndex, newIndex)
          this.draw.render({ curIndex: newIndex })
        }
      }
      return
    }
    // 记录提交前的光标位置：提交过程不移动光标，避免光标漂移导致弹窗位置变化
    const origRange = { ...this.control.getRange() }
    // 为新增空白项生成唯一 code
    const existingCodes = new Set<string>()
    kept.forEach(v => {
      if (!v.code || existingCodes.has(v.code)) {
        let code = v.value
        let i = 1
        while (existingCodes.has(code)) {
          code = `${v.value}_${i++}`
        }
        v.code = code
      }
      existingCodes.add(v.code)
    })
    // 将候选项写入当前元素列表中该控件的所有元素：
    // this.element.control 可能是先前 setControlProperties 重建后的过期引用，
    // 直接赋值会在后续属性同步时丢失新增候选项
    const elementList = this.control.getElementList()
    const controlIndex = this.element.controlId
      ? elementList.findIndex(el => el.controlId === this.element.controlId)
      : -1
    if (~controlIndex) {
      this.control.setControlProperties(
        { valueSets: kept },
        {
          elementList,
          range: { startIndex: controlIndex, endIndex: controlIndex }
        }
      )
      // setControlProperties 会重建控件元素的 control 对象，刷新引用避免读到过期数据
      this.setElement(elementList[controlIndex])
    } else {
      this.element.control!.valueSets = kept
    }
    // 同步选中项：保留仍存在的选中；若无则默认第一项
    let newCodes = this.pendingCodes.filter(c => existingCodes.has(c))
    if (!newCodes.length) {
      newCodes = [kept[0].code]
    }
    this.setSelect(
      newCodes.join(this.VALUE_DELIMITER),
      {},
      // 不在 setSelect 内移动光标与同步关联控件，提交后统一还原光标并手动同步
      { isForceUpdate: true, isSyncAssociation: false }
    )
    // 补齐关联控件同步（isSyncAssociation=false 时 setSelect 内部跳过）
    const associationId = this.element.control?.associationId
    if (associationId && this.element.controlId) {
      this.stateManager.setValue(
        associationId,
        newCodes.join(this.VALUE_DELIMITER),
        ControlType.CUSTOM_SELECT,
        this.draw,
        this.element.controlId,
        undefined,
        this.element.control!.valueSets
      )
    }
    // 还原提交前的光标位置并重绘
    this._restoreCursor(origRange)
    if (!isClose) {
      // √：还原为普通模式并保持弹窗打开
      this.destroy()
      this._createSelectPopupDom()
      this.isPopup = true
    }
  }

  // 还原光标位置：直接改写 range（不走 setRange，避免触发控件重新初始化/唤醒弹窗），
  // 并依据还原后的 range 重绘光标
  private _restoreCursor(origRange: {
    startIndex: number
    endIndex: number
  }): void {
    const positionList = this.draw.getPosition().getPositionList()
    let cursorIndex = origRange.startIndex
    if (!positionList[cursorIndex]) {
      cursorIndex = positionList.length - 1
    }
    if (!~cursorIndex || !positionList[cursorIndex]) return
    const range = this.draw.getRange().getRange()
    range.startIndex = cursorIndex
    range.endIndex =
      origRange.startIndex === origRange.endIndex
        ? cursorIndex
        : Math.min(origRange.endIndex, positionList.length - 1)
    this.draw.getPosition().setCursorPosition(positionList[cursorIndex])
    this.draw.getCursor().drawCursor()
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

  private handleEnterSelect(
    code: string,
    isMultiSelect: boolean,
    activeCodes: Set<string> | string,
    inputValues: Map<string, string>
  ): void {
    let newCodes: string[]
    if (isMultiSelect) {
      const currentCodes = new Set(activeCodes as Set<string>)
      if (currentCodes.has(code)) {
        currentCodes.delete(code)
      } else {
        currentCodes.add(code)
      }
      newCodes = Array.from(currentCodes)
    } else {
      newCodes = [code]
    }
    this.setSelectWithInputValues(newCodes, inputValues)
  }

  private setSelectWithInputValues(
    codes: string[],
    inputValues: Map<string, string>
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
          hasValueChanged = true
        }
        newCodesWithValues.push(code)
      } else {
        newCodesWithValues.push(code)
      }
    }

    // 如果值有变化，需要强制更新正文
    if (hasValueChanged) {
      // 调用 setSelect 并强制更新
      this.setSelect(
        newCodesWithValues.join(this.VALUE_DELIMITER),
        {},
        { isForceUpdate: true }
      )
    } else {
      this.setSelect(newCodesWithValues.join(this.VALUE_DELIMITER))
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
    this._removeEditOutsideListener()
    this.isEditMode = false
  }
}
