import { IControlContext, IControlInstance, IControlRuleOption } from '../../../../interface/Control'
import { IElement } from '../../../../interface/Element'
import { Control } from '../Control'

export class LabelControl implements IControlInstance {
  private element: IElement
  private control: Control

  constructor(element: IElement, control: Control) {
    this.element = element
    this.control = control
  }

  public setElement(element: IElement) {
    this.element = element
  }

  public getElement(): IElement {
    return this.element
  }

  public getValue(): IElement[] {
    const control = this.element.control
    if (!control) return []
    const value = control.useValueA !== false ? (control.valueA || '') : (control.valueB || '')
    return [{ value }]
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public setValue(_data: IElement[], _context?: IControlContext, _options?: IControlRuleOption): number {
    // LABEL控件不支持setValue，返回0表示没有变化
    return 0
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public keydown(_evt: KeyboardEvent): number | null {
    // LABEL控件不支持keydown，返回null表示不处理
    return null
  }

  public cut(): number {
    // LABEL控件不支持cut，返回0表示没有变化
    return 0
  }

  public getCode(): string | null {
    return this.element.control?.conceptId || null
  }

  /**
   * 设置使用值A还是值B
   */
  public setUseValueA(useValueA: boolean, isSubmitHistory: boolean = true) {
    const control = this.element.control
    if (!control) return

    control.useValueA = useValueA
    this.element.value = useValueA ? (control.valueA || '') : (control.valueB || '')

    // 重新渲染控件，不提交历史记录
    this.control.repaintControl({
      isSubmitHistory,
      isCompute: true,
      isSetCursor: true
    })
  }

  /**
   * 获取当前显示的值
   */
  public getCurrentValue(): { value: string; isValueA: boolean } {
    const control = this.element.control
    if (!control) return { value: '', isValueA: true }

    const isValueA = control.useValueA !== false
    return {
      value: isValueA ? (control.valueA || '') : (control.valueB || ''),
      isValueA
    }
  }

  /**
   * 设置样式
   */
  public setStyle(style: {
    font?: string
    size?: number
    bold?: boolean
    color?: string
    italic?: boolean
  }) {
    const control = this.element.control
    if (!control) return

    if (!control.labelStyle) {
      control.labelStyle = {}
    }

    Object.assign(control.labelStyle, style)
    this.control.repaintControl({
      isSubmitHistory: false,
      isCompute: true,
      isSetCursor: false
    })
  }

  /**
   * 获取样式
   */
  public getStyle(): {
    font?: string
    size?: number
    bold?: boolean
    color?: string
    italic?: boolean
  } {
    return this.element.control?.labelStyle || {}
  }
}