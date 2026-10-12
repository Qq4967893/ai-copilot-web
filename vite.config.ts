import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Vitest 配置也放在这里，不另起 vitest.config.ts —— 见 tsconfig.json 的注释。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8082'
  const proxy = { target, changeOrigin: true }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // 固定 5173：ai-copilot-api 的 config.example.json 只把 5173 加进了
      // CORS 白名单。strictPort 让端口被占时直接失败，而不是悄悄换一个。
      port: 5173,
      strictPort: true,
      // 健康检查在 /api 之外，所以要单独转发。
      proxy: {
        '/api': proxy,
        '/healthz': proxy,
        '/readyz': proxy,
      },
    },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      css: false,
    },
  }
})
