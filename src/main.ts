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
import {
  $,
  actionBtn,
  askSignature,
  drawer,
  esc,
  icon,
  must,
  searchBar,
  setPageLoading,
  tableHead,
  toast,
} from './ui';

import * as transport from './pages/transport';
import * as inventaris from './pages/inventaris';
import * as dailyReport from './pages/daily-report';
import {
  checklistListPage,
  openDetail as clOpenDetail,
  printChecklist as clPrintChecklist,
  remove as clRemove,
  saveEdit as clSaveEdit,
} from './pages/checklist-list';
import { manpowerRequisitionPage } from './manpower/requisition';
import { jobCompletionPage } from './manpower/completion';
import { jcSheetHtml } from './manpower/completion-sheet';

/*****************************************************************
   TEMPLATE
   ===================================================== */

const SHELL = `
<aside id="sidebar"
  class="no-print fixed top-0 left-0 z-40 h-full w-64 -translate-x-full border-r border-surface-200 bg-white transition-transform duration-200 lg:translate-x-0">
  <div class="flex flex-col items-center gap-2 border-b border-surface-100 px-6 py-5 text-center">
    <img src="https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png" alt="Logo HBPA" class="h-12 w-auto shrink-0">
    <h1 class="text-sm leading-tight font-bold">${esc(CONFIG.APP_NAME)}</h1>
  </div>
  <nav id="nav" class="space-y-1 px-3 py-4"></nav>
</aside>

<div id="scrim" class="no-print fixed inset-0 z-30 hidden bg-black/30 lg:hidden" data-action="close-sidebar"></div>

<main class="lg:ml-64">
  <header class="no-print sticky top-0 z-20 border-b border-surface-100 bg-white px-4 py-3 sm:px-6">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <button class="rounded-lg p-2 text-surface-600 hover:bg-surface-100 lg:hidden" data-action="toggle-sidebar">
          ${icon('menu', 'w-5 h-5')}
        </button>
        <h2 id="title" class="text-lg font-bold"></h2>
      </div>
      ${actionBtn('refresh', { extra: 'px-3.5 py-2' })}
    </div>
  </header>

  <div id="notice" class="mx-4 mt-4 hidden rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-6"></div>
  <div id="page" class="p-4 sm:p-6"></div>
</main>

<div id="drawer" class="no-print fixed inset-0 z-50 hidden">
  <div class="absolute inset-0 bg-black/40" data-action="close-drawer"></div>
  <div id="drawer-panel" class="absolute top-0 right-0 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
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
}

const TRANSPORT_PAGE: Page = {
  title: 'Transport Requests',
  icon: 'file',
  html: () => `
    <div class="space-y-4">
      <div class="card flex flex-col gap-3 p-4 sm:flex-row">
        ${searchBar({ id: 'q', placeholder: 'Cari nama, no., divisi, tujuan, plat...', extra: 'flex-1' })}
      </div>

      <p id="count" class="text-[11px] text-surface-400"></p>

      <div id="cards" class="space-y-3 md:hidden"></div>

      <div class="card hidden overflow-hidden md:block">
        <div class="overflow-x-auto">
          <table class="table">
            <thead id="thead"></thead>
            <tbody id="tbody"></tbody>
          </table>
        </div>
      </div>
      <div id="pager" class="mt-2"></div>
    </div>`,
  mount() {
    transport.renderHeader();
    void transport.refresh();
  },
  onSearchInput: () => { transport.resetPage(); transport.renderList(); },
};

const INVENTARIS_PAGE: Page = {
  title: 'Inventory Borrowing',
  icon: 'box',
  html: () => `
    <div class="space-y-4">
      <div id="inv-error" class="hidden rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"></div>

      <div class="card flex flex-col gap-3 p-4 sm:flex-row">
        ${searchBar({ id: 'inv-q', placeholder: 'Cari nama, no. dokumen, kontak, atau barang...', extra: 'flex-1' })}
      </div>

      <p id="inv-count" class="text-[11px] text-surface-400"></p>

      <div id="inv-cards" class="space-y-3 md:hidden"></div>

      <div class="card hidden overflow-hidden md:block">
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              ${tableHead([
                { label: 'No.', className: 'w-12 text-center' },
                { label: 'No. Dokumen' },
                { label: 'Nama' },
                { label: 'Kontak' },
                { label: 'Barang', className: 'min-w-56' },
                { label: 'Tgl Pinjam' },
                { label: 'Rencana Kembali' },
                { label: 'Keperluan', className: 'min-w-40' },
                { label: 'Status' },
                { label: 'Tgl Kembali Aktual' },
                { label: 'Aksi', className: 'text-right' },
              ])}
            </thead>
            <tbody id="inv-tbody"></tbody>
          </table>
        </div>
      </div>
      <div id="inv-pager" class="mt-2"></div>
    </div>`,
  mount() {
    void inventaris.refresh();
  },
  onSearchInput: () => { inventaris.resetPage(); inventaris.renderList(); },
};

const DAILY_REPORT_PAGE: Page = {
  title: 'Assignment Letter / Daily Report',
  icon: 'file',
  html: () => `
    <div class="space-y-4">
      <div class="card flex flex-col gap-3 p-4 sm:flex-row">
        ${searchBar({ id: 'dr-q', placeholder: 'Cari driver, tanggal, no. plat, atau uraian...', extra: 'flex-1' })}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <p id="dr-count" class="text-[11px] text-surface-400"></p>
        <p class="text-[11px] text-surface-400">Input lewat Google Form · PDF dicetak dari dashboard.</p>
      </div>

      <div id="dr-cards" class="space-y-3 md:hidden"></div>

      <div class="card hidden overflow-hidden md:block">
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              ${tableHead([
                { label: 'No.', className: 'w-12 text-center' },
                { label: 'No. Dokumen' },
                { label: 'Hari / Tanggal' },
                { label: 'Driver' },
                { label: 'No. Plat' },
                { label: 'Uraian', className: 'min-w-48' },
                { label: 'Aksi', className: 'text-right' },
              ])}
            </thead>
            <tbody id="dr-tbody"></tbody>
          </table>
        </div>
      </div>
      <div id="dr-pager" class="mt-2"></div>
    </div>`,
  mount() {
    void dailyReport.refresh();
  },
  onSearchInput: () => { dailyReport.resetPage(); dailyReport.renderList(); },
};

const PAGES = {
  transport: TRANSPORT_PAGE,
  inventaris: INVENTARIS_PAGE,
  daily: DAILY_REPORT_PAGE,
  'checklist-list': checklistListPage,
  'manpower-requisition': manpowerRequisitionPage,
  'job-completion': jobCompletionPage,
} as const;

type PageKey = keyof typeof PAGES;

const NAV_SECTIONS = [
  { label: 'PEMINJAMAN', pages: ['transport', 'inventaris', 'daily', 'checklist-list'] },
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
    .mpr-paper{box-sizing:border-box;width:100%;height:205mm;background:#fff;color:#000;font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:8.5pt;padding:6mm 0 0;border:1.2pt solid #000;display:flex;flex-direction:column;overflow:hidden;break-inside:avoid;page-break-inside:avoid;}
    .mpr-paper *{box-sizing:inherit}
    /* Sama seperti .content-pad di drawer: isi yang kepanjangan dipotong di
       sini, sehingga kolom tanda tangan tetap di bawah dan tidak terdorong. */
    .mpr-body{flex:1 1 auto;min-height:0;overflow:hidden;padding:0 7mm}
    .mpr-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:9mm;margin-bottom:7mm}
    .mpr-logo img{height:8.5mm;width:auto;max-width:26mm;object-fit:contain}
    .mpr-title{text-align:center;white-space:nowrap;font-size:11pt;font-weight:800;text-decoration:underline;text-underline-offset:0.8mm}
    .mpr-info{display:grid;grid-template-columns:36mm 2mm 1fr;row-gap:2.4mm;margin:2mm 0 0 2mm;align-items:end}
    .mpr-label{font-size:8pt;font-weight:800;text-transform:uppercase}
    .mpr-line{display:block;min-height:1.35em;padding:0 1mm;border-bottom:1px dotted #000;line-height:1.3}
    .mpr-outline-title{margin:4mm 0 1.6mm 2mm;font-size:8pt;font-weight:800;text-transform:uppercase}
    .mpr-outline{display:grid;grid-template-columns:6mm 1fr;row-gap:1.4mm;margin:0 0 0 1mm;align-items:start}
    .mpr-outline .no{text-align:right;padding-right:1mm;font-weight:700;line-height:1.16;margin-top:.1mm}
    .mpr-outline .line{min-height:3.4mm;display:block;border-bottom:1px dotted #000;padding:0 1mm .05mm;line-height:1.16;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
    .mpr-approval{display:grid;grid-template-columns:repeat(3,1fr);border-top:1.2pt solid #000;flex:0 0 auto}
    .mpr-approval .col{border-right:1.2pt solid #000;display:flex;flex-direction:column;min-width:0}
    .mpr-approval .col:last-child{border-right:0}
    .mpr-approval .hd{text-align:center;font-weight:800;height:5.6mm;line-height:5.6mm;border-bottom:1.2pt solid #000;font-size:8pt}
    .mpr-approval .box{height:16mm;display:flex;align-items:center;justify-content:center;padding:1mm;overflow:hidden}
    .mpr-approval .box img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}
    .mpr-approval .nm{border-top:1.2pt solid #000;padding:0.6mm 1.2mm 0.8mm;line-height:4.6mm;font-size:7.6pt}
    .mpr-approval .inline-line{display:inline-block;min-width:55%;border-bottom:1px dotted #000;padding:0 1mm}
  </style>
  <main class="mpr-paper">
    <div class="mpr-body">
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
    </div>

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

<div id="print-job-completion" class="hidden">${jcSheetHtml({ withIds: true })}</div>

<div id="print-checklist" class="hidden"></div>
`;

