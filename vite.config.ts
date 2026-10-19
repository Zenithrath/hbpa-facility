import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  // Relatif, supaya hasil build jalan di subfolder Laragon (www/hbpa-facility)
  // maupun di Vercel tanpa konfigurasi tambahan.
  base: './',
  build: {
    outDir: 'dist',
    // Aplikasi internal, tidak perlu sourcemap produksi.
    sourcemap: false,
  },
  server: {
    port: 5173,
    open: true,
  },
});