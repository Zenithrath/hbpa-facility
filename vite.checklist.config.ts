import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  base: './',
  build: {
    outDir: 'dist-checklist',
    sourcemap: false,
    // Gambar kendaraan (±330 KB total) harus ikut ter-inline agar Apps Script
    // bisa mengirim satu HTML self-contained.
    assetsInlineLimit: 1024 * 1024,
    rollupOptions: {
      input: resolve(__dirname, 'checklist.html'),
    },
  },
});
