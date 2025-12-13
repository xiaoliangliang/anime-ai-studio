import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 代理 imgbb 图床上传，解决 CORS 问题
      '/api/imgbb': {
        target: 'https://api.imgbb.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/imgbb/, ''),
      },
    },
  },
})
