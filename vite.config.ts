import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy all API calls starting with `/api` to the backend server
      '/api': {
        target: 'http://localhost:5000',  // Backend server URL
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),  // Optional, based on server API paths
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
