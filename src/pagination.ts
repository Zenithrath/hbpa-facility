/** Jumlah baris per halaman di semua daftar. */
export const PAGE_SIZE = 10;

export function totalPages(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function clampPage(page: number, total: number, size = PAGE_SIZE): number {
  return Math.min(Math.max(1, page), totalPages(total, size));
}

export function slicePage<T>(items: T[], page: number, size = PAGE_SIZE): T[] {
  const p = clampPage(page, items.length, size);
  const start = (p - 1) * size;
  return items.slice(start, start + size);
}

export function pagerHtml(id: string, page: number, total: number, size = PAGE_SIZE): string {
  const tp = totalPages(total, size);
  if (tp <= 1) return '';
  return (
    `<div class="flex items-center justify-center gap-2 mt-3" id="${id}">` +
    `<button type="button" data-pager="prev" class="btn-slate px-3 py-1.5 text-xs"${page <= 1 ? ' disabled' : ''}>Sebelumnya</button>` +
    `<span class="text-xs text-surface-500">Halaman ${page} / ${tp}</span>` +
    `<button type="button" data-pager="next" class="btn-slate px-3 py-1.5 text-xs"${page >= tp ? ' disabled' : ''}>Berikutnya</button>` +
    `</div>`
  );
}

/** Pasang handler klik pada pager yang baru dirender. */
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