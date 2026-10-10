import { DeepRequired } from '../../../../interface/Common'
import { IEditorOption } from '../../../../interface/Editor'
import { IElement } from '../../../../interface/Element'
// import { AssociationStateManager } from '../../control/association/AssociationStateManager'
import { Draw } from '../../Draw'

export enum ArrowDirection {
  UP = 'up',
  DOWN = 'down'
}

export interface INumberFlagRenderOption {
  ctx: CanvasRenderingContext2D
  x: number
  y: number
  height: number
  value: number
  min?: number
  max?: number
  element?: IElement
}

export class NumberFlagParticle {
  private draw: Draw
  private options: DeepRequired<IEditorOption>
  // private stateManager: AssociationStateManager

  constructor(draw: Draw) {
    this.draw = draw
    this.options = this.draw.getOptions()
    // this.stateManager = AssociationStateManager.getInstance()
  }

  public render(option: INumberFlagRenderOption) {
    const { ctx, x, y, height, value, min, max } = option

    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return
    }

    if (min === undefined && max === undefined) {
      return
    }

    let direction: ArrowDirection | null = null

    if (max !== undefined && value > max) {
      direction = ArrowDirection.UP
    } else if (min !== undefined && value < min) {
      direction = ArrowDirection.DOWN
    }

    if (!direction) {
      return
    }

    this.drawArrow(ctx, x, y, height, direction)
  }

  private drawArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    height: number,
    direction: ArrowDirection
  ) {
    const color =
      direction === ArrowDirection.DOWN
        ? this.options.control.lowNumberColor
        : this.options.control.highNumberColor

    this.drawRulerIcon(ctx, x, y, height, color)
  }

  private drawRulerIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    height: number,
    color: string
  ) {
    const scale = height / 24
    ctx.save()
    // SVG ruler 是绕中心旋转 45° 的圆角矩形，刻度线位于其“上”半部
    ctx.translate(x, y)
    ctx.rotate(Math.PI / 4)
    ctx.lineWidth = Math.max(1, 2 * scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = color

    // 矩形本体：长 22.6、宽 8.49、圆角半径 2.4（以 viewBox 0-24 为基准，乘以 scale）
    const w = 22.6 * scale
    const h = 8.49 * scale
    const r = 2.4 * scale
    this.roundRectPath(ctx, -w / 2, -h / 2, w, h, r)
    ctx.stroke()

    // 四条刻度线：旋转后在本地坐标下为竖直线
    const tickTop = -1.414 * scale
    const tickBottom = -4.243 * scale
    const tickXs = [-6.364, -2.121, 2.121, 6.364].map((v) => v * scale)
    ctx.beginPath()
    for (const tx of tickXs) {
      ctx.moveTo(tx, tickTop)
      ctx.lineTo(tx, tickBottom)
    }
    ctx.stroke()

    ctx.restore()
  }

  private roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2))
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + w - radius, y)
    ctx.arcTo(x + w, y, x + w, y + radius, radius)
    ctx.lineTo(x + w, y + h - radius)
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
    ctx.lineTo(x + radius, y + h)
    ctx.arcTo(x, y + h, x, y + h - radius, radius)
    ctx.lineTo(x, y + radius)
    ctx.arcTo(x, y, x + radius, y, radius)
    ctx.closePath()
  }
}
