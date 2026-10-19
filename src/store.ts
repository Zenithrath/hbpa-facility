/**
 * store.ts — status global aplikasi.
 *
 * Sengaja sangat kecil: satu objek biasa, tanpa Proxy, tanpa observable.
 * Halaman memanggil `refresh*()` setelah menulis, jadi tidak perlu ada
 * mekanisme langganan. Kalau nanti aplikasinya tumbuh besar dan bertingkat,
 * ganti file ini saja.
 */

import type { InventarisItem, Stats, TransportItem } from './schema';

export interface AppState {
  ready: boolean;
  stats: Stats;
  departments: string[];
  missingFields: string[];
  itemColumns: number;
  transport: TransportItem[];
  inventaris: InventarisItem[];
}

export const store: AppState = {
  ready: false,
  stats: { total: 0, pending: 0, approved: 0, rejected: 0, completed: 0, month: 0 },
  departments: [],
  missingFields: [],
  itemColumns: 0,
  transport: [],
  inventaris: [],
};

export function findTransport(rowId: number): TransportItem | undefined {
  return store.transport.find((item) => item.rowId === rowId);
}

export function findInventaris(rowId: number): InventarisItem | undefined {
  return store.inventaris.find((item) => item.rowId === rowId);
}