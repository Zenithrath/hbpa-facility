/**
 * checklist-canvas.ts — gambar kendaraan + penanda kerusakan.
 *
 * Dipakai bersama oleh form Checklist Kendaraan dan drawer edit daftar
 * checklist supaya pengguna menandai lokasi dengan klik gambar, bukan
 * menebak koordinat x/y.
 */

export interface DamageMark {
  view: string;
  x: number;
  y: number;
  catatan?: string;
}

export const DAMAGE_VIEWS = ["ATAS", "KIRI", "KANAN", "DEPAN", "BELAKANG"] as const;

/**
 * Ukuran kanvas tiap tampilan, mengikuti rasio viewBox SVG-nya supaya model
 * tidak gepeng dan koordinat penanda tetap sebanding:
 * atas 855×1829, kiri/kanan 1700×700, depan/belakang 1000×900.
 */
export const VIEW_DIMENSIONS: Record<string, { w: number; h: number }> = {
  ATAS: { w: 330, h: 706 },
  KIRI: { w: 680, h: 280 },
  KANAN: { w: 680, h: 280 },
  DEPAN: { w: 450, h: 405 },
  BELAKANG: { w: 450, h: 405 },
};

/**
 * Model kendaraan memakai SVG vektor (satu berkas per sisi, ~420 KB total),
 * jadi tetap tajam saat diperbesar dan hemat dibanding render bitmap lama.
 */
import ckAtas from "../assets/ck-atas.svg";
import ckBelakang from "../assets/ck-belakang.svg";
import ckDepan from "../assets/ck-depan.svg";
import ckKanan from "../assets/ck-kanan.svg";
import ckKiri from "../assets/ck-kiri.svg";

/** Sumber gambar per tampilan, dipakai kanvas input dan kertas cetak. */
export const CAR_SVG: Record<string, string> = {
  ATAS: ckAtas,
  KIRI: ckKiri,
  KANAN: ckKanan,
  DEPAN: ckDepan,
  BELAKANG: ckBelakang,
};

const carImages: Record<string, HTMLImageElement> = {};
const carLoading = new Set<string>();
const repainters = new Map<string, Set<() => void>>();

function carImageFor(view: string): HTMLImageElement | null {
  const src = CAR_SVG[view];
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

function emitRepaint(view: string): void {
  repainters.get(view)?.forEach((paint) => paint());
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function drawMarks(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: string,
  marks: readonly DamageMark[],
  pending: DamageMark | null,
): void {
  for (const mark of marks) {
    if (mark.view !== view) continue;
    const x = (mark.x / 100) * width;
    const y = (mark.y / 100) * height;
    ctx.strokeStyle = "#b91c1c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 7);
    ctx.lineTo(x + 7, y + 7);
    ctx.moveTo(x + 7, y - 7);
    ctx.lineTo(x - 7, y + 7);
    ctx.stroke();
  }

  if (!pending || pending.view !== view) return;

  const x = (pending.x / 100) * width;
  const y = (pending.y / 100) * height;
  ctx.strokeStyle = "#0d9488";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#0d9488";
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
}

export interface DamageCanvasBinding {
  paint(): void;
  destroy(): void;
}

/**
 * Pasang gambar kendaraan + penanda pada satu canvas. `read` dipanggil
 * setiap kali gambar selesai dimuat agar penanda terbaru ikut tampil.
 */
export function bindDamageCanvas(
  canvas: HTMLCanvasElement,
  view: string,
  read: () => { marks: readonly DamageMark[]; pending?: DamageMark | null },
  onPick?: (mark: { view: string; x: number; y: number }) => void,
): DamageCanvasBinding {
  const size = VIEW_DIMENSIONS[view];
  if (size) {
    canvas.width = size.w;
    canvas.height = size.h;
  }

  const paint = (): void => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const img = carImageFor(view);
    if (!img) return;
    if (!img.complete || img.naturalWidth === 0) {
      if (!carLoading.has(view)) {
        carLoading.add(view);
        img.addEventListener(
          "load",
          () => {
            carLoading.delete(view);
            emitRepaint(view);
          },
          { once: true },
        );
      }
      return;
    }

    // Gambar mengisi kanvas penuh (rasio kanvas = rasio SVG), jadi persentase
    // penanda di kanvas sama persis dengan persentase di kertas cetak.
    ctx.drawImage(img, 0, 0, width, height);

    const state = read();
    drawMarks(ctx, width, height, view, state.marks, state.pending ?? null);
  };

  let set = repainters.get(view);
  if (!set) {
    set = new Set();
    repainters.set(view, set);
  }
  set.add(paint);
  paint();

  if (onPick) {
    canvas.onclick = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = rect.width ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
      const y = rect.height ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
      onPick({ view, x: clampPercent(x), y: clampPercent(y) });
    };
  }

  return {
    paint,
    destroy() {
      set?.delete(paint);
      canvas.onclick = null;
    },
  };
}

/** Mulai decode gambar di latar belakang supaya kanvas cepat terisi. */
export function preloadDamageImages(): void {
  for (const view of Object.keys(CAR_SVG)) carImageFor(view);
}
