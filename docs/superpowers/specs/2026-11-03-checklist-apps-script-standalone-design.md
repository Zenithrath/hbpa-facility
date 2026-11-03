# Checklist Kendaraan Standalone di Apps Script

**Tanggal:** 2026-11-03  
**Status:** Disetujui untuk perencanaan implementasi

## Latar Belakang

Dashboard Facility PT HBPA saat ini di-deploy sebagai frontend statis di Vercel. Halaman input Checklist Kendaraan (FM-FCL-02.04) ikut tersedia di dashboard tersebut, padahal dashboard ditujukan untuk admin. Pengguna yang mengisi checklist hanya membutuhkan formulir input, bukan menu administrasi, daftar, riwayat, atau aksi lain.

File `apps-script/checklist.html` yang sudah dibuat sebelumnya berupa hasil bundle terpisah yang tidak konsisten dengan tampilan checklist di dashboard dan masih bergantung pada asset eksternal seperti `./ck-*.webp`.

## Tujuan

Membuat halaman input Checklist Kendaraan yang berjalan di Google Apps Script Web App (`/exec?page=checklist`), dengan tampilan formulir yang sama seperti checklist pada dashboard, tetapi terpisah dari dashboard Vercel.

## Scope

### Termasuk

- Halaman user untuk input Checklist Kendaraan saja.
- Reuse source UI dan logic checklist dari dashboard.
- Penghapusan route/menu checklist input dari dashboard admin.
- Tetap mempertahankan source checklist lama di repository.
- Tetap mempertahankan halaman/daftar Checklist di dashboard untuk admin.
- Generate ulang `apps-script/checklist.html` sebagai halaman standalone.
- Membatasi Apps Script agar hanya menyajikan file `checklist`, bukan sembarang HTML file.
- Setelah simpan: tampilkan pesan berhasil, kosongkan formulir, siap untuk input berikutnya.
- Gambar kendaraan tetap tersedia sebagai visualisasi tanda kerusakan.

### Tidak termasuk

- Login, token, role, atau autentikasi untuk pengguna checklist.
- Halaman riwayat, daftar checklist, print PDF, atau akses dokumen untuk user.
- Perubahan skema spreadsheet.
- Perubahan backend selain pelayanan HTML dan whitelist page.
- Rewrite manual UI checklist di Apps Script.
- Deployment otomatis ke Apps Script/Vercel dari lokal ini.

## Keputusan Arsitektur

Menggunakan **Opsi A: build terpisah dari source dashboard, lalu inline menjadi satu HTML Apps Script**.

1. Tambah entry Vite khusus checklist standalone (misalnya `checklist.html` dan `src/checklist-main.ts`).
2. Entry tersebut memakai source `src/pages/checklist.ts`, `src/pages/checklist-canvas.ts`, dan style/component dashboard.
3. Build menghasilkan aset khusus checklist.
4. Proses build/post-build mengubah aset tersebut menjadi satu file self-contained `apps-script/checklist.html`.
5. Apps Script `doGet` mengembalikan halaman tersebut hanya untuk `page=checklist`.
6. Dashboard Vercel tetap menjadi aplikasi admin terpisah.

## Struktur dan Komponen

### `checklist.html`

Input Vite untuk standalone page. Berisi container `#app` dan script module menuju entry checklist. Vite `base: './'` tetap dipakai untuk build lokal, tetapi Apps Script final tidak boleh bergantung pada external CSS/JS/asset.

### `src/checklist-main.ts`

Tanggung jawab:

- Memastikan body standalone memakai class visual yang sama dengan dashboard.
- Me-render shell minimal:
  - logo HBPA,
  - judul “Checklist Kendaraan”,
  - keterangan singkat bahwa ini halaman input checklist,
  - container form di tengah (`max-width` responsif).
- Me-render formulir dari `checklistPageHtml()` dengan opsi standalone.
- Memanggil mount logic checklist.
- Tidak menampilkan sidebar, topbar dashboard, menu, atau tombol admin.

Struktur konseptual:

```text
main.checklist-standalone
  ├─ minimal header (logo + title)
  ├─ checklistPageHtml({ standalone: true })
  └─ mountChecklistPage({ resetOnSave: true, hidePrint: true })
```

### `src/pages/checklist.ts`

Diubah secara minimal dan kompatibel:

