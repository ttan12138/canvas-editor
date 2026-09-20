export interface ICursorOption {
  width?: number
  color?: string
  dragWidth?: number
  dragColor?: string
  dragFloatImageDisabled?: boolean
  // 控件模式下，光标位于控件内时使用的宽度（px）。不设置则沿用 width。
  controlWidth?: number
  // 控件模式下，光标位于控件内时使用的颜色。不设置则沿用 color。
  controlColor?: string
}
