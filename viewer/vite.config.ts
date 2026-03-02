import { defineConfig } from 'vite';

export default defineConfig({
  base: '/viewer/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/data': 'http://localhost:3132',
    }
  }
});
