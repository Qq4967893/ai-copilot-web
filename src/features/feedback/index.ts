import { useMutation } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { submitFeedback } from '@/api/feedback'
import type { FeedbackRating } from '@/api/types'

/**
 * 回答反馈（PRD §7.3 的 P1）。
 *
 * 一处仍然存在的接口落差：PRD §10.9.2 要求提供 7 个可选反馈原因（数据不正确 /
 * 规则不正确 / 没有回答问题 / 找不到对应后台 / 结果不完整 / 表达难理解 / 其他），
 * 而后端当前只有 rating + 自由文本 comment。**本轮只做 rating**，不做原因选择 ——
 * 要做的话得先定：把原因塞进 comment，还是改接口。
 * PRD §10.9.3 的「反馈不打断正常使用」也要留到那时一起解决：原因选择必须用
 * popover / sheet，不能用挡住对话的 modal。
 *
 * 后端是 upsert：同一条消息重复提交会覆盖，不会 409，所以点赞/点踩可以自由切换。
 *
 * **没有读取路径。** MessageOut 里没有 feedback 字段，所以下面这份 rating 只活在
 * 内存里，刷新页面或切走再切回来（hydrate）就没了。MVP 可以接受，但别误以为
 * 它是持久状态。也因此提交后不需要失效任何 query —— 没有任何地方读它。
 */
export function useMessageFeedback() {
  const [ratings, setRatings] = useState<Record<string, FeedbackRating>>({})

  const mutation = useMutation({
    mutationFn: ({ messageId, rating }: { messageId: string; rating: FeedbackRating }) =>
      submitFeedback(messageId, rating),
  })

  const rate = useCallback(
    (messageId: string, rating: FeedbackRating) => {
      const previous = ratings[messageId]
      // 乐观更新：反馈是个轻动作，等一次往返再亮起来会显得很迟钝。
      setRatings((current) => ({ ...current, [messageId]: rating }))

      mutation.mutate(
        { messageId, rating },
        {
          onError: () => {
            // 失败就回到之前的状态，而不是留一个「看起来提交成功了」的假象。
            setRatings((current) => {
              const next = { ...current }
              if (previous === undefined) delete next[messageId]
              else next[messageId] = previous
              return next
            })
          },
        },
      )
    },
    [mutation, ratings],
  )

  return {
    ratings,
    rate,
    /** 成功提交过至少一次 —— 用来决定要不要弹 toast。 */
    isSuccess: mutation.isSuccess,
  }
}
