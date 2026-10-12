/**
 * 构造流式响应的测试工具。
 *
 * 刻意不用 MSW：这里最需要的能力是**精确控制 chunk 边界**（尤其是把一个中文字符
 * 的 UTF-8 字节切成两半），手写 ReadableStream 比 MSW 更直接也更可控。
 */

/** 拼一个 SSE 帧，格式与 ai-copilot-api 的 sse_frame() 一致。 */
export function frame(event: string, data: unknown): string {
  // JSON.stringify 默认不转义非 ASCII，和后端的 ensure_ascii=False 行为一致。
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * 把一段文本按给定的**字节**位置切片后作为流式响应返回。
 * splitAt 用字节偏移而不是字符偏移，才能制造出「中文被切两半」的场景。
 */
export function sseResponse(body: string, options: { splitAt?: number[] } = {}): Response {
  const bytes = new TextEncoder().encode(body)
  const cuts = [...(options.splitAt ?? []), bytes.length]

  const chunks: Uint8Array[] = []
  let prev = 0
  for (const cut of cuts) {
    chunks.push(bytes.slice(prev, cut))
    prev = cut
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** 先吐一段内容，然后挂住；signal 中止时让流以 AbortError 失败（模拟真实 fetch）。 */
export function abortableSseResponse(body: string, signal: AbortSignal): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      signal.addEventListener('abort', () => {
        controller.error(new DOMException('Aborted', 'AbortError'))
      })
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** 统一错误信封的 JSON 响应，用于测流开始前的 HTTP 错误。 */
export function envelopeResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
