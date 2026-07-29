import { ControlComponent, ControlType } from '../../dataset/enum/Control'
import { ElementType } from '../../dataset/enum/Element'
import { IElement } from '../../interface/Element'
import { Draw } from '../draw/Draw'
import { deepClone } from '../../utils'
import { IControl } from '../../interface/Control'

export interface IConvertToControlOption {
  // 数字+单位格式的正则表达式，默认匹配常见单位
  numberUnitPattern?: RegExp
  // 预设选项列表，用于识别选项格式
  presetOptions?: string[]
}

export class Convert {
  private draw: Draw

  constructor(draw: Draw) {
    this.draw = draw
  }

  /**
   * 将所有控件转换为纯文本
   */
  public convertToText(): void {
    const data = [
      this.draw.getHeaderElementList(),
      this.draw.getOriginalMainElementList(),
      this.draw.getFooterElementList()
    ]

    for (const elementList of data) {
      this._convertElementListToText(elementList)
    }

    // 重新渲染
    this.draw.render({
      isSubmitHistory: true,
      isSetCursor: true
    })
  }

  /**
   * 将纯文本识别并转换为控件
   */
  public convertToControl(options: IConvertToControlOption = {}): void {
    const {
      numberUnitPattern = /(\d+(?:\.\d+)?)\s*(mm|cm|m|km|ml|l|g|kg|mg|hu|°C|°F|%)/gi,
      presetOptions = []
    } = options

    const data = [
      this.draw.getHeaderElementList(),
      this.draw.getOriginalMainElementList(),
      this.draw.getFooterElementList()
    ]

    for (const elementList of data) {
      this._convertElementListToControl(elementList, numberUnitPattern, presetOptions)
    }

    // 重新渲染
    this.draw.render({
      isSubmitHistory: true,
      isSetCursor: true
    })
  }

  /**
   * 将元素列表中的控件转换为纯文本
   */
  private _convertElementListToText(elementList: IElement[]): void {
    const controlIdMap = new Map<string, IElement[]>()

    // 收集所有控件元素
    for (let i = 0; i < elementList.length; i++) {
      const element = elementList[i]
      if (element.controlId) {
        if (!controlIdMap.has(element.controlId)) {
          controlIdMap.set(element.controlId, [])
        }
        controlIdMap.get(element.controlId)!.push(element)
      }
    }

    // 处理每个控件
    const removeIndices: number[] = []
    const insertElements: Array<{ index: number; elements: IElement[] }> = []

    for (const [controlId, controlElements] of controlIdMap) {
      // 提取控件的文本内容
      const text = this._extractControlText(controlElements)

      // 找到控件的起始位置
      const startIndex = elementList.findIndex(el => el.controlId === controlId)

      if (startIndex !== -1 && text) {
        // 记录要插入的文本元素
        const textElements: IElement[] = text.split('').map(char => ({
          type: ElementType.TEXT,
          value: char
        }))

        insertElements.push({
          index: startIndex,
          elements: textElements
        })

        // 记录要删除的控件元素索引
        controlElements.forEach(el => {
          const idx = elementList.indexOf(el)
          if (idx !== -1) {
            removeIndices.push(idx)
          }
        })
      }
    }

    // 先删除旧元素（从后往前删除）
    removeIndices.sort((a, b) => b - a)
    for (const index of removeIndices) {
      elementList.splice(index, 1)
    }

    // 再插入新元素（从前往后插入，需要调整索引）
    insertElements.sort((a, b) => a.index - b.index)
    let offset = 0
    for (const { index, elements } of insertElements) {
      const adjustedIndex = index + offset
      elementList.splice(adjustedIndex, 0, ...elements)
      offset += elements.length
    }
  }

  /**
   * 提取控件的文本内容
   */
  private _extractControlText(controlElements: IElement[]): string {
    const textParts: string[] = []

    // 按 controlComponent 排序
    const sortedElements = controlElements.sort((a, b) => {
      const order: Record<string, number> = {
        [ControlComponent.PREFIX]: 1,
        [ControlComponent.PRE_TEXT]: 2,
        [ControlComponent.VALUE]: 3,
        [ControlComponent.PLACEHOLDER]: 3,
        [ControlComponent.POST_TEXT]: 4,
        [ControlComponent.POSTFIX]: 5,
        [ControlComponent.CHECKBOX]: 0,
        [ControlComponent.RADIO]: 0
      }
      return (order[a.controlComponent!] || 0) - (order[b.controlComponent!] || 0)
    })

    for (const element of sortedElements) {
      // 跳过 PLACEHOLDER
      if (element.controlComponent === ControlComponent.PLACEHOLDER) {
        continue
      }

      // 添加文本
      if (element.value) {
        textParts.push(element.value)
      }
    }

    return textParts.join('')
  }

