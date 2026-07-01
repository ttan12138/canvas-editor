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
import { EditorComponent } from '../../../../dataset/enum/Editor'
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
import { detectUnitPattern } from '../../../../utils/unitParser'
import { Draw } from '../../Draw'
import { Control } from '../Control'
import { AssociationStateManager } from '../association/AssociationStateManager'

export class MultiCustomSelectControl implements IControlInstance {
  private draw: Draw
  private element: IElement
  private control: Control
  private isPopup: boolean
  private selectDom: HTMLDivElement | null
  private options: DeepRequired<IEditorOption>
  private VALUE_DELIMITER = ','
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
        color: '#0000FF'
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
    const newCodes = code?.split(this.VALUE_DELIMITER) || []
    const oldCode = control.code
    const oldCodes = control.code?.split(this.VALUE_DELIMITER) || []
    if (isArrayEqual(oldCodes, newCodes)) {
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
        color: '#0000FF'
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
        this.element.controlId
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
    selectPopupContainer.style.minWidth = '200px'

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
      li.style.alignItems = 'center'
      li.style.padding = '8px 12px'
      li.style.cursor = 'pointer'
      li.style.listStyle = 'none'

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

      const unitMatch = detectUnitPattern(valueSet.value)

      if (unitMatch && unitMatch.hasPlaceholder) {
        const contentContainer = document.createElement('span')
        contentContainer.style.display = 'flex'
        contentContainer.style.alignItems = 'center'
        contentContainer.style.flex = '1'

        const prefixSpan = document.createElement('span')
        prefixSpan.textContent = unitMatch.prefix
        prefixSpan.style.whiteSpace = 'nowrap'
        contentContainer.appendChild(prefixSpan)

        const input = document.createElement('input')
        input.type = 'text'
        input.style.width = '60px'
        input.style.height = '24px'
        input.style.border = '1px solid #409EFF'
        input.style.borderRadius = '3px'
        input.style.padding = '0 6px'
        input.style.fontSize = '14px'
        input.style.margin = '0 4px'
        input.style.outline = 'none'
        input.style.textAlign = 'center'
        input.style.background = '#F0F7FF'

        const savedValue = inputValues.get(valueSet.code)
        input.value = savedValue || ''
        input.placeholder = unitMatch.placeholder

        input.onfocus = () => {
          input.style.borderColor = '#67C23A'
          input.style.boxShadow = '0 0 0 2px rgba(103, 194, 58, 0.2)'
          this.showHint(selectPopupContainer)
        }

        input.onblur = () => {
          input.style.borderColor = '#409EFF'
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
          inputValues.set(valueSet.code, input.value)
        }

        contentContainer.appendChild(input)

        const unitSpan = document.createElement('span')
        unitSpan.textContent = unitMatch.unit
        unitSpan.style.whiteSpace = 'nowrap'
        contentContainer.appendChild(unitSpan)

        li.appendChild(contentContainer)

        if (!inputElements.has(valueSet.code)) {
          inputElements.set(valueSet.code, [])
        }
        inputElements.get(valueSet.code)!.push(input)

      } else {
        const textSpan = document.createElement('span')
        textSpan.textContent = valueSet.value
        textSpan.style.flex = '1'
        textSpan.style.overflow = 'hidden'
        textSpan.style.textOverflow = 'ellipsis'
        textSpan.style.whiteSpace = 'nowrap'
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
    delimiterLabel.textContent = '分隔符:'
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
    confirmBtn.textContent = '确认选择'
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
      const codesArray = Array.from(selectedCodes)
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
    selectPopupContainer.style.left = `${left}px`
    selectPopupContainer.style.top = `${top + preY + lineHeight}px`
    selectPopupContainer.style.zIndex = '1000'
    selectPopupContainer.style.backgroundColor = '#fff'
    selectPopupContainer.style.border = '1px solid #E4E7ED'
    selectPopupContainer.style.borderRadius = '4px'
    selectPopupContainer.style.boxShadow = '0 2px 12px 0 rgba(0, 0, 0, 0.1)'

    const container = this.control.getContainer()
    container.append(selectPopupContainer)
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

    for (const code of codes) {
      const valueSet = valueSets.find(v => v.code === code)
      if (!valueSet) continue

      const inputValue = inputValues.get(code)
      if (inputValue && inputValue.trim() !== '') {
        const unitMatch = detectUnitPattern(valueSet.value)
        if (unitMatch && unitMatch.hasPlaceholder) {
          const newValue = unitMatch.prefix + inputValue.trim() + unitMatch.unit
          const modifiedValueSet: IValueSet = {
            code: code + '_custom',
            value: newValue
          }
          if (!valueSets.find(v => v.code === modifiedValueSet.code)) {
            valueSets.push(modifiedValueSet)
          }
          newCodesWithValues.push(modifiedValueSet.code)
        } else {
          newCodesWithValues.push(code)
        }
      } else {
        newCodesWithValues.push(code)
      }
    }

    this.setSelect(newCodesWithValues.join(delimiter))
  }

  public awake() {
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
}
