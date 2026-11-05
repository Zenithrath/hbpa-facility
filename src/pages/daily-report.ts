/**
 * pages/daily-report.ts — daftar Surat Tugas / Daily Report (FM-FCL-02.04).
 *
 * Input Daily Report berasal dari Google Form yang menulis ke tab
 * TAB_DAILYREPORT. Halaman ini hanya membaca daftar, menampilkan detail,
 * dan meminta PDF ke server saat tombol cetak diklik.
 */

import { api } from '../api';
import type { DrHeader } from '../schema';
import { store } from '../store';
import { PAGE_SIZE, clampPage, slicePage, pagerHtml, bindPager, virtualize } from '../pagination';
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
  loadingRow,
  MSG,
  must,
  orDash,
  print,
  report,
  setPageLoading,
  signatureHtml,
  type Signatures,
  toast,
  validateRequired,
} from '../ui';

/** PDF yang sudah dibuat selama halaman terbuka, supaya klik kedua instan. */
const PDF_CACHE = new Map<number, string>();

/* ---------- Bantuan tampilan ---------- */

function docLabel(item: DrHeader): string {
  return item.id || `Form #${item.rowId}`;
}


function plats(item: DrHeader): string {
  const list = [...new Set(item.rows.map((r) => r.nopol.trim()).filter(Boolean))];
  return list.length ? list.join(', ') : '-';
}

function uraianRingkas(item: DrHeader): string {
  const first = item.rows[0]?.uraian?.trim();
  if (!first) return '-';
  return item.rows.length > 1 ? `${first} (+${item.rows.length - 1} baris)` : first;
}



/* ---------- Daftar ---------- */

let drPage = 1;

