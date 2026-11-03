/**
 * main.ts — kerangka aplikasi: shell, router, dan delegasi event.
 *
 * Tidak ada router library dan tidak ada state library. Halaman didaftarkan
 * di PAGES, aksi dikumpulkan di ACTIONS. Satu tempat, mudah dibaca.
 */

import './styles.css';
import { api, invalidateAll } from './api';
import { CONFIG } from './config';
import { store } from './store';
import { $, askSignature, drawer, esc, field$, icon, must, toast } from './ui';
import * as overview from './pages/overview';
import * as transport from './pages/transport';
import * as inventaris from './pages/inventaris';
import * as dailyReport from './pages/daily-report';
import { checklistListPage, openDetail as clOpenDetail, printChecklist as clPrintChecklist } from './pages/checklist-list';
import { manpowerRequisitionPage } from './manpower/requisition';
import { jobCompletionPage } from './manpower/completion';

/*****************************************************************
   TEMPLATE
   ===================================================== */

const SHELL = `
<aside id="sidebar"
  class="no-print fixed top-0 left-0 z-40 h-full w-64 -translate-x-full border-r border-surface-200 bg-white transition-transform duration-200 lg:translate-x-0">
  <div class="flex items-center gap-3 border-b border-surface-100 px-6 py-5">
    <div class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-surface-200 bg-white p-1">
      <img src="https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png" alt="Logo HBPA" class="h-full w-auto">
    </div>
    <div>
      <h1 class="text-sm leading-tight font-bold">${esc(CONFIG.COMPANY_SHORT)}</h1>
      <p class="text-[11px] text-surface-400">${esc(CONFIG.APP_NAME)}</p>
    </div>
  </div>
  <nav id="nav" class="space-y-1 px-3 py-4"></nav>
</aside>

<div id="scrim" class="no-print fixed inset-0 z-30 hidden bg-black/30 lg:hidden" data-action="close-sidebar"></div>

<main class="lg:ml-64">
  <header class="no-print sticky top-0 z-20 border-b border-surface-100 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <button class="rounded-lg p-2 text-surface-600 hover:bg-surface-100 lg:hidden" data-action="toggle-sidebar">
          ${icon('menu', 'w-5 h-5')}
        </button>
        <h2 id="title" class="text-lg font-bold"></h2>
      </div>
      <button class="btn-slate px-3.5 py-2" data-action="refresh-all">
        ${icon('refresh', 'w-3.5 h-3.5 text-primary-600')} <span class="hidden sm:inline">Refresh Data</span>
      </button>
    </div>
  </header>

  <div id="notice" class="mx-4 mt-4 hidden rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-6"></div>
  <div id="page" class="p-4 sm:p-6"></div>
</main>

<div id="drawer" class="no-print fixed inset-0 z-50 hidden">
  <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" data-action="close-drawer"></div>
  <div class="absolute top-0 right-0 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
    <div class="flex items-center justify-between border-b border-surface-100 bg-surface-50 px-4 py-4 sm:px-6">
      <h3 id="drawer-title" class="text-base font-bold"></h3>
      <button class="rounded-lg p-1.5 text-surface-500 hover:bg-surface-200" data-action="close-drawer">${icon('x', 'w-5 h-5')}</button>
    </div>
    <div id="drawer-body" class="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6"></div>
    <div id="drawer-footer" class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-100 bg-surface-50 px-4 py-4 sm:px-6"></div>
  </div>
</div>

<div id="loading" class="no-print hidden fixed inset-0 z-50 flex items-center justify-center bg-black/30"><div class="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white"></div></div>
<div id="toast" class="hidden"></div>
`;

/* =====================================================
   HALAMAN
   ===================================================== */

interface Page {
  title: string;
  icon: string;
  html(): string;
  mount?(): void | Promise<void>;
  onSearchInput?(): void;
  onFilterChange?(): void;
}

