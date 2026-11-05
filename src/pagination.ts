/** Jumlah baris yang dirender dalam satu "halaman" virtual. */
export const PAGE_SIZE = 10;

/** Tinggi baris tabel (px) — disamakan di semua tabel agar virtualisasi stabil. */
export const ROW_HEIGHT = 56;

/** Virtualisasi: hanya render ±10 baris yang terlihat, DOM tetap ringan. */
export function virtualize<T>(
  items: T[],
  startIndex: number,
  opts: { itemHeight?: number; overscan?: number } = {},
): { start: number; items: T[] } {
  const itemHeight = opts.itemHeight ?? 56;
  const overscan = opts.overscan ?? 8;
  const viewportH =
    typeof window !== 'undefined'
      ? (window.document.querySelector('.overflow-x-auto')?.clientHeight ?? window.innerHeight * 0.7)
      : 600;
  const visibleCount = Math.max(1, Math.ceil(viewportH / itemHeight));
  const start = Math.max(0, startIndex - overscan);
  const end = Math.min(items.length, start + visibleCount + overscan * 2);
  return { start, items: items.slice(start, end) };
}

/** Paginasi lama (masih dipakai; virtualisasi adalah inkrementalnya). */
export function clampPage(page: number, total: number, size = PAGE_SIZE): number {
  const tp = Math.max(1, Math.ceil(total / size));
  return Math.min(Math.max(1, page), tp);
}

export function slicePage<T>(items: T[], page: number, size = PAGE_SIZE): T[] {
  const p = clampPage(page, items.length, size);
  return items.slice((p - 1) * size, p * size);
}

export function pagerHtml(id: string, page: number, total: number, size = PAGE_SIZE): string {
  const tp = Math.max(1, Math.ceil(total / size));
  if (tp <= 1) return '';
  return (
    `<div class="flex items-center justify-center gap-2 mt-3" id="${id}">` +
    `<button type="button" data-pager="prev" class="btn-slate px-3 py-1.5 text-xs"${page <= 1 ? ' disabled' : ''}>Sebelumnya</button>` +
    `<span class="text-xs text-surface-500">Halaman ${page} / ${tp}</span>` +
    `<button type="button" data-pager="next" class="btn-slate px-3 py-1.5 text-xs"${page >= tp ? ' disabled' : ''}>Berikutnya</button>` +
    `</div>`
  );
}

export function bindPager(id: string, onPrev: () => void, onNext: () => void): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.onclick = (event) => {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest<HTMLElement>('[data-pager]');
    if (!btn) return;
    if (btn.dataset.pager === 'prev') onPrev();
    else if (btn.dataset.pager === 'next') onNext();
  };
}

