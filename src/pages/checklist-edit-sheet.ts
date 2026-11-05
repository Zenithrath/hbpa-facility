/**
 * checklist-edit-sheet.ts — Form edit Checklist Kendaraan di drawer.
 *
 * Tampilan mengikuti kertas A4 hasil cetak (checklist-paper.ts): posisi
 * header, gauge BBM, kolom item, gambar kendaraan, keterangan, dan kotak
 * tanda tangan sama persis. Bedanya, teks diganti input dan kotak item /
 * gambar bisa diklik langsung di atas kertas.
 */
import type { CkDamage, CkHeader, CkItem } from '../schema';
import { esc } from '../ui';
import { CAR_SVG } from './checklist-canvas';
import {
  CK_CAR_DEFS,
  CK_COLUMNS,
  CK_ITEMS,
  CK_ITEM_COL_TOP,
  CK_ITEM_ROW,
  CK_ITEM_WS,
  CK_ITEM_XS,
  CK_PAGE,
  CK_VIEW_LABEL_POS,
  gauge,
  hline,
  rect,
  text,
} from './checklist-paper';

export interface ChecklistListItem {
  rowId: number;
  noDok?: string;
  tanggal?: string;
  driver?: string;
  kendaraan?: string;
  keterangan?: string;
}

export interface ChecklistEditPayload {
  id: string;
  rowId: number;
  tanggal: string;
  counter: string;
  tipeMobil: string;
  driver: string;
  kendaraan: string;
  kilometer: string;
  bbmMasuk: string;
  bbmKeluar: string;
  keterangan: string;
  diperiksaOleh: string;
  status?: string;
  items: CkItem[];
  damages: CkDamage[];
}

export interface ChecklistEditorHandle {
  collect(): ChecklistEditPayload;
  destroy(): void;
  refit(): void;
}

const { W, H, R, T } = CK_PAGE;

const STATUS_CYCLE = ['', 'Baik', 'Rusak', 'Tidak Ada'] as const;
const STATUS_MARK: Record<string, string> = {
  Baik: '\u2713',
  Rusak: '\u00D7',
  'Tidak Ada': '\u2013',
};

const BBM_LEVELS = ['E', '1/4', '1/2', '3/4', 'F'] as const;
const BBM_DEG: Record<string, number> = { E: 180, '1/4': 135, '1/2': 90, '3/4': 45, F: 0 };
const GAUGE_W = 75;
const GAUGE_H = 80;

