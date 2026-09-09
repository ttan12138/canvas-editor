import { ICursorOption } from '../../interface/Cursor'

export const CURSOR_AGENT_OFFSET_HEIGHT = 12

// 代理输入框（隐藏 textarea）宽度，需与 index.css 中 .ce-inputarea 的 width 保持一致。
// 用于 IME 预输入时光标右移时，将其左边界限制在页面内，避免祖先 overflow-x:auto 触发横向滚动条。
export const CURSOR_AGENT_WIDTH = 100

export const defaultCursorOption: Readonly<Required<ICursorOption>> = {
  width: 1,
  color: '#000000',
  dragWidth: 2,
  dragColor: '#0000FF',
  dragFloatImageDisabled: false
}
