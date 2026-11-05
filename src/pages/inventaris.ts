/**
 * pages/inventaris.ts — Peminjaman Barang.
 *
 * Kolom barang bernomor (BARANG1, QTY1, KONDISI KEMBALI1, ...) datang dari
 * server sebagai array `items`, lengkap dengan nomor kolomnya di `n`.
 */

import { api } from '../api';
import { INVENTARIS_FIELDS, KONDISI_OPTIONS, type InventarisItem } from '../schema';
import { store } from '../store';
import {
  $,
  actionBtn,
  actionCell,
  cardActions,
  drawer,
  emptyCard,
  emptyRow,
  errorText,
  esc,
  field$,
  formField,
  isoToSlash,
  loadingRow,
  MSG,
  orDash,
  print,
  readForm,
  must,
  report,
  signatureHtml,
  slashToIso,
  type Signatures,
  toast,
  todayISO,
} from '../ui';

/** Status turunan: masih dipinjam tapi sudah lewat tanggal kembali. */
export function statusOf(item: InventarisItem): 'Dipinjam' | 'Overdue' | 'Selesai' {
  if (item.status === 'Selesai') return 'Selesai';
  const iso = slashToIso(item.tglKembali);
  return iso && iso < todayISO() ? 'Overdue' : 'Dipinjam';
}

const BADGE: Record<'Dipinjam' | 'Overdue' | 'Selesai', string> = {
  Dipinjam: 'badge-dipinjam',
  Overdue: 'badge-overdue',
  Selesai: 'badge-approved',
};

export function badge(item: InventarisItem): string {
  const status = statusOf(item);
  return `<span class="badge ${BADGE[status]}">${esc(status)}</span>`;
}

/* ---------- Daftar ---------- */

