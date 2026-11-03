# MANPOWER Dashboard — Manpower Requisition & Job Completion

**Tanggal:** 2026-11-03  
**Status:** Disetujui untuk perencanaan implementasi

## Latar Belakang

Sistem Facility di Vercel saat ini memakai satu Apps Script untuk modul Facility. Tim lain membutuhkan dua dokumen/formal kerja yang berbeda strukturnya tetapi berada di satu dashboard internal:

1. **Manpower Requisition Form** — permohonan manpower/pekerjaan.
2. **Job Completion Report** — laporan penyelesaian pekerjaan.

Input data berasal dari **dua Google Form terpisah** dan disimpan di **satu spreadsheet dengan dua tab respons**. Dashboard ini khusus untuk admin; user/pemohon hanya mengakses link Google Form.

## Tujuan

Menambahkan section **MANPOWER** ke dashboard Vercel yang sudah ada, dengan dua halaman terpisah:

- **Manpower Requisition**
- **Job Completion**

Keduanya memakai backend Apps Script yang berbeda dari backend Facility.

## Scope

### Termasuk

- Section sidebar `MANPOWER` berisi dua halaman.
- Membaca data dari dua tab response di spreadsheet MANPOWER.
- Menampilkan daftar/tabel besar untuk tiap form.
- Pencarian dan filter sederhana.
- Detail dan edit semua field oleh admin.
- Cetak A5 untuk Manpower Requisition.
- Cetak A4 untuk Job Completion.
- Signature pada saat cetak memakai modal/TTD yang sama dengan dashboard Facility.
- Pembuatan ulang Google Form dari `Setup.gs` sesuai isi surat fisik.
- API JSON di Apps Script terpisah.
- Konfigurasi environment Vercel/lokal dipisah:
  - `VITE_GAS_URL` — Facility
  - `VITE_MR_GAS_URL` — MANPOWER

### Tidak termasuk

- Status otomatis.
- `Request ID`.
- Penghubung otomatis antara Requisition dan Completion.
- Trigger form untuk update status.
- Login/token/proteksi admin khusus modul MANPOWER.
- Sinkronisasi antara Facility dan MANPOWER.
- Perubahan backend Facility API yang tidak diperlukan.

## Keputusan Arsitektur

Menggunakan **Opsi A: satu dashboard Vercel, dua Apps Script terpisah**.

```text
User → Google Form MANPOWER
     → Spreadsheet MANPOWER
       ├─ tab Requests
       └─ tab Job Completion
     → Apps Script MANPOWER
       ├─ Code.gs (API admin)
       └─ Setup.gs (buat form & sheet)
     → Dashboard Vercel (MANPOWER section)
```

Facility tetap:

```text
User → Google Form Facility / web app
     → Spreadsheet Facility
     → Apps Script Facility
     → Dashboard Vercel (FACILITY section)
```

## Sidebar

```text
FACILITY
- Overview
- Daftar Permintaan Transportasi
- Peminjaman Inventaris
- Surat Tugas / Daily Report
- Daftar Checklist

MANPOWER
- Manpower Requisition
- Job Completion
```

Section ditampilkan sebagai label grup di sidebar; tiap section memiliki icon/label masing-masing.

## Google Forms dan Sheets

### Manpower Requisition

Google Form diisi oleh user. Isi form selaras dengan surat fisik (tanpa Request ID/status):

- Nama Requester
- Department
- Division
- Requested Date
- Required Manpower
  - Electrical / Civil / Mechanical
- Job Outline / Short Description (10 baris conditional)
- Email akun Google dicatat otomatis oleh Google Forms

Sheet respons:

```text
Timestamp
Requester Email
Requester Name
Department
Division
Requested Date
Required Manpower
Job Outline
```

### Job Completion

Google Form diisi oleh user setelah pekerjaan selesai:

- Reported By
- Job Name
- Job No.
- Location
- Date & Time
- Manpower Name / Classification (4 baris conditional)
- Job Description Log (Date & Time + Job Description, 15 baris conditional)
- End User Name
- End User Position
- Email akun Google dicatat otomatis oleh Google Forms