const OVERVIEW: Page = {
  title: 'Overview',
  icon: 'dashboard',
  html: () => `
    <div class="space-y-6">
      <div>
        <h3 class="text-xl font-extrabold sm:text-2xl">${esc(CONFIG.COMPANY_NAME)}</h3>
        <p class="mt-0.5 text-sm text-surface-500">Dashboard ${esc(CONFIG.APP_NAME)}</p>
      </div>

      <div id="stats" class="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6"></div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="card overflow-hidden">
          <div class="flex items-center justify-between gap-2 border-b border-surface-100 px-6 py-4">
            <div class="flex items-center gap-2">
              ${icon('file', 'w-4 h-4 text-primary-600')}
              <h4 class="text-sm font-bold">Ringkasan Transportasi</h4>
            </div>
            <button class="text-xs font-semibold text-primary-700 hover:underline" data-page="transport">Lihat semua</button>
          </div>
          <div id="sum-transport" class="divide-y divide-surface-100"></div>
        </div>
        <div class="card overflow-hidden">
          <div class="flex items-center justify-between gap-2 border-b border-surface-100 px-6 py-4">
            <div class="flex items-center gap-2">
              ${icon('box', 'w-4 h-4 text-primary-600')}
              <h4 class="text-sm font-bold">Ringkasan Inventaris</h4>
            </div>
            <button class="text-xs font-semibold text-primary-700 hover:underline" data-page="inventaris">Lihat semua</button>
          </div>
          <div id="sum-inventaris" class="divide-y divide-surface-100"></div>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="flex items-center gap-2 border-b border-surface-100 px-6 py-4">
          ${icon('send', 'w-4 h-4 text-emerald-600')}
          <h4 class="text-sm font-bold">Kirim Info Permintaan via Email</h4>
        </div>
        <div class="space-y-4 p-4 sm:p-6">
          <div>
            <label class="field-label" for="mail-q">Cari Permintaan</label>
            <input id="mail-q" type="search" class="field" placeholder="Cari nama, no., divisi, tujuan, atau plat...">
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs text-surface-500">Centang yang mau dikirim.
              <span id="email-count" class="font-bold text-emerald-700">0 dipilih</span></p>
            <div class="flex gap-2">
              <button class="btn-slate px-3 py-1.5" data-action="select-all">Pilih Semua</button>
              <button class="btn-slate px-3 py-1.5" data-action="select-none">Kosongkan</button>
            </div>
          </div>
          <div id="email-list" class="max-h-96 divide-y divide-surface-100 overflow-y-auto rounded-xl border border-surface-200"></div>
          <button class="btn bg-blue-600 px-6 py-2.5 text-sm text-white hover:bg-blue-700" data-action="send-selected">
            ${icon('mail')} Kirim Email
          </button>
        </div>
      </div>
    </div>`,
  mount() {
    overview.renderStats();
    void overview.refresh();
  },
  onSearchInput() {
    // Daftar pendek: cukup saring di sisi browser, tidak perlu memanggil API.
    const q = (field$('mail-q')?.value ?? '').trim().toLowerCase();
    const box = $('email-list');
    if (!box) return;
    for (const row of box.querySelectorAll<HTMLElement>('label[data-row]')) {
      const text = (row.dataset.row ?? '').toLowerCase();
      row.classList.toggle('hidden', Boolean(q) && !text.includes(q));
    }
  },
};

const TRANSPORT_PAGE: Page = {
  title: 'Daftar Permintaan Transportasi',
  icon: 'file',
  html: () => `
    <div class="space-y-4">
      <div class="card flex flex-col gap-3 p-4 sm:flex-row">
        <div class="relative flex-1">
          ${icon('search', 'w-4 h-4 text-surface-400 absolute top-1/2 left-3.5 -translate-y-1/2')}
          <input id="q" type="search" class="field pl-10" placeholder="Cari nama, no., divisi, tujuan, plat...">
        </div>
        <select id="filter-status" class="field w-auto text-xs font-semibold">
          <option value="">Semua Status</option>
          <option value="Pending">Pending</option>
          <option value="Disetujui">Disetujui</option>
          <option value="Ditolak">Ditolak</option>
          <option value="Selesai">Selesai</option>
        </select>
        <select id="filter-dept" class="field w-auto text-xs font-semibold"></select>
        <button class="btn-slate shrink-0" data-action="export">${icon('file')} Ekspor CSV</button>
        <button class="btn-primary shrink-0" data-action="create-new">${icon('plus')} Permintaan Baru</button>
      </div>

      <p id="count" class="text-[11px] text-surface-400"></p>

      <div id="cards" class="space-y-3 md:hidden"></div>

      <div class="card hidden overflow-hidden md:block">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <thead id="thead"></thead>
            <tbody id="tbody"></tbody>
          </table>
        </div>
      </div>
    </div>`,
  mount() {
    transport.renderHeader();
    void transport.refresh();
  },
  onSearchInput: () => transport.renderList(),
  onFilterChange: () => transport.renderList(),
};

const INVENTARIS_PAGE: Page = {
  title: 'Peminjaman Inventaris Barang',
  icon: 'box',
  html: () => `
    <div class="space-y-4">
      <div id="inv-error" class="hidden rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"></div>

      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        ${[
          ['i-total', 'Total Peminjaman'],
          ['i-dipinjam', 'Sedang Dipinjam'],
          ['i-overdue', 'Lewat Tanggal Kembali'],
          ['i-selesai', 'Sudah Dikembalikan'],
        ]
          .map(
            ([id, label]) => `<div class="card p-4 sm:p-5">
          <p id="${id}" class="text-2xl font-black sm:text-3xl">0</p>
          <p id="${id}-label" class="mt-0.5 text-xs font-medium text-surface-400">${esc(label)}</p>
        </div>`,
          )
          .join('')}
      </div>

      <div class="card flex flex-col gap-3 p-4 sm:flex-row">
        <div class="relative flex-1">
          ${icon('search', 'w-4 h-4 text-surface-400 absolute top-1/2 left-3.5 -translate-y-1/2')}
          <input id="inv-q" type="search" class="field pl-10" placeholder="Cari nama, no. dokumen, kontak, atau barang...">
        </div>
        <select id="inv-status" class="field w-auto text-xs font-semibold">
          <option value="">Semua Status</option>
          <option value="Dipinjam">Dipinjam</option>
          <option value="Overdue">Overdue</option>
          <option value="Selesai">Selesai</option>
        </select>
      </div>

      <p id="inv-count" class="text-[11px] text-surface-400"></p>

      <div id="inv-cards" class="space-y-3 md:hidden"></div>

      <div class="card hidden overflow-hidden md:block">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <thead class="bg-surface-50 text-[11px] font-bold tracking-wider text-surface-500 uppercase">
              <tr>
                <th class="px-4 py-3.5 whitespace-nowrap">No. Dokumen</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Nama</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Kontak</th>
                <th class="px-4 py-3.5 min-w-56">Barang</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Tgl Pinjam</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Rencana Kembali</th>
                <th class="px-4 py-3.5 min-w-40">Keperluan</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Tgl Kembali Aktual</th>
                <th class="px-4 py-3.5 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody id="inv-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>`,
  mount() {
    void inventaris.refresh();
  },
  onSearchInput: () => inventaris.renderList(),
  onFilterChange: () => inventaris.renderList(),
};

