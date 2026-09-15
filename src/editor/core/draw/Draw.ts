import { version } from '../../../../package.json'
import { ZERO } from '../../dataset/constant/Common'
import { RowFlex } from '../../dataset/enum/Row'
import {
  IAppendElementListOption,
  IComputeRowListPayload,
  IDrawFloatPayload,
  IDrawOption,
  IDrawPagePayload,
  IDrawRowPayload,
  IGetImageOption,
  IGetOriginValueOption,
  IGetValueOption,
  IPainterOption
} from '../../interface/Draw'
import {
  IEditorData,
  IEditorOption,
  IEditorResult,
  ISetValueOption
} from '../../interface/Editor'
import {
  IElement,
  IElementMetrics,
  IElementFillRect,
  IElementStyle,
  ISpliceElementListOption,
  IInsertElementListOption
} from '../../interface/Element'
import { IRow, IRowElement } from '../../interface/Row'
import { deepClone, getUUID, nextTick } from '../../utils'
import { Cursor } from '../cursor/Cursor'
import { CanvasEvent } from '../event/CanvasEvent'
import { GlobalEvent } from '../event/GlobalEvent'
import { HistoryManager } from '../history/HistoryManager'
import { Listener } from '../listener/Listener'
import { Position } from '../position/Position'
import { RangeManager } from '../range/RangeManager'
import { Background } from './frame/Background'
import { Highlight } from './richtext/Highlight'
import { Margin } from './frame/Margin'
import { Search } from './interactive/Search'
import { Strikeout } from './richtext/Strikeout'
import { Underline } from './richtext/Underline'
import { ElementType } from '../../dataset/enum/Element'
import { ImageParticle } from './particle/ImageParticle'
import { LaTexParticle } from './particle/latex/LaTexParticle'
import { TextParticle } from './particle/TextParticle'
import { PageNumber } from './frame/PageNumber'
import { ScrollObserver } from '../observer/ScrollObserver'
import { SelectionObserver } from '../observer/SelectionObserver'
import { TableParticle } from './particle/table/TableParticle'
import { TableTool } from './particle/table/TableTool'
import { HyperlinkParticle } from './particle/HyperlinkParticle'
import { LabelParticle } from './particle/LabelParticle'
import { Header } from './frame/Header'
import { SuperscriptParticle } from './particle/SuperscriptParticle'
import { SubscriptParticle } from './particle/SubscriptParticle'
import { SeparatorParticle } from './particle/SeparatorParticle'
import { PageBreakParticle } from './particle/PageBreakParticle'
import { Watermark } from './frame/Watermark'
import { WatermarkLayer } from '../../dataset/enum/Watermark'
import {
  ControlRenderMode,
  EditorComponent,
  EditorMode,
  EditorZone,
  PageMode,
  PaperDirection,
  WordBreak
} from '../../dataset/enum/Editor'
import { Control } from './control/Control'
import { AssociationStateManager } from './control/association/AssociationStateManager'
import {
  deleteSurroundElementList,
  getIsBlockElement,
  getSlimCloneElementList,
  pickSurroundElementList,
  zipElementList
} from '../../utils/element'
import { CheckboxParticle } from './particle/CheckboxParticle'
import { RadioParticle } from './particle/RadioParticle'
import { DeepRequired, IPadding } from '../../interface/Common'
import {
  ControlComponent,
  ControlIndentation,
  ControlType
} from '../../dataset/enum/Control'
import { formatElementList } from '../../utils/element'
import { WorkerManager } from '../worker/WorkerManager'
import { Previewer } from './particle/previewer/Previewer'
import { DateParticle } from './particle/date/DateParticle'
import { IMargin } from '../../interface/Margin'
import { BlockParticle } from './particle/block/BlockParticle'
import { EDITOR_COMPONENT, EDITOR_PREFIX } from '../../dataset/constant/Editor'
import { I18n } from '../i18n/I18n'
import { ImageObserver } from '../observer/ImageObserver'
import { Zone } from '../zone/Zone'
import { Footer } from './frame/Footer'
import {
  IMAGE_ELEMENT_TYPE,
  TEXTLIKE_ELEMENT_TYPE
} from '../../dataset/constant/Element'
import { ListParticle } from './particle/ListParticle'
import { Placeholder } from './frame/Placeholder'
import { EventBus } from '../event/eventbus/EventBus'
import { EventBusMap } from '../../interface/EventBus'
import { Group } from './interactive/Group'
import { Override } from '../override/Override'
import { FlexDirection, ImageDisplay } from '../../dataset/enum/Common'
import { MoveDirection } from '../../dataset/enum/Observer'
import {
  PUNCTUATION_REG,
  WHITE_SPACE_REG
} from '../../dataset/constant/Regular'
import { LineBreakParticle } from './particle/LineBreakParticle'
import { WhiteSpaceParticle } from './particle/WhiteSpaceParticle'
import { NumberFlagParticle } from './particle/number/NumberFlagParticle'
import { CustomSelectParticle } from './particle/customSelect/CustomSelectParticle'
import { MultiCustomSelectParticle } from './particle/multiCustomSelect/MultiCustomSelectParticle'
import { PrefixAutocomplete } from '../prefixAutocomplete/PrefixAutocomplete'
import { MouseObserver } from '../observer/MouseObserver'
import { LineNumber } from './frame/LineNumber'
import { PageBorder } from './frame/PageBorder'
import { ITd } from '../../interface/table/Td'
import { Actuator } from '../actuator/Actuator'
import { TableOperate } from './particle/table/TableOperate'
import { Area } from './interactive/Area'
import { Badge } from './frame/Badge'
import { Graffiti } from './graffiti/Graffiti'
import { Magnifier } from './interactive/Magnifier'

export class Draw {
  private container: HTMLDivElement
  private pageContainer: HTMLDivElement
  private pageList: HTMLCanvasElement[]
  private ctxList: CanvasRenderingContext2D[]
  private pageNo: number
  private renderCount: number
  private pagePixelRatio: number | null
  private mode: EditorMode
  private options: DeepRequired<IEditorOption>
  private position: Position
  private zone: Zone
  private elementList: IElement[]
  private listener: Listener
  private eventBus: EventBus<EventBusMap>
  private override: Override
  private controlRenderMode: ControlRenderMode

  private i18n: I18n
  private canvasEvent: CanvasEvent
  private globalEvent: GlobalEvent
  private cursor: Cursor
  private prefixAutocomplete: PrefixAutocomplete
  private range: RangeManager
  private margin: Margin
  private background: Background
  private badge: Badge
  private magnifier: Magnifier
  private search: Search
  private group: Group
  private area: Area
  private underline: Underline
  private strikeout: Strikeout
  private highlight: Highlight
  private historyManager: HistoryManager
  private previewer: Previewer
  private imageParticle: ImageParticle
  private laTexParticle: LaTexParticle
  private textParticle: TextParticle
  private tableParticle: TableParticle
  private tableTool: TableTool
  private tableOperate: TableOperate
  private pageNumber: PageNumber
  private lineNumber: LineNumber
  private waterMark: Watermark
  private placeholder: Placeholder
  private header: Header
  private footer: Footer
  private hyperlinkParticle: HyperlinkParticle
  private labelParticle: LabelParticle
  private dateParticle: DateParticle
  private separatorParticle: SeparatorParticle
  private pageBreakParticle: PageBreakParticle
  private superscriptParticle: SuperscriptParticle
  private subscriptParticle: SubscriptParticle
  private checkboxParticle: CheckboxParticle
  private radioParticle: RadioParticle
  private blockParticle: BlockParticle
  private listParticle: ListParticle
  private lineBreakParticle: LineBreakParticle
  private whiteSpaceParticle: WhiteSpaceParticle
  private numberFlagParticle: NumberFlagParticle
  private customSelectParticle: CustomSelectParticle
  private multiCustomSelectParticle: MultiCustomSelectParticle
  private control: Control
  private pageBorder: PageBorder
  private workerManager: WorkerManager
  private scrollObserver: ScrollObserver
  private selectionObserver: SelectionObserver
  private imageObserver: ImageObserver
  private graffiti: Graffiti

  private LETTER_REG: RegExp
  private WORD_LIKE_REG: RegExp
  private rowList: IRow[]
  private pageRowList: IRow[][]
  private painterStyle: IElementStyle | null
  private painterOptions: IPainterOption | null
  private visiblePageNoList: number[]
  private intersectionPageNo: number
  private lazyRenderIntersectionObserver: IntersectionObserver | null
  private printModeData: Required<Omit<IEditorData, 'graffiti'>> | null

  constructor(
    rootContainer: HTMLElement,
    options: DeepRequired<IEditorOption>,
    data: IEditorData,
    listener: Listener,
    eventBus: EventBus<EventBusMap>,
    override: Override
  ) {
    this.container = this._wrapContainer(rootContainer)
    this.pageList = []
    this.ctxList = []
    this.pageNo = 0
    this.renderCount = 0
    this.pagePixelRatio = null
    this.mode = options.mode
    this.options = options
    this.elementList = data.main
    this.listener = listener
    this.eventBus = eventBus
    this.override = override
    this.controlRenderMode = ControlRenderMode.CONTROL

    this._formatContainer()
    this.pageContainer = this._createPageContainer()
    this._createPage(0)

    this.i18n = new I18n(options.locale)
    this.historyManager = new HistoryManager(this)
    this.position = new Position(this)
    this.zone = new Zone(this)
    this.range = new RangeManager(this)
    this.margin = new Margin(this)
    this.background = new Background(this)
    this.badge = new Badge(this)
    this.magnifier = new Magnifier(this)
    this.search = new Search(this)
    this.group = new Group(this)
    this.area = new Area(this)
    this.underline = new Underline(this)
    this.strikeout = new Strikeout(this)
    this.highlight = new Highlight(this)
    this.previewer = new Previewer(this)
    this.imageParticle = new ImageParticle(this)
    this.laTexParticle = new LaTexParticle(this)
    this.textParticle = new TextParticle(this)
    this.tableParticle = new TableParticle(this)
    this.tableTool = new TableTool(this)
    this.tableOperate = new TableOperate(this)
    this.pageNumber = new PageNumber(this)
    this.lineNumber = new LineNumber(this)
    this.waterMark = new Watermark(this)
    this.placeholder = new Placeholder(this)
    this.header = new Header(this, data.header)
    this.footer = new Footer(this, data.footer)
    this.hyperlinkParticle = new HyperlinkParticle(this)
    this.labelParticle = new LabelParticle(this)
    this.dateParticle = new DateParticle(this)
    this.separatorParticle = new SeparatorParticle(this)
    this.pageBreakParticle = new PageBreakParticle(this)
    this.superscriptParticle = new SuperscriptParticle()
    this.subscriptParticle = new SubscriptParticle()
    this.checkboxParticle = new CheckboxParticle(this)
    this.radioParticle = new RadioParticle(this)
    this.blockParticle = new BlockParticle(this)
    this.listParticle = new ListParticle(this)
    this.lineBreakParticle = new LineBreakParticle(this)
    this.whiteSpaceParticle = new WhiteSpaceParticle(this)
    this.numberFlagParticle = new NumberFlagParticle(this)
    this.customSelectParticle = new CustomSelectParticle(this)
    this.multiCustomSelectParticle = new MultiCustomSelectParticle(this)
    this.control = new Control(this)
    this.pageBorder = new PageBorder(this)
    this.graffiti = new Graffiti(this, data.graffiti)

    AssociationStateManager.getInstance().registerEditor(this)

    this.scrollObserver = new ScrollObserver(this)
    this.selectionObserver = new SelectionObserver(this)
    this.imageObserver = new ImageObserver()
    new MouseObserver(this)

    this.canvasEvent = new CanvasEvent(this)
    this.cursor = new Cursor(this, this.canvasEvent)
    this.prefixAutocomplete = new PrefixAutocomplete(this)
    this.canvasEvent.register()
    this.globalEvent = new GlobalEvent(this, this.canvasEvent)
    this.globalEvent.register()

    this.workerManager = new WorkerManager(this)
    new Actuator(this)

    const { letterClass } = options
    this.LETTER_REG = new RegExp(`[${letterClass.join('')}]`)
    this.WORD_LIKE_REG = new RegExp(
      `${letterClass.map(letter => `[^${letter}][${letter}]`).join('|')}`
    )
    this.rowList = []
    this.pageRowList = []
    this.painterStyle = null
    this.painterOptions = null
    this.visiblePageNoList = []
    this.intersectionPageNo = 0
    this.lazyRenderIntersectionObserver = null
    this.printModeData = null

    // 打印模式优先设置打印数据
    if (this.mode === EditorMode.PRINT) {
      this.setPrintData()
    }
    this.render({
      isInit: true,
      isSetCursor: false,
      isFirstRender: true
    })
  }

  // 设置打印数据
  public setPrintData() {
    this.printModeData = {
      header: this.header.getElementList(),
      main: this.elementList,
      footer: this.footer.getElementList()
    }
    // 过滤控件辅助元素
    const clonePrintModeData = deepClone(this.printModeData)
    const editorDataKeys: (keyof Omit<IEditorData, 'graffiti'>)[] = [
      'header',
      'main',
      'footer'
    ]
    editorDataKeys.forEach(key => {
      clonePrintModeData[key] = this.control.filterAssistElement(
        clonePrintModeData[key]
      )
    })
    this.setEditorData(clonePrintModeData)
  }

  // 还原打印数据
  public clearPrintData() {
    if (this.printModeData) {
      this.setEditorData(this.printModeData)
      this.printModeData = null
    }
  }

  public getLetterReg(): RegExp {
    return this.LETTER_REG
  }

  public getMode(): EditorMode {
    return this.mode
  }

  public setMode(payload: EditorMode) {
    if (this.mode === payload) return
    // 设置打印模式
    if (payload === EditorMode.PRINT) {
      this.setPrintData()
    }
    // 取消打印模式
    if (this.mode === EditorMode.PRINT) {
      this.clearPrintData()
    }
    this.clearSideEffect()
    this.range.clearRange()
    this.mode = payload
    this.options.mode = payload
    this.render({
      isSetCursor: false,
      isSubmitHistory: false
    })
  }

  public isReadonly() {
    if (this.area.getActiveAreaInfo()?.area?.mode) {
      return this.area.isReadonly()
    }
    switch (this.mode) {
      case EditorMode.DESIGN:
        return false
      case EditorMode.READONLY:
      case EditorMode.PRINT:
      case EditorMode.GRAFFITI:
        return true
      case EditorMode.FORM:
        return !this.control.getIsRangeWithinControl()
      default:
        return false
    }
  }

  public isDisabled() {
    if (this.mode === EditorMode.DESIGN) return false
    const { startIndex, endIndex } = this.range.getRange()
    const elementList = this.getElementList()
    // 优先判断表格单元格
    if (this.getTd()?.disabled) return true
    if (startIndex === endIndex) {
      const startElement = elementList[startIndex]
      const nextElement = elementList[startIndex + 1]
      return !!(
        (startElement?.title?.disabled &&
          nextElement?.title?.disabled &&
          startElement.titleId === nextElement.titleId) ||
        (startElement?.control?.disabled &&
          nextElement?.control?.disabled &&
          startElement.controlId === nextElement.controlId)
      )
    }
    const selectionElementList = elementList.slice(startIndex + 1, endIndex + 1)
    return selectionElementList.some(
      element => element.title?.disabled || element.control?.disabled
    )
  }

