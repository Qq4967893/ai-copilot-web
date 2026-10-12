/**
 * 跨服务关联 ID。
 *
 * ai-copilot-api 收到 X-Copilot-Request-Id 就沿用、没收到就自己生成 ULID，并且
 * 总是回显、已经放进 CORS expose_headers（见其 app/observability/middleware.py）。
 * 前端主动生成一个带上，浏览器 Network 面板里的 ID 就和后端日志里的 request_id
 * 是同一个，排查问题不用靠时间戳猜。
 *
 * 后端对这个值的格式要求是 ^[A-Za-z0-9_.:@-]{1,128}$（api → MCP 那一段会断言），
 * crypto.randomUUID() 的输出（hex + 连字符）落在这个字符集内。
 */

export const REQUEST_ID_HEADER = 'X-Copilot-Request-Id'

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 非安全上下文（比如用局域网 IP + http 访问内部工具）下 randomUUID 不可用。
  // 关联 ID 不需要密码学强度，退化成时间戳 + 随机串就够。
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
