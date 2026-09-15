import { Draw } from '../draw/Draw'
import { Cursor } from '../cursor/Cursor'
import { EDITOR_COMPONENT, EDITOR_PREFIX } from '../../dataset/constant/Editor'
import { EditorComponent } from '../../dataset/enum/Editor'
import {
  IPrefixAutocompleteItem,
  IPrefixAutocompleteList,
  IPrefixAutocompleteOption
} from '../../interface/prefixAutocomplete/PrefixAutocomplete'

// 解析带输入框占位符的模板字符串。
// 占位符语法：{} （不限，按文本框）、{number}（数值框）、{text}（文本框）。
// 例：'si: {};mi: {number}' -> segments=['si: ', ';mi: '], types=['', 'number']
// 返回 segments 文本段与 types 占位符类型，types.length === segments.length - 1。
function parseInputTemplate(value: string): {
  segments: string[]
  types: string[]
} {
  const segments: string[] = []
  const types: string[] = []
  const regex = /\{\s*(\w*)\s*\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(value)) !== null) {
    segments.push(value.slice(lastIndex, match.index))
    types.push((match[1] || '').toLowerCase())
    lastIndex = regex.lastIndex
  }
  segments.push(value.slice(lastIndex))
  return { segments, types }
}

export class PrefixAutocomplete {
  private draw: Draw
  private cursor: Cursor

  private configMap: Map<string, IPrefixAutocompleteOption>
  private dom: HTMLDivElement | null
  private itemDomList: HTMLDivElement[]
  // 候选项索引 -> 数值输入框当前值（inputType==='number' 时生效）
  // key 为 `${listIndex}`（单输入框旧用法）或 `${listIndex}:${localIndex}`（多占位符）
  private inputValueMap: Map<string, string>

  private isOpen: boolean
  private activePrefix: string | null
  private activeIndex: number
  // null 表示尚未加载（显示「加载中...」）；[] 表示已加载但无匹配（显示「无匹配项」）
  private list: IPrefixAutocompleteItem[] | null
  private searching: boolean
  private pendingPrefix: string | null = null

  constructor(draw: Draw) {
    this.draw = draw
    this.cursor = draw.getCursor()

    this.configMap = new Map()
    this.dom = null
    this.itemDomList = []
    this.inputValueMap = new Map()

    this.isOpen = false
    this.activePrefix = null
    this.activeIndex = 0
    this.list = null
    this.searching = false
  }

  // 清空所有已注册的预输入配置
  public reset() {
    this.close()
    this.configMap.clear()
  }

  // 注册预输入配置。replace=true 时先清空已有配置再注册（即重置 options）
  public register(
    payload: IPrefixAutocompleteList,
    replace = false
  ) {
    if (replace) {
      this.configMap.clear()
    }
    payload.forEach(option => {
      this.configMap.set(option.prefix, option)
    })
  }

  // 标记本次为手动键入触发字符，待字符写入完成后打开下拉
  public markManualTrigger(prefix: string) {
    this.pendingPrefix = prefix
  }

  // 字符写入后消费标记并打开下拉
  public consumeManualTrigger(): string | null {
    const prefix = this.pendingPrefix
    this.pendingPrefix = null
    return prefix
  }

  public getIsOpen(): boolean {
    return this.isOpen
  }

  public getActivePrefix(): string | null {
    return this.activePrefix
  }

  // 外部直接控制搜索中状态（例如自定义异步拉取数据时手动开启/关闭加载提示）
  // 仅当存在激活的自动补全前缀且下拉已打开时生效，避免误调用污染状态
  public setSearching(value: boolean): boolean {
    if (!this.isOpen || !this.activePrefix) return false
    this.searching = value
    this.renderList()
    return true
  }

  public getSearching(): boolean {
    return this.searching
  }

  // 外部直接设置候选列表（配合 setSearching 使用）
  // 仅当存在激活的自动补全前缀且下拉已打开时生效
  public setList(list: IPrefixAutocompleteItem[]): boolean {
    if (!this.isOpen || !this.activePrefix) return false
    this.list = list
    this.activeIndex = 0
    this.renderList()
    return true
  }

