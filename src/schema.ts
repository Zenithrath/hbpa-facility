/**
 * schema.ts — sumber kebenaran tunggal.
 *
 * Daftar field di bawah dipakai oleh:
 *   - TypeScript untuk memeriksa nama kolom saat compile
 *   - Halaman Transportasi untuk kolom tabel dan field drawer
 *   - Halaman Inventaris untuk form pengembalian
 *
 * Menambah kolom = tambah 1 baris di sini. Tidak ada tempat lain yang
 * perlu disentuh, dan TypeScript akan menolak kalau ada yang tidak cocok.
 */

/* =====================================================
   TRANSPORTASI
   ===================================================== */

export const STATUSES = ['Pending', 'Disetujui', 'Ditolak', 'Selesai'] as const;
export type Status = (typeof STATUSES)[number];

/** Status lama di spreadsheet yang dulu dipakai versi pertama. */
const STATUS_ALIAS: Record<string, Status> = {
  pending: 'Pending',
  disetujui: 'Disetujui',
  approved: 'Disetujui',
  ditolak: 'Ditolak',
  rejected: 'Ditolak',
  selesai: 'Selesai',
  completed: 'Selesai',
  done: 'Selesai',
};

/** Ubah status bebas apa pun menjadi salah satu dari STATUSES. */
export function normalizeStatus(value: unknown): Status {
  const raw = String(value ?? '').trim();
  return STATUS_ALIAS[raw.toLowerCase()] ?? 'Pending';
}

export interface TransportItem {
  rowId: number;
  /** Sidik baris: dipakai server untuk menolak simpan kalau baris sudah bergeser. */
  sig: string;
  noSurat: string;
  timestamp: string;
  nama: string;
  dept: string;
  ijn: string;
  tujuan: string;
  tglJam: string;
  tanggal: string;
  nopol: string;
  keperluan: string;
  status: Status;
  pemohon: string;
  disetujui: string;
  driver: string;
  tglCetak: string;
}

export type TransportKey = keyof TransportItem & string;

/**
 * Field yang boleh diedit lewat drawer.
 * No. Surat, timestamp, dan tglCetak dihitung server, jadi tidak termasuk.
 * Karena itu daftar ini narrower dari TransportKey, dan TypeScript otomatis
 * memastikan nilainya selalu string.
 */
export type EditableTransportKey =
  | 'nama'
  | 'dept'
  | 'ijn'
  | 'tujuan'
  | 'tglJam'
  | 'tanggal'
  | 'nopol'
  | 'keperluan'
  | 'status'
  | 'pemohon'
  | 'disetujui'
  | 'driver';

export type FieldType = 'text' | 'textarea' | 'date' | 'select';

export interface FieldDef<K extends string = string> {
  key: K;
  label: string;
  type?: FieldType;
  /** Setengah lebar di drawer (dua kolom per baris). */
  half?: boolean;
  required?: boolean;
  /** Ditampilkan sebagai teks, tidak bisa diedit (mis. kolom rumus). */
  readonly?: boolean;
  /** Simpan dalam huruf besar. */
  upper?: boolean;
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
}

const STATUS_OPTIONS = [
  { value: 'Pending', label: 'Pending (Menunggu)' },
  { value: 'Disetujui', label: 'Disetujui' },
  { value: 'Ditolak', label: 'Ditolak' },
  { value: 'Selesai', label: 'Selesai' },
] as const;

/**
 * Kolom yang boleh diedit lewat drawer.
 * `noSurat`, `timestamp`, dan `tglCetak` dihitung server, jadi tidak masuk daftar.
 */
