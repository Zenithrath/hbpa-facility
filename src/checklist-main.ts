/**
 * checklist-main.ts — entry standalone untuk Checklist Kendaraan di Apps Script.
 *
 * Sengaja tanpa shell dashboard, sidebar, navigasi, atau aksi admin. Halaman
 * ini hanya formulir input FM-FCL-02.04 yang dipakai user di luar aplikasi
 * admin.
 */

import './styles.css';
import { esc } from './ui';
import {
  checklistPageHtml,
  mountChecklistPage,
  catat,
  removeMark,
  reset,
  semuaBaik,
  save,
} from './pages/checklist';

const app = document.getElementById('app');

if (!app) {
  throw new Error('Container #app tidak ditemukan.');
}

app.innerHTML = `<main class="min-h-screen bg-surface-50 px-4 py-5 sm:px-6 sm:py-8">
  <div class="mx-auto max-w-5xl space-y-4">
    <header class="flex items-center gap-3 border-b border-surface-200 pb-4">
      <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-surface-200 bg-white p-1">
        <img src="https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png" alt="Logo HBPA" class="h-full w-auto">
      </div>
      <div class="min-w-0">
        <h1 class="text-lg font-extrabold leading-tight text-surface-900 sm:text-2xl">
          ${esc('Checklist Kendaraan')}
        </h1>
        <p class="mt-0.5 text-xs text-surface-500 sm:text-sm">
          ${esc('PT. HIDUP BARU PERDANA ABADI · FM-FCL-02.04')}
        </p>
      </div>
    </header>
    ${checklistPageHtml({ hidePrint: true })}
    <footer class="pb-2 text-center text-[11px] text-surface-400">
      Halaman input untuk user. Untuk daftar dan tindak lanjut, gunakan aplikasi admin.
    </footer>
  </div>
</main>`;

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const actionEl = target?.closest<HTMLElement>('[data-action]');
  const action = actionEl?.dataset.action;
  if (!action) return;

  // Nama aksi sama dengan halaman admin: save, print, reset, all-good,
  // add-mark, delete.
  switch (action) {
    case 'save':
      void save();
      return;
    case 'reset':
      reset();
      return;
    case 'all-good':
      semuaBaik();
      return;
    case 'add-mark':
      catat();
      return;
    case 'delete': {
      const id = Number(actionEl?.dataset.id ?? -1);
      if (id >= 0) removeMark(id);
      return;
    }
    default:
      return;
  }
});

mountChecklistPage({ resetOnSave: true });
