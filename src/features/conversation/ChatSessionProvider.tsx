import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useReducer, useRef } from 'react'

import { createConversation } from '@/api/conversations'
import { AppError, isAbortError } from '@/api/errors'
import { queryKeys } from '@/api/query-keys'
import { streamMessage } from '@/api/sse'
import { MAX_MESSAGE_LENGTH } from '@/lib/config'

import { ChatSessionContext, type ChatSessionValue } from './chat-session-context'
import { initialSessionState, sessionReducer } from './session-reducer'
import { toChatMessage } from '@/lib/chat'
import type { ConversationDetail } from '@/api/types'

/**
 * 一次 Copilot 会话的状态与动作。
 *
 * **为什么挂在布局层而不是路由页**：首次发消息时会 navigate 到 /chat/{id}，如果状态
 * 住在路由组件里，这次导航会把正在进行的流连根拆掉。挂在 AppLayout（<Outlet/> 的
 * 外面）就不会随子路由切换而卸载。
 *
 * 这也是文档里一处需要判断的地方：技术设计 §4.5 说 Zustand 只在确有跨页面客户端状态
 * 时才引入。这里确实是跨路由状态，但只有一棵消费树，用 context 更小，所以不引 Zustand。
 */

export function ChatSessionProvider({
  children,
  onConversationCreated,
}: {
  children: React.ReactNode
  /** 会话在服务端建好后回调，交给路由层把 URL 换成 /chat/{id}。 */
  onConversationCreated?: (conversationId: string) => void
}) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState)
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)
  const keyRef = useRef(0)

  /**
   * 「这一轮还算数吗」的代际号。startNew 会让它 +1，作废所有在飞的异步。
   *
   * 光靠 abortRef 兜不住 createConversation：那个请求没有接 AbortSignal（后端也没有
   * 取消语义 —— 会话已经建出来了），所以「新建会话」期间它还会照常解析成功。少了这个
   * 计数器，在 status='creating' 时按「新建会话」或 ⌘K，会被随后解析的 createConversation
   * 拽回那个刚刚放弃的会话，runStream 还会继续往已经清空的状态里灌 delta。
   */
  const generationRef = useRef(0)

  /**
   * 流式跑一轮。会话此时一定已经存在。
   *
   * 失效时机是有讲究的（已对照 ai-copilot-api 的 app/api/messages.py 确认）：
   * - completed / stream-error：服务端在发出这一帧**之前**已经 await 完落库，
   *   这时失效不会读到中间状态。
   * - aborted：取消路径的落库是一个游离的 asyncio task，fire-and-forget。这时失效
   *   很可能读到仍是 pending、content 为空的助手消息，把屏幕上的内容冲掉。所以
   *   **取消后不失效**。
   */
  const runStream = useCallback(
    async (conversationId: string, text: string) => {
      dispatch({ type: 'streaming' })

      const controller = new AbortController()
      abortRef.current = controller

      const invalidate = () => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId),
        })
        // 标题是在首条消息落库时才生成的，所以列表也要跟着刷新。
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all })
      }

      try {
        const outcome = await streamMessage({
          conversationId,
          content: text,
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'message.delta') {
              dispatch({ type: 'delta', text: event.data.text })
            }
          },
        })

        switch (outcome.kind) {
          case 'completed':
            dispatch({ type: 'completed', messageId: outcome.messageId, content: outcome.content })
            invalidate()
            break
          case 'stream-error':
            dispatch({
              type: 'stream-error',
              messageId: outcome.messageId,
              partial: outcome.partial,
              error: outcome.error,
            })
            invalidate()
            break
          case 'aborted':
            dispatch({ type: 'aborted', partial: outcome.partial })
            break
        }
      } catch (cause) {
        // 契约 a：流开始前的 HTTP 错误。此时服务端什么都没落库。
        // conversationId 保留在 state 里，重试只会重发消息、不会再建会话。
        if (isAbortError(cause)) {
          dispatch({ type: 'aborted', partial: '' })
          return
        }
        dispatch({
          type: 'turn-failed',
          error: cause instanceof AppError ? cause : new AppError('UNKNOWN', '发送失败'),
        })
      } finally {
        abortRef.current = null
      }
    },
    [queryClient],
  )

  /** 建会话（如果还没有）然后跑流。 */
  const beginTurn = useCallback(
    async (text: string) => {
      const generation = generationRef.current
      let conversationId = state.conversationId

      if (conversationId === null) {
        dispatch({ type: 'creating' })
        try {
          // 传空对象：后端会用首条消息的前 60 字生成标题。注意 body 是必填的。
          const created = await createConversation()
          // 等待期间用户可能已经点了「新建会话」。此时这个会话在服务端是建出来了
          // （空会话，没有消息），但绝不能再导航过去、更不能往它里面发消息。
          if (generation !== generationRef.current) return
          conversationId = created.id
          dispatch({ type: 'conversation-created', conversationId })
          onConversationCreated?.(conversationId)
        } catch (cause) {
          // 建会话失败：服务端什么都没留下，整轮可以干净重试。
          dispatch({
            type: 'turn-failed',
            error: cause instanceof AppError ? cause : new AppError('UNKNOWN', '创建会话失败'),
          })
          return
        }
      }

      if (generation !== generationRef.current) return
      await runStream(conversationId, text)
    },
    [onConversationCreated, runStream, state.conversationId],
  )

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      // 与后端的 min_length=1 / max_length=4000 对齐，本地先挡住，不浪费一次往返。
      if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return
      if (state.status !== 'idle') return

      keyRef.current += 1
      dispatch({ type: 'submit', text: trimmed, key: String(keyRef.current) })
      void beginTurn(trimmed)
    },
    [beginTurn, state.status],
  )

  const retry = useCallback(() => {
    if (state.status !== 'idle') return
    const text = state.lastInput
    if (!text) return

    dispatch({ type: 'retry-begin' })
    void beginTurn(text)
  }, [beginTurn, state.lastInput, state.status])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const startNew = useCallback(() => {
    abortRef.current?.abort()
    // 作废在飞的 createConversation —— 它没有 AbortSignal，只能靠代际号拦。
    generationRef.current += 1
    dispatch({ type: 'start-new' })
  }, [])

  const noteRouteChange = useCallback(() => {
    dispatch({ type: 'route-changed' })
  }, [])

  const hydrate = useCallback((detail: ConversationDetail) => {
    dispatch({
      type: 'hydrate',
      conversationId: detail.id,
      messages: detail.messages.map(toChatMessage),
    })
  }, [])

  const value = useMemo<ChatSessionValue>(
    () => ({
      ...state,
      canSend: state.status === 'idle',
      send,
      stop,
      retry,
      startNew,
      hydrate,
      noteRouteChange,
    }),
    [hydrate, noteRouteChange, retry, send, startNew, state, stop],
  )

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
}
