/**
 * config.ts — seluruh pengaturan aplikasi.
 *
 * Yang WAJIB diisi: API_URL (dari Deploy > New deployment > Web app di Apps Script)
 */

export const CONFIG = {
  /**
   * URL Web App dari Google Apps Script.
   * Format: https://script.google.com/macros/s/AKfycb.../exec
   *
   * Cara mendapatkannya:
   *   1. Buka file apps-script/Code.gs di Apps Script
   *   2. Deploy > New deployment > tipe "Web app"
   *   3. Execute as: "Me"  |  Who has access: "Anyone"
   *   4. Salin URL yang muncul (berakhiran /exec)
   */
  API_URL: '',

  APP_NAME: 'Facility Department',
  COMPANY_NAME: 'PT. HIDUP BARU PERDANA ABADI',
  COMPANY_SHORT: 'PT. HBPA',
  DEPARTMENTS: [
    'Produksi',
    'Workshop',
    'Gudang',
    'Engineering',
    'GA',
    'HRD',
    'Finance',
    'Lainnya',
  ],

  /** Jumlah baris per halaman saat memuat daftar permintaan. */
  PAGE_SIZE: 100,

  /** Umbral cache di sisi browser (ms). 0 = tidak meng-cache. */
  CACHE_TTL: 60_000,

  /** Panjang maksimum payload yang dikirim lewat query string /exec. */
  MAX_WRITE_BYTES: 4000,
} as const;

/** Pesan error kalau API_URL masih kosong, biar jelas penyebabnya. */
export function requireApiUrl(): string {
  const url = (import.meta.env.VITE_GAS_URL as string | undefined) || CONFIG.API_URL;
  if (!url) {
    throw new Error(
      'API_URL belum diisi. Buka src/config.ts dan tempel URL Web App Apps Script di sana.',
    );
  }
  return url;
}