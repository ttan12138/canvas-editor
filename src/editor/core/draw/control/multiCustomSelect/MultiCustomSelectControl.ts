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
import { ControlRenderMode, EditorComponent } from '../../../../dataset/enum/Editor'
import { ElementType } from '../../../../dataset/enum/Element'
import { KeyMap } from '../../../../dataset/enum/KeyMap'
import { DeepRequired } from '../../../../interface/Common'
import {
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
import { formatElementContext } from '../../../../utils/element'
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
    const delimiter = this.element.control.multiSelectDelimiter || this.DEFAULT_MULTI_SELECT_DELIMITER
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
    const start = range.startIndex + 1
    for (let i = 0; i < data.length; i++) {
      const newElement: IElement = {
        ...anchorElement,
        ...data[i],
        controlComponent: ControlComponent.VALUE,
        color: this.options.control.selectValueColor
      }
      formatElementContext(elementList, [newElement], startIndex, {
        editorOptions: this.options
      })
      draw.spliceElementList(elementList, start + i, 0, [newElement])
    }
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
        code: null
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
    // 使用当前设置的分隔符，而不是固定的 VALUE_DELIMITER
    const delimiter = control.multiSelectDelimiter || this.DEFAULT_MULTI_SELECT_DELIMITER
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
    const text = this.getText(newCodes)
    if (!text) {
      if (oldCode) {
        const prefixIndex = this.clearSelect(context, {
          isIgnoreDeletedRule: options.isIgnoreDeletedRule
        })
        if (~prefixIndex) {
          this.control.repaintControl({
            curIndex: prefixIndex
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
    const data = splitText(text)
    const draw = this.control.getDraw()
    for (let i = 0; i < data.length; i++) {
      const newElement: IElement = {
        ...styleElement,
        ...propertyElement,
        type: ElementType.TEXT,
        value: data[i],
        controlComponent: ControlComponent.VALUE,
        color: this.options.control.selectValueColor
      }
      formatElementContext(elementList, [newElement], prefixIndex, {
        editorOptions: this.options
      })
      draw.spliceElementList(elementList, start + i, 0, [newElement])
    }
    this.control.setControlProperties(
      {
        code
      },
      {
        elementList,
        range: { startIndex: prefixIndex, endIndex: prefixIndex }
      }
    )
    const newIndex = start + data.length - 1
    this.control.repaintControl({
      curIndex: newIndex
    })
    this.control.emitControlContentChange({
      context
    })
    this.destroy()

    // 设置光标到控件末尾（仅用户主动操作场景）
    if (options.isSyncAssociation !== false) {
      const draw = this.control.getDraw()
      const rangeManager = draw.getRange()
      // 找到控件末尾位置（POSTFIX 后面）
      let endIndex = newIndex
      const curElementList = context.elementList || this.control.getElementList()
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
      console.log('MultiCustomSelect setSelect - 触发联动，associationId:', associationId, 'code:', code, 'valueSets:', control.valueSets)
      this.stateManager.setValue(
        associationId,
        code,
        ControlType.MULTI_CUSTOM_SELECT,
        this.draw,
        this.element.controlId,
        control.multiSelectDelimiter,
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
    const checkboxMap = new Map<string, { li: HTMLLIElement; checkbox: HTMLSpanElement }>()
    const inputValues = new Map<string, string>()
    const inputElements = new Map<string, HTMLInputElement[]>()

    for (let v = 0; v < valueSets.length; v++) {
      const valueSet = valueSets[v]
      const li = document.createElement('li')
      li.style.display = 'flex'
      li.style.alignItems = 'flex-start'
      li.style.padding = '8px 12px'
      li.style.cursor = 'pointer'
      li.style.listStyle = 'none'
      li.style.minHeight = '32px'
      li.style.lineHeight = '1.5'
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
        checkbox.style.backgroundColor = '#409EFF'
        checkbox.style.borderColor = '#409EFF'
        const checkmark = document.createElement('span')
        checkmark.style.position = 'absolute'
        checkmark.style.left = '4px'
        checkmark.style.top = '1px'
        checkmark.style.width = '6px'
        checkmark.style.height = '10px'
        checkmark.style.border = 'solid white'
        checkmark.style.borderWidth = '0 2px 2px 0'
        checkmark.style.transform = 'rotate(45deg)'
        checkmark.style.boxSizing = 'content-box'
        checkbox.appendChild(checkmark)
        li.classList.add('active')
      }

      checkboxWrapper.appendChild(checkbox)
      li.appendChild(checkboxWrapper)

      const multiUnitMatch = detectMultiUnitPattern(valueSet.value)

      if (multiUnitMatch && multiUnitMatch.parts.some(p => p.type === 'input')) {
        const contentContainer = document.createElement('span')
        contentContainer.style.display = 'flex'
        contentContainer.style.alignItems = 'center'
        contentContainer.style.flexWrap = 'wrap'
        contentContainer.style.flex = '1'
        contentContainer.style.lineHeight = '1.8'
        contentContainer.style.wordBreak = 'break-word'

        // 用于跟踪输入框索引
        let inputIndex = 0

        multiUnitMatch.parts.forEach((part) => {
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
            input.style.borderBottom = `1px solid #000000`

            // 获取初始值
            const inputKey = `${valueSet.code}_${inputIndex}`
            let initialValue = inputValues.get(inputKey)
            if (!initialValue && part.value) {
              initialValue = part.value
            }
            input.value = initialValue || ''
            input.placeholder = ''

            input.onfocus = () => {
              input.style.borderColor =  `${this.options.control.selectValueColor}`
              input.style.boxShadow = `0 0 0 2px ${hex16toRgba(this.options.control.selectValueColor, 0.2)}`
              this.showHint(selectPopupContainer)
            }

            input.onblur = () => {
              input.style.borderColor = '#000000'
              input.style.boxShadow = 'none'
            }

            input.onkeydown = (e) => {
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
                  checkbox.style.borderColor = '#DCDFE6'
                  const checkmark = checkbox.querySelector('span')
                  if (checkmark) checkmark.remove()
                  li.classList.remove('active')
                } else {
                  selectedCodes.add(valueSet.code)
                  checkbox.style.backgroundColor = '#409EFF'
                  checkbox.style.borderColor = '#409EFF'
                  const checkmark = document.createElement('span')
                  checkmark.style.position = 'absolute'
                  checkmark.style.left = '4px'
                  checkmark.style.top = '1px'
                  checkmark.style.width = '6px'
                  checkmark.style.height = '10px'
                  checkmark.style.border = 'solid white'
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
        li.style.backgroundColor = '#F5F7FA'
      }
      li.onmouseleave = () => {
        li.style.backgroundColor = ''
      }

      li.onclick = (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') {
          return
        }

        const hasInput = inputElements.has(valueSet.code) && inputElements.get(valueSet.code)!.length > 0
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
          checkbox.style.borderColor = '#DCDFE6'
          const checkmark = checkbox.querySelector('span')
          if (checkmark) checkmark.remove()
          li.classList.remove('active')
        } else {
          selectedCodes.add(valueSet.code)
          checkbox.style.backgroundColor = '#409EFF'
          checkbox.style.borderColor = '#409EFF'
          const checkmark = document.createElement('span')
          checkmark.style.position = 'absolute'
          checkmark.style.left = '4px'
          checkmark.style.top = '1px'
          checkmark.style.width = '6px'
          checkmark.style.height = '10px'
          checkmark.style.border = 'solid white'
          checkmark.style.borderWidth = '0 2px 2px 0'
          checkmark.style.transform = 'rotate(45deg)'
          checkmark.style.boxSizing = 'content-box'
          checkbox.appendChild(checkmark)
          li.classList.add('active')
        }
      }

      checkboxMap.set(valueSet.code, { li, checkbox })
      ul.append(li)
    }
    selectPopupContainer.append(ul)

    const divider = document.createElement('div')
    divider.style.height = '1px'
    divider.style.backgroundColor = '#EBEEF5'
    divider.style.margin = '0'
    selectPopupContainer.append(divider)

    const bottomBar = document.createElement('div')
    bottomBar.style.display = 'flex'
    bottomBar.style.alignItems = 'center'
    bottomBar.style.justifyContent = 'space-between'
    bottomBar.style.padding = '8px 12px'
    bottomBar.style.gap = '12px'

    const delimiterContainer = document.createElement('div')
    delimiterContainer.style.display = 'flex'
    delimiterContainer.style.alignItems = 'center'
    delimiterContainer.style.gap = '6px'

    const delimiterLabel = document.createElement('span')
    delimiterLabel.textContent = ''
    delimiterLabel.style.fontSize = '12px'
    delimiterLabel.style.color = '#606266'
    delimiterContainer.appendChild(delimiterLabel)

    const delimiters = [',', ';', '，']
    const currentDelimiter = control.multiSelectDelimiter || ','
    delimiters.forEach(delim => {
      const delimBtn = document.createElement('button')
      delimBtn.textContent = delim
      delimBtn.style.padding = '2px 8px'
      delimBtn.style.fontSize = '12px'
      delimBtn.style.border = '1px solid #DCDFE6'
      delimBtn.style.borderRadius = '3px'
      delimBtn.style.backgroundColor = delim === currentDelimiter ? '#409EFF' : '#fff'
      delimBtn.style.color = delim === currentDelimiter ? '#fff' : '#606266'
      delimBtn.style.cursor = 'pointer'
      delimBtn.style.outline = 'none'
      delimBtn.onclick = (e) => {
        e.stopPropagation()
        delimiters.forEach(d => {
          const btn = delimiterContainer.querySelector(`button[data-delim="${d}"]`) as HTMLButtonElement
          if (btn) {
            btn.style.backgroundColor = d === delim ? '#409EFF' : '#fff'
            btn.style.color = d === delim ? '#fff' : '#606266'
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
    confirmBtn.style.backgroundColor = '#409EFF'
    confirmBtn.style.color = '#fff'
    confirmBtn.style.cursor = 'pointer'
    confirmBtn.style.outline = 'none'
    confirmBtn.style.whiteSpace = 'nowrap'
    confirmBtn.onclick = (e) => {
      e.stopPropagation()

      // 从 DOM 输入框读取最新值，确保数据同步
      inputElements.forEach((inputs, code) => {
        inputs.forEach((input, index) => {
          const inputKey = `${code}_${index}`
          inputValues.set(inputKey, input.value)
        })
      })

      const delimiter = (selectPopupContainer as any).currentDelimiter || ','
      const currentDelimiter = control.multiSelectDelimiter || ','
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
      this.setSelectWithInputValues(codesArray, inputValues, delimiter)
    }
    confirmBtn.onmouseenter = () => {
      confirmBtn.style.backgroundColor = '#66B1FF'
    }
    confirmBtn.onmouseleave = () => {
      confirmBtn.style.backgroundColor = '#409EFF'
    }
    bottomBar.appendChild(confirmBtn)

    selectPopupContainer.append(bottomBar)

    const {
      coordinate: {
        leftTop: [left, top]
      },
      lineHeight
    } = position
    const preY = this.control.getPreY()
    selectPopupContainer.style.zIndex = '1000'
    selectPopupContainer.style.backgroundColor = '#fff'
    selectPopupContainer.style.border = '1px solid #E4E7ED'
    selectPopupContainer.style.borderRadius = '4px'
    selectPopupContainer.style.boxShadow = '0 2px 12px 0 rgba(0, 0, 0, 0.1)'

    const container = this.control.getContainer()
    container.append(selectPopupContainer)

    // 边界检测：确保弹出框不超出编辑器容器
    const popupRect = selectPopupContainer.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    let finalLeft = left
    let finalTop = top + preY + lineHeight

    // 检查右边界
    if (finalLeft + popupRect.width > containerRect.width) {
      finalLeft = containerRect.width - popupRect.width - 10
    }
    // 检查左边界
    if (finalLeft < 0) {
      finalLeft = 10
    }
    // 检查下边界
    if (finalTop + popupRect.height > containerRect.height) {
      // 显示在上方
      finalTop = top + preY - popupRect.height
    }
    // 检查上边界
    if (finalTop < 0) {
      finalTop = 10
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
      hint.textContent = '按 Tab 键切换到下一个输入框，按 Enter 键确认选择，按 Esc 键退出'
      hint.style.padding = '8px 12px'
      hint.style.backgroundColor = '#FFFBE6'
      hint.style.borderTop = '1px solid #E4E7ED'
      hint.style.fontSize = '12px'
      hint.style.color = '#E6A23C'
      hint.style.whiteSpace = 'nowrap'
      hint.style.borderRadius = '0 0 4px 4px'
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

  private navigateToNextInput(container: HTMLDivElement, currentInput: HTMLInputElement): void {
    const inputs = Array.from(container.querySelectorAll('input'))
    const currentIndex = inputs.indexOf(currentInput)
    const nextIndex = (currentIndex + 1) % inputs.length
    inputs[nextIndex].focus()
    inputs[nextIndex].select()
  }

  private setSelectWithInputValues(codes: string[], inputValues: Map<string, string>, delimiter: string): void {
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

        unitMatch.parts.forEach((part) => {
          if (part.type === 'text') {
            newValue += part.text || ''
          } else if (part.type === 'input') {
            const inputKey = `${code}_${inputIndex}`
            const inputValue = inputValues.get(inputKey)
            newValue += (inputValue && inputValue.trim() !== '' ? inputValue.trim() : part.value || '')
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
      // 清除缓存，确保获取最新值
      this.valueSetCache.delete(this.element.controlId || '')
      console.log('setSelectWithInputValues - 值有变化，调用 setSelect，valueSets:', control.valueSets)
      // 调用 setSelect 并强制更新
      this.setSelect(newCodesWithValues.join(delimiter), {}, { isForceUpdate: true })
    } else {
      console.log('setSelectWithInputValues - 值无变化，调用 setSelect')
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
