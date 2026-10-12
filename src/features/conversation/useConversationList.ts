import { useQuery } from '@tanstack/react-query'

import { listConversations } from '@/api/conversations'
import { queryKeys } from '@/api/query-keys'

/**
 * 侧边栏「历史会话」列表。
 *
 * 只取第一页，不做无限滚动、不做删除 —— 本轮范围。真要加分页时换成
 * useInfiniteQuery 并把 next_cursor 接上（api 层已经返回了）。
 *
 * **不需要在这里写任何失效逻辑。** ChatSessionProvider 在一轮结束时已经失效了
 * queryKeys.conversations.all（即 ['conversations']），而这里的 key 是
 * ['conversations', 'list', {...}]，前缀匹配命中 —— 新会话会自动带着服务端
 * 生成的标题出现在列表里。
 */

/** 固定值而不是参数：key 里带可变的 limit 会让每个调用点各缓存一份。 */
const LIST_LIMIT = 30

export function useConversationList() {
  return useQuery({
    queryKey: queryKeys.conversations.list({ limit: LIST_LIMIT }),
    queryFn: () => listConversations({ limit: LIST_LIMIT }),
  })
}
