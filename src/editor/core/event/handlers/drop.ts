import { IOverrideResult } from '../../override/Override'
import { CanvasEvent } from '../CanvasEvent'
import { pasteImage } from './paste'
import { IElement } from '../../../interface/Element'
import { formatElementList } from '../../../utils/element'
import {
  applyCrossEditorListPolicy,
  stripRedundantLeadingBreak,
  isCrossEditorDrag,
  getDragSourceDraw,
  clearDragSourceDraw
} from '../dragState'

export function drop(evt: DragEvent, host: CanvasEvent) {
  const draw = host.getDraw()
  const { drop: overrideDrop } = draw.getOverride()
  if (overrideDrop) {
    const overrideResult = overrideDrop(evt)
    if ((<IOverrideResult>overrideResult)?.preventDefault !== false) {
      return
    }
  }
  evt.preventDefault()

  const canvasEditorData = evt.dataTransfer?.getData('canvas-editor-elements')
  console.log('[DEBUG drag] drop 触发, canvasEditorData 长度=',
    canvasEditorData ? canvasEditorData.length : 'null/空',
    'dataTransfer.types=', evt.dataTransfer?.types)
  if (canvasEditorData) {
    try {
      const dragElementList: IElement[] = JSON.parse(canvasEditorData)
      if (!dragElementList.length) return

      const rangeManager = draw.getRange()
      const range = rangeManager.getRange()
      const elementList = draw.getElementList()
      const insertIndex =
        range.startIndex >= 0 ? range.startIndex + 1 : elementList.length
      const sourceDraw = getDragSourceDraw()
      const crossEditor = isCrossEditorDrag(draw) || sourceDraw === null
      console.log('[DEBUG drag] drop 同/跨编辑器插入: range.startIndex=',
        range.startIndex, 'range.endIndex=', range.endIndex,
        'insertIndex=', insertIndex,
        'elementListLen=', elementList.length,
        'crossEditor=', crossEditor)

      // 跨编辑器拖拽列表策略：
      // - 拖入元素携带源编辑器列表结构时拍平为文字与换行（不带入列表样式）；
      // - 落点位于目标编辑器列表项中时，拍平后的文本继承落点列表属性。
      // 判定“跨编辑器”：
      //  - 同页面内从其它编辑器实例拖来（dragSourceDraw 存在且不等于当前编辑器）；
      //  - 来自其它页面/窗口/应用（本页面未记录到拖拽源，dragSourceDraw 为 null）。
      // 仅当同页面内且拖拽源就是当前编辑器自身时，才视为“同编辑器内拖拽”（保留原有结构）。
      const processedElementList = crossEditor
        ? applyCrossEditorListPolicy(dragElementList, elementList, insertIndex)
        : dragElementList

      // 拖拽插入点处的换行去重：插入点前一个元素以段落换行结尾时，
      // 忽略待插入内容开头的段落换行，避免产生多余空行。
      stripRedundantLeadingBreak(
        processedElementList,
        elementList[insertIndex - 1]
      )

      const editorOptions = draw.getOptions()

      console.log('[DEBUG drag] drop 落地前元素列表(processed)=', processedElementList.map(e => ({
        type: e.type, value: e.value, control: e.control?.type, listId: e.listId, listType: e.listType
      })))

      const formattedElements = processedElementList.map(el => {
        const newElement = { ...el }
        formatElementList([newElement], {
          isHandleFirstElement: false,
          editorOptions
        })
        return newElement
      })

      elementList.splice(insertIndex, 0, ...formattedElements)

      const curIndex =
        (range.startIndex >= 0 ? range.startIndex : -1) +
        formattedElements.length
      rangeManager.setRange(curIndex, curIndex)
      draw.render({
        curIndex,
        isCompute: true,
        isSubmitHistory: true,
        isSetCursor: true
      })
      // 拖拽结束，清掉源编辑器记录，避免影响后续判断
      clearDragSourceDraw()
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