  public isDesignMode() {
    return this.mode === EditorMode.DESIGN
  }

  public isPrintMode() {
    return this.mode === EditorMode.PRINT
  }

  public isGraffitiMode() {
    return this.mode === EditorMode.GRAFFITI
  }

  public getControlRenderMode(): ControlRenderMode {
    return this.controlRenderMode
  }

  // 纯文本模式下选择器控件选中值使用独立配置色（仅渲染层替换，不修改元素数据）
  private getSelectorTextValueElement(element: IRowElement): IRowElement {
    if (this.controlRenderMode !== ControlRenderMode.TEXT) return element
    if (!element.control || element.controlComponent !== ControlComponent.VALUE) {
      return element
    }
    const selectorOption = this.options.selector
    if (element.control.type === ControlType.CUSTOM_SELECT) {
      return {
        ...element,
        color: selectorOption.customSelectTextValueColor
      }
    }
    if (element.control.type === ControlType.MULTI_CUSTOM_SELECT) {
      return {
        ...element,
        color: selectorOption.multiSelectTextValueColor
      }
    }
    return element
  }

  public setControlRenderMode(payload: ControlRenderMode) {
    // 参数验证
    if (
      payload !== ControlRenderMode.CONTROL &&
      payload !== ControlRenderMode.TEXT
    ) {
      console.warn('Invalid ControlRenderMode:', payload)
      return
    }
    // 模式相同时不执行
    if (this.controlRenderMode === payload) return

    this.controlRenderMode = payload

    // 触发回调
    this.listener.controlRenderModeChange?.(payload)

    // 重新渲染并提交历史（使用submitHistory创建完整快照，包含模式+元素状态）
    this.render({
      isSubmitHistory: true,
      isSetCursor: false
    })
  }

  public getOriginalWidth(): number {
    const { paperDirection, width, height } = this.options
    return paperDirection === PaperDirection.VERTICAL ? width : height
  }

  public getOriginalHeight(): number {
    const { paperDirection, width, height } = this.options
    return paperDirection === PaperDirection.VERTICAL ? height : width
  }

  public getWidth(): number {
    return Math.floor(this.getOriginalWidth() * this.options.scale)
  }

  public getHeight(): number {
    return Math.floor(this.getOriginalHeight() * this.options.scale)
  }

  public getMainHeight(): number {
    const pageHeight = this.getHeight()
    return pageHeight - this.getMainOuterHeight()
  }

  public getMainOuterHeight(): number {
    const margins = this.getMargins()
    const headerExtraHeight = this.header.getExtraHeight()
    const footerExtraHeight = this.footer.getExtraHeight()
    return margins[0] + margins[2] + headerExtraHeight + footerExtraHeight
  }

  public getCanvasWidth(pageNo = -1): number {
    const page = this.getPage(pageNo)
    return page.width
  }

  public getCanvasHeight(pageNo = -1): number {
    const page = this.getPage(pageNo)
    return page.height
  }

  public getInnerWidth(): number {
    const width = this.getWidth()
    const margins = this.getMargins()
    return width - margins[1] - margins[3]
  }

  public getOriginalInnerWidth(): number {
    const width = this.getOriginalWidth()
    const margins = this.getOriginalMargins()
    return width - margins[1] - margins[3]
  }

  public getContextInnerWidth(): number {
    const positionContext = this.position.getPositionContext()
    if (positionContext.isTable) {
      const { index, trIndex, tdIndex } = positionContext
      const elementList = this.getOriginalElementList()
      const td = elementList[index!].trList![trIndex!].tdList[tdIndex!]
      const tdPadding = this.getTdPadding()
      return td!.width! - tdPadding[1] - tdPadding[3]
    }
    return this.getOriginalInnerWidth()
  }

  public getMargins(): IMargin {
    return <IMargin>this.getOriginalMargins().map(m => m * this.options.scale)
  }

  public getOriginalMargins(): number[] {
    const { margins, paperDirection } = this.options
    return paperDirection === PaperDirection.VERTICAL
      ? margins
      : [margins[1], margins[2], margins[3], margins[0]]
  }

  public getPageGap(): number {
    return this.options.pageGap * this.options.scale
  }

  public getOriginalPageGap(): number {
    return this.options.pageGap
  }

  public getPageNumberBottom(): number {
    const {
      pageNumber: { bottom },
      scale
    } = this.options
    return bottom * scale
  }

  public getMarginIndicatorSize(): number {
    return this.options.marginIndicatorSize * this.options.scale
  }

  public getDefaultBasicRowMarginHeight(): number {
    return this.options.defaultBasicRowMarginHeight * this.options.scale
  }

  public getHighlightMarginHeight(): number {
    return this.options.highlightMarginHeight * this.options.scale
  }

  public getTdPadding(): IPadding {
    const {
      table: { tdPadding },
      scale
    } = this.options
    return <IPadding>tdPadding.map(m => m * scale)
  }

  public getContainer(): HTMLDivElement {
    return this.container
  }

  public getPageContainer(): HTMLDivElement {
    return this.pageContainer
  }

  public getVisiblePageNoList(): number[] {
    return this.visiblePageNoList
  }

  public setVisiblePageNoList(payload: number[]) {
    this.visiblePageNoList = payload
    if (this.listener.visiblePageNoListChange) {
      this.listener.visiblePageNoListChange(this.visiblePageNoList)
    }
    if (this.eventBus.isSubscribe('visiblePageNoListChange')) {
      this.eventBus.emit('visiblePageNoListChange', this.visiblePageNoList)
    }
  }

  public getIntersectionPageNo(): number {
    return this.intersectionPageNo
  }

  public setIntersectionPageNo(payload: number) {
    this.intersectionPageNo = payload
    if (this.listener.intersectionPageNoChange) {
      this.listener.intersectionPageNoChange(this.intersectionPageNo)
    }
    if (this.eventBus.isSubscribe('intersectionPageNoChange')) {
      this.eventBus.emit('intersectionPageNoChange', this.intersectionPageNo)
    }
  }

  public getPageNo(): number {
    return this.pageNo
  }

  public setPageNo(payload: number) {
    this.pageNo = payload
  }

  public getRenderCount(): number {
    return this.renderCount
  }

  public getPage(pageNo = -1): HTMLCanvasElement {
    return this.pageList[~pageNo ? pageNo : this.pageNo]
  }

  public getPageList(): HTMLCanvasElement[] {
    return this.pageList
  }

  public getPageCount(): number {
    return this.pageList.length
  }

  public getTableRowList(sourceElementList: IElement[]): IRow[] {
    const positionContext = this.position.getPositionContext()
    const { index, trIndex, tdIndex } = positionContext
    return sourceElementList[index!].trList![trIndex!].tdList[tdIndex!].rowList!
  }

  public getOriginalRowList() {
    const zoneManager = this.getZone()
    if (zoneManager.isHeaderActive()) {
      return this.header.getRowList()
    }
    if (zoneManager.isFooterActive()) {
      return this.footer.getRowList()
    }
    return this.rowList
  }

  public getRowList(): IRow[] {
    const positionContext = this.position.getPositionContext()
    return positionContext.isTable
      ? this.getTableRowList(this.getOriginalElementList())
      : this.getOriginalRowList()
  }

  public getPageRowList(): IRow[][] {
    return this.pageRowList
  }

  public getCtx(): CanvasRenderingContext2D {
    return this.ctxList[this.pageNo]
  }

  public getOptions(): DeepRequired<IEditorOption> {
    return this.options
  }

  public getSearch(): Search {
    return this.search
  }

  public getGroup(): Group {
    return this.group
  }

  public getArea(): Area {
    return this.area
  }

  public getBadge(): Badge {
    return this.badge
  }

  public getMagnifier(): Magnifier {
    return this.magnifier
  }

  public getHistoryManager(): HistoryManager {
    return this.historyManager
  }

  public getPosition(): Position {
    return this.position
  }

  public getZone(): Zone {
    return this.zone
  }

  public getRange(): RangeManager {
    return this.range
  }

  public getLineBreakParticle(): LineBreakParticle {
    return this.lineBreakParticle
  }

  public getTextParticle(): TextParticle {
    return this.textParticle
  }

  public getHeaderElementList(): IElement[] {
    return this.header.getElementList()
  }

  public getTableElementList(sourceElementList: IElement[]): IElement[] {
    const positionContext = this.position.getPositionContext()
    const { index, trIndex, tdIndex } = positionContext
    return (
      sourceElementList[index!].trList?.[trIndex!].tdList[tdIndex!].value || []
    )
  }

  public getElementList(): IElement[] {
    const positionContext = this.position.getPositionContext()
    const elementList = this.getOriginalElementList()
    return positionContext.isTable
      ? this.getTableElementList(elementList)
      : elementList
  }

  public getMainElementList(): IElement[] {
    const positionContext = this.position.getPositionContext()
    return positionContext.isTable
      ? this.getTableElementList(this.elementList)
      : this.elementList
  }

  public getOriginalElementList() {
    const zoneManager = this.getZone()
    if (zoneManager.isHeaderActive()) {
      return this.getHeaderElementList()
    }
    if (zoneManager.isFooterActive()) {
      return this.getFooterElementList()
    }
    return this.elementList
  }

  public getOriginalMainElementList(): IElement[] {
    return this.elementList
  }

  public getFooterElementList(): IElement[] {
    return this.footer.getElementList()
  }

  public getTd(): ITd | null {
    const positionContext = this.position.getPositionContext()
    const { index, trIndex, tdIndex, isTable } = positionContext
    if (isTable) {
      const elementList = this.getOriginalElementList()
      return elementList[index!].trList![trIndex!].tdList[tdIndex!]
    }
    return null
  }

  public insertElementList(
    payload: IElement[],
    options: IInsertElementListOption = {}
  ) {
    if (!payload.length || !this.range.getIsCanInput()) return
    const { startIndex, endIndex } = this.range.getRange()
    if (!~startIndex && !~endIndex) return
    const { isSubmitHistory = true } = options
    formatElementList(payload, {
      isHandleFirstElement: false,
      editorOptions: this.options
    })
    // 撤销支持：仅当撤销栈为空（即首个历史记录）时，在修改 elementList 之前
    // 记录一次“插入前”基线快照；否则栈顶已是对应的“插入前”状态，无需重复记录。
    // 注意：必须与下方 render(isSubmitHistory:false) + submitHistory(curIndex) 配合，
    // 否则每个插入会同时产生“前”与“后”两条记录，导致 undo 步数与文档状态错位。
    if (isSubmitHistory && this.historyManager.isStackEmpty()) {
      console.log('[DEBUG history] insertElementList 栈为空，记录基线(插入前)快照')
      this.submitHistory(undefined)
    }
    let curIndex = -1
    // 判断是否在控件内
    let activeControl = this.control.getActiveControl()
    // 光标在控件内如果当前没有被激活，需要手动激活
    if (!activeControl && this.control.getIsRangeWithinControl()) {
      this.control.initControl()
      activeControl = this.control.getActiveControl()
    }
    if (activeControl && this.control.getIsRangeWithinControl()) {
      curIndex = activeControl.setValue(payload, undefined, {
        isIgnoreDisabledRule: true
      })
      this.control.emitControlContentChange()
    } else {
      const elementList = this.getElementList()
      const isCollapsed = startIndex === endIndex
      const start = startIndex + 1
      if (!isCollapsed) {
        this.spliceElementList(elementList, start, endIndex - startIndex)
      }
      this.spliceElementList(elementList, start, 0, payload)
      curIndex = startIndex + payload.length
      // 列表前如有换行符则删除-因为列表内已存在
      const preElement = elementList[start - 1]
      if (
        payload[0].listId &&
        preElement &&
        !preElement.listId &&
        preElement?.value === ZERO &&
        (!preElement.type || preElement.type === ElementType.TEXT)
      ) {
        elementList.splice(startIndex, 1)
        curIndex -= 1
      }
    }
    if (~curIndex) {
      this.range.setRange(curIndex, curIndex)
      // render 不再重复提交历史（与 appendElementList 对齐），统一由下方
      // submitHistory 记录“插入后”的单一快照，避免每个插入产生两条历史记录
      this.render({
        curIndex,
        isSubmitHistory: false
      })
      if (isSubmitHistory) {
        this.submitHistory(curIndex)
      }
    }
  }

  // 获取元素的“实际取值”，用于判断末尾/追加内容是否以换行结尾：
  // - 列表元素：实际取值在 valueList 的最后一个元素中
  // - 单选/多选/下拉等选择类控件：实际取值优先取 structValues，其次取选项值（依据 code 映射 valueSets）
  // - 其余元素：直接取 value
  private _getElementActualValue(element: IElement): string {
    if (!element) return ''
    // 列表元素：实际取值在 valueList 最后一个元素
    if (element.type === ElementType.LIST) {
      const valueList = element.valueList
      if (Array.isArray(valueList) && valueList.length) {
        const last = valueList[valueList.length - 1]
        return last?.value ?? ''
      }
      return element.value
    }
    // 单选/多选/下拉等选择类控件
    const control = element.control
    if (
      control &&
      (control.type === ControlType.RADIO ||
        control.type === ControlType.CHECKBOX ||
        control.type === ControlType.SELECT ||
        control.type === ControlType.CUSTOM_SELECT ||
        control.type === ControlType.MULTI_CUSTOM_SELECT)
    ) {
      // 优先取结构化值
      if (Array.isArray(control.structValues) && control.structValues.length) {
        return control.structValues
          .map(structValue => structValue.value)
          .join('')
      }
      // 其次依据 code 从选项值（valueSets）中映射实际取值
      const code = control.code
      if (code) {
        const delimiter = control.multiSelectDelimiter || ','
        const valueSets = control.valueSets || []
        return code
          .split(delimiter)
          .map(c => valueSets.find(valueSet => valueSet.code === c?.trim())?.value)
          .filter((value): value is string => !!value)
          .join(delimiter)
      }
      // 兜底：控件直接存储的纯文本值
      if (typeof control.value === 'string' && control.value) {
        return control.value
      }
    }
    return element.value
  }

