import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './', // 使用相对路径，便于部署到任意子路径（包括 dist 直接打开）
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      // 把 /api/ollama 代理到本地 Ollama，避开浏览器 CORS preflight
      // （Ollama 默认 OLLAMA_ORIGINS 不允许跨 origin POST，GET ping 不受影响）
      '/api/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
      },
    },
  },
});
