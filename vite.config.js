import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Local HTTPS (via localhost.pem/localhost-key.pem) is only for the dev
// server on developer machines. Production is deployed behind Coolify's
// Traefik reverse proxy, which terminates HTTPS itself, and the cert files
// are gitignored and not present during the Docker build — so they must
// never be read outside of `vite dev`.
const isDevServer = process.env.NODE_ENV !== 'production';
const hasLocalCerts = isDevServer
  && fs.existsSync('./localhost-key.pem')
  && fs.existsSync('./localhost.pem');

// Tesseract.js loads its worker script and WASM core via cross-origin
// `importScripts()` calls. The jsdelivr CDN it defaults to doesn't send a
// Cross-Origin-Resource-Policy header, so those loads get blocked once
// COEP: require-corp is enabled (needed for SharedArrayBuffer). Vendoring
// the files this app actually uses (LSTM engine only) into public/ serves
// them same-origin instead, sidestepping COEP entirely. Copied into
// public/ (not committed) so it stays in sync with the installed package
// versions and is present for both `vite dev` and `vite build`.
function vendorTesseractAssets() {
  const files = [
    ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
    ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/core/tesseract-core-lstm.wasm.js'],
    ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/core/tesseract-core-simd-lstm.wasm.js']
  ];

  return {
    name: 'vendor-tesseract-assets',
    buildStart() {
      for (const [src, dest] of files) {
        const srcPath = path.resolve('node_modules', src);
        const destPath = path.resolve('public', dest);
        if (fs.existsSync(destPath)) continue;
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };
}

export default defineConfig({
  root: '.',
  plugins: [vendorTesseractAssets()],
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
