import { defineConfig } from 'vite';
import fs from 'fs';

// Local HTTPS (via localhost.pem/localhost-key.pem) is only for the dev
// server on developer machines. Production is deployed behind Coolify's
// Traefik reverse proxy, which terminates HTTPS itself, and the cert files
// are gitignored and not present during the Docker build — so they must
// never be read outside of `vite dev`.
const isDevServer = process.env.NODE_ENV !== 'production';
const hasLocalCerts = isDevServer
  && fs.existsSync('./localhost-key.pem')
  && fs.existsSync('./localhost.pem');

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    host: true, // Allow external connections for mobile testing
    https: hasLocalCerts ? {
      key: fs.readFileSync('./localhost-key.pem'),
      cert: fs.readFileSync('./localhost.pem')
    } : undefined,
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
