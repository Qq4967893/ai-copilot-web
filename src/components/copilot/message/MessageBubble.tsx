import type { FeedbackRating } from '@/api/types'
import type { ChatMessage } from '@/lib/chat'

import { AnswerActions } from '@/components/copilot/message/AnswerActions'
import { ErrorNotice } from '@/components/copilot/ErrorNotice'
import { MarkdownContent } from '@/components/copilot/message/MarkdownContent'

/**
 * 一条消息。
 *
 * 设计稿里两种 role 的外观是结构性不同的：用户是右对齐的胶囊气泡，助手**没有卡片**、
 * 就是一段正文排版。但这条不变量不能因此被削弱 ——
 *
 *   **role 决定外观，content_type 决定渲染方式。不要把这两个分支合并。**
 *
 * 后端给用户消息打 text、给助手消息打 markdown（app/conversation/service.py）。
 * 今天两者等价，但一旦有工具回显用户输入，按 role 判断渲染方式就会把用户内容当
 * Markdown 渲染 —— 那是一条 XSS 路径。所以渲染方式统一走下面的 MessageContent，
 * 两种外框共用同一份。
 */

/**
 * 消息正文与三种非正常态。两种 role 共用。
 *
 * @param onRetry 流内失败（契约 b）的重试回调。由调用方决定是否可重试 ——
 * 历史消息里也可能有 failed 态（服务端 status=failed），那些没有可重发的输入。
 */
function MessageContent({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  return (
    <>
      {/* 按 content_type 分派，**不是**按 role。见上面的注释。 */}
      {message.contentType === 'markdown' ? (
        <MarkdownContent content={message.content} />
      ) : (
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
      )}

      {message.state === 'streaming' && !message.content && (
        <p className="text-muted-foreground text-sm">正在处理…</p>
      )}

      {message.state === 'cancelled' && (
        <p className="text-muted-foreground mt-2 text-xs">已停止，以上是已生成的部分。</p>
      )}

      {message.state === 'failed' && (
        <ErrorNotice error={message.error} className="mt-2" onRetry={onRetry} />
      )}
    </>
  )
}

export function MessageBubble({
  message,
  onRetry,
  onCopy,
  rating,
  onRate,
}: {
  message: ChatMessage
  onRetry?: () => void
  /** 省略则不显示操作条（例如还在流式中）。 */
  onCopy?: (message: ChatMessage) => void
  rating?: FeedbackRating | null
  onRate?: (messageId: string, rating: FeedbackRating) => void
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        {/* 设计稿是 border-radius:999px。长问题换行后会变成圆角矩形，这是设计稿本身的取值。 */}
        <div className="max-w-[65%] rounded-full bg-[#eef3fd] px-[18px] py-[11px] text-[#161b24]">
          <MessageContent message={message} onRetry={onRetry} />
        </div>
      </div>
    )
  }

  const serverId = message.serverId

  return (
    <div className="text-sm leading-[1.8]">
      <MessageContent message={message} onRetry={onRetry} />

      {/* 只在回答完整产出后给操作条。被取消或失败的回答打分是噪音。 */}
      {message.state === 'done' && onCopy && (
        <AnswerActions
          onCopy={() => onCopy(message)}
          rating={rating ?? null}
          // 没有服务端 id 就只能复制 —— 反馈接口打的是 /messages/{id}/feedback。
          onRate={serverId && onRate ? (value) => onRate(serverId, value) : undefined}
        />
      )}
    </div>
  )
}
