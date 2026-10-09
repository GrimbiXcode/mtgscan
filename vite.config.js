import { defineConfig, loadEnv } from 'vite';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

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
// them same-origin instead, sidestepping COEP entirely. The English
// language data (@tesseract.js-data/eng, the same file Tesseract would
// fetch from jsdelivr) is vendored too, so the app makes no CDN requests at
// all - main.js points `langPath` at it. Copied into public/ (not
// committed) so it stays in sync with the installed package versions and
// is present for both `vite dev` and `vite build`.
function vendorTesseractAssets() {
  const files = [
    ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
    ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/core/tesseract-core-lstm.wasm.js'],
    ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/core/tesseract-core-simd-lstm.wasm.js'],
    ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'tesseract/lang/eng.traineddata.gz']
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

// Operator details for the legal pages come from LEGAL_OPERATOR_* (same
// variables and notation as filahub). In the Docker image they're filled in
// at container start by docker/legal-operator.sh; this does the same for
// `vite dev`/`vite preview`, reading the shell environment and .env. Keep the
// two renderers in sync.
function renderLegalValue(key, raw) {
  const lines = (raw ?? '')
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\+n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;'));
  return lines.length
    ? lines.join('<br>')
    : `<em class="legal-missing">[Angabe fehlt: ${key}]</em>`;
}

function legalOperatorDetails() {
  let env = {};
  // `vite dev` renders the sources in public/; `vite preview` the built
  // copies in dist/, which is what production serves (e.g. with the
  // versioned stylesheet link from versionStylesheetLinks).
  const middleware = (dirs) => (req, res, next) => {
    const url = (req.url ?? '').split('?')[0];
    const candidates = dirs.map((dir) => path.resolve(dir, '.' + url));
    const file = url.endsWith('.html') && candidates.find((f) => fs.existsSync(f));
    if (!file) return next();
    const html = fs.readFileSync(file, 'utf-8');
    if (!html.includes('{{LEGAL_OPERATOR_')) return next();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html.replace(/\{\{(LEGAL_OPERATOR_[A-Z]+)\}\}/g, (_, key) => renderLegalValue(key, env[key])));
  };

  return {
    name: 'legal-operator-details',
    configResolved(config) {
      env = { ...loadEnv(config.mode, process.cwd(), 'LEGAL_OPERATOR_'), ...process.env };
    },
    configureServer(server) {
      server.middlewares.use(middleware(['public', 'dist']));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(['dist', 'public']));
    }
  };
}

// public/style.css keeps its name in the build, so a browser or proxy may
// keep serving an old copy after a deploy - the redesign showed up on the
// test system with the new HTML but the cached old stylesheet. The built
// HTML pages (index.html and the legal pages copied from public/) therefore
// link it with a content hash, `style.css?v=<hash>`: every CSS change gets a
// new URL. `vite dev` serves the plain link, nothing is cached there.
function versionStylesheetLinks() {
  let version = '';
  const versioned = (html) => html.replace(/href="\/?style\.css"/g, `href="/style.css?v=${version}"`);

  return {
    name: 'version-stylesheet-links',
    apply: 'build',
    buildStart() {
      version = createHash('sha256').update(fs.readFileSync('public/style.css')).digest('hex').slice(0, 12);
    },
    transformIndexHtml: {
      order: 'post',
      handler: versioned
    },
    // The legal pages are plain files from public/ - rewrite their copies
    closeBundle() {
      const outDir = path.resolve('dist');
      for (const file of fs.readdirSync('public').filter(name => name.endsWith('.html'))) {
        const target = path.join(outDir, file);
        if (fs.existsSync(target)) {
          fs.writeFileSync(target, versioned(fs.readFileSync(target, 'utf-8')));
        }
      }
    }
  };
}

export default defineConfig({
  root: '.',
  plugins: [vendorTesseractAssets(), legalOperatorDetails(), versionStylesheetLinks()],
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
