/**
 * 「历史会话」列表的时间显示。
 *
 * 设计存档里这一列混用相对和绝对时间：`2 分钟前` / `昨天` / `9 月 12 日`。
 * 规则是「越近越相对」—— 刚发生的事说「几分钟前」比说「15:58」有用，
 * 上个月的事反过来。
 *
 * 刻意不用 Intl.RelativeTimeFormat：它只会输出「1 天前」这种纯相对说法，
 * 表达不了存档要的「昨天」和「9 月 12 日」这两档，包一层反而更绕。
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** 当天零点。用来判断「是不是同一天」，而不是「相差是否不到 24 小时」—— 昨晚 23:50 和今早 00:10 只差 20 分钟，但不是同一天。 */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  // 后端给的是 ISO 字符串，理论上不会解析失败；真失败了也不该让侧边栏崩掉。
  if (Number.isNaN(then.getTime())) return ''

  const diff = now.getTime() - then.getTime()

  // 时钟偏差或服务端时间略超前时 diff 会是负数，按「刚刚」处理，不显示「-3 分钟前」。
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`

  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000)
  if (dayDiff === 0) return `${Math.floor(diff / HOUR)} 小时前`
  if (dayDiff === 1) return '昨天'

  const month = then.getMonth() + 1
  const day = then.getDate()
  if (then.getFullYear() === now.getFullYear()) return `${month} 月 ${day} 日`
  return `${then.getFullYear()} 年 ${month} 月 ${day} 日`
}
