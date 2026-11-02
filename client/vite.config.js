import { defineConfig } from 'vite';

export default defineConfig({
  base: '/react/',
  server: {
    port: 5173,
    strictPort: true,
  },
});
