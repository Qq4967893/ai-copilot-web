import { afterEach, describe, expect, it, vi } from 'vitest'

import { request } from '@/api/client'
import { AppError, describeError } from '@/api/errors'
import { REQUEST_ID_HEADER } from '@/lib/request-id'

import { envelopeResponse } from './helpers/sse'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(response: Response) {
  const spy = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response))
  vi.stubGlobal('fetch', spy)
  return spy
}

/** fetch 直接 reject 的场景（断网、被取消）。 */
function stubFetchRejecting(reason: unknown) {
  const spy = vi.fn((_url: string, _init?: RequestInit) => Promise.reject(reason))
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('request', () => {
  it('解析统一错误信封', async () => {
    stubFetch(envelopeResponse(404, 'NOT_FOUND', 'conversation not found'))

    await expect(request('/conversations/x')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      httpStatus: 404,
      message: 'conversation not found',
    })
  })

  it('响应体不是信封形状时降级成 UNKNOWN，并保留状态码', async () => {
    // 反向代理挂掉时会返回一段 HTML，这时更不能崩。
    stubFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }))

    const error = await request('/conversations').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'UNKNOWN', httpStatus: 502 })
  })

  it('信封里出现不认识的 code 时也降级成 UNKNOWN', async () => {
    stubFetch(envelopeResponse(500, 'SOMETHING_NEW', 'x'))
    await expect(request('/conversations')).rejects.toMatchObject({ code: 'UNKNOWN' })
  })

  it('每个请求都带 X-Copilot-Request-Id', async () => {
    const spy = stubFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await request('/conversations')

    const headers = spy.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers[REQUEST_ID_HEADER]).toBeTruthy()
  })

  it('错误里带的是后端回显的 request id，而不是本地生成的那个', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'internal error' } }), {
        status: 500,
        headers: { [REQUEST_ID_HEADER]: 'echoed-from-server' },
      }),
    )

    await expect(request('/conversations')).rejects.toMatchObject({
      requestId: 'echoed-from-server',
    })
  })

  it('204 不去解析 body', async () => {
    stubFetch(new Response(null, { status: 204 }))
    await expect(request('/conversations/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('网络层失败包成 code=NETWORK', async () => {
    stubFetchRejecting(new TypeError('Failed to fetch'))
    await expect(request('/conversations')).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('AbortError 原样抛出 —— 取消不是错误，TanStack Query 靠它识别取消', async () => {
    stubFetchRejecting(new DOMException('Aborted', 'AbortError'))

    const error = await request('/conversations').catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'AbortError' })
    expect(error).not.toBeInstanceOf(AppError)
  })

  it('query 参数里的 undefined 被跳过', async () => {
    const spy = stubFetch(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    await request('/conversations', { query: { limit: 20, cursor: undefined } })

    expect(spy.mock.calls[0]?.[0]).toBe('/api/conversations?limit=20')
  })
})

describe('describeError', () => {
  it('对每个后端错误码都有中文文案', () => {
    for (const code of ['NOT_FOUND', 'PERMISSION_DENIED', 'RATE_LIMITED', 'TIMEOUT'] as const) {
      expect(describeError(new AppError(code, 'raw'))).not.toBe('')
    }
  })

  it('非 AppError 也有兜底文案', () => {
    expect(describeError(new Error('boom'))).toContain('未知错误')
  })
})
