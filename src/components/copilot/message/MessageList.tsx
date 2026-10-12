import type { FeedbackRating } from '@/api/types'
import type { ChatMessage } from '@/lib/chat'
import { useAutoScroll } from '@/hooks/useAutoScroll'

import { CONTENT_COLUMN } from '@/components/copilot/content-width'
import { MessageBubble } from '@/components/copilot/message/MessageBubble'
import { cn } from '@/lib/cn'

/**
 * 消息列表。
 *
 * 用普通的 overflow-y-auto，刻意不上 Radix ScrollArea —— 后者把可滚动节点套在一层
 * viewport div 里，流式追加时按 scrollTop 判断「用户是否在底部」会麻烦不少。
 * 也没上虚拟滚动：单会话消息量离需要虚拟化差两个数量级。
 *
 * **这一层必须是真正可滚动的节点。** useAutoScroll 把监听挂在它上面、并写它的
 * scrollTop；一旦滚动落回 document（比如把输入框改成 position:fixed 让整页滚），
 * 监听永不触发、贴底变成 no-op，流式自动滚动会**静默**失效。设计稿那份存档是
 * 整页滚 body 的静态文档，这里刻意不照抄。
 */
export function MessageList({
  messages,
  onRetry,
  onCopy,
  ratings,
  onRate,
}: {
  messages: ChatMessage[]
  /** 转发给失败消息上的重试按钮，是否可重试由调用方判断。 */
  onRetry?: () => void
  onCopy?: (message: ChatMessage) => void
  /** 服务端 messageId → 本地评分。没有读取路径，刷新后为空。 */
  ratings?: Record<string, FeedbackRating>
  onRate?: (messageId: string, rating: FeedbackRating) => void
}) {
  // 用最后一条消息的内容长度作为依赖，这样每个 delta 都会触发一次贴底。
  const scrollRef = useAutoScroll<HTMLDivElement>(
    `${messages.length}:${messages.at(-1)?.content.length ?? 0}`,
  )

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      {/* pb 给输入框留出余量，对应设计稿 .workspace 那份从容的下边距。 */}
      <div className={cn(CONTENT_COLUMN, 'space-y-7 pt-12 pb-10')}>
        {messages.map((message) => (
          <MessageBubble
            key={message.key}
            message={message}
            onRetry={onRetry}
            onCopy={onCopy}
            rating={message.serverId ? (ratings?.[message.serverId] ?? null) : null}
            onRate={onRate}
          />
        ))}
      </div>
    </div>
  )
}
