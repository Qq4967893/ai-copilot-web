import type { MessageContentType, MessageOut, MessageRole } from '@/api/types'

/**
 * 界面上的一条消息。
 *
 * 放在 lib（最底层）而不是 features 里：components 是纯展示层、不允许依赖 features，
 * 但它需要这个类型来标注 props。视图模型属于两边共用的底层词汇。
 *
 * 刻意不直接复用 MessageOut：流式过程中助手消息在服务端还是一条 pending 记录，
 * 本地需要额外表达「正在流」「被取消」「失败但保留了部分内容」这些状态。
 */
export interface ChatMessage {
  /** React key。服务端消息用其 id，本地乐观插入的用自增 key。 */
  key: string
  role: MessageRole
  /** 决定渲染方式：text 走纯文本，markdown 走受限渲染。**不要**按 role 判断。 */
  contentType: MessageContentType
  content: string
  state: 'done' | 'streaming' | 'failed' | 'cancelled'
  /**
   * 服务端消息 id。**只有它存在时才能提交反馈** —— 反馈接口打的是
   * /messages/{id}/feedback。
   *
   * 和 key 分开两个字段而不是复用 key：key 在乐观插入时是本地自增值，
   * 完成后也不改写（改写会让 React 把整条消息的子树卸载重建）。靠
   * 「key 不以 local- 开头」来推断有没有服务端 id 也不行 —— 那是把 reducer 的
   * key 生成方案泄露进视图层，改一次前缀就静默失效。
   */
  serverId?: string
  /** 仅流内失败时存在（契约 b：部分内容保留，错误挂在这条消息上）。 */
  error?: unknown
}

/** 把服务端消息映射成界面消息。 */
export function toChatMessage(message: MessageOut): ChatMessage {
  return {
    key: message.id,
    serverId: message.id,
    role: message.role,
    contentType: message.content_type,
    content: message.content,
    // pending 只会在两种情况下被读到：另一个标签页正在流，或上一次运行没收尾。
    // 标成 cancelled 而不是 streaming —— 标 streaming 会永远转圈，不诚实。
    state:
      message.status === 'completed'
        ? 'done'
        : message.status === 'pending'
          ? 'cancelled'
          : message.status,
  }
}
