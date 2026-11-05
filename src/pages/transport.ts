/**
 * pages/transport.ts — Daftar Permintaan Transportasi.
 *
 * Kolom tabel dan field drawer keduanya dibaca dari TRANSPORT_FIELDS,
 * jadi menambah kolom cukup di schema.ts.
 */

import { api } from '../api';
import {
  TRANSPORT_COLUMNS,
  TRANSPORT_FIELDS,
  type EditableTransportKey,
  type TransportItem,
  type TransportKey,
} from '../schema';
import { store } from '../store';
import {
  $,
  actionBtn,
  actionCell,
  cardActions,
  debounce,
  drawer,
  emptyCard,
  emptyRow,
  errorText,
  esc,
  field$,
  formField,
  loadingRow,
  MSG,
  tableHead,
  orDash,
  print,
  readForm,
  must,
  report,
  signatureHtml,
  type Signatures,
  statusBadge,
  toast,
  validateRequired,
} from '../ui';

const COL_LABEL: Record<(typeof TRANSPORT_COLUMNS)[number], string> = {
  noSurat: 'No.',
  nama: 'Nama',
  dept: 'Divisi',
  ijn: 'IJN',
  tujuan: 'Tujuan',
  tglJam: 'Hari / Tanggal / Jam',
  tglPengajuan: 'Tanggal Pengajuan',
  nopol: 'Plat No.',
  keperluan: 'Keperluan',
  status: 'Status',
};

/* ---------- Daftar ---------- */