  public appendElementList(
    elementList: IElement[],
    options: IAppendElementListOption = {}
  ) {
    if (!elementList.length) return
    formatElementList(elementList, {
      isHandleFirstElement: false,
      editorOptions: this.options
    })
    let curIndex: number
    const { isPrepend, isSubmitHistory = true } = options
    // 撤销支持：在修改 elementList 之前，先记录“append 前”的快照作为可回退基线。
    // 仅当撤销栈为空（即首个历史记录）时记录一次，避免每次 append 都重复记录
    // “append 前 / append 后”两个快照，导致同一内容在历史中出现两次（如 A 被记录两次）。
    // 非首个记录时，栈顶已是对应的“append 前”状态，无需重复记录。
    if (isSubmitHistory && this.historyManager.isStackEmpty()) {
      console.log('[DEBUG history] appendElementList 栈为空，记录基线(append前)快照, 当前main长度=', this.elementList.length)
      this.submitHistory(undefined)
    }
    // 判断文档尾部是否处于列表上下文（用于续接列表，避免插入后中断或产生空行）
    // 注意：列表项的标记本身就是带 listId 的 ZERO，因此“最后一行是列表”不能简单用
    // “锚点元素不是 ZERO”来判定，否则会漏掉列表项之间的标记 ZERO 以及列表尾部空行。
    const anchorPreIndex = isPrepend ? 0 : this.elementList.length - 1
    let continueListId: string | undefined
    let continueListType: IElement['listType']
    let continueListStyle: IElement['listStyle']
    let listAnchorIndex = -1
    for (let i = anchorPreIndex; i >= 0; i--) {
      const el = this.elementList[i]
      if (el?.listId) {
        continueListId = el.listId
        continueListType = el.listType
        continueListStyle = el.listStyle
        listAnchorIndex = i
        break
      }
      // 末尾连续的占位/换行 ZERO（可能来自列表尾部空行）继续往前探测列表上下文
      if (el?.value === ZERO && (!el.type || el.type === ElementType.TEXT)) {
        continue
      }
      break
    }
    const isLastLineList = !!continueListId
    const firstAppendElement = elementList[0]
    const isFirstAppendWrap =
      firstAppendElement?.value === ZERO &&
      (!firstAppendElement.type || firstAppendElement.type === ElementType.TEXT)
    // 处理追加内容与主数据末尾的换行重复：
    // 若主数据末尾“实际取值”以段落换行结尾（空值 / \n / ZERO 均视为段落换行），
    // 且追加内容首个元素也是段落换行（空值 / \n / ZERO），
    // 则忽略追加内容开头的换行，避免产生多余空段落（如把 \n1.\n 追加到行尾时
    // 期望“1.”接在上一行而非另起一行）。
    const lastMainElement = this.elementList[this.elementList.length - 1]
    console.log(
      '[appendElementList] debug start | isPrepend=' +
        String(isPrepend) +
        ' | lastMainElement=' +
        (lastMainElement
          ? JSON.stringify({
              type: lastMainElement.type,
              controlType: lastMainElement.control?.type,
              value: lastMainElement.value,
              valueListLen: lastMainElement.valueList?.length
            })
          : 'null') +
        ' | firstAppendElement=' +
        (firstAppendElement
          ? JSON.stringify({
              type: firstAppendElement.type,
              value: firstAppendElement.value
            })
          : 'null')
    )
    if (!isPrepend && lastMainElement && firstAppendElement) {
      const lastMainValue = this._getElementActualValue(lastMainElement)
      const firstAppendValue = firstAppendElement.value || ''
      // 主数据末尾是否以段落换行结尾
      const lastEndsWithBreak =
        lastMainValue === '' ||
        lastMainValue === ZERO ||
        lastMainValue.includes('\n')
      // 追加内容首个元素是否为段落换行（普通文本且非列表标记）
      const firstIsPlainText =
        !firstAppendElement.type ||
        firstAppendElement.type === ElementType.TEXT
      const firstIsListMarker = !!firstAppendElement.listId
      const firstIsBreak =
        firstIsPlainText &&
        !firstIsListMarker &&
        (firstAppendValue === '' ||
          firstAppendValue === ZERO ||
          firstAppendValue.includes('\n'))
      console.log(
        '[appendElementList] compare | lastMainValue=' +
          JSON.stringify(lastMainValue) +
          ' | firstAppendValue=' +
          JSON.stringify(firstAppendValue) +
          ' | lastEndsWithBreak=' +
          String(lastEndsWithBreak) +
          ' | firstIsBreak=' +
          String(firstIsBreak)
      )
      if (lastEndsWithBreak && firstIsBreak) {
        if (firstAppendValue && firstAppendValue !== ZERO) {
          const newValue = firstAppendValue.replace(/^\n+/, '')
          if (newValue) {
            firstAppendElement.value = newValue
            console.log(
              '[appendElementList] strip leading \\n | newValue=' +
                JSON.stringify(newValue)
            )
          } else {
            // 首个追加元素整体即为换行，直接移除，避免多余空段落
            elementList.shift()
            console.log('[appendElementList] shift first element (all \\n)')
          }
        } else {
          // 首个追加元素整体为空（空段落标记）/ ZERO，直接移除
          elementList.shift()
          console.log('[appendElementList] shift first element (empty/ZERO)')
        }
      } else {
        console.log('[appendElementList] no match, keep as is')
      }
    }
    // 最后一行是列表 && 追加内容以换行符开头：
    // 移除该换行符，并将后续内容继承列表信息，使其继续以列表形式追加；
    // 若最后一行不是列表，则保留换行符作为正常换行，避免错误续接。
    if (isLastLineList && isFirstAppendWrap) {
      const listId = continueListId!
      const listType = continueListType
      const listStyle = continueListStyle
      // 若列表尾部存在连续的空行 ZERO（不带 listId），一并继承列表信息，
      // 否则插入后会在列表项之间渲染出空列表项行（空行显示）。
      for (let i = anchorPreIndex; i > listAnchorIndex; i--) {
        const el = this.elementList[i]
        if (
          el?.value === ZERO &&
          (!el.type || el.type === ElementType.TEXT) &&
          !el.listId
        ) {
          el.listId = listId
          el.listType = listType
          el.listStyle = listStyle
        } else {
          break
        }
      }
      // 移除追加内容开头的换行符
      // elementList.shift()
      // 给后续尚未带 listId 的元素继承列表信息，直到遇到新的 LIST 元素为止
      for (const el of elementList) {
        if (el.type === ElementType.LIST) break
        if (!el.listId) {
          el.listId = listId
          el.listType = listType
          el.listStyle = listStyle
        }
      }
    }
    if (isPrepend) {
      this.elementList.splice(1, 0, ...elementList)
      curIndex = elementList.length
    } else {
      this.elementList.push(...elementList)
      curIndex = this.elementList.length - 1
    }
    this.range.setRange(curIndex, curIndex)
    this.render({
      curIndex,
      isSubmitHistory: false,
      // 追加内容视为一次文档变更，触发 contentChange（不额外写入历史，历史由下方 submitHistory 统一处理）
      isSourceHistory: true,
      isSkipFocus: options.isSkipFocus,
      // 追加元素后默认自动滚动到末尾光标（即使全局关闭了切换光标滚动），
      // 除非显式 isSkipFocus 跳过聚焦
      isMoveCursorToVisible: options.isSkipFocus ? false : true,
      // 统一 auto 模式：依据追加后光标结果行是否越界（顶部/底部）自动滚动
      direction: MoveDirection.AUTO
    })
    // 仅记录“append 后”的快照一次（render 内已不再记录），
    // 与前面的基线快照共同构成 [基线, 内容] 的单一历史步骤，避免重复记录。
    if (isSubmitHistory) {
      this.submitHistory(curIndex)
    }
  }

  public spliceElementList(
    elementList: IElement[],
    start: number,
    deleteCount: number,
    items?: IElement[],
    options?: ISpliceElementListOption
  ) {
    const { isIgnoreDeletedRule = false } = options || {}
    const { group, modeRule } = this.options
    if (deleteCount > 0) {
      // 当最后元素与开始元素列表信息不一致时：清除当前列表信息
      const endIndex = start + deleteCount
      const endElement = elementList[endIndex]
      const endElementListId = endElement?.listId
      if (
        endElementListId &&
        elementList[start - 1]?.listId !== endElementListId
      ) {
        let startIndex = endIndex
        while (startIndex < elementList.length) {
          const curElement = elementList[startIndex]
          if (
            curElement.listId !== endElementListId ||
            curElement.value === ZERO
          ) {
            break
          }
          delete curElement.listId
          delete curElement.listType
          delete curElement.listStyle
          startIndex++
        }
      }
      // 非明确忽略删除规则 && 非设计模式 && 非光标在控件内(控件内控制) =》 校验删除规则
      if (
        !isIgnoreDeletedRule &&
        !this.isDesignMode() &&
        !this.control.getIsRangeWithinControl()
      ) {
        const tdDeletable = this.getTd()?.deletable
        let deleteIndex = endIndex - 1
        while (deleteIndex >= start) {
          const deleteElement = elementList[deleteIndex]
          if (
            deleteElement?.hide ||
            deleteElement?.control?.hide ||
            deleteElement?.area?.hide ||
            (tdDeletable !== false &&
              deleteElement?.control?.deletable !== false &&
              (!deleteElement.controlId ||
                this.mode !== EditorMode.FORM ||
                !modeRule[this.mode].controlDeletableDisabled) &&
              deleteElement?.title?.deletable !== false &&
              (group.deletable !== false || !deleteElement.groupIds?.length) &&
              (deleteElement?.area?.deletable !== false ||
                deleteElement?.areaIndex !== 0))
          ) {
            elementList.splice(deleteIndex, 1)
          }
          deleteIndex--
        }
      } else {
        elementList.splice(start, deleteCount)
      }
    }
    // 循环添加，避免使用解构影响性能
    if (items?.length) {
      for (let i = 0; i < items.length; i++) {
        elementList.splice(start + i, 0, items[i])
      }
    }
  }

  public getCanvasEvent(): CanvasEvent {
    return this.canvasEvent
  }

  public getGlobalEvent(): GlobalEvent {
    return this.globalEvent
  }

  public getListener(): Listener {
    return this.listener
  }

  public getEventBus(): EventBus<EventBusMap> {
    return this.eventBus
  }

  public getOverride(): Override {
    return this.override
  }

  public getCursor(): Cursor {
    return this.cursor
  }

  public getPrefixAutocomplete(): PrefixAutocomplete {
    return this.prefixAutocomplete
  }

  public getPreviewer(): Previewer {
    return this.previewer
  }

  public getImageParticle(): ImageParticle {
    return this.imageParticle
  }

  public getTableTool(): TableTool {
    return this.tableTool
  }

  public getTableOperate(): TableOperate {
    return this.tableOperate
  }

  public getTableParticle(): TableParticle {
    return this.tableParticle
  }

  public getBlockParticle(): BlockParticle {
    return this.blockParticle
  }

  public getHeader(): Header {
    return this.header
  }

  public getFooter(): Footer {
    return this.footer
  }

  public getHyperlinkParticle(): HyperlinkParticle {
    return this.hyperlinkParticle
  }

  public getDateParticle(): DateParticle {
    return this.dateParticle
  }

  public getListParticle(): ListParticle {
    return this.listParticle
  }

  public getCheckboxParticle(): CheckboxParticle {
    return this.checkboxParticle
  }

  public getRadioParticle(): RadioParticle {
    return this.radioParticle
  }

  public getControl(): Control {
    return this.control
  }

  public getWorkerManager(): WorkerManager {
    return this.workerManager
  }

  public getImageObserver(): ImageObserver {
    return this.imageObserver
  }

  public getI18n(): I18n {
    return this.i18n
  }

  public getGraffiti(): Graffiti {
    return this.graffiti
  }

  public getRowCount(): number {
    return this.getRowList().length
  }

  public async getDataURL(payload: IGetImageOption = {}): Promise<string[]> {
    const { pixelRatio, mode, snapDomFunction } = payload
    // 放大像素比
    if (pixelRatio) {
      this.setPagePixelRatio(pixelRatio)
    }
    // 不同模式
    const currentMode = this.mode
    const isSwitchMode = !!mode && currentMode !== mode
    if (isSwitchMode) {
      this.setMode(mode)
    }
    this.render({
      isLazy: false,
      isCompute: false,
      isSetCursor: false,
      isSubmitHistory: false
    })
    await this.imageObserver.allSettled()
    // 叠加iframe图片
    if (snapDomFunction) {
      await this.blockParticle.drawIframeToPage(this.pageList, snapDomFunction)
    }
    const dataUrlList = this.pageList.map(c => c.toDataURL())
    // 还原
    if (pixelRatio) {
      this.setPagePixelRatio(null)
    }
    if (isSwitchMode) {
      this.setMode(currentMode)
    }
    return dataUrlList
  }

  public getPainterStyle(): IElementStyle | null {
    return this.painterStyle && Object.keys(this.painterStyle).length
      ? this.painterStyle
      : null
  }

  public getPainterOptions(): IPainterOption | null {
    return this.painterOptions
  }

  public setPainterStyle(
    payload: IElementStyle | null,
    options?: IPainterOption
  ) {
    this.painterStyle = payload
    this.painterOptions = options || null
    if (this.getPainterStyle()) {
      this.pageList.forEach(c => (c.style.cursor = 'copy'))
    }
  }

  public setDefaultRange() {
    if (!this.elementList.length) return
    setTimeout(() => {
      const curIndex = this.elementList.length - 1
      this.range.setRange(curIndex, curIndex)
      this.range.setRangeStyle()
    })
  }

  public getIsPagingMode(): boolean {
    return this.options.pageMode === PageMode.PAGING
  }

  public setPageMode(payload: PageMode) {
    if (!payload || this.options.pageMode === payload) return
    this.options.pageMode = payload
    // 纸张大小重置
    if (payload === PageMode.PAGING) {
      const { height } = this.options
      const dpr = this.getPagePixelRatio()
      const canvas = this.pageList[0]
      canvas.style.height = `${height}px`
      canvas.height = height * dpr
      // canvas尺寸发生变化，上下文被重置
      this._initPageContext(this.ctxList[0])
    } else {
      // 连页模式：移除懒加载监听&清空页眉页脚计算数据
      this._disconnectLazyRender()
      this.header.recovery()
      this.footer.recovery()
      this.zone.setZone(EditorZone.MAIN)
    }
    const { startIndex } = this.range.getRange()
    const isCollapsed = this.range.getIsCollapsed()
    this.render({
      isSetCursor: true,
      curIndex: startIndex,
      isSubmitHistory: false
    })
    // 重新定位避免事件监听丢失
    if (!isCollapsed) {
      this.cursor.drawCursor({
        isShow: false
      })
    }
    // 回调
    setTimeout(() => {
      if (this.listener.pageModeChange) {
        this.listener.pageModeChange(payload)
      }
      if (this.eventBus.isSubscribe('pageModeChange')) {
        this.eventBus.emit('pageModeChange', payload)
      }
    })
  }

  public setPageScale(payload: number) {
    const dpr = this.getPagePixelRatio()
    this.options.scale = payload
    const width = this.getWidth()
    const height = this.getHeight()
    this.container.style.width = `${width}px`
    this.pageList.forEach((p, i) => {
      p.width = width * dpr
      p.height = height * dpr
      p.style.width = `${width}px`
      p.style.height = `${height}px`
      p.style.marginBottom = `${this.getPageGap()}px`
      this._initPageContext(this.ctxList[i])
    })
    const cursorPosition = this.position.getCursorPosition()
    this.render({
      isSubmitHistory: false,
      isSetCursor: !!cursorPosition,
      curIndex: cursorPosition?.index
    })
    if (this.listener.pageScaleChange) {
      this.listener.pageScaleChange(payload)
    }
    if (this.eventBus.isSubscribe('pageScaleChange')) {
      this.eventBus.emit('pageScaleChange', payload)
    }
  }

  public getPagePixelRatio(): number {
    return this.pagePixelRatio || window.devicePixelRatio || 1
  }

  public setPagePixelRatio(payload: number | null) {
    if (
      (!this.pagePixelRatio && payload === window.devicePixelRatio) ||
      payload === this.pagePixelRatio
    ) {
      return
    }
    this.pagePixelRatio = payload
    this.setPageDevicePixel()
  }

