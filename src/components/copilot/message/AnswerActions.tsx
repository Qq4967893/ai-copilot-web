import { Copy, ThumbsDown, ThumbsUp } from 'lucide-react'

import type { FeedbackRating } from '@/api/types'
import { cn } from '@/lib/cn'

/**
 * 助手回答下面那一排操作：复制 / 有帮助 / 无帮助（设计稿的 .answer-actions）。
 *
 * 纯展示。反馈的提交在 features/feedback，复制在调用方 —— 这里只发事件。
 */

function IconAction({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-[27px] place-items-center rounded-md p-1 transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        active
          ? 'bg-[#f3f5f7] text-[#4f5661]'
          : 'text-[#8d9199] hover:bg-[#f3f5f7] hover:text-[#4f5661]',
      )}
    >
      {children}
    </button>
  )
}

export function AnswerActions({
  onCopy,
  rating,
  onRate,
  disabled,
}: {
  onCopy: () => void
  /** 本地态。服务端没有读取路径（MessageOut 没有 feedback 字段），刷新后会丢。 */
  rating: FeedbackRating | null
  /** 省略表示这条消息没有服务端 id，只能复制、不能打分。 */
  onRate?: (rating: FeedbackRating) => void
  disabled?: boolean
}) {
  return (
    <div role="group" aria-label="回答操作" className="mt-3.5 flex items-center gap-[5px]">
      <IconAction label="复制回答" onClick={onCopy}>
        {/* 存档里是 17px / stroke-width 1.8 的线性图标，lucide 的默认组正好对得上 */}
        <Copy size={17} strokeWidth={1.8} aria-hidden />
      </IconAction>

      {onRate && (
        <>
          <IconAction
            label="有帮助"
            active={rating === 'helpful'}
            disabled={disabled}
            onClick={() => onRate('helpful')}
          >
            <ThumbsUp size={17} strokeWidth={1.8} aria-hidden />
          </IconAction>
          <IconAction
            label="无帮助"
            active={rating === 'not_helpful'}
            disabled={disabled}
            onClick={() => onRate('not_helpful')}
          >
            <ThumbsDown size={17} strokeWidth={1.8} aria-hidden />
          </IconAction>
        </>
      )}
    </div>
  )
}
