/** 
 * pages/checklist-list.ts — Halaman Daftar Checklist Kendaraan. 
 * Menampilkan tabel data checklist yang telah diinput. 
 */
import { store } from '../store';
import { api } from '../api';
import type { CkHeader } from '../schema';
import { renderChecklistPaper } from './checklist-paper';
import {
  $,
  askSignature,
  debounce,
  drawer,
  esc,
  field$,
  icon,
  must,
  orDash,
  print,
  type Signatures,
  toast,
} from '../ui';

interface Page {
  title: string;
  icon: string;
  html(): string;
  mount?(): void | Promise<void>;
  onSearchInput?(): void;
  onFilterChange?(): void;
}

interface ClistItem {
  rowId: number;
  noDok: string;
  tanggal: string;
  driver: string;
  kendaraan: string;
  keterangan: string;
}

let ckDocs: CkHeader[] = [];

async function ensureCkDocs(): Promise<CkHeader[]> {
  if (ckDocs.length) return ckDocs;
  try {
    ckDocs = (await api.getCkDocuments()) || [];
  } catch {
    ckDocs = [];
  }
  return ckDocs;
}

function renderList(): void {
  const tbody = $('cl-tbody');
  const cards = $('cl-cards');
  const count = $('cl-count');
  if (!tbody || !cards || !count) return;

  const q = (field$('cl-q')?.value ?? '').trim().toLowerCase();
  const status = (field$('cl-filter-status')?.value ?? '');
  const items = store.checklist.filter((item: ClistItem) => {
    if (status && item.keterangan !== status) return false;
    if (!q) return true;
    return [item.noDok, item.driver, item.kendaraan, item.keterangan]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  if (!items.length) {
    tbody.innerHTML = '<tr><td class="p-4" colspan="6">Tidak ada data checklist.</td></tr>';
    cards.innerHTML = '<div class="card p-8 text-center text-sm text-surface-400">Tidak ada data checklist.</div>';
    must('cl-count').textContent = '0 dari 0 checklist';
    return;
  }

  tbody.innerHTML = items
    .map((item: ClistItem) => `
      <tr class="cursor-pointer border-b border-surface-100 hover:bg-surface-100"
        data-action="cl-open" data-id="${item.rowId}">
        <td class="px-4 py-3 text-sm font-bold whitespace-nowrap">
          ${item.noDok || `Form #${item.rowId}`}
        </td>
        <td class="px-4 py-3 text-sm whitespace-nowrap">
          ${item.tanggal || ''}
        </td>
        <td class="px-4 py-3 text-sm font-semibold whitespace-nowrap">
          ${item.driver || ''}
        </td>
        <td class="px-4 py-3 text-sm whitespace-nowrap">
          ${item.kendaraan || ''}
        </td>
        <td class="px-4 py-3 text-sm whitespace-nowrap">
          ${item.keterangan || ''}
        </td>
        <td class="sticky-col px-4 py-3 text-right whitespace-nowrap">
          <div class="inline-flex gap-1.5">
            <button class="btn-slate" data-action="cl-open" data-id="${item.rowId}">Detail</button>
            <button class="btn-primary" data-action="cl-print" data-id="${item.rowId}">${icon('print')} Cetak</button>
          </div>
        </td>
      </tr>
    `).join('');

  cards.innerHTML = items
    .map((item: ClistItem) => `
      <div class="card p-4" data-action="cl-open" data-id="${item.rowId}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-bold text-primary-700 break-words">
              ${item.noDok || `Form #${item.rowId}`}
            </div>
            <div class="text-[11px] text-surface-400">
              ${item.tanggal || ''} · ${item.driver || ''}
            </div>
          </div>
          <div class="mt-2">
            <div class="font-bold break-words">${esc(orDash(item.keterangan))}</div>
          </div>
        </div>
      </div>
    `).join('');

  must('cl-count').textContent = items.length + ' dari ' + store.checklist.length + ' checklist';
}

const CHECKLIST_LIST_PAGE: Page = {
  title: 'Daftar Checklist',
  icon: 'list',
  html: () => `
    <div class="space-y-4">
      <div class="card p-4 sm:p-6">
        <div id="cl-msg" class="text-sm font-semibold text-surface-700"></div>

        <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label class="field-label" for="cl-q">Cari</label>
            <input id="cl-q" type="search" class="field" placeholder="Cari no. dokumen, driver, atau kendaraan...">
          </div>
          <div>
            <label class="field-label" for="cl-filter-status">Status</label>
            <select id="cl-filter-status" class="field w-auto text-xs font-semibold">
              <option value="">Semua Status</option>
              <option value="Baik">Baik</option>
              <option value="Rusak">Rusak</option>
            </select>
          </div>
        </div>

        <div class="mt-4">
          <table class="w-full border-collapse text-left text-sm">
            <thead class="bg-surface-50 text-[11px] font-bold tracking-wider text-surface-500 uppercase">
              <tr>
                <th class="px-4 py-3.5 whitespace-nowrap">No Dok</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Tanggal</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Driver</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Kendaraan</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Keterangan</th>
                <th class="px-4 py-3.5 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody id="cl-tbody"></tbody>
          </table>
        </div>

        <div class="mt-4 hidden grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" id="cl-cards"></div>

        <p id="cl-count" class="text-[11px] text-surface-400"></div>
      </div>
    </div>`,
  mount(): void {
    // Load ringkasan + dokumen lengkap checklist, lalu render setelah data siap.
    Promise.all([api.listChecklist(), api.getCkDocuments()])
      .then(([items, docs]) => {
        store.checklist = items || [];
        ckDocs = docs || [];
        renderList();
      })
      .catch(() => toast('Gagal memuat data checklist.', 'error'));

    // Bind search input
    (field$('cl-q') ?? $('cl-q'))?.addEventListener('input', debounce(() => renderList(), 250));
    (field$('cl-filter-status') ?? $('cl-filter-status'))?.addEventListener('change', renderList);
  },
  onSearchInput: (): void => {
    const q = (field$('cl-q')?.value ?? '').trim().toLowerCase();
    const status = (field$('cl-filter-status')?.value ?? '');
    const items = store.checklist.filter((item: ClistItem) => {
      if (status && item.keterangan !== status) return false;
      if (!q) return true;
      return [item.noDok, item.driver, item.kendaraan, item.keterangan]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    // Update UI with filtered items - renderList already handles showing/hiding
    must('cl-count').textContent = `${items.length} dari ${store.checklist.length} checklist`;
  },
  onFilterChange: (): void => {
    renderList();
  }
};

export { CHECKLIST_LIST_PAGE as checklistListPage };

/** Buka detail checklist di drawer */
export async function openDetail(rowId: number): Promise<void> {
  const item = store.checklist.find((i: ClistItem) => i.rowId === rowId);
  const docs = await ensureCkDocs();
  const doc = docs.find((d: CkHeader) => d.rowId === rowId);
  if (!item && !doc) {
    toast('Data tidak ditemukan.', 'error');
    return;
  }

  const d = doc;

  const bodyEl = must('drawer-body');
  const prevOverflow = bodyEl.style.overflow;
  bodyEl.style.overflow = 'hidden';
  const originalClose = drawer.close;
  drawer.close = () => {
    bodyEl.style.overflow = prevOverflow;
    originalClose();
    drawer.close = originalClose;
  };

  drawer.open({
      title: 'Detail Checklist Kendaraan',
      body: '<div style="transform:scale(0.64);transform-origin:top left;width:595.28pt;height:539pt;overflow:auto">' +
            renderChecklistPaper(d, item) +
            '</div>',
      footer: '<button class="btn-primary" data-action="cl-print" data-id="' + rowId + '">Cetak</button>',
  });
}

/** Cetak checklist: minta tanda tangan dulu lewat modal bersama */
export async function printChecklist(rowId: number): Promise<void> {
  const docs = await ensureCkDocs();
  const doc = docs.find((d: CkHeader) => d.rowId === rowId);
  const item = store.checklist.find((i: ClistItem) => i.rowId === rowId);
  if (!doc && !item) {
    toast('Data tidak ditemukan.', 'error');
    return;
  }

  const d = doc;
  askSignature(
    'Cetak Checklist Kendaraan',
    [{ key: 'diperiksa', label: 'Diperiksa oleh', prefillName: d?.driver || item?.driver || '', required: true }],
    (sigs) => printSavedChecklist(d, item, sigs),
  );
}

function printSavedChecklist(doc: CkHeader | undefined, item: ClistItem | undefined, sigs: Signatures): void {
  print.show('checklist');
  const area = document.getElementById('print-checklist');
  if (area) area.innerHTML = renderChecklistPaper(doc, item, sigs);
  print.run();
}