  /**
   * 将元素列表中的纯文本识别并转换为控件
   */
  private _convertElementListToControl(
    elementList: IElement[],
    numberUnitPattern: RegExp,
    presetOptions: string[]
  ): void {
    // 1. 识别数字+单位格式
    if (numberUnitPattern) {
      this._convertNumberUnitToControl(elementList, numberUnitPattern)
    }

    // 2. 识别预设选项格式
    if (presetOptions.length > 0) {
      this._convertPresetOptionsToControl(elementList, presetOptions)
    }
  }

  /**
   * 识别数字+单位格式并转换为 NUMBER_FLAG 控件
   */
  private _convertNumberUnitToControl(
    elementList: IElement[],
    pattern: RegExp
  ): void {
    // 提取所有文本内容
    let fullText = ''
    const elementIndexMap: Array<{ index: number; char: string }> = []

    for (let i = 0; i < elementList.length; i++) {
      const element = elementList[i]
      if (element.type === ElementType.TEXT && !element.controlId) {
        for (const char of element.value) {
          elementIndexMap.push({ index: i, char })
          fullText += char
        }
      }
    }

    // 匹配数字+单位格式
    const matches: Array<{ start: number; end: number; value: string; unit: string }> = []
    let match: RegExpExecArray | null

    while ((match = pattern.exec(fullText)) !== null) {
      matches.push({
        start: match.index,
        end: pattern.lastIndex,
        value: match[1],
        unit: match[2]
      })
    }

    // 转换匹配项为控件（从后往前处理）
    for (let i = matches.length - 1; i >= 0; i--) {
      const { start, end, value, unit } = matches[i]

      // 找到对应的元素索引
      const startElementIndex = elementIndexMap[start]?.index
      const endElementIndex = elementIndexMap[end - 1]?.index

      if (startElementIndex !== undefined && endElementIndex !== undefined) {
        // 创建 NUMBER_FLAG 控件
        this._createNumberFlagControl(
          elementList,
          startElementIndex,
          endElementIndex,
          value,
          unit
        )
      }
    }
  }

  /**
   * 创建 NUMBER_FLAG 控件
   */
  private _createNumberFlagControl(
    elementList: IElement[],
    startIndex: number,
    endIndex: number,
    value: string,
    unit: string
  ): void {
    // 删除原有的文本元素
    const removeIndices: number[] = []
    for (let i = startIndex; i <= endIndex; i++) {
      if (!elementList[i].controlId) {
        removeIndices.push(i)
      }
    }

    // 从后往前删除
    removeIndices.reverse()
    for (const index of removeIndices) {
      elementList.splice(index, 1)
    }

    // 创建控件元素
    const controlId = `number-flag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const control: IControl = {
      type: ControlType.NUMBER_FLAG,
      value: null,
      code: '',
      minWidth: 100,
      underline: true,
      prefix: '',
      postfix: unit,
      max: 999999,
      min: -999999
    }

    // 创建控件元素列表
    const controlElements = this._createControlElements(controlId, control, value)
    elementList.splice(startIndex, 0, ...controlElements)
  }

  /**
   * 识别预设选项格式并转换为 CUSTOM_SELECT 控件
   */
  private _convertPresetOptionsToControl(
    elementList: IElement[],
    presetOptions: string[]
  ): void {
    // TODO: 实现预设选项识别逻辑
    // 避免未使用参数的 ESLint 警告
    void elementList
    void presetOptions
  }

  /**
   * 创建控件元素列表
   */
  private _createControlElements(
    controlId: string,
    control: IControl,
    value: string
  ): IElement[] {
    const elements: IElement[] = []
    const baseElement: Partial<IElement> = {
      controlId,
      control: deepClone(control)
    }

    // 添加前缀
    if (control.prefix) {
      elements.push({
        ...baseElement,
        type: ElementType.TEXT,
        value: control.prefix,
        controlComponent: ControlComponent.PREFIX
      } as IElement)
    }

    // 添加值
    for (let i = 0; i < value.length; i++) {
      elements.push({
        ...baseElement,
        type: ElementType.TEXT,
        value: value[i],
        controlComponent: ControlComponent.VALUE,
        underline: control.underline || false
      } as IElement)
    }

    // 添加后缀
    if (control.postfix) {
      elements.push({
        ...baseElement,
        type: ElementType.TEXT,
        value: control.postfix,
        controlComponent: ControlComponent.POSTFIX
      } as IElement)
    }

    // 格式化元素上下文
    if (elements.length > 0) {
      // 注意：这里需要原始的 elementList 来进行格式化
      // 但是由于我们是在创建新元素，所以可以跳过这一步
      // formatElementContext 需要周围的元素来获取样式信息
    }

    return elements
  }
}