import { Plus } from 'lucide-react'

import type { ConversationSummary } from '@/api/types'
import brandLogo from '@/assets/brand-logo.png'
import { cn } from '@/lib/cn'
import { formatRelativeTime } from '@/lib/format-time'

/**
 * 应用外壳的左侧边栏：品牌、新建会话、历史会话、当前用户。
 *
 * 放 components/layout/ 而不是 components/copilot/ —— 后者是 Copilot 业务组件
 * （result / table / timeline / evidence / navigation，见那边的 README），
 * 应用外壳不属于那一层。
 *
 * 纯展示：会话数据和回调都由 routes 传进来。不能在这里调 @/api/conversations，
 * 分层规则由 eslint.config.js 真实拦截（见项目 README「目录与依赖方向」）。
 */

/** 侧边栏宽度。移动端抽屉和桌面列共用，只此一份。 */
export const SIDEBAR_ID = 'app-sidebar'

/**
 * 头像缩写。拉丁文名取各单词首字母（Alex Xu → AX），中文名取前两个字。
 * 取不出来就留空，不要塞一个问号进去。
 */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2)
    return words
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('')
  const single = words[0] ?? ''
  // 中日韩字符一个字就有信息量，取两个；拉丁文取前两个字母。
  return /[一-鿿]/.test(single) ? single.slice(0, 2) : single.slice(0, 2).toUpperCase()
}

