/* Smoke test sisi browser: jalankan main.ts di JSDOM dengan API palsu. */
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const { JSDOM, VirtualConsole } = require('jsdom');

const APP = path.join(__dirname, '..');

const TRANSPORT = [
  {
    rowId: 3, sig: 'a|b|c', noSurat: 'TR/202610/001', timestamp: '2026-10-19 10:00:00',
    tglPengajuan: '19/10/2026',
    nama: 'Budi', dept: 'Produksi', ijn: '001234', tujuan: 'Balikpapan',
    tglJam: 'Senin, 08:00', tanggal: '19/10/2026', nopol: 'KT 8107 YV',
    keperluan: 'KOperasi', status: 'Pending', pemohon: '-', disetujui: '-',
    driver: '-', tglCetak: '19/10/2026',
  },
  {
    rowId: 2, sig: 'd|e|f', noSurat: 'TR/202610/002', timestamp: '2026-10-18 09:00:00',
    tglPengajuan: '18/10/2026',
    nama: 'Dewi', dept: 'Sdm', ijn: '009876', tujuan: 'Tarakan',
    tglJam: 'Selasa, 09:00', tanggal: '18/10/2026', nopol: 'KT 1234 AB',
    keperluan: 'Rapat', status: 'Disetujui', pemohon: 'Dewi', disetujui: 'Sari',
    driver: 'Andi', tglCetak: '19/10/2026',
  },
];

const INVENTARIS = [
  {
    rowId: 2, sig: '1|Rina|10/10/2026', noDok: 'PB/001', nama: 'Rina', kontak: '08123',
    tglPinjam: '10/10/2026', tglKembali: '01/10/2026', keperluan: 'Pekerjaan lapangan',
    status: 'Dipinjam', tglKembaliAktual: '-', catatan: '-',
    items: [
      { n: '1', barang: 'Kamera', qty: '1', kondisiAmbil: 'Baik', kondisiKembali: '-' },
      { n: '2', barang: 'Tripod', qty: '2', kondisiAmbil: 'Baik', kondisiKembali: '-' },
    ],
  },
  {
    rowId: 3, sig: '2|Agus|19/10/2026', noDok: 'PB/002', nama: 'Agus', kontak: '08199',
    tglPinjam: '19/10/2026', tglKembali: '25/10/2026', keperluan: 'Dokumentasi',
    status: 'Dipinjam', tglKembaliAktual: '-', catatan: '-',
    items: [{ n: '1', barang: 'Laptop', qty: '1', kondisiAmbil: 'Baik', kondisiKembali: '-' }],
  },
];

const BOOTSTRAP = {
  stats: { total: 2, pending: 1, approved: 1, rejected: 0, completed: 0, month: 2 },
  departments: ['Produksi', 'Sdm', 'GA'],
  missingFields: [],
  itemColumns: 2,
};

const RESPONSES = {
  getBootstrap: BOOTSTRAP,
  getRequests: { items: TRANSPORT, pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 } },
  getInventarisData: INVENTARIS,
  updateRequest: { message: 'Tersimpan.' },
  saveInventaris: { message: 'Tersimpan.' },
  sendEmail: { sent: 1 },
  deleteRequest: { message: 'Dihapus.' },
};

const calls = [];
const urls = [];

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

function fakeFetch(url) {
  const action = new URL(url).searchParams.get('action');
  calls.push(action);
  urls.push(url);
  const body = RESPONSES[action] ?? { success: false, message: `aksi tidak dikenal: ${action}` };
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ success: true, data: body })),
  });
}

const API_URL = 'https://script.google.com/macros/s/X/exec';

