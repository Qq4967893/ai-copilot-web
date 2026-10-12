/**
 * SSE-over-POST 客户端（技术设计 §4.6）。
 *
 * 为什么手写而不用 EventSource：发消息是带 JSON body 的 POST，EventSource 只能发
 * 无 body 的 GET。也不用 @microsoft/fetch-event-source —— 它会自动重连，而重发一次
 * POST /messages 会在服务端多落一条用户消息、多跑一次 Agent。这个场景下自动重试
 * 是有害的，必须由用户显式重试。
 *
 * 服务端帧格式（ai-copilot-api 的 app/api/sse.py）极简：
 *     event: message.delta\ndata: {"text":"..."}\n\n
 * 没有 id:、没有 retry:、也没有心跳帧。
 *
 * 必须守住的三条行为契约（已对照 ai-copilot-api 的 app/api/messages.py 逐行确认）：
 *
 *   a) 流**开始前**的错误是普通 HTTP 错误 + JSON 信封。此时服务端什么都没落库，
 *      整轮可以干净重试 —— 这里用 throw 表达。
 *   b) 流**开始后**的失败是 HTTP 200 里的一个 error 事件（响应头已经发出去了，
 *      状态码改不了）。助手消息落库为 failed，已产出内容保留 —— 这里 resolve 成
 *      kind: 'stream-error'，不是 throw。
 *   c) 客户端断开时助手消息落库为 cancelled，已产出内容保留 —— resolve 成 'aborted'。
 *
 * 还有一条文档里没写、但从服务端代码推出来的：**因为没有心跳帧，连接被掐断和
 * 正常结束在字节层面完全一样**。所以「读到 done 但既没收到 message.completed
 * 也没收到 error」必须当成失败，不能当成成功 —— 否则用户会看到一段截断的回答被
 * 当作完整回答。
 */

import { API_BASE_URL } from '@/lib/config'
import { REQUEST_ID_HEADER, newRequestId } from '@/lib/request-id'

import { AppError, isAbortError, toAppError } from './errors'
import { isCopilotEventType, type CopilotEvent } from './events'

/** 一次流式回合的终态。除流前 HTTP 错误外，所有结局都由它表达。 */
export type StreamOutcome =
  | { kind: 'completed'; messageId: string | null; content: string }
  | { kind: 'stream-error'; messageId: string | null; partial: string; error: AppError }
  | { kind: 'aborted'; messageId: string | null; partial: string }

export interface StreamMessageOptions {
  conversationId: string
  content: string
  signal: AbortSignal
  /** 逐事件回调，用于增量渲染。未知事件已被过滤，不会传进来。 */
  onEvent?: (event: CopilotEvent) => void
}

/**
 * 把一段 SSE 原文切成事件。
 *
 * 单独导出是为了能独立测试 —— 分帧是这条链路上最容易出错的地方（多字节中文、
 * chunk 边界、CRLF），值得有自己的用例。
 *
 * 返回解析出的事件，以及**尚未收全的尾部**，由调用方拼到下一个 chunk 前面。
 */
export function parseFrames(buffer: string): { events: CopilotEvent[]; rest: string } {
  // 统一换行符，免得中间有代理把 \n 改写成 \r\n 时整个分帧失效。
  const normalized = buffer.replace(/\r\n/g, '\n')
  const chunks = normalized.split('\n\n')
  // 最后一段没有终止空行，说明还没收完。
  const rest = chunks.pop() ?? ''

  const events: CopilotEvent[] = []
  for (const chunk of chunks) {
    const event = parseFrame(chunk)
    if (event) events.push(event)
  }
  return { events, rest }
}

function parseFrame(chunk: string): CopilotEvent | null {
  if (!chunk.trim()) return null

  let name = ''
  const dataLines: string[] = []
  for (const line of chunk.split('\n')) {
    // 注释帧（以 : 开头）按 SSE 规范忽略。服务端不发，但代理可能注入心跳。
    if (line.startsWith(':')) continue
    if (line.startsWith('event:')) name = line.slice('event:'.length).trim()
    // 规范允许多行 data，用 \n 拼接。服务端目前只发单行，但兼容一下不亏。
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).replace(/^ /, ''))
  }

  if (!name || dataLines.length === 0) return null

  let data: unknown
  try {
    data = JSON.parse(dataLines.join('\n'))
  } catch {
    // 单帧 JSON 坏掉不该让整条流崩，丢掉继续。
    console.debug('[sse] 丢弃无法解析的帧', chunk)
    return null
  }

  if (!isCopilotEventType(name)) {
    // 后端加了新事件而前端还不认识 —— 忽略，这不是错误。
    console.debug('[sse] 忽略未知事件', name)
    return null
  }

  return { type: name, data: data as never } as CopilotEvent
}

