export interface IPrefixAutocompleteItem {
  value: string
  label?: string
  // 为 true 时 label 按 HTML 渲染（innerHTML），否则按纯文本渲染（默认）
  html?: boolean
  // 行内输入框通过 value 中的占位符声明，支持类型限定：
  //   {}       -> 文本框（无类型限制）
  //   {number} -> 数值输入框（仅允许数字）
  //   {text}   -> 文本框
  // 例：'si: {};mi: {number}' -> 文本「si: 」+ 文本框 +「;mi: 」+ 数值框
  // 可包含任意多个占位符。确认时按占位符顺序把输入值回填进 value。
  // inputType 仅作为「value 不含占位符」时的兜底：为 'number' 则在整项末尾
  // 追加一个数值输入框（旧用法，建议新代码直接用占位符）。
  inputType?: 'number'
  // 输入框回填时的单位后缀（如 'cm'），追加到每个占位符输入值之后
  unit?: string
  // 输入框占位提示（默认：数值框=请输入数值，文本框=请输入文本）
  inputPlaceholder?: string
  // 输入框的初始值
  inputValue?: string
  // 输入是否必填（默认 false；为 true 且有占位符未输入时确认会被阻止并高亮）
  inputRequired?: boolean
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
  // 弹窗底部操作提示（可选）。默认不展示；仅当显式配置（非空字符串）时在
  // 下拉底部渲染一条提示，例如含输入框时提示：
  //   '按 Tab 切换到下一个输入框，按 Enter 确认，按 Esc 退出'
  hint?: string
}

export type IPrefixAutocompleteList = IPrefixAutocompleteOption[]

export interface IPrefixAutocompleteState {
  isOpen: boolean
  prefix: string | null
  keyword: string
  selectedIndex: number
  list: IPrefixAutocompleteItem[]
}
