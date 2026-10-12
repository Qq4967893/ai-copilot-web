import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AnswerActions } from '@/components/copilot/message/AnswerActions'
import { MessageBubble } from '@/components/copilot/message/MessageBubble'
import type { ChatMessage } from '@/lib/chat'

function message(patch: Partial<ChatMessage>): ChatMessage {
  return {
    key: 'k1',
    role: 'assistant',
    contentType: 'markdown',
    content: '答案',
    state: 'done',
    ...patch,
  }
}

describe('AnswerActions', () => {
  it('点赞把 rating 交给调用方', async () => {
    const onRate = vi.fn()
    render(<AnswerActions onCopy={vi.fn()} rating={null} onRate={onRate} />)

    await userEvent.click(screen.getByRole('button', { name: '有帮助' }))
    expect(onRate).toHaveBeenCalledWith('helpful')
  })

  it('当前评分用 aria-pressed 表达，赞踩可以来回切（后端是 upsert）', () => {
    render(<AnswerActions onCopy={vi.fn()} rating="not_helpful" onRate={vi.fn()} />)

    expect(screen.getByRole('button', { name: '无帮助' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '有帮助' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('没有 onRate 时只剩复制 —— 没有服务端 id 就不该给打分入口', () => {
    render(<AnswerActions onCopy={vi.fn()} rating={null} />)

    expect(screen.getByRole('button', { name: '复制回答' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '有帮助' })).toBeNull()
  })
})

describe('MessageBubble 上的操作条出现条件', () => {
  it('回答完成且有 serverId 时给完整操作条', () => {
    render(
      <MessageBubble
        message={message({ serverId: 'm1' })}
        onCopy={vi.fn()}
        onRate={vi.fn()}
        rating={null}
      />,
    )
    expect(screen.getByRole('button', { name: '有帮助' })).toBeInTheDocument()
  })

  it('没有 serverId 时只能复制，不会 POST 一个 undefined id', () => {
    render(<MessageBubble message={message({})} onCopy={vi.fn()} onRate={vi.fn()} rating={null} />)

    expect(screen.getByRole('button', { name: '复制回答' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '有帮助' })).toBeNull()
  })

  it('被取消的回答不给操作条 —— 给半截答案打分是噪音', () => {
    render(
      <MessageBubble
        message={message({ state: 'cancelled', serverId: 'm1' })}
        onCopy={vi.fn()}
        onRate={vi.fn()}
        rating={null}
      />,
    )
    expect(screen.queryByRole('button', { name: '复制回答' })).toBeNull()
  })

  it('用户消息从不出现操作条', () => {
    render(
      <MessageBubble
        message={message({ role: 'user', contentType: 'text', serverId: 'm1' })}
        onCopy={vi.fn()}
        onRate={vi.fn()}
        rating={null}
      />,
    )
    expect(screen.queryByRole('button', { name: '复制回答' })).toBeNull()
  })

  it('复制拿到的是这条消息本身', async () => {
    const onCopy = vi.fn()
    render(
      <MessageBubble
        message={message({ serverId: 'm1', content: '要复制的答案' })}
        onCopy={onCopy}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '复制回答' }))
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ content: '要复制的答案' }))
  })
})
