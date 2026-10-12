import { useEffect, useRef } from 'react'

/**
 * 流式追加时自动贴底，但用户手动往上翻之后就不再抢滚动位置 ——
 * 正在看前面内容时被拽回底部是很烦的。
 */
export function useAutoScroll<T extends HTMLElement>(dependency: unknown) {
  const ref = useRef<T>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const onScroll = () => {
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight
      // 留一点容差，避免亚像素滚动导致判定抖动。
      stickToBottom.current = distance < 32
    }

    node.addEventListener('scroll', onScroll, { passive: true })
    return () => node.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const node = ref.current
    if (node && stickToBottom.current) {
      node.scrollTop = node.scrollHeight
    }
  }, [dependency])

  return ref
}