/**
 * 发一条消息并消费流式响应。
 *
 * 流开始前失败 → throw AppError（契约 a）。
 * 流开始后的一切结局 → resolve 成 StreamOutcome，绝不 throw。
 */
export async function streamMessage(options: StreamMessageOptions): Promise<StreamOutcome> {
  const { conversationId, content, signal, onEvent } = options
  const requestId = newRequestId()

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        [REQUEST_ID_HEADER]: requestId,
      },
      body: JSON.stringify({ content }),
      signal,
    })
  } catch (cause) {
    // 还没连上就被取消：什么都没发生，按取消处理。
    if (isAbortError(cause)) return { kind: 'aborted', messageId: null, partial: '' }
    throw new AppError('NETWORK', '网络请求失败', { requestId, cause })
  }

  // 后端只有在收到这个头时才回显，我们总是发，所以正常情况下一定取得到。
  const responseId = response.headers.get(REQUEST_ID_HEADER) ?? requestId

  // 契约 a：流还没开始，这是普通 HTTP 错误。
  if (!response.ok) {
    throw toAppError(await readJson(response), response.status, responseId)
  }

  // 代理配错时可能返回一段 HTML 或 JSON。不挡住的话会一直等永远不来的帧。
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    throw new AppError('UNKNOWN', '响应不是流式格式', {
      httpStatus: response.status,
      requestId: responseId,
    })
  }
  if (!response.body) {
    throw new AppError('UNKNOWN', '响应没有可读取的流', {
      httpStatus: response.status,
      requestId: responseId,
    })
  }

  const reader = response.body.getReader()
  // stream: true 是必须的：一个中文字符占 3 个 UTF-8 字节，chunk 边界很可能把它
  // 切成两半，不带这个选项会解出乱码。
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  let messageId: string | null = null
  const chunks: string[] = []
  let outcome: StreamOutcome | null = null

  const consume = (event: CopilotEvent): void => {
    switch (event.type) {
      case 'message.started':
        messageId = event.data.message_id
        break
      case 'message.delta':
        chunks.push(event.data.text)
        break
      case 'message.completed':
        // 用服务端的终稿，而不是本地累积 —— 丢帧或重复帧都能被它自愈。
        outcome = {
          kind: 'completed',
          messageId: event.data.message_id ?? messageId,
          content: event.data.content,
        }
        break
      case 'error':
        outcome = {
          kind: 'stream-error',
          messageId,
          partial: chunks.join(''),
          error: new AppError(toStreamErrorCode(event.data.code), event.data.message, {
            requestId: responseId,
          }),
        }
        break
      default:
        // tool.* 和 result.* 要等真 Agent 接上 MCP 才会出现。到时候在这里分发到
        // components/copilot/{result,table,timeline,evidence,navigation}/。
        break
    }
    onEvent?.(event)
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const { events, rest } = parseFrames(buffer)
      buffer = rest
      for (const event of events) consume(event)
    }

    // 冲掉解码器残留，并处理没有以空行结尾的最后一帧。
    buffer += decoder.decode()
    if (buffer.trim()) {
      const { events } = parseFrames(`${buffer}\n\n`)
      for (const event of events) consume(event)
    }
  } catch (cause) {
    // 契约 c：取消不是错误，已产出的内容保留。
    if (isAbortError(cause)) {
      return { kind: 'aborted', messageId, partial: chunks.join('') }
    }
    return {
      kind: 'stream-error',
      messageId,
      partial: chunks.join(''),
      error: new AppError('NETWORK', '流式连接中断', { requestId: responseId, cause }),
    }
  } finally {
    reader.cancel().catch(() => {})
  }

  if (outcome) return outcome

  // 流干净地结束了，却既没有 message.completed 也没有 error。
  // 因为服务端不发心跳，连接被掐断和正常结束在字节层面无法区分 —— 只能当失败，
  // 否则会把一段截断的回答当成完整回答展示给运营。
  return {
    kind: 'stream-error',
    messageId,
    partial: chunks.join(''),
    error: new AppError('NETWORK', '连接意外中断，回答可能不完整', { requestId: responseId }),
  }
}

/** 流内 error 的 code 是后端 ErrorCode 的字符串，但也可能是将来新增的值。 */
function toStreamErrorCode(code: string): AppError['code'] {
  return code === 'TIMEOUT' || code === 'RATE_LIMITED' || code === 'PERMISSION_DENIED'
    ? code
    : 'INTERNAL'
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text()
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}
