import { createContext, useContext } from 'react'

import type { ConversationDetail } from '@/api/types'

import type { SessionState } from './session-reducer'

/** 会话状态 + 可用动作。实现见 ChatSessionProvider。 */
export interface ChatSessionValue extends SessionState {
  canSend: boolean
  send: (text: string) => void
  stop: () => void
  retry: () => void
  startNew: () => void
  hydrate: (detail: ConversationDetail) => void
  /** 路由页在 URL 真的换了之后调，用来解除 startNew 留下的 hydrate 抑制。 */
  noteRouteChange: () => void
}

export const ChatSessionContext = createContext<ChatSessionValue | null>(null)

export function useChatSession(): ChatSessionValue {
  const value = useContext(ChatSessionContext)
  if (!value) throw new Error('useChatSession 必须在 ChatSessionProvider 内使用')
  return value
}