- `checklistPageHtml` menerima opsi:
  - `hidePrint?: boolean` untuk menyembunyikan tombol Cetak.
  - `standalone?: boolean` bila diperlukan untuk class/wrapper.
- `mountChecklistPage` menerima opsi:
  - `resetOnSave?: boolean`.
- Fungsi simpan tetap memakai `api.saveCk`, canvas mark, dan payload yang sama.
- Jika `resetOnSave` aktif:
  - setelah simpan sukses, tampilkan toast berhasil;
  - kosongkan formulir kembali;
  - jangan menampilkan hasil berisi link PDF;
  - fokus/scroll dikembalikan ke awal formulir bila memungkinkan.
- Jika opsi tidak diberikan, perilaku lama tetap kompatibel selama source lama masih dipakai untuk referensi/maintenance.

### `src/pages/checklist-canvas.ts`

Tetap menjadi satu-satunya pengelola draw/canvas/preload gambar. Tidak ada duplikasi logic tanda kerusakan.

Untuk Apps Script final, path gambar `./ck-*.webp` harus diubah menjadi asset yang ikut terbundle/inline, bukan path relatif eksternal.

## Asset dan Gambar Kendaraan

Kebutuhan: gambar ATAS, KIRI, KANAN, DEPAN, BELAKANG harus tampil di canvas agar user bisa menandai kerusakan.

Urutan pilihan:

1. **Inline image sebagai data URI di bundle final** — diutamakan karena paling portable untuk Apps Script.
2. Jika payload terlalu besar atau gagal di Apps Script, gunakan gambar yang dihosting pada URL publik/Drive dan dokumentasikan kebutuhan akses publik.
3. Rewrite SVG kendaraan tidak dipilih karena visual dan kualitas bukan tujuan perubahan ini, dan WebP yang ada sudah jauh lebih ringan daripada SVG asli.

Implementasi harus mencegah hasil akhir seperti `./ck-atas.webp` yang tidak tersedia di `https://script.google.com/.../exec`.

## Apps Script dan Delivery

### `apps-script/checklist.html`

File ini adalah **hasil generate**, bukan source yang diedit manual. Header/comment di bagian atas file harus menyatakan:

- file digenerate dari source dashboard;
- untuk mengubah UI, ubah source lalu jalankan build checklist;
- jangan edit langsung kecuali darurat.

Build menghasilkan satu file dengan:

- HTML minimal,
- CSS inline,
- JS inline,
- image inline/data URI bila memungkinkan.

### `apps-script/Code.gs`

Perubahan:

- `doGet` memperlakukan `page` sebagai whitelist ketat:
  - `page=checklist` → serve `checklist.html` dengan title “Checklist Kendaraan”.
  - nilai lain → 404/teks error, bukan nama file sembarang.
- `page` handling tidak membuka file HTML lain.
- API JSON tetap berjalan untuk action yang sama seperti sekarang.

## Alur Runtime

```text
User → Apps Script URL /exec?page=checklist
     → doGet(page=checklist)
     → HtmlService output checklist.html
     → Browser load HTML self-contained
     → Entry standalone render header + form
     → api.getMasters (same GAS deployment)
     → Canvas load kendaraan image
     → User isi checklist dan tanda kerusakan (opsional)
     → api.saveCk (same GAS deployment)
     → Toast sukses → form kosong kembali
```

Untuk koneksi API dari halaman Apps Script, base URL endpoint harus mengarah ke deployment yang sama (`/exec`) atau fallback yang eksplisit. Halaman user tidak boleh memerlukan user membuka Vercel.

## Dashboard Vercel

Di `src/main.ts`:

- Hapus `CHECKLIST_PAGE` dari `PAGES`.
- Hapus import `src/pages/checklist` bila tidak lagi digunakan oleh dashboard.
- Pertahankan page `checklist-list` dan navigasi **Daftar Checklist**.
- Pertahankan print area yang dipakai Daftar Checklist/print checklist.
- Jangan menghapus source `src/pages/checklist.ts`, `checklist-canvas.ts`, `checklist-paper.ts`, atau file perlengkapan lain.

Setelah perubahan, dashboard admin menampilkan daftar/riwayat, bukan formulir input user.

## UX dan Tampilan

