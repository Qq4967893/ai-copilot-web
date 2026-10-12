import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/api/errors'
import { parseFrames, streamMessage, type StreamOutcome } from '@/api/sse'

import { abortableSseResponse, envelopeResponse, frame, sseResponse } from './helpers/sse'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseFrames', () => {
  it('解析单个帧', () => {
    const { events, rest } = parseFrames(frame('message.delta', { text: '你好' }))
    expect(events).toEqual([{ type: 'message.delta', data: { text: '你好' } }])
    expect(rest).toBe('')
  })

  it('一次解析多个帧', () => {
    const raw =
      frame('message.started', { message_id: 'm1' }) + frame('message.delta', { text: 'a' })
    const { events } = parseFrames(raw)
    expect(events.map((e) => e.type)).toEqual(['message.started', 'message.delta'])
  })

  it('未收全的尾部帧留在 rest 里，不提前派发', () => {
    const raw = frame('message.delta', { text: 'a' }) + 'event: message.delta\ndata: {"text":"b"'
    const { events, rest } = parseFrames(raw)
    expect(events).toHaveLength(1)
    expect(rest).toContain('"text":"b"')
  })

  it('忽略注释帧（代理可能注入心跳）', () => {
    const { events } = parseFrames(`: keep-alive\n\n${frame('message.delta', { text: 'a' })}`)
    expect(events.map((e) => e.type)).toEqual(['message.delta'])
  })

  it('兼容 CRLF 换行', () => {
    const raw = frame('message.delta', { text: 'a' }).replace(/\n/g, '\r\n')
    const { events } = parseFrames(raw)
    expect(events).toEqual([{ type: 'message.delta', data: { text: 'a' } }])
  })

  it('忽略不认识的事件名，不影响后续帧', () => {
    const raw = frame('something.new', { x: 1 }) + frame('message.delta', { text: 'a' })
    const { events } = parseFrames(raw)
    expect(events.map((e) => e.type)).toEqual(['message.delta'])
  })

  it('单帧 JSON 损坏时跳过该帧而不是整条流失败', () => {
    const raw = 'event: message.delta\ndata: {坏掉的\n\n' + frame('message.delta', { text: 'a' })
    const { events } = parseFrames(raw)
    expect(events).toEqual([{ type: 'message.delta', data: { text: 'a' } }])
  })
})

describe('streamMessage', () => {
  const stub = (response: Response | ((init: RequestInit) => Response)) => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        Promise.resolve(typeof response === 'function' ? response(init) : response),
      ),
    )
  }

  const run = (signal?: AbortSignal): Promise<StreamOutcome> =>
    streamMessage({
      conversationId: 'c1',
      content: '你好',
      signal: signal ?? new AbortController().signal,
    })

  it('正常流：终态内容以 message.completed 为准，而不是本地累积', async () => {
    // 故意让 delta 的拼接结果和 completed 的 content 不同，验证用的是后者。
    stub(
      sseResponse(
        frame('message.started', { message_id: 'm1' }) +
          frame('message.delta', { text: '（echo）' }) +
          frame('message.delta', { text: '你好' }) +
          frame('message.completed', { message_id: 'm1', content: '（echo）你好' }),
      ),
    )

    const outcome = await run()
    expect(outcome).toEqual({ kind: 'completed', messageId: 'm1', content: '（echo）你好' })
  })

  it('中文被切在 chunk 边界上也不会乱码', async () => {
    const body =
      frame('message.started', { message_id: 'm1' }) +
      frame('message.delta', { text: '你好世界' }) +
      frame('message.completed', { message_id: 'm1', content: '你好世界' })

    // 逐字节切开，必然把多字节字符切断 —— 这是 TextDecoder 不加 stream:true 时会炸的场景。
    const splitAt = Array.from({ length: new TextEncoder().encode(body).length }, (_, i) => i + 1)
    stub(sseResponse(body, { splitAt }))

    const deltas: string[] = []
    const outcome = await streamMessage({
      conversationId: 'c1',
      content: '你好',
      signal: new AbortController().signal,
      onEvent: (event) => {
        if (event.type === 'message.delta') deltas.push(event.data.text)
      },
    })

    expect(deltas.join('')).toBe('你好世界')
    expect(outcome).toMatchObject({ kind: 'completed', content: '你好世界' })
  })

  it('契约 a：流开始前的 HTTP 错误抛 AppError，不是 SSE 事件', async () => {
    stub(envelopeResponse(404, 'NOT_FOUND', 'conversation not found'))

    await expect(run()).rejects.toMatchObject({
      name: 'AppError',
      code: 'NOT_FOUND',
      httpStatus: 404,
    })
  })

  it('响应不是 text/event-stream 时抛错，而不是傻等永远不来的帧', async () => {
    stub(
      new Response('<html>proxy error</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    await expect(run()).rejects.toBeInstanceOf(AppError)
  })

  it('契约 b：流内 error 事件 resolve 成 stream-error，且保留已产出内容', async () => {
    stub(
      sseResponse(
        frame('message.started', { message_id: 'm1' }) +
          frame('message.delta', { text: '已经输出的部分' }) +
          frame('error', { code: 'INTERNAL', message: 'internal error' }),
      ),
    )

    const outcome = await run()
    expect(outcome.kind).toBe('stream-error')
    if (outcome.kind !== 'stream-error') throw new Error('unreachable')
    expect(outcome.partial).toBe('已经输出的部分')
    expect(outcome.error.code).toBe('INTERNAL')
  })

  it('契约 c：中途取消 resolve 成 aborted，且保留已产出内容', async () => {
    const controller = new AbortController()
    stub(
      abortableSseResponse(
        frame('message.started', { message_id: 'm1' }) + frame('message.delta', { text: '一半' }),
        controller.signal,
      ),
    )

    const promise = run(controller.signal)
    // 等第一个 chunk 被消费掉再中止。
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()

    const outcome = await promise
    expect(outcome.kind).toBe('aborted')
    if (outcome.kind !== 'aborted') throw new Error('unreachable')
    expect(outcome.partial).toBe('一半')
  })

  it('流干净结束却没有 completed / error 时算失败，不能当成完整回答', async () => {
    // 服务端不发心跳，所以连接被掐断和正常结束在字节层面一模一样。
    stub(
      sseResponse(
        frame('message.started', { message_id: 'm1' }) + frame('message.delta', { text: '截断的' }),
      ),
    )

    const outcome = await run()
    expect(outcome.kind).toBe('stream-error')
    if (outcome.kind !== 'stream-error') throw new Error('unreachable')
    expect(outcome.partial).toBe('截断的')
    expect(outcome.error.code).toBe('NETWORK')
  })

  it('tool.* / result.* 这类还没实现的事件被安全忽略，流继续', async () => {
    stub(
      sseResponse(
        frame('message.started', { message_id: 'm1' }) +
          frame('tool.started', { tool: 'admin_api.deposits.list' }) +
          frame('message.delta', { text: 'ok' }) +
          frame('message.completed', { message_id: 'm1', content: 'ok' }),
      ),
    )

    const seen: string[] = []
    const outcome = await streamMessage({
      conversationId: 'c1',
      content: 'x',
      signal: new AbortController().signal,
      onEvent: (event) => seen.push(event.type),
    })

    expect(seen).toContain('tool.started')
    expect(outcome.kind).toBe('completed')
  })
})
