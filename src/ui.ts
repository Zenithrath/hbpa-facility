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

export interface NoticeDialogOptions {
  title: string;
  message: string;
  tone: 'success' | 'error';
  buttonLabel?: string;
}

/** Dialog singkat untuk hasil aksi penting (mis. simpan checklist). */
export function showNoticeDialog({ title, message, tone, buttonLabel }: NoticeDialogOptions): void {
  document.getElementById('app-dialog')?.remove();
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const isSuccess = tone === 'success';
  const buttonText = buttonLabel ?? (isSuccess ? 'Tutup' : 'Periksa lagi');

  const overlay = document.createElement('div');
  overlay.id = 'app-dialog';
  overlay.className = 'fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4';
  overlay.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" class="w-full max-w-md rounded-2xl border ${isSuccess ? 'border-emerald-200' : 'border-red-200'} bg-white p-5 text-center shadow-2xl sm:p-6">
    <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full ${isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}">
      ${icon(isSuccess ? 'check' : 'alert', 'h-6 w-6')}
    </div>
    <h2 id="app-dialog-title" class="mt-3 text-lg font-bold text-surface-900">${esc(title)}</h2>
    <p class="mt-2 text-sm leading-6 text-surface-600">${esc(message)}</p>
    <button id="app-dialog-ok" type="button" class="${isSuccess ? 'btn-primary' : 'btn bg-red-600 px-5 py-2 text-white hover:bg-red-700'} mt-4 w-full sm:w-auto">${esc(buttonText)}</button>
  </div>`;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
    previousFocus?.focus();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector('#app-dialog-ok')?.addEventListener('click', close);
  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);
  window.setTimeout(() => overlay.querySelector<HTMLButtonElement>('#app-dialog-ok')?.focus(), 0);
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
    const bodyEl = must('drawer-body');
    bodyEl.innerHTML = body;
    bodyEl.scrollTop = 0;
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

  const type = field.type === 'date' || field.type === 'time' ? field.type : 'text';
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
  return `${pad(Number(parts[2]))}/${pad(Number(parts[1]))}/${parts[0]}`;
}

/* ---------- Cetak ---------- */

type PrintTarget = 'transport' | 'inventaris' | 'daily' | 'checklist' | 'manpower-requisition' | 'job-completion';

export const print = {
  currentTarget: null as PrintTarget | null,

  show(target: PrintTarget): void {
    this.currentTarget = target;
    for (const key of ['transport', 'inventaris', 'daily', 'checklist', 'manpower-requisition', 'job-completion'] as const) {
      $(`print-${key}`)?.classList.toggle('hidden', key !== target);
    }
  },

  hide(): void {
    this.currentTarget = null;
    document.getElementById('hbpa-print-page')?.remove();
    for (const key of ['transport', 'inventaris', 'daily', 'checklist', 'manpower-requisition', 'job-completion'] as const) {
      $(`print-${key}`)?.classList.add('hidden');
    }
  },

  set(id: string, value: unknown): void {
    const el = $(id);
    if (el) el.textContent = orDash(value);
  },

  /** Isi slot area cetak dengan HTML (mis. gambar tanda tangan + nama). */
  setHtml(id: string, html: string): void {
    const el = $(id);
    if (el) el.innerHTML = html;
  },

  run(): void {
    document.getElementById('hbpa-print-page')?.remove();
    const style = document.createElement('style');
    style.id = 'hbpa-print-page';
    let size = 'A5 landscape';
    if (this.currentTarget === 'transport' || this.currentTarget === 'manpower-requisition') size = 'A5 portrait';
    if (this.currentTarget === 'checklist' || this.currentTarget === 'job-completion') size = 'A4 portrait';
    style.textContent = `@media print { @page { size: ${size}; margin: 2mm; } }`;
    document.head.appendChild(style);
    window.setTimeout(() => window.print(), 150);
  },
};

window.addEventListener('afterprint', () => print.hide());

/* ---------- Modal tanda tangan sebelum cetak ---------- */

/** Satu kolom tanda tangan pada dokumen (berbeda tiap format cetak). */
export interface SignatureSlot {
  key: string;
  label: string;
  prefillName?: string;
  role?: string;
  /** Wajib diisi sebelum cetak. */
  required?: boolean;
}

export interface SignatureValue {
  name: string;
  role: string;
  /** PNG hasil gambar di kanvas, null bila tidak digambar. */
  image: string | null;
}

export type Signatures = Record<string, SignatureValue>;

const SIG_NAME_KEY = 'hbpa-sig-name-';
const SIG_ROLE_KEY = 'hbpa-sig-role-';

let sigModalEl: HTMLElement | null = null;
let sigSlots: SignatureSlot[] = [];
let sigOnConfirm: ((sigs: Signatures) => void) | null = null;
let sigDrawers: Record<string, { clear: () => void; data: () => string | null }> = {};

function closeSigModal(): void {
  sigModalEl?.classList.add('hidden');
  sigOnConfirm = null;
}

/** HTML tanda tangan (gambar hasil gambar + nama/jabatan) untuk area cetak. */
export function signatureHtml(sig?: SignatureValue): string {
  if (!sig?.name) return '';
  const img = sig.image
    ? `<img src="${sig.image}" alt="" style="height:42px;display:block;margin:0 auto">`
    : '';
  const who = sig.role
    ? `${esc(sig.name)}<br><span style="font-size:7pt;line-height:1">(${esc(sig.role)})</span>`
    : esc(sig.name);
  // line-height 1 supaya nama dan jabatan mepet (dua baris tanpa jarak).
  return `${img}<span style="font-size:8pt;line-height:1;display:block">${who}</span>`;
}

/** Pasang gambar tanda tangan (pointer/mouse/touch) di satu kanvas. */
function wireSigCanvas(canvas: HTMLCanvasElement): { clear: () => void; data: () => string | null } {
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (ctx) {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  let drawing = false;
  let ink = false;
  const point = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / (r.width || 1)) * canvas.width,
      y: ((e.clientY - r.top) / (r.height || 1)) * canvas.height,
    };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!ctx) return;
    drawing = true;
    ink = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || !ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  const stop = () => {
    drawing = false;
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointerleave', stop);
  canvas.addEventListener('pointercancel', stop);
  return {
    clear() {
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      ink = false;
    },
    data() {
      if (!ink) return null;
      try {
        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    },
  };
}

function confirmSignatures(): void {
  const sigs: Signatures = {};
  for (const slot of sigSlots) {
    const name = (field$(`sig-name-${slot.key}`)?.value ?? '').trim();
    if (slot.required && !name) {
      toast(`Nama ${slot.label} wajib diisi.`, 'error');
      field$(`sig-name-${slot.key}`)?.focus();
      return;
    }
    const role = (field$(`sig-role-${slot.key}`)?.value ?? '').trim();
    if (name) {
      try {
        localStorage.setItem(SIG_NAME_KEY + slot.key, name);
        localStorage.setItem(SIG_ROLE_KEY + slot.key, role);
      } catch {
        // localStorage bisa penuh/di-block; tidak fatal.
      }
    }
    sigs[slot.key] = {
      name,
      role,
      image: name ? (sigDrawers[slot.key]?.data() ?? null) : null,
    };
  }
  const cb = sigOnConfirm;
  closeSigModal();
  cb?.(sigs);
}

/**
 * Pop up tanda tangan sebelum cetak. Tiap format dokumen punya daftar kolom
 * tanda tangan berbeda (slot); setiap slot punya nama, jabatan, dan kanvas
 * gambar tanda tangan. Nama/jabatan terakhir diingat di localStorage.
 */
export function askSignature(
  title: string,
  slots: SignatureSlot[],
  onConfirm: (sigs: Signatures) => void,
): void {
  if (!sigModalEl) {
    sigModalEl = document.createElement('div');
    sigModalEl.id = 'sig-modal';
    sigModalEl.className = 'no-print fixed inset-0 z-[60] hidden';
    sigModalEl.innerHTML = `
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" data-sig-cancel></div>
      <div class="absolute top-1/2 left-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
        <h3 class="text-base font-bold">Tanda Tangan</h3>
        <p class="mt-1 text-sm text-surface-500" id="sig-title"></p>
        <div id="sig-slots" class="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1"></div>
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn-slate px-4 py-2" data-sig-cancel>Batal</button>
          <button class="btn-primary px-4 py-2" id="sig-confirm">Cetak</button>
        </div>
      </div>`;
    document.body.appendChild(sigModalEl);

    sigModalEl.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-sig-cancel]')) closeSigModal();
    });

    $('sig-confirm')?.addEventListener('click', confirmSignatures);
  }

  sigSlots = slots;
  sigDrawers = {};
  sigOnConfirm = onConfirm;

  const titleEl = $('sig-title');
  if (titleEl) titleEl.textContent = title;

  const box = $('sig-slots');
  if (!box) return;

  box.innerHTML = slots
    .map((slot) => {
      let savedName = '';
      let savedRole = '';
      try {
        savedName = localStorage.getItem(SIG_NAME_KEY + slot.key) ?? '';
        savedRole = localStorage.getItem(SIG_ROLE_KEY + slot.key) ?? '';
      } catch {
        // abaikan
      }
      return `
      <div class="rounded-xl border border-surface-200 p-3">
        <div class="flex items-center justify-between gap-2">
          <label class="field-label" for="sig-name-${esc(slot.key)}">${esc(slot.label)}${slot.required ? ' <span class="text-red-500">*</span>' : ''}</label>
          ${slot.role ? `<span class="text-[11px] text-surface-400">${esc(slot.role)}</span>` : ''}
        </div>
        <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <input id="sig-name-${esc(slot.key)}" type="text" class="field" placeholder="Nama penanda tangan" value="${esc(slot.prefillName || savedName || '')}">
            <input id="sig-role-${esc(slot.key)}" type="text" class="field mt-1" placeholder="Jabatan${slot.role ? '' : ' (opsional)'}" value="${esc(savedRole || slot.role || '')}">
          </div>
          <div>
            <canvas id="sig-canvas-${esc(slot.key)}" width="300" height="90" class="block w-full cursor-crosshair rounded-lg border border-surface-300 bg-white"></canvas>
            <button type="button" class="mt-1 text-[11px] font-semibold text-surface-400 hover:text-red-600" data-sig-clear="${esc(slot.key)}">Hapus gambar</button>
          </div>
        </div>
      </div>`;
    })
    .join('');

  for (const slot of slots) {
    const canvas = $<HTMLCanvasElement>(`sig-canvas-${slot.key}`);
    if (canvas && typeof canvas.getContext === 'function') {
      sigDrawers[slot.key] = wireSigCanvas(canvas);
    }
  }
  box.querySelectorAll<HTMLElement>('[data-sig-clear]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sigDrawers[btn.getAttribute('data-sig-clear') ?? '']?.clear();
    });
  });

  sigModalEl.classList.remove('hidden');
  window.setTimeout(() => $<HTMLInputElement>(`sig-name-${slots[0]?.key ?? ''}`)?.focus(), 50);
}

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