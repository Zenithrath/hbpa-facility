/** 
 * pages/checklist-list.ts — Halaman Daftar Checklist Kendaraan. 
 * Menampilkan tabel data checklist yang telah diinput. 
 */
import { store } from '../store';
import { api } from '../api';
import type { CkHeader } from '../schema';
import { renderChecklistPaper } from './checklist-paper';
import {
  checklistEditorHtml,
  mountChecklistEditor,
  type ChecklistEditorHandle,
} from './checklist-edit-sheet';
import { PAGE_SIZE, clampPage, slicePage, pagerHtml, bindPager, virtualize } from '../pagination';
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
let clPage = 1;

/** Dokumen yang sedang diedit, supaya preview/cetak ikut perubahan yang belum disimpan. */
let activeEditRowId: number | null = null;
let activeEditDoc: CkHeader | null = null;
let editDirty = false;
let editorHandle: ChecklistEditorHandle | null = null;
/** Tarik isi form edit ke dokumen live (dipakai sebelum preview/cetak). */
let syncEditorToLive: (() => void) | null = null;
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
  const filtered = store.checklist
    .filter((item: ClistItem) => {
      if (!q) return true;
      return [item.noDok, item.driver, item.kendaraan, item.keterangan]
        .join(' ')
        .toLowerCase()
        .includes(q);
    })
    .slice()
    .sort((a, b) => b.rowId - a.rowId);

  clPage = clampPage(clPage, filtered.length);
  const items = slicePage(filtered, clPage);

  // Virtualisasi: hanya render baris yang terlihat (+overscan), DOM tetap ringan.
  const vis = virtualize(items, (clPage - 1) * PAGE_SIZE);
  const visItems = vis.items;
  void vis.start;

  if (!filtered.length) {
    tbody.innerHTML = emptyRow(7, 'Tidak ada data checklist.');
    cards.innerHTML = emptyCard('Tidak ada data checklist.');
    must('cl-count').textContent = '0 dari 0 checklist';
    const pager = $('cl-pager');
    if (pager) pager.innerHTML = '';
    return;
  }

  tbody.innerHTML = visItems
    .map((item: ClistItem, i: number) => `
      <tr data-action="detail" data-id="${item.rowId}">
        <td class="text-center text-xs text-surface-500">${(clPage - 1) * PAGE_SIZE + i + 1}</td>
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

  cards.innerHTML = visItems
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

  must('cl-count').textContent = filtered.length + ' dari ' + store.checklist.length + ' checklist';
  const pager = $('cl-pager');
  if (pager) {
    pager.innerHTML = pagerHtml('cl-pager-inner', clPage, filtered.length);
    bindPager('cl-pager-inner', () => { clPage--; renderList(); }, () => { clPage++; renderList(); });
  }
}

export async function refresh(): Promise<void> {
  const tbody = $('cl-tbody');
  if (tbody) tbody.innerHTML = loadingRow(6);
  try {
    const [items, docs] = await Promise.all([api.listChecklist(), api.getCkDocuments()]);
    store.checklist = items || [];
    ckDocs = docs || [];
    clPage = 1;
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
      <div id="cl-pager" class="mt-2"></div>

      <div class="card hidden overflow-hidden md:block">
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              ${tableHead([
                { label: 'No.', className: 'w-12 text-center' },
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
    if (tbody) tbody.innerHTML = loadingRow(7);
    Promise.all([api.listChecklist(), api.getCkDocuments()])
      .then(([items, docs]) => {
        store.checklist = items || [];
        ckDocs = docs || [];
        renderList();
      })
      .catch((error) => report(error));
  },
  onSearchInput: (): void => { clPage = 1; renderList(); },
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

  editDirty = false;
  activeEditRowId = rowId;
  activeEditDoc = doc
    ? { ...doc, items: doc.items.map((it) => ({ ...it })), damages: (doc.damages ?? []).map((m) => ({ ...m })) }
    : null;

  const bodyEl = must('drawer-body');
  const prevOverflow = bodyEl.style.overflow;
  const originalClose = drawer.close;
  drawer.close = () => {
    editorHandle?.destroy();
    editorHandle = null;
    syncEditorToLive = null;
    activeEditRowId = null;
    activeEditDoc = null;
    editDirty = false;
    saveEditHandler = null;
    bodyEl.style.overflow = prevOverflow;
    originalClose();
    drawer.close = originalClose;
  };



  drawer.open({
    title: 'Detail Checklist Kendaraan',
    size: 'xl',
    body: `<div id="ck-edit">${checklistEditorHtml(doc, item)}</div>`,
    footer: `
      <div class="flex flex-wrap gap-2">
        ${actionBtn('print', { id: rowId, extra: 'px-4 py-2' })}
      </div>
      <div class="flex flex-wrap gap-2">
        ${actionBtn('save', { id: rowId, extra: 'px-4 py-2', attrs: 'id="ck-save-edit"' })}
      </div>
    `,
  });

  // Langsung edit (tanpa tab Preview).
  const editEl = must('ck-edit');
  const saveBtn = $<HTMLButtonElement>('ck-save-edit');
  bodyEl.style.overflow = 'auto';

  const updateDirty = (): void => {
    const el = document.getElementById('ce-dirty');
    el?.classList.toggle('hidden', !editDirty);
  };

  const handleEditorChange = (): void => {
    editDirty = true;
    updateDirty();
  };

  editorHandle = mountChecklistEditor(doc, item, handleEditorChange);
  editorHandle?.refit();

  // Tarik nilai form ke dokumen live supaya cetak ikut perubahan yang belum disimpan.
  syncEditorToLive = () => {
    if (!editorHandle) return;
    const body = editorHandle.collect();
    const base = activeEditDoc;
    activeEditDoc = {
      rowId: base?.rowId ?? rowId,
      id: body.id || base?.id || '',
      counter: body.counter,
      tipeMobil: body.tipeMobil,
      driver: body.driver,
      tanggal: body.tanggal,
      noPolisi: body.kendaraan,
      kilometer: body.kilometer,
      bbmMasuk: body.bbmMasuk,
      bbmKeluar: body.bbmKeluar,
      keterangan: body.keterangan,
      diperiksaOleh: body.diperiksaOleh,
      status: body.status ?? base?.status ?? '',
      createdBy: base?.createdBy ?? '',
      createdAt: base?.createdAt ?? '',
      linkPdf: base?.linkPdf ?? '',
      items: body.items,
      damages: body.damages,
      hasRusak: body.items.some((it) => it.status === 'Rusak'),
    };
  };

  // Simpan perubahan lalu kembali ke tab Preview (tombol data-action="save").
  saveEditHandler = async () => {
    if (!saveBtn || saveBtn.disabled || !editorHandle) return;
    setBusy(saveBtn, true);
    try {
      const body = editorHandle.collect();
      await api.updateCk(body);
      toast('Checklist diperbarui.');
      ckDocs = await api.getCkDocuments();
      const newDoc = ckDocs.find((x: CkHeader) => x.rowId === rowId);
      if (newDoc) {
        editorHandle?.destroy();
        editorHandle = null;
        editEl.innerHTML = checklistEditorHtml(newDoc, item);
        editorHandle = mountChecklistEditor(newDoc, item, handleEditorChange);
        editorHandle?.refit();
      }
      editDirty = false;
      updateDirty();
      syncEditorToLive?.();
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
  // Kalau drawer edit untuk baris ini masih terbuka, tarik dulu isi form
  // supaya perubahan yang belum disimpan ikut tercetak.
  if (activeEditRowId === rowId) syncEditorToLive?.();
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
