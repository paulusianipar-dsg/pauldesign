/**
 * PaulFolio — Server produksi.
 *
 * Menyajikan hasil build (dist/) + API lokal + folder uploads/.
 * Jalankan setelah `npm run build`:
 *   npm start            (default port 3000, ubah dengan PORT=xxxx)
 */
import http from 'node:http';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { apiMiddleware } from './api.js';
import { ROOT_DIR } from './store.js';

const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

async function serveStatic(req, res) {
  let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = path.join(DIST_DIR, path.normalize(pathname));
  if (!file.startsWith(DIST_DIR + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  } catch (_) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — Halaman tidak ditemukan');
  }
}

http
  .createServer((req, res) => {
    apiMiddleware(req, res, () => serveStatic(req, res));
  })
  .listen(PORT, () => {
    console.log(`PaulFolio berjalan di http://localhost:${PORT}`);
  });
