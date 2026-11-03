/**
 * Factory untuk halaman daftar MANPOWER.
 *
 * Dua modul (Manpower Requisition dan Job Completion) punya struktur yang
 * sama: tabel, pencarian, drawer edit, hapus, dan cetak. Bedanya hanya skema
 * field, renderer, dan signature print.
 */

import { drawer, esc, askSignature, must, toast, type Signatures, type SignatureSlot } from '../ui';

export interface ManpowerRow {
  rowId: number;
  sig: string;
}

export interface ManpowerPageOptions<T extends ManpowerRow> {
  title: string;
  icon: string;
  description: string;
  searchPlaceholder: string;
  searchId: string;
  countId: string;
  tableId: string;
  columns: Array<{ label: string; className?: string }>;
  distribute: (items: T[]) => void;
  list: () => Promise<T[]>;
  get: (rowId: number) => Promise<T>;
  save: (rowId: number, sig: string, patch: Record<string, string>) => Promise<T>;
  remove: (rowId: number, sig: string) => Promise<{ deleted: boolean }>;
  renderRow: (item: T) => string;
  renderCard: (item: T) => string;
  patchFromDrawer: () => Record<string, string>;
  drawerTitle: (item: T) => string;
  drawerBody: (item: T) => string;
  drawerFooter: (item: T) => string;
  signatureSlots: (item: T) => SignatureSlot[];
  signatureTitle: string;
  print: (item: T, signatures: Signatures) => void;
}