- Form memakai class dashboard yang sama: `card`, `field`, `field-label`, `btn-primary`, dll.
- Layout centered dengan `max-width` dan responsive.
- Tidak ada sidebar, topbar dashboard, atau menu admin.
- Minimal header hanya identifikasi aplikasi/dokumen.
- Setelah save, user melihat feedback jelas dan langsung bisa mengisi checklist berikutnya.
- Jika API master gagal:
  - tampilkan pesan error yang mudah dipahami;
  - kontrol form tetap aman/disabled sesuai pola sekarang;
  - user bisa retry dengan membuka ulang atau tombol retry bila nanti ditambahkan (tidak wajib untuk scope ini).

## Security dan Privasi

Tidak ada login sesuai keputusan. Akses bergantung pada URL yang tidak disebarluaskan. Ini bukan kontrol keamanan yang kuat.

Mitigasi minimum:

- GAS page whitelist hanya `checklist`.
- Jangan menampilkan data/list/riwayat user.
- Jangan menampilkan URL dashboard Vercel di halaman user.
- Jangan menambahkan link navigasi ke dashboard.
- Tetap dokumentasikan bahwa endpoint API Apps Script masih dapat dipanggil oleh pihak yang mengetahui URL; untuk perlindungan nyata, perlu fase berikutnya (token/login/Firebase/Auth GAS).

## Error Handling

- `getMasters` gagal → tampilkan pesan error, jangan blank page.
- `saveCk` gagal → tampilkan pesan error di atas form; input user dipertahankan.
- Image gagal → canvas tetap menampilkan background/fallback dan user tetap bisa menandai koordinat; jangan menggagalkan submit.
- Payload terlalu besar → perilaku sekarang dipertahankan: gambar bisa dihilangkan tetapi metadata/tanda lokasi tetap dikirim, dengan warning.
- Browser/Apps Script menolak HTML malformed → dicegah oleh build yang inline asset dalam urutan valid dan verifikasi setelah generate.

## Testing

Minimal test/check yang harus lulus:

1. `npm run typecheck`
2. `npm test`
3. `npm run build` (dashboard Vercel)
4. Build khusus checklist standalone
5. Pemeriksaan file `apps-script/checklist.html`:
   - tidak load `./ck-*.webp` sebagai URL eksternal;
   - tidak load `./assets/*.js` atau `./assets/*.css` eksternal;
   - tidak berisi menu/sidebar dashboard admin;
   - berisi formulir dan id `ck-*` yang diperlukan.
6. Test backend Apps Script: whitelist `page=checklist` dan penolakan page lain.
7. Test frontend checklist standalone: form berhasil render, submit sukses, form dikosongkan, link PDF tidak tampil.
8. Uji manual di browser: Apps Script page tampil, gambar kendaraan terlihat, klik/mark jalan, simpan jalan.

## Rollout

1. Generate `apps-script/checklist.html` baru.
2. Update `apps-script/Code.gs` sesuai whitelist.
3. Push/copy kedua file ke project Apps Script sesuai alur repository ini.
4. Deploy/New deployment Apps Script sebagai **Web app**:
   - Execute as: Me
   - Who has access: Anyone
5. URL user: `<WEB_APP_URL>?page=checklist`.
6. Deploy dashboard Vercel seperti biasa untuk admin.
7. Bagikan URL Apps Script hanya ke user checklist.

## Rollback

- Dashboard: revert perubahan source/dashboard dan deploy ulang Vercel.
- Apps Script: restore `Code.gs` dan `checklist.html` versi sebelumnya; redeploy.
- Tidak ada migrasi data, sehingga rollback tidak menyentuh spreadsheet.
- Source checklist lama tetap ada di git history dan working tree selama perubahan ini.

## Acceptance Criteria

1. User membuka Apps Script URL `?page=checklist` dan melihat formulir checklist yang sama secara visual dengan form checklist dashboard.
2. Halaman user tidak menampilkan sidebar, menu admin, daftar checklist, atau link ke Vercel.
3. Gambar kendaraan tampil dan klik/mark kerusakan berfungsi.
4. Setelah simpan, user melihat pesan berhasil dan form kembali kosong.
5. Dashboard Vercel tetap berfungsi untuk admin; route/menu input Checklist Kendaraan tidak tersedia.
6. Daftar Checklist admin tetap tersedia.
7. Apps Script tidak melayani HTML file arbitrary selain `checklist`.
8. `npm run typecheck` dan `npm test` lulus.
