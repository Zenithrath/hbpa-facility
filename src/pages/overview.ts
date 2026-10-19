/**
 * pages/overview.ts — kartu statistik + kirim email untuk beberapa permintaan.
 */

import { api } from '../api';
import { store } from '../store';
import { esc, icon, loadingRow, statusBadge, toast } from '../ui';
import { message, report } from './transport';

const selected = new Set<number>();

interface Card {
  id: string;
  label: string;
  sub: string;
  icon: string;
  accent: string;
  value: number;
}

export function renderStats(): void {
  const cards: Card[] = [
    {
      id: 's-total',
      label: 'Total',
      sub: 'Total Permintaan',
      icon: 'file',
      accent: 'bg-primary-50 text-primary-600',
      value: store.stats.total,
    },
    {
      id: 's-pending',
      label: 'Pending',
      sub: 'Menunggu Persetujuan',
      icon: 'clock',
      accent: 'bg-amber-50 text-amber-600',
      value: store.stats.pending,
    },
    {
      id: 's-approved',
      label: 'Disetujui',
      sub: 'Sudah Disetujui',
      icon: 'check',
      accent: 'bg-emerald-50 text-emerald-600',
      value: store.stats.approved,
    },
    {
      id: 's-rejected',
      label: 'Ditolak',
      sub: 'Ditolak',
      icon: 'x',
      accent: 'bg-red-50 text-red-600',
      value: store.stats.rejected,
    },
    {
      id: 's-completed',
      label: 'Selesai',
      sub: 'Sudah Dikerjakan',
      icon: 'check',
      accent: 'bg-blue-50 text-blue-600',
      value: store.stats.completed,
    },
    {
      id: 's-month',
      label: 'Bulan Ini',
      sub: 'Pengajuan Bulan Ini',
      icon: 'clock',
      accent: 'bg-indigo-50 text-indigo-600',
      value: store.stats.month,
    },
  ];

  const box = document.getElementById('stats');
  if (!box) return;
  box.innerHTML = cards
    .map(
      (c) => `<div class="card flex flex-col justify-between p-4 sm:p-5">
      <div class="mb-2 flex items-center justify-between">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl ${c.accent}">${icon(c.icon, 'w-5 h-5')}</div>
        <span class="text-[11px] font-bold tracking-wider text-surface-400 uppercase">${esc(c.label)}</span>
      </div>
      <div>
        <p id="${c.id}" class="text-2xl font-black sm:text-3xl">${c.value}</p>
        <p class="mt-0.5 text-xs font-medium text-surface-400">${esc(c.sub)}</p>
      </div>
    </div>`,
    )
    .join('');
}

export function renderList(): void {
  const box = document.getElementById('email-list');
  if (!box) return;

  if (!store.transport.length) {
    box.innerHTML = `<div class="p-6 text-center text-sm text-surface-400">Belum ada permintaan.</div>`;
    updateCount();
    return;
  }

  const searchable = (item: (typeof store.transport)[number]) =>
    [item.noSurat, item.nama, item.dept, item.tujuan, item.nopol, item.keperluan]
      .join(' ')
      .toLowerCase();

  box.innerHTML = store.transport
    .map(
      (item) => `<label data-row="${esc(searchable(item))}"
      class="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface-50">
      <input type="checkbox" class="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
        data-action="pick" data-id="${item.rowId}" ${selected.has(item.rowId) ? 'checked' : ''}>
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <div class="text-xs font-bold text-primary-700 break-words">${esc(item.noSurat)}</div>
          ${statusBadge(item.status)}
        </div>
        <div class="text-sm font-semibold break-words">${esc(item.nama)}
          <span class="text-xs font-normal text-surface-500">· ${esc(item.dept)}</span></div>
        <div class="text-xs text-surface-500 break-words">${esc(item.tujuan)} · ${esc(item.tglJam)}</div>
      </div>
    </label>`,
    )
    .join('');

  updateCount();
}

export function updateCount(): void {
  const el = document.getElementById('email-count');
  if (el) el.textContent = `${selected.size} dipilih`;
}

export function toggle(rowId: number, on: boolean): void {
  if (on) selected.add(rowId);
  else selected.delete(rowId);
  updateCount();
}

export function selectAll(on: boolean): void {
  selected.clear();
  if (on) for (const item of store.transport) selected.add(item.rowId);
  renderList();
}

export async function sendSelected(button?: HTMLButtonElement): Promise<void> {
  const rows = [...selected];
  if (!rows.length) {
    toast('Pilih minimal satu permintaan.', 'error');
    return;
  }
  if (rows.length > 10) {
    toast('Maksimal 10 permintaan sekali kirim.', 'error');
    return;
  }
  if (!confirm(`Kirim ${rows.length} permintaan lewat email (dengan lampiran PDF)?`)) return;

  const label = button?.innerHTML ?? '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Mengirim...';
  }
  try {
    await api.sendEmail(rows);
    toast('Email terkirim');
    selected.clear();
    renderList();
  } catch (error) {
    report(error);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = label;
    }
  }
}

export async function refresh(): Promise<void> {
  const box = document.getElementById('email-list');
  if (box) box.innerHTML = loadingRow(1, 'Memuat data permintaan...');
  try {
    const page = await api.listRequests();
    store.transport = page.items;
    renderList();
  } catch (error) {
    console.error(error);
    const el = document.getElementById('email-list');
    if (el) el.innerHTML = `<div class="p-6 text-center text-sm text-red-600">${esc(message(error))}</div>`;
  }
}

export function isPicked(rowId: number): boolean {
  return selected.has(rowId);
}

export function clearSelection(): void {
  selected.clear();
  updateCount();
}