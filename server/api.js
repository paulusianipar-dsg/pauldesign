/**
 * PaulFolio — API lokal (tanpa dependency eksternal).
 *
 * Dipasang sebagai middleware connect-style, jadi bisa dipakai oleh
 * Vite (dev & preview) maupun server produksi di server/index.js.
 *
 * Endpoint publik:
 *   GET    /api/projects             daftar proyek
 *   POST   /api/messages             kirim pesan dari form kontak
 *   GET    /api/session              cek apakah admin sudah login
 *   POST   /api/login                { password }
 *   POST   /api/logout
 *
 * Endpoint admin (butuh cookie sesi):
 *   POST   /api/projects             tambah proyek
 *   PUT    /api/projects/:id         ubah proyek
 *   DELETE /api/projects             { ids: [] }
 *   GET    /api/messages             daftar pesan
 *   PATCH  /api/messages             { ids: [], is_read }
 *   DELETE /api/messages             { ids: [] }
 *   POST   /api/upload               body = file gambar mentah
 *
 * File statis tambahan:
 *   GET    /uploads/<file>           gambar yang di-upload admin
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { readData, updateData, UPLOADS_DIR } from './store.js';
import { verifyPassword } from './password.js';

const SESSION_COOKIE = 'pf_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 100 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

// ============================================================
// UTIL HTTP
// ============================================================
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Ukuran data terlalu besar.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, MAX_JSON_BYTES);
  if (buf.length === 0) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (_) {
    throw new HttpError(400, 'Format JSON tidak valid.');
  }
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function isHttps(req) {
  return req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
}

// ============================================================
// RATE LIMIT (in-memory, cukup untuk satu proses)
// ============================================================
function createLimiter(max, windowMs) {
  const hits = new Map();
  return {
    blocked(key) {
      const entry = hits.get(key);
      if (!entry || entry.reset < Date.now()) return false;
      return entry.count >= max;
    },
    hit(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.reset < now) hits.set(key, { count: 1, reset: now + windowMs });
      else entry.count++;
    },
    clear(key) {
      hits.delete(key);
    },
  };
}

const loginLimiter = createLimiter(5, 15 * 60 * 1000);
const messageLimiter = createLimiter(5, 60 * 1000);

// ============================================================
// SESI ADMIN
//
// Token = "<expiry>.<hmac>". HMAC ikut menandatangani hash password,
// jadi mengganti password otomatis membatalkan semua sesi lama.
// ============================================================
async function getSessionSecret() {
  const data = await readData();
  if (data.admin.sessionSecret) return data.admin;
  return updateData(d => {
    if (!d.admin.sessionSecret) d.admin.sessionSecret = randomBytes(32).toString('hex');
    return d.admin;
  });
}

function sign(admin, expiry) {
  return createHmac('sha256', admin.sessionSecret)
    .update(expiry + '.' + (admin.passwordHash || ''))
    .digest('base64url');
}

async function createSessionCookie(req) {
  const admin = await getSessionSecret();
  const expiry = Date.now() + SESSION_TTL_MS;
  const token = expiry + '.' + sign(admin, expiry);
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    isHttps(req) ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

async function isAuthenticated(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const [expiryStr, sig] = token.split('.');
  const expiry = Number(expiryStr);
  if (!expiry || !sig || expiry < Date.now()) return false;

  const { admin } = await readData();
  if (!admin.sessionSecret || !admin.passwordHash) return false;

  const expected = Buffer.from(sign(admin, expiry));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function requireAdmin(req) {
  if (!(await isAuthenticated(req))) throw new HttpError(401, 'Sesi admin tidak valid. Silakan login ulang.');
}

// ============================================================
// VALIDASI
// ============================================================
function str(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function cleanImage(value) {
  const image = str(value, 1000);
  if (!image) return '';
  if (/^(https?:\/\/|\/|\.\/)/i.test(image)) return image;
  throw new HttpError(400, 'URL gambar harus diawali http(s)://, / atau ./');
}

function cleanProject(body) {
  const title = str(body.title, 150);
  const category = str(body.category, 60);
  if (!title || !category) throw new HttpError(400, 'Judul dan kategori proyek wajib diisi.');

  const techStack = Array.isArray(body.tech_stack) ? body.tech_stack : String(body.tech_stack || '').split(',');

  return {
    title,
    category,
    description: str(body.description, 2000),
    challenges: str(body.challenges, 2000),
    solutions: str(body.solutions, 2000),
    image: cleanImage(body.image),
    tech_stack: techStack.map(t => str(t, 40)).filter(Boolean).slice(0, 20),
    client: str(body.client, 150),
    period: str(body.period, 60),
  };
}

function cleanIds(body) {
  if (!Array.isArray(body.ids) || body.ids.length === 0) throw new HttpError(400, 'Daftar id kosong.');
  return new Set(body.ids.map(String));
}

// Cek signature file supaya file non-gambar tidak bisa menyamar lewat Content-Type.
function looksLikeImage(buf, mime) {
  const hex = buf.subarray(0, 12).toString('hex');
  switch (mime) {
    case 'image/png': return hex.startsWith('89504e470d0a1a0a');
    case 'image/jpeg': return hex.startsWith('ffd8ff');
    case 'image/gif': return hex.startsWith('47494638');
    case 'image/webp': return hex.startsWith('52494646') && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'image/avif': return buf.subarray(4, 8).toString('ascii') === 'ftyp';
    default: return false;
  }
}

async function removeUpload(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath.startsWith('/uploads/')) return;
  const file = path.join(UPLOADS_DIR, path.basename(imagePath));
  try {
    await fs.unlink(file);
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[API] Gagal menghapus gambar:', e.message);
  }
}

// ============================================================
// HANDLER
// ============================================================
const byNewest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

async function listProjects(req, res) {
  const { projects } = await readData();
  sendJson(res, 200, { projects: [...projects].sort(byNewest) });
}

async function createProject(req, res) {
  await requireAdmin(req);
  const payload = cleanProject(await readJson(req));
  const project = await updateData(data => {
    const p = { id: randomUUID(), ...payload, created_at: new Date().toISOString() };
    data.projects.push(p);
    return p;
  });
  sendJson(res, 201, { project });
}

async function updateProject(req, res, id) {
  await requireAdmin(req);
  const payload = cleanProject(await readJson(req));
  const { project, oldImage } = await updateData(data => {
    const p = data.projects.find(x => x.id === id);
    if (!p) throw new HttpError(404, 'Proyek tidak ditemukan.');
    const oldImage = p.image;
    Object.assign(p, payload, { updated_at: new Date().toISOString() });
    return { project: p, oldImage };
  });
  if (oldImage !== project.image) await removeUpload(oldImage);
  sendJson(res, 200, { project });
}

async function deleteProjects(req, res) {
  await requireAdmin(req);
  const ids = cleanIds(await readJson(req));
  const removed = await updateData(data => {
    const gone = data.projects.filter(p => ids.has(p.id));
    data.projects = data.projects.filter(p => !ids.has(p.id));
    return gone;
  });
  for (const p of removed) await removeUpload(p.image);
  sendJson(res, 200, { deleted: removed.length });
}

async function listMessages(req, res) {
  await requireAdmin(req);
  const { messages } = await readData();
  sendJson(res, 200, { messages: [...messages].sort(byNewest) });
}

async function createMessage(req, res) {
  const ip = clientIp(req);
  if (messageLimiter.blocked(ip)) throw new HttpError(429, 'Terlalu banyak pesan. Coba lagi sebentar lagi.');

  const body = await readJson(req);
  const message = {
    name: str(body.name, 100),
    email: str(body.email, 200),
    subject: str(body.subject, 200),
    message: str(body.message, 5000),
  };
  if (!message.name || !message.email || !message.message) {
    throw new HttpError(400, 'Nama, email, dan pesan wajib diisi.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.email)) {
    throw new HttpError(400, 'Format email tidak valid.');
  }

  messageLimiter.hit(ip);
  await updateData(data => {
    data.messages.push({ id: randomUUID(), ...message, is_read: false, created_at: new Date().toISOString() });
  });
  sendJson(res, 201, { ok: true });
}

async function markMessages(req, res) {
  await requireAdmin(req);
  const body = await readJson(req);
  const ids = cleanIds(body);
  const isRead = Boolean(body.is_read);
  const updated = await updateData(data => {
    let n = 0;
    for (const m of data.messages) {
      if (ids.has(m.id)) {
        m.is_read = isRead;
        n++;
      }
    }
    return n;
  });
  sendJson(res, 200, { updated });
}

async function deleteMessages(req, res) {
  await requireAdmin(req);
  const ids = cleanIds(await readJson(req));
  const deleted = await updateData(data => {
    const before = data.messages.length;
    data.messages = data.messages.filter(m => !ids.has(m.id));
    return before - data.messages.length;
  });
  sendJson(res, 200, { deleted });
}

async function uploadImage(req, res) {
  await requireAdmin(req);
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[mime];
  if (!ext) throw new HttpError(415, 'Format gambar harus JPG, PNG, WEBP, GIF, atau AVIF.');

  const buf = await readBody(req, MAX_IMAGE_BYTES);
  if (buf.length === 0) throw new HttpError(400, 'File gambar kosong.');
  if (!looksLikeImage(buf, mime)) throw new HttpError(415, 'Isi file bukan gambar yang valid.');

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const name = `p-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(UPLOADS_DIR, name), buf);
  sendJson(res, 201, { url: `/uploads/${name}` });
}

async function login(req, res) {
  const ip = clientIp(req);
  if (loginLimiter.blocked(ip)) {
    throw new HttpError(429, 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.');
  }

  const { password } = await readJson(req);
  const { admin } = await readData();
  if (!admin.passwordHash) {
    throw new HttpError(500, 'Password admin belum diset. Jalankan: npm run set-password');
  }

  if (!password || !verifyPassword(password, admin.passwordHash)) {
    loginLimiter.hit(ip);
    throw new HttpError(401, 'Password salah.');
  }

  loginLimiter.clear(ip);
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': await createSessionCookie(req) });
}

function logout(req, res) {
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
}

async function session(req, res) {
  sendJson(res, 200, { authenticated: await isAuthenticated(req) });
}

async function serveUpload(req, res, pathname) {
  const name = path.basename(decodeURIComponent(pathname));
  const mime = MIME_BY_EXT[name.split('.').pop().toLowerCase()];
  const file = path.join(UPLOADS_DIR, name);
  if (!mime) return false;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return false;
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
    return true;
  } catch (_) {
    return false;
  }
}

// ============================================================
// ROUTER
// ============================================================
const routes = [
  ['GET', /^\/api\/projects$/, listProjects],
  ['POST', /^\/api\/projects$/, createProject],
  ['PUT', /^\/api\/projects\/([\w-]+)$/, updateProject],
  ['DELETE', /^\/api\/projects$/, deleteProjects],
  ['GET', /^\/api\/messages$/, listMessages],
  ['POST', /^\/api\/messages$/, createMessage],
  ['PATCH', /^\/api\/messages$/, markMessages],
  ['DELETE', /^\/api\/messages$/, deleteMessages],
  ['POST', /^\/api\/upload$/, uploadImage],
  ['POST', /^\/api\/login$/, login],
  ['POST', /^\/api\/logout$/, logout],
  ['GET', /^\/api\/session$/, session],
];

export async function apiMiddleware(req, res, next) {
  const pathname = (req.url || '/').split('?')[0];

  // data.json berisi hash password; jangan pernah disajikan sebagai file statis.
  if (/data\.json/i.test(decodeURIComponent(pathname))) {
    res.writeHead(404);
    res.end();
    return;
  }

  if (pathname.startsWith('/uploads/') && (req.method === 'GET' || req.method === 'HEAD')) {
    if (await serveUpload(req, res, pathname)) return;
    res.writeHead(404);
    res.end();
    return;
  }

  if (!pathname.startsWith('/api/')) {
    next();
    return;
  }

  try {
    for (const [method, pattern, handler] of routes) {
      const match = pathname.match(pattern);
      if (match && req.method === method) {
        await handler(req, res, ...match.slice(1));
        return;
      }
    }
    throw new HttpError(404, 'Endpoint tidak ditemukan.');
  } catch (e) {
    if (!(e instanceof HttpError)) console.error('[API]', e);
    if (!res.headersSent) {
      sendJson(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'Terjadi kesalahan server.' });
    }
  }
}
