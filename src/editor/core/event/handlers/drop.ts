import { IOverrideResult } from '../../override/Override'
import { CanvasEvent } from '../CanvasEvent'
import { pasteImage } from './paste'
import { IElement } from '../../../interface/Element'
import { formatElementList } from '../../../utils/element'

export function drop(evt: DragEvent, host: CanvasEvent) {
  const draw = host.getDraw()
  const { drop: overrideDrop } = draw.getOverride()
  if (overrideDrop) {
    const overrideResult = overrideDrop(evt)
    if ((<IOverrideResult>overrideResult)?.preventDefault !== false) return
  }
  evt.preventDefault()

  const canvasEditorData = evt.dataTransfer?.getData('canvas-editor-elements')
  if (canvasEditorData) {
    try {
      const dragElementList: IElement[] = JSON.parse(canvasEditorData)
      if (!dragElementList.length) return

      const rangeManager = draw.getRange()
      const range = rangeManager.getRange()
      const elementList = draw.getElementList()
      const editorOptions = draw.getOptions()

      const formattedElements = dragElementList.map(el => {
        const newElement = { ...el }
        formatElementList([newElement], {
          isHandleFirstElement: false,
          editorOptions
        })
        return newElement
      })

      const insertIndex = range.startIndex >= 0 ? range.startIndex + 1 : elementList.length
      elementList.splice(insertIndex, 0, ...formattedElements)

      const curIndex = (range.startIndex >= 0 ? range.startIndex : -1) + formattedElements.length
      rangeManager.setRange(curIndex, curIndex)
      draw.render({
        curIndex,
        isCompute: true,
        isSubmitHistory: true,
        isSetCursor: true
      })
      return
    } catch (e) {
      console.error('Failed to parse drag elements:', e)
    }
  }

  const data = evt.dataTransfer?.getData('text')
  if (data) {
    host.input(data)
  } else {
    const files = evt.dataTransfer?.files
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type.startsWith('image')) {
        pasteImage(host, file)
      }
    }
  }
}
