import type { AppError } from '@/api/errors'

import type { ChatMessage } from '@/lib/chat'

/**
 * 一轮对话的状态机（技术设计 §4.7）。
 *
 * 所有状态迁移集中在这个 reducer 里，而不是散落在若干 setState 调用中 ——
 * 这条链路有「创建会话」「流式」两段异步和四种终态，散着写必然漏分支。
 */

export type TurnStatus = 'idle' | 'creating' | 'streaming'

export interface SessionState {
  /** null 表示这是一个还没落到服务端的草稿会话。 */
  conversationId: string | null
  /** 已经从服务端载入过消息的会话 id，用来避免重复载入。 */
  hydratedId: string | null
  messages: ChatMessage[]
  status: TurnStatus
  /** 流**开始之前**的失败（建会话失败、流前 HTTP 错误）。流内失败挂在消息上。 */
  error: AppError | null
  /** 最近一次用户输入，供重试使用。 */
  lastInput: string | null
  /**
   * 刚刚被「新建会话」放弃掉的会话 id。
   *
   * 存在的唯一原因是一处时序：startNew 清空状态和 navigate('/chat') **不在同一次
   * 渲染里落地**（router 的导航要晚一拍）。中间那次渲染里 URL 还指着旧会话、而
   * hydratedId 已经是 null —— 路由页会把它读成「这个会话还没加载」，立刻从 query
   * 缓存里把刚清掉的消息又灌回来，「新建会话」看起来就是没反应。
   *
   * 记下这个 id，路由页据此跳过那一次 hydrate。路由真的变了之后由 'route-changed'
   * 清掉 —— 否则从侧边栏再点回这个会话就永远加载不出来了。
   */
  abandonedId: string | null
}

export const initialSessionState: SessionState = {
  conversationId: null,
  hydratedId: null,
  messages: [],
  status: 'idle',
  error: null,
  lastInput: null,
  abandonedId: null,
}

export type SessionAction =
  | { type: 'start-new' }
  | { type: 'route-changed' }
  | { type: 'hydrate'; conversationId: string; messages: ChatMessage[] }
  | { type: 'submit'; text: string; key: string }
  | { type: 'creating' }
  | { type: 'conversation-created'; conversationId: string }
  | { type: 'streaming' }
  | { type: 'delta'; text: string }
  | { type: 'completed'; messageId: string | null; content: string }
  | { type: 'stream-error'; messageId: string | null; partial: string; error: AppError }
  | { type: 'aborted'; partial: string }
  | { type: 'turn-failed'; error: AppError }
  | { type: 'retry-begin' }

/** 就地更新最后一条助手消息。找不到就原样返回 —— 不该发生，但不值得为它崩。 */
function patchLastAssistant(
  messages: ChatMessage[],
  patch: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const index = messages.findLastIndex((m) => m.role === 'assistant')
  if (index === -1) return messages
  const next = [...messages]
  const target = next[index]
  if (!target) return messages
  next[index] = patch(target)
  return next
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'start-new':
      // 点「新建会话」只清本地状态，不碰服务端（§4.7：避免堆出大量空会话）。
      // abandonedId 的作用见 SessionState 上的注释。
      return { ...initialSessionState, abandonedId: state.conversationId }

    case 'route-changed':
      // 返回原对象而不是新对象：没有要清的东西时不该触发一次多余的渲染。
      return state.abandonedId === null ? state : { ...state, abandonedId: null }

    case 'hydrate':
      return {
        ...initialSessionState,
        conversationId: action.conversationId,
        hydratedId: action.conversationId,
        messages: action.messages,
      }

    case 'submit':
      // 乐观插入用户消息 + 一个空的助手占位，让界面立刻有反馈。
      return {
        ...state,
        error: null,
        lastInput: action.text,
        messages: [
          ...state.messages,
          {
            key: `local-user-${action.key}`,
            role: 'user',
            contentType: 'text',
            content: action.text,
            state: 'done',
          },
          {
            key: `local-assistant-${action.key}`,
            role: 'assistant',
            contentType: 'markdown',
            content: '',
            state: 'streaming',
          },
        ],
      }

    case 'creating':
      return { ...state, status: 'creating' }

    case 'conversation-created':
      // 立刻记下 id。这一步很关键：如果紧接着的发消息失败了，重试只需要重发消息，
      // 不会再建第二个会话。
      return { ...state, conversationId: action.conversationId, hydratedId: action.conversationId }

    case 'streaming':
      return { ...state, status: 'streaming' }

    case 'delta':
      return {
        ...state,
        messages: patchLastAssistant(state.messages, (m) => ({
          ...m,
          content: m.content + action.text,
        })),
      }

    case 'completed':
      return {
        ...state,
        status: 'idle',
        lastInput: null,
        messages: patchLastAssistant(state.messages, (m) => ({
          ...m,
          // 以服务端终稿为准，丢帧或重复帧都能被它自愈。
          content: action.content,
          state: 'done',
          // 记下服务端 id，这条消息才能被点赞/点踩。可能是 null —— 流干净结束但
          // 没收到 message.started / message.completed 时就没有 id。
          ...(action.messageId !== null && { serverId: action.messageId }),
        })),
      }

    case 'stream-error':
      // 契约 b：保留已产出的部分内容，错误挂在这条消息上。
      return {
        ...state,
        status: 'idle',
        messages: patchLastAssistant(state.messages, (m) => ({
          ...m,
          content: action.partial,
          state: 'failed',
          error: action.error,
          ...(action.messageId !== null && { serverId: action.messageId }),
        })),
      }

    case 'aborted':
      // 契约 c：保留已产出的部分内容。
      return {
        ...state,
        status: 'idle',
        messages: patchLastAssistant(state.messages, (m) => ({
          ...m,
          content: action.partial,
          state: 'cancelled',
        })),
      }

    case 'turn-failed':
      // 流还没开始就失败了，没有任何助手内容可留 —— 把占位移除，错误提到会话级别。
      return {
        ...state,
        status: 'idle',
        error: action.error,
        messages: state.messages.filter((m) => !m.key.startsWith('local-assistant-') || m.content),
      }

    case 'retry-begin':
      // 重试：去掉上一轮失败的助手消息，重新插一个占位。
      return {
        ...state,
        error: null,
        messages: [
          ...state.messages.filter((m) => m.state !== 'failed' || m.role !== 'assistant'),
          {
            key: `local-assistant-retry-${Date.now()}`,
            role: 'assistant',
            contentType: 'markdown',
            content: '',
            state: 'streaming',
          },
        ],
      }

    default:
      return state
  }
}
