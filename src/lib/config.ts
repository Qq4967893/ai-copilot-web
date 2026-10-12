/**
 * 前端运行时配置。
 *
 * baseURL 恒为相对路径：本地开发由 Vite proxy 转发到 ai-copilot-api（见
 * vite.config.ts），生产由反向代理转发。前后端同源，浏览器不需要知道后端地址，
 * 也不会碰上 CORS。
 *
 * ai-copilot-api 那边有一套「环境变量 > JSON 文件 > 默认值 + 启动即校验」的配置
 * 体系（见其 app/config/settings.py）。前端 MVP 只有下面两个常量，搬一套校验框架
 * 过来是过度设计。将来真出现需要校验的运行时配置（比如后台深链的域名白名单），
 * 校验加在这个模块里，并且要在 main.tsx 挂载之前跑、失败就直接报错，而不是让页面
 * 半残地跑起来。
 */

export const API_BASE_URL = '/api'

/** 与 ai-copilot-api 的 MAX_MESSAGE_LENGTH 对齐（app/api/schemas.py）。 */
export const MAX_MESSAGE_LENGTH = 4000
