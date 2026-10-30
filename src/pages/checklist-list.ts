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
  const originalClose = drawer.close;
  drawer.close = () => {
    bodyEl.style.overflow = prevOverflow;
    originalClose();
    drawer.close = originalClose;
  };

  const paperPreview = (doc?: CkHeader, it?: ClistItem) => `
    <div class="ck-drawer-scroll" style="max-height:calc(100vh - 240px);overflow:auto">
      <div style="width:381pt;height:539pt;overflow:hidden;margin:0 auto">
        <div style="width:595.28pt;height:841.89pt;transform:scale(0.64);transform-origin:top left">
          ${renderChecklistPaper(doc, it)}
        </div>
      </div>
    </div>`;

  drawer.open({
      title: 'Detail Checklist Kendaraan',
      body: `
        <div class="mb-4 inline-flex rounded-xl bg-surface-100 p-1" id="ck-tabs">
          <button type="button" data-ck-tab="preview" class="px-4 py-1.5 text-sm font-semibold rounded-lg">Preview</button>
          <button type="button" data-ck-tab="edit" class="px-4 py-1.5 text-sm font-semibold rounded-lg">Edit</button>
        </div>
        <div id="ck-preview">${paperPreview(d, item)}</div>
        <div id="ck-edit" class="hidden space-y-4">${renderCkEditForm(d, item)}</div>
      `,
      footer: `
        <div class="flex flex-wrap gap-2">
          <button class="btn-slate" data-action="cl-print" data-id="${rowId}">Cetak</button>
          <button class="btn-slate" id="ck-edit-toggle" type="button">Edit</button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-slate hidden" id="ck-cancel-edit" type="button">Batal</button>
          <button class="btn-primary hidden" id="ck-save-edit" type="button">Simpan</button>
        </div>
      `,
  });

  // Tab switching: preview = kertas (scroll kecil di dalam), edit = form (body scroll).
  const previewEl = must('ck-preview');
  const editEl = must('ck-edit');
  const tabBtns = Array.from(document.querySelectorAll<HTMLElement>('[data-ck-tab]'));
  const editToggle = document.getElementById('ck-edit-toggle');
  const cancelBtn = document.getElementById('ck-cancel-edit');
  const saveBtn = document.getElementById('ck-save-edit');

  const setTab = (tab: 'preview' | 'edit') => {
    const isPreview = tab === 'preview';
    previewEl.classList.toggle('hidden', !isPreview);
    editEl.classList.toggle('hidden', isPreview);
    bodyEl.style.overflow = isPreview ? 'hidden' : 'auto';
    bodyEl.scrollTop = 0;
    tabBtns.forEach((b) => {
      const active = b.getAttribute('data-ck-tab') === tab;
      b.classList.toggle('bg-white', active);
      b.classList.toggle('text-primary-600', active);
      b.classList.toggle('shadow-sm', active);
      b.classList.toggle('text-surface-500', !active);
    });
    editToggle?.classList.toggle('hidden', !isPreview);
    cancelBtn?.classList.toggle('hidden', isPreview);
    saveBtn?.classList.toggle('hidden', isPreview);
  };
  setTab('preview');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn.getAttribute('data-ck-tab') === 'edit' ? 'edit' : 'preview');
      setTab(tab);
    });
  });
  editToggle?.addEventListener('click', () => setTab('edit'));
  cancelBtn?.addEventListener('click', () => setTab('preview'));

  // Damage add/remove
  const addDmg = document.getElementById('ce-add-damage');
  if (addDmg) {
    addDmg.addEventListener('click', () => {
      const container = document.getElementById('ce-damages');
      if (!container) return;
      // reuse renderDamageRow by inline
      const views = ['ATAS', 'KIRI', 'KANAN', 'DEPAN', 'BELAKANG'];
      const vOpts = views.map((v) => '<option value="' + v + '">' + v + '</option>').join('');
      const row = document.createElement('div');
      row.className = 'ce-damage-row flex items-center gap-2 py-1';
      row.innerHTML =
        '<select class="field w-24 text-xs ce-dmg-view">' + vOpts + '</select>' +
        '<input class="field w-16 text-xs ce-dmg-x" type="number" min="0" max="100" value="0">' +
        '<input class="field w-16 text-xs ce-dmg-y" type="number" min="0" max="100" value="0">' +
        '<input class="field flex-1 text-xs ce-dmg-catatan" placeholder="catatan" value="">' +
        '<button type="button" class="btn-slate text-xs ce-dmg-remove">Hapus</button>';
      container.appendChild(row);
      row.querySelector('.ce-dmg-remove')?.addEventListener('click', () => row.remove());
    });
  }
  document.querySelectorAll('.ce-dmg-remove').forEach((btn) => {
    btn.addEventListener('click', () => (btn as HTMLElement).closest('.ce-damage-row')?.remove());
  });

  // Simpan perubahan lalu kembali ke tab Preview.
  saveBtn?.addEventListener('click', async () => {
    try {
      const body = collectCkEdit(rowId);
      await api.updateCk(body);
      toast('Checklist diperbarui.', 'info');
      ckDocs = await api.getCkDocuments();
      const newDoc = ckDocs.find((x: CkHeader) => x.rowId === rowId);
      previewEl.innerHTML = paperPreview(newDoc, item);
      setTab('preview');
    } catch (e) {
      toast('Gagal menyimpan: ' + (e as Error).message, 'error');
    }
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

/** Render form edit untuk checklist (header + item + kerusakan). */
function renderCkEditForm(doc: CkHeader | undefined, item: ClistItem | undefined): string {
  const d = doc;
  const esc2 = (v: unknown) => String(v ?? '');
  const levels = ['E', '1/4', '1/2', '3/4', 'F'];
  const statuses = ['Baik', 'Rusak', 'Tidak Ada'];
  const lvlOpts = (cur: string) => levels.map((l) => '<option value="' + l + '"' + (l === cur ? ' selected' : '') + '>' + l + '</option>').join('');
  const stOpts = (cur: string) => statuses.map((st) => '<option value="' + st + '"' + (st === cur ? ' selected' : '') + '>' + st + '</option>').join('');

  let html = '';
  html += '<div class="grid grid-cols-2 gap-3">';
  html += '<div><label class="field-label">No Dokumen</label><input class="field" id="ce-id" value="' + esc2(d?.id || item?.noDok || '') + '" readonly></div>';
  html += '<div><label class="field-label">Tanggal</label><input class="field" id="ce-tanggal" value="' + esc2(d?.tanggal || item?.tanggal || '') + '"></div>';
  html += '<div><label class="field-label">Counter</label><input class="field" id="ce-counter" value="' + esc2(d?.counter || '') + '"></div>';
  html += '<div><label class="field-label">Type Mobil</label><input class="field" id="ce-tipe" value="' + esc2(d?.tipeMobil || '') + '"></div>';
  html += '<div><label class="field-label">Driver</label><input class="field" id="ce-driver" value="' + esc2(d?.driver || item?.driver || '') + '"></div>';
  html += '<div><label class="field-label">Kendaraan</label><input class="field" id="ce-kendaraan" value="' + esc2(d?.noPolisi || item?.kendaraan || '') + '"></div>';
  html += '<div><label class="field-label">Kilometer</label><input class="field" id="ce-km" value="' + esc2(d?.kilometer || '') + '"></div>';
  html += '<div><label class="field-label">BBM Masuk</label><select class="field" id="ce-bbmMasuk">' + lvlOpts(d?.bbmMasuk || '') + '</select></div>';
  html += '<div><label class="field-label">BBM Keluar</label><select class="field" id="ce-bbmKeluar">' + lvlOpts(d?.bbmKeluar || '') + '</select></div>';
  html += '<div><label class="field-label">Status</label><input class="field" id="ce-status" value="' + esc2(d?.status || '') + '"></div>';
  html += '<div class="sm:col-span-2"><label class="field-label">Diperiksa Oleh</label><input class="field" id="ce-diperiksa" value="' + esc2(d?.diperiksaOleh || '') + '"></div>';
  html += '<div class="sm:col-span-2"><label class="field-label">Keterangan</label><textarea class="field" id="ce-keterangan" rows="2">' + esc2(d?.keterangan || item?.keterangan || '') + '</textarea></div>';
  html += '</div>';

  // Items
  html += '<div class="mt-3"><div class="text-xs font-bold text-surface-500 uppercase mb-2">Item Pemeriksaan</div>';
  const groups: Record<string, any[]> = {};
  const order: string[] = [];
  for (const it of d?.items || []) {
    const g = it.grup;
    if (!groups[g]) { groups[g] = []; order.push(g); }
    groups[g]!.push(it);
  }
  if (!order.length) order.push('Kaca');
  for (const g of order) {
    html += '<div class="rounded-lg border border-surface-200 p-3 mb-2">';
    html += '<div class="text-xs font-bold text-surface-500 uppercase mb-2">' + esc2(g) + '</div>';
    for (const it of groups[g] || []) {
      html += '<div class="flex items-center gap-2 py-1 border-b border-surface-100 last:border-0">';
      html += '<span class="text-sm flex-1">' + esc2(it.item) + '</span>';
      html += '<select class="field w-28 text-xs ce-item-status" data-grup="' + esc2(it.grup) + '" data-item="' + esc2(it.item) + '">' + stOpts(it.status) + '</select>';
      html += '<input class="field w-32 text-xs ce-item-catatan" data-grup="' + esc2(it.grup) + '" data-item="' + esc2(it.item) + '" placeholder="catatan" value="' + esc2(it.catatan || '') + '">';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Damages
  html += '<div class="mt-3"><div class="text-xs font-bold text-surface-500 uppercase mb-2">Tanda Kerusakan</div>';
  html += '<div id="ce-damages">';
  for (const m of d?.damages || []) {
    html += renderDamageRow(m);
  }
  html += '</div>';
  html += '<button type="button" class="btn-slate mt-2" id="ce-add-damage">+ Tambah Kerusakan</button>';
  html += '</div>';

  return html;
}

function renderDamageRow(m: { view: string; x: number; y: number; catatan?: string }): string {
  const views = ['ATAS', 'KIRI', 'KANAN', 'DEPAN', 'BELAKANG'];
  const vOpts = views.map((v) => '<option value="' + v + '"' + (v === (m.view || '').toUpperCase() ? ' selected' : '') + '>' + v + '</option>').join('');
  return '<div class="ce-damage-row flex items-center gap-2 py-1">' +
    '<select class="field w-24 text-xs ce-dmg-view">' + vOpts + '</select>' +
    '<input class="field w-16 text-xs ce-dmg-x" type="number" min="0" max="100" value="' + (m.x ?? 0) + '">' +
    '<input class="field w-16 text-xs ce-dmg-y" type="number" min="0" max="100" value="' + (m.y ?? 0) + '">' +
    '<input class="field flex-1 text-xs ce-dmg-catatan" placeholder="catatan" value="' + (m.catatan || '') + '">' +
    '<button type="button" class="btn-slate text-xs ce-dmg-remove">Hapus</button>' +
    '</div>';
}

function collectCkEdit(rowId: number): any {
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value ?? '';
  const items: { grup: string; item: string; status: string; catatan: string }[] = [];
  document.querySelectorAll('.ce-item-status').forEach((el) => {
    const grup = (el as HTMLElement).getAttribute('data-grup') || '';
    const item = (el as HTMLElement).getAttribute('data-item') || '';
    const status = (el as HTMLSelectElement).value;
    const catInput = document.querySelector('.ce-item-catatan[data-grup="' + grup + '"][data-item="' + item + '"]') as HTMLInputElement | null;
    items.push({ grup, item, status, catatan: catInput?.value ?? '' });
  });

  const damages: { view: string; x: number; y: number; catatan: string }[] = [];
  document.querySelectorAll('.ce-damage-row').forEach((row) => {
    const view = (row.querySelector('.ce-dmg-view') as HTMLSelectElement).value;
    const x = Number((row.querySelector('.ce-dmg-x') as HTMLInputElement).value);
    const y = Number((row.querySelector('.ce-dmg-y') as HTMLInputElement).value);
    const catatan = (row.querySelector('.ce-dmg-catatan') as HTMLInputElement).value;
    damages.push({ view, x, y, catatan });
  });

  return {
    id: g('ce-id'),
    rowId: rowId,
    tanggal: g('ce-tanggal'),
    counter: g('ce-counter'),
    tipeMobil: g('ce-tipe'),
    driver: g('ce-driver'),
    kendaraan: g('ce-kendaraan'),
    kilometer: g('ce-km'),
    bbmMasuk: g('ce-bbmMasuk'),
    bbmKeluar: g('ce-bbmKeluar'),
    keterangan: g('ce-keterangan'),
    diperiksaOleh: g('ce-diperiksa'),
    status: g('ce-status'),
    items: items,
    damages: damages,
  };
}