  public hasPrefix(prefix: string): boolean {
    const has = this.configMap.has(prefix)
    if (!has && this.configMap.size === 0) {
      console.warn(
        '[PrefixAutocomplete] 当前未注册任何前缀(configMap.size=0)，' +
        '请确认已调用 editor.registerPrefixAutocomplete([...])，且调用发生在 new Editor 之后、作用于同一个 editor 实例'
      )
    }
    return has
  }

  public getConfigSize(): number {
    return this.configMap.size
  }

  // 触发字符被手动输入后调用：写入触发字符并打开下拉
  public open(prefix: string) {
    const config = this.configMap.get(prefix)
    if (!config) {
      console.warn('[PrefixAutocomplete] open 未找到对应 config，直接返回')
      return
    }
    this.activePrefix = prefix
    this.activeIndex = 0
    // 预输入弹窗出现时，隐藏单选/多选/customSelect 控件下拉，避免相互重叠
    this.hideControlSelects()
    this.renderDom()
    // 手动模式：由外部通过 setSearching/setList 自行驱动，不自动拉取
    if (config.manual) {
      this.renderList()
      // 打开后下一帧再聚焦一次，覆盖编辑器渲染可能抢走焦点的情况
      requestAnimationFrame(() => this.highlight())
      return
    }
    this.refresh()
    // 打开后下一帧再聚焦一次，覆盖编辑器渲染（draw.render 的 cursor.focus）可能抢走焦点的情况
    requestAnimationFrame(() => this.highlight())
  }

  // 预输入弹窗出现时，隐藏单选/多选/customSelect 控件下拉
  private hideControlSelects() {
    document
      .querySelectorAll('.ce-select-control-popup')
      .forEach(el => el.remove())
  }

  public close() {
    if (this.dom) {
      this.dom.remove()
      this.dom = null
    }
    this.itemDomList = []
    this.inputValueMap = new Map()
    this.isOpen = false
    this.activePrefix = null
    this.activeIndex = 0
    this.list = null
    this.searching = false
    // 弹窗关闭（ESC / 失焦 / 选中后）需把焦点还给编辑器，
    // 否则焦点停留在已移除的输入框上 -> 光标虽闪烁但无法键入
    this.draw.getCursor().focus()
  }

  // 下拉打开时继续输入普通字符：关闭下拉，字符照常写入
  public handleInputFallback() {
    if (this.isOpen) {
      this.close()
    }
  }

  // 上下键切换
  public moveSelection(dir: 1 | -1) {
    if (!this.isOpen || !this.list || !this.list.length) return
    const next = this.activeIndex + dir
    if (next < 0) {
      this.activeIndex = this.list.length - 1
    } else if (next >= this.list.length) {
      this.activeIndex = 0
    } else {
      this.activeIndex = next
    }
    this.highlight()
  }

  // 回车确认：删除触发字符，替换为选中项（无选项则取第一项/默认）
  public confirm(): boolean {
    if (!this.isOpen) return false
    const config = this.activePrefix
      ? this.configMap.get(this.activePrefix)
      : null
    if (!config) {
      this.close()
      return false
    }
    // 无选项时默认使用第一项
    if (!this.list || !this.list.length) {
      this.close()
      return false
    }
    const item = this.list[this.activeIndex] || this.list[0]
    // 输入框型候选：确认前读取各输入框值并回填到占位符
    let text = item.value
    const template = parseInputTemplate(item.value)
    if (template.types.length > 0) {
      // value 含占位符：按占位符顺序回填，类型决定输入框（仅影响渲染，回填逻辑一致）
      let ok = true
      const values: string[] = []
      for (let i = 0; i < template.types.length; i++) {
        const raw = (this.inputValueMap.get(`${this.activeIndex}:${i}`) ?? '').trim()
        if (!raw) {
          if (item.inputRequired) {
            // 必填但未输入：高亮对应输入框并阻止确认
            const inputs = this.itemDomList[this.activeIndex]?.querySelectorAll('input')
            const target = inputs && (inputs[i] as HTMLInputElement)
            if (target) {
              target.focus()
              target.style.boxShadow = '0 0 0 2px rgba(220, 38, 38, .4)'
            }
            ok = false
            break
          }
          values.push('')
        } else {
          values.push(raw)
        }
      }
      if (!ok) return false
      // 按占位符顺序回填（末尾文本段 template.segments[types.length] 拼接）
      text = template.segments[0]
      for (let i = 0; i < template.types.length; i++) {
        text += values[i] + (item.unit ?? '') + template.segments[i + 1]
      }
    } else if (item.inputType === 'number') {
      // 兼容旧用法：整项单个输入框（无占位符，inputType 声明为 number）
      const raw = (this.inputValueMap.get(`${this.activeIndex}`) ?? '').trim()
      if (!raw) {
        if (item.inputRequired) {
          const input = this.itemDomList[this.activeIndex]?.querySelector('input')
          if (input) {
            ;(input as HTMLInputElement).focus()
            input.style.boxShadow = '0 0 0 2px rgba(220, 38, 38, .4)'
          }
          return false
        }
      } else {
        text = item.value + raw + (item.unit ?? '')
      }
    }
    this.replacePrefixWith(text)
    this.close()
    return true
  }

