import 'core-js/stable'
import 'regenerator-runtime/runtime'
import 'intersection-observer'
import './assets/css/index.css'
import { version } from '../../package.json'
import { IEditorData, IEditorOption, IEditorResult } from './interface/Editor'
import { IElement } from './interface/Element'
import { Draw } from './core/draw/Draw'
import { Command } from './core/command/Command'
import { CommandAdapt } from './core/command/CommandAdapt'
import { Listener } from './core/listener/Listener'
import { RowFlex } from './dataset/enum/Row'
import {
  FlexDirection,
  ImageDisplay,
  LocationPosition
} from './dataset/enum/Common'
import { ElementType } from './dataset/enum/Element'
import {ControlRenderMode} from './dataset/enum/Editor'
import { formatElementList } from './utils/element'
import { Register } from './core/register/Register'
import { ContextMenu } from './core/contextmenu/ContextMenu'
import { PrefixAutocomplete } from './core/prefixAutocomplete/PrefixAutocomplete'
import { IPrefixAutocompleteList, IPrefixAutocompleteItem } from './interface/prefixAutocomplete/PrefixAutocomplete'
import {
  IContextMenuContext,
  IRegisterContextMenu
} from './interface/contextmenu/ContextMenu'
import {
  EditorComponent,
  EditorZone,
  EditorMode,
  PageMode,
  PaperDirection,
  WordBreak,
  RenderMode
} from './dataset/enum/Editor'
import { EDITOR_CLIPBOARD, EDITOR_COMPONENT } from './dataset/constant/Editor'
import { IWatermark } from './interface/Watermark'
import {
  ControlComponent,
  ControlIndentation,
  ControlState,
  ControlType
} from './dataset/enum/Control'
import { INavigateInfo } from './core/draw/interactive/Search'
import { Shortcut } from './core/shortcut/Shortcut'
import { KeyMap } from './dataset/enum/KeyMap'
import { BlockType } from './dataset/enum/Block'
import { IBlock } from './interface/Block'
import { ILang } from './interface/i18n/I18n'
import { VerticalAlign } from './dataset/enum/VerticalAlign'
import { TableBorder, TdBorder, TdSlash } from './dataset/enum/table/Table'
import { MaxHeightRatio, NumberType } from './dataset/enum/Common'
import { TitleLevel } from './dataset/enum/Title'
import { ListStyle, ListType } from './dataset/enum/List'
import { ICatalog, ICatalogItem } from './interface/Catalog'
import { Plugin } from './core/plugin/Plugin'
import { UsePlugin } from './interface/Plugin'
import { EventBus } from './core/event/eventbus/EventBus'
import { EventBusMap } from './interface/EventBus'
import { IRangeStyle } from './interface/Listener'
import { Override } from './core/override/Override'
import { LETTER_CLASS } from './dataset/constant/Common'
import { INTERNAL_CONTEXT_MENU_KEY } from './dataset/constant/ContextMenu'
import { IRange } from './interface/Range'
import { deepClone, splitText } from './utils'
import {
  createDomFromElementList,
  getElementListByHTML,
  getTextFromElementList,
  type IGetElementListByHTMLOption
} from './utils/element'
import { BackgroundRepeat, BackgroundSize } from './dataset/enum/Background'
import { TextDecorationStyle } from './dataset/enum/Text'
import { mergeOption } from './utils/option'
import { LineNumberType } from './dataset/enum/LineNumber'
import { AreaMode } from './dataset/enum/Area'
import { IBadge } from './interface/Badge'
import { WatermarkType, WatermarkLayer } from './dataset/enum/Watermark'
import { INTERNAL_SHORTCUT_KEY } from './dataset/constant/Shortcut'
import { IGraffitiData } from './interface/Graffiti'

export default class Editor {
  public command: Command
  public version: string
  public listener: Listener
  public eventBus: EventBus<EventBusMap>
  public override: Override
  public register: Register
  public prefixAutocomplete: PrefixAutocomplete
  public contextMenu: ContextMenu
  public destroy: () => void
  public use: UsePlugin

