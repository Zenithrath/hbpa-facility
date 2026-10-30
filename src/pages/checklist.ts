/**
 * pages/checklist.ts — Checklist Pemeriksaan Kendaraan (FM-FCL-02.04).
 *
 * Sama seperti halaman lain: HTML dari main.ts, data lewat api.ts. Canvas
 * hanya dipakai untuk menandai lokasi kerusakan; tangkapan PNG-nya ikut
 * dikirim saat simpan (opsional bila ukurannya melebihi batas URL).
 */

import { api } from "../api";
import { CONFIG } from "../config";
import type { CkDamage, CkItem, CkSaveResult, DrCkMaster } from "../schema";
import { $, esc, field$, isoToSlash, print, toast, todayISO, icon, orDash, must, emptyRow } from "../ui";
import { message } from "./transport";
import { store } from "../store";

/** Ukuran bitmap tiap tampilan, mengikuti rasio gambar aslinya. */
export const VIEW_DIMENSIONS: Record<string, { w: number; h: number }> = {
  ATAS: { w: 300, h: 578 },
  KIRI: { w: 480, h: 320 },
  KANAN: { w: 480, h: 320 },
  DEPAN: { w: 480, h: 320 },
  BELAKANG: { w: 480, h: 320 },
};

/** Slot kosong yang tetap digambar seperti di kertas asli. */
const SLOT_ROWS: Record<string, number> = {
  "Body Mobil": 2,
  Ban: 1,
  Eksterior: 1,
  Kelengkapan: 1,
};

let masters: DrCkMaster | null = null;
let marks: CkDamage[] = [];
let pendingMark: { view: string; x: number; y: number } | null = null;

/** Item checklist bawaan (salinan dari kertas asli) dipakai bila tab M_Item kosong. */
const DEFAULT_CK_ITEMS: { grup: string; item: string; urutan: string }[] = [
  { grup: "Kaca", item: "Depan", urutan: "1" },
  { grup: "Kaca", item: "Kiri", urutan: "2" },
  { grup: "Kaca", item: "Kanan", urutan: "3" },
  { grup: "Kaca", item: "Spion Kanan", urutan: "4" },
  { grup: "Kaca", item: "Spion Kiri", urutan: "5" },
  { grup: "Kaca", item: "Spion Dalam", urutan: "6" },
  { grup: "Body Mobil", item: "Depan", urutan: "1" },
  { grup: "Body Mobil", item: "Grill", urutan: "2" },
  { grup: "Body Mobil", item: "Fender", urutan: "3" },
  { grup: "Body Mobil", item: "Pintu Dpn Kanan", urutan: "4" },
  { grup: "Body Mobil", item: "Pintu Dpn Kiri", urutan: "5" },
  { grup: "Body Mobil", item: "Pintu Blk Kanan", urutan: "6" },
  { grup: "Body Mobil", item: "Pintu Blk Kiri", urutan: "7" },
  { grup: "Body Mobil", item: "Pintu Belakang", urutan: "8" },
  { grup: "Ban", item: "Kanan Depan", urutan: "1" },
  { grup: "Ban", item: "Kiri Depan", urutan: "2" },
  { grup: "Ban", item: "Kanan Belakang", urutan: "3" },
  { grup: "Ban", item: "Kiri Belakang", urutan: "4" },
  { grup: "Ban", item: "Serep", urutan: "5" },
  { grup: "Mesin", item: "Oli Mesin", urutan: "1" },
  { grup: "Mesin", item: "Minyak Rem", urutan: "2" },
  { grup: "Mesin", item: "Air Radiator", urutan: "3" },
  { grup: "Mesin", item: "Air ACCU", urutan: "4" },
  { grup: "Mesin", item: "Air Wiper", urutan: "5" },
  { grup: "Lampu", item: "Besar", urutan: "1" },
  { grup: "Lampu", item: "Kecil", urutan: "2" },
  { grup: "Lampu", item: "Rem", urutan: "3" },
  { grup: "Lampu", item: "Sen Depan", urutan: "4" },
  { grup: "Lampu", item: "Sen Belakang", urutan: "5" },
  { grup: "Eksterior", item: "Talang Air", urutan: "1" },
  { grup: "Eksterior", item: "Plat Belakang", urutan: "2" },
  { grup: "Eksterior", item: "Plat Depan", urutan: "3" },
  { grup: "Kelengkapan", item: "Kunci Roda", urutan: "1" },
  { grup: "Kelengkapan", item: "Dongkrak", urutan: "2" },
  { grup: "Kelengkapan", item: "P3K", urutan: "3" },
  { grup: "Kelengkapan", item: "STNK", urutan: "4" },
  { grup: "Kelengkapan", item: "APAR", urutan: "5" },
  { grup: "Interior", item: "Jok", urutan: "1" },
  { grup: "Interior", item: "Stir", urutan: "2" },
  { grup: "Interior", item: "Karpet Dasar", urutan: "3" },
  { grup: "Interior", item: "Persneling", urutan: "4" },
  { grup: "Interior", item: "Rem Tangan", urutan: "5" },
  { grup: "Interior", item: "Dashboard", urutan: "6" },
  { grup: "Interior", item: "Sendalan", urutan: "7" },
  { grup: "Interior", item: "AC", urutan: "8" },
  { grup: "Interior", item: "Charger", urutan: "9" },
  { grup: "Interior", item: "Radio", urutan: "10" },
  { grup: "Interior", item: "Power Window", urutan: "11" },
  { grup: "Interior", item: "Gauges", urutan: "12" },
];

