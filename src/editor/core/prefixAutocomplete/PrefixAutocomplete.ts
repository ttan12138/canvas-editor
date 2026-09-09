import { Draw } from '../draw/Draw'
import { Cursor } from '../cursor/Cursor'
import { EDITOR_COMPONENT, EDITOR_PREFIX } from '../../dataset/constant/Editor'
import { EditorComponent } from '../../dataset/enum/Editor'
import {
  IPrefixAutocompleteItem,
  IPrefixAutocompleteList,
  IPrefixAutocompleteOption
} from '../../interface/prefixAutocomplete/PrefixAutocomplete'

export class PrefixAutocomplete {
  private draw: Draw
  private cursor: Cursor

  private configMap: Map<string, IPrefixAutocompleteOption>
  private dom: HTMLDivElement | null
  private itemDomList: HTMLDivElement[]

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
      return
    }
    this.refresh()
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
    this.isOpen = false
    this.activePrefix = null
    this.activeIndex = 0
    this.list = null
    this.searching = false
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
    this.replacePrefixWith(item.value)
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
    if (!this.list || !this.list.length) {
      const config = this.activePrefix
        ? this.configMap.get(this.activePrefix)
        : null
      const empty = document.createElement('div')
      empty.classList.add(`${EDITOR_PREFIX}-prefix-autocomplete-empty`)
      // list 为 null（尚未加载/外部未 setList）显示加载中；
      // list 为 []（已加载但无结果）显示无匹配
      const isLoading = this.list === null || this.searching
      empty.textContent = isLoading
        ? config?.loadingText ?? '加载中...'
        : config?.emptyText ?? '无匹配项'
      this.dom.append(empty)
      this.position()
      return
    }
    this.list.forEach((item, index) => {
      const itemDom = document.createElement('div')
      itemDom.classList.add(`${EDITOR_PREFIX}-prefix-autocomplete-item`)
      const span = document.createElement('span')
      const label = item.label ?? item.value
      if (item.html) {
        // 支持 HTML 渲染（v-html 效果）
        span.innerHTML = label
      } else {
        span.textContent = label
      }
      itemDom.append(span)
      itemDom.onmousedown = (evt: MouseEvent) => {
        // 阻止输入框失焦导致的关闭
        evt.preventDefault()
        this.activeIndex = index
        this.confirm()
      }
      this.itemDomList.push(itemDom)
      this.dom!.append(itemDom)
    })
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
  }
}
