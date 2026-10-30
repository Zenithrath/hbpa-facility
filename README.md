# Dashboard Facility PT HBPA

Frontend untuk Permintaan Transportasi & Peminjaman Inventaris.
Backend-nya Google Apps Script milik pihak lain; aplikasi ini cuma konsumen
API-nya lewat URL Web App.

## Menjalankan

```powershell
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/  (siap dipakai Laragon www atau Vercel)
npm run typecheck
```

## Yang wajib diisi

`src/config.ts` → `API_URL`

Dapatkannya dari pemilik Apps Script:

1. Dari editor Apps Script: **Deploy → New deployment → Web app**
2. **Execute as**: `Me` · **Who has access**: `Anyone`
3. Salin URL yang berakhiran `/exec`

Alternatif tanpa mengedit kode: buat file `.env.local`

```
VITE_GAS_URL=https://script.google.com/macros/s/AKfycb.../exec
```

Kalau `API_URL` masih kosong, aplikasi tetap jalan dan menampilkan
penjelasan, tidak error Misterius.

## Struktur

```
src/
  config.ts       semua pengaturan
  schema.ts       daftar field + tipe. sumber kebenaran tunggal
  api.ts          satu-satunya jalan ke Apps Script
  store.ts        status aplikasi
  ui.ts           komponen kecil (toast, drawer, form, badge, cetak)
  main.ts         shell, router hash, delegasi event
  pages/
    overview.ts   kartu statistik + kirim email
    transport.ts  daftar + drawer edit + cetak A5
    inventaris.ts daftar + drawer pengembalian + cetak A5
    daily-report.ts  daftar Daily Report dari Google Form + cetak PDF
    checklist.ts     form Checklist Kendaraan + tanda kerusakan
apps-script/
  Code.gs         serahkan ke pemilik Apps Script
```

### Menambah kolom baru

Tambah satu baris di `TRANSPORT_FIELDS` (`src/schema.ts`). Ikut berubah
otomatis: tipe TypeScript, kolom tabel, field di drawer, dan pembacaan form.
Backend tinggal menambah satu baris di `spec.fields` (`apps-script/Code.gs`).

### Kenapa tidak pakai React

Butuh satu tabel + tiga form. React menambah ~140 KB runtime dan konsep
(state, effect, memo) yang tidak dibayar oleh nilai yang diperoleh di sini.
Yang menggantikan React adalah `schema.ts` + `formField()`. Kalau nanti
aplikasinya tumbuh jadi banyak halaman dengan state bersama, baru pindah ke
React — seluruh data sudah melewati `api.ts`, jadi migrasinya hanya
lapisan tampilan.

## Catatan teknis

**CORS.** Apps Script tidak bisa mengirim header `Access-Control-Allow-Origin`.
Yang berhasil adalah permintaan **GET sederhana** (tanpa header khusus):
browser tidak mengirim preflight `OPTIONS`, jadi balasan boleh dibaca.

Konsekuensinya:

- Seluruh API memakai GET, **termasuk operasi tulis**.
- Jangan menambah header custom di `fetch` — CORS akan muncul lagi.
- Payload dibatasi `MAX_WRITE_BYTES` (4000 karakter). Dokumen DR/CK memakai
  `MAX_DOC_BYTES` (50.000 karakter) karena membawa PNG tanda kerusakan;
  kalau gambar terlalu besar, penanda tetap dikirim tanpa gambar.
- Side effect di URL `_t=<timestamp>` supaya tidak dilayani dari cache.

**Integritas baris.** Backend memetakan kolom dari *judul* di baris 1, bukan
nomor kolom, jadi urutan kolom bebas. Setiap baris membawa `sig`; kalau di
spreadsheet Someone sort atau hapus baris, penyimpanan ditolak dengan
pesan "Isi baris ini sudah berubah" daripada menimpa record yang salah.

**Menambah kolom inventaris.** `STATUS`, `TGL KEMBALI AKTUAL`, `CATATAN`, dan
`KONDISI KEMBALI n` dibuat otomatis saat pertama kali disimpan. Endpoint
`?action=diagnose` menampilkan kolom mana yang terdeteksi, mana yang akan
dibuat, dan mana yang bermasalah.

## Fitur

Semua fitur dari script aslimu ada di sini:

- Daftar permintaan: cari, filter status, filter divisi, tabel + kartu HP
- Edit per baris lewat drawer, lengkap dengan penjaga baris bergeser
- Buat permintaan baru
- Hapus permintaan
- Ekspor CSV (mengikuti filter yang sedang aktif)
- Cetak A5 — form permintaan transportasi dan form peminjaman barang
- Kirim email + lampiran PDF, per baris atau beberapa sekaligus
- **Email otomatis** tiap ada baris baru (Google Form atau ketik manual)
- Peminjaman inventaris: kondisi kembali tiap barang, catatan, cetak A5
- Pemetaan kolom dari **judul** di baris 1, bukan nomor kolom
- **Surat Tugas / Daily Report (FM-FCL-02.04)** — input lewat Google Form,
  dashboard menampilkan daftar read-only + detail, PDF A5 landscape dibuat
  on-demand saat tombol cetak diklik
