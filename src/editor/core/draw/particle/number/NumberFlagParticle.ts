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
}

export class NumberFlagParticle {
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
    const arrowSize = height * 0.65
    const arrowWidth = arrowSize * 0.5
    const arrowHeight = arrowSize * 0.7

    ctx.save()
    ctx.fillStyle = '#FF0000'
    ctx.strokeStyle = '#FF0000'
    ctx.lineWidth = 1

    const centerX = x
    const centerY = y + height / 2

    ctx.beginPath()

    if (direction === ArrowDirection.UP) {
      ctx.moveTo(centerX, centerY - arrowHeight / 2)
      ctx.lineTo(centerX - arrowWidth / 2, centerY + arrowHeight / 2)
      ctx.lineTo(centerX + arrowWidth / 2, centerY + arrowHeight / 2)
      ctx.closePath()
    } else {
      ctx.moveTo(centerX, centerY + arrowHeight / 2)
      ctx.lineTo(centerX - arrowWidth / 2, centerY - arrowHeight / 2)
      ctx.lineTo(centerX + arrowWidth / 2, centerY - arrowHeight / 2)
      ctx.closePath()
    }

    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}
