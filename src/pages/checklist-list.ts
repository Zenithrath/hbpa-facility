/** 
 * pages/checklist-list.ts — Halaman Daftar Checklist Kendaraan. 
 * Menampilkan tabel data checklist yang telah diinput. 
 */
import { store } from '../store';
import { api } from '../api';
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
    // Load checklist data from API, lalu render setelah data siap.
    api
      .listChecklist()
      .then((items) => {
        store.checklist = items || [];
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
export function openDetail(rowId: number): void {
  const item = store.checklist.find((i: ClistItem) => i.rowId === rowId);
  if (!item) {
    toast('Data tidak ditemukan.', 'error');
    return;
  }

  drawer.open({
      title: 'Detail Checklist Kendaraan',
      body: `
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-xs font-bold text-surface-500 uppercase">No Dokumen</div>
              <div class="mt-1 text-sm font-semibold">${esc(item.noDok || `Form #${item.rowId}`)}</div>
            </div>
            <div>
              <div class="text-xs font-bold text-surface-500 uppercase">Tanggal</div>
              <div class="mt-1 text-sm">${esc(item.tanggal)}</div>
            </div>
            <div>
              <div class="text-xs font-bold text-surface-500 uppercase">Driver</div>
              <div class="mt-1 text-sm font-semibold">${esc(item.driver)}</div>
            </div>
            <div>
              <div class="text-xs font-bold text-surface-500 uppercase">Kendaraan</div>
              <div class="mt-1 text-sm">${esc(item.kendaraan)}</div>
            </div>
          </div>
          <div>
            <div class="text-xs font-bold text-surface-500 uppercase">Keterangan</div>
            <div class="mt-1 text-sm">${esc(item.keterangan)}</div>
          </div>
        </div>`,
      footer: `
        <button class="btn-primary" data-action="cl-print" data-id="${rowId}">${icon('print')} Cetak</button>`,
  });
}

/** Cetak checklist: minta tanda tangan dulu lewat modal bersama */
export function printChecklist(rowId: number): void {
  const item = store.checklist.find((i: ClistItem) => i.rowId === rowId);
  if (!item) {
    toast('Data tidak ditemukan.', 'error');
    return;
  }

  askSignature(
    'Cetak Checklist Kendaraan',
    [{ key: 'diperiksa', label: 'Diperiksa oleh', prefillName: item.driver, required: true }],
    (sigs) => executePrint(item, sigs),
  );
}

/** Eksekusi cetak setelah tanda tangan terisi */
function executePrint(item: ClistItem, sigs: Signatures): void {
  print.show('checklist');
  print.set('pc-tanggal', item.tanggal || '-');
  print.set('pc-nopol', item.kendaraan || '-');
  print.set('pc-driver', item.driver || '-');
  print.set('pc-keterangan', item.keterangan || '-');
  const ttd = sigs.diperiksa;
  print.set('pc-diperiksa', ttd?.name || item.driver);
  const ttdEl = document.getElementById('pc-ttd');
  if (ttdEl) ttdEl.innerHTML = ttd?.image ? `<img src="${ttd.image}" alt="" style="height:40px">` : '';
  print.run();
}