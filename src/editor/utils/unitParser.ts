export const UNIT_PATTERNS = ['Hu', 'mm', 'ml', 'cm', 'kg', 'g', 'mg', 'L', 'mL', 'kPa', 'mmHg', '°C', '%']

export interface IUnitMatchResult {
  prefix: string
  value: string
  unit: string
  hasPlaceholder: boolean
}

export interface IUnitPart {
  type: 'text' | 'input'
  text?: string
  value?: string
  unit?: string
}

export interface IMultiUnitMatchResult {
  parts: IUnitPart[]
  hasPlaceholder: boolean
}

export function detectUnitPattern(value: string): IUnitMatchResult | null {
  const result = detectMultiUnitPattern(value)
  if (result && result.parts.filter(p => p.type === 'input').length === 1) {
    const inputPart = result.parts.find(p => p.type === 'input')!
    const textParts = result.parts.filter(p => p.type === 'text')
    const prefix = textParts.map(p => p.text).join('')
    return {
      prefix,
      value: inputPart.value || '',
      unit: inputPart.unit || '',
      hasPlaceholder: result.hasPlaceholder
    }
  }
  return null
}

export function detectMultiUnitPattern(value: string): IMultiUnitMatchResult | null {
  const units: Array<{ index: number; unit: string }> = []

  // 找出所有单位的位置
  for (const unit of UNIT_PATTERNS) {
    let searchPos = 0
    while (true) {
      const unitIndex = value.indexOf(unit, searchPos)
      if (unitIndex === -1) break

      // 检查是否被包含在另一个更长单位中
      let isPartOfOtherUnit = false
      for (const otherUnit of UNIT_PATTERNS) {
        if (otherUnit.length > unit.length) {
          // 检查是否有更长单位包含当前位置
          let otherSearchPos = 0
          while (true) {
            const otherIndex = value.indexOf(otherUnit, otherSearchPos)
            if (otherIndex === -1) break
            // 检查当前单位是否在更长单位的范围内
            if (unitIndex >= otherIndex && unitIndex < otherIndex + otherUnit.length) {
              isPartOfOtherUnit = true
              break
            }
            otherSearchPos = otherIndex + 1
          }
          if (isPartOfOtherUnit) break
        }
      }

      if (!isPartOfOtherUnit) {
        units.push({ index: unitIndex, unit })
      }
      searchPos = unitIndex + 1
    }
  }

  if (units.length === 0) return null

  // 按位置排序
  units.sort((a, b) => a.index - b.index)

  const parts: IUnitPart[] = []
  let lastEnd = 0

  for (let i = 0; i < units.length; i++) {
    const currentUnit = units[i]
    const unitStart = currentUnit.index
    const unitEnd = unitStart + currentUnit.unit.length

    // 单位前的文本（可能包含数值）
    const beforeUnit = value.substring(lastEnd, unitStart)

    // 尝试分离数值和文本（支持负数、±和小数）
    const numericMatch = beforeUnit.match(/^(.*?)([±\-]?\d+(?:\.\d+)?)\s*$/)

    if (numericMatch) {
      // 有数值：数值前的文本 -> 输入框（数值+单位）
      const textBeforeNumber = numericMatch[1]
      const numberValue = numericMatch[2]

      if (textBeforeNumber) {
        parts.push({ type: 'text', text: textBeforeNumber })
      }
      parts.push({ type: 'input', value: numberValue, unit: currentUnit.unit })
    } else {
      // 无数值：文本 -> 输入框（空值+单位）
      if (beforeUnit) {
        parts.push({ type: 'text', text: beforeUnit })
      }
      parts.push({ type: 'input', value: '', unit: currentUnit.unit })
    }

    lastEnd = unitEnd
  }

  // 处理最后一个单位后的文本
  const lastUnitEnd = units[units.length - 1].index + units[units.length - 1].unit.length
  const suffix = value.substring(lastUnitEnd)
  if (suffix) {
    parts.push({ type: 'text', text: suffix })
  }

  return {
    parts,
    hasPlaceholder: true
  }
}

export function formatValueWithInput(value: string, inputValue?: string): string {
  const match = detectUnitPattern(value)
  if (match) {
    const numericValue = inputValue && inputValue.trim() !== '' ? inputValue.trim() : match.value
    return match.prefix + numericValue + match.unit
  }
  return value
}
