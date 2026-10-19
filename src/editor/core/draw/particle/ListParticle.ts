import { ZERO } from '../../../dataset/constant/Common'
import { ulStyleMapping } from '../../../dataset/constant/List'
import { ElementType } from '../../../dataset/enum/Element'
import { KeyMap } from '../../../dataset/enum/KeyMap'
import { ListStyle, ListType, UlStyle } from '../../../dataset/enum/List'
import { DeepRequired } from '../../../interface/Common'
import { IEditorOption } from '../../../interface/Editor'
import { IElement, IElementPosition } from '../../../interface/Element'
import { IRow, IRowElement } from '../../../interface/Row'
import { getUUID } from '../../../utils'
import { RangeManager } from '../../range/RangeManager'
import { Draw } from '../Draw'

export class ListParticle {
  private draw: Draw
  private range: RangeManager
  private options: DeepRequired<IEditorOption>

  // 非递增样式直接返回默认值
  private readonly UN_COUNT_STYLE_WIDTH = 20
  private readonly MEASURE_BASE_TEXT = '0'
  private readonly LIST_GAP = 10
  // 列表 id → 基准样式元素 缓存，供序号统一渲染颜色/字号。
  // 以 listId 为 key 覆盖写入，主区域与表格单元格的列表互不干扰。
  private listStyleElementMap: Map<string, IElement> = new Map()

  constructor(draw: Draw) {
    this.draw = draw
    this.range = draw.getRange()
    this.options = draw.getOptions()
  }

  // 有序列表项末尾补全的标点符号，默认 '。'，可由 options.list.trailingPeriod 配置
  private get trailingPeriod(): string {
    return this.options.list?.trailingPeriod || '。'
  }

  public setList(listType: ListType | null, listStyle?: ListStyle) {
    const isReadonly = this.draw.isReadonly()
    if (isReadonly) return
    const { startIndex, endIndex } = this.range.getRange()
    if (!~startIndex && !~endIndex) return
    // 需要改变的元素列表
    const changeElementList = this.range.getRangeParagraphElementList()
    if (!changeElementList || !changeElementList.length) return
    // 如果包含列表则设置为取消列表
    const isUnsetList = changeElementList.find(
      el => el.listType === listType && el.listStyle === listStyle
    )
    if (isUnsetList || !listType) {
      this.unsetList()
      return
    }
    // 有序列表：去除行首手动编号前缀（如 "1、"、"2."），避免与自动序号重复显示
    if (listType === ListType.OL) {
      console.log('[ListParticle.setList] 进入 OL 分支', {
        listType,
        changeLen: changeElementList.length
      })
      this.stripLeadingManualNumber(changeElementList)
    }
    // 设置值（赋予 listId / listType / listStyle）
    const listId = getUUID()
    changeElementList.forEach(el => {
      el.listId = listId
      el.listType = listType
      el.listStyle = listStyle
    })
    // 有序列表：在赋予 listId 之后，为每个列表项内容末尾补中文句号“。”。
    // 必须放在 listId 赋值之后：否则插入的独立句号元素无法继承 listId，
    // 会被 Draw 行排版判定为“listId 变化”（preElement.listId !== element.listId）
    // 而强制换行，导致句号独占一行/产生多余空行。
    if (listType === ListType.OL) {
      this.ensureTrailingPeriod(changeElementList)
    }
    // 光标定位
    const isSetCursor = startIndex === endIndex
    const curIndex = isSetCursor ? endIndex : startIndex
    this.draw.render({ curIndex, isSetCursor })
  }

