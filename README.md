# Dashboard Facility PT HBPA

Frontend untuk Permintaan Transportasi & Peminjaman Inventaris.
Backend-nya Google Apps Script milik pihak lain; aplikasi ini cuma konsumen
API-nya lewat URL Web App.

## Menjalankan

```powershell
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/  (siap dipakai Laragon www atau Vercel)
npm run build:checklist  # -> apps-script/checklist.html (halaman user Apps Script)
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
VITE_MR_GAS_URL=https://script.google.com/macros/s/AKfycb.../exec
```

`VITE_MR_GAS_URL` khusus section MANPOWER (Manpower Requisition + Job Completion).
Tanpa variabel ini, dashboard Facility tetap jalan; halaman MANPOWER menampilkan
pesan konfigurasi, bukan blank.

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
  manpower/        modul terpisah untuk PIC MANPOWER
    api.ts         client Apps Script MANPOWER
    page.ts        factory daftar/table/drawer/edit/hapus
    requisition.ts Manpower Requisition (cetak A5)
    completion.ts   Job Completion (cetak A4)
  pages/
    overview.ts   kartu statistik + kirim email
    transport.ts  daftar + drawer edit + cetak A5
    inventaris.ts daftar + drawer pengembalian + cetak A5
    daily-report.ts  daftar Daily Report dari Google Form + cetak PDF
    checklist.ts     form Checklist Kendaraan + tanda kerusakan
  checklist-main.ts entry standalone untuk user (hanya formulir input)
checklist.html     input Vite untuk halaman user standalone
apps-script/
  Code.gs         serahkan ke pemilik Apps Script
  checklist.html  HASIL GENERATE untuk Apps Script; jangan edit manual
apps-script-manpower/
  Code.gs         Backend API MANPOWER terpisah
  Setup.gs        Pembuat Google Form + link ke spreadsheet
scripts/
  build-checklist.mjs  inline CSS/JS/gambar ke checklist.html
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

**CORS Facility.** Apps Script tidak bisa mengirim header
`Access-Control-Allow-Origin`. Yang berhasil adalah permintaan GET sederhana
(tanpa header khusus): browser tidak mengirim preflight OPTIONS, jadi balasan
boleh dibaca.

Konsekuensinya untuk backend Facility:

- API Facility memakai GET, **termasuk operasi tulis**.
- Jangan menambah header custom di `fetch` — CORS akan muncul lagi.
- Payload dibatasi `MAX_WRITE_BYTES` (4000 karakter). Dokumen DR/CK memakai
  `MAX_DOC_BYTES` (50.000 karakter) karena checklist membawa daftar item yang banyak;
  kalau dokumen terlalu besar, API menolak payload dengan pesan jelas.
- Side effect di URL `_t=<timestamp>` supaya tidak dilayani dari cache.

**Integritas baris.** Backend memetakan kolom dari *judul* di baris 1, bukan
nomor kolom, jadi urutan kolom bebas. Setiap baris membawa `sig`; kalau di
spreadsheet Someone sort atau hapus baris, penyimpanan ditolak dengan
pesan "Isi baris ini sudah berubah" daripada menimpa record yang salah.

**Menambah kolom inventaris.** `STATUS`, `TGL KEMBALI AKTUAL`, `CATATAN`, dan
`KONDISI KEMBALI n` dibuat otomatis saat pertama kali disimpan. Endpoint
`?action=diagnose` menampilkan kolom mana yang terdeteksi, mana yang akan
dibuat, dan mana yang bermasalah.

**MANPOWER API.** Modul MANPOWER tetap memakai backend Apps Script terpisah.
Pembacaan memakai `GET`; penulisan memakai `POST` dengan `Content-Type:
text/plain` agar body JSON besar tidak dititipkan di query string.
Keduanya tetap sederhana dan dapat dipakai tanpa login.

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
  penanda koordinat dipakai untuk PDF A4 portrait gaya kertas asli

## MANPOWER — Manpower Requisition & Job Completion

Modul MANPOWER dipisah dari backend Facility. User hanya mengisi Google Form;
admin mengelola dan mencetak dari dashboard Vercel.

### Pemasangan

```
1. Buat spreadsheet MANPOWER baru dan project Apps Script baru yang menempel padanya.
2. Copy isi apps-script-manpower/Code.gs dan apps-script-manpower/Setup.gs ke project itu.
3. Jalankan setup() sekali dari editor Apps Script.
4. setup() membuat dua Google Form dengan pertanyaan bercabang Ya/Tidak
   untuk bagian berulang (Job Out Line, Manpower, Job Description).
5. Form ditautkan langsung ke sheet:
   - Requests
   - Job Completion
6. Sheet menyimpan satu kolom per pertanyaan; dashboard menggabungkan dan
   memecah kembali data untuk tampilan dan edit.
5. Bagikan link kedua form itu ke user.
6. Deploy Web App: Execute as Me | Who has access Anyone.
7. Isi VITE_MR_GAS_URL dengan URL /exec deployment tersebut.
8. Deploy dashboard Vercel seperti biasa.
```

