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
- Payload dibatasi `MAX_WRITE_BYTES` (4000 karakter). Kolom yang sangat
  panjang akan ditolak dengan pesan jelas.
- Side effect di URL `_t=<timestamp>` supaya tidak dilayani dari cache.

**Integritas baris.** Backend memetakan kolom dari *judul* di baris 1, bukan
nomor kolom, jadi urutan kolom bebas. Setiap baris membawa `sig`; kalau di
spreadsheet Someone sort atau hapus baris, penyimpanan ditolak dengan
pesan "Isi baris ini sudah berubah" daripada menimpa record yang salah.

**Menambah kolom inventaris.** `STATUS`, `TGL KEMBALI AKTUAL`, `CATATAN`, dan
`KONDISI KEMBALI n` dibuat otomatis saat pertama kali disimpan. Endpoint
`?action=diagnose` menampilkan kolom mana yang terdeteksi, mana yang akan
dibuat, dan mana yang bermasalah.

## Testing

```powershell
node ..\..\..\AppData\Local\Temp\opencode\dom-smoke.cjs
```