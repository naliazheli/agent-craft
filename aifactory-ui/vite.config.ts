import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

function normalizeViteBase(value: string | undefined) {
  const raw = (value || '/').trim()
  if (!raw || raw === '/') return '/'

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`
  return `${withLeadingSlash.replace(/\/+$/, '')}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devPort = Number(env.VITE_DEV_PORT || env.AGENTCRAFT_UI_DEV_PORT || process.env.VITE_DEV_PORT || process.env.AGENTCRAFT_UI_DEV_PORT || 5174)
  const apiPort = env.AGENTCRAFT_API_PORT || process.env.AGENTCRAFT_API_PORT || '3100'
  const mcpPort = env.AGENTCRAFT_MCP_PORT || process.env.AGENTCRAFT_MCP_PORT || '3101'

  return {
    base: normalizeViteBase(env.VITE_APP_BASE_PATH || process.env.VITE_APP_BASE_PATH),
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) return 'react'
            if (/[\\/]node_modules[\\/](katex|react-markdown|rehype-katex|remark-breaks|remark-math)[\\/]/.test(id)) {
              return 'math'
            }
            if (/[\\/]node_modules[\\/](@radix-ui|lucide-react)[\\/]/.test(id)) return 'ui'
            return undefined
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: devPort,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        '/mcp': {
          target: `http://localhost:${mcpPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
