/**
 * 健康检查。
 *
 * 注意两点：
 * 1. 路径是 /healthz 和 /readyz，不在 /api 前缀下，所以不走 client.ts。
 *    技术设计 §22.4 写的是 /health/live 和 /health/ready，那处文档已过时 ——
 *    以实现为准（与 internal-mcp-server 对齐）。
 * 2. 响应体是裸的 {"status": ...}，不是错误信封，所以也不走 toAppError。
 */

export interface HealthStatus {
  ok: boolean
  status: string
}

async function probe(path: string): Promise<HealthStatus> {
  try {
    const response = await fetch(path, { headers: { Accept: 'application/json' } })
    const body = (await response.json()) as { status?: string }
    return { ok: response.ok, status: body.status ?? 'unknown' }
  } catch {
    return { ok: false, status: 'unreachable' }
  }
}

/** 存活探针，不查依赖。 */
export function checkLive(): Promise<HealthStatus> {
  return probe('/healthz')
}

/** 就绪探针，后端会查 MySQL；刻意不查 internal-mcp-server（技术设计 §22.4）。 */
export function checkReady(): Promise<HealthStatus> {
  return probe('/readyz')
}
