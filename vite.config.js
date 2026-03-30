import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-static',
      closeBundle() {
        // Copy static/ → dist-vite/static/ preserving the path prefix
        // (publicDir copies contents to root, but code expects /textflow/static/*)
        cpSync('static', 'dist-vite/static', { recursive: true });
      },
    },
  ],
  root: '.',
  publicDir: false,
  base: '/textflow/',
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
