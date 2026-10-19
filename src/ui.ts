/**
 * ui.ts — komponen kecil yang dipakai semua halaman.
 *
 * Tidak ada virtual DOM dan tidak ada library. Pola yang dipakai:
 * bangun HTML dengan template literal, lalu pasang listener secara terpusat
 * lewat delegasi event (lihat main.ts).
 */

import type { FieldDef } from './schema';
import { normalizeStatus, type InventarisStatus, type Status } from './schema';

/* ---------- Selecting ---------- */

export function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Untuk elemen form: punya .value / .options / .disabled. */
export function field$(id: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  return document.getElementById(id) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | null;
}

/** Untuk tombol yang perlu dinonaktifkan sementara request berjalan. */
export function button$(id: string): HTMLButtonElement | null {
  return document.getElementById(id) as HTMLButtonElement | null;
}

export function must<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = $(id);
  if (!el) throw new Error(`Element #${id} tidak ada di halaman.`);
  return el as T;
}

/* ---------- Teks ---------- */

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Teks yang boleh jadi '-' kalau kosong. */
export function orDash(value: unknown): string {
  const s = String(value ?? '').trim();
  return s && s !== '-' ? s : '-';
}

/* ---------- Ikon (SVG inline, tanpa dependensi) ---------- */

const ICON_PATHS: Record<string, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6M9 13h6M9 17h6',
  box: 'M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8zM3.3 7 12 12l8.7-5M12 22V12',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  menu: 'M3 6h18M3 12h18M3 18h18',
  check: 'M20 6 9 17l-5-5',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  chevron: 'm9 18 6-6-6-6',
};

export function icon(name: keyof typeof ICON_PATHS | string, cls = 'w-4 h-4'): string {
  const d = ICON_PATHS[name] ?? ICON_PATHS.clock;
  return (
    `<svg class="${esc(cls)} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="${d}"/></svg>`
  );
}

/* ---------- Toast ---------- */

let toastTimer: number | undefined;

export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const el = $<HTMLDivElement>('toast');
  if (!el) return;

  el.textContent = message;
  el.className =
    `no-print fixed bottom-5 right-5 z-50 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg ` +
    (kind === 'error' ? 'bg-red-600' : 'bg-surface-800');

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.add('hidden'), kind === 'error' ? 5000 : 3000);
}

/* ---------- Drawer ---------- */

export interface DrawerContent {
  title: string;
  body: string;
  footer?: string;
}

export const drawer = {
  open({ title, body, footer = '' }: DrawerContent): void {
    must('drawer-title').textContent = title;
    must('drawer-body').innerHTML = body;
    must('drawer-footer').innerHTML = footer;

    const el = must('drawer');
    el.classList.remove('hidden');
    void el.offsetWidth; // paksa reflow supaya transisi berjalan
    el.classList.add('open');
  },

  close(): void {
    const el = $<HTMLElement>('drawer');
    if (!el || el.classList.contains('hidden')) return;
    el.classList.remove('open');
    window.setTimeout(() => el.classList.add('hidden'), 200);
  },

  isOpen(): boolean {
    return $<HTMLElement>('drawer')?.classList.contains('open') ?? false;
  },
};

/* ---------- Badge status ---------- */

const STATUS_STYLE: Record<Status, string> = {
  Pending: 'badge-pending',
  Disetujui: 'badge-approved',
  Ditolak: 'badge-rejected',
  Selesai: 'badge-completed',
};

export function statusBadge(status: string): string {
  const key = normalizeStatus(status);
  return `<span class="badge ${STATUS_STYLE[key]}">${esc(status || key)}</span>`;
}

