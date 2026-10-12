import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { ALLOWED_ELEMENTS, sanitizeUrl } from '@/lib/markdown'

/**
 * 助手消息的受限 Markdown 渲染 —— 全项目**唯一**的富文本出口。
 *
 * 安全策略集中在 lib/markdown.ts，改这里之前先读那边的注释。要点：
 * 没有 rehype-raw，所以原始 HTML 被整体丢弃；元素白名单对齐技术设计 §4.4；
 * 链接经过 scheme 白名单过滤。
 *
 * 排版对应设计稿的 .plain-answer —— 助手回答不套卡片，就是一段正文，所以标题层级、
 * 行高和表格样式都落在这里，而不是外面的气泡上。
 */
export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="space-y-3 text-sm leading-[1.8] break-words">
      <Markdown
        remarkPlugins={[remarkGfm]}
        allowedElements={[...ALLOWED_ELEMENTS]}
        // 被过滤掉的元素不连带吞掉里面的文字，避免内容凭空消失。
        unwrapDisallowed
        urlTransform={sanitizeUrl}
        components={{
          h1: ({ children }) => <h2 className="text-lg font-medium">{children}</h2>,
          h2: ({ children }) => <h2 className="text-lg font-medium">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-6 mb-2.5 text-sm font-medium">{children}</h3>,
          h4: ({ children }) => <h4 className="mt-6 mb-2.5 text-sm font-medium">{children}</h4>,
          p: ({ children }) => <p className="text-[#4e5969]">{children}</p>,
          a: ({ href, children }) =>
            href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#16735a] underline underline-offset-[3px]"
              >
                {children}
              </a>
            ) : (
              // scheme 被过滤掉了。渲染成纯文本，而不是一个点不动的死链接。
              <span>{children}</span>
            ),
          // 宽表格不能撑破整个对话布局（技术设计 §24.1 的「长文本」关注点）。
          // overflow-x-auto 这个 class 名有测试直接查，换成 overflow-auto 会挂。
          table: ({ children }) => (
            <div className="border-border overflow-x-auto rounded-[10px] border">
              <table className="w-full min-w-[630px] border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          // style 要透传：GFM 的 |---:| 对齐是 remark 放在 style.textAlign 上的，
          // 丢掉它数字列就会全部左对齐。只接这一个属性而不是 {...props} ——
          // 没有 rehype-raw 时属性全由 remark 生成、用户注入不了，但显式列出更清楚。
          th: ({ children, style }) => (
            <th style={style} className="bg-surface px-[13px] py-2.5 font-medium text-[#8993a2]">
              {children}
            </th>
          ),
          // 只有横线、没有竖线 —— 设计稿的表格是这个样子。
          td: ({ children, style }) => (
            <td style={style} className="border-border border-t p-[13px] text-[#4e5969]">
              {children}
            </td>
          ),
          pre: ({ children }) => (
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">{children}</pre>
          ),
          code: ({ children }) => (
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
          ),
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-6 text-[#4e5969]">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-6 text-[#4e5969]">{children}</ol>
          ),
          li: ({ children }) => <li className="py-[3px]">{children}</li>,
          // 列表项里的加粗是「小标题」的用法，要比正文深一档才看得出层次。
          strong: ({ children }) => (
            <strong className="text-foreground font-medium">{children}</strong>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
