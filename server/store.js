/**
 * PaulFolio — Penyimpanan lokal berbasis file JSON.
 *
 * Semua data (proyek, pesan kontak, hash password admin) ada di
 * data/data.json. Gambar yang di-upload disimpan di uploads/.
 *
 * Penulisan diserialisasi lewat antrean dan dilakukan atomik
 * (tulis ke file sementara lalu rename) supaya data.json tidak
 * pernah setengah tertulis.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const DATA_FILE = path.join(DATA_DIR, 'data.json');
export const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

const EMPTY = { admin: { passwordHash: null, sessionSecret: null }, projects: [], messages: [] };

let queue = Promise.resolve();

export async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    return {
      admin: { ...EMPTY.admin, ...(data.admin || {}) },
      projects: Array.isArray(data.projects) ? data.projects : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
  } catch (e) {
    if (e.code === 'ENOENT') return structuredClone(EMPTY);
    throw e;
  }
}

async function writeData(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.' + process.pid + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

/**
 * Baca data, jalankan `mutator(data)`, lalu simpan.
 * Nilai kembalian mutator diteruskan ke pemanggil.
 */
export function updateData(mutator) {
  const run = queue.then(async () => {
    const data = await readData();
    const result = await mutator(data);
    await writeData(data);
    return result;
  });
  // Error satu operasi tidak boleh memblokir antrean berikutnya.
  queue = run.catch(() => {});
  return run;
}