Sheet respons:

```text
Timestamp
Submitted By (Email)
Reported By
Job Name
Job No.
Location
Date & Time
Manpower
Job Description Log
End User Name
End User Position
```

Google Form dibuat melalui `Setup.gs`. Form untuk user dan sheet dianjurkan dibuat dari nol agar kolom respons bersih.

## Setup.gs

`Setup.gs` menyediakan dua fungsi:

### `setup()`

- Membuat/menghubungkan project ke:
  - Google Form Manpower Requisition
  - Google Form Job Completion
  - Sheet respons `Requests`
  - Sheet respons `Job Completion`
  - Sheet `Config` berisi link form
- Mengisi header sheet.
- Menyimpan ID/form URL di Script Properties.
- **Tidak memasang trigger form untuk status/ID lagi.**

### `resetForms()` (destruktif, dijalankan manual)

- Memindahkan form lama ke Trash.
- Menghapus Script Properties terkait form dan map.
- Membuat ulang form ketika `setup()` dijalankan.
- Tidak menyentuh spreadsheet data yang sudah ada.
- Tidak dijalankan oleh build/test otomatis.

Karena dapat menghapus form, fungsi ini hanya boleh dijalankan setelah user memastikan data lama boleh dibuang atau sudah dicadangkan.

## Backend API Apps Script MANPOWER

### Prinsip

- Menggunakan Apps Script terpisah dari Facility.
- `GET` untuk membaca data.
- `POST` dengan `Content-Type: text/plain` untuk menulis data.
- Response selalu JSON.
- Tidak perlu login.
- Semua sheet dibaca berdasarkan judul header, bukan index kolom.
- Edit semua field oleh admin.
- Edit memakai `rowId` dan tanda baca baris (`sig`) agar tidak menimpa baris yang berubah.

### Endpoint

**Baca**

- `getSummary` — jumlah total/terbaru untuk dashboard (opsional, tanpa status)
- `getRequests` — daftar Manpower Requisition
- `getRequest` — detail satu baris
- `getCompletions` — daftar Job Completion
- `getCompletion` — detail satu baris

**Tulis**

- `saveRequest` — update semua field Manpower Requisition
- `saveCompletion` — update semua field Job Completion

Semua write membutuhkan:

- `rowId`
- `sig`
- field yang akan ditulis

Kalau `sig` tidak cocok, backend menolak dengan pesan "Isi baris ini sudah berubah..."

### Ambang Payload

- `POST_BODY` dipakai, bukan query string.
- Batas payload diatur di `MR_CONFIG.maxBodyBytes`.
- Job Outline / Job Description Log dapat memuat beberapa baris teks tanpa dipaksa URL.

## Dashboard Vercel

### Struktur File

Tambahkan modul MANPOWER terpisah:

```text
src/
  manpower/
    api.ts            # client ke VITE_MR_GAS_URL
    types.ts          # tipe response MR
    requisition.ts    # halaman Manpower Requisition
    completion.ts     # halaman Job Completion
    print.ts          # render A4/A5 dari data
```

Atau, jika ingin tetap mengikuti pola Facility, bisa ditempatkan di `src/pages/manpower-*.ts`.

### Sidebar

Sidebar dibagi menjadi dua section:

```text
FACILITY
  Overview
  ...

MANPOWER
  Manpower Requisition
  Job Completion
```

Hutang teknis: style section label harus ringan dan tidak mengubah perilaku navigation existing.

### Halaman Manpower Requisition

- Tabel:
  - Requested Date
  - Requester Name
  - Department
  - Division
  - Required Manpower
  - Job Outline (ringkas)
  - timestamp/email opsional
- Cari berdasarkan nama/departemen/scope.
- Detail drawer.
- Edit semua field.
- Cetak **A5 portrait**, menyesuaikan isi surat.

### Halaman Job Completion

- Tabel:
  - Job Date & Time
  - Job Name
  - Reported By
  - Location
  - End User Name
  - timestamp/email opsional
