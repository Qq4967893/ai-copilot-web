/**
 * 身份接缝。
 *
 * 项目根 README 第 4 条：MVP 阶段不实现 ai-copilot-web / ai-copilot-api 的登录功能。
 * 后端的身份来自配置里的固定开发用户，浏览器**不发任何凭证** —— 没有
 * Authorization 头、没有 cookie、没有 JWT。所以这里没有登录页、没有 token 刷新、
 * 也没有 401 重定向拦截器。
 *
 * 这个 hook 是前端唯一的身份入口，对应后端 app/auth/dependency.py 的
 * get_current_identity()：接入真实登录后只改这一个函数体，调用方不用动。
 *
 * 注意 PRD §5.2 和 §10.1.3 是假设「用户必须登录后才能使用」的，与这里冲突 ——
 * 以项目根 README 的 MVP 裁剪为准。真接登录时要一并处理 PRD §10.8.2 的要求：
 * 用户跨会话不能访问其他用户的上下文（后端已经在数据层按 user_id 过滤了）。
 */

export interface CurrentUser {
  userId: string
  displayName: string
}

export function useCurrentUser(): CurrentUser {
  // 与 ai-copilot-api 的 config.example.json 里的 auth.dev_user 对齐，方便本地
  // 联调时两边显示一致。真接登录后这里换成解析 session / 调 /api/me。
  return { userId: '10001', displayName: 'dev' }
}
