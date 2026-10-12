import { useState } from 'react'

import { CONTENT_COLUMN } from '@/components/copilot/content-width'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/cn'
import { MAX_MESSAGE_LENGTH } from '@/lib/config'

/**
 * 输入框。
 *
 * 长度上限与后端的 max_length=4000 对齐（app/api/schemas.py），本地先挡住，
 * 不浪费一次往返 —— 技术设计 §17.1 把输入长度上限列为第一道输入边界。
 *
 * **只负责卡片本身，不负责自己在页面里的位置。** 空态页它跟着标题和描述居中，
 * 对话页它贴在消息列表下面，背景和边框也不一样 —— 那一层由 ChatRoute 提供。
 * 设计稿也是这么分的：两个页面覆盖的都是外层（.composer-wrap），卡片内部一行没动，
 * 而且免责声明是外层的兄弟节点、不在卡片里。所以这里不需要 variant 之类的开关。
 */
export function Composer({
  disabled,
  streaming,
  onSend,
  onStop,
}: {
  disabled: boolean
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')

  const trimmed = text.trim()
  const tooLong = trimmed.length > MAX_MESSAGE_LENGTH
  const canSend = !disabled && trimmed.length > 0 && !tooLong

  const submit = () => {
    if (!canSend) return
    onSend(trimmed)
    setText('')
  }

  // pt / pb 刻意不对称：pt 是和上方内容（消息列表 / 空态文案）的间距，
  // pb 是和下面那行免责声明的间距 —— 后者只是一句小字，不需要和正文一样的留白。
  return (
    <div className={cn(CONTENT_COLUMN, 'pt-4 pb-2')}>
      {/* 聚焦光晕 2px 而不是 shadcn 惯用的 3px：输入框是整页最大的一块，
            同样的环宽在按钮上是点缀，在这里就成了一圈很重的边。 */}
      <div className="border-border shadow-card focus-within:ring-ring/30 rounded-lg border focus-within:ring-2">
        <Textarea
          value={text}
          rows={3}
          // 占位文字比 --muted-foreground 更浅、偏冷一档：它只是个例子，不该和
          // 真正输入的内容抢注意力。
          className="placeholder:text-[#9ca3af]"
          placeholder="用日常业务语言提问，例如：用户 123456 最近 30 天的入金记录"
          aria-label="消息输入框"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter 发送，Shift+Enter 换行。中文输入法组字期间不能发送。
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />

        <div className="flex items-center justify-between gap-3 px-3 pb-2">
          <span className="text-muted-foreground text-xs">
            {tooLong ? (
              <span className="text-destructive">
                超出 {MAX_MESSAGE_LENGTH} 字上限（当前 {trimmed.length}）
              </span>
            ) : (
              'Enter 发送，Shift + Enter 换行'
            )}
          </span>

          {streaming ? (
            <Button variant="outline" size="sm" onClick={onStop}>
              停止
            </Button>
          ) : (
            <Button size="sm" disabled={!canSend} onClick={submit}>
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
