import { QueryClient } from '@tanstack/react-query'

import { AppError } from '@/api/errors'

/**
 * QueryClient 默认值。
 *
 * 两条刻意写死的策略：
 *
 * 1. **4xx 不重试。** 参数非法、会话不存在、无权限，重试多少次结果都一样，
 *    只是让用户多等几秒。
 * 2. **mutation 完全不重试。** 后端没有幂等键，重发 POST 会真的产生第二条记录。
 *    重试只能由用户显式点击触发。
 *
 * refetchOnWindowFocus 关掉的原因更具体：流式过程中助手消息在库里是 pending，
 * 内容为空。用户切个窗口回来就触发 refetch，会把正在流式渲染的内容冲成空白。
 * 详见 features/conversation/ChatSessionProvider.tsx 里 runStream 关于失效时机的注释。
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof AppError) {
            const status = error.httpStatus
            if (status !== undefined && status >= 400 && status < 500) return false
          }
          return failureCount < 1
        },
      },
      mutations: {
        retry: false,
      },
    },
  })
}
