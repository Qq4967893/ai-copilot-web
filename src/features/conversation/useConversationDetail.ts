import { useQuery } from '@tanstack/react-query'

import { getConversation } from '@/api/conversations'
import { queryKeys } from '@/api/query-keys'

/**
 * 载入历史会话，用于刷新页面或从 URL 直接进入。
 *
 * `enabled` 里那条 `!isStreaming` 不是优化，是正确性：ai-copilot-api 的
 * list_messages 不按状态过滤，流式期间助手消息在库里是一条 content 为空的 pending
 * 记录。这时候拉详情会把屏幕上正在流的内容冲成空白。
 */
export function useConversationDetail(conversationId: string | null, isStreaming: boolean) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(conversationId ?? ''),
    queryFn: ({ signal }) => getConversation(conversationId as string, signal),
    enabled: conversationId !== null && !isStreaming,
  })
}
