import { ControlComponent, ControlType } from '../../../../dataset/enum/Control'
import { KeyMap } from '../../../../dataset/enum/KeyMap'
import { AssociationStateManager } from '../association/AssociationStateManager'
import {
  IControlContext,
  IControlRuleOption
} from '../../../../interface/Control'
import { IElement } from '../../../../interface/Element'
import { Control } from '../Control'
import { NumberControl } from './NumberControl'

export class NumberFlagControl extends NumberControl {
  private associationStateManager: AssociationStateManager

  constructor(element: IElement, control: Control) {
    super(element, control)
    this.associationStateManager = AssociationStateManager.getInstance()
  }

  public awake(): void {
    // 设置聚焦的 associationId
    const associationId = this.element.control?.associationId
    if (associationId) {
      this.associationStateManager.setFocusedAssociation(associationId)
      // 触发重绘以更新所有联动控件的下划线颜色
      this.control.getDraw().render({
        isSubmitHistory: false,
        isSetCursor: false
      })
    }

    // 调用父类的 awake 方法（显示计算器等）
    super.awake()
  }

  public clearValue(
    context: IControlContext = {},
    options: IControlRuleOption = {}
  ): number {
    const result = super.clearValue(context, options)

    // 清除值后同步联动控件
    if (result !== -1) {
      const associationId = this.element.control?.associationId
      if (associationId && options.isSyncAssociation !== false) {
        // 传递空值到联动控件，设置 isSyncAssociation: false 避免循环
        this.associationStateManager.setValue(
          associationId,
          '',
          ControlType.NUMBER_FLAG,
          this.control.getDraw(),
          this.element.controlId || ''
        )
      }
    }

    return result
  }

  public keydown(evt: KeyboardEvent): number | null {
    const result = super.keydown(evt)
    // 删除操作后同步联动控件
    if (
      result !== null &&
      (evt.key === KeyMap.Backspace || evt.key === KeyMap.Delete)
    ) {
      this._syncAssociationAfterDeletion()
    }
    return result
  }

  public cut(): number {
    const result = super.cut()
    if (result !== -1) {
      this._syncAssociationAfterDeletion()
    }
    return result
  }

  // 删除/剪切后根据当前值同步联动控件
  private _syncAssociationAfterDeletion(): void {
    const associationId = this.element.control?.associationId
    if (!associationId || !this.element.controlId) return
    // 从元素列表中提取当前控件的值（不依赖 range，避免控件被整体移除后越界）
    const elementList = this.control.getElementList()
    const controlId = this.element.controlId
    let controlExists = false
    let text = ''
    for (const el of elementList) {
      if (el.controlId === controlId) {
        controlExists = true
        if (el.controlComponent === ControlComponent.VALUE) {
          text += el.value
        }
      }
    }
    // 控件被整体移除时不触发同步
    if (!controlExists) return
    const value: string | number = text ? Number(text) : ''
    this.associationStateManager.setValue(
      associationId,
      value,
      ControlType.NUMBER_FLAG,
      this.control.getDraw(),
      controlId
    )
  }

  public destroy(): void {
    // 清除聚焦的 associationId
    const associationId = this.element.control?.associationId
    if (associationId) {
      this.associationStateManager.setFocusedAssociation(null)
      // 触发重绘以恢复所有联动控件的下划线颜色
      this.control.getDraw().render({
        isSubmitHistory: false,
        isSetCursor: false
      })
    }

    // 调用父类的 destroy 方法
    super.destroy()
  }
}
