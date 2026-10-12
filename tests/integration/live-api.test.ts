import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createConversation, getConversation } from '@/api/conversations'
import { AppError } from '@/api/errors'
import { streamMessage } from '@/api/sse'

/**
 * 对着**真实** ai-copilot-api 跑一遍客户端代码。
 *
 * 默认跳过：技术设计 §27.1 的 CI 五步里没有后端，`make test` 必须能在没有 MySQL、
 * 没有 API 的机器上跑通。要跑这组用例：
 *
 *     make test-live                       # 默认 http://127.0.0.1:8082
 *     COPILOT_LIVE_API=http://x make test-live
 *
 * 它和 sse.test.ts 的关系是互补的：那边用构造出来的字节流精确覆盖边界条件，
 * 这边证明同一套解析代码能吃下服务端真实吐出来的字节。
 */
const BASE = process.env.COPILOT_LIVE_API
const suite = BASE ? describe : describe.skip

suite('对接真实 ai-copilot-api', () => {
  beforeAll(() => {
    // 前端 baseURL 是相对路径 /api（生产靠反向代理，开发靠 Vite proxy）。
    // Node 里没有 origin，这里补一个，其余逻辑走真实代码。
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input)
      return realFetch(url.startsWith('/') ? `${BASE}${url}` : url, init)
    })
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('建会话 → 流式发消息 → 落库，整条链路通', async () => {
    const conversation = await createConversation()
    expect(conversation.id).toMatch(/^[0-9A-Z]{26}$/)
    // 标题由首条消息派生，建会话时还是 null。
    expect(conversation.title).toBeNull()

    const deltas: string[] = []
    const outcome = await streamMessage({
      conversationId: conversation.id,
      content: '你好，这是一次联调测试',
      signal: new AbortController().signal,
      onEvent: (event) => {
        if (event.type === 'message.delta') deltas.push(event.data.text)
      },
    })

    expect(outcome.kind).toBe('completed')
    if (outcome.kind !== 'completed') throw new Error('unreachable')
    expect(outcome.content.length).toBeGreaterThan(0)
    expect(deltas.length).toBeGreaterThan(0)
    // 真实服务端的终稿应当等于逐帧累积的结果。
    expect(deltas.join('')).toBe(outcome.content)

    const detail = await getConversation(conversation.id)
    expect(detail.title).toBe('你好，这是一次联调测试')
    expect(detail.messages).toHaveLength(2)
    expect(detail.messages[0]?.content_type).toBe('text')
    expect(detail.messages[1]?.content_type).toBe('markdown')
    expect(detail.messages[1]?.status).toBe('completed')
    expect(detail.messages[1]?.content).toBe(outcome.content)
  }, 60_000)

  it('契约 a：会话不存在时抛 AppError(NOT_FOUND)，且带 request id', async () => {
    const error = await streamMessage({
      conversationId: '01BOGUSBOGUSBOGUSBOGUSBOGU',
      content: 'x',
      signal: new AbortController().signal,
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 })
    expect((error as AppError).requestId).toBeTruthy()
  }, 30_000)

  it('契约 a：内容为空时是 400 INVALID_ARGUMENT，不是 422', async () => {
    const conversation = await createConversation()
    const error = await streamMessage({
      conversationId: conversation.id,
      content: '',
      signal: new AbortController().signal,
    }).catch((e: unknown) => e)

    expect(error).toMatchObject({ code: 'INVALID_ARGUMENT', httpStatus: 400 })
  }, 30_000)

  it('契约 c：中途取消返回 aborted，服务端把消息落成 cancelled', async () => {
    const conversation = await createConversation()
    const controller = new AbortController()

    const promise = streamMessage({
      conversationId: conversation.id,
      content: '请详细说明一下出金审核的完整流程',
      signal: controller.signal,
    })
    setTimeout(() => controller.abort(), 700)

    const outcome = await promise
    expect(outcome.kind).toBe('aborted')

    // 服务端的取消收尾是游离 task，等它落库。
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const detail = await getConversation(conversation.id)
    expect(detail.messages[1]?.status).toBe('cancelled')
  }, 60_000)
})