  public setPageDevicePixel() {
    const dpr = this.getPagePixelRatio()
    const width = this.getWidth()
    const height = this.getHeight()
    this.pageList.forEach((p, i) => {
      p.width = width * dpr
      p.height = height * dpr
      this._initPageContext(this.ctxList[i])
    })
    this.render({
      isSubmitHistory: false,
      isSetCursor: false
    })
  }

  public setPaperSize(width: number, height: number) {
    this.options.width = width
    this.options.height = height
    const dpr = this.getPagePixelRatio()
    const realWidth = this.getWidth()
    const realHeight = this.getHeight()
    this.container.style.width = `${realWidth}px`
    this.pageList.forEach((p, i) => {
      p.width = realWidth * dpr
      p.height = realHeight * dpr
      p.style.width = `${realWidth}px`
      p.style.height = `${realHeight}px`
      this._initPageContext(this.ctxList[i])
    })
    this.render({
      isSubmitHistory: false,
      isSetCursor: false
    })
  }

  public setPaperDirection(payload: PaperDirection) {
    const dpr = this.getPagePixelRatio()
    this.options.paperDirection = payload
    const width = this.getWidth()
    const height = this.getHeight()
    this.container.style.width = `${width}px`
    this.pageList.forEach((p, i) => {
      p.width = width * dpr
      p.height = height * dpr
      p.style.width = `${width}px`
      p.style.height = `${height}px`
      this._initPageContext(this.ctxList[i])
    })
    this.render({
      isSubmitHistory: false,
      isSetCursor: false
    })
  }

  public setPaperMargin(payload: IMargin) {
    this.options.margins = payload
    this.render({
      isSubmitHistory: false,
      isSetCursor: false
    })
  }

  public getOriginValue(
    options: IGetOriginValueOption = {}
  ): Required<IEditorData> {
    const { pageNo } = options
    let mainElementList = this.elementList
    if (
      Number.isInteger(pageNo) &&
      pageNo! >= 0 &&
      pageNo! < this.pageRowList.length
    ) {
      mainElementList = this.pageRowList[pageNo!].flatMap(
        row => row.elementList
      )
    }
    // 同步block的最新数据
    this.blockParticle.update()
    const data: Required<IEditorData> = {
      header: this.getHeaderElementList(),
      main: mainElementList,
      footer: this.getFooterElementList(),
      graffiti: this.graffiti.getValue()
    }
    return data
  }

  public getValue(options: IGetValueOption = {}): IEditorResult {
    const originData = this.getOriginValue(options)
    const { extraPickAttrs } = options
    const data: IEditorData = {
      header: zipElementList(originData.header, {
        extraPickAttrs
      }),
      main: zipElementList(originData.main, {
        extraPickAttrs,
        isClassifyArea: true
      }),
      footer: zipElementList(originData.footer, {
        extraPickAttrs
      }),
      graffiti: originData.graffiti
    }
    return {
      version,
      data,
      options: deepClone(this.options)
    }
  }

  public setValue(payload: Partial<IEditorData>, options?: ISetValueOption) {
    const { header, main, footer } = deepClone(payload)
    if (!header && !main && !footer) return
    const { isSetCursor = false, recordHistory = false } = options || {}
    // 记录本次 setValue 之前的内容，用于 recordHistory 撤销回原状态
    const oldData = recordHistory ? this.getValue() : null
    console.log('[DEBUG history] setValue recordHistory=', recordHistory,
      '调用前 undoStack长度=', this.historyManager.getUndoStack().length,
      'main长度=', main?.length)
    const pageComponentData = [header, main, footer]
    pageComponentData.forEach(data => {
      if (!data) return
      formatElementList(data, {
        editorOptions: this.options,
        isForceCompensation: true
      })
    })
    this.setEditorData({
      header,
      main,
      footer
    })
    // recordHistory=false 时清空历史（保持原默认行为）；true 时由下方追加，不清空
    if (!recordHistory) {
      console.log('[DEBUG history] setValue(recordHistory=false) 清空整个撤销栈! 之前长度=',
        this.historyManager.getUndoStack().length)
      this.historyManager.recovery()
    }
    const curIndex = isSetCursor
      ? main?.length
        ? main.length - 1
        : 0
      : undefined
    if (curIndex !== undefined) {
      this.range.setRange(curIndex, curIndex)
    }
    // recordHistory: 把 setValue 前后的状态都作为快照，使撤销可逐步回到设置前。
    // HistoryManager 约定：undoStack 栈顶始终是“当前状态”，撤销 = 弹出栈顶并恢复到新的栈顶（上一步状态）。
    // 因此每次 setValue 都需要把“当前新状态”压到栈顶：
    // - 栈为空（首次）：先压“设置前状态”作底（index 0 占位），再压“当前新状态”作顶；
    // - 栈非空：直接在顶上压“当前新状态”（其“设置前状态”已为当前栈顶，无需重复压入）。
    if (recordHistory && oldData) {
      console.log('[DEBUG history] setValue(recordHistory=true) 压入 before/after 快照, 当前栈长=', this.historyManager.getUndoStack().length)
      // 撤销恢复“设置前”状态时，将光标落到恢复后内容的合法位置，
      // 避免旧 range 索引越界导致光标无法重绘（表现为撤销/重做后无法聚焦）。
      const oldMain = oldData.data?.main
      const oldCurIndex =
        oldMain && oldMain.length ? oldMain.length - 1 : undefined
      const oldFn = () => {
        this.setEditorData(deepClone(oldData.data))
        this.render({
          curIndex: oldCurIndex,
          isSetCursor: oldCurIndex !== undefined,
          isSubmitHistory: false,
          isSourceHistory: true
        })
      }
      ;(oldFn as any).__historySource = 'setValue-before'
      const finalData = {
        header: deepClone(header),
        main: deepClone(main),
        footer: deepClone(footer)
      }
      // 重做恢复“设置后”状态时同样落到合法末尾位置，确保光标可见、可编辑。
      const newCurIndex = main && main.length ? main.length - 1 : undefined
      const newFn = () => {
        this.setEditorData(finalData)
        this.render({
          curIndex: newCurIndex,
          isSetCursor: newCurIndex !== undefined,
          isSubmitHistory: false,
          isSourceHistory: true
        })
      }
      ;(newFn as any).__historySource = 'setValue-after'
      if (this.historyManager.isStackEmpty()) {
        // 栈为空：先压“设置前状态”作底，再压“当前新状态”作顶
        this.historyManager.execute(oldFn)
      }
      this.historyManager.execute(newFn)
    }
    this.render({
      curIndex,
      isSetCursor,
      isCompute: true,
      isFirstRender: true
    })
  }

  public setEditorData(payload: Partial<Omit<IEditorData, 'graffiti'>>) {
    const { header, main, footer } = payload
    if (header) {
      this.header.setElementList(header)
    }
    if (main) {
      this.elementList = main
    }
    if (footer) {
      this.footer.setElementList(footer)
    }
  }

  private _wrapContainer(rootContainer: HTMLElement): HTMLDivElement {
    const container = document.createElement('div')
    rootContainer.append(container)
    return container
  }

  private _formatContainer() {
    // 容器宽度需跟随纸张宽度
    this.container.style.position = 'relative'
    this.container.style.width = `${this.getWidth()}px`
    this.container.setAttribute(EDITOR_COMPONENT, EditorComponent.MAIN)
  }

  private _createPageContainer(): HTMLDivElement {
    const pageContainer = document.createElement('div')
    pageContainer.classList.add(`${EDITOR_PREFIX}-page-container`)
    this.container.append(pageContainer)
    return pageContainer
  }

  private _createPage(pageNo: number) {
    const width = this.getWidth()
    const height = this.getHeight()
    const canvas = document.createElement('canvas')
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    canvas.style.display = 'block'
    // canvas 元素的 CSS 背景跟随 options.background.color，
    // 避免页面间隙/背景图未加载/打印背景禁用时露出硬编码的白色
    canvas.style.backgroundColor = this.options.background.color
    canvas.style.marginBottom = `${this.getPageGap()}px`
    canvas.setAttribute('data-index', String(pageNo))
    this.pageContainer.append(canvas)
    // 调整分辨率
    const dpr = this.getPagePixelRatio()
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.cursor = 'text'
    const ctx = canvas.getContext('2d')!
    // 初始化上下文配置
    this._initPageContext(ctx)
    // 缓存上下文
    this.pageList.push(canvas)
    this.ctxList.push(ctx)
  }

  private _initPageContext(ctx: CanvasRenderingContext2D) {
    const dpr = this.getPagePixelRatio()
    ctx.scale(dpr, dpr)
    // 重置以下属性是因部分浏览器(chrome)会应用css样式
    ctx.letterSpacing = '0px'
    ctx.wordSpacing = '0px'
    ctx.direction = 'ltr'
  }

  public getElementFont(el: IElement, scale = 1): string {
    const { defaultSize, defaultFont } = this.options
    const font = el.font || defaultFont
    const size = el.actualSize || el.size || defaultSize
    return `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${
      size * scale
    }px ${font}`
  }

  public getElementSize(el: IElement) {
    return el.actualSize || el.size || this.options.defaultSize
  }

  public getElementRowMargin(el: IElement) {
    const {
      defaultSize,
      defaultBasicRowMarginHeight,
      defaultRowMargin,
      scale
    } = this.options
    // 行间距随字号等比缩放：以默认字号为基准（基准字号时 ratio=1），
    // 缩小字号时行距同步缩小，放大字号时行距同步放大（类似 Word 单倍行距）
    const fontSize = el.size || defaultSize
    const ratio = fontSize / defaultSize
    return (
      defaultBasicRowMarginHeight *
      ratio *
      (el.rowMargin ?? defaultRowMargin) *
      scale
    )
  }