function visible(): TransportItem[] {
  const q = (field$('q')?.value ?? '').trim().toLowerCase();
  const status = field$('filter-status')?.value ?? '';
  const dept = field$('filter-dept')?.value ?? '';

  return store.transport.filter((item) => {
    if (status && item.status !== status) return false;
    if (dept && item.dept !== dept) return false;
    if (!q) return true;
    return [item.noSurat, item.nama, item.dept, item.tujuan, item.nopol, item.keperluan, item.driver]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}

export function renderList(): void {
  const rows = visible();
  const tbody = $('tbody');
  const cards = $('cards');
  if (!tbody || !cards) return;

  if (!rows.length) {
    tbody.innerHTML = emptyRow(TRANSPORT_COLUMNS.length + 1, 'Tidak ada permintaan yang cocok.');
    cards.innerHTML = emptyCard('Tidak ada permintaan yang cocok.');
    must('count').textContent = `${rows.length} dari ${store.transport.length} permintaan`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (item) => `<tr data-action="detail" data-id="${item.rowId}">
      ${TRANSPORT_COLUMNS.map((key) => cell(item, key)).join('')}
      ${actionCell(
        actionBtn('detail', { id: item.rowId }),
        actionBtn('print', { id: item.rowId }),
        actionBtn('email', { id: item.rowId }),
        actionBtn('delete', { id: item.rowId }),
      )}
    </tr>`,
    )
    .join('');

  cards.innerHTML = rows
    .map(
      (item) => `<div class="card p-4" data-action="detail" data-id="${item.rowId}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="text-xs font-bold text-primary-700 break-words">${esc(item.noSurat)}</div>
          <div class="text-[11px] text-surface-400">${esc(item.tglPengajuan)}</div>
        </div>
        ${statusBadge(item.status)}
      </div>
      <div class="mt-2">
        <div class="font-bold break-words">${esc(item.nama)}</div>
        <div class="text-xs text-surface-500">${esc(item.dept)} · ${esc(item.ijn)}</div>
      </div>
      <div class="mt-1 text-sm">
        <div class="font-semibold break-words">${esc(item.tujuan)}</div>
        <div class="text-xs text-surface-500 break-words">${esc(item.keperluan)}</div>
      </div>
      <div class="mt-2 text-xs text-surface-500">
        ${esc(item.tglJam)} ·
        <span class="font-mono uppercase font-semibold">${esc(item.nopol)}</span>
      </div>
      ${cardActions(
        actionBtn('detail', { id: item.rowId }),
        actionBtn('print', { id: item.rowId }),
        actionBtn('email', { id: item.rowId }),
        actionBtn('delete', { id: item.rowId }),
      )}
    </div>`,
    )
    .join('');

  must('count').textContent = `${rows.length} dari ${store.transport.length} permintaan`;
}

function cell(item: TransportItem, key: TransportKey): string {
  const base = 'px-4 py-3 text-sm text-surface-700';
  if (key === 'status') {
    return `<td class="${base} whitespace-nowrap">${statusBadge(item.status)}</td>`;
  }
  if (key === 'nopol') {
    return `<td class="${base} whitespace-nowrap">
      <span class="rounded-md border border-surface-200 bg-surface-100 px-2 py-0.5 font-mono text-xs font-bold uppercase">${esc(item.nopol)}</span>
    </td>`;
  }
  if (key === 'noSurat' || key === 'nama') {
    return `<td class="px-4 py-3 text-sm font-bold whitespace-nowrap">${esc(orDash(item[key]))}</td>`;
  }
  const wide = key === 'tujuan' || key === 'keperluan' ? ' min-w-44' : ' whitespace-nowrap';
  return `<td class="${base}${wide}">${esc(orDash(item[key]))}</td>`;
}

export function renderHeader(): void {
  const thead = $('thead');
  if (!thead) return;
  thead.innerHTML = tableHead([
    ...TRANSPORT_COLUMNS.map((key) => ({ label: COL_LABEL[key] })),
    { label: 'Aksi', className: 'text-right' },
  ]);
}

export function renderFilters(): void {
  const dept = $<HTMLSelectElement>('filter-dept');
  if (dept && dept.options.length === 0) {
    dept.innerHTML =
      '<option value="">Semua Divisi</option>' +
      store.departments.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
  }
}

export async function refresh(): Promise<void> {
  const tbody = $('tbody');
  const cards = $('cards');
  if (tbody) tbody.innerHTML = loadingRow(TRANSPORT_COLUMNS.length + 1);
  if (cards) cards.innerHTML = '';
  try {
    const page = await api.listRequests();
    store.transport = page.items;
    renderFilters();
    renderList();
  } catch (error) {
    report(error);
    const el = $('tbody');
    if (el) el.innerHTML = emptyRow(TRANSPORT_COLUMNS.length + 1, errorText(error));
    if (cards) cards.innerHTML = emptyCard(errorText(error));
  }
}

/* ---------- Drawer ---------- */

export function openDrawer(rowId: number): void {
  const item = store.transport.find((i) => i.rowId === rowId);
  if (!item) return;

  const missingStatus = store.missingFields.includes('status');

  drawer.open({
    title: 'Permintaan Transportasi',
    body: `
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        ${TRANSPORT_FIELDS.map((f) => formField(f, isoFor(f.key, item))).join('')}
      </div>
      ${
        missingStatus
          ? `<p class="text-[11px] text-amber-700">Spreadsheet belum punya kolom STATUS, perubahan status tidak akan tersimpan.</p>`
          : ''
      }`,
    footer: `
      <div class="flex gap-2">
        ${actionBtn('print', { id: rowId, extra: 'px-4 py-2', attrs: 'data-from="drawer"' })}
        ${actionBtn('email', { id: rowId, extra: 'px-4 py-2' })}
      </div>
      ${actionBtn('save', { id: rowId })}`,
  });
}

/** Isi awal tiap field drawer. Jam diambil dari teks HARI/TANGGAL/JAM. */
function isoFor(key: EditableTransportKey, item: TransportItem): string {
  return key === 'jam' ? jamFor(item.tglJam) : item[key];
}

/** Ambil jam 'HH:MM' dari teks HARI/TANGGAL/JAM kalau ada. */
function jamFor(value: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(value);
  return m ? `${String(Number(m[1])).padStart(2, '0')}:${m[2]}` : '';
}

export async function save(rowId: number): Promise<void> {
  const item = store.transport.find((i) => i.rowId === rowId);
  if (!item) return;

  if (!validateRequired([
    { id: 'f-nama', label: 'Nama' },
    { id: 'f-tujuan', label: 'Tujuan' },
  ])) return;

  const patch = readForm<Record<string, string>>(TRANSPORT_FIELDS);

  drawer.close();
  toast(MSG.saving);
  try {
    await api.updateRequest({ rowId, sig: item.sig, ...patch });
    toast(MSG.saved);
    await refresh();
  } catch (error) {
    report(error);
  }
}

/* ---------- Cetak ---------- */

export function printRow(rowId: number, fromDrawer = false, sigs?: Signatures): void {
  const item = store.transport.find((i) => i.rowId === rowId);
  if (!item) {
    toast('Data permintaan tidak ditemukan.', 'error');
    return;
  }

  // Cetak dari dalam drawer memakai isian yang belum disimpan.
  const patch = readForm<Record<string, string>>(TRANSPORT_FIELDS);
  const source: TransportItem = fromDrawer ? { ...item, ...patch } : item;

  print.show('transport');
  print.set('p-nosurat', source.noSurat);
  print.set('p-nama', source.nama);
  print.set('p-dept', source.dept);
  print.set('p-ijn', source.ijn);
  print.set('p-tujuan', source.tujuan);
  print.set('p-tgljam', orDash(source.tglJam));
  print.set('p-nopol', source.nopol);
  print.set('p-keperluan', source.keperluan);
  print.set('p-tglcetak', todayLong());
  print.setHtml('p-ttd-approve', signatureHtml(sigs?.disetujui));
  print.setHtml('p-ttd-pemohon', signatureHtml(sigs?.pemohon));
  print.run();
}

/* ---------- Email ---------- */

export async function email(rowIds: number[], button?: HTMLButtonElement): Promise<void> {
  if (!rowIds.length) {
    toast('Pilih minimal satu permintaan.', 'error');
    return;
  }
  if (!confirm(`Kirim ${rowIds.length} permintaan lewat email (dengan lampiran PDF)?`)) return;

  const label = button?.innerHTML ?? '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Mengirim...';
  }
  try {
    await api.sendEmail(rowIds);
    toast('Email terkirim');
  } catch (error) {
    report(error);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = label;
    }
  }
}