const DAILY_REPORT_PAGE: Page = {
  title: 'Surat Tugas / Daily Report',
  icon: 'file',
  html: () => `
    <div class="space-y-4">
      <div class="card flex flex-col gap-3 p-4 sm:flex-row">
        <div class="relative flex-1">
          ${icon('search', 'w-4 h-4 text-surface-400 absolute top-1/2 left-3.5 -translate-y-1/2')}
          <input id="dr-q" type="search" class="field pl-10" placeholder="Cari driver, tanggal, no. plat, atau uraian...">
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <p id="dr-count" class="text-[11px] text-surface-400"></p>
        <p class="text-[11px] text-surface-400">Input lewat Google Form · PDF dicetak dari dashboard.</p>
      </div>

      <div id="dr-cards" class="space-y-3 md:hidden"></div>

      <div class="card hidden overflow-hidden md:block">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <thead class="bg-surface-50 text-[11px] font-bold tracking-wider text-surface-500 uppercase">
              <tr>
                <th class="px-4 py-3.5 whitespace-nowrap">No. Dokumen</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Hari / Tanggal</th>
                <th class="px-4 py-3.5 whitespace-nowrap">Driver</th>
                <th class="px-4 py-3.5 whitespace-nowrap">No. Plat</th>
                <th class="px-4 py-3.5 min-w-48">Uraian</th>
                <th class="px-4 py-3.5 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody id="dr-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>`,
  mount() {
    void dailyReport.refresh();
  },
  onSearchInput: () => dailyReport.renderList(),
  onFilterChange: () => dailyReport.renderList(),
};

const PAGES = {
  overview: OVERVIEW,
  transport: TRANSPORT_PAGE,
  inventaris: INVENTARIS_PAGE,
  daily: DAILY_REPORT_PAGE,
  'checklist-list': checklistListPage,
  'manpower-requisition': manpowerRequisitionPage,
  'job-completion': jobCompletionPage,
} as const;

type PageKey = keyof typeof PAGES;

const NAV_SECTIONS = [
  { label: 'FACILITY', pages: ['overview', 'transport', 'inventaris', 'daily', 'checklist-list'] },
  { label: 'MANPOWER', pages: ['manpower-requisition', 'job-completion'] },
] as const satisfies ReadonlyArray<{ label: string; pages: readonly PageKey[] }>;

/* =====================================================
   AREA CETAK
   ===================================================== */