async function build(apiUrl) {
  const out = await esbuild.build({
    entryPoints: [path.join(APP, 'src/main.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2022',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env.VITE_GAS_URL': JSON.stringify(apiUrl ?? null) },
  });
  return out.outputFiles[0].text;
}

const HTML = fs
  .readFileSync(path.join(APP, 'index.html'), 'utf8')
  .replace(/<script[^>]*><\/script>/g, '');

function makeDom(code, uncaught, logs) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => uncaught.push(e.message));
  vc.on('error', (...a) => logs.push(a.join(' ')));
  vc.on('warn', (...a) => logs.push('WARN ' + a.join(' ')));

  const dom = new JSDOM(HTML, {
    runScripts: 'outside-only',
    url: 'http://localhost/hbpa-facility/',
    virtualConsole: vc,
  });
  dom.window.fetch = fakeFetch;
  dom.window.confirm = () => true;
  dom.window.print = () => {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.eval(code);
  return dom;
}

async function run() {
  let pass = 0, fail = 0;
  const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    ok ? pass++ : fail++;
    console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok ? '' : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`));
  };
  const ok = (label, cond) => eq(label, Boolean(cond), true);

  // ---- Skenario 1: API_URL masih kosong ----
  const emptyErrors = [];
  const emptyLogs = [];
  const empty = makeDom(await build(null), emptyErrors, emptyLogs);
  await tick();
  const emptyDoc = empty.window.document;
  const emptyText = () => emptyDoc.body.textContent.replace(/\s+/g, ' ');

  console.log('\n--- boot tanpa API_URL ---');
  ok('tidak ada exception', emptyErrors.length === 0);
  ok('pesan API_URL kosong muncul', emptyText().includes('API_URL belum diisi'));
  ok('sidebar tetap dirender', Boolean(emptyDoc.getElementById('sidebar')));
  ok('3 menu navigasi', emptyDoc.querySelectorAll('#nav [data-page]').length === 3);

  // ---- Skenario 2: API_URL terisi ----
  const uncaught = [];
  const logs = [];
  const dom = makeDom(await build(API_URL), uncaught, logs);
  const { window } = dom;
  const doc = window.document;
  const text = () => doc.body.textContent.replace(/\s+/g, ' ');
  const errors = uncaught;
  await tick(200);

  console.log('\n--- halaman Overview ---');
  ok('judul halaman', doc.getElementById('title').textContent === 'Overview');
  eq('jumlah kartu statistik', doc.querySelectorAll('#stats > div').length, 6);
  eq('total permintaan', doc.getElementById('s-total').textContent, '2');
  eq('pending', doc.getElementById('s-pending').textContent, '1');
  eq('disetujui', doc.getElementById('s-approved').textContent, '1');
  eq('2 permintaan di daftar email', doc.querySelectorAll('#email-list label').length, 2);
  ok('tidak ada peringatan kolom', !text().includes('tidak ditemukan di spreadsheet'));

  console.log('\n--- pindah ke Daftar Permintaan ---');
  doc.querySelector('[data-page="transport"]').click();
  await tick();
  if (logs.length) console.log('   [log]', logs.slice(0, 4).join('\n         '));
  eq('judul', doc.getElementById('title').textContent, 'Daftar Permintaan Transportasi');
  eq('jumlah baris tabel', doc.querySelectorAll('#tbody tr').length, 2);
  eq('jumlah header kolom', doc.querySelectorAll('#thead th').length, 11);
  eq('pilihan divisi terisi', doc.getElementById('filter-dept').options.length, 4);
  ok('nomor surat tampil', text().includes('TR/202610/001'));

  console.log('\n--- filter & pencarian ---');
  const q = doc.getElementById('q');
  q.value = 'dewi';
  q.dispatchEvent(new window.Event('input', { bubbles: true }));
  eq('cari "dewi"', doc.querySelectorAll('#tbody tr').length, 1);
  q.value = '';
  q.dispatchEvent(new window.Event('input', { bubbles: true }));
  const sel = doc.getElementById('filter-status');
  sel.value = 'Pending';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  eq('filter Pending', doc.querySelectorAll('#tbody tr').length, 1);
  sel.value = '';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));

  console.log('\n--- drawer edit ---');
  doc.querySelector('#tbody tr').click();
  await tick(60);
  ok('drawer terbuka', doc.getElementById('drawer').classList.contains('open'));
  ok('nomor surat tampil di drawer', doc.getElementById('f-noSurat').value === 'TR/202610/001');
  eq('jumlah input di drawer', doc.querySelectorAll('#drawer-body input, #drawer-body select, #drawer-body textarea').length, 12);
  const jam = doc.getElementById('f-jam');
  eq('jam terisi dari HARI/TANGGAL/JAM', jam && jam.value, '08:00');
  const ids = [...doc.querySelectorAll('#drawer-body [id^="f-"]')].map((e) => e.id);
  eq('tidak ada id form duplikat', ids.length, new Set(ids).size);

  doc.getElementById('f-nopol').value = 'kt 9999 zz';
  doc.getElementById('f-noSurat').value = '009/X/FCL/2026';
  doc.getElementById('f-jam').value = '10:30';
  doc.getElementById('filter-status').value = 'Disetujui';
  doc.getElementById('filter-dept').value = 'GA';
  doc.querySelector('[data-action="save"]').click();
  await tick();
  ok('updateRequest benar-benar dipanggil', calls.includes('updateRequest'));
  const updUrl = [...urls].reverse().find((u) => u.includes('action=updateRequest')) || '';
  const sent = JSON.parse(new URL(updUrl).searchParams.get('data'));
  eq('no. surat dari drawer', sent.noSurat, '009/X/FCL/2026');
  eq('jam dari drawer', sent.jam, '10:30');
  eq('status dari drawer, bukan dari filter', sent.status, 'Pending');
  eq('dept dari drawer, bukan dari filter', sent.dept, 'Produksi');

  console.log('\n--- halaman Inventaris ---');
  doc.querySelector('[data-page="inventaris"]').click();
  await tick();
  eq('judul', doc.getElementById('title').textContent, 'Peminjaman Inventaris Barang');
  eq('total peminjaman', doc.getElementById('i-total').textContent, '2');
  eq('dipinjam', doc.getElementById('i-dipinjam').textContent, '1');
  eq('overdue', doc.getElementById('i-overdue').textContent, '1');
  eq('baris tabel', doc.querySelectorAll('#inv-tbody tr').length, 2);

  doc.querySelector('#inv-tbody tr').click();
  await tick(60);
  const kondisiIds = [...doc.querySelectorAll('#drawer-body select[id^="k-"]')].map((e) => e.id);
  eq('ID kondisi comeback unik (bug lama)', kondisiIds, ['k-1', 'k-2']);
  ok('tidak ada id "undefined"', !doc.getElementById('drawer-body').innerHTML.includes('undefined'));
  doc.getElementById('k-1').value = 'Rusak';
  doc.getElementById('f-noDok').value = 'PB/007';
  doc.getElementById('f-status').value = 'Selesai';
  doc.getElementById('f-tglKembaliAktual').value = '';
  doc.getElementById('f-status').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('tanggal terisi otomatis saat Selesai', doc.getElementById('f-tglKembaliAktual').value.length === 10);
  doc.querySelector('[data-action="inv-save"]').click();
  await tick();
  ok('saveInventaris benar-benar dipanggil', calls.includes('saveInventaris'));
  const invUrl = [...urls].reverse().find((u) => u.includes('action=saveInventaris')) || '';
  const invSent = JSON.parse(new URL(invUrl).searchParams.get('data'));
  eq('no dokumen dari drawer', invSent.noDok, 'PB/007');

  console.log('\n--- cetak ---');
  doc.querySelector('[data-page="transport"]').click();
  await tick();
  doc.querySelector('[data-action="print"]').click();
  await tick(60);
  ok('area cetak transport tampil', !doc.getElementById('print-transport').classList.contains('hidden'));
  ok('nomor surat masuk ke area cetak', doc.getElementById('p-nosurat').textContent.length > 0);

  console.log('\n--- email & hapus ---');
  doc.querySelector('[data-page="overview"]').click();
  await tick();
  doc.querySelector('#email-list input[type="checkbox"]').click();
  doc.querySelector('[data-action="send-selected"]').click();
  await tick();
  ok('sendEmail dipanggil', calls.includes('sendEmail'));
  const mailUrl = urls.find((u) => u.includes('action=sendEmail')) || '';
  ok('rowIds dikirim sebagai parameter langsung', /[?&]rowIds=\d+(&|$)/.test(mailUrl));
  ok('rowIds tidak dibungkus data JSON', !/[?&]data=/.test(mailUrl));

  doc.querySelector('[data-page="transport"]').click();
  await tick();
  doc.querySelector('#tbody [data-action="delete"]').click();
  await tick();
  ok('deleteRequest dipanggil', calls.includes('deleteRequest'));
  const delUrl = urls.find((u) => u.includes('action=deleteRequest')) || '';
  ok('rowId hapus dikirim langsung', /[?&]rowId=\d+(&|$)/.test(delUrl));

  console.log('\n--- tidak ada error JS sepanjang jalan ---');
  eq('error', errors, []);
  console.log(`\n=== ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });