import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const devPort = Number(process.env.VITE_DEV_PORT || process.env.AGENTCRAFT_UI_DEV_PORT || 5174)
const apiPort = process.env.AGENTCRAFT_API_PORT || '3100'
const mcpPort = process.env.AGENTCRAFT_MCP_PORT || '3101'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          math: ['katex', 'react-markdown', 'rehype-katex', 'remark-breaks', 'remark-math'],
          ui: [
            '@radix-ui/react-avatar',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            'lucide-react',
          ],
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
})