const PRINT_AREAS = `
<div id="print-transport" class="hidden">
  <div class="mx-auto w-full p-1 font-sans text-black" style="max-width:138mm;font-size:9.5pt">
    <table class="w-full" style="border-collapse:collapse;border:1.5px solid #000">
      <tr>
        <td class="text-center align-middle" style="width:28%;border:1.5px solid #000;padding:6px">
          <img src="https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png" alt="" style="max-height:44px;width:auto;display:block;margin:0 auto">
        </td>
        <td class="text-center align-middle" style="width:72%;border:1.5px solid #000;padding:0">
          <div class="font-bold" style="font-size:10pt;padding:5px 0;border-bottom:1.5px solid #000">${esc(CONFIG.COMPANY_NAME)}</div>
          <div class="font-bold" style="font-size:11.5pt;padding:5px 0">PERMINTAAN TRANSPORTASI</div>
        </td>
      </tr>
    </table>
    <div class="font-bold" style="width:52%;margin-left:auto;margin-top:10px;margin-bottom:12px;border:1.5px solid #000;padding:4px 8px;font-size:9pt">
      NO : <span id="p-nosurat"></span>
    </div>
    <table class="w-full" style="border-collapse:collapse;margin-bottom:15px;line-height:1.8;font-size:9.5pt">
      ${[
        ['p-nama', 'N A M A'],
        ['p-dept', 'DEPARTMENT'],
        ['p-ijn', 'IJN'],
        ['p-tujuan', 'TUJUAN'],
        ['p-tgljam', 'HARI / TGL. / JAM'],
        ['p-nopol', 'NO. POL. KENDARAAN'],
        ['p-keperluan', 'KEPERLUAN'],
      ]
        .map(
          ([id, label]) =>
            `<tr><td style="width:32%"><strong>${label}</strong></td><td style="width:3%">:</td><td id="${id}" style="font-weight:700;border-bottom:1px dotted #000"></td></tr>`,
        )
        .join('')}
    </table>
    <div class="text-right" style="margin:0 10px 10px 0;font-size:9pt">Balikpapan, <span id="p-tglcetak"></span></div>
    <table class="w-full text-center" style="margin-top:5px;font-size:9pt">
      <tr>
        <td style="width:50%"><strong>Disetujui,</strong><br><br><br><br><span id="p-ttd-approve" style="font-size:9pt"></span><br>(.......................................)<br>
          <span style="font-size:8pt;font-style:italic">(Facility Department)</span></td>
        <td style="width:50%"><strong>Pemohon,</strong><br><br><br><br><span id="p-ttd-pemohon" style="font-size:9pt"></span><br>(.......................................)</td>
      </tr>
    </table>
    <table class="w-full italic" style="margin-top:15px;font-size:7.5pt">
      <tr><td>FM-FCL-02.04</td><td class="text-right">Rev : 01 (171212)</td></tr>
    </table>
  </div>
</div>

<div id="print-inventaris" class="hidden">
  <div class="mx-auto w-full p-1 font-sans text-black" style="max-width:200mm;font-size:8pt">
    <div class="text-center">
      <div class="font-bold" style="font-size:12pt">FORM PEMINJAMAN BARANG INVENTARIS</div>
      <div class="font-bold italic" style="font-size:6.5pt;margin-top:1px">(DEMI KELANCARAN PEMINJAMAN DAN PENGAMBILAN PERLENGKAPAN, MOHON LENGKAPI FORMULIR INI)</div>
      <div class="font-bold underline" style="font-size:10pt;margin-top:5px">PEMINJAMAN BARANG</div>
    </div>
    <table class="w-full" style="border-collapse:collapse;margin-top:6px;line-height:1.55;font-size:8pt">
      ${[
        ['pi-nama', 'NAMA'],
        ['pi-kontak', 'NOMOR KONTAK'],
        ['pi-tglpinjam', 'HARI & TANGGAL PEMINJAMAN'],
        ['pi-keperluan', 'KEPERLUAN'],
        ['pi-tglkembali', 'HARI & TANGGAL PENGEMBALIAN'],
      ]
        .map(
          ([id, label]) =>
            `<tr><td style="width:30%"><strong>${label}</strong></td><td style="width:2%">:</td><td id="${id}" style="font-weight:700;border-bottom:1px dotted #000"></td></tr>`,
        )
        .join('')}
    </table>
    <div class="text-center font-bold underline" style="margin:7px 0 4px;font-size:9pt">PERLENGKAPAN YANG DI PINJAM &amp; KONDISI</div>
    <table class="w-full" style="border-collapse:collapse;font-size:8pt">
      <thead>
        <tr>
          <th rowspan="2" style="border:1px solid #000;padding:2px 5px;width:7%">No.</th>
          <th rowspan="2" style="border:1px solid #000;padding:2px 5px">Description</th>
          <th rowspan="2" style="border:1px solid #000;padding:2px 5px;width:9%">Qty</th>
          <th colspan="2" style="border:1px solid #000;padding:2px 5px">Kondisi</th>
        </tr>
        <tr>
          <th style="border:1px solid #000;padding:2px 5px;width:14%">Ambil</th>
          <th style="border:1px solid #000;padding:2px 5px;width:14%">Kembali</th>
        </tr>
      </thead>
      <tbody id="pi-rows"></tbody>
    </table>
    <div class="font-bold italic" style="margin-top:5px;font-size:7pt">
      Note: Peminjam setuju untuk mengembalikan semua pinjaman pada tanggal pengembalian di atas dalam keadaan baik.
      Peminjam menyanggupi penggantian bila terjadi kehilangan dan kerusakan.
    </div>
    <table class="w-full text-center font-bold" style="margin-top:6px;font-size:8pt">
      <tr>
        <td style="width:33%">Peminjam,<br><br><br><br><span id="pi-ttd-peminjam" style="font-size:8pt"></span><br>(.......................)</td>
        <td style="width:34%">Mengetahui,<br><br><br><br><span id="pi-ttd-mengetahui" style="font-size:8pt"></span><br>(.......................)</td>
        <td style="width:33%">Menyetujui,<br><br><br><br><span id="pi-ttd-menyetujui" style="font-size:8pt"></span><br>(.......................)</td>
      </tr>
    </table>
  </div>
</div>

<div id="print-daily" class="hidden">
  <div class="mx-auto w-full p-1 font-sans text-black" style="width:200mm;font-size:7pt">
    <table class="w-full" style="border-collapse:collapse;border:1.5px solid #000">
      <tr>
        <td width="22%" align="center" valign="middle" style="border-right:1.5px solid #000;padding:3px">
          <img src="https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png" style="max-height:34px;max-width:80px;">
        </td>
        <td width="78%" align="center" valign="middle" style="padding:3px">
          <div style="font-weight:bold;font-size:10pt;letter-spacing:0.5px">PT. HIDUP BARU PERDANA ABADI</div>
          <div style="font-weight:bold;font-size:9pt;letter-spacing:0.5px;margin-top:1px">SURAT TUGAS / DAILY REPORT</div>
        </td>
      </tr>
    </table>
    <table class="w-full" style="border-collapse:collapse;margin-top:3px;margin-bottom:1px;font-weight:bold;font-size:8pt">
      <tr>
        <td width="50%" align="left" valign="top">
          Hari &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <span id="pd-hari"></span><br>
          Tanggal : <span id="pd-tanggal"></span>
        </td>
        <td width="50%" align="right" valign="top">
          Driver : <span id="pd-driver"></span>
        </td>
      </tr>
    </table>
    <table class="w-full" style="border-collapse:collapse;border:1.5px solid #000;text-align:center;font-size:7pt">
      <thead>
        <tr>
          <th colspan="3" style="border:1px solid #000;padding:1px">Jam</th>
          <th rowspan="2" width="7%" style="border:1px solid #000;padding:1px">No.<br>Plat</th>
          <th rowspan="2" width="6%" style="border:1px solid #000;padding:1px">IJIN</th>
          <th rowspan="2" width="10%" style="border:1px solid #000;padding:1px">Nama<br>User</th>
          <th rowspan="2" width="5%" style="border:1px solid #000;padding:1px">KM</th>
          <th rowspan="2" width="5%" style="border:1px solid #000;padding:1px">Solar</th>
          <th rowspan="2" width="28%" style="border:1px solid #000;padding:1px">Uraian</th>
          <th rowspan="2" width="9%" style="border:1px solid #000;padding:1px">Paraf<br>Security</th>
          <th colspan="2" style="border:1px solid #000;padding:1px">Paraf</th>
        </tr>
        <tr>
          <th width="5%" style="border:1px solid #000;padding:1px">Start</th>
          <th width="5%" style="border:1px solid #000;padding:1px">Finish</th>
          <th width="5%" style="border:1px solid #000;padding:1px">Total</th>
          <th width="9%" style="border:1px solid #000;padding:1px">Nama</th>
          <th width="9%" style="border:1px solid #000;padding:1px">TTD</th>
        </tr>
      </thead>
      <tbody id="pd-rows"></tbody>
    </table>
    <table class="w-full" style="border-collapse:collapse;margin-top:2px">
      <tr>
        <td width="50%" align="left" valign="bottom" style="font-size:6.5pt;font-style:italic;font-weight:bold">
          FM-FCL-02.04
        </td>
        <td width="50%" align="right" valign="bottom" style="font-size:6.5pt;font-style:italic;font-weight:bold">
          REV: 01 (171212)
        </td>
      </tr>
    </table>
    <table class="w-full" style="border-collapse:collapse;margin-top:2px">
      <tr>
        <td width="50%" align="left" valign="top">
          <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;text-align:center;font-size:7pt">
            <tr>
              <td style="border:1.5px solid #000;padding:0">
                <table width="110" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                  <tr><th style="border-bottom:1px solid #000;padding:1px">Mengetahui</th></tr>
                  <tr><td style="height:26px;font-size:7pt" id="pd-ttd-mengetahui"></td></tr>
                </table>
              </td>
              <td style="border:1.5px solid #000;border-left:none;padding:0">
                <table width="110" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                  <tr><th style="border-bottom:1px solid #000;padding:1px">Driver / Operator</th></tr>
                  <tr><td style="height:26px;font-size:7pt" id="pd-ttd-driver"></td></tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
        <td width="50%" align="right" valign="top"></td>
      </tr>
    </table>
    <div style="font-size:6.5pt;font-style:italic;margin-top:2px">
      Note : Setiap sore / sehabis kerja harus melapor kepada pemberi tugas
    </div>
  </div>
</div>

<div id="print-manpower-requisition" class="hidden">
  <style>
    .mpr-paper{box-sizing:border-box;width:100%;min-height:200mm;background:#fff;color:#000;font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:8.5pt;padding:4mm 5mm;border:1.2pt solid #000;}
    .mpr-paper *{box-sizing:inherit}
    .mpr-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:15mm}
    .mpr-logo img{height:12mm;width:auto;max-width:38mm;object-fit:contain}
    .mpr-title{text-align:center;white-space:nowrap;font-size:12.5pt;line-height:1.25;font-weight:800;text-decoration:underline;text-underline-offset:1mm;letter-spacing:.1px}
    .mpr-info{display:grid;grid-template-columns:35mm 2mm 1fr;row-gap:3mm;margin:4mm 4mm 0;align-items:end}
    .mpr-label{font-size:8pt;font-weight:800;text-transform:uppercase}
    .mpr-line{display:block;min-height:1.25em;padding:0 .5mm;border-bottom:1px dotted #000;line-height:1.35}
    .mpr-outline-title{margin:5mm 4mm 2mm;font-size:8pt;font-weight:800;text-transform:uppercase}
    .mpr-outline{display:grid;grid-template-columns:6mm 1fr;row-gap:2mm;margin:0 4mm;align-items:end}
    .mpr-outline .no{text-align:right;padding-right:1mm;font-weight:700}
    .mpr-outline .line{min-height:5mm;display:flex;align-items:flex-end;border-bottom:1px dotted #000;padding-bottom:.4mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mpr-approval{display:grid;grid-template-columns:repeat(3,1fr);border-top:1.2pt solid #000;margin-top:5mm}
    .mpr-approval .col{border-right:1.2pt solid #000;display:flex;flex-direction:column;min-width:0}
    .mpr-approval .col:last-child{border-right:0}
    .mpr-approval .hd{text-align:center;font-weight:800;height:6mm;line-height:6mm;border-bottom:1.2pt solid #000;font-size:8pt}
    .mpr-approval .box{height:24mm;display:flex;align-items:flex-end;justify-content:center;padding:1mm;overflow:hidden}
    .mpr-approval .nm{border-top:1.2pt solid #000;padding:1mm 1.5mm;line-height:5.2mm;font-size:7pt}
    .mpr-approval .inline-line{display:inline-block;min-width:55%;border-bottom:1px dotted #000;padding:0 .5mm}
  </style>
  <main class="mpr-paper">
    <header class="mpr-head">
      <div class="mpr-logo"><img src="https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png" alt="Hidup Baru" referrerpolicy="no-referrer"></div>
      <div class="mpr-title">MANPOWER REQUISITION FORM</div>
      <div></div>
    </header>

    <section class="mpr-info">
      <div class="mpr-label">* Department</div><div>:</div><div id="mpr-department" class="mpr-line"></div>
      <div class="mpr-label">* Division</div><div>:</div><div id="mpr-division" class="mpr-line"></div>
      <div class="mpr-label">* Requested Date</div><div>:</div><div id="mpr-requestedDate" class="mpr-line"></div>
      <div class="mpr-label">* Required Manpower</div><div>:</div><div id="mpr-requiredManpower" class="mpr-line"></div>
    </section>

    <div class="mpr-outline-title">* Job Out Line / Short Description</div>
    <section class="mpr-outline">
      <div class="no">1.</div><div id="mpr-outline-1" class="line"></div>
      <div class="no">2.</div><div id="mpr-outline-2" class="line"></div>
      <div class="no">3.</div><div id="mpr-outline-3" class="line"></div>
      <div class="no">4.</div><div id="mpr-outline-4" class="line"></div>
      <div class="no">5.</div><div id="mpr-outline-5" class="line"></div>
      <div class="no">6.</div><div id="mpr-outline-6" class="line"></div>
      <div class="no">7.</div><div id="mpr-outline-7" class="line"></div>
      <div class="no">8.</div><div id="mpr-outline-8" class="line"></div>
      <div class="no">9.</div><div id="mpr-outline-9" class="line"></div>
      <div class="no">10.</div><div id="mpr-outline-10" class="line"></div>
    </section>

    <footer class="mpr-approval">
      <div class="col">
        <div class="hd">Approved by:</div>
        <div id="mpr-approved-ttd" class="box"></div>
        <div class="nm">Name : <span id="mpr-approvedName" class="inline-line"></span><br>Date : <span id="mpr-approvedDate" class="inline-line"></span></div>
      </div>
      <div class="col">
        <div class="hd">Acknowledged by:</div>
        <div id="mpr-ack-ttd" class="box"></div>
        <div class="nm">Name : <span id="mpr-ackName" class="inline-line"></span><br>Date : <span id="mpr-ackDate" class="inline-line"></span></div>
      </div>
      <div class="col">
        <div class="hd">Requested by:</div>
        <div id="mpr-requested-ttd" class="box"></div>
        <div class="nm">Name : <span id="mpr-requestedName" class="inline-line"></span><br>Date : <span id="mpr-requestedDate2" class="inline-line"></span></div>
      </div>
    </footer>
  </main>
</div>

<div id="print-job-completion" class="hidden">
  <style>
    .jc-paper{box-sizing:border-box;width:100%;min-height:285mm;margin:0 auto;background:#fff;color:#000;font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:10pt;padding:8mm 10mm;}
    .jc-paper *{box-sizing:inherit}
    .jc-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:16mm}
    .jc-logo img{height:14mm;width:auto;max-width:48mm;object-fit:contain}
    .jc-title{text-align:center;white-space:nowrap;font-size:16pt;font-weight:800;line-height:1.25;text-decoration:underline;text-underline-offset:1.2mm}
    .jc-reported{display:grid;grid-template-columns:26mm 2mm 1fr;row-gap:3mm;align-items:end;margin:2mm 0 0 45mm;max-width:120mm}
    .jc-label{font-size:9pt;font-weight:800}
    .jc-line{display:block;min-height:1.25em;padding:0 1mm;border-bottom:1px dotted #000;line-height:1.35}
    .jc-signbox{height:22mm;margin:1mm 0 0 10mm;border:1.2px solid #000;border-radius:3mm;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .jc-info{display:grid;grid-template-columns:45mm 2mm 1fr;row-gap:2.5mm;margin:5mm 0 0 3mm;align-items:end;padding-right:3mm}
    .jc-info .lbl{font-size:9pt;font-weight:800;text-transform:uppercase}
    .jc-manpower{display:grid;grid-template-columns:45mm 2mm 1fr;row-gap:2mm;margin:4mm 0 0 3mm;align-items:end;padding-right:3mm}
    .jc-manpower .lbl{font-size:9pt;font-weight:800;text-transform:uppercase}
    .jc-manpower-line{display:flex;align-items:flex-end;gap:2mm;min-width:0}
    .jc-manpower-line .n{font-weight:800}
    .jc-manpower-line .line{flex:1;border-bottom:1px dotted #000;min-height:1.25em;padding:0 .5mm}
    .jc-jobs{width:100%;border-collapse:collapse;margin:5mm 0 6mm;table-layout:fixed;border:1.2px solid #000}
    .jc-jobs th{height:6mm;font-size:8.5pt;font-weight:800;text-transform:uppercase;border:1.2px solid #000;text-align:center}
    .jc-jobs td{height:6mm;padding:0 1.5mm;vertical-align:middle;border:1px solid #000;font-size:8pt;overflow-wrap:anywhere}
    .jc-jobs td.no{text-align:center}
    .jc-enduser{display:grid;grid-template-columns:38% 1fr;border:1.2px solid #000;height:34mm;margin:auto 8% 0 0}
    .jc-eu-left{display:flex;flex-direction:column;border-right:1.2px solid #000}
    .jc-eu-left>div{padding:0 2mm}
    .jc-eu-title{text-align:center;border-bottom:1.2px solid #000;font-weight:700;height:7mm;line-height:7mm}
    .jc-eu-name{border-bottom:1.2px solid #000;height:7mm;line-height:7mm;font-size:8pt}
    .jc-eu-pos{border-bottom:1.2px solid #000;height:7mm;line-height:7mm;font-size:8pt}
    .jc-eu-sign{flex:1;display:flex;align-items:flex-end;padding-bottom:2mm;overflow:hidden}
    .jc-inline{display:inline-block;min-width:48mm;border-bottom:1px dotted #000;padding:0 .5mm}
  </style>
  <main class="jc-paper">
    <header class="jc-head">
      <div class="jc-logo"><img src="https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png" alt="Hidup Baru" referrerpolicy="no-referrer"></div>
      <div class="jc-title">JOB COMPLETION REPORT</div>
      <div></div>
    </header>

    <section class="jc-reported">
      <div class="jc-label">REPORTED BY</div><div>:</div><div id="jc-reportedBy" class="jc-line"></div>
      <div class="jc-label">SIGNATURE</div><div>:</div><div></div>
      <div></div><div></div><div id="jc-reported-ttd" class="jc-signbox"></div>
    </section>

    <section class="jc-info">
      <div class="lbl">Job Name</div><div>:</div><div id="jc-jobName" class="jc-line"></div>
      <div class="lbl">Job No.</div><div>:</div><div id="jc-jobNo" class="jc-line"></div>
      <div class="lbl">Location</div><div>:</div><div id="jc-location" class="jc-line"></div>
      <div class="lbl">Date &amp; Time</div><div>:</div><div id="jc-dateTime" class="jc-line"></div>
    </section>

    <section class="jc-manpower">
      <div class="lbl">Manpower<br>Name / Classification</div><div>:</div>
      <div class="jc-manpower-line"><span class="n">1)</span><span id="jc-mp-name-1" class="line"></span><span>/</span><span id="jc-mp-class-1" class="line"></span></div>
      <div></div><div>:</div>
      <div class="jc-manpower-line"><span class="n">2)</span><span id="jc-mp-name-2" class="line"></span><span>/</span><span id="jc-mp-class-2" class="line"></span></div>
      <div></div><div>:</div>
      <div class="jc-manpower-line"><span class="n">3)</span><span id="jc-mp-name-3" class="line"></span><span>/</span><span id="jc-mp-class-3" class="line"></span></div>
      <div></div><div>:</div>
      <div class="jc-manpower-line"><span class="n">4)</span><span id="jc-mp-name-4" class="line"></span><span>/</span><span id="jc-mp-class-4" class="line"></span></div>
    </section>

    <table class="jc-jobs">
      <colgroup><col style="width:17mm"><col style="width:40mm"><col></colgroup>
      <thead><tr><th>No</th><th>Date &amp; Time</th><th>Job Description</th></tr></thead>
      <tbody id="jc-jobRows"></tbody>
    </table>

    <section class="jc-enduser">
      <div class="jc-eu-left">
        <div class="jc-eu-title">END USER</div>
        <div class="jc-eu-name">NAME : <span id="jc-endUserName" class="jc-inline"></span></div>
        <div class="jc-eu-pos">POSITION : <span id="jc-endUserPosition" class="jc-inline"></span></div>
        <div class="jc-eu-sign"><div>SIGN :<div id="jc-endUser-ttd"></div></div></div>
      </div>
      <div></div>
    </section>
  </main>
</div>

<div id="print-checklist" class="hidden"></div>
`;

