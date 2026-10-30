/**
 * pages/checklist-paper.ts — Render Checklist Kendaraan dalam bentuk kertas A4
 * (mengikuti tampilan root/checklist_kendaraan.html), untuk dipakai di
 * detail drawer maupun area cetak.
 */

import type { CkHeader, CkItem } from '../schema';
import type { Signatures } from '../ui';
import { esc, signatureHtml } from '../ui';

const W = 595.28;
const H = 841.89;
const L = 28;
const R = W - 28;
const B = 28;
const T = H - 28;

export const CK_ITEMS: Record<string, string[]> = {
  Kaca: ['Depan', 'Kiri', 'Kanan', 'Spion Kanan', 'Spion Kiri', 'Spion Dalam'],
  'Body Mobil': ['Depan', 'Grill', 'Fender', 'Pintu Dpn Kanan', 'Pintu Dpn Kiri', 'Pintu Blk Kanan', 'Pintu Blk Kiri', 'Pintu Belakang'],
  Ban: ['Kanan Depan', 'Kiri Depan', 'Kanan Belakang', 'Kiri Belakang', 'Serep'],
  Mesin: ['Oli Mesin', 'Minyak Rem', 'Air Radiator', 'Air ACCU', 'Air Wiper'],
  Lampu: ['Besar', 'Kecil', 'Rem', 'Sen Depan', 'Sen Belakang'],
  Eksterior: ['Talang Air', 'Plat Belakang', 'Plat Depan'],
  Kelengkapan: ['Kunci Roda', 'Dongkrak', 'P3K', 'STNK', 'APAR'],
  Interior: ['Jok', 'Stir', 'Karpet Dasar', 'Persneling', 'Rem Tangan', 'Dashboard', 'Sendalan', 'AC', 'Charger', 'Radio', 'Power Window', 'Gauges'],
};

const COLUMNS: string[][] = [
  ['Kaca', 'Body Mobil'],
  ['Ban', 'Mesin', 'Lampu'],
  ['Eksterior', 'Kelengkapan'],
  ['Interior'],
];

function pt(v: number): string {
  return `${v}pt`;
}

function rect(x: number, y: number, w: number, h: number): string {
  const top = H - (y + h);
  return `<div class="ck-r" style="left:${pt(x)};top:${pt(top)};width:${pt(w)};height:${pt(h)}"></div>`;
}

function hline(x1: number, x2: number, y: number): string {
  const top = H - y - 0.35;
  return `<div class="ck-l" style="left:${pt(x1)};top:${pt(top)};width:${pt(x2 - x1)}"></div>`;
}

function text(x: number, y: number, s: string, size: number, bold = false, align?: 'center', color?: string): string {
  const top = H - y - 0.8465 * size;
  const style =
    `left:${pt(x)};top:${pt(top)};font-size:${pt(size)};` +
    (bold ? 'font-weight:700;' : '') +
    (align === 'center' ? 'transform:translateX(-50%);' : '') +
    (color ? `color:${color};` : '');
  return `<div class="ck-t" style="${style}">${esc(s)}</div>`;
}