  // 去除有序列表项行首的手动编号前缀（如 "1、"、"2."、"3）"），
  // 仅删除文本字符、不改动 ZERO 换行标记，因此不会产生空行。
  // 跨连续文本元素拼接行首文本以匹配被拆分的编号（例如 "1" 与 "、" 分属不同元素）。
  private stripLeadingManualNumber(changeElementList: IElement[]): void {
    const removeList: IElement[] = []
    let atLineStart = true
    for (let i = 0; i < changeElementList.length; i++) {
      const el = changeElementList[i]
      if (!el) continue
      // 行分隔：ZERO / \r / \n 均视为新行起点
      if (el.value === ZERO || el.value === '\n' || el.value === '\r') {
        atLineStart = true
        continue
      }
      // 控件：行首时清理其字符串值里的手动编号
      if (el.type === ElementType.CONTROL && el.control) {
        if (atLineStart) {
          const cv = (el.control as any).value
          if (typeof cv === 'string') {
            const nv = this.stripLeadingManualNumberInText(cv)
            if (nv !== cv) (el.control as any).value = nv
          }
        }
        atLineStart = false
        continue
      }
      // 非文本元素
      if (el.type && el.type !== ElementType.TEXT) {
        atLineStart = typeof el.value === 'string' && /[\n\r]/.test(el.value)
        continue
      }
      // 文本元素：仅在行首、非空时处理
      if (!atLineStart || typeof el.value !== 'string' || el.value === '') continue
      // 跨连续文本元素拼接行首文本，确定需删除的字符数
      let text = ''
      const lineEls: IElement[] = []
      for (let j = i; j < changeElementList.length; j++) {
        const je = changeElementList[j]
        if (!je) break
        if (je.type === ElementType.CONTROL) break
        if (je.type && je.type !== ElementType.TEXT) break
        if (typeof je.value !== 'string') break
        if (je.value === ZERO || je.value === '\n' || je.value === '\r') break
        if (je.value === '') continue
        text += je.value
        lineEls.push(je)
        if (text.length > 40) break
      }
      const removeLen = this.leadingManualNumberLength(text)
      if (removeLen > 0) {
        let remain = removeLen
        for (const le of lineEls) {
          if (remain <= 0) break
          if (le.value.length <= remain) {
            removeList.push(le)
            remain -= le.value.length
          } else {
            le.value = le.value.slice(remain)
            remain = 0
          }
        }
      }
      atLineStart = false
    }
    // 从主元素列表移除被标记的元素（基于引用，规避索引偏移）
    if (removeList.length) {
      const mainElementList = this.draw.getElementList()
      for (const el of removeList) {
        const idx = mainElementList.indexOf(el)
        if (~idx) mainElementList.splice(idx, 1)
      }
    }
  }

