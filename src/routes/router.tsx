import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AppLayout } from './AppLayout'
import { ChatRoute } from './ChatRoute'
import { NotFound } from './NotFound'

/**
 * 路由表。
 *
 * /chat 和 /chat/:conversationId 用的是同一个组件：新建会话只是「消息为空」这一种
 * 状态（技术设计 §4.7），不是另一个页面。
 *
 * 刻意不用 loader / action：数据获取统一走 TanStack Query，两套数据层并存只会让
 * 缓存失效的心智负担翻倍。
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: 'chat', element: <ChatRoute /> },
      { path: 'chat/:conversationId', element: <ChatRoute /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
