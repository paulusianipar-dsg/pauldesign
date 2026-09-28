/**
 * Ganti password admin.
 *   npm run set-password -- <password-baru>
 *
 * Hash scrypt disimpan di data/data.json. Semua sesi admin yang
 * sedang aktif otomatis tidak berlaku lagi.
 */
import { hashPassword } from '../server/password.js';
import { updateData, DATA_FILE } from '../server/store.js';

const password = process.argv[2];
if (!password || password.length < 6) {
  console.error('Pemakaian: npm run set-password -- <password-baru>  (minimal 6 karakter)');
  process.exit(1);
}

await updateData(data => {
  data.admin.passwordHash = hashPassword(password);
});
console.log(`Password admin diperbarui di ${DATA_FILE}`);
