# PaulFolio

Website portfolio + dashboard admin. Semua data disimpan **lokal di folder project**,
tanpa database atau backend eksternal.

## Struktur data

| Lokasi            | Isi                                                        |
| ----------------- | ---------------------------------------------------------- |
| `data/data.json`  | Proyek, pesan kontak, dan hash password admin              |
| `uploads/`        | Gambar proyek yang di-upload dari dashboard admin          |
| `server/`         | API lokal kecil (Node.js bawaan, tanpa dependency)         |

`data/data.json` tidak pernah disajikan ke browser (request ke file itu selalu 404).

## Menjalankan

```bash
npm install
npm run dev          # development: http://localhost:5173
```

Produksi (butuh Node.js di server, karena admin menulis ke `data.json` dan `uploads/`):

```bash
npm run build
npm start            # http://localhost:3000  (ubah dengan PORT=xxxx npm start)
```

> Hosting statis/serverless (misalnya Vercel, Netlify, GitHub Pages) **tidak bisa**
> menyimpan perubahan dari dashboard admin, karena filesystem-nya read-only / tidak persisten.
> Gunakan VPS atau hosting yang bisa menjalankan `npm start`.

## Admin

- Login: `/auth.html` — hanya password.
- Password default: `gmi2026` (disimpan sebagai hash **scrypt** + salt di `data/data.json`).
- Ganti password:

  ```bash
  npm run set-password -- passwordBaru
  ```

  Semua sesi admin yang sedang aktif otomatis logout.

Sesi admin memakai cookie `HttpOnly` + `SameSite=Strict` yang ditandatangani HMAC
(berlaku 12 jam). Login dibatasi 5 percobaan gagal per 15 menit per IP.

## Backup

Cukup salin folder `data/` dan `uploads/`.
