import {
  EditorMode,
  PageMode,
  PaperDirection,
  RenderMode,
  WordBreak
} from '../dataset/enum/Editor'
import { IBackgroundOption } from './Background'
import { ICheckboxOption } from './Checkbox'
import { IRadioOption } from './Radio'
import { IControlOption } from './Control'
import { ICursorOption } from './Cursor'
import { IFooter } from './Footer'
import { IGroup } from './Group'
import { IHeader } from './Header'
import { ILabelOption } from './Label'
import { IImgCaptionOption, IListOption } from './Element'
import { ILineBreakOption } from './LineBreak'
import { IMargin } from './Margin'
import { IPageBreak } from './PageBreak'
import { IPageNumber } from './PageNumber'
import { IPlaceholder } from './Placeholder'
import { ITitleOption } from './Title'
import { IWatermark } from './Watermark'
import { IZoneOption } from './Zone'
import { ISeparatorOption } from './Separator'
import { ITableOption } from './table/Table'
import { ILineNumberOption } from './LineNumber'
import { IPageBorderOption } from './PageBorder'
import { IBadgeOption } from './Badge'
import { IElement } from './Element'
import { LocationPosition } from '../dataset/enum/Common'
import { IRange } from './Range'
import { IGraffitiData, IGraffitiOption } from './Graffiti'
import { IWhiteSpaceOption } from './WhiteSpace'
import { IMagnifierOption } from './Magnifier'

export interface IEditorData {
  header?: IElement[]
  main: IElement[]
  footer?: IElement[]
  graffiti?: IGraffitiData[]
}

export interface IEditorOption {
  isPlainText?: boolean
  mode?: EditorMode
  locale?: string
  defaultType?: string
  defaultColor?: string
  defaultFont?: string
  defaultSize?: number
  minSize?: number
  maxSize?: number
  defaultBasicRowMarginHeight?: number
  defaultRowMargin?: number
  defaultTabWidth?: number
  width?: number
  height?: number
  scale?: number
  pageGap?: number
  underlineColor?: string
  strikeoutColor?: string
  rangeColor?: string
  rangeAlpha?: number
  rangeMinWidth?: number
  searchMatchColor?: string
  searchNavigateMatchColor?: string
  searchMatchAlpha?: number
  highlightAlpha?: number
  highlightMarginHeight?: number
  resizerColor?: string
  resizerSize?: number
  marginIndicatorSize?: number
  marginIndicatorColor?: string
  margins?: IMargin
  pageMode?: PageMode
  renderMode?: RenderMode
  defaultHyperlinkColor?: string
  paperDirection?: PaperDirection
  inactiveAlpha?: number
  historyMaxRecordCount?: number
  printPixelRatio?: number
  maskMargin?: IMargin
  letterClass?: string[]
  contextMenuDisableKeys?: string[]
  shortcutDisableKeys?: string[]
  scrollContainerSelector?: string
  pageOuterSelectionDisable?: boolean
  wordBreak?: WordBreak
  table?: ITableOption
  header?: IHeader
  footer?: IFooter
  pageNumber?: IPageNumber
  watermark?: IWatermark
  control?: IControlOption
  checkbox?: ICheckboxOption
  radio?: IRadioOption
  cursor?: ICursorOption
  title?: ITitleOption
  placeholder?: IPlaceholder
  group?: IGroup
  pageBreak?: IPageBreak
  zone?: IZoneOption
  background?: IBackgroundOption
  lineBreak?: ILineBreakOption
  whiteSpace?: IWhiteSpaceOption
  separator?: ISeparatorOption
  lineNumber?: ILineNumberOption
  pageBorder?: IPageBorderOption
  badge?: IBadgeOption
  modeRule?: IModeRule
  graffiti?: IGraffitiOption
  label?: ILabelOption
  imgCaption?: IImgCaptionOption
  list?: IListOption
  magnifier?: IMagnifierOption
  // 切换光标（聚焦/点击）时，若光标在可视范围外是否自动滚动到光标位置，默认 true
  isMoveCursorToVisible?: boolean
  // 选择器类控件（下拉选择/自定义下拉/多选/复选框/联动标识）统一颜色配置
  selector?: ISelectorOption
}