  public computeRowList(payload: IComputeRowListPayload) {
    const {
      innerWidth,
      elementList,
      isPagingMode = false,
      isFromTable = false,
      startX = 0,
      startY = 0,
      pageHeight = 0,
      mainOuterHeight = 0,
      surroundElementList = []
    } = payload
    const {
      defaultSize,
      scale,
      imgCaption,
      table: { tdPadding },
      defaultTabWidth
    } = this.options
    const defaultBasicRowMarginHeight = this.getDefaultBasicRowMarginHeight()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    // 计算列表偏移宽度
    const listStyleMap = this.listParticle.computeListStyle(ctx, elementList)
    const rowList: IRow[] = []
    if (elementList.length) {
      rowList.push({
        width: 0,
        height: 0,
        ascent: 0,
        elementList: [],
        startIndex: 0,
        rowIndex: 0,
        rowFlex: elementList?.[0]?.rowFlex || elementList?.[1]?.rowFlex
      })
    }
    // 起始位置及页码计算
    let x = startX
    let y = startY
    let pageNo = 0
    // 列表位置
    let listId: string | undefined
    let listIndex = 0
    // 控件最小宽度
    let controlRealWidth = 0
    for (let i = 0; i < elementList.length; i++) {
      const curRow: IRow = rowList[rowList.length - 1]
      const element = elementList[i]
      const rowMargin = this.getElementRowMargin(element)
      const metrics: IElementMetrics = {
        width: 0,
        height: 0,
        boundingBoxAscent: 0,
        boundingBoxDescent: 0
      }
      // 实际可用宽度
      const offsetX =
        curRow.offsetX ||
        (element.listId && listStyleMap.get(element.listId)) ||
        0
      const availableWidth = innerWidth - offsetX
      // 增加起始位置坐标偏移量
      const isStartElement = curRow.elementList.length === 1
      x += isStartElement ? offsetX : 0
      y += isStartElement ? curRow.offsetY || 0 : 0
      if (
        (element.hide || element.control?.hide || element.area?.hide) &&
        !this.isDesignMode()
      ) {
        const preElement = curRow.elementList[curRow.elementList.length - 1]
        metrics.height =
          preElement?.metrics.height || this.options.defaultSize * scale
        metrics.boundingBoxAscent = preElement?.metrics.boundingBoxAscent || 0
        metrics.boundingBoxDescent = preElement?.metrics.boundingBoxDescent || 0
      } else if (
        element.type === ElementType.IMAGE ||
        element.type === ElementType.LATEX
      ) {
        // 浮动图片无需计算数据
        if (
          element.imgDisplay === ImageDisplay.SURROUND ||
          element.imgDisplay === ImageDisplay.FLOAT_TOP ||
          element.imgDisplay === ImageDisplay.FLOAT_BOTTOM
        ) {
          metrics.width = 0
          metrics.height = 0
          metrics.boundingBoxDescent = 0
        } else {
          const elementWidth = element.width! * scale
          const elementHeight = element.height! * scale
          // 图片超出尺寸后自适应（图片大小大于可用宽度时）
          if (elementWidth > availableWidth) {
            const adaptiveHeight =
              (elementHeight * availableWidth) / elementWidth
            element.width = availableWidth / scale
            element.height = adaptiveHeight / scale
            metrics.width = availableWidth
            metrics.height = adaptiveHeight
            metrics.boundingBoxDescent = adaptiveHeight
          } else {
            metrics.width = elementWidth
            metrics.height = elementHeight
            metrics.boundingBoxDescent = elementHeight
          }
          // 增加题注高度
          if (element.imgCaption?.value) {
            const fontSize = element.imgCaption.size || imgCaption.size
            const captionTop = element.imgCaption.top ?? imgCaption.top
            const captionHeight = (fontSize + captionTop) * scale
            metrics.boundingBoxAscent += captionHeight
          }
        }
      } else if (element.type === ElementType.TABLE) {
        const tdPaddingWidth = tdPadding[1] + tdPadding[3]
        const tdPaddingHeight = tdPadding[0] + tdPadding[2]
        // 表格分页处理进度：https://github.com/Hufe921/canvas-editor/issues/41
        // 查看后续表格是否属于同一个源表格-存在即合并
        if (element.pagingId) {
          let tableIndex = i + 1
          let combineCount = 0
          while (tableIndex < elementList.length) {
            const nextElement = elementList[tableIndex]
            if (nextElement.pagingId === element.pagingId) {
              const nexTrList = nextElement.trList!.filter(
                tr => !tr.pagingRepeat
              )
              element.trList!.push(...nexTrList)
              element.height! += nextElement.height!
              tableIndex++
              combineCount++
            } else {
              break
            }
          }
          if (combineCount) {
            elementList.splice(i + 1, combineCount)
          }
        }
        element.pagingIndex = element.pagingIndex ?? 0
        const trList = element.trList!
        // 重置tr高度：行高不可低于一个单元格最小高度
        const tdMinHeight =
          tdPaddingHeight + defaultSize + (rowMargin * 2) / scale
        for (let t = 0; t < trList.length; t++) {
          const tr = trList[t]
          // 行高默认当前最小高度，后续根据内容自适应
          tr.height = Math.max(tdMinHeight, tr.minHeight || 0)
          tr.minHeight = tr.height
        }
        // 计算表格行列
        this.tableParticle.computeRowColInfo(element)
        // 计算表格内元素信息
        for (let t = 0; t < trList.length; t++) {
          const tr = trList[t]
          for (let d = 0; d < tr.tdList.length; d++) {
            const td = tr.tdList[d]
            const rowList = this.computeRowList({
              innerWidth: (td.width! - tdPaddingWidth) * scale,
              elementList: td.value,
              isFromTable: true,
              isPagingMode
            })
            const rowHeight = rowList.reduce((pre, cur) => pre + cur.height, 0)
            td.rowList = rowList
            // 移除缩放导致的行高变化-渲染时会进行缩放调整
            const curTdHeight = rowHeight / scale + tdPaddingHeight
            // 内容高度大于当前单元格高度需增加
            if (td.height! < curTdHeight) {
              const extraHeight = curTdHeight - td.height!
              const changeTr = trList[t + td.rowspan - 1]
              changeTr.height += extraHeight
              changeTr.tdList.forEach(changeTd => {
                changeTd.height! += extraHeight
                if (!changeTd.realHeight) {
                  changeTd.realHeight = changeTd.height!
                } else {
                  changeTd.realHeight! += extraHeight
                }
              })
            }
            // 当前单元格最小高度及真实高度（包含跨列）
            let curTdMinHeight = 0
            let curTdRealHeight = 0
            let i = 0
            while (i < td.rowspan) {
              const curTr = trList[i + t] || trList[t]
              curTdMinHeight += curTr.minHeight!
              curTdRealHeight += curTr.height!
              i++
            }
            td.realMinHeight = curTdMinHeight
            td.realHeight = curTdRealHeight
            td.mainHeight = curTdHeight
          }
        }
        // 单元格高度大于实际内容高度需减少
        const reduceTrList = this.tableParticle.getTrListGroupByCol(trList)
        for (let t = 0; t < reduceTrList.length; t++) {
          const tr = reduceTrList[t]
          let reduceHeight = -1
          for (let d = 0; d < tr.tdList.length; d++) {
            const td = tr.tdList[d]
            const curTdRealHeight = td.realHeight!
            const curTdHeight = td.mainHeight!
            const curTdMinHeight = td.realMinHeight!
            // 获取最大可减少高度
            const curReduceHeight =
              curTdHeight < curTdMinHeight
                ? curTdRealHeight - curTdMinHeight
                : curTdRealHeight - curTdHeight
            if (!~reduceHeight || curReduceHeight < reduceHeight) {
              reduceHeight = curReduceHeight
            }
          }
          if (reduceHeight > 0) {
            const changeTr = trList[t]
            changeTr.height -= reduceHeight
            changeTr.tdList.forEach(changeTd => {
              changeTd.height! -= reduceHeight
              changeTd.realHeight! -= reduceHeight
            })
          }
        }
        // 需要重新计算表格内值
        this.tableParticle.computeRowColInfo(element)
        // 计算出表格高度
        const tableHeight = this.tableParticle.getTableHeight(element)
        const tableWidth = this.tableParticle.getTableWidth(element)
        element.width = tableWidth
        element.height = tableHeight
        const elementWidth = tableWidth * scale
        const elementHeight = tableHeight * scale
        metrics.width = elementWidth
        metrics.height = elementHeight
        metrics.boundingBoxDescent = elementHeight
        metrics.boundingBoxAscent = -rowMargin
        // 后一个元素也是表格则移除行间距
        if (elementList[i + 1]?.type === ElementType.TABLE) {
          metrics.boundingBoxAscent -= rowMargin
        }
        // 表格分页处理(拆分表格)
        if (isPagingMode) {
          const height = this.getHeight()
          const marginHeight = this.getMainOuterHeight()
          let curPagePreHeight = marginHeight
          for (let r = 0; r < rowList.length; r++) {
            const row = rowList[r]
            const rowOffsetY = row.offsetY || 0
            if (
              row.height + curPagePreHeight + rowOffsetY > height ||
              rowList[r - 1]?.isPageBreak
            ) {
              curPagePreHeight = marginHeight + row.height + rowOffsetY
            } else {
              curPagePreHeight += row.height + rowOffsetY
            }
          }
          // 当前剩余高度是否能容下当前表格第一行（可拆分）的高度，排除掉表头类型
          // 前面元素为换页符时重新计算高度
          const rowMarginHeight = rowMargin * 2 * scale
          const firstTrHeight = element.trList![0].height! * scale
          if (
            curPagePreHeight + firstTrHeight + rowMarginHeight > height ||
            (element.pagingIndex !== 0 && element.trList![0].pagingRepeat) ||
            elementList[i - 1]?.type === ElementType.PAGE_BREAK
          ) {
            // 无可拆分行则切换至新页
            curPagePreHeight = marginHeight
          }
          // 表格高度超过页面高度开始截断行
          if (curPagePreHeight + rowMarginHeight + elementHeight > height) {
            const trList = element.trList!
            // 计算需要移除的行数
            let deleteStart = 0
            let deleteCount = 0
            let preTrHeight = 0
            // 大于一行时再拆分避免循环
            if (trList.length > 1) {
              for (let r = 0; r < trList.length; r++) {
                const tr = trList[r]
                const trHeight = tr.height * scale
                if (
                  curPagePreHeight + rowMarginHeight + preTrHeight + trHeight >
                  height
                ) {
                  // 当前行存在跨行中断-暂时忽略分页
                  const rowColCount = tr.tdList.reduce(
                    (pre, cur) => pre + cur.colspan,
                    0
                  )
                  if (element.colgroup?.length !== rowColCount) {
                    deleteCount = 0
                  }
                  break
                } else {
                  deleteStart = r + 1
                  deleteCount = trList.length - deleteStart
                  preTrHeight += trHeight
                }
              }
            }
            if (deleteCount) {
              const cloneTrList = trList.splice(deleteStart, deleteCount)
              const cloneTrHeight = cloneTrList.reduce(
                (pre, cur) => pre + cur.height,
                0
              )
              const cloneTrRealHeight = cloneTrHeight * scale
              const pagingId = element.pagingId || getUUID()
              element.pagingId = pagingId
              element.height -= cloneTrHeight
              metrics.height -= cloneTrRealHeight
              metrics.boundingBoxDescent -= cloneTrRealHeight
              // 追加拆分表格
              const cloneElement = deepClone(element)
              cloneElement.pagingId = pagingId
              cloneElement.pagingIndex = element.pagingIndex! + 1
              // 处理分页重复表头
              const repeatTrList = trList.filter(tr => tr.pagingRepeat)
              if (repeatTrList.length) {
                const cloneRepeatTrList = deepClone(repeatTrList)
                cloneRepeatTrList.forEach(tr => (tr.id = getUUID()))
                cloneTrList.unshift(...cloneRepeatTrList)
              }
              cloneElement.trList = cloneTrList
              cloneElement.id = getUUID()
              this.spliceElementList(elementList, i + 1, 0, [cloneElement])
            }
          }
          // 表格经过分页处理-需要处理上下文
          if (element.pagingId) {
            const positionContext = this.position.getPositionContext()
            if (positionContext.isTable) {
              // 查找光标所在表格索引（根据trId搜索）
              let newPositionContextIndex = -1
              let newPositionContextTrIndex = -1
              let tableIndex = i
              while (tableIndex < elementList.length) {
                const curElement = elementList[tableIndex]
                if (curElement.pagingId !== element.pagingId) break
                const trIndex = curElement.trList!.findIndex(
                  r => r.id === positionContext.trId
                )
                if (~trIndex) {
                  newPositionContextIndex = tableIndex
                  newPositionContextTrIndex = trIndex
                  break
                }
                tableIndex++
              }
              if (~newPositionContextIndex) {
                positionContext.index = newPositionContextIndex
                positionContext.trIndex = newPositionContextTrIndex
                this.position.setPositionContext(positionContext)
              }
            }
          }
        }
      } else if (element.type === ElementType.SEPARATOR) {
        const {
          separator: { lineWidth: defaultLineWidth }
        } = this.options
        const lineWidth = element.lineWidth || defaultLineWidth
        element.width = availableWidth / scale
        metrics.width = availableWidth
        metrics.height = lineWidth * scale
        metrics.boundingBoxAscent = -rowMargin
        metrics.boundingBoxDescent = -rowMargin + metrics.height
      } else if (element.type === ElementType.PAGE_BREAK) {
        element.width = availableWidth / scale
        metrics.width = availableWidth
        metrics.height = defaultSize
      } else if (
        element.type === ElementType.RADIO ||
        element.controlComponent === ControlComponent.RADIO
      ) {
        const { gap } = this.options.radio
        // 图标高度随字号缩放，避免固定像素撑大整行行高
        const boxSize = (element.size || defaultSize) * scale
        const elementWidth = boxSize + gap * 2 * scale
        element.width = boxSize + gap * 2
        metrics.width = elementWidth * scale
        metrics.height = boxSize
      } else if (
        element.type === ElementType.CHECKBOX ||
        element.controlComponent === ControlComponent.CHECKBOX
      ) {
        const { gap } = this.options.checkbox
        // 图标高度随字号缩放，避免固定像素撑大整行行高
        const boxSize = (element.size || defaultSize) * scale
        const elementWidth = boxSize + gap * 2 * scale
        element.width = boxSize + gap * 2
        metrics.width = elementWidth * scale
        metrics.height = boxSize
      } else if (element.type === ElementType.TAB) {
        metrics.width = defaultTabWidth * scale
        metrics.height = defaultSize * scale
        metrics.boundingBoxDescent = 0
        metrics.boundingBoxAscent =
          this.textParticle.getBasisWordBoundingBoxAscent(ctx, ctx.font)
      } else if (element.type === ElementType.BLOCK) {
        if (!element.width) {
          metrics.width = availableWidth
        } else {
          const elementWidth = element.width * scale
          metrics.width = Math.min(elementWidth, availableWidth)
        }
        metrics.height = element.height! * scale
        metrics.boundingBoxDescent = metrics.height
        metrics.boundingBoxAscent = 0
      } else if (element.type === ElementType.LABEL) {
        const {
          defaultSize,
          label: { defaultPadding }
        } = this.options
        ctx.font = this.getElementFont(element)
        const fontMetrics = this.textParticle.measureText(ctx, element)
        metrics.width =
          (fontMetrics.width + defaultPadding[1] + defaultPadding[3]) * scale
        metrics.height = (element.size || defaultSize) * scale
        metrics.boundingBoxDescent = 0
        metrics.boundingBoxAscent =
          (defaultPadding[0] + fontMetrics.actualBoundingBoxAscent) * scale
      } else if (
        element.controlComponent === ControlComponent.POSTFIX &&
        element.control &&
        (element.control.type === ControlType.CUSTOM_SELECT ||
          element.control.type === ControlType.MULTI_CUSTOM_SELECT)
      ) {
        const size = element.size || defaultSize
        const particleSize = size * 0.8
        const circleRadius = particleSize * 0.7
        const elementWidth = circleRadius * 2 + size * 0.2
        element.width = elementWidth
        metrics.width = elementWidth * scale
        metrics.height = size * scale
        metrics.boundingBoxDescent = 0
        metrics.boundingBoxAscent = metrics.height
      } else if (
        element.controlComponent === ControlComponent.POSTFIX &&
        element.control &&
        element.control.type === ControlType.NUMBER_FLAG
      ) {
        const size = element.size || defaultSize
        const headSize = size * 0.2
        const headAngle = Math.PI / 5
        const elementWidth = headSize * Math.sin(headAngle) * 2 + size * 0.3
        element.width = elementWidth
        metrics.width = elementWidth * scale
        metrics.height = size * scale
        metrics.boundingBoxDescent = 0
        metrics.boundingBoxAscent = metrics.height
      } else {
        // 设置上下标真实字体尺寸
        const size = element.size || defaultSize
        if (
          element.type === ElementType.SUPERSCRIPT ||
          element.type === ElementType.SUBSCRIPT
        ) {
          element.actualSize = Math.ceil(size * 0.6)
        }
        metrics.height = (element.actualSize || size) * scale
        ctx.font = this.getElementFont(element)
        const fontMetrics = this.textParticle.measureText(ctx, element)
        metrics.width = fontMetrics.width * scale
        if (element.letterSpacing) {
          metrics.width += element.letterSpacing * scale
        }
        // 使用基于字体的基准度量以确保一致的行高，避免字符特定度量导致的布局跳动
        // 注意：必须传入含字号的完整 font（getElementFont），而非仅字体族名 element.font，
        // 否则基准行高不随 element.size 变化，导致放大字号后缩小字号时行高不回落
        const basisMetrics = this.textParticle.measureBasisWord(
          ctx,
          this.getElementFont(element)
        )
        metrics.boundingBoxAscent = basisMetrics.actualBoundingBoxAscent * scale
        metrics.boundingBoxDescent =
          basisMetrics.actualBoundingBoxDescent * scale
        if (element.type === ElementType.SUPERSCRIPT) {
          metrics.boundingBoxAscent += metrics.height / 2
        } else if (element.type === ElementType.SUBSCRIPT) {
          metrics.boundingBoxDescent += metrics.height / 2
        }
      }
      // 文本模式下，PREFIX 和 POSTFIX 的宽度设置为0
      if (
        this.controlRenderMode === ControlRenderMode.TEXT &&
        (element.controlComponent === ControlComponent.PREFIX ||
          element.controlComponent === ControlComponent.POSTFIX)
      ) {
        metrics.width = 0
        metrics.boundingBoxAscent = 0
        metrics.boundingBoxDescent = 0
      }
      const ascent =
        !element.hide &&
        ((element.imgDisplay !== ImageDisplay.INLINE &&
          element.type === ElementType.IMAGE) ||
          element.type === ElementType.LATEX)
          ? metrics.height + rowMargin
          : metrics.boundingBoxAscent + rowMargin
      const height =
        rowMargin +
        metrics.boundingBoxAscent +
        metrics.boundingBoxDescent +
        rowMargin
      const rowElement: IRowElement = Object.assign(element, {
        metrics,
        left: 0,
        style: this.getElementFont(element, scale)
      })
      // 暂时只考虑非换行场景：控件开始时统计宽度，结束时消费宽度及还原
      if (rowElement.control?.minWidth) {
        if (rowElement.controlComponent) {
          controlRealWidth += metrics.width
        }
        if (rowElement.controlComponent === ControlComponent.POSTFIX) {
          // 设置最小宽度控件属性（字符偏移量）
          this.control.setMinWidthControlInfo({
            row: curRow,
            rowElement,
            availableWidth,
            controlRealWidth
          })
          controlRealWidth = 0
        }
      }
      // 超过限定宽度
      const preElement = elementList[i - 1]
      let nextElement = elementList[i + 1]
      // 累计行宽 + 当前元素宽度 + 排版宽度(英文单词整体宽度 + 后面标点符号宽度)
      let curRowWidth = curRow.width + metrics.width
      if (this.options.wordBreak === WordBreak.BREAK_WORD) {
        if (
          (!preElement?.type || preElement?.type === ElementType.TEXT) &&
          (!element.type || element.type === ElementType.TEXT)
        ) {
          // 英文单词
          const word = `${preElement?.value || ''}${element.value}`
          if (this.WORD_LIKE_REG.test(word)) {
            const { width, endElement } = this.textParticle.measureWord(
              ctx,
              elementList,
              i
            )
            // 后面存在元素 && 单词宽度大于行可用宽度，无需折行
            const wordWidth = width * scale
            if (endElement && wordWidth <= availableWidth) {
              curRowWidth += wordWidth
              nextElement = endElement
            }
          }
          // 标点符号
          const punctuationWidth = this.textParticle.measurePunctuationWidth(
            ctx,
            nextElement
          )
          curRowWidth += punctuationWidth * scale
        }
      }
      // 列表信息
      if (element.listId) {
        if (element.listId !== listId) {
          listIndex = 0
        } else if (element.value === ZERO && !element.listWrap) {
          listIndex++
        }
      }
      listId = element.listId
      // 计算四周环绕导致的元素偏移量
      const surroundPosition = this.position.setSurroundPosition({
        pageNo,
        rowElement,
        row: curRow,
        rowElementRect: {
          x,
          y,
          height,
          width: metrics.width
        },
        availableWidth,
        surroundElementList
      })
      x = surroundPosition.x
      curRowWidth += surroundPosition.rowIncreaseWidth
      x += metrics.width
      // 是否强制换行
      const isForceBreak =
        element.type === ElementType.SEPARATOR ||
        element.type === ElementType.TABLE ||
        preElement?.type === ElementType.TABLE ||
        preElement?.type === ElementType.BLOCK ||
        element.type === ElementType.BLOCK ||
        preElement?.imgDisplay === ImageDisplay.INLINE ||
        element.imgDisplay === ImageDisplay.INLINE ||
        preElement?.listId !== element.listId ||
        (preElement?.areaId !== element.areaId && !element.area?.hide) ||
        (element.control?.flexDirection === FlexDirection.COLUMN &&
          (element.controlComponent === ControlComponent.CHECKBOX ||
            element.controlComponent === ControlComponent.RADIO) &&
          preElement?.controlComponent === ControlComponent.VALUE) ||
        (i !== 0 && element.value === ZERO && !element.area?.hide)
      // 是否宽度不足导致换行
      const isWidthNotEnough = curRowWidth > availableWidth
      const isWrap = isForceBreak || isWidthNotEnough
      // 新行数据处理
      if (isWrap) {
        const row: IRow = {
          width: metrics.width,
          height,
          startIndex: i,
          elementList: [rowElement],
          ascent,
          rowIndex: curRow.rowIndex + 1,
          rowFlex: elementList[i]?.rowFlex || elementList[i + 1]?.rowFlex,
          isPageBreak: element.type === ElementType.PAGE_BREAK
        }
        // 控件缩进
        if (
          rowElement.controlComponent !== ControlComponent.PREFIX &&
          rowElement.control?.indentation === ControlIndentation.VALUE_START
        ) {
          // 查找到非前缀的第一个元素位置
          const preStartIndex = curRow.elementList.findIndex(
            el =>
              el.controlId === rowElement.controlId &&
              el.controlComponent !== ControlComponent.PREFIX
          )
          if (~preStartIndex) {
            const preRowPositionList = this.position.computeRowPosition({
              row: curRow,
              innerWidth: this.getInnerWidth()
            })
            const valueStartPosition = preRowPositionList[preStartIndex]
            if (valueStartPosition) {
              row.offsetX = valueStartPosition.coordinate.leftTop[0]
            }
          }
        }
        // 列表缩进
        if (element.listId) {
          row.isList = true
          row.offsetX = listStyleMap.get(element.listId!)
          row.listIndex = listIndex
        }
        // Y轴偏移量
        row.offsetY =
          !isFromTable &&
          element.area?.top &&
          element.areaId !== elementList[i - 1]?.areaId
            ? element.area.top * scale
            : 0
        rowList.push(row)
      } else {
        curRow.width += metrics.width
        // 减小块元素前第一行空行行高
        if (
          i === 0 &&
          (getIsBlockElement(elementList[1]) || !!elementList[1]?.areaId)
        ) {
          curRow.height = defaultBasicRowMarginHeight
          curRow.ascent = defaultBasicRowMarginHeight
        } else if (curRow.height < height) {
          curRow.height = height
          curRow.ascent = ascent
        }
        curRow.elementList.push(rowElement)
      }
      // 行结束时逻辑
      if (isWrap || i === elementList.length - 1) {
        // 换行原因：宽度不足
        curRow.isWidthNotEnough = isWidthNotEnough && !isForceBreak
        // 两端对齐、分散对齐
        if (
          !curRow.isSurround &&
          (preElement?.rowFlex === RowFlex.JUSTIFY ||
            (preElement?.rowFlex === RowFlex.ALIGNMENT &&
              curRow.isWidthNotEnough))
        ) {
          // 忽略换行符及尾部元素间隔设置
          const rowElementList =
            curRow.elementList[0]?.value === ZERO
              ? curRow.elementList.slice(1)
              : curRow.elementList
          const gap =
            (availableWidth - curRow.width) / (rowElementList.length - 1)
          for (let e = 0; e < rowElementList.length - 1; e++) {
            const el = rowElementList[e]
            el.metrics.width += gap
          }
          curRow.width = availableWidth
        }
      }
      // 重新计算坐标、页码、下一行首行元素环绕交叉
      if (isWrap) {
        x = startX
        y += curRow.height
        if (
          isPagingMode &&
          !isFromTable &&
          pageHeight &&
          (y - startY + mainOuterHeight + height > pageHeight ||
            element.type === ElementType.PAGE_BREAK)
        ) {
          y = startY
          // 删除多余四周环绕型元素
          deleteSurroundElementList(surroundElementList, pageNo)
          pageNo += 1
        }
        // 计算下一行第一个元素是否存在环绕交叉
        rowElement.left = 0
        const nextRow = rowList[rowList.length - 1]
        const surroundPosition = this.position.setSurroundPosition({
          pageNo,
          rowElement,
          row: nextRow,
          rowElementRect: {
            x,
            y,
            height,
            width: metrics.width
          },
          availableWidth,
          surroundElementList
        })
        x = surroundPosition.x
        x += metrics.width
      }
    }
    // [DEBUG history] 单行可疑诊断：整段只生成一行且元素很多，
    // 打印首元素宽度与 ctx.font，确认是否 metrics.width=0 导致不折行
    if (rowList.length === 1 && elementList.length > 5) {
      const _firstEl = rowList[0].elementList[0]
      const _firstW = _firstEl?.metrics?.width ?? -1
      console.log('[DEBUG history] computeRowList 单行可疑! rowList行数=',
        rowList.length, 'elementList长度=', elementList.length,
        '首元素value=', JSON.stringify(_firstEl?.value),
        '首元素type=', _firstEl?.type,
        '首元素metrics.width=', _firstW.toFixed(2),
        'ctx.font=', ctx.font,
        'defaultFont=', this.options.defaultFont,
        'innerWidth=', innerWidth.toFixed(0))
    }
    return rowList
  }