/* =====================================================
   AKSI
   ===================================================== */

type Handler = (el: HTMLElement, id: number) => void | Promise<void>;

/** Aksi shell yang selalu ada, tidak bergantung halaman aktif. */
const GLOBAL_ACTIONS: Record<string, Handler> = {
  'toggle-sidebar': () => toggleSidebar(),
  'close-sidebar': () => toggleSidebar(true),
  'close-drawer': () => drawer.close(),
  'refresh-all': () => refreshAll(),
};

/**
 * Aksi per halaman. Namanya sama di semua halaman (lihat ActionVerb di ui.ts),
 * jadi `data-action="detail"` selalu membuka detail dan `"print"` selalu
 * mencetak. Handler dipilih dari halaman yang sedang aktif.
 */
const PAGE_ACTIONS: Record<PageKey, Record<string, Handler>> = {
  transport: {
    detail: (_el, id) => transport.openDrawer(id),
    save: (_el, id) => transport.save(id),
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
  },

  inventaris: {
  detail: (_el, id) => inventaris.openDrawer(id),
  save: (_el, id) => inventaris.save(id),
  delete: (_el, id) => inventaris.remove(id),
  print: (_el, id) => {
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
  'all-good': () => inventaris.setAllGood(),
  status: (el) => inventaris.onStatusChange(el as HTMLSelectElement),
  },

  daily: {
  detail: (_el, id) => dailyReport.openDrawer(id),
  save: (_el, id) => dailyReport.saveDrEdit(id),
  delete: (_el, id) => dailyReport.remove(id),
  'add-row': () => dailyReport.addDrRow(),
  print: (_el, id) => {
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

  },

  'checklist-list': {
  detail: (_el, id) => clOpenDetail(id),
  save: () => clSaveEdit(),
  delete: (_el, id) => clRemove(id),
  print: (_el, id) => clPrintChecklist(id),
  },

  'manpower-requisition': {
  detail: (_el, id) => manpowerRequisitionPage.openDrawer(id),
  save: (_el, id) => manpowerRequisitionPage.save(id),
  delete: (_el, id) => manpowerRequisitionPage.remove(id),
  print: (_el, id) => manpowerRequisitionPage.printRequest(id),
  // Opsi Required Manpower (Electrical/Civil/Mechanical) di dalam drawer.
  opt: (el) => {
    el.classList.toggle('sel');
  },
  },

  'job-completion': {
  detail: (_el, id) => jobCompletionPage.openDrawer(id),
  save: (_el, id) => jobCompletionPage.save(id),
  delete: (_el, id) => jobCompletionPage.remove(id),
  print: (_el, id) => jobCompletionPage.printRequest(id),
  },
};
/* =====================================================
   ROUTER
   ===================================================== */

let current: PageKey = 'transport';

function pageKeyFromHash(): PageKey {
  const key = (location.hash.replace(/^#\/?/, '').split('?')[0] ?? '') as PageKey;
  return key in PAGES ? key : 'transport';
}

function renderNav(): void {
  must('nav').innerHTML = NAV_SECTIONS
    .map((section) => `<div class="pt-2 first:pt-0">
      <div class="px-3 pb-1.5 pt-2 text-[10px] font-extrabold tracking-[0.16em] text-surface-400">${esc(section.label)}</div>
      <div class="space-y-1">
        ${section.pages.map((key) => {
          const page = PAGES[key];
          const active = key === current;
          return `<button class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
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
  for (const id of ['q', 'inv-q', 'dr-q', 'cl-q', 'mr-search', 'mc-search']) {
    $(id)?.addEventListener('input', () => page.onSearchInput?.());
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
    const verb = el.dataset.action ?? '';
    const handler = GLOBAL_ACTIONS[verb] ?? PAGE_ACTIONS[current][verb];
    if (handler) {
      const res = handler(el, Number(el.dataset.id ?? 0));
      if (res && typeof (res as any).then === 'function') {
        setPageLoading(true);
        (res as Promise<any>).finally(() => setPageLoading(false));
      }
    }
  }
}

/** Garis merah hilang begitu user mengetik kembali di kolom yang kosong. */
function clearInvalid(event: Event): void {
  const el = event.target as HTMLElement | null;
  if (el?.classList.contains('is-invalid')) el.classList.remove('is-invalid');
}

async function boot(): Promise<void> {
  must('app').innerHTML = SHELL + PRINT_AREAS;

  document.addEventListener('click', delegate);
  document.addEventListener('change', delegate);
  document.addEventListener('input', clearInvalid);
  window.addEventListener('hashchange', () => {
    const key = pageKeyFromHash();
    if (key !== current) render(key);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') drawer.close();
  });

  if (!location.hash) location.hash = 'transport';
  render(pageKeyFromHash());

  try {
    await refreshAll();
  } catch {
    // Pesan sudah ditampilkan lewat toast oleh refreshAll.
  }
}

void boot();