  // 匹配行首 "数字 + 分隔符"（允许前导空格/零宽字符），返回需删除的字符长度
  private leadingManualNumberLength(text: string): number {
    const m = text.match(
      /^[ \t]*[\u200B-\u200F\uFEFF\u00AD\u2060\u202A-\u202E]*\d+[\u200B-\u200F\uFEFF\u00AD\u2060\u202A-\u202E]*[.\uFF0E\u3001\uFF0C:：)）]/
    )
    return m ? m[0].length : 0
  }

  private stripLeadingManualNumberInText(value: string): string {
    const len = this.leadingManualNumberLength(value)
    return len > 0 ? value.slice(len) : value
  }

  // 规范化编号内容末尾为“。”：
  // - 末尾已是“。”→ 不动（already）
  // - 末尾是中英文文字（汉字/字母）→ 需插入独立句号元素（appended，needInsert=true），
  //   不拼接以免变成“多字符元素”导致句号无法单独删除
  // - 末尾是其他符号（非中英文文字）→ 替换为“。”（replaced，单字符元素，可单独删除）
  // - 末尾为空（无文本/无符号）→ 设为单字符“。”（appended-empty，可单独删除）
  // 中英文文字 = 汉字 + 英文字母；其余（数字、标点、空格、其他语种字符等）均视为“符号”
  private _normalizeTrailingPeriod(el: IElement): {
    action: string
    needInsert: boolean
  } {
    const PERIOD = this.trailingPeriod
    const v = el.value
    if (typeof v !== 'string' || v.length === 0) {
      // 末尾为空文本元素：直接设为单字符句号（可单独删除）
      el.value = PERIOD
      return { action: 'appended-empty', needInsert: false }
    }
    const lastChar = v[v.length - 1]
    if (lastChar === PERIOD) return { action: 'already', needInsert: false }
    if (/[a-zA-Z\u3400-\u9FFF\uF900-\uFAFF]/.test(lastChar)) {
      // 末尾是中英文文字：保留原值，改为插入独立的句号元素，保证句号可单独删除
      return { action: 'appended', needInsert: true }
    }
    // 末尾是其他符号：直接替换为句号（单字符元素 → 单字符元素，可单独删除）
    el.value = v.slice(0, -1) + PERIOD
    return { action: 'replaced', needInsert: false }
  }

  // 在末尾文本元素之后插入一个独立的中文句号元素（复制列表属性），
  // 使其作为独立字符可被单独删除，同时归属于同一列表项
  private _insertPeriodAfter(el: IElement): void {
    const mainList = this.draw.getOriginalMainElementList()
    const idx = mainList.indexOf(el)
    if (!~idx) return
    const periodEl: IElement = { value: this.trailingPeriod }
    if (el.listId) periodEl.listId = el.listId
    if (el.listType) periodEl.listType = el.listType
    if (el.listStyle) periodEl.listStyle = el.listStyle
    mainList.splice(idx + 1, 0, periodEl)
  }

  // 为每个有序列表项（以 ZERO 换行分隔的段落）内容末尾补中文句号“。”：
  // 若段落最后一个文本元素不以“。”结尾，则在其后追加。控件/图片等非文本结尾不补。
  private ensureTrailingPeriod(changeElementList: IElement[]): void {
    let lastTextEl: IElement | null = null
    let listItemCount = 0
    let appendedCount = 0
    const pendingInserts: IElement[] = []
    const flush = () => {
      if (lastTextEl) {
        const v = lastTextEl.value
        console.log('[ListParticle.ensureTrailingPeriod] 段落末尾', {
          valueTail: typeof v === 'string' ? v.slice(-8) : v,
          lastChar: typeof v === 'string' && v.length ? v[v.length - 1] : 'n/a'
        })
        const { action, needInsert } = this._normalizeTrailingPeriod(lastTextEl)
        console.log('[ListParticle.ensureTrailingPeriod] 处理', { action, needInsert })
        if (needInsert) pendingInserts.push(lastTextEl)
        if (action !== 'already') appendedCount++
        listItemCount++
      }
      lastTextEl = null
    }
    for (let i = 0; i < changeElementList.length; i++) {
      const el = changeElementList[i]
      if (!el) continue
      // 段落结束（换行标记）：在换行前的最后一个文本元素上补句号
      if (el.value === ZERO || el.value === '\n' || el.value === '\r') {
        flush()
        continue
      }
      // canvas-editor 普通文本元素 type 为 undefined；控件/图片等特殊元素才有 type。
      // 故“是文本”判定为 type 不存在或等于 TEXT，否则视为非文本结尾（不补句号）
      if (el.type === undefined || el.type === ElementType.TEXT) {
        // 记录连续文本中的最后一个文本元素（即段落末尾文本）
        lastTextEl = el
      } else {
        // 非文本元素（控件/图片等）结尾时，不补句号
        lastTextEl = null
      }
    }
    // 处理最后一个段落（末尾无换行标记）
    flush()
    // 延迟插入独立句号元素（避免遍历中改动主列表导致索引错位），保证句号可单独删除
    for (const el of pendingInserts) this._insertPeriodAfter(el)
    console.log('[ListParticle.ensureTrailingPeriod] done', {
      listItemCount,
      appendedCount
    })
  }

  // 遍历整个元素列表，仅为有序列表（listType === OL）的每个列表项
  // （以 ZERO 换行分隔的段落）内容末尾补中文句号“。”。
  // 非列表内容、已以“。”结尾的段落、或以控件/图片等非文本结尾的段落不补。
  public ensureListTrailingPeriod(elementList: IElement[]): void {
    const olTotal = elementList.filter(el => el && el.listType === ListType.OL).length
    console.log('[ListParticle.ensureListTrailingPeriod] start', {
      total: elementList.length,
      olElems: olTotal,
      sampleListTypes: [...new Set(elementList.filter(Boolean).map(e => e.listType))].slice(0, 20)
    })
    let inList = false
    let lastTextEl: IElement | null = null
    let listItemCount = 0
    let appendedCount = 0
    const pendingInserts: IElement[] = []
    const flush = () => {
      if (inList && lastTextEl) {
        const v = lastTextEl.value
        console.log('[ListParticle.ensureListTrailingPeriod] 列表项段落末尾', {
          valueTail: typeof v === 'string' ? v.slice(-8) : v,
          lastChar: typeof v === 'string' && v.length ? v[v.length - 1] : 'n/a'
        })
        const { action, needInsert } = this._normalizeTrailingPeriod(lastTextEl)
        console.log('[ListParticle.ensureListTrailingPeriod] 处理', { action, needInsert })
        if (needInsert) pendingInserts.push(lastTextEl)
        if (action !== 'already') appendedCount++
        listItemCount++
      }
      lastTextEl = null
    }
    for (let i = 0; i < elementList.length; i++) {
      const el = elementList[i]
      if (!el) continue
      // 段落结束（换行标记）：当前列表项段落结束，补句号并退出列表态
      if (el.value === ZERO || el.value === '\n' || el.value === '\r') {
        flush()
        inList = false
        continue
      }
      // 仅处理有序列表项
      if (el.listType !== ListType.OL) {
        flush()
        inList = false
        continue
      }
      inList = true
      // canvas-editor 普通文本元素 type 为 undefined；控件/图片等特殊元素才有 type。
      // 故“是文本”判定为 type 不存在或等于 TEXT，否则视为非文本结尾（不补句号）
      if (el.type === undefined || el.type === ElementType.TEXT) {
        lastTextEl = el
      } else {
        // 非文本元素（控件/图片等）结尾时不补句号
        lastTextEl = null
      }
    }
    // 处理最后一个段落（末尾无换行标记）
    flush()
    // 延迟插入独立句号元素（避免遍历主列表时改动索引导致错位），保证句号可单独删除
    for (const el of pendingInserts) this._insertPeriodAfter(el)
    console.log('[ListParticle.ensureListTrailingPeriod] done', {
      listItemCount,
      appendedCount
    })
  }

  public unsetList() {
    const isReadonly = this.draw.isReadonly()
    if (isReadonly) return
    const { startIndex, endIndex } = this.range.getRange()
    if (!~startIndex && !~endIndex) return
    // 需要改变的元素列表
    const changeElementList = this.range
      .getRangeParagraphElementList()
      ?.filter(el => el.listId)
    if (!changeElementList || !changeElementList.length) return
    // 如果列表最后字符不是换行符则需插入换行符
    const elementList = this.draw.getElementList()
    const endElement = elementList[endIndex]
    if (endElement.listId) {
      let start = endIndex + 1
      while (start < elementList.length) {
        const element = elementList[start]
        if (element.value === ZERO && !element.listWrap) break
        if (element.listId !== endElement.listId) {
          this.draw.spliceElementList(elementList, start, 0, [
            {
              value: ZERO
            }
          ])
          break
        }
        start++
      }
    }
    // 取消设置
    changeElementList.forEach(el => {
      delete el.listId
      delete el.listType
      delete el.listStyle
      delete el.listWrap
    })
    // 光标定位
    const isSetCursor = startIndex === endIndex
    const curIndex = isSetCursor ? endIndex : startIndex
    this.draw.render({ curIndex, isSetCursor })
  }

  // 判断被删除的元素是否处于「列表末项 → 非同列表内容」的边界。
  // deleteIndex 为本次将被删除的元素下标（del 向前删为光标后一个；backspace 退格为光标前一个）。
  // 满足：前一个元素属于某列表，且当前元素不属于同一列表（含无 listId 的退出段落、其他列表）。
  public isListMergeBoundary(
    elementList: IElement[],
    deleteIndex: number
  ): boolean {
    const prev = elementList[deleteIndex - 1]
    const el = elementList[deleteIndex]
    return !!(prev?.listId && el && el.listId !== prev.listId)
  }

  // 把列表末项之后的「非同列表内容」并入当前列表，使其继续编号。
  // 用于：列表退出后产生的空段落、其后的文本/控件/独立列表，在删除边界分隔符时重新归队。
  // boundaryIndex 为待合并内容的起始下标（通常为那个不带 listId 的分隔 ZERO）。
  public mergeFollowingIntoList(boundaryIndex: number): void {
    const elementList = this.draw.getElementList()
    const prev = elementList[boundaryIndex - 1]
    if (!prev?.listId) return
    const { listId, listType, listStyle } = prev
    // 若边界元素不是 ZERO 段落标记（如控件、独立列表直接紧跟列表），
    // 则在其前插入一个列表项标记，确保后续内容作为列表项被编号
    let start = boundaryIndex
    if (elementList[start]?.value !== ZERO) {
      elementList.splice(start, 0, {
        value: ZERO,
        listId,
        listType,
        listStyle
      })
      start += 1
    }
    let i = start
    while (i < elementList.length) {
      const el = elementList[i]
      // 遇到下一个独立段落（非列表的 ZERO 段落标记）则停止，保留独立段落不被吞并
      if (i !== start && el.value === ZERO && !el.listId) break
      el.listId = listId
      el.listType = listType
      el.listStyle = listStyle
      i++
    }
  }

  public computeListStyle(
    ctx: CanvasRenderingContext2D,
    elementList: IElement[]
  ): Map<string, number> {
    const listStyleMap = new Map<string, number>()
    // 空列表保护：切换模式等场景下 elementList 可能为空，
    // 直接读取 elementList[start].listId 会抛 Cannot read properties of undefined
    if (!elementList || elementList.length === 0) {
      return listStyleMap
    }
    let start = 0
    let curListId = elementList[start].listId
    let curElementList: IElement[] = []
    const elementLength = elementList.length
    while (start < elementLength) {
      const curElement = elementList[start]
      if (curListId && curListId === curElement.listId) {
        curElementList.push(curElement)
      } else {
        if (curElement.listId && curElement.listId !== curListId) {
          // 列表结束
          if (curElementList.length) {
            const width = this.getListStyleWidth(ctx, curElementList)
            listStyleMap.set(curListId!, width)
            // 记录该列表的基准样式元素（首个有显式样式的元素），
            // 供 drawListStyle 统一所有序号的颜色/字号，避免各行文字样式差异导致序号渲染不一致
            this.listStyleElementMap.set(
              curListId!,
              this.findStyledElement(curElementList)
            )
          }
          curListId = curElement.listId
          curElementList = curListId ? [curElement] : []
        }
      }
      start++
    }
    if (curElementList.length) {
      const width = this.getListStyleWidth(ctx, curElementList)
      listStyleMap.set(curListId!, width)
      this.listStyleElementMap.set(
        curListId!,
        this.findStyledElement(curElementList)
      )
    }
    return listStyleMap
  }

  private findStyledElement(elementList: IElement[]): IElement {
    // 列表标记元素(value===ZERO)通常不带 size，从首个真实文字元素开始查找
    const startIndex = elementList[0]?.value === ZERO ? 1 : 0
    let styleElement = elementList[startIndex] || elementList[0]
    for (let i = startIndex; i < elementList.length; i++) {
      const element = elementList[i]
      // 控件元素：优先取structValues中首个有size的元素，其次取控件size，最后取localStorage
      if (element.type === ElementType.CONTROL && element.control) {
        const control = element.control
        // 1. 单选structValues
        let structSize: number | undefined
        if (control.structValues?.length) {
          structSize = control.structValues.find(sv => sv.size)?.size
        }
        // 2. 多选values[].structValues
        if (!structSize && control.values?.length) {
          for (const v of control.values) {
            const found = v.structValues?.find(sv => sv.size)
            if (found?.size) {
              structSize = found.size
              break
            }
          }
        }
        // 3. 控件自身的size
        if (!structSize && control.size) {
          structSize = control.size
        }
        // 4. localStorage中存储的size
        if (!structSize) {
          const FONT_SIZE_KEY = 'crealife_canvas_font_size'
          const stored = parseInt(localStorage.getItem(FONT_SIZE_KEY) || '')
          if (stored > 0) structSize = stored
        }
        if (structSize) {
          styleElement = { ...element, size: structSize }
          break
        }
      }
      if (
        element.font ||
        element.size ||
        element.bold ||
        element.italic ||
        element.actualSize
      ) {
        styleElement = element
        break
      }
    }
    return styleElement
  }

  private getListFontStyle(
    elementList: IElement[],
    scale: number,
    listStyleElement?: IElement
  ): string {
    // 传入列表基准样式时优先使用，保证同列表序号字号一致；
    // 否则回退到当前行内查找样式
    const styleElement = listStyleElement || this.findStyledElement(elementList)
    if (this.options.list.inheritStyle) {
      return this.draw.getElementFont(styleElement, scale)
    } else {
      // 字号始终与列表文字保持一致，其他样式使用默认值
      const { defaultFont, defaultSize } = this.options
      const size = styleElement.actualSize || styleElement.size || defaultSize
      return `${size * scale}px ${defaultFont}`
    }
  }

  // 是否为控件渲染相关的系统默认色（选中值色/默认值色/选择器值色等）。
  // 这些颜色代表"控件未自定义颜色"，不应作为列表序号的文字颜色。
  private isControlRenderColor(color?: string): boolean {
    if (!color) return false
    const { control, selector } = this.options
    return (
      color === control.selectValueColor ||
      color === control.defaultValueColor ||
      color === selector.customSelectValueColor ||
      color === selector.multiSelectValueColor ||
      color === selector.optionColor
    )
  }

  // 列表序号颜色与同行文字保持一致；
  // 当前行为控件且未自定义颜色（color 为空或为控件系统默认色）时，使用 options.defaultColor；
  // 避免列表序号因控件选中值而变成蓝色，且避免沿用上个绘制状态的 fillStyle
  private getListColor(elementList: IElement[], listStyleElement?: IElement): string {
    // 传入列表基准样式时优先使用，保证同列表序号颜色一致
    const styleElement = listStyleElement || this.findStyledElement(elementList)
    const color = styleElement.color
    if (color && !this.isControlRenderColor(color)) {
      return color
    }
    return this.options.defaultColor
  }

  public getListStyleWidth(
    ctx: CanvasRenderingContext2D,
    listElementList: IElement[]
  ): number {
    const { scale, checkbox } = this.options
    const startElement = listElementList[0]
    // 非递增样式返回固定值
    if (
      startElement.listStyle &&
      startElement.listStyle !== ListStyle.DECIMAL
    ) {
      if (startElement.listStyle === ListStyle.CHECKBOX) {
        return (checkbox.width + this.LIST_GAP) * scale
      }
      return this.UN_COUNT_STYLE_WIDTH * scale
    }
    // 计算列表数量
    const count = listElementList.reduce((pre, cur) => {
      if (cur.value === ZERO) {
        pre += 1
      }
      return pre
    }, 0)
    if (!count) return 0
    ctx.save()
    ctx.font = this.getListFontStyle(listElementList, scale)
    // 以递增样式最大宽度为准：用最大序号（列表项数量）的位数测量，
    // 避免两位数/多位数序号（如 10. 11.）因宽度不足与正文重叠
    const maxIndex = count + 1
    const digits = String(maxIndex).length
    const text = `${this.MEASURE_BASE_TEXT.repeat(digits)}${KeyMap.PERIOD}`
    const textMetrics = ctx.measureText(text)
    ctx.restore()
    return Math.ceil((textMetrics.width + this.LIST_GAP) * scale)
  }

  public drawListStyle(
    ctx: CanvasRenderingContext2D,
    row: IRow,
    position: IElementPosition
  ) {
    const { elementList, offsetX, listIndex, ascent } = row
    const startElement = elementList[0]
    if (startElement.value !== ZERO || startElement.listWrap) return
    // 使用该列表的基准样式元素（首个有显式样式的元素），
    // 保证同列表所有序号的颜色/字号一致，避免因各行文字样式差异导致序号渲染不一致
    // 若 map 未命中（如该列表未参与 computeListStyle），回退到当前行内查找样式
    const listStyleElement =
      this.listStyleElementMap.get(startElement.listId!) ||
      this.findStyledElement(elementList)
    // tab width
    let tabWidth = 0
    const { defaultTabWidth, scale } = this.options
    for (let i = 1; i < elementList.length; i++) {
      const element = elementList[i]
      if (element?.type !== ElementType.TAB) break
      tabWidth += defaultTabWidth * scale
    }
    // 列表样式渲染
    const {
      coordinate: {
        leftTop: [startX, startY]
      }
    } = position
    const x = startX - offsetX! + tabWidth
    const y = startY + ascent
    // 复选框样式特殊处理
    if (startElement.listStyle === ListStyle.CHECKBOX) {
      const { width, height, gap } = this.options.checkbox
      const checkboxRowElement: IRowElement = {
        ...startElement,
        checkbox: {
          value: !!startElement.checkbox?.value
        },
        metrics: {
          ...startElement.metrics,
          width: (width + gap * 2) * scale,
          height: height * scale
        }
      }
      this.draw.getCheckboxParticle().render({
        ctx,
        x: x - gap * scale,
        y,
        index: 0,
        row: {
          ...row,
          elementList: [checkboxRowElement, ...row.elementList]
        }
      })
    } else {
      let text = ''
      if (startElement.listType === ListType.UL) {
        text =
          ulStyleMapping[<UlStyle>(<unknown>startElement.listStyle)] ||
          ulStyleMapping[UlStyle.DISC]
      } else {
        text = `${listIndex! + 1}${KeyMap.PERIOD}`
      }
      if (!text) return
      ctx.save()
      ctx.font = this.getListFontStyle(elementList, scale, listStyleElement)
      // 序号颜色与同行文字保持一致（排除控件默认/选中值色，避免列表序号变蓝）
      ctx.fillStyle = this.getListColor(elementList, listStyleElement)
      // 与同行文字采用相同基线对齐：y = startY + ascent 即文字基线坐标
      // （控件 UI 的基准是基线而非整行几何中心，故不能用 row.height/2）
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(text, x, y)
      ctx.restore()
    }
  }
}
