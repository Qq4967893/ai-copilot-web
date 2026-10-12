/**
 * 统一错误模型，对齐 ai-copilot-api 的 app/errors.py。
 *
 * 除 /healthz 和 /readyz 外，所有非 2xx 响应体都是：
 *   { "error": { "code": "NOT_FOUND", "message": "conversation not found" } }
 *
 * 后端把 FastAPI 默认的 422 重映射成了 400 INVALID_ARGUMENT，所以前端不用处理 422。
 */

export const ERROR_CODES = [
  'INVALID_ARGUMENT', // 400
  'UNAUTHENTICATED', // 401
  'PERMISSION_DENIED', // 403
  'NOT_FOUND', // 404
  'RATE_LIMITED', // 429
  'INTERNAL', // 500
  'UPSTREAM_ERROR', // 502
  'TIMEOUT', // 504
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** NETWORK：请求就没发出去/断了。UNKNOWN：响应不是预期的信封形状。 */
export type AppErrorCode = ErrorCode | 'NETWORK' | 'UNKNOWN'

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly httpStatus?: number
  readonly requestId?: string

  constructor(
    code: AppErrorCode,
    message: string,
    options: { httpStatus?: number; requestId?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.httpStatus = options.httpStatus
    this.requestId = options.requestId
  }
}

/**
 * 取消判定。
 *
 * 刻意按 name 判断而不是 `instanceof DOMException`：AbortError 的具体构造器在不同
 * 运行环境（浏览器 / jsdom / Node undici）和跨 realm 时并不一致，instanceof 会漏判，
 * 而漏判的后果是把「用户点了停止」当成「请求失败」报错给用户。
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)
}

/**
 * 从响应体里取出错误信封。
 *
 * body 不是预期形状时（比如反向代理返回了一段 HTML 502），降级成 UNKNOWN 并保留
 * HTTP 状态码 —— 这种时候更不能崩，否则用户只看到白屏，连状态码都丢了。
 */
export function toAppError(body: unknown, httpStatus: number, requestId?: string): AppError {
  const envelope =
    typeof body === 'object' && body !== null
      ? (body as { error?: { code?: unknown; message?: unknown } }).error
      : undefined

  if (envelope && typeof envelope === 'object') {
    const { code, message } = envelope
    if (isErrorCode(code)) {
      return new AppError(code, typeof message === 'string' ? message : code, {
        httpStatus,
        requestId,
      })
    }
  }

  return new AppError('UNKNOWN', `请求失败（HTTP ${httpStatus}）`, { httpStatus, requestId })
}

/** 用户可见的兜底文案。后端 message 是英文技术描述，不适合直接摆给运营看。 */
export function describeError(error: unknown): string {
  if (error instanceof AppError) {
    switch (error.code) {
      case 'NOT_FOUND':
        return '会话不存在，或已被删除。'
      case 'PERMISSION_DENIED':
        return '没有访问权限。'
      case 'UNAUTHENTICATED':
        return '身份校验失败，请重新登录。'
      case 'INVALID_ARGUMENT':
        return '请求内容不合法，请调整后重试。'
      case 'RATE_LIMITED':
        return '请求过于频繁，请稍后再试。'
      case 'TIMEOUT':
        return '处理超时，请稍后重试。'
      case 'UPSTREAM_ERROR':
        return '上游服务异常，请稍后重试。'
      case 'NETWORK':
        return '网络异常，请检查连接后重试。'
      default:
        return '服务暂时不可用，请稍后重试。'
    }
  }
  return '发生未知错误，请稍后重试。'
}
