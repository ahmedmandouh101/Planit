import { defineConfig } from 'vite';

export default defineConfig({
  base: '/react/',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/img': 'http://127.0.0.1:3000',
      '/demo-placeholder.svg': 'http://127.0.0.1:3000',
    },
  },
});
