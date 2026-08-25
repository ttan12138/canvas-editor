import { DeepRequired } from '../interface/Common'
import { IEditorOption } from '../interface/Editor'
import { IElement } from '../interface/Element'
import { createDomFromElementList, zipElementList } from './element'

export interface IClipboardData {
  text: string
  elementList: IElement[]
}

// 每个编辑器实例独立的剪贴板数据（以容器DOM为key）
const clipboardDataMap = new WeakMap<HTMLDivElement, IClipboardData>()

export function setClipboardData(
  data: IClipboardData,
  container: HTMLDivElement
) {
  clipboardDataMap.set(container, data)
}

export function getClipboardData(
  container: HTMLDivElement
): IClipboardData | null {
  return clipboardDataMap.get(container) || null
}

export function removeClipboardData(container: HTMLDivElement) {
  clipboardDataMap.delete(container)
}

export async function writeClipboardItem(
  text: string,
  html: string,
  elementList: IElement[],
  container: HTMLDivElement
) {
  if (!text && !html && !elementList.length) return
  const plainText = new Blob([text], { type: 'text/plain' })
  const htmlText = new Blob([html], { type: 'text/html' })
  if (window.ClipboardItem) {
    // @ts-ignore
    const item = new ClipboardItem({
      [plainText.type]: plainText,
      [htmlText.type]: htmlText
    })
    await window.navigator.clipboard.write([item])
  } else {
    const fakeElement = document.createElement('div')
    fakeElement.setAttribute('contenteditable', 'true')
    fakeElement.innerHTML = html
    document.body.append(fakeElement)
    // add new range
    const selection = window.getSelection()
    const range = document.createRange()
    // 增加尾行换行字符避免dom复制缺失
    const br = document.createElement('span')
    br.innerText = '\n'
    fakeElement.append(br)
    // 扩选选区并执行复制
    range.selectNodeContents(fakeElement)
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.execCommand('copy')
    fakeElement.remove()
  }
  // 编辑器结构化数据（按编辑器实例隔离）
  setClipboardData({ text, elementList }, container)
}

export async function writeElementList(
  elementList: IElement[],
  options: DeepRequired<IEditorOption>,
  container: HTMLDivElement
) {
  // 先压缩控件元素（PREFIX/POSTFIX→CONTROL），避免DOM中重复渲染控件值
  const zippedElementList = zipElementList(elementList)
  const clipboardDom = createDomFromElementList(zippedElementList, options)
  // 写入剪贴板
  document.body.append(clipboardDom)
  const text = clipboardDom.innerText
  // 先追加后移除，否则innerText无法解析换行符
  clipboardDom.remove()
  const html = clipboardDom.innerHTML
  if (!text && !html && !zippedElementList.length) return
  await writeClipboardItem(text, html, zippedElementList, container)
}

export function getIsClipboardContainFile(clipboardData: DataTransfer) {
  let isFile = false
  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i]
    if (item.kind === 'file') {
      isFile = true
      break
    }
  }
  return isFile
}
