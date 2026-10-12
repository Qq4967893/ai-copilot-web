import { useEffect, useState } from 'react'

import { cn } from '@/lib/cn'

/**
 * 一句话提示（设计稿的 .toast）。
 *
 * 刻意不引 sonner / radix-toast：全站只有「已复制」和「已记录反馈」两条提示，
 * 为它们加一个依赖不划算。需要排队、需要多条并存时再换。
 */
export function Toast({ message, duration = 2200 }: { message: string | null; duration?: number }) {
  const [visible, setVisible] = useState(false)
  // message 变成 null 之后还要留着文字做淡出，否则会先变空再消失。
  const [shown, setShown] = useState<string | null>(null)

  useEffect(() => {
    if (message === null) return
    setShown(message)
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), duration)
    return () => clearTimeout(timer)
  }, [message, duration])

  if (shown === null) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'bg-sidebar fixed bottom-[120px] left-1/2 z-[var(--z-overlay)] -translate-x-1/2',
        'pointer-events-none rounded-lg px-[15px] py-2.5 text-xs text-white transition-opacity duration-250',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {shown}
    </div>
  )
}
