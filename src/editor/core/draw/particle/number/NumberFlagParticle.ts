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
    const shaftHeight = height * 0.8
    const headSize = height * 0.2
    const headAngle = Math.PI / 5

    ctx.save()
    ctx.lineWidth = Math.max(1, height * 0.08)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()

    if (direction === ArrowDirection.DOWN) {
      ctx.strokeStyle = this.options.control.lowNumberColor
      ctx.moveTo(x, y - shaftHeight / 2)
      ctx.lineTo(x, y + shaftHeight / 2)
      ctx.moveTo(x - headSize * Math.sin(headAngle), y + shaftHeight / 2 - headSize * Math.cos(headAngle))
      ctx.lineTo(x, y + shaftHeight / 2)
      ctx.lineTo(x + headSize * Math.sin(headAngle), y + shaftHeight / 2 - headSize * Math.cos(headAngle))
    } else {
      ctx.strokeStyle = this.options.control.highNumberColor
      ctx.moveTo(x, y + shaftHeight / 2)
      ctx.lineTo(x, y - shaftHeight / 2)
      ctx.moveTo(x - headSize * Math.sin(headAngle), y - shaftHeight / 2 + headSize * Math.cos(headAngle))
      ctx.lineTo(x, y - shaftHeight / 2)
      ctx.lineTo(x + headSize * Math.sin(headAngle), y - shaftHeight / 2 + headSize * Math.cos(headAngle))
    }

    ctx.stroke()

    ctx.restore()
  }
}