/* =====================================================
   AKSI
   ===================================================== */

type Handler = (el: HTMLElement, id: number) => void | Promise<void>;

const ACTIONS: Record<string, Handler> = {
  'toggle-sidebar': () => toggleSidebar(),
  'close-sidebar': () => toggleSidebar(true),
  'close-drawer': () => drawer.close(),
  'refresh-all': () => refreshAll(),

  open: (_el, id) => transport.openDrawer(id),
  save: (_el, id) => transport.save(id),
  create: () => transport.create(),
  'create-new': () => transport.openCreate(),
  print: (el, id) => {
    const fromDrawer = el.dataset.from === 'drawer';
    const prefill = store.transport.find((t) => t.rowId === id)?.nama ?? '';
    askSignature(
      'Cetak Permintaan Transportasi',
      [
        { key: 'disetujui', label: 'Disetujui', role: 'Facility Department' },
        { key: 'pemohon', label: 'Pemohon', prefillName: prefill, required: true },
      ],
      (sigs) => transport.printRow(id, fromDrawer, sigs),
    );
  },
  email: (el, id) => transport.email([id], el as HTMLButtonElement),
  delete: (_el, id) => transport.remove(id),
  export: () => transport.exportCsv(),

  'inv-open': (_el, id) => inventaris.openDrawer(id),
  'inv-save': (_el, id) => inventaris.save(id),
  'inv-print': (_el, id) => {
    const prefill = store.inventaris.find((i) => i.rowId === id)?.nama ?? '';
    askSignature(
      'Cetak Form Peminjaman Inventaris',
      [
        { key: 'peminjam', label: 'Peminjam', prefillName: prefill, required: true },
        { key: 'mengetahui', label: 'Mengetahui' },
        { key: 'menyetujui', label: 'Menyetujui' },
      ],
      (sigs) => inventaris.printRow(id, sigs),
    );
  },
  'inv-all-good': () => inventaris.setAllGood(),
  'inv-status': (el) => inventaris.onStatusChange(el as HTMLSelectElement),

  pick: (el, id) => overview.toggle(id, (el as HTMLInputElement).checked),
  'select-all': () => overview.selectAll(true),
  'select-none': () => overview.selectAll(false),
  'send-selected': (el) => overview.sendSelected(el as HTMLButtonElement),

  'dr-open': (_el, id) => dailyReport.openDrawer(id),
  'dr-pdf': (_el, id) => {
    const prefill = store.dailyReports.find((d) => d.rowId === id)?.driver ?? '';
    askSignature(
      'Cetak Surat Tugas / Daily Report',
      [
        { key: 'mengetahui', label: 'Mengetahui' },
        { key: 'driver', label: 'Driver / Operator', prefillName: prefill, required: true },
      ],
      (sigs) => dailyReport.printPdf(id, sigs),
    );
  },

  'cl-open': (_el, id) => clOpenDetail(id),
  'cl-print': (_el, id) => clPrintChecklist(id),

  'mr-request-open': (_el, id) => manpowerRequisitionPage.openDrawer(id),
  'mr-request-save': (_el, id) => manpowerRequisitionPage.save(id),
  'mr-request-delete': (_el, id) => manpowerRequisitionPage.remove(id),
  'mr-request-print': (_el, id) => manpowerRequisitionPage.printRequest(id),

  'mr-completion-open': (_el, id) => jobCompletionPage.openDrawer(id),
  'mr-completion-save': (_el, id) => jobCompletionPage.save(id),
  'mr-completion-delete': (_el, id) => jobCompletionPage.remove(id),
  'mr-completion-print': (_el, id) => jobCompletionPage.printRequest(id),
};
/* =====================================================
   ROUTER
   ===================================================== */