function gauge(x: number, y: number, w: number, h: number, title: string, level?: string): string {
  let s = rect(x, y, w, h);
  const cx = w / 2;
  const cy = (h - 14) / 2;
  const r = Math.min(w, h - 14) / 2 - 5;
  const Y = (v: number) => h - v;
  const n = (v: number) => +v.toFixed(2);
  s += `<svg class="ck-g" viewBox="0 0 ${w} ${h}" stroke="#000" stroke-width="0.7" fill="none" font-family="Helvetica, Arial, sans-serif" style="left:${pt(x)};top:${pt(H - (y + h))};width:${pt(w)};height:${pt(h)}}">`;
  s += `<line x1="0" y1="${Y(h - 14)}" x2="${w}" y2="${Y(h - 14)}"/>`;
  s += `<circle cx="${cx}" cy="${Y(cy)}" r="${r}" fill="none"/>`;
  for (let deg = 0; deg <= 180; deg += 30) {
    const a = (deg * Math.PI) / 180;
    s += `<line x1="${n(cx + (r - 3) * Math.cos(a))}" y1="${n(Y(cy + (r - 3) * Math.sin(a)))}" x2="${n(cx + r * Math.cos(a))}" y2="${n(Y(cy + r * Math.sin(a)))}"/>`;
  }
  s += `<circle cx="${cx}" cy="${Y(cy)}" r="2" fill="#000"/>`;
  const tx = (px: number, py: number, str: string, sz: number, bold = false, anchor?: string) =>
    `<text x="${n(px)}" y="${n(Y(py))}" font-size="${sz}" text-anchor="${anchor || 'start'}" stroke="none" fill="#000" font-weight="${bold ? 700 : 400}">${esc(str)}</text>`;
  s += tx(w / 2, h - 10, title, 7, true, 'middle');
  s += tx(cx - r + 3, cy + 2, 'E', 5) + tx(cx + r - 7, cy + 2, 'F', 5) + tx(cx, cy - 14, 'FUEL METER', 5, false, 'middle');
  const levelMap: Record<string, number> = { E: 180, '1/4': 135, '1/2': 90, '3/4': 45, F: 0 };
  const deg = level ? (levelMap[level.trim().toUpperCase()] ?? null) : null;
  if (deg !== null) {
    const a = (deg * Math.PI) / 180;
    const nx = cx + (r - 4) * Math.cos(a);
    const ny = cy + (r - 4) * Math.sin(a);
    s += `<line x1="${cx}" y1="${Y(cy)}" x2="${n(nx)}" y2="${n(Y(ny))}" stroke="#000" stroke-width="1.4"/>`;
    s += `<circle cx="${cx}" cy="${Y(cy)}" r="2.5" fill="#000" stroke="none"/>`;
  }
  s += `</svg>`;
  return s;
}

function itemStatus(doc: CkHeader | undefined, grup: string, itemName: string): CkItem | undefined {
  return (doc?.items || []).find((it) => it.grup === grup && it.item === itemName);
}

