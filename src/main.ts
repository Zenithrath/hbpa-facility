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
import { $, drawer, esc, field$, icon, must, toast } from './ui';
import * as overview from './pages/overview';
import * as transport from './pages/transport';
import * as inventaris from './pages/inventaris';

/* =====================================================
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
        <select id="f-status" class="field w-auto text-xs font-semibold">
          <option value="">Semua Status</option>
          <option value="Pending">Pending</option>
          <option value="Disetujui">Disetujui</option>
          <option value="Ditolak">Ditolak</option>
          <option value="Selesai">Selesai</option>
        </select>
        <select id="f-dept" class="field w-auto text-xs font-semibold"></select>
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
                <th class="px-4 py-3.5 whitespace-nowrap">Status</th>
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

const PAGES = {
  overview: OVERVIEW,
  transport: TRANSPORT_PAGE,
  inventaris: INVENTARIS_PAGE,
} as const;

type PageKey = keyof typeof PAGES;

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
        <td style="width:50%"><strong>Disetujui,</strong><br><br><br><br>(.......................................)<br>
          <span style="font-size:8pt;font-style:italic">(Facility Department)</span></td>
        <td style="width:50%"><strong>Pemohon,</strong><br><br><br><br>(.......................................)</td>
      </tr>
    </table>
    <table class="w-full italic" style="margin-top:15px;font-size:7.5pt">
      <tr><td>FM-FCL-02.01</td><td class="text-right">Rev : 02 (080617)</td></tr>
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
        <td style="width:33%">Peminjam,<br><br><br><br>(.......................)</td>
        <td style="width:34%">Mengetahui,<br><br><br><br>(.......................)</td>
        <td style="width:33%">Menyetujui,<br><br><br><br>(.......................)</td>
      </tr>
    </table>
  </div>
</div>`;

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
  print: (el, id) => transport.printRow(id, el.dataset.from === 'drawer'),
  email: (el, id) => transport.email([id], el as HTMLButtonElement),
  delete: (_el, id) => transport.remove(id),

  'inv-open': (_el, id) => inventaris.openDrawer(id),
  'inv-save': (_el, id) => inventaris.save(id),
  'inv-print': (_el, id) => inventaris.printRow(id),
  'inv-all-good': () => inventaris.setAllGood(),
  'inv-status': (el) => inventaris.onStatusChange(el as HTMLSelectElement),

  pick: (el, id) => overview.toggle(id, (el as HTMLInputElement).checked),
  'select-all': () => overview.selectAll(true),
  'select-none': () => overview.selectAll(false),
  'send-selected': (el) => overview.sendSelected(el as HTMLButtonElement),
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
  must('nav').innerHTML = (Object.keys(PAGES) as PageKey[])
    .map((key) => {
      const page = PAGES[key];
      const active = key === current;
      return `<button class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? 'bg-primary-50 font-semibold text-primary-600 shadow-sm'
          : 'font-medium text-surface-600 hover:bg-surface-100 hover:text-surface-900'
      }" data-page="${key}">${icon(page.icon, 'w-[18px] h-[18px]')} <span>${esc(page.title)}</span></button>`;
    })
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
  for (const id of ['q', 'inv-q', 'mail-q']) {
    $(id)?.addEventListener('input', () => page.onSearchInput?.());
  }
  for (const id of ['f-status', 'f-dept', 'inv-status']) {
    $(id)?.addEventListener('change', () => page.onFilterChange?.());
  }
}

/* =====================================================
   BOOT
   ===================================================== */

async function refreshAll(): Promise<void> {
  invalidateAll();
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
    if (handler) void handler(el, Number(el.dataset.id ?? 0));
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