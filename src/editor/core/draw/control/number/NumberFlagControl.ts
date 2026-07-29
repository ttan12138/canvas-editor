import { ControlType } from '../../../../dataset/enum/Control'
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