function visible(): DrHeader[] {
  const q = (field$('dr-q')?.value ?? '').trim().toLowerCase();
  return store.dailyReports
    .filter((item) => {
      if (!q) return true;

      const isiBaris = item.rows
        .map((r) => [r.nopol, r.ijn, r.namaUser, r.uraian, r.km, r.solar, r.start, r.finish])
        .join(' ');
      return [
        docLabel(item),
        item.driver,
        item.tanggal,
        item.hari,
        item.mengetahui,
        item.createdAt,
        isiBaris,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    })
    .slice()
    .sort((a, b) => b.rowId - a.rowId);
}

export function renderList(): void {
  const filtered = visible();
  drPage = clampPage(drPage, filtered.length);
  const rowsAll = slicePage(filtered, drPage);
  const vis = virtualize(rowsAll, (drPage - 1) * PAGE_SIZE);
  const rows = vis.items;
  void vis.start;
  const tbody = $('dr-tbody');
  const cards = $('dr-cards');
  if (!tbody || !cards) return;

  if (!filtered.length) {
    tbody.innerHTML = emptyRow(7, 'Tidak ada Daily Report yang cocok.');
    cards.innerHTML = emptyCard('Tidak ada Daily Report yang cocok.');
    must('dr-count').textContent = `${filtered.length} dari ${store.dailyReports.length} Daily Report`;
    const pager = $('dr-pager');
    if (pager) pager.innerHTML = '';
    return;
  }

  tbody.innerHTML = rows
    .map(
      (item, i) => `<tr data-action="detail" data-id="${item.rowId}">
      <td class="text-center text-xs text-surface-500">${(drPage - 1) * 10 + i + 1}</td>
      <td class="font-bold whitespace-nowrap">${esc(docLabel(item))}</td>
      <td class="whitespace-nowrap">${esc(orDash(item.hari))}
        <div class="text-[11px] text-surface-400">${esc(orDash(item.tanggal))}</div>
      </td>
      <td class="font-semibold whitespace-nowrap">${esc(orDash(item.driver))}</td>
      <td class="whitespace-nowrap">
        <span class="rounded-md border border-surface-200 bg-surface-100 px-2 py-0.5 font-mono text-xs font-bold uppercase">${esc(plats(item))}</span>
      </td>
      <td class="min-w-48">${esc(uraianRingkas(item))}</td>
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
          <div class="text-xs font-bold text-primary-700 break-words">${esc(docLabel(item))}</div>
          <div class="text-[11px] text-surface-400">${esc(orDash(item.hari))} · ${esc(orDash(item.tanggal))}</div>
        </div>
      </div>
      <div class="mt-2">
        <div class="font-bold break-words">${esc(orDash(item.driver))}</div>
        <div class="text-xs text-surface-500">Mengetahui: ${esc(orDash(item.mengetahui))}</div>
      </div>
      <div class="mt-1 text-sm break-words">${esc(uraianRingkas(item))}</div>
      <div class="mt-2 text-xs text-surface-500">
        <span class="font-mono font-semibold uppercase">${esc(plats(item))}</span> ·
        ${esc(item.rows.length)} baris pekerjaan
      </div>
      ${cardActions(
        actionBtn('detail', { id: item.rowId }),
        actionBtn('print', { id: item.rowId }),
        actionBtn('delete', { id: item.rowId }),
      )}
    </div>`,
    )
    .join('');

  must('dr-count').textContent = `${filtered.length} dari ${store.dailyReports.length} Daily Report`;
  const pager = $('dr-pager');
  if (pager) {
    pager.innerHTML = pagerHtml('dr-pager-inner', drPage, filtered.length);
    bindPager('dr-pager-inner', () => { drPage--; renderList(); }, () => { drPage++; renderList(); });
  }
}

export function resetPage(): void {
  drPage = 1;
}

export async function refresh(): Promise<void> {
  const tbody = $('dr-tbody');
  const cards = $('dr-cards');
  if (tbody) tbody.innerHTML = loadingRow(7);
  if (cards) cards.innerHTML = '';

  try {
    store.dailyReports = await api.getDrDocuments();
    PDF_CACHE.clear();
    drPage = 1;
    renderList();
  } catch (error) {
    console.error(error);
    store.dailyReports = [];
    if (tbody) tbody.innerHTML = emptyRow(6, errorText(error));
    if (cards) cards.innerHTML = emptyCard(errorText(error));
    const count = $('dr-count');
    if (count) count.textContent = '';
    report(error);
  }
}

export async function remove(rowId: number): Promise<void> {
  const item = store.dailyReports.find((i) => i.rowId === rowId);
  if (!item) {
    toast('Daily Report tidak ditemukan.', 'error');
    return;
  }
  if (!confirm(`Hapus Daily Report ${item.id || rowId}? Baris di spreadsheet akan dihapus.`)) return;
  try {
    await api.deleteDr(rowId);
    PDF_CACHE.clear();
    toast('Dihapus');
    await refresh();
  } catch (error) {
    report(error);
  }
}

/* ---------- Detail ---------- */

export function openDrawer(rowId: number): void {
  let item = store.dailyReports.find((i) => i.rowId === rowId);
  if (!item && store.dailyReports.length) {
    item = store.dailyReports.find((i) => String(i.rowId) === String(rowId));
  }
  if (!item) {
    toast('Data tidak ditemukan. Muat ulang halaman.', 'error');
    return;
  }

  const rows = item.rows || [];
  let rowsHtml = '';
  for (let i = 0; i < Math.max(rows.length, 1); i++) {
    const r: any = rows[i] || {};
    rowsHtml += `<div class="mb-4 rounded-lg border border-surface-200 p-3" data-dr-row>
      <div class="mb-2 text-xs font-bold text-surface-500">Baris ${i + 1}</div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="text-[10px] font-bold text-surface-400 uppercase">Jam Start</label><input id="dr-r${i}-start" class="field" value="${esc(r.start || '')}"></div>
        <div><label class="text-[10px] font-bold text-surface-400 uppercase">Jam Finish</label><input id="dr-r${i}-finish" class="field" value="${esc(r.finish || '')}"></div>
        <div><label class="text-[10px] font-bold text-surface-400 uppercase">Total</label><input id="dr-r${i}-total" class="field" value="${esc(r.total || '')}"></div>
        <div><label class="text-[10px] font-bold text-surface-400 uppercase">No. Plat</label><input id="dr-r${i}-nopol" class="field" value="${esc(r.nopol || '')}"></div>
        <div><label class="text-[10px] font-bold text-surface-400 uppercase">IJN</label><input id="dr-r${i}-ijn" class="field" value="${esc(r.ijn || '')}"></div>
        <div><label class="text-[10px] font-bold text-surface-400 uppercase">Nama User</label><input id="dr-r${i}-namaUser" class="field" value="${esc(r.namaUser || '')}"></div>
        <div><label class="text-[10px] font-bold text-surface-400 uppercase">KM</label><input id="dr-r${i}-km" class="field" value="${esc(r.km || '')}"></div>
        <div><label class="text-[10px] font-bold text-surface-400 uppercase">Solar</label><input id="dr-r${i}-solar" class="field" value="${esc(r.solar || '')}"></div>
        <div class="col-span-2"><label class="text-[10px] font-bold text-surface-400 uppercase">Uraian</label><input id="dr-r${i}-uraian" class="field" value="${esc(r.uraian || '')}"></div>
      </div>
    </div>`;
  }

  drawer.open({
    title: 'Edit Daily Report',
    body: `
      <div class="mb-2 text-sm"><b>Driver:</b> ${esc(item.driver || '-')}</div>
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">
          <label class="text-[11px] font-bold tracking-wide text-surface-400 uppercase">No. Dokumen / ID_DR</label>
          <input type="text" id="f-id" class="field font-mono font-bold uppercase" value="${esc(item.id || '')}" />
        </div>

        <div>
          <label class="text-[11px] font-bold tracking-wide text-surface-400 uppercase">Hari</label>
          <input type="text" id="f-hari" class="field" value="${esc(item.hari || '')}" />
        </div>
        <div>
          <label class="text-[11px] font-bold tracking-wide text-surface-400 uppercase">Tanggal</label>
          <input type="text" id="f-tanggal" class="field" value="${esc(item.tanggal || '')}" />
        </div>
        <div>
          <label class="text-[11px] font-bold tracking-wide text-surface-400 uppercase">Driver</label>
          <input type="text" id="f-driver" class="field" value="${esc(item.driver || '')}" />
        </div>
        <div class="col-span-2">
          <label class="text-[11px] font-bold tracking-wide text-surface-400 uppercase">Mengetahui</label>
          <input type="text" id="f-mengetahui" class="field" value="${esc(item.mengetahui || '')}" />
        </div>
      </div>
      <div class="mt-4">
        <div class="mb-2 text-sm font-bold">Data Pekerjaan</div>
        <div id="dr-rows">${rowsHtml}</div>
        <div class="mt-2">${actionBtn('add-row')}</div>
      </div>`,
    footer: `
      <div class="flex flex-wrap gap-2">
        <button class="btn-slate px-4 py-2" type="button" data-action="close-drawer">Batal</button>
        ${actionBtn('print', { id: item.rowId })}
      </div>
      ${actionBtn('save', { id: item.rowId })}`
  });
}

/** Simpan perubahan daily report dari drawer */
export async function saveDrEdit(rowId: number): Promise<void> {
  if (!validateRequired([{ id: 'f-driver', label: 'Driver' }])) return;

  const idEl = $('f-id') as HTMLInputElement | null;
  const hariEl = $('f-hari') as HTMLInputElement | null;
  const tanggalEl = $('f-tanggal') as HTMLInputElement | null;
  const driverEl = $('f-driver') as HTMLInputElement | null;
  const mengetahuiEl = $('f-mengetahui') as HTMLInputElement | null;

  const id = idEl?.value?.trim() || '';
  const hari = hariEl?.value?.trim() || '';
  const tanggal = tanggalEl?.value?.trim() || '';
  const driver = driverEl?.value?.trim() || '';
  const mengetahui = mengetahuiEl?.value?.trim() || '';

  const container = $('dr-rows');
  const rowCount = container ? container.querySelectorAll('[data-dr-row]').length : 0;
  const rows: { start: string; finish: string; nopol: string; ijn: string; namaUser: string; km: string; solar: string; uraian: string }[] = [];
  for (let i = 0; i < rowCount; i++) {
    const g = (sel: string) => ($(`dr-r${i}-${sel}`) as HTMLInputElement | null)?.value?.trim() || '';
    const r = {
      start: g('start'),
      finish: g('finish'),
      nopol: g('nopol'),
      ijn: g('ijn'),
      namaUser: g('namaUser'),
      km: g('km'),
      solar: g('solar'),
      uraian: g('uraian'),
    };
    if (r.start || r.finish || r.nopol || r.ijn || r.namaUser || r.uraian || r.km || r.solar) rows.push(r);
  }

  setPageLoading(true);
  toast(MSG.saving);
  try {
    await api.updateDr({ rowId, id, hari, tanggal, driver, mengetahui, rows });
    toast(MSG.saved);
    drawer.close();
    await refresh();
  } catch (error) {
    report(error);
  } finally {
    setPageLoading(false);
  }
}

/** Tambah baris pekerjaan baru di drawer */
export function addDrRow(): void {
  const container = $('dr-rows');
  if (!container) return;
  const i = container.querySelectorAll('[data-dr-row]').length;
  const block = document.createElement('div');
  block.className = 'mb-4 rounded-lg border border-surface-200 p-3';
  block.setAttribute('data-dr-row', '');
  block.innerHTML = `
    <div class="mb-2 text-xs font-bold text-surface-500">Baris ${i + 1}</div>
    <div class="grid grid-cols-2 gap-2">
      <div><label class="text-[10px] font-bold text-surface-400 uppercase">Jam Start</label><input id="dr-r${i}-start" class="field" value=""></div>
      <div><label class="text-[10px] font-bold text-surface-400 uppercase">Jam Finish</label><input id="dr-r${i}-finish" class="field" value=""></div>
      <div><label class="text-[10px] font-bold text-surface-400 uppercase">Total</label><input id="dr-r${i}-total" class="field" value=""></div>
      <div><label class="text-[10px] font-bold text-surface-400 uppercase">No. Plat</label><input id="dr-r${i}-nopol" class="field" value=""></div>
      <div><label class="text-[10px] font-bold text-surface-400 uppercase">IJN</label><input id="dr-r${i}-ijn" class="field" value=""></div>
      <div><label class="text-[10px] font-bold text-surface-400 uppercase">Nama User</label><input id="dr-r${i}-namaUser" class="field" value=""></div>
      <div><label class="text-[10px] font-bold text-surface-400 uppercase">KM</label><input id="dr-r${i}-km" class="field" value=""></div>
      <div><label class="text-[10px] font-bold text-surface-400 uppercase">Solar</label><input id="dr-r${i}-solar" class="field" value=""></div>
      <div class="col-span-2"><label class="text-[10px] font-bold text-surface-400 uppercase">Uraian</label><input id="dr-r${i}-uraian" class="field" value=""></div>
    </div>`;
  container.appendChild(block);
}


/* ---------- Cetak ---------- */

export function printPdf(rowId: number, sigs?: Signatures): void {
  const item = store.dailyReports.find((i) => i.rowId === rowId);
  if (!item) {
    toast('Daily Report tidak ditemukan.', 'error');
    return;
  }

  print.show('daily');
  print.set('pd-hari', item.hari);
  print.set('pd-tanggal', item.tanggal);
  print.set('pd-driver', item.driver);
  print.set('pd-id', item.id || `DR-${rowId}`);
  print.setHtml('pd-ttd-mengetahui', signatureHtml(sigs?.mengetahui));
  print.setHtml('pd-ttd-driver', signatureHtml(sigs?.driver));

  const tbody = document.getElementById('pd-rows');
  if (tbody) {
    let rows = '';
    const dataRows: any[] = item.rows || [];
    for (let i = 0; i < 10; i++) {
      const r = dataRows[i];
      if (r && (r.start || r.finish || r.nopol || r.ijn || r.namaUser || r.uraian || r.km || r.solar)) {
        rows += '<tr style="height:15px"><td style="border:1px solid #000;padding:0">' + esc(orDash(r.start)) + '</td><td style="border:1px solid #000;padding:0">' + esc(orDash(r.finish)) + '</td><td style="border:1px solid #000;padding:0">' + esc(orDash(r.total)) + '</td><td style="border:1px solid #000;padding:0">' + esc(orDash(r.nopol)) + '</td><td style="border:1px solid #000;padding:0">' + esc(orDash(r.ijn)) + '</td><td style="border:1px solid #000;padding:0;text-align:left;font-size:6pt">' + esc(orDash(r.namaUser)) + '</td><td style="border:1px solid #000;padding:0">' + esc(orDash(r.km)) + '</td><td style="border:1px solid #000;padding:0">' + esc(orDash(r.solar)) + '</td><td style="border:1px solid #000;padding:0;text-align:left;font-size:6pt">' + esc(orDash(r.uraian)) + '</td><td style="border:1px solid #000;padding:0"></td><td style="border:1px solid #000;padding:0"></td><td style="border:1px solid #000;padding:0"></td></tr>';
      } else {
        rows += '<tr style="height:15px"><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td><td style="border:1px solid #000"></td></tr>';
      }
    }
    tbody.innerHTML = rows;
  }

  print.run();
}


