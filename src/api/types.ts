/**
 * REST 请求/响应类型，逐字段镜像 ai-copilot-api 的 app/api/schemas.py。
 *
 * 后端没有签入 OpenAPI 文件。它确实在 /openapi.json 提供了活的 spec，但那份 spec
 * 对 JSON 路由准确、对 SSE 流和错误信封完全没用（流式路由只标注成
 * StreamingResponse，错误信封是异常处理器产出的、FastAPI 看不见）——而这两块恰好
 * 是前端最需要的。MVP 阶段整套手写比维护一条只覆盖一半的生成链更简单。
 *
 * 改这个文件时对照 app/api/schemas.py 和 app/conversation/models.py。
 */

/** ULID 字符串，不是数字 ID。 */
export type Id = string

export type ConversationStatus = 'active' | 'deleted'
export type MessageRole = 'user' | 'assistant'
/** 用户消息是 text，助手消息是 markdown。 */
export type MessageContentType = 'text' | 'markdown'
export type MessageStatus = 'pending' | 'completed' | 'failed' | 'cancelled'
export type FeedbackRating = 'helpful' | 'not_helpful'

export interface ConversationSummary {
  id: Id
  title: string | null
  status: ConversationStatus
  created_at: string
  updated_at: string
}

export interface MessageOut {
  id: Id
  role: MessageRole
  content: string
  content_type: MessageContentType
  status: MessageStatus
  /** 预留给结构化结果（技术设计 §20.3），目前后端恒为 null。 */
  payload: Record<string, unknown> | null
  created_at: string
}

export interface ConversationDetail extends ConversationSummary {
  /** 按 id 升序，即时间正序。 */
  messages: MessageOut[]
}

export interface ConversationPage {
  items: ConversationSummary[]
  /** null 表示没有更多；否则把它作为下一页的 cursor 传回去。 */
  next_cursor: string | null
}

export interface FeedbackOut {
  id: Id
  message_id: Id
  rating: FeedbackRating
  comment: string | null
  created_at: string
}