export function inventarisBadge(status: InventarisStatus): string {
  const cls = status === 'Selesai' ? 'badge-approved' : 'badge-dipinjam';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

/* ---------- Form dari skema ---------- */

function control(field: FieldDef<string>, value: string, attrs = ''): string {
  const id = `f-${field.key}`;

  if (field.options) {
    const options = [...field.options];
    const current = value || options[0]?.value || '';
    if (current && !options.some((o) => o.value === current)) {
      options.push({ value: current, label: current });
    }
    const html = options
      .map(
        (o) =>
          `<option value="${esc(o.value)}"${o.value === current ? ' selected' : ''}>${esc(o.label)}</option>`,
      )
      .join('');
    return `<select id="${id}" class="field font-semibold" ${attrs}>${html}</select>`;
  }

  if (field.type === 'textarea') {
    return `<textarea id="${id}" rows="3" class="field" ${attrs}>${esc(value)}</textarea>`;
  }

  const type = field.type === 'date' ? 'date' : 'text';
  return (
    `<input type="${type}" id="${id}" class="field${field.upper ? ' font-mono font-bold uppercase' : ''}"` +
    ` value="${esc(value)}"${field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : ''} ${attrs}>`
  );
}

/** Satu baris form. Field readonly ditampilkan sebagai teks. */
export function formField(field: FieldDef<string>, value: string, attrs = ''): string {
  const span = field.half ? '' : 'sm:col-span-2';

  if (field.readonly) {
    return (
      `<div class="${span}">` +
      `<div class="mb-0.5 text-[11px] font-bold tracking-wide text-surface-400 uppercase">${esc(field.label)}</div>` +
      `<div class="text-sm font-semibold break-words">${esc(orDash(value))}</div>` +
      `</div>`
    );
  }

  return (
    `<div class="${span}">` +
    `<label class="field-label" for="f-${field.key}">${esc(field.label)}${
      field.required ? ' <span class="text-red-500">*</span>' : ''
    }</label>` +
    control(field, value, attrs) +
    `</div>`
  );
}

/** Kumpulkan nilai dari seluruh field yang sedang tampil. */
export function readForm<T extends Record<string, string>>(
  fields: readonly FieldDef<string>[],
  fallback: Record<string, string> = {},
): T {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const el = $<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`f-${field.key}`);
    if (!el) continue;
    let value = el.value.trim();
    if (field.upper) value = value.toUpperCase();
    if (field.type === 'date' && value) value = isoToSlash(value);
    out[field.key] = value;
  }
  return { ...(fallback as Record<string, string>), ...out } as T;
}

/* ---------- Tanggal ---------- */

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'DD/MM/YYYY' -> 'YYYY-MM-DD' untuk <input type="date">. Balikin '' kalau tak terbaca. */
export function slashToIso(value: unknown): string {
  const text = String(value ?? '').trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return text;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!slash) return '';
  const a = Number(slash[1]);
  const b = Number(slash[2]);
  // Angka pertama > 12 pasti hari, jadi D/M/Y.
  const month = a > 12 ? b : a;
  const day = a > 12 ? a : b;
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${slash[3]}-${pad(month)}-${pad(day)}`;
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY', format yang dipakai spreadsheet. */
export function isoToSlash(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${Number(parts[2])}/${Number(parts[1])}/${parts[0]}`;
}

/* ---------- Cetak ---------- */

export const print = {
  show(target: 'transport' | 'inventaris'): void {
    for (const key of ['transport', 'inventaris'] as const) {
      $(`print-${key}`)?.classList.toggle('hidden', key !== target);
    }
  },

  hide(): void {
    for (const key of ['transport', 'inventaris'] as const) {
      $(`print-${key}`)?.classList.add('hidden');
    }
  },

  set(id: string, value: unknown): void {
    const el = $(id);
    if (el) el.textContent = orDash(value);
  },

  run(): void {
    window.setTimeout(() => window.print(), 150);
  },
};

window.addEventListener('afterprint', () => print.hide());

/* ---------- Lain-lain ---------- */

/** Delay saat mengetik, supaya tidak memanggil API tiap huruf. */
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number,
): (...args: T) => void {
  let timer: number | undefined;
  return (...args: T) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  };
}

export function loadingRow(colspan: number, label = 'Memuat data...'): string {
  return (
    `<tr><td colspan="${colspan}" class="py-10 text-center text-surface-400">` +
    `<span class="inline-block animate-spin rounded-full border-2 border-primary-500 border-t-transparent mb-2 h-5 w-5"></span>` +
    `<div>${esc(label)}</div></td></tr>`
  );
}

export function emptyRow(colspan: number, label: string): string {
  return `<tr><td colspan="${colspan}" class="py-10 text-center text-surface-400">${esc(label)}</td></tr>`;
}