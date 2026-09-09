import { ImageDisplay } from '../dataset/enum/Common'
import { EditorMode, EditorZone } from '../dataset/enum/Editor'
import { MoveDirection } from '../dataset/enum/Observer'
import { IElement, IElementPosition } from './Element'
import { IRow } from './Row'

export interface IDrawOption {
  curIndex?: number
  isSetCursor?: boolean
  isSubmitHistory?: boolean
  isCompute?: boolean
  isLazy?: boolean
  isInit?: boolean
  isSourceHistory?: boolean
  isFirstRender?: boolean
  // 跳过光标聚焦（仅 changeGroupStyle 等场景使用），避免重新聚焦导致
  // 输入法重建、滚动条乱跳
  isSkipFocus?: boolean
  // 覆盖全局 options.isMoveCursorToVisible，强制本次渲染后是否滚动到光标可见
  isMoveCursorToVisible?: boolean
  // 显式指定光标移动方向（上/下），用于决定滚动到首行还是尾行。
  // 由键盘方向键等调用方传入，避免 drawCursor 内部基于 style.top 推断导致方向误判
  direction?: MoveDirection
}

export interface IForceUpdateOption {
  isSubmitHistory?: boolean
}

export interface IDrawImagePayload {
  id?: string
  conceptId?: string
  width: number
  height: number
  value: string
  imgDisplay?: ImageDisplay
  extension?: unknown
}

export interface IDrawRowPayload {
  elementList: IElement[]
  positionList: IElementPosition[]
  rowList: IRow[]
  pageNo: number
  startIndex: number
  innerWidth: number
  zone?: EditorZone
  isDrawLineBreak?: boolean
  isDrawWhiteSpace?: boolean
}

export interface IDrawFloatPayload {
  pageNo: number
  imgDisplays: ImageDisplay[]
}

export interface IDrawPagePayload {
  elementList: IElement[]
  positionList: IElementPosition[]
  rowList: IRow[]
  pageNo: number
}

export interface IPainterOption {
  isDblclick: boolean
}

export interface IGetValueOption {
  pageNo?: number
  extraPickAttrs?: Array<keyof IElement>
}

export type IGetOriginValueOption = Omit<IGetValueOption, 'extraPickAttrs'>

export interface IAppendElementListOption {
  isPrepend?: boolean
  isSubmitHistory?: boolean
  // 跳过光标聚焦：批量灌内容（如多实例 setTemplate）时使用，
  // 避免程序化 append 抢焦点导致多实例同时出现光标
  isSkipFocus?: boolean
}

export interface IGetImageOption {
  pixelRatio?: number
  mode?: EditorMode
  snapDomFunction?: (iframe: HTMLIFrameElement) => Promise<string>
}

export interface IComputeRowListPayload {
  innerWidth: number
  elementList: IElement[]
  startX?: number
  startY?: number
  isFromTable?: boolean
  isPagingMode?: boolean
  pageHeight?: number
  mainOuterHeight?: number
  surroundElementList?: IElement[]
}
