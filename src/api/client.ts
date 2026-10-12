/**
 * fetch 封装。这个文件和 sse.ts 是**唯二**直接碰 fetch 的地方。
 *
 * 职责：拼 baseURL、带关联 ID、把错误信封翻译成 AppError、处理 204 空 body。
 */

import { API_BASE_URL } from '@/lib/config'
import { REQUEST_ID_HEADER, newRequestId } from '@/lib/request-id'

import { AppError, isAbortError, toAppError } from './errors'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  /** 会被 JSON.stringify；undefined 表示不发 body。 */
  body?: unknown
  signal?: AbortSignal
  query?: Record<string, string | number | undefined>
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE_URL}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

/**
 * 发一个 JSON 请求。
 *
 * 非 2xx 一律抛 AppError；网络层失败抛 code=NETWORK 的 AppError。
 * AbortError 原样抛出 —— 取消不是错误，由调用方区分处理。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, query } = options
  const requestId = newRequestId()

  const headers: Record<string, string> = {
    Accept: 'application/json',
    [REQUEST_ID_HEADER]: requestId,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (cause) {
    if (isAbortError(cause)) throw cause
    throw new AppError('NETWORK', '网络请求失败', { requestId, cause })
  }

  // 后端总是回显这个头；取不到就退回自己生成的那个，保证错误 UI 上一定有 ID 可报。
  const responseId = response.headers.get(REQUEST_ID_HEADER) ?? requestId

  if (!response.ok) {
    throw toAppError(await safeJson(response), response.status, responseId)
  }

  // 204（DELETE 软删除）没有 body，别去 parse。
  if (response.status === 204) return undefined as T
  return (await safeJson(response)) as T
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text()
    return text ? JSON.parse(text) : undefined
  } catch {
    // 交给 toAppError 降级成 UNKNOWN。
    return undefined
  }
}