  private _computePageList(): IRow[][] {
    const pageRowList: IRow[][] = [[]]
    const {
      pageMode,
      pageNumber: { maxPageNo }
    } = this.options
    const height = this.getHeight()
    const marginHeight = this.getMainOuterHeight()
    let pageHeight = marginHeight
    let pageNo = 0
    if (pageMode === PageMode.CONTINUITY) {
      pageRowList[0] = this.rowList
      // 重置高度
      pageHeight += this.rowList.reduce(
        (pre, cur) => pre + cur.height + (cur.offsetY || 0),
        0
      )
      const dpr = this.getPagePixelRatio()
      const pageDom = this.pageList[0]
      const pageDomHeight = Number(pageDom.style.height.replace('px', ''))
      if (pageHeight > pageDomHeight) {
        pageDom.style.height = `${pageHeight}px`
        pageDom.height = pageHeight * dpr
      } else {
        const reduceHeight = pageHeight < height ? height : pageHeight
        pageDom.style.height = `${reduceHeight}px`
        pageDom.height = reduceHeight * dpr
      }
      this._initPageContext(this.ctxList[0])
    } else {
      for (let i = 0; i < this.rowList.length; i++) {
        const row = this.rowList[i]
        const rowOffsetY = row.offsetY || 0
        if (
          row.height + rowOffsetY + pageHeight > height ||
          this.rowList[i - 1]?.isPageBreak
        ) {
          if (Number.isInteger(maxPageNo) && pageNo >= maxPageNo!) {
            this.elementList = this.elementList.slice(0, row.startIndex)
            break
          }
          pageHeight = marginHeight + row.height + rowOffsetY
          pageRowList.push([row])
          pageNo++
        } else {
          pageHeight += row.height + rowOffsetY
          pageRowList[pageNo].push(row)
        }
      }
    }
    return pageRowList
  }

  private _drawHighlight(
    ctx: CanvasRenderingContext2D,
    payload: IDrawRowPayload
  ) {
    const { rowList, positionList, elementList } = payload
    const marginHeight = this.getDefaultBasicRowMarginHeight()
    const highlightMarginHeight = this.getHighlightMarginHeight()
    for (let i = 0; i < rowList.length; i++) {
      const curRow = rowList[i]
      let positionIndex = curRow.startIndex
      for (let j = 0; j < curRow.elementList.length; j++) {
        const element = curRow.elementList[j]
        const preElement = curRow.elementList[j - 1]
        // 不可见元素（文本模式下 PREFIX/POSTFIX）跳过高亮渲染
        if (positionList[positionIndex]?.isInvisible) {
          positionIndex++
          continue
        }
        // 高亮配置：元素 > 控件配置
        const highlight =
          element.highlight ||
          this.control.getControlHighlight(elementList, positionIndex)
        if (highlight) {
          // 高亮元素相连需立即绘制，并记录下一元素坐标
          if (
            preElement &&
            preElement.highlight &&
            preElement.highlight !== element.highlight
          ) {
            this.highlight.render(ctx)
          }
          // 当前元素位置信息记录
          const {
            coordinate: {
              leftTop: [x, y]
            }
          } = positionList[positionIndex]
          // 元素向左偏移量
          const offsetX = element.left || 0
          this.highlight.recordFillInfo(
            ctx,
            x - offsetX,
            y + marginHeight - highlightMarginHeight, // 先减去行margin，再加上高亮margin
            element.metrics.width + offsetX,
            curRow.height - 2 * marginHeight + 2 * highlightMarginHeight,
            highlight
          )
        } else if (preElement?.highlight) {
          // 之前是高亮元素，当前不是需立即绘制
          this.highlight.render(ctx)
        }
        positionIndex++
      }
      this.highlight.render(ctx)
    }
  }

