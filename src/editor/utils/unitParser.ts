export const UNIT_PATTERNS = ['Hu', 'mm', 'ml', 'cm', 'kg', 'g', 'mg', 'L', 'mL', 'kPa', 'mmHg']

export interface IUnitMatchResult {
  prefix: string
  placeholder: string
  unit: string
  hasPlaceholder: boolean
}

export function detectUnitPattern(value: string): IUnitMatchResult | null {
  for (const unit of UNIT_PATTERNS) {
    const unitIndex = value.lastIndexOf(unit)
    if (unitIndex > 0) {
      const beforeUnit = value.substring(0, unitIndex).trim()
      const placeholderMatch = beforeUnit.match(/[_—\-—–~]{2,}/)
      if (placeholderMatch) {
        return {
          prefix: beforeUnit.substring(0, placeholderMatch.index),
          placeholder: placeholderMatch[0],
          unit,
          hasPlaceholder: true
        }
      }
      const lastSpaceIndex = beforeUnit.lastIndexOf(' ')
      if (lastSpaceIndex > 0) {
        const lastPart = beforeUnit.substring(lastSpaceIndex + 1)
        if (!/^\d+(\.\d+)?$/.test(lastPart)) {
          return {
            prefix: beforeUnit.substring(0, lastSpaceIndex + 1),
            placeholder: lastPart,
            unit,
            hasPlaceholder: true
          }
        }
      }
    }
  }
  return null
}

export function formatValueWithInput(value: string, inputValue?: string): string {
  const match = detectUnitPattern(value)
  if (match) {
    const numericValue = inputValue && inputValue.trim() !== '' ? inputValue.trim() : match.placeholder
    return match.prefix + numericValue + match.unit
  }
  return value
}