  private async refresh() {
    if (!this.activePrefix) return
    const config = this.configMap.get(this.activePrefix)
    if (!config) return
    this.searching = true
    this.list = null
    this.activeIndex = 0
    let result: IPrefixAutocompleteItem[] = config.options ?? []
    if (config.onSearch) {
      const searched = await config.onSearch('')
      if (searched && searched.length) {
        result = searched
      }
    }
    this.list = result
    this.searching = false
    this.renderList()
  }

  private replacePrefixWith(text: string) {
    const rangeManager = this.draw.getRange()
    const { startIndex } = rangeManager.getRange()
    if (!~startIndex) return
    // open() 之前触发字符已通过正常输入流程写入；collapsed 光标位于触发字符右侧时，
    // canvas-editor 的 range.startIndex 指向的正是触发字符自身所在的索引
    const triggerIndex = startIndex
    if (triggerIndex < 0) return
    // 先关闭下拉、清空状态，避免影响后续正常输入流程
    this.close()
    // 选中触发字符（左闭右开：[triggerIndex-1, triggerIndex]），
    // 再由 input 的正常流程删除该选区并插入选项文本。
    // 这样复用 canvas-editor 自身的「删除选区 + 插入 + render/position 同步」逻辑，
    // 避免手动 spliceElementList 破坏 positionList 与 elementList 的同步，
    // 否则 getIsCanInput() 会基于失步的 position 误判为不可输入，导致文本无法录入。
    const deleteStart = triggerIndex - 1 < 0 ? 0 : triggerIndex - 1
    rangeManager.setRange(deleteStart, triggerIndex)
    this.draw.getCanvasEvent().input(text)
  }

  private renderDom() {
    if (this.dom) {
      this.dom.remove()
    }
    const dom = document.createElement('div')
    dom.classList.add(`${EDITOR_PREFIX}-prefix-autocomplete`)
    dom.setAttribute(EDITOR_COMPONENT, EditorComponent.POPUP)
    // 复用 selector 浮层主题变量，使预输入下拉与右键菜单样式完全统一
    const selectorOption = this.draw.getOptions().selector
    const style = dom.style
    // 与 contextmenu.css 默认值保持一致，避免配置缺失时颜色不一致
    style.setProperty('--ce-selector-popup-bg', selectorOption?.popupBackgroundColor || '#fff')
    style.setProperty('--ce-selector-option-color', selectorOption?.optionColor || '#3d4757')
    style.setProperty('--ce-selector-option-hover-bg', selectorOption?.optionHoverBackgroundColor || 'rgba(25, 55, 88, .04)')
    style.setProperty('--ce-selector-option-hover-color', selectorOption?.optionHoverColor || '#3d4757')
    style.setProperty('--ce-selector-active-color', selectorOption?.activeOptionColor || '#3d4757')
    style.setProperty('--ce-selector-active-bg', selectorOption?.activeOptionBackgroundColor || 'rgba(25, 55, 88, .04)')
    // 弹窗底部操作提示（hint）颜色：复用 selector 配置，缺省回退黄色，与单选/多选提示条一致
    style.setProperty('--ce-selector-hint-color', selectorOption?.hintColor || '#E6A23C')
    style.setProperty('--ce-selector-hint-bg', selectorOption?.hintBackgroundColor || '#FFFBE6')
    // 挂载到 document.body，使 fixed 定位的 containing block 为视口。
    // 否则当编辑器容器或其祖先存在 transform/filter 等属性时，
    // fixed 会相对该容器定位，下拉将被容器 overflow 裁剪或渲染到屏幕外而不可见。
    // 打开前先获取光标在视口中的位置，避免打开动作（插入 DOM / 重渲染）导致光标坐标漂移
    const cursorXY = this.cursor.getCursorViewportXY()
    document.body.append(dom)
    this.dom = dom
    this.isOpen = true
    this.position(cursorXY)
  }

