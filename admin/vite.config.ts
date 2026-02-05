import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// 从环境变量读取后端URL，默认使用线上地址
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'https://express-215695-6-1317586939.sh.run.tcloudbase.com';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3002,
    open: true, // 自动打开浏览器
    proxy: {
      '/admin-api': {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
