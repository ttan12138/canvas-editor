import { FlexDirection, LocationPosition } from '../dataset/enum/Common'
import {
  ControlType,
  ControlIndentation,
  ControlState
} from '../dataset/enum/Control'
import { EditorZone } from '../dataset/enum/Editor'
import { MoveDirection } from '../dataset/enum/Observer'
import { RowFlex } from '../dataset/enum/Row'
import { IDrawOption } from './Draw'
import { IElement } from './Element'
import { IPositionContext } from './Position'
import { IRange } from './Range'
import { IRow, IRowElement } from './Row'

export interface IValueSet {
  value: string
  code: string
}

// 编程式插入控件的参数：单选 / 多选 / 数值输入框共用
export interface IAddControlOption {
  valueSets?: IValueSet[] // 单选 / 多选的可选项
  value?: string | null // 控件初始值（选择类可传已有 code 或 value）
  placeholder?: string // 占位提示
  conceptId?: string // 概念 id
  prefix?: string // 控件前缀（整体前缀，如 '\u200c'）
  postfix?: string // 控件后缀（整体后缀，如 '\u200c'）
  min?: number // 数值输入框最小值
  max?: number // 数值输入框最大值
  underline?: boolean // 控件下划线
  minWidth?: number // 控件最小宽度
}

// 选择类控件结构化值（保留 groupIds、underline、highlight 等属性）
export interface IControlStructValue {
  value: string
  groupIds?: string[]
  underline?: boolean
  underlineColor?: string
  highlight?: string
  bold?: boolean
  italic?: boolean
  strikeout?: boolean
  color?: string
  font?: string
  size?: number
  extension?: unknown
  [key: string]: unknown
}

// 多选控件选项值
export interface IControlSelectValue {
  value: string
  code: string
  structValues?: IControlStructValue[]
}

// 按 groupId 聚合：连续文字片段
export interface IGroupTextSpan {
  value: string
  // 在纯文本中的起始下标
  startIndex: number
  // 在纯文本中的结束下标（不含）
  endIndex: number
}

// 按 groupId 聚合返回项
export interface IGroupTextItem {
  groupId: string
  texts: IGroupTextSpan[]
}

// 更新指定 groupId 分组入参
export interface IUpdateGroupOption {
  // 目标 groupId
  groupId: string
  // 合并后应用于元素的属性（如 value、underline、highlight 等）
  options: Partial<IElement>
}

export interface IControlSelect {
  code: string | null
  valueSets: IValueSet[]
  isMultiSelect?: boolean
  multiSelectDelimiter?: string
  // 单选控件结构化值
  structValues?: IControlStructValue[]
  // 多选控件选项值列表
  values?: IControlSelectValue[]
  selectExclusiveOptions?: {
    inputAble?: boolean
  }
}

export interface IControlCheckbox {
  code: string | null
  min?: number
  max?: number
  flexDirection: FlexDirection
  valueSets: IValueSet[]
}

export interface IControlRadio {
  code: string | null
  flexDirection: FlexDirection
  valueSets: IValueSet[]
}

export interface IControlDate {
  dateFormat?: string
}

export interface IControlNumber {
  numberExclusiveOptions?: {
    calculatorDisabled?: boolean
    min?: number
    max?: number
  }
}

export interface IControlHighlightRule {
  keyword: string
  alpha?: number
  backgroundColor?: string
}

export interface IControlHighlight {
  ruleList: IControlHighlightRule[]
  id?: string
  conceptId?: string
}

export interface IControlRule {
  deletable?: boolean
  disabled?: boolean
  pasteDisabled?: boolean
  hide?: boolean
}

export interface IControlBasic {
  type: ControlType
  value?: IElement[] | string | null
  placeholder?: string
  conceptId?: string
  groupId?: string
  prefix?: string
  postfix?: string
  minWidth?: number
  underline?: boolean
  border?: boolean
  extension?: unknown
  indentation?: ControlIndentation
  rowFlex?: RowFlex
  preText?: string
  postText?: string
  associationId?: string
}

export interface IControlStyle {
  font?: string
  size?: number
  bold?: boolean
  highlight?: string
  italic?: boolean
  strikeout?: boolean
}

