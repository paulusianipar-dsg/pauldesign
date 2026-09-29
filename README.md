# PaulFolio

Website portfolio **sepenuhnya statis**. Tidak ada backend, tidak ada database,
tidak ada fungsi serverless — hasil `npm run build` bisa di-host di mana saja
(Vercel, Netlify, GitHub Pages, Nginx, atau hosting shared hosting).

## Struktur data

| Lokasi               | Isi                                                             |
| -------------------- | --------------------------------------------------------------- |
| `data/projects.json` | Daftar proyek yang dirender di halaman beranda & projects        |

Tidak ada file lain yang perlu dikelola. Gambar proyek memakai aset statis di
`assets/`, dan form kontak meneruskan pesan ke WhatsApp Paulus.

## Menjalankan

```bash
npm install
npm run dev            # development: http://localhost:5173
npm run build          # hasil build di dist/
npm run preview        # cek hasil build secara lokal
```

Folder `dist/` adalah output final. Untuk hosting, cukup unggah isinya — atau
hubungkan repo ke Vercel dengan preset **Vite** (framework preset sudah
mengenali build + static output).

## Menambah / mengubah proyek

Edit `data/projects.json` lalu commit & deploy. Vite meng-inline file ini ke
bundle, jadi tidak ada request jaringan tambahan saat halaman dimuat.

Struktur satu proyek:

```json
{
  "id": "cd000001-0000-4000-8000-000000000001",
  "title": "Creative Design",
  "category": "Creative Design",
  "description": "Ringkasan singkat untuk kartu proyek.",
  "challenges": "Tantangan utama proyek.",
  "solutions": "Solusi yang diterapkan.",
  "image": "./assets/images/slides/slide1.jpg",
  "tech_stack": ["Adobe Illustrator", "Canva"],
  "client": "PaulFolio Studio",
  "period": "Berkelanjutan",
  "created_at": "2026-01-05T00:00:00.000Z"
}
```

Halaman beranda dan `projects.html` menampilkan proyek **terbaru lebih dulu**,
diurutkan berdasarkan `created_at` (format ISO 8601). `id` dipakai untuk
deep-link: `projects.html?id=<id>` langsung membuka detail proyek tersebut.

## Form kontak

Tidak ada server yang menerima pesan, jadi form di `contact.html` tidak mengirim
ke backend. Isi form dirangkai menjadi pesan teks lalu membuka
`https://wa.me/<nomor>?text=...` di tab baru. Nomor WhatsApp ada di
`script.js` (`WHATSAPP_NUMBER`) dan di tautan CTA pada `contact.html`.

Kalau nanti butuh pengumpulan pesan yang tersimpan di server, itu harus
dibuatkan ulang sebagai layanan terpisah (Vercel Functions + database
terkelola) — bukan dengan menulis file lokal.
