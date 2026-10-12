import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import type { FeedbackRating } from '@/api/types'
import { ErrorNotice } from '@/components/copilot/ErrorNotice'
import { CONTENT_COLUMN } from '@/components/copilot/content-width'
import { Composer } from '@/components/copilot/composer/Composer'
import { MessageList } from '@/components/copilot/message/MessageList'
import { Toast } from '@/components/ui/toast'
import { useChatSession, useConversationDetail } from '@/features/conversation'
import { useMessageFeedback } from '@/features/feedback'
import type { ChatMessage } from '@/lib/chat'

/**
 * 对话页。
 *
 * PAGE-001（首页空态）和 PAGE-002（对话页）是同一个路由的两种状态，不是两个页面 ——
 * 技术设计 §4.7 要求新建会话只是清空本地状态，所以「首页」本质上就是消息为空的对话页。
 *
 * 两种状态的输入框位置不同：空态跟着标题和描述一起居中，对话页跟在消息列表下面。
 * 所以 Composer 只渲染卡片本身，定位那一层由这里提供（见 Composer 的注释）。
 */
const DISCLAIMER = 'AI 回答可能存在偏差，重要操作请在后台核实。当前仅支持只读查询。'

export function ChatRoute() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const session = useChatSession()
  const feedback = useMessageFeedback()
  const [toast, setToast] = useState<string | null>(null)

  const routeId = conversationId ?? null
  // abandonedId：刚被「新建会话」放弃的会话。startNew 清状态和 navigate('/chat')
  // 不在同一次渲染里落地，中间那一拍 URL 还指着旧会话、hydratedId 已经是 null，
  // 少了这个判断就会把刚清掉的消息又从缓存里灌回来（见 session-reducer 的注释）。
  const needsHydration =
    routeId !== null && routeId !== session.hydratedId && routeId !== session.abandonedId
  const isStreaming = session.status !== 'idle'

  const detail = useConversationDetail(needsHydration ? routeId : null, isStreaming)

  useEffect(() => {
    if (needsHydration && detail.data) {
      session.hydrate(detail.data)
    }
    // session 每次渲染都是新对象，放进依赖会导致无限循环；这里只关心数据到位的时刻。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data, needsHydration])

  // 流是跨路由存活的（provider 挂在布局层）。URL 切到另一个会话时必须停掉进行中的
  // 流：它还在往旧会话里写，status 一回到 idle，用户就可能趁 hydrate 未落地时把
  // 消息发进旧会话；随后 hydrate 把乐观消息冲掉，后续 delta 落到新会话的历史消息
  // 上，界面永久错位。首次发消息的 /chat → /chat/{id} 导航不受影响：触发导航时
  // conversationId 已经和 routeId 一致。
  const prevRouteIdRef = useRef(routeId)
  useEffect(() => {
    const prev = prevRouteIdRef.current
    if (prev === routeId) return
    prevRouteIdRef.current = routeId

    // URL 真的换了，startNew 留下的 hydrate 抑制到此为止 —— 否则从侧边栏再点回
    // 刚放弃的那个会话会永远加载不出来。
    session.noteRouteChange()

    if (routeId !== null && routeId !== session.conversationId) {
      session.stop()
    }
  }, [routeId, session])

  // hydrate 未落地前输入框必须禁用：此时 state 还是上一个会话的，发送（或重试）
  // 会写进错误的会话。查询失败同样禁用 —— 看着错误提示比悄悄写错会话好。
  const hydrating = needsHydration && (detail.isPending || detail.isError)
  const canRetryTurn = session.status === 'idle' && session.lastInput !== null && !hydrating

  const isEmpty = session.messages.length === 0

  const copyAnswer = (message: ChatMessage) => {
    void navigator.clipboard
      ?.writeText(message.content)
      .then(() => setToast('已复制'))
      // 复制失败不值得弹错误框（多半是没有剪贴板权限），但也不能假装成功。
      .catch(() => setToast('复制失败，请手动选中'))
  }

  const rateAnswer = (messageId: string, rating: FeedbackRating) => {
    feedback.rate(messageId, rating)
    setToast('已记录反馈，感谢你的帮助')
  }

  const composer = (
    <Composer
      disabled={!session.canSend || hydrating}
      streaming={session.status === 'streaming'}
      onSend={session.send}
      onStop={session.stop}
    />
  )

  return (
    <>
      {isEmpty ? (
        // 整组（标题 / 描述 / 输入框）在视口里略高于正中 —— pb 把居中区域收窄。
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[10vh] text-center">
          <h1 className="text-xl font-medium">有什么可以帮你查的？</h1>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm">
            可以问业务数据、字段和状态的含义、业务规则，或者某个功能在后台的哪个位置。
          </p>

          <div className="mt-5 w-full text-left">{composer}</div>

          <div className={CONTENT_COLUMN}>
            {session.error && (
              <ErrorNotice error={session.error} className="mb-2" onRetry={session.retry} />
            )}
          </div>
        </div>
      ) : (
        <MessageList
          messages={session.messages}
          onRetry={canRetryTurn ? session.retry : undefined}
          onCopy={copyAnswer}
          ratings={feedback.ratings}
          onRate={rateAnswer}
        />
      )}

      {!isEmpty && (
        // 刻意不画上边框：设计稿两个页面都把 .composer-wrap 的 border-top 去掉了。
        <div className="bg-background">
          <div className={CONTENT_COLUMN}>
            {detail.isError && <ErrorNotice error={detail.error} className="mb-2" />}
            {session.error && (
              <ErrorNotice error={session.error} className="mb-2" onRetry={session.retry} />
            )}
          </div>

          {composer}
        </div>
      )}

      {/* 空态时上面那一坨是 flex-1，所以这行免责声明自然落在视口底部，不需要 fixed。 */}
      <p className="text-muted-foreground px-4 pb-2 text-center text-[10px] leading-4">
        {DISCLAIMER}
      </p>

      <Toast message={toast} />
    </>
  )
}