export interface ManpowerPage {
  title: string;
  icon: string;
  html(): string;
  mount(): void;
  onSearchInput(): void;
  openDrawer(rowId: number): void;
  save(rowId: number): Promise<void>;
  remove(rowId: number): Promise<void>;
  print(rowId: number, signatures: Signatures): void;
  printRequest(rowId: number): void;
  refresh(): Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createManpowerPage<T extends ManpowerRow>(options: ManpowerPageOptions<T>): ManpowerPage {
  const state = { items: [] as T[], filtered: [] as T[] };

  function renderRows(): void {
    const q = ((document.getElementById(options.searchId) as HTMLInputElement | null)?.value ?? '').trim().toLowerCase();
    state.filtered = q
      ? state.items.filter((item) => JSON.stringify(item).toLowerCase().includes(q))
      : state.items.slice();

    const tbody = must<HTMLTableSectionElement>(options.tableId);
    const cards = document.getElementById(`${options.tableId}-cards`);
    const count = must<HTMLElement>(options.countId);

    count.textContent = `${state.filtered.length} dari ${state.items.length} data`;
    tbody.innerHTML = state.filtered.length
      ? state.filtered.map(options.renderRow).join('')
      : `<tr><td colspan="${options.columns.length}" class="px-4 py-10 text-center text-sm text-surface-400">Data tidak ditemukan.</td></tr>`;
    if (cards) {
      cards.innerHTML = state.filtered.length
        ? state.filtered.map(options.renderCard).join('')
        : '<div class="card p-6 text-center text-sm text-surface-400">Data tidak ditemukan.</div>';
    }
  }

  async function refresh(): Promise<void> {
    const tbody = must<HTMLTableSectionElement>(options.tableId);
    tbody.innerHTML = `<tr><td colspan="${options.columns.length}" class="px-4 py-10 text-center text-sm text-surface-400">Memuat data...</td></tr>`;
    const cards = document.getElementById(`${options.tableId}-cards`);
    if (cards) cards.innerHTML = '<div class="card p-6 text-center text-sm text-surface-400">Memuat data...</div>';

    try {
      state.items = await options.list();
      options.distribute(state.items);
      renderRows();
    } catch (error) {
      const text = message(error);
      tbody.innerHTML = `<tr><td colspan="${options.columns.length}" class="px-4 py-10 text-center text-sm text-red-600">${esc(text)}</td></tr>`;
      if (cards) cards.innerHTML = `<div class="card border-red-200 bg-red-50 p-6 text-sm text-red-700">${esc(text)}</div>`;
      toast(text, 'error');
    }
  }

  function openDrawer(rowId: number): void {
    const item = state.items.find((row) => row.rowId === rowId);
    if (!item) {
      toast('Data belum dimuat ulang. Klik Refresh terlebih dahulu.', 'error');
      return;
    }
    drawer.open({
      title: options.drawerTitle(item),
      body: options.drawerBody(item),
      footer: options.drawerFooter(item),
    });
  }

  async function save(rowId: number): Promise<void> {
    const item = state.items.find((row) => row.rowId === rowId);
    if (!item) {
      toast('Data belum dimuat ulang. Klik Refresh terlebih dahulu.', 'error');
      return;
    }
    try {
      await options.save(item.rowId, item.sig, options.patchFromDrawer());
      toast('Perubahan tersimpan.');
      drawer.close();
      await refresh();
    } catch (error) {
      toast(message(error), 'error');
    }
  }

  async function remove(rowId: number): Promise<void> {
    const item = state.items.find((row) => row.rowId === rowId);
    if (!item) {
      toast('Data belum dimuat ulang. Klik Refresh terlebih dahulu.', 'error');
      return;
    }
    if (!confirm('Hapus data ini secara permanen dari spreadsheet?')) return;
    try {
      await options.remove(item.rowId, item.sig);
      toast('Data dihapus.');
      drawer.close();
      await refresh();
    } catch (error) {
      toast(message(error), 'error');
    }
  }

  function printItem(rowId: number, signatures: Signatures): void {
    const item = state.items.find((row) => row.rowId === rowId);
    if (!item) {
      toast('Data belum dimuat ulang. Klik Refresh terlebih dahulu.', 'error');
      return;
    }
    options.print(item, signatures);
  }

  function printRequest(rowId: number): void {
    const item = state.items.find((row) => row.rowId === rowId);
    if (!item) {
      toast('Data belum dimuat ulang. Klik Refresh terlebih dahulu.', 'error');
      return;
    }
    askSignature(options.signatureTitle, options.signatureSlots(item), (sigs) => options.print(item, sigs));
  }

  return {
    title: options.title,
    icon: options.icon,
    html() {
      return `<div class="space-y-4">
        <div class="card p-4 sm:p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 class="text-base font-bold">${esc(options.title)}</h3>
              <p class="mt-0.5 text-xs text-surface-500">${esc(options.description)}</p>
            </div>
            <button class="btn-slate px-3 py-2" data-action="refresh-all">${esc('Refresh Data')}</button>
          </div>
          <div class="relative mt-4">
            <svg class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
            <input id="${esc(options.searchId)}" type="search" class="field pl-10" placeholder="${esc(options.searchPlaceholder)}" autocomplete="off">
          </div>
        </div>

        <div class="card overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-100 px-4 py-3 sm:px-6">
            <div class="text-xs font-semibold text-surface-500"><span id="${esc(options.countId)}">0 data</span></div>
            <div class="text-[11px] text-surface-400">Klik baris atau tombol Detail untuk membuka</div>
          </div>
          <div class="hidden overflow-x-auto md:block">
            <table class="w-full min-w-[980px] text-left">
              <thead class="bg-surface-50 text-[11px] uppercase tracking-wider text-surface-500">
                <tr>${options.columns.map((column) => `<th class="${esc(column.className ?? 'px-4 py-3.5 whitespace-nowrap')}">${esc(column.label)}</th>`).join('')}</tr>
              </thead>
              <tbody id="${esc(options.tableId)}"></tbody>
            </table>
          </div>
          <div id="${esc(options.tableId)}-cards" class="grid gap-3 p-4 md:hidden"></div>
        </div>
      </div>`;
    },
    mount() {
      void refresh();
    },
    onSearchInput() {
      renderRows();
    },
    openDrawer,
    save,
    remove,
    print: printItem,
    printRequest,
    refresh,
  };
}
