import { Menu } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { SIDEBAR_ID, Sidebar } from '@/components/layout/Sidebar'
import { useCurrentUser } from '@/features/auth'
import { ChatSessionProvider, useChatSession, useConversationList } from '@/features/conversation'

/**
 * 应用外壳：左侧深色侧边栏 + 右侧内容区，按设计稿
 * design-mock-new-session.html / design-mock-chat.html。
 *
 * ChatSessionProvider **必须**挂在这里而不是路由页里：首次发消息时会 navigate 到
 * /chat/{id}，状态住在路由页的话这次导航会把正在进行的流拆掉。
 */

/** 从 pathname 解析当前会话 id。见下面 LayoutShell 里不能用 useParams 的说明。 */
function conversationIdFromPath(pathname: string): string | null {
  return /^\/chat\/([^/]+)/.exec(pathname)?.[1] ?? null
}

function LayoutShell() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const session = useChatSession()
  const list = useConversationList()

  // ≤850px 时侧边栏是覆盖式抽屉。状态留在这里就够 —— 只有外壳自己用，不必进 context。
  const [drawerOpen, setDrawerOpen] = useState(false)

  // **不能用 useParams()。** 它读的是「最近匹配路由」的参数，而布局路由的 path 是 '/'，
  // 在这里它恒为 {}。表现是「选中态永远不高亮」，而且不报任何错。
  const { pathname } = useLocation()
  const activeId = conversationIdFromPath(pathname)

  // 「新建会话」要同时做两件事：清掉本地会话状态、把 URL 退回 /chat。
  // 只导航不清状态的话，旧消息会留在屏幕上；只清状态不导航的话，URL 还停在
  // /chat/{旧 id}，刷新就又把旧会话拉回来了。
  const startNewConversation = useCallback(() => {
    session.startNew()
    void navigate('/chat')
    setDrawerOpen(false)
  }, [navigate, session])

  const openConversation = (id: string) => {
    void navigate(`/chat/${id}`)
    // 移动端不关抽屉的话，它会一直盖在刚打开的会话上。
    setDrawerOpen(false)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.repeat) {
        // 不能省：Chrome / Firefox 的 ⌘K 是「从地址栏搜索」，不拦就每次被夺走焦点。
        event.preventDefault()
        // 刻意不按 event.target 过滤：正在输入时也能直接新建会话，这正是快捷键的用处
        // （代价是草稿被丢弃，和点按钮的行为一致）。
        startNewConversation()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [startNewConversation])

  return (
    <div className="flex h-full">
      <Sidebar
        user={user}
        conversations={list.data?.items ?? []}
        activeId={activeId}
        isLoading={list.isPending}
        isError={list.isError}
        open={drawerOpen}
        onNewConversation={startNewConversation}
        onSelect={openConversation}
      />

      {drawerOpen && (
        <div
          className="fixed inset-0 z-[var(--z-overlay)] hidden bg-black/30 max-[850px]:block"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      <button
        type="button"
        aria-label="打开菜单"
        aria-expanded={drawerOpen}
        aria-controls={SIDEBAR_ID}
        onClick={() => setDrawerOpen(true)}
        className="border-border bg-background fixed top-[14px] left-[14px] hidden size-[38px] place-items-center rounded-[10px] border shadow-[0_5px_18px_rgba(15,23,42,.08)] max-[850px]:grid"
      >
        <Menu size={18} aria-hidden />
      </button>

      {/* min-w-0 不能省：flex 子项默认 min-width:auto，Markdown 宽表格（min-w-[630px]）
          会把这一列撑得比视口还宽，变成整页横向滚动。设计稿的 main 也有 min-width:0。 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}

export function AppLayout() {
  const navigate = useNavigate()

  return (
    <ChatSessionProvider
      // 会话在服务端建好后把 URL 换成 /chat/{id}。用 replace 而不是 push：
      // 草稿态那一条不该在后退历史里留下痕迹。
      onConversationCreated={(id) => void navigate(`/chat/${id}`, { replace: true })}
    >
      <LayoutShell />
    </ChatSessionProvider>
  )
}
