import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ConversationSummary } from '@/api/types'
import { Sidebar } from '@/components/layout/Sidebar'

function conversation(patch: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c1',
    title: '用户 123456 为什么不能提现？',
    status: 'active',
    created_at: '2026-09-22T10:00:00Z',
    updated_at: '2026-09-22T10:00:00Z',
    ...patch,
  }
}

function props(patch: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return {
    user: { displayName: 'dev', userId: '10001' },
    conversations: [conversation()],
    activeId: null,
    isLoading: false,
    isError: false,
    open: false,
    onNewConversation: vi.fn(),
    onSelect: vi.fn(),
    ...patch,
  }
}

describe('Sidebar 历史会话', () => {
  it('title 为 null 时回退到「未命名会话」—— 标题要等首条消息落库才生成', () => {
    render(<Sidebar {...props({ conversations: [conversation({ title: null })] })} />)
    expect(screen.getByText('未命名会话')).toBeInTheDocument()
  })

  it('当前会话标为 aria-current，其余不标', () => {
    render(
      <Sidebar
        {...props({
          conversations: [conversation({ id: 'c1' }), conversation({ id: 'c2', title: '另一个' })],
          activeId: 'c2',
        })}
      />,
    )

    expect(screen.getByRole('button', { name: /另一个/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /不能提现/ })).not.toHaveAttribute('aria-current')
  })

  it('点击会话把 id 交给调用方，自己不做导航', async () => {
    const onSelect = vi.fn()
    render(<Sidebar {...props({ onSelect })} />)

    await userEvent.click(screen.getByRole('button', { name: /不能提现/ }))
    expect(onSelect).toHaveBeenCalledWith('c1')
  })

  it('列表为空时给一句说明，而不是留一片空白', () => {
    render(<Sidebar {...props({ conversations: [] })} />)
    expect(screen.getByText('还没有会话')).toBeInTheDocument()
  })

  it('取数失败只显示一行小字 —— 侧边栏挂了不该影响主对话', () => {
    render(<Sidebar {...props({ conversations: [], isError: true })} />)
    expect(screen.getByText('加载失败')).toBeInTheDocument()
  })
})

describe('Sidebar 用户信息', () => {
  it('显示真实的 displayName 和 userId，不编造角色', () => {
    render(<Sidebar {...props({ user: { displayName: 'Alex Xu', userId: '10001' } })} />)
    expect(screen.getByText('Alex Xu')).toBeInTheDocument()
    expect(screen.getByText('10001')).toBeInTheDocument()
  })

  it('头像缩写取各单词首字母', () => {
    render(<Sidebar {...props({ user: { displayName: 'Alex Xu', userId: '1' } })} />)
    expect(screen.getByText('AX')).toBeInTheDocument()
  })

  it('中文名取前两个字', () => {
    render(<Sidebar {...props({ user: { displayName: '徐亚历', userId: '1' } })} />)
    expect(screen.getByText('徐亚')).toBeInTheDocument()
  })
})