  private position(cursorXY?: { x: number; y: number } | null) {
    if (!this.dom) return
    const viewportXY = cursorXY ?? this.cursor.getCursorViewportXY()
    if (!viewportXY) return
    // 参考右键菜单：使用 fixed 定位 + viewport 坐标
    // 以光标位置为锚点：水平对齐光标、垂直显示在光标正下方（仅 y 方向偏移约 5px）
    let left = viewportXY.x
    let top = viewportXY.y + 5
    this.dom.style.left = `${left}px`
    this.dom.style.top = `${top}px`
    // document 层级贴边处理：保证下拉始终落在视口内
    const rect = this.dom.getBoundingClientRect()
    // 1) 下侧空间不足翻转到光标上方
    if (top + rect.height > window.innerHeight) {
      top = viewportXY.y - rect.height - 5
    }
    // 2) 右侧空间不足翻转到光标左侧
    if (left + rect.width > window.innerWidth) {
      left = viewportXY.x - rect.width
    }
    // 3) 纵向兜底夹紧到视口
    if (top < 0) {
      top = 0
    }
    if (top + rect.height > window.innerHeight) {
      top = Math.max(0, window.innerHeight - rect.height)
    }
    // 4) 横向兜底夹紧到视口
    if (left < 0) {
      left = 0
    }
    if (left + rect.width > window.innerWidth) {
      left = Math.max(0, window.innerWidth - rect.width)
    }

    this.dom.style.left = `${left}px`
    this.dom.style.top = `${top}px`
  }

