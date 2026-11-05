# Form Checklist Kendaraan (Google Form)

Script `SetupChecklistForm.gs` membuat Google Form checklist kendaraan dan
menyambungkannya ke tab `TAB_CEKKENDARANA`. Dengan begitu ada **dua jalur input**
yang masuk ke data yang sama:

1. **Manual** — halaman Checklist di aplikasi Facility (termasuk tanda kerusakan
   pada gambar mobil).
2. **Google Form** — dibagikan ke petugas lapangan; kiriman otomatis ditambahkan
   ke spreadsheet.

Keduanya memakai kolom, format ID, dan `Items_JSON` yang sama, jadi daftar,
detail, dan cetak PDF di aplikasi langsung mengenali data dari Form.

---

## Cara pasang

1. Buka project Apps Script yang dipakai Web App checklist
   (project yang sama dengan `Code.gs`).
2. Tambahkan file baru bernama **`SetupChecklistForm.gs`**, lalu tempel isi
   `apps-script/SetupChecklistForm.gs`.
3. Simpan, lalu jalankan fungsi **`setupChecklistForm`** dari editor.
4. Setujui izin (Form, Spreadsheet, Drive, Trigger).
5. Link Form muncul di **Execution log** dan di dialog spreadsheet.
   Kalau project terikat ke spreadsheet, menu **Checklist** juga tersedia:
   - Buat / perbarui Form Checklist
   - Buka Form Checklist
   - Pasang ulang trigger
   - Hapus Form & buat baru

Setelah itu bagikan link Form ke petugas. Tidak perlu mengatur trigger manual.

> **Jangan** menghubungkan Form ke spreadsheet lewat menu Responses →
> Select response destination. Kalau di-link, Google membuat tab
> `Form Responses` baru yang tidak dibaca aplikasi. Trigger dari script ini
> yang menulis ke `TAB_CEKKENDARANA`.

---

## Isi Form

Bagian identitas:

- Tanggal (wajib)
- Counter
- Tipe Mobil
- No. Polisi (wajib)
- Driver (wajib)
- Kilometer (validasi angka)
- BBM Masuk / BBM Keluar (dropdown `E`, `1/4`, `1/2`, `3/4`, `F`)
- Keterangan
- Diperiksa Oleh (wajib)

Bagian pemeriksaan: satu **grid** per grup item dari tab `TAB_Item` (Kaca,
Body Mobil, Ban, Mesin, Lampu, Eksterior, Kelengkapan, Interior). Kolom grid:
`Baik`, `Rusak`, `Tidak Ada`. Semua baris wajib diisi.

Bagian akhir: satu catatan kerusakan opsional. Catatan ini ditempel ke semua
item yang berstatus `Rusak` atau `Tidak Ada`.

Tanda kerusakan pada gambar mobil (`Damages_JSON` berbasis view/x/y) hanya
bisa dibuat dari aplikasi. Kiriman Form mengisi `Damages_JSON` dengan `[]`.

---

## Yang ditulis ke spreadsheet

Kolom yang sama seperti input manual:

`ID_CK`, `Tanggal`, `Counter`, `Tipe_Mobil`, `No_Polisi`, `Driver`,
`Kilometer`, `BBM_Masuk`, `BBM_Keluar`, `Keterangan`, `Diperiksa_Oleh`,
`Status`, `Created_By`, `Created_At`, `Link_PDF`, `Items_JSON`,
`Damages_JSON`, `Has_Rusak`, `Request_Id`.

- `ID_CK` memakai format yang sama: `CK-YYYYMMDD-NNN` (contoh
  `CK-20261018-001`).
- `Status` diisi `Submitted`.
- `Created_By` diisi `Google Form`.
- `Has_Rusak` bernilai `true` kalau ada item berstatus `Rusak`.

---

## Menjalankan ulang

`setupChecklistForm()` aman dijalankan berulang:

- Tab checklist dicek; kolom yang belum ada ditambahkan.
- Grid item dibangun ulang dari `TAB_Item` **hanya kalau Form belum punya
  respons**. Kalau sudah ada respons, pertanyaan dibiarkan agar jawaban lama
  tidak rusak.
- Trigger `onChecklistFormSubmit` dihapus lalu dipasang ulang, jadi tidak dobel.

Kalau item di `TAB_Item` berubah dan Form sudah punya respons, jalankan
**`resetChecklistForm()`**. Fungsi ini memindahkan Form lama ke Trash dan
membuat Form baru dari nol. Data yang sudah masuk ke `TAB_CEKKENDARANA`
**tidak** dihapus, tetapi jawaban Form lama ikut hilang dari Form tersebut.

---

## Batasan

- Judul pertanyaan dipakai sebagai kunci saat membaca respons. Kalau judul
  diubah manual di editor Form, pemetaan data bisa salah. Kalau perlu berubah,
  ubah di `SetupChecklistForm.gs` lalu bangun ulang Form.
- Form tidak bisa menandai lokasi kerusakan di gambar mobil; gunakan aplikasi
  untuk itu.
- Satu catatan kerusakan berlaku untuk semua item bermasalah dalam kiriman
  tersebut. Catatan per item hanya tersedia lewat aplikasi.
