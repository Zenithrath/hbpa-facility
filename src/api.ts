/**
 * api.ts — satu-satunya jalan keluar ke Google Apps Script.
 *
 * Semua permintaan memakai GET + query string. Alasannya teknis, bukan gaya:
 * Apps Script tidak bisa mengirim header CORS, sedangkan GET sederhana tidak
 * memicu preflight OPTIONS, jadi browser mengizinkan pembacanya.
 * Konsekuensinya: payload harus pendek, dan operasi tulis diam-diam memakai
 * GET juga (lihat guard MAX_WRITE_BYTES di config.ts).
 */

import { CONFIG, requireApiUrl } from './config';
import type {
  ApiResult,
  BootstrapData,
  InventarisItem,
  InventarisLineInput,
  Pagination,
  Stats,
  TransportItem,
  TransportPage,
} from './schema';

type Query = Record<string, string | number | boolean | undefined | null>;

interface CacheEntry {
  at: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function buildUrl(action: string, query: Query = {}): string {
  const params = new URLSearchParams({ action });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const base = requireApiUrl();
  return `${base}?${params.toString()}`;
}

/** Lempar error yang enak dibaca, bukan "Unexpected token <". */
async function parse(res: Response, action: string): Promise<ApiResult<never>> {
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Server menjawab HTTP ${res.status}. Periksa URL Web App di src/config.ts.`);
  }
  if (!text.trim()) {
    throw new Error('Server tidak mengirim apa pun. Cek doGet() di Code.gs sudah di-deploy.');
  }
  if (text.trimStart().startsWith('<')) {
    throw new Error(
      'Server membalas HTML, berarti URL-nya bukan endpoint JSON atau belum bisa diakses tanpa login. ' +
        'Buka URL Web App langsung di browser untuk memastikan.',
    );
  }

  let parsed: ApiResult<never>;
  try {
    parsed = JSON.parse(text) as ApiResult<never>;
  } catch {
    throw new Error(`Balasan server bukan JSON: ${text.slice(0, 120)}…`);
  }

  if (!parsed.success) throw new Error(parsed.message || `Aksi "${action}" gagal.`);
  return parsed;
}

/** GET + cache pendek. Dipakai untuk semua pembacaan. */
async function read<T>(action: string, query: Query = {}): Promise<T> {
  const url = buildUrl(action, query);
  const key = url;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CONFIG.CACHE_TTL) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const job = fetch(url)
    .then((res) => parse(res, action))
    .then((r) => r.data as T)
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

/**
 * GET yang mengubah data. Sengaja memakai URL terpisah supaya tidak pernah
 * dilayani dari cache browser.
 */
async function write<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const payload = JSON.stringify(body);
  if (payload.length > CONFIG.MAX_WRITE_BYTES) {
    throw new Error(
      `Data terlalu besar untuk dikirim lewat URL (${payload.length} karakter). ` +
        'Perkecil isi kolom textarea atau pecah jadi dua operasi.',
    );
  }

  const url = buildUrl(action, { data: payload, _t: Date.now() });
  const res = await fetch(url);
  const parsed = await parse(res, action);
  if (parsed.warning) console.warn(`[${action}] ${parsed.warning}`);
  return parsed.data as T;
}

/** Buang cache pembacaan yang berawalan aksi tertentu. */
export function invalidate(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.includes(`action=${prefix}`)) cache.delete(key);
  }
}

export function invalidateAll(): void {
  cache.clear();
}

/* =====================================================
   ENDPOINT
   ===================================================== */

export const api = {
  /** Sekali saat halaman dibuka: statistik, daftar divisi, dan peringatan kolom. */
  bootstrap: (): Promise<BootstrapData> => read('getBootstrap'),

  getStats: (): Promise<Stats> =>
    read<{ stats: Stats }>('getDashboardStats').then((d) => d.stats),

  listRequests: (params: {
    page?: number;
    pageSize?: number;
    q?: string;
    status?: string;
    dept?: string;
  } = {}): Promise<TransportPage> =>
    read('getRequests', {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? CONFIG.PAGE_SIZE,
      q: params.q,
      status: params.status,
      dept: params.dept,
    }),

  getRequest: (rowId: number): Promise<TransportItem> =>
    read<{ item: TransportItem }>('getRequestDetail', { rowId }).then((d) => d.item),

  createRequest: (body: Record<string, string>) =>
    write('createRequest', body).then(() => invalidate('getRequests')),

  updateRequest: (body: Record<string, string | number>) =>
    write('updateRequest', body).then(() => invalidate('getRequests')),

  updateStatus: (rowId: number, nopol: string, status: string) =>
    write('updateRequestStatus', { rowId, nopol, status }).then(() => invalidate('getRequests')),

  deleteRequest: (rowId: number) =>
    write('deleteRequest', { rowId }).then(() => invalidate('getRequests')),

  /** Kirim PDF form A5 ke alamat tujuan yang diatur di Code.gs. Maksimal 10. */
  sendEmail: (rowIds: number[]) => write('sendEmail', { rowIds: rowIds.join(',') }),

  listInventaris: (): Promise<InventarisItem[]> => read('getInventarisData'),

  saveInventaris: (body: {
    rowId: number;
    sig: string;
    status: string;
    tglKembaliAktual: string;
    catatan: string;
    lines: InventarisLineInput[];
  }) => write('saveInventaris', body).then(() => invalidate('getInventarisData')),
};

export type { Pagination };