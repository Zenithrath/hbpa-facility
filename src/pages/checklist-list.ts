/** 
 * pages/checklist-list.ts — Halaman Daftar Checklist Kendaraan. 
 * Menampilkan tabel data checklist yang telah diinput. 
 */
import { store } from '../store';
import { api } from '../api';
import type { CkDamage, CkHeader } from '../schema';
import { CK_ITEMS, renderChecklistPaper } from './checklist-paper';
import {
  DAMAGE_VIEWS,
  VIEW_DIMENSIONS,
  bindDamageCanvas,
  preloadDamageImages,
  type DamageCanvasBinding,
  type DamageMark,
} from './checklist-canvas';
import {
  $,
  actionBtn,
  actionCell,
  askSignature,
  cardActions,
  drawer,
  emptyCard,
  emptyRow,
  esc,
  field$,
  loadingRow,
  must,
  orDash,
  print,
  report,
  searchBar,
  setBusy,
  tableHead,
  type Signatures,
  toast,
} from '../ui';

interface Page {
  title: string;
  icon: string;
  html(): string;
  mount?(): void | Promise<void>;
  onSearchInput?(): void;
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

/** State editor kerusakan di drawer: daftar penanda + pilihan aktif. */
let editDamages: CkDamage[] = [];
let editPending: DamageMark | null = null;
let editSelected: number | null = null;
let editCanvasBindings: DamageCanvasBinding[] = [];

/** Dokumen yang sedang diedit, supaya preview/cetak ikut perubahan yang belum disimpan. */
let activeEditRowId: number | null = null;
let activeEditDoc: CkHeader | null = null;
let editDirty = false;
let refreshEditPreview: (() => void) | null = null;
/** Aksi tombol Simpan di footer drawer (dipanggil lewat data-action="save"). */
let saveEditHandler: (() => Promise<void>) | null = null;

export async function saveEdit(): Promise<void> {
  await saveEditHandler?.();
}

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
  const items = store.checklist.filter((item: ClistItem) => {
    if (!q) return true;
    return [item.noDok, item.driver, item.kendaraan, item.keterangan]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  if (!items.length) {
    tbody.innerHTML = emptyRow(6, 'Tidak ada data checklist.');
    cards.innerHTML = emptyCard('Tidak ada data checklist.');
    must('cl-count').textContent = '0 dari 0 checklist';
    return;
  }

  tbody.innerHTML = items
    .map((item: ClistItem) => `
      <tr data-action="detail" data-id="${item.rowId}">
        <td class="font-bold whitespace-nowrap">${esc(item.noDok || `Form #${item.rowId}`)}</td>
        <td class="whitespace-nowrap">${esc(item.tanggal)}</td>
        <td class="font-semibold whitespace-nowrap">${esc(item.driver)}</td>
        <td class="whitespace-nowrap">${esc(item.kendaraan)}</td>
        <td>${esc(item.keterangan)}</td>
        ${actionCell(
          actionBtn('detail', { id: item.rowId }),
          actionBtn('print', { id: item.rowId }),
        actionBtn('delete', { id: item.rowId }),
        )}
      </tr>
    `).join('');

  cards.innerHTML = items
    .map((item: ClistItem) => `
      <div class="card p-4" data-action="detail" data-id="${item.rowId}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-bold text-primary-700 break-words">${esc(item.noDok || `Form #${item.rowId}`)}</div>
            <div class="text-[11px] text-surface-400">${esc(item.tanggal)} · ${esc(item.driver)}</div>
          </div>
        </div>
        <div class="mt-2 font-bold break-words">${esc(orDash(item.keterangan))}</div>
        <div class="mt-1 text-xs text-surface-500">Kendaraan: <span class="font-mono font-semibold uppercase">${esc(orDash(item.kendaraan))}</span></div>
        ${cardActions(
          actionBtn('detail', { id: item.rowId }),
          actionBtn('print', { id: item.rowId }),
        actionBtn('delete', { id: item.rowId }),
        )}
      </div>
    `).join('');

  must('cl-count').textContent = items.length + ' dari ' + store.checklist.length + ' checklist';
}

export async function refresh(): Promise<void> {
  const tbody = $('cl-tbody');
  if (tbody) tbody.innerHTML = loadingRow(6);
  try {
    const [items, docs] = await Promise.all([api.listChecklist(), api.getCkDocuments()]);
    store.checklist = items || [];
    ckDocs = docs || [];
    renderList();
  } catch (error) {
    report(error);
  }
}

export async function remove(rowId: number): Promise<void> {
  const item = store.checklist.find((i: ClistItem) => i.rowId === rowId);
  if (!item && !ckDocs.find((d: CkHeader) => d.rowId === rowId)) {
    toast('Data tidak ditemukan.', 'error');
    return;
  }
  if (!confirm(`Hapus checklist ${item?.noDok || rowId}? Baris di spreadsheet akan dihapus.`)) return;
  try {
    await api.deleteCk(rowId);
    toast('Dihapus');
    await refresh();
  } catch (error) {
    report(error);
  }
}

const CHECKLIST_LIST_PAGE: Page = {
  title: 'Checklist',
  icon: 'list',
  html: () => `
    <div class="space-y-4">
      <div class="card flex flex-col gap-3 p-4 sm:flex-row">
        ${searchBar({ id: 'cl-q', placeholder: 'Cari no. dokumen, driver, atau kendaraan...', extra: 'flex-1' })}
      </div>

      <p id="cl-count" class="text-[11px] text-surface-400"></p>

      <div id="cl-cards" class="space-y-3 md:hidden"></div>

      <div class="card hidden overflow-hidden md:block">
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              ${tableHead([
                { label: 'No Dok' },
                { label: 'Tanggal' },
                { label: 'Driver' },
                { label: 'Kendaraan' },
                { label: 'Keterangan' },
                { label: 'Aksi', className: 'text-right' },
              ])}
            </thead>
            <tbody id="cl-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>`,
  mount(): void {
    const tbody = $('cl-tbody');
    if (tbody) tbody.innerHTML = loadingRow(6);
    Promise.all([api.listChecklist(), api.getCkDocuments()])
      .then(([items, docs]) => {
        store.checklist = items || [];
        ckDocs = docs || [];
        renderList();
      })
      .catch((error) => report(error));
  },
  onSearchInput: (): void => renderList(),
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

  editDamages = (d?.damages ?? []).map((m) => ({ ...m }));
  editPending = null;
  editSelected = null;
  editDirty = false;
  activeEditRowId = rowId;
  activeEditDoc = d
    ? { ...d, items: d.items.map((it) => ({ ...it })), damages: editDamages.map((m) => ({ ...m })) }
    : null;

  const bodyEl = must('drawer-body');
  const prevOverflow = bodyEl.style.overflow;
  const originalClose = drawer.close;
  drawer.close = () => {
    editCanvasBindings.forEach((binding) => binding.destroy());
    editCanvasBindings = [];
    activeEditRowId = null;
    activeEditDoc = null;
    editDirty = false;
    saveEditHandler = null;
    refreshEditPreview = null;
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
          ${actionBtn('print', { id: rowId, extra: 'px-4 py-2' })}
          <button class="btn-slate px-4 py-2" id="ck-edit-toggle" type="button">Edit</button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-slate px-4 py-2 hidden" id="ck-cancel-edit" type="button">Batal</button>
          ${actionBtn('save', { id: rowId, extra: 'hidden', attrs: 'id="ck-save-edit"' })}
        </div>
      `,
  });

  // Tab switching: preview = kertas (scroll kecil di dalam), edit = form (body scroll).
  const previewEl = must('ck-preview');
  const editEl = must('ck-edit');
  refreshEditPreview = () => {
    if (activeEditDoc) previewEl.innerHTML = paperPreview(activeEditDoc, item);
  };
  const tabBtns = Array.from(document.querySelectorAll<HTMLElement>('[data-ck-tab]'));
  const editToggle = document.getElementById('ck-edit-toggle');
  const cancelBtn = document.getElementById('ck-cancel-edit');
  const saveBtn = $<HTMLButtonElement>('ck-save-edit');

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

  setupEditDamageEditor();

  // Simpan perubahan lalu kembali ke tab Preview (tombol data-action="save").
  saveEditHandler = async () => {
    if (!saveBtn || saveBtn.disabled) return;
    setBusy(saveBtn, true);
    try {
      const body = collectCkEdit(rowId);
      await api.updateCk(body);
      toast('Checklist diperbarui.');
      ckDocs = await api.getCkDocuments();
      const newDoc = ckDocs.find((x: CkHeader) => x.rowId === rowId);
      if (newDoc) {
        editDamages = (newDoc.damages ?? []).map((m) => ({ ...m }));
        activeEditDoc = {
          ...newDoc,
          items: newDoc.items.map((it) => ({ ...it })),
          damages: editDamages.map((m) => ({ ...m })),
        };
      }
      editDirty = false;
      updateEditDirtyIndicator();
      previewEl.innerHTML = paperPreview(newDoc, item);
      setTab('preview');
    } catch (e) {
      report(e);
    } finally {
      setBusy(saveBtn, false);
    }
  };
}

/** Cetak checklist: minta tanda tangan dulu lewat modal bersama */
export async function printChecklist(rowId: number): Promise<void> {
  const docs = await ensureCkDocs();
  // Kalau drawer edit untuk baris ini masih terbuka, pakai state live supaya
  // penanda yang baru dihapus/dipindah ikut tercetak.
  const liveDoc = activeEditRowId === rowId ? activeEditDoc : null;
  const doc = liveDoc ?? docs.find((d: CkHeader) => d.rowId === rowId);
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
  // Mulai dari daftar item standar supaya item yang belum tersimpan
  // (mis. Kaca Depan pada data lama) tetap muncul dan bisa diisi.
  const groups: Record<string, { grup: string; item: string; status: string; catatan: string }[]> = {};
  const order: string[] = [];
  const addGroup = (g: string) => {
    if (!groups[g]) { groups[g] = []; order.push(g); }
  };
  Object.keys(CK_ITEMS).forEach((g) => {
    addGroup(g);
    CK_ITEMS[g]!.forEach((name) => groups[g]!.push({ grup: g, item: name, status: '', catatan: '' }));
  });
  for (const it of d?.items || []) {
    addGroup(it.grup);
    const found = groups[it.grup]!.find((x) => x.item === it.item);
    if (found) {
      found.status = it.status;
      found.catatan = it.catatan || '';
    } else {
      groups[it.grup]!.push({ grup: it.grup, item: it.item, status: it.status, catatan: it.catatan || '' });
    }
  }
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
  html += '<div class="mt-3">';
  html += '<div class="text-xs font-bold text-surface-500 uppercase mb-1">Tanda Kerusakan</div>';
  html += '<p class="text-[11px] text-surface-400">Klik lokasi di gambar kendaraan untuk menandai. Klik penanda di daftar untuk memindahkannya.</p>';
  html += '<div class="mt-2 flex flex-col items-center gap-2 sm:flex-row sm:items-center">';
  html += '<div class="text-center sm:w-1/3">';
  html += '<div class="flex h-80 items-center justify-center rounded-lg border border-surface-200 bg-white p-1">';
  html += '<canvas id="ce-cv-ATAS" width="330" height="706" data-view="ATAS" class="block h-auto w-auto max-h-full max-w-full cursor-crosshair rounded"></canvas>';
  html += '</div>';
  html += '<div class="mt-1 text-[11px] font-semibold tracking-wide text-surface-600">ATAS</div>';
  html += '</div>';
  html += '<div class="grid flex-1 grid-cols-2 gap-2">';
  html += renderDamageCanvas('KIRI');
  html += renderDamageCanvas('KANAN');
  html += renderDamageCanvas('DEPAN');
  html += renderDamageCanvas('BELAKANG');
  html += '</div>';
  html += '</div>';
  html += '<div class="mt-2 flex flex-wrap items-center gap-2">';
  html += '<input id="ce-dmg-catatan" type="text" class="field w-auto flex-1 py-1.5 text-xs" placeholder="Catatan kerusakan (opsional)">';
  html += '<button type="button" class="btn-slate" id="ce-catat-damage">Catat penanda</button>';
  html += '<span id="ce-dmg-hint" class="text-[11px] text-surface-400">Klik gambar untuk memilih lokasi.</span>';
  html += '<span id="ce-dirty" class="hidden text-[11px] font-semibold text-amber-600">Perubahan belum disimpan.</span>';
  html += '</div>';
  html += '<div class="mt-2 text-sm">';
  html += '<div>Penanda tercatat: <b id="ce-dmg-count">0</b></div>';
  html += '<ul id="ce-dmg-list" class="mt-1 space-y-1"></ul>';
  html += '</div>';
  html += '</div>';

  return html;
}

function renderDamageCanvas(view: string): string {
  const size = VIEW_DIMENSIONS[view] ?? { w: 480, h: 320 };
  return '<div class="text-center">' +
    '<div class="flex h-40 items-center justify-center rounded-lg border border-surface-200 bg-white p-1.5">' +
    '<canvas id="ce-cv-' + view + '" width="' + size.w + '" height="' + size.h + '" data-view="' + view + '"' +
    ' class="block h-auto w-auto max-h-full max-w-full cursor-crosshair rounded"></canvas>' +
    '</div>' +
    '<div class="mt-1 text-[11px] font-semibold tracking-wide text-surface-600">' + view + '</div>' +
    '</div>';
}

/** Tampilkan penanda "perubahan belum disimpan" di tab Edit. */
function updateEditDirtyIndicator(): void {
  const el = document.getElementById('ce-dirty');
  if (!el) return;
  el.classList.toggle('hidden', !editDirty);
}

/**
 * Salin penanda dari editor ke dokumen live supaya preview dan cetak
 * memakai perubahan yang belum disimpan (mis. penanda yang baru dihapus).
 */
function syncDamagePreview(): void {
  if (!activeEditDoc) return;
  activeEditDoc = { ...activeEditDoc, damages: editDamages.map((m) => ({ ...m })) };
  editDirty = true;
  updateEditDirtyIndicator();
  refreshEditPreview?.();
}

function paintEditDamages(): void {
  editCanvasBindings.forEach((binding) => binding.paint());
}

function renderEditDamageHint(): void {
  const hint = document.getElementById('ce-dmg-hint');
  if (!hint) return;

  if (editSelected !== null) {
    const mark = editDamages[editSelected];
    hint.textContent = mark
      ? `Penanda ${mark.view} dipilih — klik gambar untuk memindahkan.`
      : 'Klik gambar untuk memilih lokasi.';
    hint.className = 'text-[11px] font-semibold text-primary-700';
    return;
  }

  if (editPending) {
    hint.textContent = `Lokasi terpilih: ${editPending.view} (${editPending.x}%, ${editPending.y}%)`;
    hint.className = 'text-[11px] font-semibold text-primary-700';
    return;
  }

  hint.textContent = 'Klik gambar untuk memilih lokasi.';
  hint.className = 'text-[11px] text-surface-400';
}

function renderEditDamages(): void {
  const count = document.getElementById('ce-dmg-count');
  if (count) count.textContent = String(editDamages.length);

  const list = document.getElementById('ce-dmg-list');
  if (!list) return;
  if (!editDamages.length) {
    list.innerHTML = '<li class="text-[11px] text-surface-400">Belum ada penanda.</li>';
    return;
  }

  list.innerHTML = editDamages
    .map((mark, index) => {
      const active = editSelected === index;
      const rowClass = active
        ? 'border-primary-500 bg-primary-50'
        : 'border-surface-200 bg-surface-50';
      return '<li class="rounded-lg border ' + rowClass + ' px-3 py-1.5 text-xs">' +
        '<div class="flex items-center justify-between gap-2">' +
        '<button type="button" class="flex-1 text-left" data-ce-pick="' + index + '">' +
        esc(mark.view) + ' (' + esc(mark.x) + '%, ' + esc(mark.y) + '%)' +
        '</button>' +
        '<button type="button" class="btn btn-danger" data-ce-del="' + index + '">Hapus</button>' +
        '</div>' +
        '<input type="text" class="field mt-1 w-full px-2 py-1 text-[11px]" data-ce-note="' + index + '"' +
        ' placeholder="Catatan kerusakan" value="' + esc(mark.catatan ?? '') + '">' +
        '</li>';
    })
    .join('');
}

function selectEditDamage(index: number): void {
  if (editSelected === index) {
    editSelected = null;
    editPending = null;
  } else {
    const mark = editDamages[index];
    if (!mark) return;
    editSelected = index;
    editPending = { view: mark.view, x: mark.x, y: mark.y };
  }
  renderEditDamages();
  renderEditDamageHint();
  paintEditDamages();
}

function deleteEditDamage(index: number): void {
  if (index < 0 || index >= editDamages.length) return;
  editDamages.splice(index, 1);

  if (editSelected === index) {
    editSelected = null;
    editPending = null;
  } else if (editSelected !== null && editSelected > index) {
    editSelected -= 1;
  }

  renderEditDamages();
  renderEditDamageHint();
  paintEditDamages();
  syncDamagePreview();
}

function setupEditDamageEditor(): void {
  editCanvasBindings.forEach((binding) => binding.destroy());
  editCanvasBindings = [];

  for (const view of DAMAGE_VIEWS) {
    const canvas = document.getElementById('ce-cv-' + view) as HTMLCanvasElement | null;
    if (!canvas) continue;
    editCanvasBindings.push(
      bindDamageCanvas(canvas, view, () => ({ marks: editDamages, pending: editPending }), (mark) => {
        if (editSelected !== null) {
          const current = editDamages[editSelected];
          if (current) {
            editDamages[editSelected] = { ...current, view: mark.view, x: mark.x, y: mark.y };
          }
          editSelected = null;
          editPending = null;
          syncDamagePreview();
        } else {
          editPending = { ...mark };
        }
        renderEditDamages();
        renderEditDamageHint();
        paintEditDamages();
      }),
    );
  }

  const list = document.getElementById('ce-dmg-list');
  if (list) {
    list.onclick = (event) => {
      const target = event.target as HTMLElement | null;
      const remove = target?.closest<HTMLElement>('[data-ce-del]');
      if (remove) {
        deleteEditDamage(Number(remove.dataset.ceDel));
        return;
      }
      const pick = target?.closest<HTMLElement>('[data-ce-pick]');
      if (pick) selectEditDamage(Number(pick.dataset.cePick));
    };
    list.oninput = (event) => {
      const target = event.target as HTMLElement | null;
      const note = target?.closest<HTMLInputElement>('[data-ce-note]');
      if (!note) return;
      const mark = editDamages[Number(note.dataset.ceNote)];
      if (mark) {
        mark.catatan = note.value;
        editDirty = true;
        updateEditDirtyIndicator();
      }
    };
    list.onchange = (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-ce-note]')) syncDamagePreview();
    };
  }

  document.getElementById('ce-catat-damage')?.addEventListener('click', () => {
    if (editSelected !== null) {
      toast('Klik gambar untuk memindahkan penanda yang dipilih, atau klik penanda lagi untuk batal.', 'error');
      return;
    }
    if (!editPending) {
      toast('Klik dulu lokasi kerusakan di gambar kendaraan.', 'error');
      return;
    }
    const note = document.getElementById('ce-dmg-catatan') as HTMLInputElement | null;
    editDamages.push({ ...editPending, catatan: note?.value.trim() ?? '' });
    editPending = null;
    editSelected = null;
    if (note) note.value = '';
    renderEditDamages();
    renderEditDamageHint();
    paintEditDamages();
    syncDamagePreview();
  });

  preloadDamageImages();
  renderEditDamages();
  renderEditDamageHint();
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

  const damages = editDamages.map((mark) => ({
    view: mark.view,
    x: mark.x,
    y: mark.y,
    catatan: mark.catatan ?? '',
  }));

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
