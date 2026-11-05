import { Command } from '../../core/command/Command'
import { EditorZone } from '../../dataset/enum/Editor'
import { DeepRequired } from '../Common'
import { IEditorOption } from '../Editor'
import { IElement } from '../Element'
import { IRange } from '../Range'

export interface IContextMenuContext {
  startElement: IElement | null
  endElement: IElement | null
  isReadonly: boolean
  editorHasSelection: boolean
  editorTextFocus: boolean
  isInTable: boolean
  isCrossRowCol: boolean
  zone: EditorZone
  trIndex: number | null
  tdIndex: number | null
  tableElement: IElement | null
  options: DeepRequired<IEditorOption>
  // 右键菜单打开时（选区尚未被点击折叠）捕获的选区与选中文本，用于插入控件时精确替换，避免弹窗交互过程中选区被篡改导致误删后续内容
  range: IRange
  selectedText: string
}

export interface IRegisterContextMenu {
  key?: string
  i18nPath?: string
  isDivider?: boolean
  icon?: string
  name?: string
  // 为 true 时 name 按 HTML 渲染（innerHTML），否则按纯文本渲染（默认）
  html?: boolean
  shortCut?: string
  disable?: boolean
  disabled?: (payload: IContextMenuContext) => boolean
  when?: (payload: IContextMenuContext) => boolean
  callback?: (command: Command, context: IContextMenuContext) => void
  childMenus?: IRegisterContextMenu[]
}

export interface IContextmenuLang {
  global: {
    cut: string
    copy: string
    paste: string
    selectAll: string
    print: string
  }
  control: {
    delete: string
  }
  hyperlink: {
    delete: string
    cancel: string
    edit: string
  }
  image: {
    change: string
    saveAs: string
    textWrap: string
    textWrapType: {
      embed: string
      upDown: string
      surround: string
      floatTop: string
      floatBottom: string
    }
  }
  table: {
    insertRowCol: string
    insertTopRow: string
    insertBottomRow: string
    insertLeftCol: string
    insertRightCol: string
    deleteRowCol: string
    deleteRow: string
    deleteCol: string
    deleteTable: string
    mergeCell: string
    mergeCancelCell: string
  }
}