  private renderList() {
    if (!this.dom) return
    this.dom.innerHTML = ''
    this.itemDomList = []
    const list = this.list
    if (!list || !list.length) {
      const config = this.activePrefix
        ? this.configMap.get(this.activePrefix)
        : null
      const empty = document.createElement('div')
      empty.classList.add(`${EDITOR_PREFIX}-prefix-autocomplete-empty`)
      // list 为 null（尚未加载/外部未 setList）显示加载中；
      // list 为 []（已加载但无结果）显示无匹配
      const isLoading = list === null || this.searching
      empty.textContent = isLoading
        ? config?.loadingText ?? '加载中...'
        : config?.emptyText ?? '无匹配项'
      this.dom.append(empty)
    }
    list?.forEach((item, index) => {
      const itemDom = document.createElement('div')
      itemDom.classList.add(`${EDITOR_PREFIX}-prefix-autocomplete-item`)
      // 输入框型候选：
      // - value 含占位符 {} / {number} / {text} -> 按占位符拆分成文本段 + 对应类型输入框
      // - 否则若 inputType==='number' -> 整项末尾追加一个数值框（旧用法兼容）
      // 注意：占位符可能带类型名（如 {number}），需用正则判断是否包含任意 "{}" 占位符
      const hasTemplate = /\{\s*\w*\s*\}/.test(item.value)
      const template = hasTemplate
        ? parseInputTemplate(item.value)
        : (item.inputType === 'number'
          ? { segments: [item.value, ''], types: ['number'] }
          : null)
      // 无输入框：纯文本/HTML 展示
      if (!template) {
        const span = document.createElement('span')
        if (item.html) {
          span.innerHTML = item.label ?? item.value
        } else {
          span.textContent = item.label ?? item.value
        }
        itemDom.append(span)
      } else {
        template.segments.forEach((seg, segIndex) => {
          if (seg) {
            const span = document.createElement('span')
            if (item.html) {
              span.innerHTML = seg
            } else {
              span.textContent = seg
            }
            itemDom.append(span)
          }
          // 每个文本段后（最后一个段之后不插）放一个输入框
          if (segIndex < template.types.length) {
            const inputType = template.types[segIndex] === 'number' ? 'number' : 'text'
            const input = document.createElement('input')
            input.type = inputType
            input.classList.add(`${EDITOR_PREFIX}-prefix-autocomplete-input`)
            input.style.width = inputType === 'number' ? '64px' : '100px'
            input.style.height = '22px'
            input.style.marginLeft = '4px'
            input.style.marginRight = '4px'
            input.style.padding = '0 4px'
            input.style.fontSize = '13px'
            input.style.outline = 'none'
            input.placeholder = item.inputPlaceholder ?? (inputType === 'number' ? '请输入数值' : '请输入文本')
            const mapKey = `${index}:${segIndex}`
            input.value = item.inputValue ?? this.inputValueMap.get(mapKey) ?? ''
            this.inputValueMap.set(mapKey, input.value)
            const syncValue = () => this.inputValueMap.set(mapKey, input.value)
            input.oninput = syncValue
            input.onmousedown = evt => {
              // 点击输入框本身不触发候选确认/关闭
              evt.stopPropagation()
            }
            input.onfocus = () => {
              input.style.boxShadow = '0 0 0 2px rgba(25, 55, 88, .2)'
            }
            input.onblur = () => {
              input.style.boxShadow = 'none'
            }
            input.onkeydown = evt => {
              // 阻止键盘事件冒泡到编辑器（避免上下键/回车被下拉导航接管）
              evt.stopPropagation()
              if (evt.key === 'Enter') {
                evt.preventDefault()
                this.activeIndex = index
                this.confirm()
              } else if (evt.key === 'Escape') {
                evt.preventDefault()
                this.close()
              } else if (evt.key === 'ArrowUp') {
                // 输入框内按上键：切换到上一项（焦点由 highlight 自动转移到新项的输入框）
                evt.preventDefault()
                this.moveSelection(-1)
              } else if (evt.key === 'ArrowDown') {
                evt.preventDefault()
                this.moveSelection(1)
              } else if (evt.key === 'Tab') {
                // 同一候选项有多个输入框时，Tab 在它们之间循环切换焦点
                evt.preventDefault()
                const inputs = input.parentElement?.querySelectorAll('input')
                if (inputs && inputs.length > 1) {
                  const list = Array.from(inputs) as HTMLInputElement[]
                  const idx = list.indexOf(input)
                  const nextInput = list[(idx + 1) % list.length]
                  nextInput.focus()
                }
              }
            }
            itemDom.append(input)
          }
        })
      }
      itemDom.onmousedown = (evt: MouseEvent) => {
        // 阻止输入框失焦导致的关闭
        evt.preventDefault()
        this.activeIndex = index
        this.confirm()
      }
      this.itemDomList.push(itemDom)
      this.dom!.append(itemDom)
    })
    // 底部操作提示：仅当配置显式声明 hint 时展示（默认不展示）
    const hintConfig = this.activePrefix
      ? this.configMap.get(this.activePrefix)
      : null
    if (hintConfig?.hint) {
      const hintDom = document.createElement('div')
      hintDom.className = `${EDITOR_PREFIX}-prefix-autocomplete-hint`
      hintDom.textContent = hintConfig.hint
      this.dom!.append(hintDom)
    }
    this.highlight()
    // 列表内容/高度变化后重新贴边定位
    this.position()
  }

  private highlight() {
    this.itemDomList.forEach((itemDom, index) => {
      if (index === this.activeIndex) {
        itemDom.classList.add(`${EDITOR_PREFIX}-prefix-autocomplete-active`)
      } else {
        itemDom.classList.remove(`${EDITOR_PREFIX}-prefix-autocomplete-active`)
      }
    })
    const activeDom = this.itemDomList[this.activeIndex]
    if (activeDom && this.dom) {
      this.dom.scrollTop = activeDom.offsetTop - this.dom.clientHeight / 2
    }
    // 打开列表 / 切换选项时，聚焦激活项内的第一个输入框（若有），
    // 便于用户直接输入数值 / 文本，无需额外点击
    const firstInput = activeDom?.querySelector('input') as HTMLInputElement | null
    if (firstInput) {
      // 同步聚焦（input 已挂载到 document.body，可直接聚焦）
      firstInput.focus()
      // 兜底：若被编辑器其它同步/异步逻辑（如画布重渲染）抢走焦点，再补一次
      setTimeout(() => {
        const stillActive = this.itemDomList[this.activeIndex]?.querySelector('input')
        if (stillActive && document.activeElement !== stillActive) {
          stillActive.focus()
        }
      }, 0)
    }
  }
}
