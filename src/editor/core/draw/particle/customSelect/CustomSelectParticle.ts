import { ControlComponent, ControlType } from '../../../../dataset/enum/Control'
import { DeepRequired } from '../../../../interface/Common'
import { IEditorOption } from '../../../../interface/Editor'
import { IElement } from '../../../../interface/Element'
import { IRow } from '../../../../interface/Row'
import { AssociationStateManager } from '../../control/association/AssociationStateManager'
import { Draw } from '../../Draw'

export interface ICustomSelectSvgConfig {
  size?: number
  color?: string
  disabledColor?: string
  hoverColor?: string
  syncColor?: string
}

export interface ICustomSelectParticleRenderOption {
  ctx: CanvasRenderingContext2D
  x: number
  y: number
  row: IRow
  index: number
}

export class CustomSelectParticle {
  private draw: Draw
  private options: DeepRequired<IEditorOption>
  private stateManager: AssociationStateManager

  constructor(draw: Draw) {
    this.draw = draw
    this.options = this.draw.getOptions()
    this.stateManager = AssociationStateManager.getInstance()
  }

  public render(payload: ICustomSelectParticleRenderOption): void {
    const { ctx, x, y, index, row } = payload
    const element = row.elementList[index]
    if (!element.control) return
    if (element.control.type !== ControlType.CUSTOM_SELECT) return
    if (element.controlComponent !== ControlComponent.POSTFIX) return

    const control = element.control
    const associationId = control.associationId
    const hasAssociation = !!associationId

    const metrics = element.metrics
    const scale = this.options.scale
    const svgSize = (element.size || metrics.height) * scale * 0.8
    // 图标左边缘距左侧文字 0.7 个图标宽度
    const centerX = x + svgSize * 0.1 + svgSize / 2
    // 图标下边缘与文字下边缘对齐：文字基线 = y + row.ascent（与文字绘制基线一致），
    // 文字下边缘 = 基线 + descent。随行距变化基线与文字同步移动，对齐关系稳定固定。
    // 图标 SVG 在 24x24 视窗内上下有留白，整体再向下偏移一点，
    // 使箭头视觉上更贴近文字下边缘（比例可按需调整）
    const baselineY = y + row.ascent
    const descent = this.draw.getElementTextDescent(element)
    const iconOffsetY = svgSize * 0.2
    const centerY = baselineY + descent - svgSize / 2 + iconOffsetY

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
      this.drawChevronIcon(ctx, centerX, centerY, size)
    }

    ctx.restore()
  }

  private drawChevronIcon(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    const scale = size / 24
    const toX = (vx: number) => centerX + (vx - 12) * scale
    const toY = (vy: number) => centerY + (vy - 12) * scale
    const lineWidth = Math.max(1, 2 * scale)

    ctx.beginPath()
    ctx.strokeStyle = this.options.selector.arrowBackgroundColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.moveTo(toX(6), toY(9))
    ctx.lineTo(toX(12), toY(15))
    ctx.lineTo(toX(18), toY(9))
    ctx.stroke()
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
