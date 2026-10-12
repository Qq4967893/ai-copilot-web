import { describe, expect, it } from 'vitest'

import { formatRelativeTime } from '@/lib/format-time'

/** 固定「现在」，避免测试随真实时钟漂移。 */
const NOW = new Date('2026-09-22T15:30:00')

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

describe('formatRelativeTime', () => {
  it('不到一分钟说「刚刚」', () => {
    expect(formatRelativeTime(ago(30_000), NOW)).toBe('刚刚')
  })

  it('一小时以内按分钟', () => {
    expect(formatRelativeTime(ago(2 * 60_000), NOW)).toBe('2 分钟前')
    expect(formatRelativeTime(ago(59 * 60_000), NOW)).toBe('59 分钟前')
  })

  it('同一天按小时', () => {
    expect(formatRelativeTime(new Date('2026-09-22T09:30:00').toISOString(), NOW)).toBe('6 小时前')
  })

  it('前一天说「昨天」', () => {
    expect(formatRelativeTime(new Date('2026-09-21T23:00:00').toISOString(), NOW)).toBe('昨天')
  })

  it('跨天按日历日判断，不是按「相差 24 小时」', () => {
    // 只差 3 小时多，但已经跨了午夜，所以是「昨天」而不是「3 小时前」。
    const now = new Date('2026-09-22T00:10:00')
    expect(formatRelativeTime(new Date('2026-09-21T21:00:00').toISOString(), now)).toBe('昨天')
  })

  it('一小时以内即使跨了午夜也仍按分钟 —— 比「昨天」有用', () => {
    const now = new Date('2026-09-22T00:10:00')
    expect(formatRelativeTime(new Date('2026-09-21T23:30:00').toISOString(), now)).toBe('40 分钟前')
  })

  it('今年更早的日期给月日', () => {
    expect(formatRelativeTime(new Date('2026-09-12T10:00:00').toISOString(), NOW)).toBe(
      '9 月 12 日',
    )
  })

  it('往年的日期带上年份', () => {
    expect(formatRelativeTime(new Date('2025-12-31T10:00:00').toISOString(), NOW)).toBe(
      '2025 年 12 月 31 日',
    )
  })

  it('服务端时间略超前时不显示负数', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 5_000).toISOString(), NOW)).toBe('刚刚')
  })

  it('解析不了的时间返回空串，而不是 Invalid Date', () => {
    expect(formatRelativeTime('不是时间', NOW)).toBe('')
  })
})