let current: PageKey = 'overview';

function pageKeyFromHash(): PageKey {
  const key = (location.hash.replace(/^#\/?/, '').split('?')[0] ?? '') as PageKey;
  return key in PAGES ? key : 'overview';
}

function renderNav(): void {
  must('nav').innerHTML = NAV_SECTIONS
    .map((section) => `<div class="pt-2 first:pt-0">
      <div class="px-3 pb-1.5 pt-2 text-[10px] font-extrabold tracking-[0.16em] text-surface-400">${esc(section.label)}</div>
      <div class="space-y-1">
        ${section.pages.map((key) => {
          const page = PAGES[key];
          const active = key === current;
          return `<button class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
            active
              ? 'bg-primary-50 font-semibold text-primary-600 shadow-sm'
              : 'font-medium text-surface-600 hover:bg-surface-100 hover:text-surface-900'
          }" data-page="${key}">${icon(page.icon, 'w-[18px] h-[18px]')} <span>${esc(page.title)}</span></button>`;
        }).join('')}
      </div>
    </div>`)
    .join('');
}

function render(key: PageKey): void {
  current = key;
  const page = PAGES[key];

  renderNav();
  must('title').textContent = page.title;
  must('page').innerHTML = page.html();
  wireInputs(page);
  void page.mount?.();
}

function go(key: PageKey): void {
  if (pageKeyFromHash() === key) render(key);
  else location.hash = key;
}

function toggleSidebar(force?: boolean): void {
  const bar = $('sidebar');
  const scrim = $('scrim');
  if (!bar || !scrim) return;

  const hidden = bar.classList.contains('-translate-x-full');
  const open = force === undefined ? hidden : !force;
  bar.classList.toggle('-translate-x-full', !open);
  scrim.classList.toggle('hidden', !open);
}

function wireInputs(page: Page): void {
  for (const id of ['q', 'inv-q', 'mail-q', 'dr-q', 'mr-search', 'mc-search']) {
    $(id)?.addEventListener('input', () => page.onSearchInput?.());
  }
  for (const id of ['filter-status', 'filter-dept', 'inv-status', 'dr-status']) {
    $(id)?.addEventListener('change', () => page.onFilterChange?.());
  }
}

/* =====================================================
   BOOT
   ===================================================== */

async function refreshAll(): Promise<void> {
  invalidateAll();
  if (current === 'manpower-requisition' || current === 'job-completion') {
    await PAGES[current].mount?.();
    return;
  }
  try {
    const boot = await api.bootstrap();
    store.stats = boot.stats;
    store.departments = boot.departments;
    store.missingFields = boot.missingFields;
    store.itemColumns = boot.itemColumns;
    store.ready = true;
    renderNotice(boot.missingFields);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 'error');
    throw error;
  }
  await PAGES[current].mount?.();
}

function renderNotice(missing: string[]): void {
  const el = $('notice');
  if (!el) return;
  if (!missing.length) {
    el.classList.add('hidden');
    return;
  }
  el.innerHTML =
    `Kolom ini tidak ditemukan di spreadsheet, jadi tidak bisa disimpan: <b>${esc(missing.join(', '))}</b>. ` +
    `Cek judul kolom di baris 1 spreadsheet, atau lihat bagian "Pemetaan Kolom" di Code.gs.`;
  el.classList.remove('hidden');
}

function delegate(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  const pageBtn = target.closest<HTMLElement>('[data-page]');
  if (pageBtn && pageBtn.dataset.page) {
    go(pageBtn.dataset.page as PageKey);
    return;
  }

  const el = target.closest<HTMLElement>('[data-action]');
  if (el) {
    const handler = ACTIONS[el.dataset.action ?? ''];
    if (handler) {
      const res = handler(el, Number(el.dataset.id ?? 0));
      if (res && typeof (res as any).then === 'function') {
        const ov = $('loading');
        ov?.classList.remove('hidden');
        (res as Promise<any>).finally(() => ov?.classList.add('hidden'));
      }
    }
  }
}

async function boot(): Promise<void> {
  must('app').innerHTML = SHELL + PRINT_AREAS;

  document.addEventListener('click', delegate);
  document.addEventListener('change', delegate);
  window.addEventListener('hashchange', () => {
    const key = pageKeyFromHash();
    if (key !== current) render(key);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') drawer.close();
  });

  if (!location.hash) location.hash = 'overview';
  render(pageKeyFromHash());

  try {
    await refreshAll();
  } catch {
    // Pesan sudah ditampilkan lewat toast oleh refreshAll.
  }
}

void boot();