/* ---------- Bantuan DOM ---------- */

function canvasFor(view: string): HTMLCanvasElement | null {
  return $<HTMLCanvasElement>(`ck-cv-${view}`);
}


function contextFor(view: string): CanvasRenderingContext2D | null {
  return canvasFor(view)?.getContext("2d") ?? null;
}


function showMsg(text: string, isError = false): void {
  const el = $("ck-msg");
  if (!el) return;
  el.textContent = text;
  el.className = isError ? "text-sm font-semibold text-red-600" : "text-sm font-semibold text-emerald-700";
}

function renderPendingHint(): void {
  const hint = $("ck-pendingHint");
  if (!hint) return;
  hint.textContent = pendingMark
    ? `Lokasi terpilih: ${pendingMark.view} (${pendingMark.x}%, ${pendingMark.y}%)`
    : "Klik gambar untuk memilih lokasi.";
  hint.className = pendingMark ? "text-[11px] font-semibold text-primary-700" : "text-[11px] text-surface-400";
}

/* ---------- Gauge level solar ---------- */

const GAUGE_W = 240;
const GAUGE_H = 148;
const GAUGE_CX = 120;
const GAUGE_CY = 122;
const GAUGE_R = 84;

function gaugePoint(fraction: number, radius: number): { x: number; y: number } {
  const angle = Math.PI * (1 - fraction);
  return { x: GAUGE_CX + Math.cos(angle) * radius, y: GAUGE_CY - Math.sin(angle) * radius };
}

const GAUGE_ARC = (() => {
  const start = gaugePoint(0, GAUGE_R);
  const end = gaugePoint(1, GAUGE_R);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
})();