export type IControl = IControlBasic &
  IControlRule &
  Partial<IControlStyle> &
  Partial<IControlSelect> &
  Partial<IControlCheckbox> &
  Partial<IControlRadio> &
  Partial<IControlDate> &
  Partial<IControlNumber>

export interface IControlOption {
  placeholderColor?: string
  defaultValueColor?: string
  selectValueColor?: string
  highNumberColor?: string
  lowNumberColor?: string
  bracketColor?: string
  prefix?: string
  postfix?: string
  borderWidth?: number
  borderColor?: string
  activeBackgroundColor?: string
  disabledBackgroundColor?: string
  existValueBackgroundColor?: string
  noValueBackgroundColor?: string
}

export interface IControlInitOption {
  index: number
  isTable?: boolean
  trIndex?: number
  tdIndex?: number
  tdValueIndex?: number
}

export interface IControlInitResult {
  newIndex: number
}

export interface IControlInstance {
  setElement(element: IElement): void
  getElement(): IElement
  getValue(context?: IControlContext): IElement[]
  setValue(
    data: IElement[],
    context?: IControlContext,
    options?: IControlRuleOption
  ): number
  keydown(evt: KeyboardEvent): number | null
  cut(): number
}

export interface IControlContext {
  range?: IRange
  elementList?: IElement[]
}

export interface IControlRuleOption {
  isIgnoreDisabledRule?: boolean
  isIgnoreDeletedRule?: boolean
  isAddPlaceholder?: boolean
  isSyncAssociation?: boolean
  isForceUpdate?: boolean
  // 实时更新正文时（如下拉面板内的输入框 oninput）不销毁已打开的弹窗
  isSkipDestroy?: boolean
}

export interface IGetControlValueOption {
  id?: string
  groupId?: string
  conceptId?: string
  areaId?: string
}

export type IGetControlValueResult = (Omit<IControl, 'value'> & {
  value: string | null
  innerText: string | null
  zone: EditorZone
  elementList?: IElement[]
})[]

export interface ISetControlValueOption {
  id?: string
  groupId?: string
  conceptId?: string
  areaId?: string
  value: string | IElement[] | null
  isSubmitHistory?: boolean
}

// 修改单选 / 多选控件可选项
export interface ISetControlValueSetsOption {
  id?: string
  groupId?: string
  conceptId?: string
  areaId?: string
  // 新的可选项列表
  valueSets: IValueSet[]
  isSubmitHistory?: boolean
}

export interface ISetControlExtensionOption {
  id?: string
  groupId?: string
  conceptId?: string
  areaId?: string
  extension: unknown
}

export type ISetControlHighlightOption = IControlHighlight[]

export type ISetControlProperties = {
  id?: string
  groupId?: string
  conceptId?: string
  areaId?: string
  properties: Partial<Omit<IControl, 'value'>>
  isSubmitHistory?: boolean
}

// 更新数值控件的最大/最小值（及是否禁用计算器）
export interface ISetNumberRangeOption {
  id?: string
  groupId?: string
  conceptId?: string
  areaId?: string
  min?: number
  max?: number
  calculatorDisabled?: boolean
}

// 修改控件（单选 / 多选 / 数值）的 associationId
export interface ISetControlAssociationIdOption {
  id?: string
  groupId?: string
  conceptId?: string
  areaId?: string
  associationId: string
}

export type IRepaintControlOption = Pick<
  IDrawOption,
  'curIndex' | 'isCompute' | 'isSubmitHistory' | 'isSetCursor'
>

export interface IControlChangeOption {
  context?: IControlContext
  controlElement?: IElement
  controlValue?: IElement[]
}

export interface INextControlContext {
  positionContext: IPositionContext
  nextIndex: number
}

export interface IInitNextControlOption {
  direction?: MoveDirection
}

export interface ILocationControlOption {
  position: LocationPosition
}

export interface ISetControlRowFlexOption {
  row: IRow
  rowElement: IRowElement
  availableWidth: number
  controlRealWidth: number
}

export interface IControlChangeResult {
  state: ControlState
  control: IControl
  controlId: string
}

export interface IControlContentChangeResult {
  control: IControl
  controlId: string
}

export interface IDestroyControlOption {
  isEmitEvent?: boolean
}

export interface IRemoveControlOption {
  id?: string
  conceptId?: string
}