Tidak ada `Request ID`, status otomatis, atau trigger form di alur ini.
Kedua dataset independen. Jika form ditambah pertanyaan baru, kolom baru
muncul otomatis di sheet respons.

`setup()` normal bersifat **memanfaatkan Form yang sudah ada**. Jika tab respons masih kosong, setup memperbarui pertanyaan di Form yang sama (ID/URL Form tidak berubah), membuat backup otomatis, dan membangun ulang tab respons. Jika sudah ada jawaban, setup tidak mengubah apa pun.

### Reset total

Jalankan `resetManpower()` bila ingin membersihkan semua sheet respons/form
lama dan membuat semuanya dari nol.

Fungsi ini akan:

1. Backup spreadsheet ke Google Drive
2. Unlink + trash kedua Google Form lama
3. Menghapus tab `Requests`, `Job Completion`, `Form Responses …`, dan `Config`
4. Membuat Google Form dan sheet respons baru
5. Membuat ulang tab `Config` berisi link form baru

### Update Form yang sudah dibuat

Jika struktur Form/sheet pernah dibuat dengan versi lama, jalankan `setup()`
sekali lagi. Selama belum ada jawaban, setup akan memperbarui pertanyaan di
Form yang sama dan membangun ulang tab respons. Link Form yang sudah dibagikan
tidak berubah.

Jika sudah ada jawaban, setup berhenti tanpa mengubah apa pun. Gunakan
`resetManpower()` bila memang ingin membuang data lama dan mulai dari nol.

`resetForms()` hanya memindahkan Form ke Trash dan tidak menghapus sheet.
Gunakan `resetManpower()` untuk reset total.

### Print

- Manpower Requisition: A5 portrait
- Job Completion: A4 portrait
- Tanda tangan diisi lewat modal signature dashboard sebelum cetak.

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

### Halaman user Checklist Kendaraan (terpisah dari dashboard)

Dashboard Vercel hanya untuk admin dan menampilkan **Daftar Checklist** beserta
aksinya. Formulir input untuk user disajikan langsung oleh Apps Script.

```
1. npm run build:checklist
2. Copy isi apps-script/checklist.html dan apps-script/Code.gs ke project Apps Script
3. Deploy > New deployment > Web app
   Execute as: Me | Who has access: Anyone
4. URL untuk user: <URL_WEB_APP>/exec?page=checklist
   (contoh bentuk URL: https://script.google.com/macros/s/.../exec?page=checklist)
```

`apps-script/checklist.html` adalah file hasil generate. Untuk mengubah tampilan,
ubah source lalu jalankan `npm run build:checklist`; jangan edit HTML generated
langsung. Halaman ini tanpa login dan tanpa menu admin; keamanan bergantung pada
URL yang tidak disebarluaskan.

### Pemasangan Daily Report & Checklist (DR/CK)

Daily Report memakai **Google Form** sebagai sumber input. Dashboard hanya
menampilkan daftar read-only, detail, dan tombol cetak PDF; tidak ada form
input Daily Report di web. Checklist Kendaraan memakai halaman Web App
Apps Script terpisah di `?page=checklist`.

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

Tiga berkas, tanpa framework, tanpa konfigurasi:

- `tests/backend.test.cjs` — menjalankan `Code.gs` di Node dengan spreadsheet
  dan layanan Apps Script di-stub. Memeriksa pemetaan kolom dari judul,
  guard baris bergeser, pembuatan kolom otomatis, email + PDF, trigger
  email otomatis, validasi payload, dokumen DR/CK (simpan, PDF, koordinat
  kerusakan, baris Google Form tanpa ID, rename tab DR), dan memastikan
  halaman DR/CK sudah tidak lagi berupa file HTML di Apps Script.
- `tests/manpower.test.cjs` — menjalankan Apps Script MANPOWER di Node.
  Memeriksa whitelist action, pembacaan dua sheet, alias email Google Forms,
  edit dengan guard `sig`, dan memastikan workflow lama (Request ID/status)
  tidak kembali.
- `tests/frontend.test.cjs` — menjalankan aplikasi penuh di JSDOM dengan API
  palsu. Memeriksa router, filter, drawer (termasuk bug ID kondisi
  pengembalian yang dulu rusak), area cetak, daftar Daily Report read-only
  dengan pencarian/detail/cetak PDF, serta Checklist Kendaraan (termasuk
  payload yang dikirim).

Backend perlu diperiksa setelah `Code.gs` diubah — file itu diserahkan ke
pemilik Apps Script dan tidak bisa di-debug dari sini.