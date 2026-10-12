/** 会话 REST 端点（技术设计 §22.1）。 */

import { request } from './client'
import type { ConversationDetail, ConversationPage, ConversationSummary, Id } from './types'

/**
 * 建会话。
 *
 * 通常传空对象即可 —— 服务端会用首条消息的前 60 个字符生成 title。
 * 注意调用时机：技术设计 §4.7 要求点「新建会话」时**不要**调这个接口，等用户
 * 真的发第一条消息时再调，否则会堆出一大批空会话。
 */
export function createConversation(title?: string): Promise<ConversationSummary> {
  return request<ConversationSummary>('/conversations', {
    method: 'POST',
    body: title === undefined ? {} : { title },
  })
}

/** 列表：ULID keyset 分页，时间倒序。next_cursor 为 null 表示到底了。 */
export function listConversations(
  params: { limit?: number; cursor?: string } = {},
): Promise<ConversationPage> {
  return request<ConversationPage>('/conversations', {
    query: { limit: params.limit, cursor: params.cursor },
  })
}

/** 详情，含全部消息（升序）。刷新页面后靠它恢复消息列表。 */
export function getConversation(id: Id, signal?: AbortSignal): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/conversations/${id}`, { signal })
}

/** 软删除。成功返回 204，无响应体。 */
export function deleteConversation(id: Id): Promise<void> {
  return request<void>(`/conversations/${id}`, { method: 'DELETE' })
}
