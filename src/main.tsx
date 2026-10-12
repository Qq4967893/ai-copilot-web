import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { createQueryClient } from '@/lib/query-client'
import { setupObservability } from '@/lib/observability'
import { router } from '@/routes/router'

import '@/styles/index.css'

// 目前是空实现，见 lib/observability.ts 里关于接 OTel 时要做什么的说明。
setupObservability()

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