function num(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function headInput(id: string, value: string, x: number, y: number, w: number): string {
  return (
    `<input type="text" class="ce-head-input" id="${id}" value="${esc(value)}" ` +
    `style="left:${x}pt;top:${H - y - 10.5}pt;width:${w}pt" autocomplete="off">`
  );
}

function itemHtml(
  grup: string,
  name: string,
  x: number,
  xe: number,
  y: number,
  saved: { status: string; catatan: string } | undefined,
): string {
  const status = saved?.status || '';
  const catatan = saved?.catatan || '';
  const label = `${name}: ${status || 'belum diisi'}`;
  return (
    `<button type="button" class="ce-check" data-ce-check data-grup="${esc(grup)}" data-item="${esc(name)}" ` +
    `data-status="${esc(status)}" style="left:${x}pt;top:${H - y - 5}pt" ` +
    `aria-label="${esc(label)}" title="${esc(label)}">${STATUS_MARK[status] ?? ''}</button>` +
    `<span class="ce-item-name" style="left:${x + 13}pt;top:${H - y - 4.85}pt">${esc(name)}</span>` +
    `<input type="text" class="ce-item-note" data-ce-item-note data-grup="${esc(grup)}" data-item="${esc(name)}" ` +
    `value="${esc(catatan)}" aria-label="Catatan ${esc(name)}" ` +
    `style="left:${x + 74}pt;top:${H - y - 5.85}pt;width:${xe - 2 - (x + 74)}pt">`
  );
}

function buildItems(doc: CkHeader | undefined): Record<string, { status: string; catatan: string }> {
  const saved: Record<string, { status: string; catatan: string }> = {};
  for (const it of doc?.items || []) {
    saved[`${it.grup}|${it.item}`] = { status: it.status || '', catatan: it.catatan || '' };
  }
  return saved;
}

/** Render lembar A4 yang bisa diedit langsung. */
export function checklistEditorHtml(
  doc: CkHeader | undefined,
  item: ChecklistListItem | undefined,
): string {
  const d = doc;
  const tanggal = d?.tanggal || item?.tanggal || '';
  const driver = d?.driver || item?.driver || '';
  const keterangan = d?.keterangan || item?.keterangan || '';
  const nopol = d?.noPolisi || item?.kendaraan || '';
  const saved = buildItems(d);
  const y0 = T - 48;

  let html = `<div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
    <span class="text-surface-400">Klik kotak item untuk mengubah status; klik gambar kendaraan untuk menandai kerusakan.</span>
    <span id="ce-dirty" class="hidden font-semibold text-amber-600">Perubahan belum disimpan.</span>
  </div>`;
  html += `<div class="ce-wrap" id="ce-wrap"><div class="ce-frame" id="ce-frame"><div class="ck-paper ce-sheet" id="ce-sheet">`;

  // Bingkai dan judul, sama dengan kertas cetak.
  html += rect(CK_PAGE.L, CK_PAGE.B, R - CK_PAGE.L, T - CK_PAGE.B);
  html += text(
    W / 2,
    T - 20,
    'CHECKLIST PEMERIKSAAN & KELENGKAPAN KENDARAAN OPERASIONAL',
    10.5,
    true,
    'center',
  );

  html += `<input type="hidden" id="ce-id" value="${esc(d?.id || item?.noDok || '')}">`;
  html += `<input type="hidden" id="ce-status" value="${esc(d?.status || '')}">`;

  // Header identitas: label + garis tetap, input transparan di atas garis.
  ['Counter', 'Type Mobil', 'Driver'].forEach((lab, i) => {
    const y = y0 - i * 22;
    html += text(40, y, lab, 8);
    html += hline(100, 225, y - 2);
  });
  ['Tanggal', 'No. Polisi', 'Kilometer'].forEach((lab, i) => {
    const y = y0 - i * 22;
    html += text(240, y, lab, 8);
    html += hline(295, 395, y - 2);
  });

  html += headInput('ce-counter', d?.counter || '', 100, y0, 125);
  html += headInput('ce-tipe', d?.tipeMobil || '', 100, y0 - 22, 125);
  html += headInput('ce-driver', driver, 100, y0 - 44, 125);
  html += headInput('ce-tanggal', tanggal, 295, y0, 100);
  html += headInput('ce-kendaraan', nopol, 295, y0 - 22, 100);
  html += headInput('ce-km', d?.kilometer || '', 295, y0 - 44, 100);

  // Gauge BBM: gambar sama dengan cetak, ditambah area klik transparan.
  html += gauge(405, T - 114, GAUGE_W, GAUGE_H, 'MASUK', d?.bbmMasuk || '');
  html += gauge(487, T - 114, GAUGE_W, GAUGE_H, 'KELUAR', d?.bbmKeluar || '');
  html += `<button type="button" class="ce-gauge-hit" data-ce-gauge="masuk" style="left:405pt;top:${H - (T - 114 + GAUGE_H)}pt;width:${GAUGE_W}pt;height:${GAUGE_H}pt" title="Klik gauge untuk mengubah level BBM masuk" aria-label="Ubah level BBM masuk"></button>`;
  html += `<button type="button" class="ce-gauge-hit" data-ce-gauge="keluar" style="left:487pt;top:${H - (T - 114 + GAUGE_H)}pt;width:${GAUGE_W}pt;height:${GAUGE_H}pt" title="Klik gauge untuk mengubah level BBM keluar" aria-label="Ubah level BBM keluar"></button>`;

  html += `<input type="hidden" id="ce-bbmMasuk" value="${esc(d?.bbmMasuk || '')}">`;
  html += `<input type="hidden" id="ce-bbmKeluar" value="${esc(d?.bbmKeluar || '')}">`;

  // Item pemeriksaan: susunan kolom dan jarak baris sama dengan cetak.
  CK_COLUMNS.forEach((groups, ci) => {
    const x = CK_ITEM_XS[ci] as number;
    const xe = x + (CK_ITEM_WS[ci] as number);
    let y = CK_ITEM_COL_TOP;
    groups.forEach((grup) => {
      html += text(x, y - 2, grup, 8, true);
      y -= CK_ITEM_ROW;
      (CK_ITEMS[grup] || []).forEach((name) => {
        html += itemHtml(grup, name, x, xe, y, saved[`${grup}|${name}`]);
        y -= CK_ITEM_ROW;
      });
    });
  });

  // Gambar kendaraan: posisi sama dengan cetak, penanda ditambahkan lewat JS.
  CK_CAR_DEFS.forEach((car) => {
    const pos = CK_VIEW_LABEL_POS[car.label]!;
    html += text(pos.x, pos.y, car.label, 8, true, 'center');
    html += `<div class="ck-carwrap ce-car" data-ce-car="${esc(car.label)}" style="left:${car.x}pt;top:${H - car.yTop}pt;width:${car.w}pt">`;
    html += `<img class="ck-car" src="${CAR_SVG[car.label] ?? ''}" alt="${esc(car.label)}">`;
    html += `</div>`;
  });

  // Keterangan dan tanda tangan.
  html += text(36, 142, 'Keterangan', 8.5, true);
  html += rect(36, 40, R - 8 - 36, 98);
  html += `<textarea id="ce-keterangan" class="ce-textarea" style="left:40pt;top:${H - 134}pt;width:${R - 8 - 36 - 8}pt;height:90pt">${esc(keterangan)}</textarea>`;
  html += rect(430, 40, R - 8 - 430, 64);
  html += text(436, 96, 'Diperiksa Oleh,', 8, true);
  html += `<input type="text" id="ce-diperiksa" class="ce-head-input ce-sign-input" value="${esc(d?.diperiksaOleh || '')}" style="left:436pt;top:${H - 88}pt;width:${R - 8 - 430 - 8}pt" autocomplete="off">`;

  html += `</div></div></div>`;
  return html;
}

/**
 * Pasang interaksi form edit: klik kotak status, klik gambar untuk penanda,
 * klik gauge, dan penyesuaian skala kertas dengan lebar drawer.
 */
export function mountChecklistEditor(
  doc: CkHeader | undefined,
  item: ChecklistListItem | undefined,
  onChange?: () => void,
): ChecklistEditorHandle {
  const sheet = document.getElementById('ce-sheet');
  const wrap = document.getElementById('ce-wrap');
  const frame = document.getElementById('ce-frame');

  const empty = (): ChecklistEditPayload => ({
    id: doc?.id || item?.noDok || '',
    rowId: Number(doc?.rowId || item?.rowId || 0),
    tanggal: doc?.tanggal || item?.tanggal || '',
    counter: doc?.counter || '',
    tipeMobil: doc?.tipeMobil || '',
    driver: doc?.driver || item?.driver || '',
    kendaraan: doc?.noPolisi || item?.kendaraan || '',
    kilometer: doc?.kilometer || '',
    bbmMasuk: doc?.bbmMasuk || '',
    bbmKeluar: doc?.bbmKeluar || '',
    keterangan: doc?.keterangan || item?.keterangan || '',
    diperiksaOleh: doc?.diperiksaOleh || '',
    items: [],
    damages: [],
  });

  if (!sheet || !wrap || !frame) {
    return { collect: empty, destroy() {}, refit() {} };
  }

  const damages: CkDamage[] = (doc?.damages ?? []).map((mark) => ({
    ...mark,
    catatan: mark.catatan ?? '',
  }));
  let selected: number | null = null;

  const markDirty = (): void => onChange?.();

  const refit = (): void => {
    const avail = wrap.clientWidth;
    if (!avail) return;
    const naturalW = sheet.offsetWidth || 794;
    const naturalH = sheet.offsetHeight || 1123;
    // Jangan mengecilkan teks di bawah batas baca; sisa ruang bisa di-scroll.
    const scale = Math.min(1, Math.max(0.78, avail / naturalW));
    frame.style.width = `${Math.round(naturalW * scale)}px`;
    frame.style.height = `${Math.round(naturalH * scale)}px`;
    sheet.style.transformOrigin = 'top left';
    sheet.style.transform = `scale(${scale})`;
  };

  const needlePoint = (deg: number): { x1: number; y1: number; x2: number; y2: number } => {
    const cx = GAUGE_W / 2;
    const cy = (GAUGE_H - 14) / 2;
    const r = Math.min(GAUGE_W, GAUGE_H - 14) / 2 - 5;
    const a = (deg * Math.PI) / 180;
    return {
      x1: cx,
      y1: GAUGE_H - cy,
      x2: +(cx + (r - 4) * Math.cos(a)).toFixed(2),
      y2: +(GAUGE_H - (cy + (r - 4) * Math.sin(a))).toFixed(2),
    };
  };

  const applyGauge = (which: 'masuk' | 'keluar', level: string): void => {
    const input = sheet.querySelector<HTMLInputElement>(
      which === 'masuk' ? '#ce-bbmMasuk' : '#ce-bbmKeluar',
    );
    if (input) input.value = level;

    const svg = sheet.querySelector<SVGSVGElement>(
      `[data-ce-gauge-svg="${which === 'masuk' ? 'MASUK' : 'KELUAR'}"]`,
    );
    const needle = svg?.querySelector<SVGLineElement>('[data-ce-needle]');
    if (!needle) return;

    const deg = BBM_DEG[level];
    if (deg === undefined) {
      needle.style.display = 'none';
      return;
    }
    const p = needlePoint(deg);
    needle.setAttribute('x1', String(p.x1));
    needle.setAttribute('y1', String(p.y1));
    needle.setAttribute('x2', String(p.x2));
    needle.setAttribute('y2', String(p.y2));
    needle.style.display = '';
  };

  const gaugeLevelFromClick = (event: MouseEvent, hit: HTMLElement): string => {
    const box = hit.getBoundingClientRect();
    if (!box.width || !box.height) return '';
    const x = ((event.clientX - box.left) / box.width) * GAUGE_W;
    const y = ((event.clientY - box.top) / box.height) * GAUGE_H;
    const cx = GAUGE_W / 2;
    const cy = (GAUGE_H + 14) / 2;
    let angle = Math.atan2(cy - y, x - cx);
    if (angle < 0) angle = x < cx ? Math.PI : 0;
    const fraction = Math.max(0, Math.min(1, angle / Math.PI));
    const index = Math.round((1 - fraction) * (BBM_LEVELS.length - 1));
    return BBM_LEVELS[index] ?? '';
  };

  const renderMarks = (): void => {
    sheet.querySelectorAll<HTMLElement>('[data-ce-car]').forEach((car) => {
      car.querySelectorAll('.ce-mark, .ce-mark-note, .ce-mark-pop').forEach((el) => el.remove());
      const view = car.dataset.ceCar || '';
      let extra = '';

      damages.forEach((mark, index) => {
        if ((mark.view || '').toUpperCase() !== view) return;
        const active = index === selected ? ' is-selected' : '';
        extra +=
          `<button type="button" class="ce-mark${active}" data-ce-mark="${index}" ` +
          `style="left:${num(mark.x)}%;top:${num(mark.y)}%" ` +
          `title="Klik untuk mengubah catatan penanda">\u00D7</button>`;
        if (mark.catatan) {
          extra +=
            `<span class="ce-mark-note" style="left:${num(mark.x)}%;top:${num(mark.y + 4)}%">` +
            `${esc(mark.catatan)}</span>`;
        }
      });

      const activeMark = selected !== null ? damages[selected] : undefined;
      if (activeMark && (activeMark.view || '').toUpperCase() === view) {
        const align =
          activeMark.x > 70
            ? 'translate(-85%, 8pt)'
            : activeMark.x < 30
              ? 'translate(-15%, 8pt)'
              : 'translate(-50%, 8pt)';
        extra +=
          `<div class="ce-mark-pop" data-ce-pop style="left:${num(activeMark.x)}%;top:${num(activeMark.y)}%;transform:${align}">` +
          `<input type="text" class="ce-mark-note-input" data-ce-note-input value="${esc(activeMark.catatan)}" placeholder="Catatan kerusakan">` +
          `<div class="ce-mark-pop-actions">` +
          `<button type="button" data-ce-mark-delete>Hapus</button>` +
          `<button type="button" data-ce-mark-done>Selesai</button>` +
          `</div></div>`;
      }

      car.insertAdjacentHTML('beforeend', extra);
    });

    if (selected !== null) {
      window.setTimeout(() => {
        const input = sheet.querySelector<HTMLInputElement>('[data-ce-note-input]');
        input?.focus();
        input?.select();
      }, 0);
    }
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const pop = target.closest<HTMLElement>('[data-ce-pop]');
    if (pop) {
      if (target.closest('[data-ce-mark-delete]')) {
        if (selected !== null) {
          damages.splice(selected, 1);
          selected = null;
          renderMarks();
          markDirty();
        }
      } else if (target.closest('[data-ce-mark-done]')) {
        selected = null;
        renderMarks();
      }
      return;
    }

    const mark = target.closest<HTMLElement>('[data-ce-mark]');
    if (mark) {
      const index = Number(mark.dataset.ceMark);
      if (!Number.isNaN(index)) {
        selected = selected === index ? null : index;
        renderMarks();
      }
      return;
    }

    const check = target.closest<HTMLButtonElement>('[data-ce-check]');
    if (check) {
      const current = check.dataset.status || '';
      const index = (STATUS_CYCLE as readonly string[]).indexOf(current);
      const next = STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length] ?? '';
      check.dataset.status = next;
      check.textContent = STATUS_MARK[next] ?? '';
      const label = `${check.dataset.item || 'Item'}: ${next || 'belum diisi'}`;
      check.setAttribute('aria-label', label);
      check.title = label;
      markDirty();
      return;
    }

    const hit = target.closest<HTMLElement>('[data-ce-gauge]');
    if (hit) {
      const which = hit.dataset.ceGauge === 'keluar' ? 'keluar' : 'masuk';
      applyGauge(which, gaugeLevelFromClick(event, hit));
      markDirty();
      return;
    }

    const car = target.closest<HTMLElement>('[data-ce-car]');
    if (car) {
      const box = car.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const x = Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100));
      const y = Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100));
      damages.push({
        view: car.dataset.ceCar || 'ATAS',
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        catatan: '',
      });
      selected = damages.length - 1;
      renderMarks();
      markDirty();
    }
  };

  const onInput = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.matches('[data-ce-note-input]') && selected !== null) {
      const current = damages[selected];
      if (current) {
        damages[selected] = {
          ...current,
          catatan: (target as HTMLInputElement).value,
        };
      }
    }
    markDirty();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.matches('[data-ce-note-input]')) return;
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      selected = null;
      renderMarks();
    }
  };

  sheet.addEventListener('click', onClick);
  sheet.addEventListener('input', onInput);
  sheet.addEventListener('change', onInput);
  sheet.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', refit);

  applyGauge('masuk', (sheet.querySelector<HTMLInputElement>('#ce-bbmMasuk')?.value ?? ''));
  applyGauge('keluar', (sheet.querySelector<HTMLInputElement>('#ce-bbmKeluar')?.value ?? ''));
  renderMarks();
  refit();

  const collect = (): ChecklistEditPayload => {
    const val = (id: string): string =>
      sheet.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)?.value ?? '';

    const notes = new Map<string, string>();
    sheet.querySelectorAll<HTMLInputElement>('[data-ce-item-note]').forEach((input) => {
      notes.set(`${input.dataset.grup}|${input.dataset.item}`, input.value.trim());
    });

    const items: CkItem[] = [];
    sheet.querySelectorAll<HTMLButtonElement>('[data-ce-check]').forEach((button) => {
      const grup = button.dataset.grup || '';
      const name = button.dataset.item || '';
      const status = button.dataset.status || '';
      const catatan = notes.get(`${grup}|${name}`) ?? '';
      if (!status && !catatan) return;
      items.push({ grup, item: name, status, catatan });
    });

    const status = val('ce-status');
    const payload: ChecklistEditPayload = {
      id: val('ce-id'),
      rowId: Number(doc?.rowId || item?.rowId || 0),
      tanggal: val('ce-tanggal'),
      counter: val('ce-counter'),
      tipeMobil: val('ce-tipe'),
      driver: val('ce-driver'),
      kendaraan: val('ce-kendaraan'),
      kilometer: val('ce-km'),
      bbmMasuk: val('ce-bbmMasuk'),
      bbmKeluar: val('ce-bbmKeluar'),
      keterangan: val('ce-keterangan'),
      diperiksaOleh: val('ce-diperiksa'),
      items,
      damages: damages.map((mark) => ({
        view: mark.view,
        x: mark.x,
        y: mark.y,
        catatan: mark.catatan ?? '',
      })),
    };
    if (status) payload.status = status;
    return payload;
  };

  return {
    collect,
    refit,
    destroy(): void {
      sheet.removeEventListener('click', onClick);
      sheet.removeEventListener('input', onInput);
      sheet.removeEventListener('change', onInput);
      sheet.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', refit);
    },
  };
}
