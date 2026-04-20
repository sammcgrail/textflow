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
    {
      // Vite/Rolldown's HTML parser silently strips maximum-scale=1.0 from
      // the viewport meta. Re-inject it post-transform so the mobile
      // baseline check passes. Anchor on "user-scalable=no" which survives.
      name: 'fix-viewport-maximum-scale',
      transformIndexHtml(html) {
        return html.replace(
          /(<meta name="viewport" content="[^"]*?)(, user-scalable=no)/,
          '$1, maximum-scale=1.0$2'
        );
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
