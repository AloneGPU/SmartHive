import * as path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './', // 关键配置：设置为相对路径，确保在 GitHub Pages 等子目录下也能正常加载
    server: {
      host: true, // 允许局域网访问 (比如用手机连接电脑的 WiFi IP)
      port: 5173, // 明确指定前端端口，避免与后端 3001 冲突
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        }
      }
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.QWEN_API_KEY || env.API_KEY),
      'process.env.QWEN_API_KEY': JSON.stringify(env.QWEN_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html')
        },
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'charts-vendor': ['recharts'],
            'icons-vendor': ['lucide-react']
          }
        }
      },
      chunkSizeWarningLimit: 1000 // 增加块大小警告限制
    }
  };
});