  public drawRow(ctx: CanvasRenderingContext2D, payload: IDrawRowPayload) {
    // 优先绘制高亮元素
    this._drawHighlight(ctx, payload)
    // 绘制元素、下划线、删除线、选区
    const {
      scale,
      table: { tdPadding },
      group,
      lineBreak,
      whiteSpace
    } = this.options
    const {
      rowList,
      pageNo,
      elementList,
      positionList,
      startIndex,
      zone,
      isDrawLineBreak = !lineBreak.disabled,
      isDrawWhiteSpace = !whiteSpace.disabled
    } = payload
    const isPrintMode = this.isPrintMode()
    const isGraffitiMode = this.isGraffitiMode()
    const { isCrossRowCol, tableId } = this.range.getRange()
    let index = startIndex
    for (let i = 0; i < rowList.length; i++) {
      const curRow = rowList[i]
      // 选区绘制记录
      const rangeRecord: IElementFillRect = {
        x: 0,
        y: 0,
        width: 0,
        height: 0
      }
      let tableRangeElement: IElement | null = null
      let positionIndex = curRow.startIndex
      for (let j = 0; j < curRow.elementList.length; j++) {
        const element = curRow.elementList[j]
        const metrics = element.metrics
        // 不可见元素（文本模式下 PREFIX/POSTFIX）跳过绘制
        // 但 positionIndex 和 index 都必须递增以保持索引对齐
        if (positionList[positionIndex]?.isInvisible) {
          positionIndex++
          index++
          continue
        }
        // 当前元素位置信息
        const {
          ascent: offsetY,
          coordinate: {
            leftTop: [x, y]
          }
        } = positionList[positionIndex]
        positionIndex++
        const preElement = curRow.elementList[j - 1]
        if (
          (element.hide || element.control?.hide || element.area?.hide) &&
          !this.isDesignMode()
        ) {
          // 控件隐藏时不绘制
          this.textParticle.complete()
        } else if (element.type === ElementType.IMAGE) {
          this.textParticle.complete()
          // 浮动图片单独绘制
          if (
            element.imgDisplay !== ImageDisplay.SURROUND &&
            element.imgDisplay !== ImageDisplay.FLOAT_TOP &&
            element.imgDisplay !== ImageDisplay.FLOAT_BOTTOM
          ) {
            this.imageParticle.render(ctx, element, x, y + offsetY)
          }
        } else if (element.type === ElementType.LATEX) {
          this.textParticle.complete()
          this.laTexParticle.render(ctx, element, x, y + offsetY)
        } else if (element.type === ElementType.TABLE) {
          if (isCrossRowCol) {
            rangeRecord.x = x
            rangeRecord.y = y
            tableRangeElement = element
          }
          this.tableParticle.render(ctx, element, x, y)
        } else if (element.type === ElementType.HYPERLINK) {
          this.textParticle.complete()
          this.hyperlinkParticle.render(ctx, element, x, y + offsetY)
        } else if (element.type === ElementType.LABEL) {
          this.textParticle.complete()
          this.labelParticle.render(ctx, element, x, y + offsetY)
        } else if (element.type === ElementType.DATE) {
          const nextElement = curRow.elementList[j + 1]
          // 释放之前的
          if (!preElement || preElement.dateId !== element.dateId) {
            this.textParticle.complete()
          }
          this.textParticle.record(ctx, element, x, y + offsetY)
          if (!nextElement || nextElement.dateId !== element.dateId) {
            // 手动触发渲染
            this.textParticle.complete()
          }
        } else if (element.type === ElementType.SUPERSCRIPT) {
          this.textParticle.complete()
          this.superscriptParticle.render(ctx, element, x, y + offsetY)
        } else if (element.type === ElementType.SUBSCRIPT) {
          this.underline.render(ctx)
          this.textParticle.complete()
          this.subscriptParticle.render(ctx, element, x, y + offsetY)
        } else if (element.type === ElementType.SEPARATOR) {
          this.separatorParticle.render(ctx, element, x, y)
        } else if (element.type === ElementType.PAGE_BREAK) {
          if (this.mode !== EditorMode.CLEAN && !isPrintMode) {
            this.pageBreakParticle.render(ctx, element, x, y)
          }
        } else if (
          element.type === ElementType.CHECKBOX ||
          element.controlComponent === ControlComponent.CHECKBOX
        ) {
          this.textParticle.complete()
          // 纯文本模式下跳过控件UI元素渲染
          if (this.controlRenderMode === ControlRenderMode.CONTROL) {
            this.checkboxParticle.render({
              ctx,
              x,
              y: y + offsetY,
              index: j,
              row: curRow
            })
          }
        } else if (
          element.type === ElementType.RADIO ||
          element.controlComponent === ControlComponent.RADIO
        ) {
          this.textParticle.complete()
          // 纯文本模式下跳过控件UI元素渲染
          if (this.controlRenderMode === ControlRenderMode.CONTROL) {
            this.radioParticle.render({
              ctx,
              x,
              y: y + offsetY,
              index: j,
              row: curRow
            })
          }
        } else if (element.type === ElementType.TAB) {
          this.textParticle.complete()
        } else if (
          element.rowFlex === RowFlex.ALIGNMENT ||
          element.rowFlex === RowFlex.JUSTIFY
        ) {
          // 如果是两端对齐，因canvas目前不支持letterSpacing需单独绘制文本
          this.textParticle.record(
            ctx,
            this.getSelectorTextValueElement(element),
            x,
            y + offsetY
          )
          this.textParticle.complete()
        } else if (element.type === ElementType.BLOCK) {
          this.textParticle.complete()
          this.blockParticle.render(ctx, pageNo, element, x, y + offsetY)
        } else {
          // 如果当前元素设置左偏移，则上一元素立即绘制
          if (element.left) {
            this.textParticle.complete()
          }
          const drawY =
            element.controlComponent === ControlComponent.POSTFIX &&
            element.control?.type === ControlType.NUMBER_FLAG
              ? y + offsetY - 1
              : y + offsetY
          this.textParticle.record(
            ctx,
            this.getSelectorTextValueElement(element),
            x,
            drawY
          )
          // 如果设置字宽、字间距、标点符号（避免浏览器排版缩小间距）需单独绘制
          if (
            element.width ||
            element.letterSpacing ||
            PUNCTUATION_REG.test(element.value)
          ) {
            this.textParticle.complete()
          }
        }
        // NUMBER_FLAG控件箭头绘制
        if (
          element.controlComponent === ControlComponent.POSTFIX &&
          element.control?.type === ControlType.NUMBER_FLAG &&
          this.controlRenderMode === ControlRenderMode.CONTROL
        ) {
          this.textParticle.complete()
          const control = element.control
          const { min, max } = control.numberExclusiveOptions || {}
          let controlValue = ''
          let prevIdx = j - 1
          while (prevIdx >= 0) {
            const prevElement = curRow.elementList[prevIdx]
            if (
              prevElement.controlId !== element.controlId ||
              prevElement.controlComponent === ControlComponent.PREFIX ||
              prevElement.controlComponent === ControlComponent.PRE_TEXT
            ) {
              break
            }
            if (prevElement.controlComponent === ControlComponent.VALUE) {
              controlValue = prevElement.value + controlValue
            }
            prevIdx--
          }
          const numericValue = parseFloat(controlValue)
          if (!isNaN(numericValue)) {
            const rowMargin = this.getElementRowMargin(element)
            const size = element.size || this.options.defaultSize
            const arrowHeight = curRow.height - 2 * rowMargin
            const arrowX = x + size * 0.2
            const arrowY = y + rowMargin + arrowHeight * 0.5
            this.numberFlagParticle.render({
              ctx,
              x: arrowX,
              y: arrowY,
              height: arrowHeight,
              value: numericValue,
              min,
              max,
              element
            })
          }
        }
        // CUSTOM_SELECT控件下拉箭头绘制
        if (
          element.controlComponent === ControlComponent.POSTFIX &&
          element.control?.type === ControlType.CUSTOM_SELECT &&
          this.controlRenderMode === ControlRenderMode.CONTROL
        ) {
          this.textParticle.complete()
          this.customSelectParticle.render({
            ctx,
            x,
            y,
            row: curRow,
            index: j
          })
        }
        // MULTI_CUSTOM_SELECT控件下拉箭头绘制
        if (
          element.controlComponent === ControlComponent.POSTFIX &&
          element.control?.type === ControlType.MULTI_CUSTOM_SELECT &&
          this.controlRenderMode === ControlRenderMode.CONTROL
        ) {
          this.textParticle.complete()
          this.multiCustomSelectParticle.render({
            ctx,
            x,
            y,
            row: curRow,
            index: j
          })
        }
        // 换行符绘制
        if (
          isDrawLineBreak &&
          !isPrintMode &&
          this.mode !== EditorMode.CLEAN &&
          !curRow.isWidthNotEnough &&
          j === curRow.elementList.length - 1
        ) {
          this.lineBreakParticle.render(ctx, element, x, y + curRow.height / 2)
        }
        // 空白符绘制
        if (isDrawWhiteSpace && WHITE_SPACE_REG.test(element.value)) {
          this.whiteSpaceParticle.render(ctx, element, x, y + curRow.height / 2)
        }
        // 边框绘制（目前仅支持控件）
        if (element.control?.border) {
          // 不同控件边框立刻绘制
          if (
            preElement?.control?.border &&
            preElement.controlId !== element.controlId
          ) {
            this.control.drawBorder(ctx)
          }
          // 当前元素位置信息记录
          const rowMargin = this.getElementRowMargin(element)
          this.control.recordBorderInfo(
            x,
            y + rowMargin,
            element.metrics.width,
            curRow.height - 2 * rowMargin
          )
        } else if (preElement?.control?.border) {
          this.control.drawBorder(ctx)
        }
        // 下划线记录
        // NUMBER_FLAG控件的值元素和占位符仅在属于分组(groupIds)时才显示下划线
        const isNumberFlagValue =
          element.controlComponent === ControlComponent.VALUE &&
          element.control?.type === ControlType.NUMBER_FLAG
        const isNumberFlagPlaceholder =
          element.controlComponent === ControlComponent.PLACEHOLDER &&
          element.control?.type === ControlType.NUMBER_FLAG
        const isGrouped = !!element.groupIds?.length
        if (
          element.underline ||
          element.control?.underline ||
          (isGrouped && (isNumberFlagValue || isNumberFlagPlaceholder))
        ) {
          // 下标元素下划线单独绘制
          if (
            preElement?.type === ElementType.SUBSCRIPT &&
            element.type !== ElementType.SUBSCRIPT
          ) {
            this.underline.render(ctx)
          }
          // 行间距
          const rowMargin = this.getElementRowMargin(element)
          // 元素向左偏移量
          const offsetX = element.left || 0
          // 下标元素y轴偏移值
          let offsetY = 0
          if (element.type === ElementType.SUBSCRIPT) {
            offsetY = this.subscriptParticle.getOffsetY(element)
          }
          // 检查是否是联动控件且正在被聚焦
          const associationId = element.control?.associationId
          const isAssociationFocused = associationId && this.control.isAssociationFocused(associationId)
          // 占位符不参与颜色计算
          let color: string | undefined
          // 联动状态优先级最高
          if (isAssociationFocused) {
            color = this.options.selector.associationBackgroundColor
          } else if (element.underlineColor) {
            // 元素自定义下划线颜色优先
            color = element.underlineColor
          } else if (element.control?.underline) {
            color = this.options.underlineColor
          } else {
            color = element.color
          }
          this.underline.recordFillInfo(
            ctx,
            x - offsetX,
            y + curRow.height - rowMargin + offsetY,
            metrics.width + offsetX,
            0,
            color,
            element.textDecoration?.style
          )
        } else if (preElement?.underline || preElement?.control?.underline) {
          this.underline.render(ctx)
        }
        // 删除线记录
        if (element.strikeout) {
          // 仅文本类元素支持删除线
          if (!element.type || TEXTLIKE_ELEMENT_TYPE.includes(element.type)) {
            // 字体大小不同时需立即绘制
            if (
              preElement &&
              ((preElement.type === ElementType.SUBSCRIPT &&
                element.type !== ElementType.SUBSCRIPT) ||
                (preElement.type === ElementType.SUPERSCRIPT &&
                  element.type !== ElementType.SUPERSCRIPT) ||
                this.getElementSize(preElement) !==
                  this.getElementSize(element))
            ) {
              this.strikeout.render(ctx)
            }
            // 基线文字测量信息
            const standardMetrics = this.textParticle.measureBasisWord(
              ctx,
              this.getElementFont(element)
            )
            // 文字渲染位置 + 基线文字下偏移量 - 一半文字高度
            let adjustY =
              y +
              offsetY +
              standardMetrics.actualBoundingBoxDescent * scale -
              metrics.height / 2
            // 上下标位置调整
            if (element.type === ElementType.SUBSCRIPT) {
              adjustY += this.subscriptParticle.getOffsetY(element)
            } else if (element.type === ElementType.SUPERSCRIPT) {
              adjustY += this.superscriptParticle.getOffsetY(element)
            }
            this.strikeout.recordFillInfo(ctx, x, adjustY, metrics.width)
          }
        } else if (preElement?.strikeout) {
          this.strikeout.render(ctx)
        }
        // 选区记录
        const {
          zone: currentZone,
          startIndex,
          endIndex
        } = this.range.getRange()
        if (startIndex !== endIndex) {
          // console.warn('[Draw._drawRow] 检测到选区绘制条件', {
          //   startIndex,
          //   endIndex,
          //   index,
          //   currentZone,
          //   zone
          // })
        }
        if (
          currentZone === zone &&
          startIndex !== endIndex &&
          startIndex <= index &&
          index <= endIndex
        ) {
          const positionContext = this.position.getPositionContext()
          // 表格需限定上下文
          if (
            (!positionContext.isTable && !element.tdId) ||
            positionContext.tdId === element.tdId
          ) {
            // 从行尾开始-绘制最小宽度
            if (startIndex === index) {
              const nextElement = elementList[startIndex + 1]
              if (nextElement && nextElement.value === ZERO) {
                rangeRecord.x = x + metrics.width
                rangeRecord.y = y
                rangeRecord.height = curRow.height
                rangeRecord.width += this.options.rangeMinWidth
              }
            } else {
              let rangeWidth = metrics.width
              // 最小选区宽度
              if (rangeWidth === 0 && curRow.elementList.length === 1) {
                rangeWidth = this.options.rangeMinWidth
              }
              // 记录第一次位置、行高
              if (!rangeRecord.width) {
                rangeRecord.x = x
                rangeRecord.y = y
                rangeRecord.height = curRow.height
              }
              rangeRecord.width += rangeWidth
            }
          }
        }
        // 组信息记录
        if (!group.disabled && element.groupIds) {
          this.group.recordFillInfo(element, x, y, metrics.width, curRow.height)
        }
        index++
        // 绘制表格内元素
        if (element.type === ElementType.TABLE && !element.hide) {
          const tdPaddingWidth = tdPadding[1] + tdPadding[3]
          for (let t = 0; t < element.trList!.length; t++) {
            const tr = element.trList![t]
            for (let d = 0; d < tr.tdList!.length; d++) {
              const td = tr.tdList[d]
              this.drawRow(ctx, {
                elementList: td.value,
                positionList: td.positionList!,
                rowList: td.rowList!,
                pageNo,
                startIndex: 0,
                innerWidth: (td.width! - tdPaddingWidth) * scale,
                zone,
                isDrawLineBreak
              })
            }
          }
        }
      }
      // 绘制列表样式
      if (curRow.isList) {
        this.listParticle.drawListStyle(
          ctx,
          curRow,
          positionList[curRow.startIndex]
        )
      }
      // 绘制文字、边框、下划线、删除线
      this.textParticle.complete()
      this.control.drawBorder(ctx)
      this.underline.render(ctx)
      this.strikeout.render(ctx)
      // 绘制批注样式
      this.group.render(ctx)
      // 绘制选区
      if (!isPrintMode && !isGraffitiMode) {
        if (rangeRecord.width && rangeRecord.height) {
          const { x, y, width, height } = rangeRecord
          this.range.render(ctx, x, y, width, height)
        }
        if (
          isCrossRowCol &&
          tableRangeElement &&
          tableRangeElement.id === tableId
        ) {
          const {
            coordinate: {
              leftTop: [x, y]
            }
          } = positionList[curRow.startIndex]
          this.tableParticle.drawRange(ctx, tableRangeElement, x, y)
        }
      }
    }
  }

  private _drawFloat(
    ctx: CanvasRenderingContext2D,
    payload: IDrawFloatPayload
  ) {
    const { scale } = this.options
    const floatPositionList = this.position.getFloatPositionList()
    const { imgDisplays, pageNo } = payload
    for (let e = 0; e < floatPositionList.length; e++) {
      const floatPosition = floatPositionList[e]
      const element = floatPosition.element
      if (
        (pageNo === floatPosition.pageNo ||
          floatPosition.zone === EditorZone.HEADER ||
          floatPosition.zone == EditorZone.FOOTER) &&
        element.imgDisplay &&
        imgDisplays.includes(element.imgDisplay) &&
        element.type === ElementType.IMAGE
      ) {
        const imgFloatPosition = element.imgFloatPosition!
        this.imageParticle.render(
          ctx,
          element,
          imgFloatPosition.x * scale,
          imgFloatPosition.y * scale
        )
      }
    }
  }

  private _clearPage(pageNo: number) {
    const ctx = this.ctxList[pageNo]
    const pageDom = this.pageList[pageNo]
    ctx.clearRect(
      0,
      0,
      Math.max(pageDom.width, this.getWidth()),
      Math.max(pageDom.height, this.getHeight())
    )
    this.blockParticle.clear()
  }

  private _drawPage(payload: IDrawPagePayload) {
    const { elementList, positionList, rowList, pageNo } = payload
    const {
      inactiveAlpha,
      pageMode,
      header,
      footer,
      pageNumber,
      lineNumber,
      pageBorder
    } = this.options
    const isPrintMode = this.mode === EditorMode.PRINT
    const isContinuityMode = pageMode === PageMode.CONTINUITY
    const innerWidth = this.getInnerWidth()
    const ctx = this.ctxList[pageNo]
    // 判断当前激活区域-非正文区域时元素透明度降低
    ctx.globalAlpha = !this.zone.isMainActive() ? inactiveAlpha : 1
    this._clearPage(pageNo)
    // 绘制背景
    if (
      !isPrintMode ||
      !this.options.modeRule[EditorMode.PRINT]?.backgroundDisabled
    ) {
      this.background.render(ctx, pageNo)
    }
    // 绘制区域
    if (!isPrintMode) {
      this.area.render(ctx, pageNo)
    }
    // 绘制水印（底层）
    if (
      !isContinuityMode &&
      this.options.watermark.data &&
      this.options.watermark.layer === WatermarkLayer.BOTTOM
    ) {
      this.waterMark.render(ctx, pageNo)
    }
    // 绘制页边距
    if (!isPrintMode) {
      this.margin.render(ctx, pageNo)
    }
    // 渲染衬于文字下方元素
    this._drawFloat(ctx, {
      pageNo,
      imgDisplays: [ImageDisplay.FLOAT_BOTTOM]
    })
    // 控件高亮
    if (!isPrintMode) {
      this.control.renderHighlightList(ctx, pageNo)
    }
    // 渲染元素
    const index = rowList[0]?.startIndex
    this.drawRow(ctx, {
      elementList,
      positionList,
      rowList,
      pageNo,
      startIndex: index,
      innerWidth,
      zone: EditorZone.MAIN
    })
    if (this.getIsPagingMode()) {
      // 绘制页眉
      if (!header.disabled) {
        this.header.render(ctx, pageNo)
      }
      // 绘制页码
      if (!pageNumber.disabled) {
        this.pageNumber.render(ctx, pageNo)
      }
      // 绘制页脚
      if (!footer.disabled) {
        this.footer.render(ctx, pageNo)
      }
    }
    // 渲染浮于文字上方元素
    this._drawFloat(ctx, {
      pageNo,
      imgDisplays: [ImageDisplay.FLOAT_TOP, ImageDisplay.SURROUND]
    })
    // 搜索匹配绘制
    if (!isPrintMode && this.search.getSearchKeyword()) {
      this.search.render(ctx, pageNo)
    }
    // 绘制空白占位符
    if (this.elementList.length <= 1 && !this.elementList[0]?.listId) {
      this.placeholder.render(ctx)
    }
    // 渲染行数
    if (!lineNumber.disabled) {
      this.lineNumber.render(ctx, pageNo)
    }
    // 绘制页面边框
    if (!pageBorder.disabled) {
      this.pageBorder.render(ctx)
    }
    // 绘制签章
    this.badge.render(ctx, pageNo)
    // 绘制涂鸦
    if (this.isGraffitiMode()) {
      this.graffiti.render(ctx, pageNo)
    }
    // 绘制水印（顶层）
    if (
      !isContinuityMode &&
      this.options.watermark.data &&
      this.options.watermark.layer === WatermarkLayer.TOP
    ) {
      this.waterMark.render(ctx, pageNo)
    }
  }