export function Sidebar({
  user,
  conversations,
  activeId,
  isLoading,
  isError,
  open,
  onNewConversation,
  onSelect,
}: {
  user: { displayName: string; userId: string }
  conversations: ConversationSummary[]
  activeId: string | null
  isLoading: boolean
  isError: boolean
  /** 仅影响 ≤850px 的抽屉位移；桌面端这一列始终在。 */
  open: boolean
  onNewConversation: () => void
  onSelect: (id: string) => void
}) {
  return (
    <aside
      id={SIDEBAR_ID}
      className={cn(
        'group bg-sidebar text-sidebar-foreground flex w-[280px] shrink-0 flex-col px-3 py-6',
        // ≤850px 变成覆盖式抽屉。z 必须高于遮罩（--z-overlay），否则一打开就被自己的
        // 遮罩盖住、点不动。
        'max-[850px]:fixed max-[850px]:inset-y-0 max-[850px]:left-0 max-[850px]:z-[var(--z-sidebar)]',
        'max-[850px]:transition-transform max-[850px]:duration-[250ms]',
        !open && 'max-[850px]:-translate-x-full',
      )}
    >
      <div className="flex items-center gap-[11px] px-2 pb-[25px]">
        <img src={brandLogo} alt="" className="size-9 shrink-0 object-contain" />
        <div>
          <strong className="block text-[15px] font-medium text-white">AI Copilot</strong>
          <span className="text-sidebar-muted mt-0.5 block text-xs">运营助手</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onNewConversation}
        className={cn(
          'border-sidebar-surface-border bg-sidebar-surface flex w-full items-center gap-2',
          'rounded-[9px] border px-3 py-[11px] text-sm font-medium text-white',
          // 设计稿基础规则里这里是薄荷绿，但末尾的覆盖块改成了琥珀色（呼应 logo）。
          'hover:border-sidebar-accent hover:shadow-[0_0_12px_rgba(192,124,48,.18)]',
          'transition-colors',
        )}
      >
        <Plus size={16} strokeWidth={2} aria-hidden />
        新建会话
        {/* 真的绑了 ⌘K，见 AppLayout 的全局 keydown。
            字号跟按钮文案一样是 14px（设计稿原值 12px 太小，⌘ 这个字形挤成一团看不清）。

            **刻意不用 font-mono**（设计稿原值是 DM Mono）：等宽栈里 ⌘ 这个字形画得
            明显比字母矮，和旁边的 K 不协调。canvas 实测 14px 下的字高 ——
              等宽：⌘ 7.4px / K 10.2px（矮 27%）
              无衬线：⌘ 10.1px / K 9.9px（基本一致）
            SF Pro 这类系统 UI 字体是按大写高度来设计 ⌘ 的，所以跟着正文字体走就对齐了。
            别为了「快捷键要用等宽」把 font-mono 加回来，那样得再手调 ⌘ 的字号去补。

            font-sans **必须显式写**：Tailwind 的 Preflight 里有一条
            `code, kbd, samp, pre { font-family: <mono> }`，光是不写 font-mono
            还是会拿到等宽字体（实测计算值仍是 ui-monospace）。 */}
        <kbd className="text-sidebar-muted ml-auto font-sans text-sm">⌘ K</kbd>
      </button>

      {/* flex-1 + overflow-y-auto：设计稿只有 3 条假数据，靠 margin-top:auto 就够；
          真接了 30 条会把下面的用户信息顶出视口。 */}
      <nav
        className={cn(
          'scrollbar-sidebar group-hover:scrollbar-sidebar-visible group-focus-within:scrollbar-sidebar-visible',
          'mt-[25px] min-h-0 flex-1 overflow-y-auto',
          // 负右边距把 nav 的右缘顶出 aside 的 px-3(12px)，滚动条才能靠到侧边栏右侧。
          // 顶 10px 而不是 12px，留 2px 不顶满 —— 滚动条紧贴面板边缘会显得很挤。
          //
          // 列表项的右边距是**跟着这个值算出来的**，不用另外调：滚动条槽固定在 nav 的
          // padding box 右缘，CSS 没法单独把它往里挪，所以这 2px 只能从列表项右侧让
          // 出来。于是列表项落在左 12px / 右 13px。留白越大，列表项就越偏左（留 4px
          // 时是 12/15），2px 这一档差 1px，看不出来。
          //
          // 槽宽恒定（scrollbar-width 始终是 thin），所以滚动条显隐不会推动列表项。
          '-mr-2.5',
        )}
      >
        <p className="text-sidebar-label px-2.5 pb-2 font-mono text-[10px] tracking-[.14em] uppercase">
          历史会话
        </p>

        {isLoading && (
          <div className="space-y-2 px-[11px] py-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-sidebar-hover h-3 animate-pulse rounded" />
            ))}
          </div>
        )}

        {/* 侧边栏取数失败不该影响主对话，所以只是一行小字，不是 ErrorNotice。 */}
        {isError && <p className="text-sidebar-label px-[11px] text-[11px]">加载失败</p>}

        {!isLoading && !isError && conversations.length === 0 && (
          <p className="text-sidebar-label px-[11px] text-[11px]">还没有会话</p>
        )}

        {conversations.map((conversation) => {
          const isActive = conversation.id === activeId
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'mb-[3px] block w-full rounded-lg px-[11px] py-2.5 text-left transition-colors',
                isActive
                  ? 'bg-sidebar-hover text-white'
                  : 'text-sidebar-item hover:bg-sidebar-hover hover:text-white',
              )}
            >
              {/* title 要等首条消息落库才由服务端生成，草稿阶段是 null。 */}
              <span className="block truncate text-[13px]">
                {conversation.title ?? '未命名会话'}
              </span>
              <span className="mt-1 block truncate text-[11px] text-[#657187]">
                {formatRelativeTime(conversation.updated_at)}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto">
        <div className="border-sidebar-border mt-3.5 flex items-center gap-[9px] border-t px-[5px] pt-[18px]">
          <span className="bg-sidebar-avatar grid size-8 shrink-0 place-items-center rounded-full font-mono text-xs text-white">
            {initialsOf(user.displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-xs font-medium text-white">
              {user.displayName}
            </strong>
            {/* 设计稿这里是「资深运营」之类的角色，但 useCurrentUser() 只有 id 和显示名。
                不为了填满版面去编造角色 —— 显示 userId，同样是两行，而且是真数据。 */}
            <span className="block truncate text-[10px] text-[#7b879a]">{user.userId}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