- **Checklist Kendaraan (FM-FCL-02.04)** — form web per grup item dari master,
  gauge solar masuk/kembali, klik-lokasi tanda kerusakan di bodi + catatan,
  tangkapan PNG, PDF A4 portrait gaya kertas asli

## Pemasangan di Apps Script

```
1. Ganti isi Code.gs dengan file apps-script/Code.gs
2. Buka Project Settings, pastikan "Show appsscript.json manifest file" aktif,
   lalu isi appsscript.json seperti contoh di README bagian Manifest
3. Isi CONFIG.tabs di Code.gs dengan nama tab aslimu
4. Run laporkan()   -> salin Execution log, pastikan CONFIG.tabs sudah cocok
5. Run setupTriggers()  -> mengaktifkan email otomatis
6. Deploy > New deployment > Web app
   Execute as: Me | Who has access: Anyone
7. Tempel URL /exec ke src/config.ts
```

### Pemasangan Daily Report & Checklist (DR/CK)

Daily Report memakai **Google Form** sebagai sumber input. Dashboard hanya
menampilkan daftar read-only, detail, dan tombol cetak PDF; tidak ada form
input Daily Report di web. Checklist Kendaraan tetap berupa form web dan
memakai deployment Web App yang sama dengan dashboard.

```
1. Buat Google Form Daily Report dan hubungkan ke spreadsheet ini. Google
   Forms membuat tab respons baru; ubah namanya menjadi TAB_DAILYREPORT.
2. Run setupTabsBaru() sekali -> membuat tab CK dan M_Item. Tab
   TAB_DAILYREPORT yang sudah ada tidak ditimpa. Tab lama bernama DR
   otomatis diubah namanya menjadi TAB_DAILYREPORT (kalau tab form sudah
   memakai nama itu, rapikan dulu salah satu tabnya).
3. Judul kolom tab Daily Report boleh mengikuti pertanyaan form; backend
   mengenali alias seperti Timestamp, Nama Driver, Tanggal, No. Plat, IJN,
   Nama User, KM, Solar, Uraian Pekerjaan, Jam Keluar, dan Jam Kembali.
   Baris form tanpa ID_DR dianggap satu dokumen per baris.
4. Buka menu Surat Tugas / Daily Report -> daftar diambil dari Google Form.
   Tombol Cetak PDF membuat PDF A5 landscape on-demand. Kalau tab punya
   kolom Link_PDF, tautan PDF disimpan balik ke baris tersebut.
5. Checklist Kendaraan memakai M_Item untuk daftar periksa. PDF A4 portrait
   dan foto tanda kerusakan disimpan di folder Drive "HBPA Dokumen DR-CK";
   ID folder di-cache otomatis di Script Property (hapus DRCK_FOLDER_ID bila
   folder dipindah).
6. Menyimpan/mencetak DR dan CK tidak mengirim email. Email otomatis hanya
   dipakai untuk permintaan transport.
7. Status dokumen bisa diubah lewat kolom Status di spreadsheet. Nilai
   "Selesai" ditampilkan sebagai badge selesai; nilai lain menjadi Submitted.
```

### appsscript.json

```json
{
  "timeZone": "Asia/Makassar",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
```

## Testing

```powershell
npm test
```

Dua berkas, tanpa framework, tanpa konfigurasi:

- `tests/backend.test.cjs` — menjalankan `Code.gs` di Node dengan spreadsheet
  dan layanan Apps Script di-stub. Memeriksa pemetaan kolom dari judul,
  guard baris bergeser, pembuatan kolom otomatis, email + PDF, trigger
  email otomatis, validasi payload, dokumen DR/CK (simpan, PDF, PNG
  kerusakan, baris Google Form tanpa ID, rename tab DR), dan memastikan
  halaman DR/CK sudah tidak lagi berupa file HTML di Apps Script.
- `tests/frontend.test.cjs` — menjalankan aplikasi penuh di JSDOM dengan API
  palsu. Memeriksa router, filter, drawer (termasuk bug ID kondisi
  pengembalian yang dulu rusak), area cetak, daftar Daily Report read-only
  dengan pencarian/detail/cetak PDF, serta Checklist Kendaraan (termasuk
  payload yang dikirim).

Backend perlu diperiksa setelah `Code.gs` diubah — file itu diserahkan ke
pemilik Apps Script dan tidak bisa di-debug dari sini.