// 选择器类控件（SELECT/CUSTOM_SELECT/MULTI_CUSTOM_SELECT/CHECKBOX/联动）颜色配置
export interface ISelectorOption {
  // 下拉列表浮层
  popupBackgroundColor: string // 下拉列表背景颜色
  optionColor: string // 选项未选中时文字颜色
  optionHoverBackgroundColor: string // 选项 hover 背景颜色
  optionHoverColor: string // 选项 hover 文字颜色
  activeOptionColor: string // 选项选中时文字颜色
  activeOptionBackgroundColor: string // 选项选中时背景颜色
  // 复选框（单选/多选通用）
  checkboxBackgroundColor: string // 选中（checked）背景颜色
  checkboxBorderColor: string // 未选中（unchecked）边框颜色（checked 时同用此色作边框）
  checkboxMarkColor: string // 选中（checked）内容颜色（对勾）
  // 数值输入框下边框（三态）
  inputBorderColor: string // 输入框下边框颜色（选项未选中态）
  inputHoverBorderColor: string // 输入框下边框颜色（选项 hover 态）
  inputActiveBorderColor: string // 输入框下边框颜色（选项选中态）
  // 数值输入框占位符（三态）
  inputPlaceholderColor: string // 占位符颜色（选项未选中态）
  inputHoverPlaceholderColor: string // 占位符颜色（选项 hover 态）
  inputActivePlaceholderColor: string // 占位符颜色（选项选中态）
  // 选项分割线
  dividerColor: string // 选项之间分割线颜色
  // 弹窗底部操作提示（hint）颜色，预输入/单选/多选弹窗底部提示条复用
  hintColor?: string // 提示条文字颜色（默认 #E6A23C）
  hintBackgroundColor?: string // 提示条背景颜色（默认 #FFFBE6）
  // 画布正文渲染（CUSTOM_SELECT 选中值文字颜色，控件模式与文本模式均生效）
  customSelectValueColor: string
  // 画布正文渲染（MULTI_CUSTOM_SELECT 选中值文字颜色，控件模式与文本模式均生效）
  multiSelectValueColor: string
  // 纯文本模式（ControlRenderMode.TEXT）下 CUSTOM_SELECT 选中值文字颜色
  customSelectTextValueColor: string
  // 纯文本模式（ControlRenderMode.TEXT）下 MULTI_CUSTOM_SELECT 选中值文字颜色
  multiSelectTextValueColor: string
  // 下拉箭头（CUSTOM_SELECT/MULTI_CUSTOM_SELECT 的 POSTFIX）
  arrowBackgroundColor: string // 箭头圆点背景颜色
  arrowColor: string // 箭头颜色
  // 联动标识（带 associationId 的控件）
  associationBackgroundColor: string // 联动标识背景颜色
  associationTextColor: string // 联动标识文字（“联”）颜色
  // 是否显示弹窗中的“添加选项”按钮（单选/多选控件），默认 true
  showAddOption?: boolean
  // 是否显示每个选项右侧的“删除选项”按钮（单选/多选控件），默认 true
  showRemoveOption?: boolean
}

export interface IEditorResult {
  version: string
  data: IEditorData
  options: IEditorOption
}

export interface IEditorHTML {
  header: string
  main: string
  footer: string
}

export type IEditorText = IEditorHTML

export type IUpdateOption = Omit<
  IEditorOption,
  | 'mode'
  | 'width'
  | 'height'
  | 'scale'
  | 'pageGap'
  | 'pageMode'
  | 'paperDirection'
  | 'historyMaxRecordCount'
  | 'scrollContainerSelector'
>

export interface ISetValueOption {
  isSetCursor?: boolean
  // 是否在设置后允许撤销回“本次 setValue 之前”的内容。
  // 默认 false：setValue 会清空历史记录（recovery），不可撤销。
  // 传 true 时，会记录一条历史，使撤销可回到 setValue 之前的状态。
  recordHistory?: boolean
}

export interface IFocusOption {
  rowNo?: number
  range?: IRange
  position?: LocationPosition
  isMoveCursorToVisible?: boolean
}

export interface IPrintModeRule {
  imagePreviewerDisabled?: boolean
  backgroundDisabled?: boolean
  filterEmptyControl?: boolean
}

export interface IReadonlyModeRule {
  imagePreviewerDisabled?: boolean
}

export interface IFormModeRule {
  controlDeletableDisabled?: boolean
}

export interface IModeRule {
  [EditorMode.PRINT]?: IPrintModeRule
  [EditorMode.READONLY]?: IReadonlyModeRule
  [EditorMode.FORM]?: IFormModeRule
}
