import { describe, expect, it } from 'vitest'

import { AppError } from '@/api/errors'
import {
  initialSessionState,
  sessionReducer,
  type SessionState,
} from '@/features/conversation/session-reducer'

/** 走一遍「提交 → 建会话 → 开流」的前半程，返回此刻的 state。 */
function afterSubmit(): SessionState {
  let state = sessionReducer(initialSessionState, { type: 'submit', text: '你好', key: '1' })
  state = sessionReducer(state, { type: 'creating' })
  return state
}

describe('新建会话状态机（技术设计 §4.7）', () => {
  it('提交时乐观插入用户消息和助手占位', () => {
    const state = afterSubmit()
    expect(state.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(state.messages[0]?.content).toBe('你好')
    expect(state.messages[1]?.state).toBe('streaming')
    // 草稿态：会话还没落到服务端。
    expect(state.conversationId).toBeNull()
  })

  it('建会话失败后 conversationId 仍为 null，整轮可以干净重试', () => {
    const state = sessionReducer(afterSubmit(), {
      type: 'turn-failed',
      error: new AppError('INTERNAL', 'boom'),
    })

    expect(state.conversationId).toBeNull()
    expect(state.status).toBe('idle')
    expect(state.error).toBeInstanceOf(AppError)
    // 没有任何助手内容产出，占位应当被移除，不留一个空气泡。
    expect(state.messages.map((m) => m.role)).toEqual(['user'])
    // 原文保留，供重试使用。
    expect(state.lastInput).toBe('你好')
  })

  it('会话建成后即使发消息失败，conversationId 也保留 —— 重试不会再建一个会话', () => {
    let state = sessionReducer(afterSubmit(), {
      type: 'conversation-created',
      conversationId: 'c1',
    })
    state = sessionReducer(state, { type: 'turn-failed', error: new AppError('TIMEOUT', 'x') })

    expect(state.conversationId).toBe('c1')
  })

  it('completed 以服务端终稿为准，而不是本地累积的 delta', () => {
    let state = sessionReducer(afterSubmit(), { type: 'streaming' })
    state = sessionReducer(state, { type: 'delta', text: '（ec' })
    state = sessionReducer(state, { type: 'delta', text: 'ho）' })
    state = sessionReducer(state, { type: 'completed', messageId: 'm1', content: '（echo）你好' })

    const assistant = state.messages.at(-1)
    expect(assistant?.content).toBe('（echo）你好')
    expect(assistant?.state).toBe('done')
    expect(state.status).toBe('idle')
  })

  it('completed 把服务端 messageId 记进 serverId —— 反馈接口要用它', () => {
    let state = sessionReducer(afterSubmit(), { type: 'streaming' })
    state = sessionReducer(state, { type: 'completed', messageId: 'm-42', content: '好' })

    expect(state.messages.at(-1)?.serverId).toBe('m-42')
    // key 不能被改写成服务端 id：改了 React 会把这条消息的子树卸载重建。
    expect(state.messages.at(-1)?.key).toBe('local-assistant-1')
  })

  it('messageId 为 null 时不写 serverId —— 宁可不给反馈入口，也不能 POST 一个 undefined id', () => {
    let state = sessionReducer(afterSubmit(), { type: 'streaming' })
    state = sessionReducer(state, { type: 'completed', messageId: null, content: '好' })

    expect(state.messages.at(-1)?.serverId).toBeUndefined()
  })

  it('契约 b：流内失败保留已产出内容，错误挂在该条消息上', () => {
    let state = sessionReducer(afterSubmit(), { type: 'streaming' })
    state = sessionReducer(state, { type: 'delta', text: '已经输出的' })
    state = sessionReducer(state, {
      type: 'stream-error',
      messageId: 'm1',
      partial: '已经输出的',
      error: new AppError('INTERNAL', 'internal error'),
    })

    const assistant = state.messages.at(-1)
    expect(assistant?.content).toBe('已经输出的')
    expect(assistant?.state).toBe('failed')
    expect(assistant?.error).toBeInstanceOf(AppError)
  })

  it('契约 c：取消保留已产出内容', () => {
    let state = sessionReducer(afterSubmit(), { type: 'streaming' })
    state = sessionReducer(state, { type: 'delta', text: '一半' })
    state = sessionReducer(state, { type: 'aborted', partial: '一半' })

    const assistant = state.messages.at(-1)
    expect(assistant?.content).toBe('一半')
    expect(assistant?.state).toBe('cancelled')
  })

  it('重试会丢掉上一轮失败的助手消息，重新插占位', () => {
    let state = sessionReducer(afterSubmit(), { type: 'streaming' })
    state = sessionReducer(state, {
      type: 'stream-error',
      messageId: null,
      partial: 'x',
      error: new AppError('INTERNAL', 'x'),
    })
    state = sessionReducer(state, { type: 'retry-begin' })

    const assistants = state.messages.filter((m) => m.role === 'assistant')
    expect(assistants).toHaveLength(1)
    expect(assistants[0]?.state).toBe('streaming')
    expect(state.error).toBeNull()
  })

  it('新建会话只清本地状态', () => {
    const state = sessionReducer(afterSubmit(), { type: 'start-new' })
    expect(state).toEqual(initialSessionState)
  })

  it('载入历史会话时把服务端的 pending 标成已停止，而不是永远转圈', () => {
    const state = sessionReducer(initialSessionState, {
      type: 'hydrate',
      conversationId: 'c1',
      messages: [
        {
          key: 'm1',
          role: 'assistant',
          contentType: 'markdown',
          content: '半句',
          state: 'cancelled',
        },
      ],
    })

    expect(state.hydratedId).toBe('c1')
    expect(state.messages[0]?.state).toBe('cancelled')
  })
})

/**
 * 回归：点「新建会话」之后，清状态和 navigate('/chat') 不在同一次渲染里落地。
 * 中间那一拍 URL 还指着旧会话、hydratedId 已经是 null，路由页会把它读成
 * 「这个会话还没加载」，立刻从 query 缓存里把刚清掉的消息又灌回来。
 */
describe('start-new 记下被放弃的会话，避免路由没跟上时被重新 hydrate', () => {
  it('start-new 把当前会话 id 记进 abandonedId', () => {
    let state = sessionReducer(initialSessionState, {
      type: 'conversation-created',
      conversationId: 'c1',
    })
    state = sessionReducer(state, { type: 'start-new' })

    expect(state.messages).toHaveLength(0)
    expect(state.conversationId).toBeNull()
    expect(state.abandonedId).toBe('c1')
  })

  it('route-changed 清掉它 —— 否则从侧边栏再点回这个会话就永远加载不出来', () => {
    let state = sessionReducer(initialSessionState, {
      type: 'conversation-created',
      conversationId: 'c1',
    })
    state = sessionReducer(state, { type: 'start-new' })
    state = sessionReducer(state, { type: 'route-changed' })

    expect(state.abandonedId).toBeNull()
  })

  it('没有要清的东西时 route-changed 返回原对象，不触发多余渲染', () => {
    const state = sessionReducer(initialSessionState, { type: 'route-changed' })
    expect(state).toBe(initialSessionState)
  })

  it('hydrate 之后 abandonedId 不残留', () => {
    let state = sessionReducer(initialSessionState, {
      type: 'conversation-created',
      conversationId: 'c1',
    })
    state = sessionReducer(state, { type: 'start-new' })
    state = sessionReducer(state, { type: 'hydrate', conversationId: 'c1', messages: [] })

    expect(state.abandonedId).toBeNull()
  })
})