- Cari berdasarkan job/lokasi/user.
- Detail drawer.
- Edit semua field.
- Cetak **A4 portrait**, menyesuaikan form Job Completion.

### Print

Menggunakan template static/print di frontend (bukan file Apps Script):

- Manpower Requisition: **A5**
- Job Completion: **A4**
- TTD memakai modal signature yang sama dengan dashboard Facility.
- Hanya print/manual re-print, tidak otomatis kirim PDF.

## Environment

`.env.local` dan Vercel:

```text
VITE_GAS_URL=https://script.google.com/macros/s/.../exec
VITE_MR_GAS_URL=https://script.google.com/macros/s/.../exec
```

Tanpa `VITE_MR_GAS_URL`, halaman MANPOWER menampilkan pesan konfigurasi, bukan error kosong.

## Error Handling

- API MANPOWER gagal → halaman menampilkan pesan jelas, tidak blank.
- Save gagal → popup/dialog "Perubahan belum tersimpan" dan data form tidak hilang.
- `sig` mismatch → admin diminta refresh dan coba lagi.
- Manpower sheet kosong → halaman menampilkan empty state.
- Payload terlalu besar → ditolak dengan pesan jelas, bukan potong diam-diam.

## Security

Tidak ada login khusus MANPOWER untuk sekarang. Akses bergantung pada URL dashboard. API MANPOWER tetap harus:

- Whitelist action, bukan evaluasi arbitrary.
- Tidak membuka endpoint Facility/internal lain.
- Tidak menghapus data jika `sig` mismatch.
- Tidak mengekspos script properties/config/server-only values.

Jika kelak modul ini perlu dibatasi user tertentu, tambahkan login/token di fase berikutnya.

## Testing

Backend API test (stub Sheets/Apps Script):

- `doGet` hanya melayani action yang dikenali.
- `getRequests` dan `getCompletions` mengembalikan list terbaru.
- `saveRequest`/`saveCompletion` menolak jika `sig` basi.
- Header baru dari GForm ikut terbaca.

Frontend test:

- Sidebar menunjukkan section FACILITY dan MANPOWER.
- Route `manpower-requisition` dan `job-completion` terdaftar dan bisa dibuka.
- Halaman MANPOWER menampilkan tabel dan drawer.
- Edit + save mengirim field ke `VITE_MR_GAS_URL`.
- Print area memakai A5/A4 sesuai tipe form.

Manual test:

- Buat form baru dengan `setup()`.
- Submit contoh jawaban.
- Buka dashboard, edit, print, reload.

## Migration / Rollout

1. Backup spreadsheet MANPOWER.
2. Jika form lama akan dibuang, user menjalankan `resetForms()` secara eksplisit.
3. Jalankan `setup()` pada project Apps Script MANPOWER.
4. Isi Script Properties (otomatis dari `setup()`).
5. Deploy Apps Script MANPOWER sebagai Web App: Execute as Me, Who has access Anyone.
6. Isi `VITE_MR_GAS_URL` di `.env.local` dan Vercel.
7. Deploy dashboard Vercel.
8. Bagikan URL form ke user; URL dashboard hanya ke admin.

## Rollback

- Facility tidak berubah.
- Jika dashboard MANPOWER bermasalah, cabut section MANPOWER atau redeploy versi sebelumnya.
- Spreadsheet/Form baru tidak menghapus data lama kecuali `resetForms()` dijalankan.
- Tidak ada migrasi data otomatis dari spreadsheet lama ke struktur baru.

## Acceptance Criteria

1. Dashboard Vercel memiliki section MANPOWER dengan dua halaman.
2. Halaman Manpower Requisition menampilkan/mengedit data dari Google Form.
3. Halaman Job Completion menampilkan/mengedit data dari Google Form.
4. Print Manpower Requisition = A5.
5. Print Job Completion = A4.
6. Tidak ada Request ID/status/trigger otomatis di alur baru.
7. Backend MANPOWER dapat dipisahkan sepenuhnya dari Facility.
8. Error konfigurasi tidak menghasilkan halaman kosong.
