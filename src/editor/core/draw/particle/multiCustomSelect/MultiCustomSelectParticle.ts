import { ControlComponent, ControlType } from '../../../../dataset/enum/Control'
import { DeepRequired } from '../../../../interface/Common'
import { IEditorOption } from '../../../../interface/Editor'
import { IElement } from '../../../../interface/Element'
import { IRow } from '../../../../interface/Row'
import { AssociationStateManager } from '../../control/association/AssociationStateManager'
import { Draw } from '../../Draw'

export interface IMultiCustomSelectSvgConfig {
  size?: number
  color?: string
  disabledColor?: string
  hoverColor?: string
  syncColor?: string
}

export interface IMultiCustomSelectParticleRenderOption {
  ctx: CanvasRenderingContext2D
  x: number
  y: number
  row: IRow
  index: number
}

export class MultiCustomSelectParticle {
  private draw: Draw
  private options: DeepRequired<IEditorOption>
  private stateManager: AssociationStateManager

  constructor(draw: Draw) {
    this.draw = draw
    this.options = this.draw.getOptions()
    this.stateManager = AssociationStateManager.getInstance()
  }

  public render(payload: IMultiCustomSelectParticleRenderOption): void {
    const { ctx, x, y, index, row } = payload
    const element = row.elementList[index]
    if (!element.control) return
    if (element.control.type !== ControlType.MULTI_CUSTOM_SELECT) return
    if (element.controlComponent !== ControlComponent.POSTFIX) return

    const control = element.control
    const associationId = control.associationId
    const hasAssociation = !!associationId

    const metrics = element.metrics
    const scale = this.options.scale
    const svgSize = (element.size || metrics.height) * scale * 0.8
    const centerX = x + metrics.width / 2
    // 底部对齐：y 为元素顶边，图标底边与行底部对齐（不再垂直居中）
    const centerY = y + row.height - svgSize / 2
    this.drawSelectArrow(ctx, centerX, centerY, svgSize, hasAssociation)
  }

  private drawSelectArrow(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number,
    hasAssociation: boolean
  ): void {
    ctx.save()

    if (hasAssociation) {
      this.drawChainLinkIcon(ctx, centerX, centerY, size)
    } else {
      this.drawMultiSelectIcon(ctx, centerX, centerY, size)
    }

    ctx.restore()
  }

  private drawMultiSelectIcon(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const scale = size / 24
    const toX = (vx: number) => centerX + (vx - 12) * scale
    const toY = (vy: number) => centerY + (vy - 12) * scale
    const lineWidth = Math.max(1, 2 * scale)

    ctx.save()
    ctx.strokeStyle = this.options.selector.arrowBackgroundColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    ctx.moveTo(toX(13), toY(5))
    ctx.lineTo(toX(21), toY(5))
    ctx.moveTo(toX(13), toY(12))
    ctx.lineTo(toX(21), toY(12))
    ctx.moveTo(toX(13), toY(19))
    ctx.lineTo(toX(21), toY(19))
    ctx.moveTo(toX(3), toY(7))
    ctx.lineTo(toX(5), toY(9))
    ctx.lineTo(toX(9), toY(5))
    ctx.moveTo(toX(3), toY(17))
    ctx.lineTo(toX(5), toY(19))
    ctx.lineTo(toX(9), toY(15))
    ctx.stroke()

    ctx.restore()
  }

  private drawChainLinkIcon(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const scale = size / 24
    const toX = (vx: number) => centerX + (vx - 12) * scale
    const toY = (vy: number) => centerY + (vy - 12) * scale
    const lineWidth = Math.max(1, 2 * scale)

    ctx.save()
    ctx.strokeStyle = this.options.selector.associationBackgroundColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // 左链环：开口朝右的 “(” 形（对应 SVG link-2 左半弧）
    ctx.beginPath()
    ctx.moveTo(toX(9), toY(17))
    ctx.lineTo(toX(7), toY(17))
    ctx.arc(toX(7), toY(12), 5 * scale, Math.PI / 2, (3 * Math.PI) / 2, false)
    ctx.lineTo(toX(9), toY(7))
    ctx.stroke()

    // 右链环：开口朝左的 “)” 形（对应 SVG link-2 右半弧）
    ctx.beginPath()
    ctx.moveTo(toX(15), toY(7))
    ctx.lineTo(toX(17), toY(7))
    ctx.arc(toX(17), toY(12), 5 * scale, -Math.PI / 2, Math.PI / 2, false)
    ctx.lineTo(toX(15), toY(17))
    ctx.stroke()

    // 中间连接线（对应 SVG link-2 的 <line>）
    ctx.beginPath()
    ctx.moveTo(toX(8), toY(12))
    ctx.lineTo(toX(16), toY(12))
    ctx.stroke()

    ctx.restore()
  }

  public getAssociationId(element: IElement): string | undefined {
    return element.control?.associationId
  }

  public isSyncing(element: IElement): boolean {
    const associationId = element.control?.associationId
    if (!associationId) return false
    return this.stateManager.isSyncing(associationId)
  }
}
