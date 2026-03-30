import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'static',
  build: {
    outDir: 'dist-vite',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
  // Keep CDN dynamic imports for MediaPipe untouched
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
});
