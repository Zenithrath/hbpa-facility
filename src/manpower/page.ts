/**
 * Factory untuk halaman daftar MANPOWER.
 *
 * Dua modul (Manpower Requisition dan Job Completion) punya struktur yang
 * sama: tabel, pencarian, drawer edit, hapus, dan cetak. Bedanya hanya skema
 * field, renderer, dan signature print.
 */

import {
  actionBtn,
  askSignature,
  drawer,
  emptyCard,
  emptyRow,
  esc,
  loadingCard,
  loadingRow,
  MSG,
  searchBar,
  toast,
  tableHead,
  type Signatures,
  type SignatureSlot,
} from '../ui';
import { PAGE_SIZE, clampPage, slicePage, pagerHtml, bindPager } from '../pagination';

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
  create?: (patch: Record<string, string>) => Promise<T>;
  blankItem: () => T;
  remove: (rowId: number, sig: string) => Promise<{ deleted: boolean }>;
  renderRow: (item: T) => string;
  renderCard: (item: T) => string;
  patchFromDrawer: () => Record<string, string>;
  drawerTitle: (item: T) => string;
  drawerBody: (item: T) => string;
  drawerFooter: (item: T) => string;
  /** 'a5' = pas lembar A5, 'xl' = panel lebar untuk lembar A4. */
  drawerSize?: 'md' | 'a5' | 'xl';
  /** Dipanggil setelah isi drawer dirender, mis. memasang batas ukuran kertas. */
  afterOpen?: (item: T) => void;
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
  openAdd(): void;
  save(rowId: number): Promise<void>;
  saveNew(): Promise<void>;
  remove(rowId: number): Promise<void>;
  print(rowId: number, signatures: Signatures): void;
  printRequest(rowId: number): void;
  refresh(): Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createManpowerPage<T extends ManpowerRow>(options: ManpowerPageOptions<T>): ManpowerPage {
  const state = { items: [] as T[], filtered: [] as T[], page: 1 };

  /** Elemen halaman ini, atau null kalau user sudah pindah halaman. */
  function pageEls(): { tbody: HTMLTableSectionElement; cards: HTMLElement | null; count: HTMLElement } | null {
    const tbody = document.getElementById(options.tableId) as HTMLTableSectionElement | null;
    const count = document.getElementById(options.countId);
    if (!tbody || !count) return null;
    return { tbody, count, cards: document.getElementById(`${options.tableId}-cards`) };
  }

  function renderRows(): void {
    // Data bisa datang setelah halaman berganti; jangan sentuh DOM halaman lain.
    const els = pageEls();
    if (!els) return;
    const { tbody, cards, count } = els;

    const q = ((document.getElementById(options.searchId) as HTMLInputElement | null)?.value ?? '').trim().toLowerCase();
    state.filtered = (q
      ? state.items.filter((item) => JSON.stringify(item).toLowerCase().includes(q))
      : state.items.slice()
    ).slice().sort((a, b) => b.rowId - a.rowId);

    state.page = clampPage(state.page, state.filtered.length);
    const pageItems = slicePage(state.filtered, state.page);

    count.textContent = `${state.filtered.length} dari ${state.items.length} data`;
    const colCount = options.columns.length + 1;
    tbody.innerHTML = pageItems.length
      ? pageItems
          .map((item, i) => {
            const no = (state.page - 1) * PAGE_SIZE + i + 1;
            const row = options.renderRow(item);
            return row.replace(/^<tr([^>]*)>/, `<tr$1><td class="px-4 py-3 text-sm text-center text-surface-500">${no}</td>`);
          })
          .join('')
      : emptyRow(colCount, 'Data tidak ditemukan.');
    if (cards) {
      cards.innerHTML = pageItems.length
        ? pageItems.map(options.renderCard).join('')
        : emptyCard('Data tidak ditemukan.');
    }
    const pager = document.getElementById(`${options.tableId}-pager`);
    if (pager) {
      pager.innerHTML = pagerHtml(`${options.tableId}-pager-inner`, state.page, state.filtered.length);
      bindPager(`${options.tableId}-pager-inner`, () => { state.page--; renderRows(); }, () => { state.page++; renderRows(); });
    }
  }

  async function refresh(): Promise<void> {
    const start = pageEls();
    if (!start) return;
    start.tbody.innerHTML = loadingRow(options.columns.length + 1);
    if (start.cards) start.cards.innerHTML = loadingCard();

    try {
      state.items = await options.list();
      options.distribute(state.items);
      state.page = 1;
      renderRows();
    } catch (error) {
      const text = message(error);
      const els = pageEls();
      if (!els) return;
      els.tbody.innerHTML = emptyRow(options.columns.length + 1, text);
      if (els.cards) els.cards.innerHTML = emptyCard(text);
      toast(text, 'error');
    }
  }

  function openDrawer(rowId: number): void {
    const item = state.items.find((row) => row.rowId === rowId);
    if (!item) {
      toast(MSG.notLoaded, 'error');
      return;
    }
    drawer.open({
      title: options.drawerTitle(item),
      body: options.drawerBody(item),
      footer: options.drawerFooter(item),
      size: options.drawerSize ?? 'md',
    });
    options.afterOpen?.(item);
  }

  function openAdd(): void {
    const blank = options.blankItem();
    drawer.open({
      title: options.drawerTitle(blank).replace(/— .*$/, '— Baru'),
      body: options.drawerBody(blank),
      footer: `
        <button class="btn-slate px-4 py-2" type="button" data-action="close-drawer">Batal</button>
        <div class="flex flex-wrap gap-2">
          ${actionBtn('save-new')}
        </div>`,
      size: options.drawerSize ?? 'md',
    });
    options.afterOpen?.(blank);
  }

  async function save(rowId: number): Promise<void> {
    const item = state.items.find((row) => row.rowId === rowId);
    if (!item) {
      toast(MSG.notLoaded, 'error');
      return;
    }
    try {
      toast(MSG.saving);
      await options.save(item.rowId, item.sig, options.patchFromDrawer());
      toast(MSG.saved);
      drawer.close();
      await refresh();
    } catch (error) {
      toast(message(error), 'error');
    }
  }

  async function saveNew(): Promise<void> {
    if (!options.create) {
      toast('Create belum tersedia untuk halaman ini.', 'error');
      return;
    }
    try {
      toast(MSG.saving);
      await options.create(options.patchFromDrawer());
      toast(MSG.saved);
      drawer.close();
      await refresh();
    } catch (error) {
      toast(message(error), 'error');
    }
  }

  async function remove(rowId: number): Promise<void> {
    const item = state.items.find((row) => row.rowId === rowId);
    if (!item) {
      toast(MSG.notLoaded, 'error');
      return;
    }
    if (!confirm('Hapus data ini secara permanen dari spreadsheet?')) return;
    try {
      await options.remove(item.rowId, item.sig);
      toast(MSG.deleted);
      drawer.close();
      await refresh();
    } catch (error) {
      toast(message(error), 'error');
    }
  }

  function printItem(rowId: number, signatures: Signatures): void {
    const item = state.items.find((row) => row.rowId === rowId);
    if (!item) {
      toast(MSG.notLoaded, 'error');
      return;
    }
    options.print(item, signatures);
  }

  function printRequest(rowId: number): void {
    const item = state.items.find((row) => row.rowId === rowId);
    if (!item) {
      toast(MSG.notLoaded, 'error');
      return;
    }
    askSignature(options.signatureTitle, options.signatureSlots(item), (sigs) => options.print(item, sigs));
  }

  return {
    title: options.title,
    icon: options.icon,
    html() {
      return `<div class="space-y-4">
        <div class="card flex flex-col gap-3 p-4 sm:flex-row">
          ${searchBar({ id: options.searchId, placeholder: options.searchPlaceholder, extra: 'flex-1' })}
          ${actionBtn('add', { extra: 'shrink-0 justify-center' })}
        </div>

        <p class="text-[11px] text-surface-400"><span id="${esc(options.countId)}">0 data</span> · ${esc(options.description)}</p>

        <div id="${esc(options.tableId)}-cards" class="space-y-3 md:hidden"></div>

        <div class="card hidden overflow-hidden md:block">
          <div class="overflow-x-auto">
            <table class="table min-w-[760px]">
              <thead>${tableHead([{ label: 'No.', className: 'w-12 text-center' }, ...options.columns])}</thead>
              <tbody id="${esc(options.tableId)}"></tbody>
            </table>
          </div>
        </div>
        <div id="${esc(options.tableId)}-pager" class="mt-2"></div>
      </div>`;
    },
    mount() {
      void refresh();
    },
    onSearchInput() {
      state.page = 1;
      renderRows();
    },
    openDrawer,
    openAdd,
    save,
    saveNew,
    remove,
    print: printItem,
    printRequest,
    refresh,
  };
}
