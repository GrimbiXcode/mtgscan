import { defineConfig } from 'vite';
import fs from 'fs';

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    host: true, // Allow external connections for mobile testing
    https: {
      key: fs.readFileSync('./localhost-key.pem'),
      cert: fs.readFileSync('./localhost.pem')
    },
    headers: {
      // Required for SharedArrayBuffer (Tesseract.js performance)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Separate chunk for Tesseract.js
        manualChunks: {
          'tesseract': ['tesseract.js']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['tesseract.js'],
    exclude: ['tesseract.js/dist/worker.min.js'] // Let Tesseract handle worker loading
  },
  worker: {
    format: 'es'
  },
  define: {
    // Ensure proper environment detection for Tesseract.js
    global: 'globalThis'
  }
});
