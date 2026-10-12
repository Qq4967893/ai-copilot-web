import type * as React from 'react'

import { cn } from '@/lib/cn'

/** shadcn/ui 的 Textarea，项目内持有。 */
export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'placeholder:text-muted-foreground w-full resize-none rounded-md bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
