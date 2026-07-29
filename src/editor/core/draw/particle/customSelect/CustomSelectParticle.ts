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
    const fontSize = metrics.height
    const svgSize = fontSize * 0.8

    const centerX = x + metrics.width / 2
    const centerY = y + metrics.height / 2 + metrics.height * 0.7

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

    const circleRadius = size * 0.7

    if (hasAssociation) {
      const text = '联'
      const fontSize = size * 0.85
      const font = fontSize + 'px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif'

      ctx.beginPath()
      ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2)
      ctx.fillStyle = this.options.control.selectValueColor
      ctx.fill()

      ctx.fillStyle = 'white'
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, centerX, centerY + 1)
    } else {
      const arrowWidth = circleRadius * 1.1
      const arrowHeight = circleRadius * 0.9
      const headWidth = arrowWidth * 0.45
      const headHeight = arrowHeight
      const shaftWidth = arrowWidth - headWidth
      const shaftHeight = arrowHeight * 0.4

      ctx.beginPath()
      ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2)
      ctx.fillStyle = this.options.control.selectValueColor
      ctx.fill()

      ctx.fillStyle = 'white'
      ctx.beginPath()

      const startX = centerX - arrowWidth / 2

      ctx.moveTo(startX, centerY - shaftHeight / 2)
      ctx.lineTo(startX + shaftWidth, centerY - shaftHeight / 2)
      ctx.lineTo(startX + shaftWidth, centerY - headHeight / 2)
      ctx.lineTo(startX + arrowWidth, centerY)
      ctx.lineTo(startX + shaftWidth, centerY + headHeight / 2)
      ctx.lineTo(startX + shaftWidth, centerY + shaftHeight / 2)
      ctx.lineTo(startX, centerY + shaftHeight / 2)
      ctx.closePath()
      ctx.fill()
    }

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