export async function remove(rowId: number): Promise<void> {
  const item = store.transport.find((i) => i.rowId === rowId);
  if (!item) return;
  if (!confirm(`Hapus permintaan ${item.noSurat} (${item.nama})?\nBaris di spreadsheet akan dihapus.`)) {
    return;
  }
  try {
    await api.deleteRequest(rowId);
    toast('Dihapus');
    await refresh();
  } catch (error) {
    report(error);
  }
}

/* ---------- Form baru ---------- */

export function openCreate(): void {
  drawer.open({
    title: 'Permintaan Baru',
    body: `<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      ${TRANSPORT_FIELDS.map((f) => formField(f, f.key === 'status' ? 'Pending' : '')).join('')}
    </div>`,
    footer: actionBtn('create'),
  });
}

export async function create(): Promise<void> {
  const checks = TRANSPORT_FIELDS.filter((field) => field.required).map((field) => ({
    id: `f-${field.key}`,
    label: field.label,
  }));
  if (!validateRequired(checks)) return;

  const form = readForm<Record<string, string>>(TRANSPORT_FIELDS);
  drawer.close();
  try {
    await api.createRequest(form);
    toast('Permintaan tersimpan.');
    await refresh();
  } catch (error) {
    report(error);
  }
}

/* ---------- Export CSV ---------- */

/**
 * Ekspor daftar yang sedang tampil (setelah filter) sebagai CSV.
 * Dibuat di browser, jadi tidak menambah beban server dan tidak terbatas
 * jumlah baris. BOM UTF-8 supaya Excel di Windowsopened dengan benar.
 */
export function exportCsv(): void {
  const rows = visible();
  if (!rows.length) {
    toast('Tidak ada data untuk diekspor.', 'error');
    return;
  }

  const headers = ['No. Surat', ...TRANSPORT_COLUMNS.filter((k) => k !== 'noSurat').map((k) => COL_LABEL[k]),
    'Pemohon', 'Disetujui', 'Driver Name', 'Timestamp'];

  const cells = rows.map((item) => [
    item.noSurat, ...TRANSPORT_COLUMNS.filter((k) => k !== 'noSurat').map((k) => item[k]),
    item.pemohon, item.disetujui, item.driver, item.timestamp,
  ]);

  const csv = [headers, ...cells]
    .map((line) => line.map(csvCell).join(';'))
    .join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Transport_HBPA_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  toast(`${rows.length} baris diekspor.`);
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/* ---------- Bantuan ---------- */

const onSearch = debounce(() => renderList(), 250);

export function bindSearch(): void {
  $('q')?.addEventListener('input', onSearch);
  $('filter-status')?.addEventListener('change', renderList);
  $('filter-dept')?.addEventListener('change', renderList);
}

function todayLong(): string {
  return new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

