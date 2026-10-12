import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MarkdownContent } from '@/components/copilot/message/MarkdownContent'
import { MessageBubble } from '@/components/copilot/message/MessageBubble'
import type { ChatMessage } from '@/lib/chat'

function message(patch: Partial<ChatMessage>): ChatMessage {
  return {
    key: 'k1',
    role: 'assistant',
    contentType: 'markdown',
    content: '',
    state: 'done',
    ...patch,
  }
}

/**
 * 这一组把内容真正渲染进 DOM 再检查，和 markdown.test.ts 的纯函数测试互补。
 * 技术设计 §24.1 把 XSS 列为 Web 的重点测试项。
 */
describe('MarkdownContent XSS 防护', () => {
  it('原始 script 标签不会变成元素', () => {
    const { container } = render(
      <MarkdownContent content="正常文字 <script>alert(1)</script> 后面" />,
    )
    expect(container.querySelector('script')).toBeNull()
  })

  it('img onerror 不会变成元素', () => {
    const { container } = render(<MarkdownContent content="<img src=x onerror=alert(1)>" />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('markdown 图片语法也不渲染 img（§4.4 没列图片）', () => {
    const { container } = render(<MarkdownContent content="![alt](https://example.com/a.png)" />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('javascript: 链接被剥掉 href，退化成纯文本', () => {
    render(<MarkdownContent content="[点我](javascript:alert(1))" />)
    const node = screen.getByText('点我')
    expect(node.closest('a')).toBeNull()
  })

  it('正常 https 链接保留，并带 noopener noreferrer', () => {
    render(<MarkdownContent content="[后台](https://admin.example.com/users/1)" />)
    const link = screen.getByRole('link', { name: '后台' })
    expect(link).toHaveAttribute('href', 'https://admin.example.com/users/1')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('GFM 表格能渲染，并套了横向滚动容器防止撑破布局', () => {
    const table = ['| 字段 | 值 |', '| --- | --- |', '| 余额 | 200 |'].join('\n')
    const { container } = render(<MarkdownContent content={table} />)

    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull()
    expect(screen.getByText('余额')).toBeInTheDocument()
  })

  it('行内代码里的尖括号是字面量，不产生元素', () => {
    const { container } = render(<MarkdownContent content="`<b>inline</b>`" />)
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('<b>inline</b>')).toBeInTheDocument()
  })
})

describe('MessageBubble 按 content_type 分派渲染', () => {
  it('content_type=text 时当纯文本，尖括号不解释成标签', () => {
    const { container } = render(
      <MessageBubble
        message={message({ role: 'user', contentType: 'text', content: '<b>hi</b>' })}
      />,
    )
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('<b>hi</b>')).toBeInTheDocument()
  })

  it('content_type=markdown 时走受限渲染', () => {
    const { container } = render(
      <MessageBubble message={message({ contentType: 'markdown', content: '**粗体**' })} />,
    )
    expect(container.querySelector('strong')).not.toBeNull()
  })

  it('取消态给出「已停止」说明，并保留已生成内容', () => {
    render(<MessageBubble message={message({ state: 'cancelled', content: '一半的回答' })} />)
    expect(screen.getByText('一半的回答')).toBeInTheDocument()
    expect(screen.getByText(/已停止/)).toBeInTheDocument()
  })

  it('流式且还没有内容时显示处理中提示', () => {
    render(<MessageBubble message={message({ state: 'streaming', content: '' })} />)
    expect(screen.getByText('正在处理…')).toBeInTheDocument()
  })
})

describe('MessageBubble 流内失败的重试入口', () => {
  it('失败且可重试时展示重试按钮，点击触发回调', async () => {
    const onRetry = vi.fn()
    render(
      <MessageBubble
        message={message({ state: 'failed', content: '一半的回答', error: new Error('x') })}
        onRetry={onRetry}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('没有传 onRetry 时不出现按钮 —— 历史消息的 failed 态没有可重发的输入', () => {
    render(<MessageBubble message={message({ state: 'failed', content: '一半的回答' })} />)
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })
})
