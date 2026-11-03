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

/** Ukuran bitmap tiap tampilan, mengikuti rasio gambar aslinya. */
export const VIEW_DIMENSIONS: Record<string, { w: number; h: number }> = {
  ATAS: { w: 300, h: 578 },
  KIRI: { w: 480, h: 320 },
  KANAN: { w: 480, h: 320 },
  DEPAN: { w: 480, h: 320 },
  BELAKANG: { w: 480, h: 320 },
};

/**
 * Gambar kendaraan memakai WebP hasil render, bukan SVG trace aslinya.
 * Lima SVG itu totalnya ~4 MB dan lama di-decode; versi WebP ini ~330 KB
 * sehingga halaman langsung tampil.
 */
import ckAtas from "../../public/ck-atas.webp";
import ckBelakang from "../../public/ck-belakang.webp";
import ckDepan from "../../public/ck-depan.webp";
import ckKanan from "../../public/ck-kanan.webp";
import ckKiri from "../../public/ck-kiri.webp";

const CAR_SRC: Record<string, string> = {
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

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.min(width / iw, height / ih) * 0.94;
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);

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
  for (const view of Object.keys(CAR_SRC)) carImageFor(view);
}
