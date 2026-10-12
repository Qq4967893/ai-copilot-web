/**
 * SSE 事件契约，对齐 ai-copilot-api 的 app/agent/protocol.py（技术设计 §4.6）。
 *
 * 事件全集 10 个。今天真实出现的只有 message.started / message.delta /
 * message.completed / error —— 后端还是 EchoAgent，tool.* 和 result.* 要等真 Agent
 * 接入。前端必须对全集做防御性处理：多出来的事件只能被忽略，不能让流崩掉。
 *
 * AgentResponse 系列类型镜像 app/agent/response.py（技术设计 §23.2）。后端已经把
 * 类型冻结了，前端先落 TS 定义、本轮不建对应渲染组件。
 */

// ---------------------------------------------------------------------------
// Agent Response Contract（技术设计 §23.2）—— 类型先落，组件后建
// ---------------------------------------------------------------------------

export interface Answer {
  text: string
}

/** kind 恰好对应四种渲染模式，将来落在 components/copilot/{table,timeline,result}/。 */
export interface ResultBlock {
  kind: 'table' | 'key_value' | 'timeline' | 'list'
  title?: string | null
  data: Record<string, unknown>
}

/** 后台深链（技术设计 §13.4）。url 一律由服务端生成，前端绝不自行拼接。 */
export interface NavigationItem {
  label: string
  url: string
  description?: string | null
}

export type EvidenceType = 'data' | 'rule' | 'source_code' | 'navigation' | 'limitation'

/** 回答依据（技术设计 §15.2）：事实、规则、实现、推断必须可区分，type 就是这个区分。 */
export interface Evidence {
  type: EvidenceType
  source: string
  reference?: string | null
  version?: string | null
  observed_at?: string | null
  summary?: string | null
}

/** 部分失败 / 数据受限（技术设计 §16.3）。Tool 超时或无权限必须经由这里告知， */
/** 不能静默当成「没有记录」。 */
export interface Warning {
  code: string
  message: string
}

export interface AgentResponse {
  answer: Answer
  results: ResultBlock[]
  navigation: NavigationItem[]
  evidence: Evidence[]
  warnings: Warning[]
}

// ---------------------------------------------------------------------------
// 流式事件
// ---------------------------------------------------------------------------

export const EVENT_TYPES = [
  'message.started',
  'message.delta',
  'message.completed',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'result.data',
  'result.navigation',
  'result.evidence',
  'error',
] as const

export type CopilotEventType = (typeof EVENT_TYPES)[number]

/** message.started / message.completed 由 HTTP 层发出，Agent 不发。 */
export interface MessageStartedEvent {
  type: 'message.started'
  data: { message_id: string }
}

export interface MessageDeltaEvent {
  type: 'message.delta'
  data: { text: string }
}

/**
 * content 是服务端的完整终稿，用来和累积的 delta 对账。
 *
 * warnings 是本轮累计的部分失败提示（服务端从 result.data 里的 warning 收集而来），
 * 同时也会落进 message.payload。本轮不渲染，但类型要准。
 */
export interface MessageCompletedEvent {
  type: 'message.completed'
  data: { message_id: string; content: string; warnings: Warning[] }
}

export interface ToolStartedEvent {
  type: 'tool.started'
  data: Record<string, unknown>
}

export interface ToolCompletedEvent {
  type: 'tool.completed'
  data: Record<string, unknown>
}

export interface ToolFailedEvent {
  type: 'tool.failed'
  data: Record<string, unknown>
}

/**
 * 结构化结果。目前真实 Agent 只用它携带 warning（app/agent/operations.py），
 * 将来会带 ResultBlock。
 */
export interface ResultDataEvent {
  type: 'result.data'
  data: { warning?: Warning } & Record<string, unknown>
}

export interface ResultNavigationEvent {
  type: 'result.navigation'
  data: Record<string, unknown>
}

/** data 就是一个 Evidence 对象本身，服务端原样收集进 message.payload.evidence。 */
export interface ResultEvidenceEvent {
  type: 'result.evidence'
  data: Evidence
}

/**
 * 流内错误。注意 payload 是扁平的 { code, message }，**不**裹在 {"error":{...}} 里
 * —— 和 HTTP 错误信封的形状不一样，别混用解析逻辑。
 */
export interface ErrorEvent {
  type: 'error'
  data: { code: string; message: string }
}

export type CopilotEvent =
  | MessageStartedEvent
  | MessageDeltaEvent
  | MessageCompletedEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | ToolFailedEvent
  | ResultDataEvent
  | ResultNavigationEvent
  | ResultEvidenceEvent
  | ErrorEvent

export function isCopilotEventType(value: string): value is CopilotEventType {
  return (EVENT_TYPES as readonly string[]).includes(value)
}
