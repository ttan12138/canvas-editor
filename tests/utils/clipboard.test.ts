import { describe, it, expect } from 'vitest'
import {
  setClipboardData,
  getClipboardData,
  removeClipboardData
} from '@/editor/utils/clipboard'

describe('clipboard', () => {
  const container = document.createElement('div')

  it('setClipboardData 和 getClipboardData', () => {
    removeClipboardData(container)
    const data = { text: 'hello', elementList: [{ value: 'hello' }] }
    setClipboardData(data as any, container)
    const result = getClipboardData(container)
    expect(result?.text).toBe('hello')
    expect(result?.elementList).toEqual([{ value: 'hello' }])
  })

  it('removeClipboardData 清空数据', () => {
    setClipboardData({ text: 'test', elementList: [] }, container)
    removeClipboardData(container)
    expect(getClipboardData(container)).toBeNull()
  })
})