  private _disconnectLazyRender() {
    this.lazyRenderIntersectionObserver?.disconnect()
  }

  private _lazyRender() {
    const positionList = this.position.getOriginalMainPositionList()
    const elementList = this.getOriginalMainElementList()
    this._disconnectLazyRender()
    this.lazyRenderIntersectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const index = Number((<HTMLCanvasElement>entry.target).dataset.index)
          this._drawPage({
            elementList,
            positionList,
            rowList: this.pageRowList[index],
            pageNo: index
          })
        }
      })
    })
    this.pageList.forEach(el => {
      this.lazyRenderIntersectionObserver!.observe(el)
    })
  }

  private _immediateRender() {
    const positionList = this.position.getOriginalMainPositionList()
    const elementList = this.getOriginalMainElementList()
    for (let i = 0; i < this.pageRowList.length; i++) {
      this._drawPage({
        elementList,
        positionList,
        rowList: this.pageRowList[i],
        pageNo: i
      })
    }
  }

  public render(payload?: IDrawOption) {
    this.renderCount++
    // 同步已存在 canvas 元素的 CSS 背景色，使其在页面间隙/边缘处
    // 与 options.background.color 保持一致（运行时切换 background 也生效）
    const cssBgColor = this.options.background.color
    for (const canvas of this.pageList) {
      if (canvas.style.backgroundColor !== cssBgColor) {
        canvas.style.backgroundColor = cssBgColor
      }
    }
    const { header, footer } = this.options
    const {
      isSubmitHistory = true,
      isSetCursor = true,
      isCompute = true,
      isLazy = true,
      isInit = false,
      isSourceHistory = false,
      isFirstRender = false,
      isSkipFocus = false,
      isMoveCursorToVisible,
      direction
    } = payload || {}
    let { curIndex } = payload || {}
    const innerWidth = this.getInnerWidth()
    const isPagingMode = this.getIsPagingMode()
    // 缓存当前页数信息
    const oldPageSize = this.pageRowList.length
    // 计算文档信息
    if (isCompute) {
      // 清空浮动元素位置信息
      this.position.setFloatPositionList([])
      if (isPagingMode) {
        // 页眉信息
        if (!header.disabled) {
          this.header.compute()
        }
        // 页脚信息
        if (!footer.disabled) {
          this.footer.compute()
        }
      }
      // 行信息
      const margins = this.getMargins()
      const pageHeight = this.getHeight()
      const extraHeight = this.header.getExtraHeight()
      const mainOuterHeight = this.getMainOuterHeight()
      const startX = margins[3]
      const startY = margins[0] + extraHeight
      const surroundElementList = pickSurroundElementList(this.elementList)
      this.rowList = this.computeRowList({
        startX,
        startY,
        pageHeight,
        mainOuterHeight,
        isPagingMode,
        innerWidth,
        surroundElementList,
        elementList: this.elementList
      })
      // 页面信息
      this.pageRowList = this._computePageList()
      // [DEBUG history] 段落折行诊断：统计每页行数、最长行元素数/宽度，判断是否单行不折行
      {
        const _paperW = this.getInnerWidth()
        let _totalRows = 0
        let _maxRowElems = 0
        let _maxRowWidth = 0
        let _maxRowPage = -1
        let _overWidthRows = 0
        const _rowCountByPage: number[] = []
        this.pageRowList.forEach((rows, pi) => {
          _totalRows += rows.length
          _rowCountByPage[pi] = rows.length
          rows.forEach(r => {
            const w = r.width || 0
            if (r.elementList.length > _maxRowElems) {
              _maxRowElems = r.elementList.length
              _maxRowWidth = w
              _maxRowPage = pi
            }
            if (w > _paperW) _overWidthRows++
          })
        })
        // 单行不折行特征：超宽行>0，或整文档只有1行（总行数===1 且 总元素多）
        const _singleLineAnomaly = _overWidthRows > 0 ||
          (_totalRows === 1 && this.elementList.length > 5)
        console.log('[DEBUG history] 渲染后 pageRowList 来源=',
          (isSourceHistory ? '历史恢复' : '正常编辑'),
          'renderCount=', (this.renderCount || 0), '纸宽=', _paperW.toFixed(0),
          '页数=', this.pageRowList.length, '每页行数=', JSON.stringify(_rowCountByPage),
          '总行数=', _totalRows, '最长行元素数=', _maxRowElems,
          '最长行宽度=', _maxRowWidth.toFixed(0), '最长行所在页=', _maxRowPage,
          '超宽行数=', _overWidthRows, 'elementList长度=', this.elementList.length,
          (_singleLineAnomaly ? ' <<< 疑似单行不折行异常' : ''))
      }
      // 位置信息
      this.position.computePositionList()
      // 区域信息
      this.area.compute()
      if (!this.isPrintMode()) {
        // 搜索信息
        const searchKeyword = this.search.getSearchKeyword()
        if (searchKeyword) {
          this.search.compute(searchKeyword)
        }
        // 控件关键词高亮
        this.control.computeHighlightList()
      }
      // 涂鸦信息
      if (this.isGraffitiMode()) {
        this.graffiti.compute()
      }
    }
    // 清除光标等副作用
    this.imageObserver.clearAll()
    // 记录渲染前光标状态（isSetCursor 为 false 时用于恢复）
    const hadCursorBefore = !!this.position.getCursorPosition()
    this.cursor.recoveryCursor()
    // 创建纸张
    for (let i = 0; i < this.pageRowList.length; i++) {
      if (!this.pageList[i]) {
        this._createPage(i)
      }
    }
    // 移除多余页
    const curPageCount = this.pageRowList.length
    const prePageCount = this.pageList.length
    if (prePageCount > curPageCount) {
      const deleteCount = prePageCount - curPageCount
      this.ctxList.splice(curPageCount, deleteCount)
      this.pageList
        .splice(curPageCount, deleteCount)
        .forEach(page => page.remove())
    }
    // 绘制元素
    // 连续页因为有高度的变化会导致canvas渲染空白，需立即渲染，否则会出现闪动
    if (isLazy && isPagingMode) {
      this._lazyRender()
    } else {
      this._immediateRender()
    }
    // 光标重绘
    if (isSetCursor) {
      curIndex = this.setCursor(curIndex, { isMoveCursorToVisible, direction })
    } else if (isSkipFocus) {
      // 仅 changeGroupStyle 等场景使用：isSetCursor 为 false 且不聚焦光标，
      // 避免重新聚焦导致输入法重建、滚动条乱跳
      this.cursor.drawCursor({ isFocus: false })
    } else if (this.range.getIsSelection()) {
      // 存在选区时仅定位避免事件无法捕获
      this.cursor.focus()
    } else if (hadCursorBefore) {
      // isSetCursor 为 false 时，若渲染前光标可见则恢复显示（避免意外隐藏光标）
      const { startIndex, endIndex } = this.range.getRange()
      const positionList = this.position.getPositionList()
      const cursorIndex = startIndex === endIndex ? startIndex : endIndex
      if (~cursorIndex && positionList[cursorIndex]) {
        this.position.setCursorPosition(positionList[cursorIndex])
        this.cursor.drawCursor()
      }
    }
    // 历史记录用于undo、redo（非首次渲染内容变更 || 第一次存在光标时）
    if (
      (isSubmitHistory && !isFirstRender) ||
      (curIndex !== undefined && this.historyManager.isStackEmpty())
    ) {
      this.submitHistory(curIndex)
    }
    // 信息变动回调
    nextTick(() => {
      // 选区样式
      this.range.setRangeStyle()
      // 重新唤起弹窗类控件
      if (isCompute && this.control.getActiveControl()) {
        this.control.reAwakeControl()
      }
      // 表格工具重新渲染
      if (
        isCompute &&
        !this.isReadonly() &&
        this.position.getPositionContext().isTable
      ) {
        this.tableTool.render()
      }
      // 页眉指示器重新渲染
      if (isCompute && !this.zone.isMainActive()) {
        this.zone.drawZoneIndicator()
      }
      // 页数改变
      if (oldPageSize !== this.pageRowList.length) {
        if (this.listener.pageSizeChange) {
          this.listener.pageSizeChange(this.pageRowList.length)
        }
        if (this.eventBus.isSubscribe('pageSizeChange')) {
          this.eventBus.emit('pageSizeChange', this.pageRowList.length)
        }
      }
      // 文档内容改变
      if ((isSubmitHistory || isSourceHistory) && !isInit) {
        // 反馈内容变更前，清除未分组元素的下划线与高亮样式
        const cleared = this.clearUnGroupedStyle(this.getElementList())
        // 仅有实际的清除发生时才重绘，保证画面与数据一致
        if (cleared) {
          this.render({
            isSubmitHistory: false,
            isSourceHistory: false,
            isLazy: false
          })
        }
        if (this.listener.contentChange) {
          this.listener.contentChange()
        }
        if (this.eventBus.isSubscribe('contentChange')) {
          this.eventBus.emit('contentChange')
        }
      }
    })
  }

  // 递归清除未分组元素的下划线与高亮样式（保留 groupIds 元素的质检样式）
  // 返回是否实际发生了清除
  private clearUnGroupedStyle(elementList: IElement[]): boolean {
    let cleared = false
    for (const element of elementList) {
      if (!element.groupIds?.length) {
        if (
          element.underline !== undefined ||
          element.underlineColor !== undefined ||
          element.highlight !== undefined ||
          (element.control && element.control.underline !== undefined)
        ) {
          cleared = true
        }
        element.underline = undefined
        element.underlineColor = undefined
        element.highlight = undefined
        // 控件自身下划线（随元素）
        if (element.control) {
          element.control.underline = undefined
        }
      }
      if (element.valueList?.length) {
        if (this.clearUnGroupedStyle(element.valueList)) {
          cleared = true
        }
      }
      const control = element.control
      if (control) {
        if (Array.isArray(control.value)) {
          if (this.clearUnGroupedStyle(control.value)) {
            cleared = true
          }
        }
        if (control.structValues?.length) {
          if (this.clearUnGroupedStyle(control.structValues)) {
            cleared = true
          }
        }
        if (control.values?.length) {
          control.values.forEach(v => {
            if (v.structValues?.length) {
              if (this.clearUnGroupedStyle(v.structValues)) {
                cleared = true
              }
            }
          })
        }
      }
    }
    return cleared
  }

  public setCursor(
    curIndex: number | undefined,
    payload?: { isMoveCursorToVisible?: boolean; direction?: MoveDirection }
  ) {
    const positionContext = this.position.getPositionContext()
    const positionList = this.position.getPositionList()

    if (positionContext.isTable) {
      const { index, trIndex, tdIndex } = positionContext
      const elementList = this.getOriginalElementList()
      const tablePositionList =
        elementList[index!].trList?.[trIndex!].tdList[tdIndex!].positionList
      if (curIndex === undefined && tablePositionList) {
        curIndex = tablePositionList.length - 1
      }
      const tablePosition = tablePositionList?.[curIndex!]
      this.position.setCursorPosition(tablePosition || null)
    } else {
      this.position.setCursorPosition(
        curIndex !== undefined ? positionList[curIndex] : null
      )
    }
    // 定位到图片元素并且位置发生变化
    let isShowCursor = true
    if (
      curIndex !== undefined &&
      positionContext.isImage &&
      positionContext.isDirectHit
    ) {
      const elementList = this.getElementList()
      const element = elementList[curIndex]
      if (IMAGE_ELEMENT_TYPE.includes(element.type!)) {
        isShowCursor = false
        const position = this.position.getCursorPosition()
        this.previewer.updateResizer(element, position)
      }
    }
    this.cursor.drawCursor({
      isShow: isShowCursor,
      isMoveCursorToVisible: payload?.isMoveCursorToVisible,
      direction: payload?.direction
    })
    return curIndex
  }

  public submitHistory(curIndex: number | undefined) {
    const positionContext = this.position.getPositionContext()
    const oldElementList = getSlimCloneElementList(this.elementList)
    const _mainCount = this.elementList.length
    const _breakCount = this.elementList.filter(e => e.value === '\n').length
    const _controlCount = this.elementList.filter(e => e.control).length
    console.log('[DEBUG history] submitHistory curIndex=', curIndex,
      '栈长度=', this.historyManager.getUndoStack().length,
      'main元素数=', _mainCount, '换行数=', _breakCount, '控件数=', _controlCount)
    const oldHeaderElementList = getSlimCloneElementList(
      this.header.getElementList()
    )
    const oldFooterElementList = getSlimCloneElementList(
      this.footer.getElementList()
    )
    const oldRange = deepClone(this.range.getRange())
    const pageNo = this.pageNo
    const oldPositionContext = deepClone(positionContext)
    const zone = this.zone.getZone()
    const oldControlRenderMode = this.controlRenderMode
    const fn = () => {
      this.zone.setZone(zone)
      this.setPageNo(pageNo)
      // 模式变化时触发回调，确保撤销/重做时外部UI同步
      if (this.controlRenderMode !== oldControlRenderMode) {
        this.controlRenderMode = oldControlRenderMode
        this.listener.controlRenderModeChange?.(oldControlRenderMode)
      }
      this.position.setPositionContext(deepClone(oldPositionContext))
      this.header.setElementList(deepClone(oldHeaderElementList))
      this.footer.setElementList(deepClone(oldFooterElementList))
      this.elementList = deepClone(oldElementList)
      this.range.replaceRange(deepClone(oldRange))
      this.render({
        curIndex,
        isSubmitHistory: false,
        isSourceHistory: true
      })
    }
    ;(fn as any).__historySource = 'submitHistory'
    this.historyManager.execute(fn)
  }

  public destroy() {
    this.container.remove()
    this.globalEvent.removeEvent()
    this.scrollObserver.removeEvent()
    this.selectionObserver.removeEvent()
    this.workerManager.destroy()
    this.magnifier.destroy()
    this.lazyRenderIntersectionObserver?.disconnect()
    AssociationStateManager.getInstance().unregisterEditor(this)
  }

  public clearSideEffect() {
    // 预览工具组件
    this.getPreviewer().clearResizer()
    // 表格工具组件
    this.getTableTool().dispose()
    // 超链接弹窗
    this.getHyperlinkParticle().clearHyperlinkPopup()
    // 日期控件
    this.getDateParticle().clearDatePicker()
  }
}