function visible(): InventarisItem[] {
  const q = (field$('inv-q')?.value ?? '').trim().toLowerCase();
  const status = field$('inv-status')?.value ?? '';

  return store.inventaris.filter((item) => {
    const derived = statusOf(item);
    if (status && derived !== status) return false;
    if (!q) return true;
    const barang = item.items.map((i) => i.barang).join(' ');
    return [item.noDok, item.nama, item.kontak, item.keperluan, barang]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}

function lines(items: InventarisItem['items']): string {
  if (!items.length) return '<span class="text-surface-400">-</span>';
  return items
    .map((line) => {
      const kembali =
        line.kondisiKembali && line.kondisiKembali !== '-'
          ? `<span class="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Kembali: ${esc(line.kondisiKembali)}</span>`
          : '';
      const ambil =
        line.kondisiAmbil && line.kondisiAmbil !== '-'
          ? `<span class="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Ambil: ${esc(line.kondisiAmbil)}</span>`
          : '';
      return `<div class="border-b border-surface-100 py-1 last:border-0">
        <div class="font-medium break-words">${esc(line.barang)}
          <span class="text-xs text-surface-400">×${esc(line.qty)}</span></div>
        <div class="mt-0.5 flex flex-wrap items-center gap-1">${ambil}${kembali}</div>
      </div>`;
    })
    .join('');
}

export function renderList(): void {
  const rows = visible();
  const tbody = $('inv-tbody');
  const cards = $('inv-cards');
  if (!tbody || !cards) return;

  if (!rows.length) {
    tbody.innerHTML = emptyRow(10, 'Tidak ada peminjaman yang cocok.');
    cards.innerHTML = emptyCard('Tidak ada peminjaman yang cocok.');
    must('inv-count').textContent = `${rows.length} dari ${store.inventaris.length} peminjaman`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (item) => `<tr data-action="detail" data-id="${item.rowId}">
      <td class="font-bold whitespace-nowrap">${esc(item.noDok)}</td>
      <td class="font-bold whitespace-nowrap">${esc(orDash(item.nama))}</td>
      <td class="whitespace-nowrap">${esc(orDash(item.kontak))}</td>
      <td class="min-w-56">${lines(item.items)}</td>
      <td class="whitespace-nowrap">${esc(orDash(item.tglPinjam))}</td>
      <td class="whitespace-nowrap">${esc(orDash(item.tglKembali))}</td>
      <td class="min-w-40">${esc(orDash(item.keperluan))}</td>
      <td class="whitespace-nowrap">${badge(item)}</td>
      <td class="whitespace-nowrap">${esc(orDash(item.tglKembaliAktual))}</td>
      ${actionCell(
        actionBtn('detail', { id: item.rowId }),
        actionBtn('print', { id: item.rowId }),
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
          <div class="text-xs font-bold text-primary-700 break-words">${esc(item.noDok)}</div>
          <div class="text-[11px] text-surface-400">Pinjam: ${esc(item.tglPinjam)} · Kembali: ${esc(item.tglKembali)}</div>
        </div>
        ${badge(item)}
      </div>
      <div class="mt-2">
        <div class="font-bold break-words">${esc(item.nama)}</div>
        <div class="text-xs text-surface-500">${esc(item.kontak)}</div>
      </div>
      <div class="mt-1 text-sm">${lines(item.items)}</div>
      <div class="mt-1 text-xs text-surface-500 break-words">${esc(item.keperluan)}</div>
      ${cardActions(
        actionBtn('detail', { id: item.rowId }),
        actionBtn('print', { id: item.rowId }),
        actionBtn('delete', { id: item.rowId }),
      )}
    </div>`,
    )
    .join('');

  must('inv-count').textContent = `${rows.length} dari ${store.inventaris.length} peminjaman`;
}

export async function refresh(): Promise<void> {
  const tbody = $('inv-tbody');
  const cards = $('inv-cards');
  if (tbody) tbody.innerHTML = loadingRow(10);
  if (cards) cards.innerHTML = '';
  try {
    store.inventaris = await api.listInventaris();
  } catch (error) {
    console.error(error);
    showError(error);
  }
  renderList();
}

export async function remove(rowId: number): Promise<void> {
  const item = store.inventaris.find((i) => i.rowId === rowId);
  if (!item) {
    toast('Data peminjaman tidak ditemukan.', 'error');
    return;
  }
  if (!confirm(`Hapus peminjaman ${item.noDok} (${item.nama})? Baris di spreadsheet akan dihapus.`)) return;
  try {
    await api.deleteInventaris(rowId);
    toast('Dihapus');
    await refresh();
  } catch (error) {
    report(error);
  }
}

function showError(error: unknown): void {
  const el = $('inv-error');
  if (!el) return;
  el.textContent = `Data peminjaman tidak dapat dimuat: ${errorText(error)}`;
  el.classList.remove('hidden');
}

export function clearError(): void {
  $('inv-error')?.classList.add('hidden');
}

/* ---------- Drawer pengembalian ---------- */

function kondisiOptions(current: string): string {
  const now = current && current !== '-' ? current : 'Baik';
  const options: string[] = [...KONDISI_OPTIONS];
  if (!options.includes(now)) options.push(now);
  return options
    .map(
      (o) => `<option value="${esc(o)}"${o === now ? ' selected' : ''}>${esc(o)}</option>`,
    )
    .join('');
}

function itemRows(item: InventarisItem): string {
  if (!item.items.length) {
    return `<div class="sm:col-span-2 text-sm text-surface-400">Tidak ada barang tercatat.</div>`;
  }
  return `<div class="border-t border-surface-100 pt-4 sm:col-span-2">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h4 class="text-xs font-bold tracking-wide text-surface-700 uppercase">Kondisi Pengembalian Barang</h4>
      ${actionBtn('all-good')}
    </div>
    ${item.items
      .map(
        (line) => `<div class="flex items-center justify-between gap-3 border-b border-surface-100 py-3 last:border-0">
      <div class="min-w-0 flex-1">
        <div class="text-sm font-bold break-words">${esc(line.barang)}
          <span class="font-normal text-surface-400">×${esc(line.qty)}</span></div>
        <div class="mt-0.5 text-xs font-medium text-blue-700">Kondisi Ambil:
          <span class="font-bold">${esc(line.kondisiAmbil)}</span></div>
      </div>
      <div class="w-36">
        <label class="mb-1 block text-[10px] font-bold tracking-wide text-surface-500 uppercase" for="k-${esc(line.n)}">Kondisi Kembali</label>
        <select id="k-${esc(line.n)}" class="field py-1.5 text-xs">${kondisiOptions(line.kondisiKembali)}</select>
      </div>
    </div>`,
      )
      .join('')}
  </div>`;
}

export function openDrawer(rowId: number): void {
  const item = store.inventaris.find((i) => i.rowId === rowId);
  if (!item) return;

  const fields = INVENTARIS_FIELDS.map((f) =>
    f.key === 'tglKembaliAktual'
      ? formField(f, slashToIso(item.tglKembaliAktual) || todayISO())
      : formField(f, item[f.key], f.key === 'status' ? 'data-action="status"' : ''),
  );

  drawer.open({
    title: 'Detail & Pengembalian Barang',
    body: `
      <div class="grid grid-cols-2 gap-4">
        ${field('Nama Peminjam', item.nama)}
        ${field('Kontak', item.kontak)}
        ${field('Tgl Pinjam', item.tglPinjam)}
        ${field('Rencana Kembali', item.tglKembali)}
      </div>
      ${field('Keperluan', item.keperluan)}

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        ${itemRows(item)}
        ${fields.join('')}
      </div>`,
    footer: `
      ${actionBtn('print', { id: rowId, extra: 'px-4 py-2' })}
      ${actionBtn('save', { id: rowId })}`,
  });
}

function field(label: string, value: string): string {
  return `<div class="min-w-0">
    <div class="text-[11px] font-bold tracking-wide text-surface-400 uppercase">${esc(label)}</div>
    <div class="text-sm font-semibold break-words">${esc(orDash(value))}</div>
  </div>`;
}

export function setAllGood(): void {
  for (const el of document.querySelectorAll<HTMLSelectElement>('select[id^="k-"]')) {
    el.value = 'Baik';
  }
}

export function onStatusChange(select: HTMLSelectElement): void {
  const tgl = field$('f-tglKembaliAktual');
  if (select.value === 'Selesai' && tgl && 'value' in tgl && !tgl.value) {
    tgl.value = todayISO();
  }
}

export async function save(rowId: number): Promise<void> {
  const item = store.inventaris.find((i) => i.rowId === rowId);
  if (!item) return;

  const patch = readForm<Record<string, string>>(INVENTARIS_FIELDS);
  const lineInputs = item.items.map((line) => {
    const el = $<HTMLSelectElement>(`k-${line.n}`);
    return { n: line.n, kondisiKembali: el?.value ?? line.kondisiKembali };
  });

  drawer.close();
  toast(MSG.saving);
  try {
    await api.saveInventaris({
      rowId,
      sig: item.sig,
      noDok: patch.noDok ?? '',
      status: patch.status || 'Selesai',
      tglKembaliAktual: patch.tglKembaliAktual || isoToSlash(todayISO()),
      catatan: patch.catatan ?? '',
      lines: lineInputs,
    });
    toast(MSG.saved);
    clearError();
    await refresh();
  } catch (error) {
    report(error);
  }
}

/* ---------- Cetak ---------- */

export function printRow(rowId: number, sigs?: Signatures): void {
  const item = store.inventaris.find((i) => i.rowId === rowId);
  if (!item) {
    toast('Data peminjaman tidak ditemukan.', 'error');
    return;
  }

  print.show('inventaris');
  // Semua kolom tanda tangan diisi dari popup: Peminjam wajib,
  // Mengetahui/Menyetujui boleh kosong (ditandatangani manual).
  print.setHtml('pi-ttd-peminjam', signatureHtml(sigs?.peminjam));
  print.setHtml('pi-ttd-mengetahui', signatureHtml(sigs?.mengetahui));
  print.setHtml('pi-ttd-menyetujui', signatureHtml(sigs?.menyetujui));
  print.set('pi-nama', item.nama);
  print.set('pi-kontak', item.kontak);
  print.set('pi-tglpinjam', item.tglPinjam);
  print.set('pi-keperluan', item.keperluan);
  print.set('pi-tglkembali', item.tglKembali);

  const body = document.getElementById('pi-rows');
  if (body) {
    body.innerHTML = item.items.length
      ? item.items
          .map(
            (line, index) => `<tr>
        <td class="border border-black px-1 py-0.5 text-center">${index + 1}</td>
        <td class="border border-black px-1 py-0.5 font-bold">${esc(line.barang)}</td>
        <td class="border border-black px-1 py-0.5 text-center">${esc(line.qty)}</td>
        <td class="border border-black px-1 py-0.5 text-center">${esc(line.kondisiAmbil)}</td>
        <td class="border border-black px-1 py-0.5 text-center">${esc(line.kondisiKembali)}</td>
      </tr>`,
          )
          .join('')
      : '<tr><td colspan="5" class="border border-black px-1 py-1 text-center">Tidak ada barang.</td></tr>';
  }

  print.run();
}