  constructor(
    container: HTMLDivElement,
    data: IEditorData | IElement[],
    options: IEditorOption = {}
  ) {
    // 合并配置
    const editorOptions = mergeOption(options)
    // 数据处理
    data = deepClone(data)
    let headerElementList: IElement[] = []
    let mainElementList: IElement[] = []
    let footerElementList: IElement[] = []
    let graffitiData: IGraffitiData[] = []
    if (Array.isArray(data)) {
      mainElementList = data
    } else {
      headerElementList = data.header || []
      mainElementList = data.main
      footerElementList = data.footer || []
      graffitiData = data.graffiti || []
    }
    const pageComponentData = [
      headerElementList,
      mainElementList,
      footerElementList
    ]
    pageComponentData.forEach(elementList => {
      formatElementList(elementList, {
        editorOptions,
        isForceCompensation: true
      })
    })
    // 版本
    this.version = version
    // 监听
    this.listener = new Listener()
    // 事件
    this.eventBus = new EventBus<EventBusMap>()
    // 重写
    this.override = new Override()
    // 启动
    const draw = new Draw(
      container,
      editorOptions,
      {
        header: headerElementList,
        main: mainElementList,
        footer: footerElementList,
        graffiti: graffitiData
      },
      this.listener,
      this.eventBus,
      this.override
    )
    // 命令
    this.command = new Command(new CommandAdapt(draw))
    // 菜单
    const contextMenu = new ContextMenu(draw, this.command)
    this.contextMenu = contextMenu
    // 前缀预输入（@ 提及等）
    this.prefixAutocomplete = draw.getPrefixAutocomplete()
    // 快捷键
    const shortcut = new Shortcut(draw, this.command)
    // 注册
    this.register = new Register({
      contextMenu,
      shortcut,
      i18n: draw.getI18n()
    })
    // 注册销毁方法
    this.destroy = () => {
      draw.destroy()
      shortcut.removeEvent()
      contextMenu.removeEvent()
      this.eventBus.dangerouslyClearAll()
    }
    // 插件
    const plugin = new Plugin(this)
    this.use = plugin.use.bind(plugin)
  }

  public registerPrefixAutocomplete(
    payload: IPrefixAutocompleteList,
    replace = false
  ) {
    this.prefixAutocomplete.register(payload, replace)

  }

  // 重置（清空）所有已注册的预输入配置
  public resetPrefixAutocomplete() {
    this.prefixAutocomplete.reset()
  }

  // 外部控制预输入下拉的搜索中状态（加载提示）
  // 仅当存在激活的自动补全前缀且下拉已打开时生效，返回是否成功设置
  public setPrefixAutocompleteSearching(value: boolean): boolean {
    return this.prefixAutocomplete.setSearching(value)
  }

  public getPrefixAutocompleteSearching(): boolean {
    return this.prefixAutocomplete.getSearching()
  }

  // 外部直接设置预输入下拉的候选列表
  // 仅当存在激活的自动补全前缀且下拉已打开时生效，返回是否成功设置
  public setPrefixAutocompleteList(list: IPrefixAutocompleteItem[]): boolean {
    return this.prefixAutocomplete.setList(list)
  }

  // 主动关闭所有形式的下拉列表（单选 / 多选 / 自定义多选控件下拉、@ 预输入下拉等）
  public closeAllDropdowns() {
    this.command.closeDropdowns()
  }

  // 按 key 更新右键菜单的某个选项（name/icon/callback/disable/disabled/when 等）
  // 返回是否更新成功（找不到对应 key 时返回 false）
  public updateContextMenu(
    key: string,
    patch: Partial<IRegisterContextMenu>
  ): boolean {
    return this.contextMenu.updateContextMenu(key, patch)
  }

  // 按 key 获取右键菜单项（含子菜单递归查找），找不到返回 null
  public getContextMenu(key: string): IRegisterContextMenu | null {
    return this.contextMenu.getContextMenu(key)
  }
}

// 对外方法
export {
  splitText,
  createDomFromElementList,
  getElementListByHTML,
  getTextFromElementList
}

// 对外常量
export {
  EDITOR_COMPONENT,
  LETTER_CLASS,
  INTERNAL_CONTEXT_MENU_KEY,
  INTERNAL_SHORTCUT_KEY,
  EDITOR_CLIPBOARD
}

// 对外枚举
export {
  Editor,
  RowFlex,
  VerticalAlign,
  EditorZone,
  EditorMode,
  ControlRenderMode,
  ElementType,
  ControlType,
  EditorComponent,
  PageMode,
  RenderMode,
  ImageDisplay,
  Command,
  KeyMap,
  BlockType,
  PaperDirection,
  TableBorder,
  TdBorder,
  TdSlash,
  MaxHeightRatio,
  NumberType,
  TitleLevel,
  ListType,
  ListStyle,
  WordBreak,
  ControlIndentation,
  ControlComponent,
  BackgroundRepeat,
  BackgroundSize,
  TextDecorationStyle,
  LineNumberType,
  LocationPosition,
  AreaMode,
  ControlState,
  FlexDirection,
  WatermarkType,
  WatermarkLayer
}

// 对外类型
export type {
  IElement,
  IEditorData,
  IEditorOption,
  IEditorResult,
  IContextMenuContext,
  IRegisterContextMenu,
  IWatermark,
  INavigateInfo,
  IBlock,
  ILang,
  ICatalog,
  ICatalogItem,
  IRange,
  IRangeStyle,
  IBadge,
  IGetElementListByHTMLOption
}