export const TRANSPORT_FIELDS: readonly FieldDef<EditableTransportKey>[] = [
  {
    key: 'nama',
    label: 'Nama',
    half: true,
    required: true,
    placeholder: 'Nama pemohon',
  },
  { key: 'dept', label: 'Divisi', half: true, placeholder: 'Produksi' },
  { key: 'ijn', label: 'IJN', half: true, placeholder: '001234' },
  { key: 'tujuan', label: 'Tujuan', required: true, placeholder: 'Kota tujuan' },
  {
    key: 'tglJam',
    label: 'Hari / Tanggal / Jam',
    half: true,
    placeholder: 'Contoh: Senin, 08:00',
  },
  { key: 'tanggal', label: 'Tanggal', type: 'date', half: true },
  {
    key: 'nopol',
    label: 'Plat No.',
    upper: true,
    placeholder: 'Contoh: KT 8107 YV',
  },
  { key: 'keperluan', label: 'Keperluan', type: 'textarea' },
  { key: 'status', label: 'Status', type: 'select', half: true, options: STATUS_OPTIONS },
  { key: 'pemohon', label: 'Pemohon', half: true },
  { key: 'disetujui', label: 'Disetujui', half: true },
  { key: 'driver', label: 'Driver Name', half: true },
];

/** Kolom yang ditampilkan di tabel desktop, berurutan. */
export const TRANSPORT_COLUMNS = [
  'noSurat',
  'nama',
  'dept',
  'ijn',
  'tujuan',
  'tglJam',
  'tanggal',
  'nopol',
  'keperluan',
  'status',
] as const satisfies readonly TransportKey[];

/* =====================================================
   INVENTARIS
   ===================================================== */

export const INVENTARIS_STATUSES = ['Dipinjam', 'Selesai'] as const;
export type InventarisStatus = (typeof INVENTARIS_STATUSES)[number];

export interface InventarisItemLine {
  /** Nomor kolom barang (1, 2, 3, ...) dari grup BARANGn / QTYn / KONDISI KEMBALIn. */
  n: string;
  barang: string;
  qty: string;
  kondisiAmbil: string;
  kondisiKembali: string;
}

export interface InventarisItem {
  rowId: number;
  sig: string;
  noDok: string;
  nama: string;
  kontak: string;
  tglPinjam: string;
  tglKembali: string;
  keperluan: string;
  status: InventarisStatus;
  tglKembaliAktual: string;
  catatan: string;
  items: InventarisItemLine[];
}

export type InventarisKey = keyof InventarisItem & string;

/** Field inventaris yang bisa diubah lewat drawer pengembalian. */
export type EditableInventarisKey = 'status' | 'tglKembaliAktual' | 'catatan';

export const KONDISI_OPTIONS = ['Baik', 'Rusak', 'Hilang'] as const;

/** Field inventaris yang bisa diubah lewat drawer pengembalian. */
export const INVENTARIS_FIELDS: readonly FieldDef<EditableInventarisKey>[] = [
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    half: true,
    options: [
      { value: 'Dipinjam', label: 'Dipinjam' },
      { value: 'Selesai', label: 'Selesai (Dikembalikan)' },
    ],
  },
  { key: 'tglKembaliAktual', label: 'Tgl Kembali Aktual', type: 'date', half: true },
  { key: 'catatan', label: 'Catatan', type: 'textarea' },
];

export interface InventarisLineInput {
  n: string;
  kondisiKembali: string;
}

/* =====================================================
   BENTUK BALASAN API
   ===================================================== */

/** Semua endpoint memakai amplop yang sama. */
export interface ApiResult<T> {
  success: boolean;
  data?: T;
  message?: string;
  /** Peringatan yang tidak menggagalkan simpan, mis. kolom tidak ditemukan. */
  warning?: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TransportPage {
  items: TransportItem[];
  pagination: Pagination;
}

export interface Stats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  completed: number;
  month: number;
}

export interface BootstrapData {
  stats: Stats;
  departments: string[];
  /** Nama field yang tidak punya kolom di spreadsheet. */
  missingFields: string[];
  /** Jumlah grup kolom barang yang terdeteksi (BARANG1, BARANG2, ...). */
  itemColumns: number;
}