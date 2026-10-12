/**
 * 会话模块。
 *
 * 不变式（改动前先读 ChatSessionProvider 和 session-reducer 的注释）：
 *
 * 1. 点「新建会话」不调任何接口，只清本地状态。会话在用户首次发消息时才创建
 *    （技术设计 §4.7），否则会堆出大量空会话。
 * 2. 会话一旦建成，id 立刻写进 state。之后发消息失败，重试只重发消息，不会
 *    再建一个会话，也不会去删已经建好的那个。
 * 3. 流式期间不拉会话详情 —— 服务端那条助手消息此时是 content 为空的 pending。
 * 4. 取消之后不失效查询 —— 取消路径的落库在服务端是 fire-and-forget，会读到中间态。
 * 5. 发送永不自动重试。后端没有幂等键，重发会真的多出一条消息和一次 Agent Run。
 */

export { ChatSessionProvider } from './ChatSessionProvider'
export { useChatSession } from './chat-session-context'
export { useConversationDetail } from './useConversationDetail'
export { useConversationList } from './useConversationList'
