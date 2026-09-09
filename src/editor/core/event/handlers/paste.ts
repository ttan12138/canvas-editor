import { ZERO } from '../../../dataset/constant/Common'
import { VIRTUAL_ELEMENT_TYPE } from '../../../dataset/constant/Element'
import { ElementType } from '../../../dataset/enum/Element'
import { IElement } from '../../../interface/Element'
import { IPasteOption } from '../../../interface/Event'
import {
  getClipboardData,
  getIsClipboardContainFile,
  removeClipboardData
} from '../../../utils/clipboard'
import {
  formatElementContext,
  getElementListByHTML
} from '../../../utils/element'
import { CanvasEvent } from '../CanvasEvent'
import { IOverrideResult } from '../../override/Override'
import { normalizeLineBreak } from '../../../utils'

export function pasteElement(host: CanvasEvent, elementList: IElement[]) {
  const draw = host.getDraw()
  if (
    draw.isReadonly() ||
    draw.isDisabled() ||
    draw.getControl().getIsDisabledPasteControl()
  ) {
    return
  }
  const rangeManager = draw.getRange()
  const { startIndex } = rangeManager.getRange()
  const originalElementList = draw.getElementList()
  // 全选粘贴无需格式化上下文
  if (~startIndex && !rangeManager.getIsSelectAll()) {
    // 如果是复制到虚拟元素里，则粘贴列表的虚拟元素需扁平化处理，避免产生新的虚拟元素
    const anchorElement = originalElementList[startIndex]
    if (anchorElement?.titleId || anchorElement?.listId) {
      let start = 0
      while (start < elementList.length) {
        const pasteElement = elementList[start]
        if (anchorElement.titleId && /^\n/.test(pasteElement.value)) {
          break
        }
        if (VIRTUAL_ELEMENT_TYPE.includes(pasteElement.type!)) {
          elementList.splice(start, 1)
          if (pasteElement.valueList) {
            for (let v = 0; v < pasteElement.valueList.length; v++) {
              const element = pasteElement.valueList[v]
              if (element.value === ZERO || element.value === '\n') {
                continue
              }
              elementList.splice(start, 0, element)
              start++
            }
          }
          start--
        }
        start++
      }
    }
    formatElementContext(originalElementList, elementList, startIndex, {
      isBreakWhenWrap: true,
      editorOptions: draw.getOptions()
    })
  }
  // 粘贴内容优先使用localStorage中存储的字号
  const FONT_SIZE_KEY = 'crealife_canvas_font_size'
  const storedSize = parseInt(localStorage.getItem(FONT_SIZE_KEY) || '')
  if (storedSize > 0) {
    const applyFontSize = (list: IElement[]) => {
      list.forEach(el => {
        if (el.type !== ElementType.IMAGE && el.type !== ElementType.LATEX) {
          el.size = storedSize
        }
        if (el.valueList?.length) {
          applyFontSize(el.valueList)
        }
        // 控件内部文字字号
        const control = el.control
        if (control) {
          control.size = storedSize
          // control.value 为 IElement[] 时递归处理
          if (Array.isArray(control.value)) {
            applyFontSize(control.value)
          }
          // 单选结构化值
          if (control.structValues?.length) {
            control.structValues.forEach(sv => {
              sv.size = storedSize
            })
          }
          // 多选结构化值
          if (control.values?.length) {
            control.values.forEach(v => {
              v.structValues?.forEach(sv => {
                sv.size = storedSize
              })
            })
          }
        }
      })
    }
    applyFontSize(elementList)
  }
  draw.insertElementList(elementList)
}

export function pasteHTML(host: CanvasEvent, htmlText: string) {
  const draw = host.getDraw()
  if (draw.isReadonly() || draw.isDisabled()) return
  const elementList = getElementListByHTML(htmlText, {
    innerWidth: draw.getOriginalInnerWidth()
  })
  // 格式化elementList
  elementList.forEach(item => {
    item.color = undefined
    item.size = undefined
    item.bold = false
    item.underline = false
  })

  pasteElement(host, elementList)
}

export function pasteImage(host: CanvasEvent, file: File | Blob) {
  const draw = host.getDraw()
  if (draw.isReadonly() || draw.isDisabled()) return
  // 自定义粘贴图片事件
  const { pasteImage: overridePasteImage } = draw.getOverride()
  if (overridePasteImage) {
    const overrideResult = overridePasteImage(file)
    if ((<IOverrideResult>overrideResult)?.preventDefault !== false) return
  }
  const rangeManager = draw.getRange()
  const { startIndex } = rangeManager.getRange()
  const elementList = draw.getElementList()
  // 创建文件读取器
  const fileReader = new FileReader()
  fileReader.readAsDataURL(file)
  fileReader.onload = () => {
    // 计算宽高
    const image = new Image()
    const value = fileReader.result as string
    image.src = value
    image.onload = () => {
      const imageElement: IElement = {
        value,
        type: ElementType.IMAGE,
        width: image.width,
        height: image.height
      }
      if (~startIndex) {
        formatElementContext(elementList, [imageElement], startIndex, {
          editorOptions: draw.getOptions()
        })
      }
      draw.insertElementList([imageElement])
    }
  }
}