export function renderChecklistPaper(doc: CkHeader | undefined, item: { rowId: number; noDok?: string; tanggal?: string; driver?: string; kendaraan?: string; keterangan?: string } | undefined, sigs?: Signatures): string {
  const d = doc;
  const counter = d?.counter || '';
  const tipe = d?.tipeMobil || '';
  const driver = d?.driver || item?.driver || '';
  const tanggal = d?.tanggal || item?.tanggal || '';
  const nopol = d?.noPolisi || item?.kendaraan || '';
  const km = d?.kilometer || '';
  const bbmMasuk = d?.bbmMasuk || '';
  const bbmKeluar = d?.bbmKeluar || '';
  const keterangan = d?.keterangan || item?.keterangan || '';
  const damages = d?.damages || [];

  const y0 = T - 48;

  // Header labels + hlines (seperti root)
  let html = '';
  html += `<div class="ck-paper">`;
  // border frame
  html += rect(L, B, R - L, T - B);
  html += text(W / 2, T - 20, 'CHECKLIST PEMERIKSAAN & KELENGKAPAN KENDARAAN OPERASIONAL', 10.5, true, 'center');

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

  // Values
  html += text(102, y0, counter, 10);
  html += text(102, y0 - 22, tipe, 10);
  html += text(102, y0 - 44, driver, 10);
  html += text(297, y0, tanggal, 10);
  html += text(297, y0 - 22, nopol, 10);
  html += text(297, y0 - 44, km, 10);

  // Gauges
  html += gauge(405, T - 114, 75, 80, 'MASUK', bbmMasuk);
  html += gauge(487, T - 114, 75, 80, 'KELUAR', bbmKeluar);
  // level BBM ditampilkan via jarum pada gauge, bukan teks terpisah.

  // Items
  const ROW = 16;
  const colTop = T - 122;
  const xs = [36, 169, 301, 432];
  const ws = [128, 128, 128, 130];
  COLUMNS.forEach((groups, ci) => {
    const x = xs[ci] as number;
    const xe = x + (ws[ci] as number);
    let y = colTop;
    groups.forEach((g) => {
      html += text(x, y - 2, g, 8, true);
      y -= ROW;
      (CK_ITEMS[g] || []).forEach((it) => {
        html += rect(x, y - 3, 8, 8);
        const st = itemStatus(d, g, it);
        const status = st?.status || '';
        const mark = status === 'Rusak' ? '\u00D7' : status === 'Baik' ? '\u2713' : '';
        if (mark) {
          html += text(x + 1.5, y - 2.5, mark, 8, true, undefined, '#000');
        }
        html += text(x + 13, y - 1.5, it, 7.5);
        html += hline(x + 74, xe - 2, y - 3);
        if (st?.catatan) {
          html += text(x + 76, y - 1.5, `(${st.catatan})`, 7, false, undefined, '#dc2626');
        }
        y -= ROW;
      });
    });
  });

  // Car images
  const carDefs: { name: string; label: string; x: number; yTop: number; w: number }[] = [
    { name: 'atas', label: 'ATAS', x: 49, yTop: 368, w: 95 },
    { name: 'kiri', label: 'KIRI', x: 165, yTop: 396, w: 180 },
    { name: 'kanan', label: 'KANAN', x: 370, yTop: 396, w: 180 },
    { name: 'depan', label: 'DEPAN', x: 191, yTop: 294, w: 128 },
    { name: 'belakang', label: 'BELAKANG', x: 396, yTop: 294, w: 128 },
  ];
  const viewLabelPos: Record<string, { x: number; y: number }> = {
    ATAS: { x: 96, y: 374 },
    KIRI: { x: 255, y: 402 },
    KANAN: { x: 460, y: 402 },
    DEPAN: { x: 255, y: 298 },
    BELAKANG: { x: 460, y: 298 },
  };
  carDefs.forEach((c) => {
    const lbl = c.label;
    const pos = viewLabelPos[lbl]!;
    html += text(pos.x, pos.y, lbl, 8, true, 'center');
    const marksForView = damages.filter((m) => (m.view || '').toUpperCase() === lbl);
    const wrapTop = H - c.yTop;
    html += `<div class="ck-carwrap" style="left:${pt(c.x)};top:${pt(wrapTop)};width:${pt(c.w)}">`;
    html += `<img class="ck-car" src="./ck-${c.name}.webp" alt="${esc(lbl)}">`;
    marksForView.forEach((m) => {
      html += `<span class="ck-mark" style="left:${m.x}%;top:${m.y}%">\u00D7</span>`;
      if (m.catatan) {
        html += `<span class="ck-marknote" style="left:${m.x}%;top:${m.y + 4}%">${esc(m.catatan)}</span>`;
      }
    });
    html += `</div>`;
  });

  // Keterangan
  html += text(36, 142, 'Keterangan', 8.5, true);
  html += rect(36, 40, R - 8 - 36, 98);
  html += `<div class="ck-ket" style="left:${pt(40)};top:${pt(H - 40 - 98 + 4)};width:${pt(R - 8 - 36 - 8)}">${esc(keterangan || '-')}</div>`;

  // Diperiksa oleh
  html += rect(430, 40, R - 8 - 430, 64);
  html += text(436, 96, 'Diperiksa Oleh,', 8, true);
  const ttdHtml = sigs?.diperiksa ? signatureHtml(sigs.diperiksa) : (d?.diperiksaOleh ? esc(d.diperiksaOleh) : '');
  html += `<div class="ck-ttd" style="left:${pt(436)};top:${pt(H - 90)};width:${pt(R - 8 - 430 - 8)};text-align:center">${ttdHtml}</div>`;

  html += `</div>`;

  // wrap with style
  const style = `<style>
.ck-paper{position:relative;width:${pt(W)};height:${pt(H)};background:#fff;margin:0 auto;font-family:Helvetica,Arial,sans-serif;color:#000;font-size:8pt;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.35);}
.ck-paper .ck-r{position:absolute;border:.7pt solid #000;}
.ck-paper .ck-l{position:absolute;height:0;border-top:.7pt solid #000;}
.ck-paper .ck-t{position:absolute;white-space:nowrap;line-height:1;}
.ck-paper .ck-g{position:absolute;display:block;overflow:visible;}
.ck-paper .ck-carwrap{position:absolute;}
.ck-paper .ck-car{width:100%;height:auto;display:block;}
.ck-paper .ck-mark{position:absolute;color:#dc2626;font-weight:bold;font-size:12pt;transform:translate(-50%,-50%);}
.ck-paper .ck-marknote{position:absolute;color:#dc2626;font-size:7pt;transform:translate(-50%,0);white-space:nowrap;}
.ck-paper .ck-ket,.ck-paper .ck-ttd{position:absolute;font-size:9pt;white-space:pre-wrap;word-break:break-word;line-height:1;}
</style>`;

  return style + html;
}