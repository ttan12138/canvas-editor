export interface IPrefixAutocompleteItem {
  value: string
  label?: string
  // 为 true 时 label 按 HTML 渲染（innerHTML），否则按纯文本渲染（默认）
  html?: boolean
  [key: string]: any
}

export type IPrefixAutocompleteSearchFn = (
  keyword: string
) => IPrefixAutocompleteItem[] | Promise<IPrefixAutocompleteItem[]>

export interface IPrefixAutocompleteOption {
  prefix: string
  options?: IPrefixAutocompleteItem[]
  onSearch?: IPrefixAutocompleteSearchFn
  // 下拉无匹配项时的自定义提示语（默认：无匹配项）
  emptyText?: string
  // 异步搜索中（searching=true）的自定义提示语（默认：加载中...）
  loadingText?: string
  // 手动模式：open() 后不自动 refresh()，由外部通过
  // setPrefixAutocompleteSearching / setPrefixAutocompleteList 自行驱动
  manual?: boolean
}

export type IPrefixAutocompleteList = IPrefixAutocompleteOption[]

export interface IPrefixAutocompleteState {
  isOpen: boolean
  prefix: string | null
  keyword: string
  selectedIndex: number
  list: IPrefixAutocompleteItem[]
}