export function pasteByEvent(host: CanvasEvent, evt: ClipboardEvent) {
  const draw = host.getDraw()
  if (draw.isReadonly() || draw.isDisabled()) return
  const clipboardData = evt.clipboardData
  if (!clipboardData) return
  // 自定义粘贴事件
  const { paste } = draw.getOverride()
  if (paste) {
    const overrideResult = paste(evt)
    // 默认阻止默认事件
    if ((<IOverrideResult>overrideResult)?.preventDefault !== false) return
  }
  // 优先读取编辑器内部粘贴板数据（粘贴板不包含文件时）
  if (!getIsClipboardContainFile(clipboardData)) {
    const clipboardText = clipboardData.getData('text')
    const editorClipboardData = getClipboardData(draw.getContainer())
    // 不同系统间默认换行符不同 windows:\r\n mac:\n
    if (
      editorClipboardData &&
      normalizeLineBreak(clipboardText) ===
        normalizeLineBreak(editorClipboardData.text)
    ) {
      pasteElement(host, editorClipboardData.elementList)
      return
    }
  }
  removeClipboardData(draw.getContainer())
  // 从粘贴板提取数据
  let isHTML = false
  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i]
    if (item.type === 'text/html') {
      isHTML = true
      break
    }
  }
  if(isHTML && typeof draw.getOptions()?.isPlainText != 'undefined'){
    isHTML = !draw.getOptions()?.isPlainText
  }
  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i]
    if (item.kind === 'string') {
      if (item.type === 'text/plain' && !isHTML) {
        item.getAsString(plainText => {
          host.input(plainText)
        })
        break
      }
      if (item.type === 'text/html' && isHTML) {
        item.getAsString(htmlText => {
          pasteHTML(host, htmlText)
        })
        break
      }
    } else if (item.kind === 'file') {
      if (item.type.includes('image')) {
        const file = item.getAsFile()
        if (file) {
          pasteImage(host, file)
        }
      }
    }
  }
}

export async function pasteByApi(host: CanvasEvent, options?: IPasteOption, pasteData?: string) {
  const draw = host.getDraw()
  if (draw.isReadonly() || draw.isDisabled()) return
  const { paste } = draw.getOverride()
  if (paste) {
    const overrideResult = paste()
    if ((<IOverrideResult>overrideResult)?.preventDefault !== false) return
  }
  let clipboardText = pasteData || ''
  let readClipboardSuccess = false

  // pasteData不为空时，直接使用传入数据，跳过系统剪贴板读取
  if (pasteData) {
    readClipboardSuccess = true
    // 激活光标
    const cursor = draw.getCursor()
    cursor.focus()
    // 如果有选区，激活选区（确保光标位置已设置）
    const rangeManager = draw.getRange()
    const { startIndex, endIndex } = rangeManager.getRange()
    if (~startIndex && ~endIndex) {
      const position = draw.getPosition()
      if (!position.getCursorPosition()) {
        const positionList = position.getPositionList()
        const cursorIndex = rangeManager.getIsCollapsed()
          ? startIndex
          : endIndex
        if (positionList[cursorIndex]) {
          position.setCursorPosition(positionList[cursorIndex])
        } else {
          // positionList中没有对应索引，尝试用setRange重新激活
          rangeManager.setRange(startIndex, endIndex)
          draw.render({
            curIndex: endIndex,
            isSubmitHistory: false
          })
        }
      }
    } else {
      // range无效，尝试恢复到文档末尾
      const positionList = draw.getPosition().getPositionList()
      if (positionList.length) {
        const lastIdx = positionList.length - 1
        rangeManager.setRange(lastIdx, lastIdx)
        draw.getPosition().setCursorPosition(positionList[lastIdx])
      }
    }
  } else {
    try {
      if(navigator?.clipboard?.readText){
        clipboardText = await navigator.clipboard.readText()
      }
      if(clipboardText){
        readClipboardSuccess = true
      }
    } catch (e) {
      console.warn('Failed to read clipboard text:', e)
    }
  }
  const editorClipboardData = getClipboardData(draw.getContainer())

  if (editorClipboardData) {
    if (!readClipboardSuccess || !clipboardText) {
      pasteElement(host, editorClipboardData.elementList)
      return
    }
    if (normalizeLineBreak(clipboardText) === normalizeLineBreak(editorClipboardData.text)) {
      pasteElement(host, editorClipboardData.elementList)
      return
    }

    removeClipboardData(draw.getContainer())
  }

  // pasteData已提供时直接使用，跳过异步剪贴板读取避免光标失焦
  if (options?.isPlainText || pasteData) {
    if (clipboardText) {
      host.input(clipboardText)
    }
  } else {
    try {
      let clipboardData
      if(navigator?.clipboard?.read){
        clipboardData = await navigator.clipboard.read()
        let isHTML = false
        for (const item of clipboardData) {
          if (item.types.includes('text/html')) {
            isHTML = true
            break
          }
        }
        for (const item of clipboardData) {
          if (item.types.includes('text/plain') && !isHTML) {
            const textBlob = await item.getType('text/plain')
            const text = await textBlob.text()
            if (text) {
              host.input(text)
            }
          } else if (item.types.includes('text/html') && isHTML) {
            const htmlTextBlob = await item.getType('text/html')
            const htmlText = await htmlTextBlob.text()
            if (htmlText) {
              pasteHTML(host, htmlText)
            }
          } else if (item.types.some(type => type.startsWith('image/'))) {
            const type = item.types.find(type => type.startsWith('image/'))!
            const imageBlob = await item.getType(type)
            pasteImage(host, imageBlob)
          }
        }
      }else{
        if (clipboardText) {
          host.input(clipboardText)
        }
      }

    } catch (e) {
      console.warn('Failed to read clipboard data:', e)
      if (clipboardText) {
        host.input(clipboardText)
      }
    }
  }
}