function gaugeTone(fraction: number): { stroke: string; badge: string } {
  if (fraction <= 0) {
    return { stroke: "#ef4444", badge: "border-red-200 bg-red-50 text-red-700" };
  }
  if (fraction <= 0.3) {
    return { stroke: "#f97316", badge: "border-orange-200 bg-orange-50 text-orange-700" };
  }
  if (fraction <= 0.55) {
    return { stroke: "#f59e0b", badge: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  if (fraction <= 0.8) {
    return { stroke: "#0d9488", badge: "border-primary-200 bg-primary-50 text-primary-700" };
  }
  return { stroke: "#059669", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

function gaugeSvg(levels: string[], index: number): string {
  const last = Math.max(1, levels.length - 1);
  const fraction = index >= 0 ? index / last : 0;
  const tone = index >= 0 ? gaugeTone(fraction) : { stroke: "#94a3b8", badge: "" };

  const ticks = levels
    .map((level, i) => {
      const tick = i / last;
      const inner = gaugePoint(tick, GAUGE_R - 8);
      const outer = gaugePoint(tick, GAUGE_R + 8);
      const label = gaugePoint(tick, GAUGE_R + 22);
      const active = i === index;
      return (
        `<line x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" ` +
        `stroke="${active ? tone.stroke : "#cbd5e1"}" stroke-width="${active ? 3 : 2}" stroke-linecap="round"/>` +
        `<text x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" ` +
        `font-size="10" font-weight="${active ? 700 : 600}" fill="${active ? tone.stroke : "#94a3b8"}">${esc(level)}</text>`
      );
    })
    .join("");

  const fill =
    index >= 0
      ? `<path d="${GAUGE_ARC}" pathLength="100" fill="none" stroke="${tone.stroke}" stroke-width="12" ` +
        `stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="${(100 - fraction * 100).toFixed(2)}"/>`
      : "";

  const needleAngle = -90 + fraction * 180;

  return `<svg viewBox="0 0 ${GAUGE_W} ${GAUGE_H}" class="block w-full" aria-hidden="true">
    <path d="${GAUGE_ARC}" fill="none" stroke="#e2e8f0" stroke-width="12" stroke-linecap="round"/>
    ${fill}
    ${ticks}
    <g transform="rotate(${needleAngle.toFixed(2)} ${GAUGE_CX} ${GAUGE_CY})">
      <line x1="${GAUGE_CX}" y1="${GAUGE_CY}" x2="${GAUGE_CX}" y2="${GAUGE_CY - GAUGE_R + 14}" stroke="${tone.stroke}" stroke-width="4" stroke-linecap="round"/>
    </g>
    <circle cx="${GAUGE_CX}" cy="${GAUGE_CY}" r="8" fill="#ffffff" stroke="${tone.stroke}" stroke-width="4"/>
  </svg>`;
}

function gaugeFractionFromEvent(svg: SVGSVGElement, event: MouseEvent): number {
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return 0;

  const x = ((event.clientX - rect.left) / rect.width) * GAUGE_W;
  const y = ((event.clientY - rect.top) / rect.height) * GAUGE_H;
  const dx = x - GAUGE_CX;
  const dy = GAUGE_CY - y;

  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle = dx < 0 ? Math.PI : 0;
  return Math.max(0, Math.min(1, 1 - angle / Math.PI));
}

function readLevels(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .map((option) => option.value)
    .filter((value) => value !== "");
}

function paintGauge(id: string): void {
  const select = $<HTMLSelectElement>(id);
  const root = document.querySelector<HTMLElement>(`[data-gauge="${id}"]`);
  const dial = root?.querySelector<HTMLElement>("[data-gauge-dial]");
  const badge = root?.querySelector<HTMLElement>("[data-gauge-badge]");
  if (!select || !dial || !badge) return;

  const levels = readLevels(select);
  const index = levels.indexOf(select.value);
  const tone = index >= 0 ? gaugeTone(index / Math.max(1, levels.length - 1)) : null;

  dial.innerHTML = levels.length ? gaugeSvg(levels, index) : "";
  dial.setAttribute("aria-valuemax", String(Math.max(0, levels.length - 1)));
  dial.setAttribute("aria-valuenow", String(Math.max(0, index)));
  dial.setAttribute("aria-valuetext", index >= 0 ? levels[index] ?? "" : "Belum dipilih");

  badge.textContent = index >= 0 ? levels[index] ?? "—" : "—";
  badge.className =
    "inline-flex min-w-12 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-bold " +
    (tone ? tone.badge : "border-surface-200 bg-white text-surface-400");

  const setIndex = (next: number): void => {
    const value = levels[Math.max(0, Math.min(levels.length - 1, next))];
    if (value === undefined) return;
    select.value = value;
    paintGauge(id);
  };

  dial.onclick = (event) => {
    const svg = dial.querySelector("svg");
    if (!svg || !levels.length) return;
    setIndex(Math.round(gaugeFractionFromEvent(svg, event) * (levels.length - 1)));
  };

  dial.onkeydown = (event) => {
    if (!levels.length) return;
    const current = Math.max(0, levels.indexOf(select.value));
    if (event.key === "ArrowRight" || event.key === "ArrowUp") setIndex(current + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") setIndex(current - 1);
    else if (event.key === "Home") setIndex(0);
    else if (event.key === "End") setIndex(levels.length - 1);
    else return;
    event.preventDefault();
  };
}

/* ---------- Gambar mobil + tanda kerusakan ---------- */

/**
 * Gambar kendaraan memakai WebP hasil render, bukan SVG trace aslinya.
 * Lima SVG itu totalnya ~4 MB dan lama di-decode; versi WebP ini ~330 KB
 * sehingga halaman langsung tampil.
 */
const CAR_SRC: Record<string, string> = {
  ATAS: "./ck-atas.webp",
  KIRI: "./ck-kiri.webp",
  KANAN: "./ck-kanan.webp",
  DEPAN: "./ck-depan.webp",
  BELAKANG: "./ck-belakang.webp",
};

const carImages: Record<string, HTMLImageElement> = {};
const carLoading = new Set<string>();

function carImageFor(view: string): HTMLImageElement | null {
  const src = CAR_SRC[view];
  if (!src) return null;

  let img = carImages[view];
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = src;
    carImages[view] = img;
  }
  return img;
}

function drawCar(view: string, withMarks: boolean): void {
  const c = contextFor(view);
  const img = carImageFor(view);
  if (!c || !img) return;
  const W = c.canvas.width;
  const H = c.canvas.height;

  // Kanvas dibiarkan transparan; tidak ada latar di belakang gambar mobil.
  c.clearRect(0, 0, W, H);

  if (!img.complete || img.naturalWidth === 0) {
    if (!carLoading.has(view)) {
      carLoading.add(view);
      img.addEventListener(
        "load",
        () => {
          carLoading.delete(view);
          drawCar(view, true);
        },
        { once: true },
      );
    }
    return;
  }

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.min(W / iw, H / ih) * 0.94;
  const dw = iw * scale;
  const dh = ih * scale;
  c.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

  if (withMarks) drawMarks(view);
}

function drawMarks(view: string): void {
  const c = contextFor(view);
  if (!c) return;
  const W = c.canvas.width;
  const H = c.canvas.height;

  for (const mark of marks) {
    if (mark.view !== view) continue;
    const x = (mark.x / 100) * W;
    const y = (mark.y / 100) * H;
    c.strokeStyle = "#b91c1c";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x - 7, y - 7);
    c.lineTo(x + 7, y + 7);
    c.moveTo(x + 7, y - 7);
    c.lineTo(x - 7, y + 7);
    c.stroke();
  }

  if (!pendingMark || pendingMark.view !== view) return;

  const x = (pendingMark.x / 100) * W;
  const y = (pendingMark.y / 100) * H;
  c.strokeStyle = "#0d9488";
  c.lineWidth = 2;
  c.setLineDash([5, 4]);
  c.beginPath();
  c.arc(x, y, 11, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = "#0d9488";
  c.beginPath();
  c.arc(x, y, 3, 0, Math.PI * 2);
  c.fill();
}

function paint(): void {
  for (const v of ["ATAS", "KIRI", "KANAN", "DEPAN", "BELAKANG"]) drawCar(v, true);
}

/* ---------- Daftar penanda ---------- */

function renderMarks(): void {
  const count = $("ck-markCount");
  if (count) count.textContent = String(marks.length);

  const box = $("ck-marks");
  if (!box) return;

  box.innerHTML = marks
    .map(
      (mark, index) => `<li class="flex items-center justify-between gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-1.5 text-xs">
      <span class="break-words">${esc(mark.view)} (${esc(mark.x)}%, ${esc(mark.y)}%)${mark.catatan ? ` - ${esc(mark.catatan)}` : ""}</span>
      <button type="button" class="btn-slate text-red-600" data-action="ck-delMark" data-id="${index}">Hapus</button>
    </li>`,
    )
    .join("");
}

export function removeMark(index: number): void {
  marks = marks.filter((_, i) => i !== index);
  renderMarks();
  paint();
}

export function catat(): void {
  if (!pendingMark) {
    toast("Klik dulu lokasi kerusakan di gambar kendaraan.", "error");
    return;
  }

  const note = $<HTMLInputElement>("ck-sisiCatatan");
  marks.push({ ...pendingMark, catatan: note?.value.trim() ?? "" });
  pendingMark = null;
  if (note) note.value = "";
  renderMarks();
  renderPendingHint();
  paint();
}

function onCanvasClick(event: MouseEvent): void {
  const target = event.currentTarget as HTMLCanvasElement | null;
  if (!target) return;
  const view = target.dataset.view || "ATAS";

  const rect = target.getBoundingClientRect();
  const x = rect.width ? Math.round(((event.clientX - rect.left) / rect.width) * 100) : 50;
  const y = rect.height ? Math.round(((event.clientY - rect.top) / rect.height) * 100) : 50;

  pendingMark = {
    view,
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  };
  renderPendingHint();
  paint();
}

/* ---------- Item checklist ---------- */

function pill(name: string, label: string, status: string, checked: boolean): string {
  return `<label class="ck-pill" data-status="${status}">
    <input type="radio" class="sr-only" name="${name}" value="${status}" data-status="${status}"${checked ? " checked" : ""}>${label}
  </label>`;
}

function itemRowHtml(grup: string, item: string, groupIndex: number, itemIndex: number): string {
  const name = `ck-r${groupIndex}-${itemIndex}`;
  return `<div class="ck-item flex flex-wrap items-center justify-between gap-3 border-t border-surface-100 px-3 py-2 first:border-t-0"
    data-key="${esc(`${grup}|${item}`)}" data-grup="${esc(grup)}" data-item="${esc(item)}">
    <span class="min-w-32 flex-1 text-sm font-semibold">${esc(item)}</span>
    <span class="inline-flex overflow-hidden rounded-full border border-surface-300 bg-white">
      ${pill(name, "Baik", "Baik", true)}
      ${pill(name, "Rusak", "Rusak", false)}
      ${pill(name, "Tidak Ada", "Tidak Ada", false)}
    </span>
    <input type="text" data-catatan class="field hidden w-full px-3 py-1.5 text-xs sm:w-56" placeholder="Catatan">
  </div>`;
}

function slotRowHtml(): string {
  return `<div class="flex items-center gap-3 border-t border-surface-100 px-3 py-2">
    <span class="min-w-32 flex-1 text-sm text-surface-400">(slot kosong sesuai kertas)</span>
  </div>`;
}

function syncRow(row: HTMLElement): void {
  const checked = row.querySelector<HTMLInputElement>('input[type="radio"]:checked');
  const status = checked?.dataset.status ?? "Baik";

  row.querySelectorAll<HTMLElement>(".ck-pill").forEach((label) => {
    label.classList.toggle("on", label.dataset.status === status);
  });

  const note = row.querySelector<HTMLInputElement>("[data-catatan]");
  if (note) {
    const show = status !== "Baik";
    note.classList.toggle("hidden", !show);
    if (!show) note.value = "";
  }
}

function itemRows(): HTMLElement[] {
  const box = field$("ck-grup");
  if (!box) return [];
  return Array.from(box.querySelectorAll<HTMLElement>(".ck-item"));
}

function renderItems(): void {
  const box = field$("ck-grup");
  if (!box) return;

  const order: string[] = [];
  const perGroup = new Map<string, { grup: string; item: string }[]>();

  const items = masters?.items?.length ? masters.items : DEFAULT_CK_ITEMS;
  for (const master of items) {
    const grup = master.grup || "-";
    const item = String(master.item || "").trim();
    if (!item) continue;
    if (!perGroup.has(grup)) {
      perGroup.set(grup, []);
      order.push(grup);
    }
    perGroup.get(grup)?.push({ grup, item });
  }

  box.innerHTML = order
    .map((grup, groupIndex) => {
      const list = perGroup.get(grup) ?? [];
      const rows = list.map((it, itemIndex) => itemRowHtml(grup, it.item, groupIndex, itemIndex)).join("");
      const slots = Array.from({ length: SLOT_ROWS[grup] ?? 0 }, () => slotRowHtml()).join("");
      return `<div class="mt-3 first:mt-0">
        <div class="mb-1 text-sm font-bold text-primary-700">${esc(grup)} :</div>
        <div class="overflow-hidden rounded-xl border border-surface-200">${rows}${slots}</div>
      </div>`;
    })
    .join("");

  itemRows().forEach(syncRow);

  box.onchange = (event) => {
    const target = event.target as HTMLElement | null;
    const row = target?.closest<HTMLElement>(".ck-item");
    if (row) syncRow(row);
  };
}

export function semuaBaik(): void {
  const box = field$("ck-grup");
  if (!box) return;
  box.querySelectorAll<HTMLInputElement>('input[data-status="Baik"]').forEach((radio) => {
    radio.checked = true;
  });
  itemRows().forEach(syncRow);
}

/* ---------- Muat data ---------- */

const DEFAULT_BBM_LEVELS = ["E", "1/4", "1/2", "3/4", "F"];

function initGauges(levels: string[]): void {
  for (const id of ["ck-bbmMasuk", "ck-bbmKeluar"]) {
    const select = $<HTMLSelectElement>(id);
    if (!select) continue;

    const current = Array.from(select.options)
      .map((option) => option.value)
      .filter((value) => value !== "");
    const same = current.length === levels.length && current.every((value, index) => value === levels[index]);

    if (!same) {
      const previous = select.value;
      select.innerHTML =
        '<option value=""></option>' +
        levels.map((level) => `<option value="${esc(level)}">${esc(level)}</option>`).join("");
      if (previous && levels.includes(previous)) select.value = previous;
    }

    select.onchange = () => paintGauge(id);
    paintGauge(id);
  }
}

function fillForm(): void {
  const tanggal = $<HTMLInputElement>("ck-tanggal");
  if (tanggal && !tanggal.value) tanggal.value = todayISO();

  const kendaraan = $<HTMLInputElement>("ck-kendaraan");
  if (kendaraan && masters?.kendaraan?.length) {
    kendaraan.value = kendaraan.value || masters.kendaraan[0]?.noPlat || "";
  }

  const driver = $<HTMLInputElement>("ck-driver");
  if (driver && masters?.driver) driver.value = masters.driver;

  initGauges(masters?.bbmLevels ?? DEFAULT_BBM_LEVELS);
}

function setupCanvases(): void {
  for (const view of Object.keys(VIEW_DIMENSIONS)) {
    const canvas = canvasFor(view);
    const size = VIEW_DIMENSIONS[view];
    if (!canvas || !size) continue;
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.onclick = onCanvasClick;
  }
  paint();
}

function preloadCarImages(): void {
  for (const view of Object.keys(CAR_SRC)) carImageFor(view);
}

export async function refresh(): Promise<void> {
  showMsg("");
  const save = $<HTMLButtonElement>("ck-simpan");
  if (save) save.disabled = false;

  // Reset penanda lalu siapkan kanvas dan gauge lebih dulu. Gambar mobil dan
  // gauge langsung tampil tanpa menunggu permintaan master selesai.
  marks = [];
  pendingMark = null;
  renderMarks();
  renderPendingHint();
  preloadCarImages();
  setupCanvases();
  initGauges(DEFAULT_BBM_LEVELS);

  try {
    masters = await api.getMasters();
  } catch (error) {
    showMsg(message(error), true);
    if (save) save.disabled = true;
    masters = {
      role: "",
      email: "",
      driver: "",
      drivers: [],
      kendaraan: [],
      items: DEFAULT_CK_ITEMS,
      ijn: [],
      bbmLevels: ["E", "1/4", "1/2", "3/4", "F"],
      ckStatuses: ["Baik", "Rusak", "Tidak Ada"],
      views: ["ATAS", "KIRI", "KANAN", "DEPAN", "BELAKANG"],
      ckFormCode: "",
      ckRev: "",
    };
    fillForm();
    renderItems();
    return;
  }

  fillForm();
  renderItems();
}

/* ---------- Simpan ---------- */

function gatherItems(): CkItem[] {
  return itemRows()
    .map((row) => {
      const checked = row.querySelector<HTMLInputElement>('input[type="radio"]:checked');
      const status = checked?.dataset.status ?? "Baik";
      const note = row.querySelector<HTMLInputElement>("[data-catatan]");
      return {
        grup: row.dataset.grup ?? "-",
        item: row.dataset.item ?? "",
        status,
        catatan: status === "Baik" ? "" : (note?.value.trim() ?? ""),
      };
    })
    .filter((item) => Boolean(item.item));
}

export async function save(): Promise<void> {
  showMsg("");

  const tanggal = $<HTMLInputElement>("ck-tanggal")?.value ?? "";
  const kendaraan = $<HTMLInputElement>("ck-kendaraan")?.value ?? "";
  const driver = $<HTMLInputElement>("ck-driver")?.value ?? "";
  const kilometer = $<HTMLInputElement>("ck-kilometer")?.value.trim() ?? "";
  const bbmMasuk = $<HTMLSelectElement>("ck-bbmMasuk")?.value ?? "";
  const bbmKeluar = $<HTMLSelectElement>("ck-bbmKeluar")?.value ?? "";


  const items = gatherItems();

  const pngs: Record<string, string> = {};
  for (const view of [...new Set(marks.map((mark) => mark.view))]) {
    const cv = canvasFor(view);
    if (cv) {
      drawCar(view, true);
      pngs[view] = cv.toDataURL("image/png");
    }
  }
  paint();

  const payload = {
    tanggal: isoToSlash(tanggal),
    counter: $<HTMLInputElement>("ck-counter")?.value ?? "",
    kendaraan,
    driver,
    kilometer,
    bbmMasuk,
    bbmKeluar,
    keterangan: $<HTMLInputElement>("ck-keterangan")?.value.trim() ?? "",
    diperiksaOleh: $<HTMLInputElement>("ck-diperiksaOleh")?.value.trim() ?? "",
    items,
    damages: marks.map((mark) => ({
      view: mark.view,
      x: mark.x,
      y: mark.y,
      catatan: mark.catatan,
    })),
    pngs,
  };

  if (JSON.stringify(payload).length > CONFIG.MAX_DOC_BYTES) {
    payload.pngs = {};
    toast("Gambar kerusakan terlalu besar; penanda tetap disimpan tanpa gambar.", "error");
  }

  const saveButton = $<HTMLButtonElement>("ck-simpan");
  const loading = $("ck-loading");
  if (saveButton) saveButton.disabled = true;
  loading?.classList.remove("hidden");

  try {
    const result = await api.saveCk(payload);
    showResult(result);
    toast("Checklist tersimpan. PDF siap dicetak.");
  } catch (error) {
    showMsg(message(error), true);
  } finally {
    if (saveButton) saveButton.disabled = false;
    loading?.classList.add("hidden");
  }
}

function showResult(result: CkSaveResult): void {
  const box = $("ck-hasil");
  if (!box) return;
  const item = result.item;
  const tone = result.hasRusak ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";

  box.innerHTML = `<div class="rounded-xl border ${tone} px-4 py-3 text-sm">
    <span class="badge ${result.hasRusak ? "badge-rejected" : "badge-approved"}">Tersimpan: ${esc(item.id || "-")}</span>
    Tanggal: <b>${esc(item.tanggal || "-")}</b> - Kendaraan: <b>${esc(item.noPolisi || "-")}</b>
    (${esc(item.tipeMobil || "-")}), Status: <b>${esc(item.status || "-")}</b>
    ${item.linkPdf && item.linkPdf !== "-" ? ` - <a class="font-semibold underline" target="_blank" rel="noopener" href="${esc(item.linkPdf)}">Buka / Cetak PDF Checklist</a>` : ""}
    ${result.hasRusak ? '<div class="mt-1 font-bold">Ada item rusak.</div>' : ""}
    <div class="mt-2">${esc(result.message || "Checklist tersimpan. PDF siap dicetak.")}</div>
    <button class="btn-slate mt-3" type="button" data-action="ck-reset">Formulir baru</button>
  </div>`;
}

export function reset(): void {
  const box = $("ck-hasil");
  if (box) box.innerHTML = "";

  for (const id of ["ck-keterangan", "ck-diperiksaOleh", "ck-kilometer", "ck-bbmMasuk", "ck-bbmKeluar"]) {
    const el = field$(id);
    if (el) el.value = "";
  }
  paintGauge("ck-bbmMasuk");
  paintGauge("ck-bbmKeluar");

  marks = [];
  pendingMark = null;
  renderMarks();
  renderPendingHint();
  semuaBaik();
  paint();
  showMsg("");
}

/* ---------- Cetak ---------- */

export function printRow(): void {
  const kendaraan = $<HTMLInputElement>("ck-kendaraan")?.value ?? "";
  const driver = $<HTMLInputElement>("ck-driver")?.value ?? "";
  const tanggal = $<HTMLInputElement>("ck-tanggal")?.value ?? "";
  const kilometer = $<HTMLInputElement>("ck-kilometer")?.value ?? "";
  const bbmMasuk = $<HTMLSelectElement>("ck-bbmMasuk")?.value ?? "";
  const bbmKeluar = $<HTMLSelectElement>("ck-bbmKeluar")?.value ?? "";
  const keterangan = $<HTMLInputElement>("ck-keterangan")?.value ?? "";
  const diperiksaOleh = $<HTMLInputElement>("ck-diperiksaOleh")?.value ?? "";
  const counter = $<HTMLInputElement>("ck-counter")?.value ?? "";

  print.show('checklist');
  print.set('pc-counter', counter);
  print.set('pc-tipe', "");
  print.set('pc-driver', driver);
  print.set('pc-tanggal', tanggal);
  print.set('pc-nopol', kendaraan);
  print.set('pc-km', kilometer);
  print.set('pc-bbmMasuk', bbmMasuk);
  print.set('pc-bbmKeluar', bbmKeluar);
  print.set('pc-keterangan', keterangan);
  print.set('pc-diperiksa', diperiksaOleh);

  const itemsBox = document.getElementById('pc-items');
  if (itemsBox) {
    const groups: Record<string, any[]> = {};
    const order: string[] = [];
    for (const row of itemRows()) {
      const grup = row.dataset.grup ?? "";
      const item = row.dataset.item ?? "";
      const status = row.querySelector<HTMLInputElement>('input[data-status]:checked')?.dataset.status ?? "Baik";
      const catatan = row.querySelector<HTMLInputElement>('[data-catatan]')?.value ?? "";
      if (!groups[grup]) { groups[grup] = []; order.push(grup); }
      groups[grup].push({ item, status, catatan });
    }
    let html = "";
    for (const g of order) {
      html += `<div style="margin:4px 0;font-weight:bold">${esc(g)} :</div>`;
      const items = groups[g] ?? [];
      for (const it of items) {
        let line = `  ${esc(it.item)} : ${esc(it.status)}`;
        if (it.status === 'Rusak' && it.catatan) line += ` (Rusak: ${esc(it.catatan)})`;
        html += `<div>${line}</div>`;
      }
    }
    itemsBox.innerHTML = html;
  }

  const dmgBox = document.getElementById('pc-damages');
  if (dmgBox) {
    const views = ['ATAS','KIRI','KANAN','DEPAN','BELAKANG'];
    let html = "";
    for (const v of views) {
      html += `<div style="margin:4px 0"><b>${v}</b>: `;
      if (marks.length) {
        marks.forEach((m) => {
          html += `<span style="color:red;font-weight:bold">✗</span> (${m.x},${m.y}) ${esc(m.catatan)} `;
        });
      } else {
        html += '-';
      }
      html += '</div>';
      html += `<div style="position:relative;display:inline-block;margin:4px 0"><img src="./ck-${v.toLowerCase()}.webp" style="max-width:200px;height:auto" alt="${v}">`;
      marks.forEach((m) => {
        html += `<span style="position:absolute;left:${m.x}%;top:${m.y}%;color:red;font-weight:bold;font-size:14px;transform:translate(-50%,-50%)">✗</span>`;
      });
      html += '</div><br>';
    }
    dmgBox.innerHTML = html;
  }

  print.run();
}

/** Daftar checklist yang sudah disimpan */
export function renderList(): void {
  const tbody = $('checklist-tbody');
  const cards = $('checklist-cards');
  if (!tbody || !cards) return;

  if (!store.checklist.length) {
    tbody.innerHTML = emptyRow(6, 'Tidak ada data checklist.');
    cards.innerHTML =
      `<div class="card p-8 text-center text-sm text-surface-400">Tidak ada data checklist.</div>`;
    must('ck-count').textContent = `0 dari ${store.checklist.length} checklist`;
    return;
  }

  tbody.innerHTML = store.checklist
    .map((item) => '<tr class="cursor-pointer border-b border-surface-100 hover:bg-surface-100"\n        data-action="dr-open" data-id="' + item.rowId + '">\n        <td class="px-4 py-3 text-sm font-bold whitespace-nowrap">' + (item.noDok || 'Form #' + item.rowId) + '</td>\n        <td class="px-4 py-3 text-sm whitespace-nowrap">' + (item.tanggal || '') + '</td>\n        <td class="px-4 py-3 text-sm font-semibold whitespace-nowrap">' + (item.driver || '') + '</td>\n        <td class="px-4 py-3 text-sm whitespace-nowrap">' + (item.kendaraan || '') + '</td>\n        <td class="min-w-48 px-4 py-3 text-sm">' + (item.keterangan || '') + '</td>\n        <td class="sticky-col px-4 py-3 text-right whitespace-nowrap">\n          <div class="inline-flex gap-1.5">\n            <button class="btn-slate" data-action="dr-open" data-id="' + item.rowId + '">Detail</button>\n            <button class="btn-primary" data-action="dr-pdf" data-id="' + item.rowId + '">' + icon('print') + ' PDF</button>\n          </div>\n        </td>\n      </tr>')
    .join('');

  cards.innerHTML = store.checklist
    .map((item) => '<div class="card p-4" data-action="dr-open" data-id="' + item.rowId + '">\n        <div class="flex items-start justify-between gap-2">\n          <div class="min-w-0">\n            <div class="text-xs font-bold text-primary-700 break-words">' + (item.noDok || 'Form #' + item.rowId) + '</div>\n            <div class="text-[11px] text-surface-400">' + (item.tanggal || '') + ' · ' + (item.driver || '') + '</div>\n          </div>\n          <div class="mt-2">\n            <div class="font-bold break-words">' + esc(orDash(item.keterangan)) + '</div>\n          </div>\n        </div>\n      </div>')
    .join('');

  must('ck-count').textContent = store.checklist.length + ' dari ' + store.checklist.length + ' checklist';
}

/* ---------- Bantuan DOM ---------- */

