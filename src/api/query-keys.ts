/** TanStack Query 的 key 工厂。唯一来源，避免各处手写字符串数组拼错。 */

export const queryKeys = {
  conversations: {
    all: ['conversations'] as const,
    list: (params: { limit?: number; cursor?: string } = {}) =>
      ['conversations', 'list', params] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
  },
} as const
