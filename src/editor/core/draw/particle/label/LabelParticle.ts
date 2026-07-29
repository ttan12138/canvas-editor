import { ControlComponent, ControlType } from '../../../../dataset/enum/Control'
import { ControlRenderMode } from '../../../../dataset/enum/Editor'
import { DeepRequired } from '../../../../interface/Common'
import { IEditorOption } from '../../../../interface/Editor'
import { IRow } from '../../../../interface/Row'
import { Draw } from '../../Draw'

export interface ILabelParticleRenderOption {
  ctx: CanvasRenderingContext2D
  x: number
  y: number
  row: IRow
  index: number
}

export class LabelParticle {
  private draw: Draw
  private options: DeepRequired<IEditorOption>

  constructor(draw: Draw) {
    this.draw = draw
    this.options = this.draw.getOptions()
  }

  public render(payload: ILabelParticleRenderOption): void {
    const { ctx, x, y, index, row } = payload
    const element = row.elementList[index]
    if (!element.control) return
    if (element.control.type !== ControlType.LABEL) return
    if (element.controlComponent !== ControlComponent.VALUE) return

    const isTextMode =
      this.draw.getControlRenderMode() === ControlRenderMode.TEXT

    if (!isTextMode) return

    // 获取文本度量和样式
    const metrics = element.metrics
    if (!metrics) return

    const labelStyle = element.control.labelStyle
    const fontSize = labelStyle?.size || element.size || this.options.defaultSize
    const color = labelStyle?.color || element.color || this.options.defaultColor
    const font = labelStyle?.font || element.font || this.options.defaultFont
    const isBold = labelStyle?.bold !== undefined ? labelStyle.bold : element.bold
    const isItalic = labelStyle?.italic !== undefined ? labelStyle.italic : element.italic

    // 计算文本宽度（labelStyle 可能影响宽度）
    let textWidth: number
    if (labelStyle?.font || labelStyle?.size !== undefined || labelStyle?.bold !== undefined || labelStyle?.italic !== undefined) {
      // 样式被覆盖时重新测量文本宽度
      const boldStr = isBold ? 'bold ' : ''
      const italicStr = isItalic ? 'italic ' : ''
      const measuredFont = `${boldStr}${italicStr}${fontSize}px ${font}`
      ctx.save()
      ctx.font = measuredFont
      textWidth = ctx.measureText(element.value).width
      ctx.restore()
    } else {
      textWidth = metrics.width || 0
    }

    // 在 TEXT 模式下绘制下划线
    const underlineY = y + fontSize * 1.2
    const underlineX = x
    this.drawTextUnderline(ctx, underlineX, underlineY, textWidth, color, fontSize)
  }

  private drawTextUnderline(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    color: string,
    fontSize: number
  ): void {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + width, y)
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, Math.round(fontSize / 16))
    ctx.stroke()
    ctx.restore()
  }
}