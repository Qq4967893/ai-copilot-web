/**
 * 受限 Markdown 渲染策略（技术设计 §4.4）。
 *
 * 硬要求原文：「不支持任意 HTML。Markdown 渲染需要做 XSS 防护和 URL scheme 过滤。」
 * §24.1 也把 XSS 列为 Web 的重点测试项。这是前端最强的一条 NFR。
 *
 * 为什么选 react-markdown 而不是 marked + DOMPurify：
 * react-markdown 根本不走 dangerouslySetInnerHTML，它把 markdown 解析成 AST 再直接
 * 构造 React 元素。**只要不引入 rehype-raw，原始 HTML 就被整体丢弃**，这在结构上
 * 等价于「不支持任意 HTML」，而不是依赖一份 sanitize 配置写得对。
 *
 * 由此推出一条不可退让的规则：**这个项目永远不准引入 rehype-raw。**
 *
 * 也因此不需要 rehype-sanitize：没有 rehype-raw 时，hast 树上的属性全部由 remark
 * 从 markdown 语法生成，用户无法注入任意属性。唯一用户可控的属性是链接的 href，
 * 由下面的 sanitizeUrl 兜住；img 直接不在白名单里。
 */

/**
 * 允许渲染的元素，严格对齐 §4.4 列出的能力：
 * Text / Paragraph / Heading / Ordered List / Unordered List / Simple Table /
 * Inline Code / Code Block / Link / Error-Warning。
 *
 * 刻意**不包含 img**：§4.4 没列图片，而 img 既是对外信标（泄露运营在看什么），
 * 也是经典的 onerror XSS 载体。
 */
export const ALLOWED_ELEMENTS = [
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'code',
  'pre',
  'a',
  'strong',
  'em',
  'del',
  'blockquote',
] as const

/** 只放行这三种 scheme。相对路径也放行；其余一律丢掉。 */
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto'])

/**
 * 控制字符 + 空白。浏览器判断 scheme 前会先剥掉它们，所以我们也得先剥。
 */
// 正是要匹配控制字符：浏览器判断 scheme 前会先把它们剥掉，这里不剥就会漏掉
// `java<TAB>script:` 这类绕过。
// eslint-disable-next-line no-control-regex
const IGNORED_IN_SCHEME = /[\u0000-\u0020\u007f-\u00a0]/g

/**
 * URL scheme 过滤。
 *
 * react-markdown 自带的 defaultUrlTransform 已经做了类似的事，但 §4.4 是硬 NFR，
 * 值得有一份能指着看、能单独测的白名单实现。
 *
 * 挡掉的东西：javascript: / data: / vbscript: / blob: / file:，以及它们的花式变形
 * （大小写混写、scheme 中间插控制字符或空白、前导控制字符）。
 * 协议相对地址 //evil.com 也挡掉 —— 它继承当前页面的 scheme 指向外部站点，
 * 属于需要显式决定的跳转，不该由 markdown 悄悄产生。
 */
export function sanitizeUrl(url: string): string {
  // 先剥掉控制字符和空白：scheme 中间插一个 TAB 仍会被浏览器当成 javascript: 执行。
  const cleaned = url.replace(IGNORED_IN_SCHEME, '')

  if (cleaned.startsWith('//')) return ''

  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned)
  if (!match) return url // 没有 scheme，是相对路径，放行
  // 捕获组一定存在，但 noUncheckedIndexedAccess 要求显式兜一下。
  const scheme = (match[1] ?? '').toLowerCase()
  return ALLOWED_SCHEMES.has(scheme) ? url : ''
}
