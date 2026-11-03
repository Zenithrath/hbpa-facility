/**
 * Build halaman user Checklist Kendaraan menjadi satu file self-contained
 * untuk Google Apps Script.
 *
 * Output source tetap di Vite; file `apps-script/checklist.html` adalah HASIL
 * GENERATE. Ubah source di src/, lalu jalankan `npm run build:checklist`.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist-checklist');
const SOURCE_HTML = path.join(DIST, 'checklist.html');
const TARGET_HTML = path.join(ROOT, 'apps-script', 'checklist.html');

const GENERATED_COMMENT =
  '<!-- GENERATED FILE. Dibuat oleh npm run build:checklist. Jangan edit manual. -->\n';

function fail(message) {
  console.error(`build:checklist: ${message}`);
  process.exit(1);
}

function readIfExists(file) {
  if (!fs.existsSync(file)) fail(`file tidak ditemukan: ${path.relative(ROOT, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function assetPath(assetUrl) {
  const clean = assetUrl.replace(/^\.\//, '').replace(/^\//, '');
  const file = path.join(DIST, clean);
  if (!file.startsWith(DIST)) fail(`asset keluar dari dist-checklist: ${assetUrl}`);
  return file;
}

function inlineScript(match, srcPath) {
  const js = readIfExists(assetPath(srcPath))
    // Jangan sampai payload JS tidak sengaja menutup tag <script>.
    .replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
}

function inlineStylesheet(_match, hrefPath) {
  const css = readIfExists(assetPath(hrefPath));
  return `<style>\n${css}\n</style>`;
}

function main() {
  let html = readIfExists(SOURCE_HTML);

  // Vite menambahkan modulepreload untuk chunk yang tidak diperlukan Apps Script.
  html = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, '');

  html = html.replace(
    /<script([^>]*?)\s+src="([^"]+)"([^>]*)><\/script>/g,
    (match, before, src, after) => {
      if (before.includes('src=') || after.includes('src=')) return match;
      return inlineScript(match, src);
    },
  );

  html = html.replace(
    /<link([^>]*?)\s+rel="stylesheet"([^>]*?)\s+href="([^"]+)"([^>]*?)\s*\/?>/g,
    (match, before, mid, href, after) => {
      if (before.includes('href=') || mid.includes('href=') || after.includes('href=')) return match;
      return inlineStylesheet(match, href);
    },
  );

  // Alternatif urutan atribut yang Vite kadang hasilkan.
  html = html.replace(
    /<link([^>]*?)\s+href="([^"]+)"([^>]*?)\s+rel="stylesheet"([^>]*?)\s*\/?>/g,
    (match, before, href, mid, after) => {
      if (before.includes('href=') || mid.includes('href=') || after.includes('href=')) return match;
      return inlineStylesheet(match, href);
    },
  );

  const externalAsset = /(?:src|href)="(?!data:|https?:|#|mailto:|tel:)\.?\/?assets\//i;
  const relativeImage = /\.\/ck-[a-z]+\.webp/i;

  if (externalAsset.test(html)) fail('masih ada referensi assets eksternal di Apps Script HTML');
  if (relativeImage.test(html)) fail('masih ada referensi gambar webp relatif');

  // Hindari dobel komentar kalau file lama sudah punya satu.
  html = html.replace(/^<!--\s*GENERATED FILE[\s\S]*?-->\s*/i, '');
  html = GENERATED_COMMENT + html;

  fs.mkdirSync(path.dirname(TARGET_HTML), { recursive: true });
  fs.writeFileSync(TARGET_HTML, html, 'utf8');
  const sizeKb = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
  console.log(`apps-script/checklist.html generated (${sizeKb} KB)`);
}

main();
