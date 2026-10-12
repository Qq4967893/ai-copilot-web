/**
 * 反馈端点（技术设计 §22.3）。
 *
 * 本轮只实现传输层，不接 UI —— 反馈是 PRD §7.3 里的 P1 业务功能，不在基础架构范围。
 *
 * 一处已知落差：PRD §10.9.2 要求提供 7 个可选反馈原因（数据不正确 / 规则不正确 /
 * 没有回答问题 / 找不到对应后台 / 结果不完整 / 表达难理解 / 其他），而后端当前只有
 * rating + 自由文本 comment。做反馈 UI 时要么把原因塞进 comment，要么改接口 ——
 * 留给那时决定。
 *
 * 后端是 upsert：同一条消息重复提交会覆盖，不会 409，所以点赞/点踩可以自由切换。
 */

import { request } from './client'
import type { FeedbackOut, FeedbackRating, Id } from './types'

export function submitFeedback(
  messageId: Id,
  rating: FeedbackRating,
  comment?: string,
): Promise<FeedbackOut> {
  return request<FeedbackOut>(`/messages/${messageId}/feedback`, {
    method: 'POST',
    body: { rating, comment: comment ?? null },
  })
}
