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
    tglPinjam: '19/10/2026', tglKembali: '31/12/2026', keperluan: 'Dokumentasi',
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

const MASTERS = {
  role: 'admin',
  email: 'bos@hbpa.test',
  driver: '',
  drivers: [{ nama: 'Andi', email: 'andi@hbpa.test', status: 'Aktif' }],
  kendaraan: [{ noPlat: 'KT 8107 YV', tipe: 'Avanza', status: 'Aktif' }],
  items: [
    { grup: 'Kaca', item: 'Depan', urut: 1, status: 'Aktif' },
    { grup: 'Ban', item: 'Serep', urut: 1, status: 'Aktif' },
  ],
  ijn: [{ ijn: '001234', tujuan: 'Balikpapan' }],
  bbmLevels: ['E', '1/4', '1/2', '3/4', 'F'],
  ckStatuses: ['Baik', 'Rusak', 'Tidak Ada'],
  views: ['ATAS', 'KIRI', 'KANAN', 'DEPAN', 'BELAKANG'],
  ckFormCode: 'FM-FCL-02.04',
  ckRev: '00',
};

const SAVE_DR = {
  item: {
    id: 'DR-20261026-001', hari: 'Senin', tanggal: '26/10/2026',
    driver: 'Andi', status: 'Baru', linkPdf: 'https://drive.example/dr',
  },
  message: 'Surat Tugas tersimpan. PDF siap dicetak.',
};

const SAVE_CK = {
  item: {
    id: 'CK-20261026-001', tanggal: '26/10/2026', noPolisi: 'KT 8107 YV',
    tipeMobil: 'Avanza', status: 'Baru', linkPdf: 'https://drive.example/ck',
  },
  hasRusak: true,
  message: 'Checklist tersimpan. PDF siap dicetak.',
};

const DR_DOCS = [
  {
    rowId: 12, id: '', hari: 'Rabu', tanggal: '28/10/2026', driver: 'Andi',
    mengetahui: 'Sari', status: 'Submitted', createdBy: 'andi@hbpa.test',
    createdAt: '28/10/2026 07:05', linkPdf: '',
    rows: [
      {
        start: '07:00', finish: '09:30', total: '02:30', nopol: 'KT 8107 YV',
        ijn: '001234', namaUser: 'Dewi', km: '120', solar: '10', uraian: 'Antar dokumen',
      },
    ],
  },
  {
    rowId: 11, id: 'DR-20261027-001', hari: 'Selasa', tanggal: '27/10/2026', driver: 'Budi',
    mengetahui: 'Sari', status: 'Selesai', createdBy: 'budi@hbpa.test',
    createdAt: '27/10/2026 08:00', linkPdf: 'https://drive.example/dr-11',
    rows: [
      {
        start: '08:00', finish: '10:00', total: '02:00', nopol: 'KT 9999 ZZ',
        ijn: '009876', namaUser: 'Rina', km: '80', solar: '8', uraian: 'Kirim barang',
      },
    ],
  },
];

const DR_PDF = {
  rowId: 12,
  id: '',
  filename: 'Surat Tugas Form 12 - Andi.pdf',
  linkPdf: 'https://drive.example/dr-12.pdf',
  dataUrl: '',
};

const MR_REQUESTS = [
  {
    rowId: 4, sig: 'r4|budi', timestamp: '03/11/2026 07:30',
    requesterEmail: 'budi@hbpa.test', requesterName: 'Budi Santoso',
    department: 'Produksi', division: 'Maintenance', requestedDate: '03/11/2026',
    requiredManpower: 'Electrical, Civil', jobOutline: '1. Ganti lampu\n2. Perbaiki kabel',
  },
  {
    rowId: 3, sig: 'r3|sari', timestamp: '02/11/2026 08:15',
    requesterEmail: 'sari@hbpa.test', requesterName: 'Sari',
    department: 'GA', division: 'General', requestedDate: '02/11/2026',
    requiredManpower: 'Mechanical', jobOutline: '1. Service kompresor',
  },
];

const MR_COMPLETIONS = [
  {
    rowId: 7, sig: 'c7|andi', timestamp: '03/11/2026 16:10',
    submittedByEmail: 'andi@hbpa.test', reportedBy: 'Andi',
    jobName: 'Perbaikan Panel', jobNo: 'MR-PANEL-01', location: 'Workshop',
    dateTime: '03/11/2026 13:30', manpower: '1. Andi | Electrical\n2. Budi | Civil',
    jobDescriptionLog: '1. 03/11/2026 08:00 | Cek panel\n2. 03/11/2026 10:00 | Ganti kabel',
    endUserName: 'Joko', endUserPosition: 'Supervisor',
  },
];

const RESPONSES = {
  getBootstrap: BOOTSTRAP,
  getRequests: { items: TRANSPORT, pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 } },
  getInventarisData: INVENTARIS,
  getMasters: MASTERS,
  getDrData: DR_DOCS,
  drPdf: DR_PDF,
  saveDr: SAVE_DR,
  saveCk: SAVE_CK,
  updateRequest: { message: 'Tersimpan.' },
  saveInventaris: { message: 'Tersimpan.' },
  sendEmail: { sent: 1 },
  deleteRequest: { message: 'Dihapus.' },
  // MR API action names
  getSummary: { totalRequests: 2, totalCompletions: 1 },
  getCompletions: { items: MR_COMPLETIONS, pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } },
  saveRequest: MR_REQUESTS[0],
  saveCompletion: MR_COMPLETIONS[0],
  deleteCompletion: { deleted: true },
};

const calls = [];
const bodies = [];
const urls = [];
const opened = [];

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

function fakeFetch(url, options) {
  let action = new URL(url).searchParams.get('action');
  if (!action && options?.body) {
    try {
      action = JSON.parse(String(options.body)).action;
    } catch {
      action = '';
    }
  }
  calls.push(action);
  if (options?.body) {
    try {
      bodies.push(JSON.parse(String(options.body)));
    } catch {
      // body bukan JSON, abaikan
    }
  }
  urls.push(url);
  const isManpower = url.includes('/macros/s/MR/exec');
  const body = isManpower && action === 'getRequests'
    ? { items: MR_REQUESTS, pagination: { page: 1, pageSize: 100, total: MR_REQUESTS.length, totalPages: 1 } }
    : (RESPONSES[action] ?? { success: false, message: `aksi tidak dikenal: ${action}` });
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ success: true, data: body })),
  });
}

const API_URL = 'https://script.google.com/macros/s/X/exec';
const MR_API_URL = 'https://script.google.com/macros/s/MR/exec';

async function build(entry, apiUrl) {
  const out = await esbuild.build({
    entryPoints: [path.join(APP, entry)],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2022',
    loader: { '.css': 'empty', '.webp': 'dataurl', '.svg': 'dataurl' },
    define: {
      'import.meta.env.VITE_GAS_URL': JSON.stringify(apiUrl ?? null),
      'import.meta.env.VITE_MR_GAS_URL': JSON.stringify(MR_API_URL),
    },
  });
  return out.outputFiles[0].text;
}

const HTML = fs
  .readFileSync(path.join(APP, 'index.html'), 'utf8')
  .replace(/<script[^>]*><\/script>/g, '');

const STANDALONE_HTML_PATH = path.join(APP, 'checklist.html');
const STANDALONE_HTML = fs.existsSync(STANDALONE_HTML_PATH)
  ? fs.readFileSync(STANDALONE_HTML_PATH, 'utf8').replace(/<script[^>]*><\/script>/g, '')
  : '<!doctype html><div id="app"></div>';

function makeDom(code, uncaught, logs, html = HTML, url = 'http://localhost/hbpa-facility/') {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => uncaught.push(e.message));
  vc.on('error', (...a) => logs.push(a.join(' ')));
  vc.on('warn', (...a) => logs.push('WARN ' + a.join(' ')));

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url,
    virtualConsole: vc,
  });
  dom.window.fetch = fakeFetch;
  dom.window.confirm = () => true;
  dom.window.print = () => {};
  dom.window.open = (url) => {
    const target = String(url ?? '');
    if (target && target !== 'about:blank') opened.push(target);
    return {
      location: {
        set href(value) {
          opened.push(String(value));
        },
      },
      close() {},
    };
  };
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  dom.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
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
  const empty = makeDom(await build('src/main.ts', null), emptyErrors, emptyLogs);
  await tick();
  const emptyDoc = empty.window.document;
  const emptyText = () => emptyDoc.body.textContent.replace(/\s+/g, ' ');

  console.log('\n--- boot tanpa API_URL ---');
  ok('tidak ada exception', emptyErrors.length === 0);
  ok('pesan API_URL kosong muncul', emptyText().includes('API_URL belum diisi'));
  ok('sidebar tetap dirender', Boolean(emptyDoc.getElementById('sidebar')));
  ok('6 menu navigasi (4 Peminjaman + 2 Manpower)', emptyDoc.querySelectorAll('#nav [data-page]').length === 6);
  ok('section PEMINJAMAN tampil', emptyDoc.getElementById('nav')?.textContent.includes('PEMINJAMAN'));
  ok('section MANPOWER tampil', emptyDoc.getElementById('nav')?.textContent.includes('MANPOWER'));

  // ---- Skenario 2: API_URL terisi ----
  const uncaught = [];
  const logs = [];
  const dom = makeDom(await build('src/main.ts', API_URL), uncaught, logs);
  const { window } = dom;
  const doc = window.document;
  const text = () => doc.body.textContent.replace(/\s+/g, ' ');
  const errors = uncaught;
  await tick(200);

  console.log('\n--- boot ke halaman pertama ---');
  eq('halaman pertama = Transport Requests', doc.getElementById('title').textContent, 'Transport Requests');
  ok('tidak ada tombol Overview di navigasi', !doc.querySelector('[data-page="overview"]'));
  ok('tidak ada peringatan kolom', !text().includes('tidak ditemukan di spreadsheet'));

  console.log('\n--- pindah ke Daftar Permintaan ---');
  doc.querySelector('[data-page="transport"]').click();
  await tick();
  if (logs.length) console.log('   [log]', logs.slice(0, 4).join('\n         '));
  eq('judul', doc.getElementById('title').textContent, 'Transport Requests');
  eq('jumlah baris tabel', doc.querySelectorAll('#tbody tr').length, 2);
  eq('jumlah header kolom', doc.querySelectorAll('#thead th').length, 11);
  eq('tidak ada dropdown status', doc.getElementById('filter-status'), null);
  eq('tidak ada dropdown divisi', doc.getElementById('filter-dept'), null);
  eq('tidak ada tombol ekspor', doc.querySelector('[data-action="export"]'), null);
  eq('tidak ada tombol permintaan baru', doc.querySelector('[data-action="new"]'), null);
  ok('nomor surat tampil', text().includes('TR/202610/001'));

  console.log('\n--- pencarian ---');
  const q = doc.getElementById('q');
  q.value = 'dewi';
  q.dispatchEvent(new window.Event('input', { bubbles: true }));
  eq('cari "dewi"', doc.querySelectorAll('#tbody tr').length, 1);
  q.value = '';
  q.dispatchEvent(new window.Event('input', { bubbles: true }));

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
  eq('judul', doc.getElementById('title').textContent, 'Inventory Borrowing');
  eq('baris tabel', doc.querySelectorAll('#inv-tbody tr').length, 2);
  const invActions = [...doc.querySelectorAll('#inv-tbody tr:first-child [data-action]')].map((el) => el.dataset.action);
  ok('aksi list Inventaris: detail, cetak, hapus', ['detail', 'print', 'delete'].every((a) => invActions.includes(a)));

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
  doc.querySelector('#drawer-footer [data-action="save"]').click();
  await tick();
  ok('saveInventaris benar-benar dipanggil', calls.includes('saveInventaris'));
  const invUrl = [...urls].reverse().find((u) => u.includes('action=saveInventaris')) || '';
  const invSent = JSON.parse(new URL(invUrl).searchParams.get('data'));
  eq('no dokumen dari drawer', invSent.noDok, 'PB/007');

  console.log('\n--- halaman Daily Report ---');
  doc.querySelector('[data-page="daily"]').click();
  await tick();
  eq('judul daily report', doc.getElementById('title').textContent, 'Assignment Letter / Daily Report');
  eq('2 dokumen tampil', doc.querySelectorAll('#dr-tbody tr').length, 2);
  const drActions = [...doc.querySelectorAll('#dr-tbody tr:first-child [data-action]')].map((el) => el.dataset.action);
  ok('aksi list Daily Report: detail, cetak, hapus', ['detail', 'print', 'delete'].every((a) => drActions.includes(a)));
  ok('tidak ada form input DR', !doc.getElementById('dr-driver'));
  ok('tidak ada tombol simpan DR', !doc.querySelector('[data-action="dr-save"]'));
  ok('baris Google Form tanpa ID diberi label', doc.querySelector('#dr-tbody tr').textContent.includes('Form #12'));

  doc.getElementById('dr-q').value = 'antar dokumen';
  doc.getElementById('dr-q').dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick(30);
  eq('pencarian menyaring daftar', doc.querySelectorAll('#dr-tbody tr').length, 1);

  doc.getElementById('dr-q').value = '';
  doc.getElementById('dr-q').dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick(30);
  eq('daftar kembali lengkap', doc.querySelectorAll('#dr-tbody tr').length, 2);

  doc.querySelector('#dr-tbody tr').click();
  await tick(60);
  ok('drawer detail terbuka', !doc.getElementById('drawer').classList.contains('hidden'));
  ok('drawer memuat driver', doc.getElementById('drawer-body').textContent.includes('Andi'));
  ok('drawer memuat uraian', (doc.getElementById('dr-r0-uraian') || {}).value === 'Antar dokumen');
  ok('drawer punya tombol Cetak', Boolean(doc.querySelector('#drawer-footer [data-action="print"]')));

  doc.querySelector('#drawer-footer [data-action="print"]').click();
  await tick(60);
  ok('modal tanda tangan muncul sebelum cetak', !doc.getElementById('sig-modal').classList.contains('hidden'));
  ok('slot daily: kanvas tanda tangan tersedia', Boolean(doc.getElementById('sig-canvas-driver')) && Boolean(doc.getElementById('sig-canvas-mengetahui')));
  ok('saveDr tidak dipanggil dari dashboard', !calls.includes('saveDr'));
  doc.getElementById('sig-name-driver').value = 'Andi Saputra';
  doc.getElementById('sig-name-mengetahui').value = 'Sari';
  doc.getElementById('sig-confirm').click();
  await tick(60);
  ok('area cetak daily tampil', !doc.getElementById('print-daily').classList.contains('hidden'));
  ok('tanda tangan driver masuk ke area cetak', doc.getElementById('pd-ttd-driver').textContent.includes('Andi Saputra'));
  ok('tanda tangan mengetahui masuk ke area cetak', doc.getElementById('pd-ttd-mengetahui').textContent.includes('Sari'));

  ok('route input Checklist Kendaraan dihapus dari dashboard', !doc.querySelector('[data-page="checklist"]'));
  ok('Daftar Checklist tetap tersedia untuk admin', Boolean(doc.querySelector('[data-page="checklist-list"]')));

  console.log('\n--- cetak ---');
  doc.querySelector('[data-page="transport"]').click();
  await tick();
  doc.querySelector('[data-action="print"]').click();
  await tick(60);
  ok('modal tanda tangan muncul sebelum cetak transport', !doc.getElementById('sig-modal').classList.contains('hidden'));
  ok('slot transport: kanvas tanda tangan tersedia', Boolean(doc.getElementById('sig-canvas-pemohon')) && Boolean(doc.getElementById('sig-canvas-disetujui')));
  doc.getElementById('sig-name-pemohon').value = 'Budi Santoso';
  doc.getElementById('sig-role-pemohon').value = 'Karyawan';
  doc.getElementById('sig-name-disetujui').value = 'Sari';
  doc.getElementById('sig-confirm').click();
  await tick(60);
  ok('area cetak transport tampil', !doc.getElementById('print-transport').classList.contains('hidden'));
  ok('nomor surat masuk ke area cetak', doc.getElementById('p-nosurat').textContent.length > 0);
  ok('tanda tangan pemohon masuk ke area cetak', doc.getElementById('p-ttd-pemohon').textContent.includes('Budi Santoso'));
  ok('jabatan pemohon ikut tercetak', doc.getElementById('p-ttd-pemohon').textContent.includes('Karyawan'));
  ok('tanda tangan disetujui masuk ke area cetak', doc.getElementById('p-ttd-approve').textContent.includes('Sari'));

  console.log('\n--- email & hapus ---');
  doc.querySelector('#tbody [data-action="email"]').click();
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

  // ---- Skenario 3: halaman user standalone di Apps Script ----
  console.log('\n--- halaman Checklist standalone Apps Script ---');
  calls.length = 0;
  urls.length = 0;
  opened.length = 0;
  const standaloneErrors = [];
  const standaloneLogs = [];
  const standalone = makeDom(
    await build('src/checklist-main.ts', API_URL),
    standaloneErrors,
    standaloneLogs,
    STANDALONE_HTML,
    'https://script.google.com/macros/s/X/exec?page=checklist',
  );
  await tick();
  const standaloneDoc = standalone.window.document;
  ok('tanpa sidebar/menu admin', !standaloneDoc.getElementById('sidebar'));
  ok('tanpa topbar dashboard', !standaloneDoc.querySelector('#nav'));
  ok('judul halaman standalone', standaloneDoc.querySelector('h1')?.textContent.includes('Checklist Kendaraan'));
  eq('item dari master tampil', standaloneDoc.querySelectorAll('#ck-grup .ck-item').length, 2);
  ok('tombol Cetak tidak tampil di user page', !standaloneDoc.querySelector('[data-action="print"]'));

  const ckRow = standaloneDoc.querySelector('#ck-grup .ck-item');
  const rusak = ckRow.querySelector('input[data-status="Rusak"]');
  rusak.checked = true;
  rusak.dispatchEvent(new standalone.window.Event('change', { bubbles: true }));
  ok('catatan muncul saat Rusak', !ckRow.querySelector('[data-catatan]').classList.contains('hidden'));
  ckRow.querySelector('[data-catatan]').value = 'retak';

  const damageCanvas = standaloneDoc.querySelector('#ck-cv-KIRI');
  damageCanvas.dispatchEvent(new standalone.window.MouseEvent('click', { bubbles: true, clientX: 40, clientY: 80 }));
  standaloneDoc.getElementById('ck-sisiCatatan').value = 'baret';
  standaloneDoc.querySelector('[data-action="add-mark"]').click();
  ok('penanda kerusakan tercatat', standaloneDoc.getElementById('ck-markCount').textContent === '1');

  ok('field No. Plat tampil', Boolean(standaloneDoc.getElementById('ck-kendaraan')));
  ok('field Tipe Mobil tampil', Boolean(standaloneDoc.getElementById('ck-tipeMobil')));

  standaloneDoc.getElementById('ck-kendaraan').value = 'KT 8107 YV';
  standaloneDoc.getElementById('ck-tipeMobil').value = 'Avanza';
  standaloneDoc.getElementById('ck-driver').value = 'Andi';
  standaloneDoc.getElementById('ck-kilometer').value = 'abc';
  standaloneDoc.querySelector('[data-action="save"]').click();
  await tick(10);
  ok('dialog validasi Kilometer muncul', Boolean(standaloneDoc.getElementById('app-dialog')));
  ok('dialog validasi menyebut Kilometer', standaloneDoc.getElementById('app-dialog')?.textContent.includes('Kilometer'));
  eq('field Kilometer diberi status invalid', standaloneDoc.getElementById('ck-kilometer')?.getAttribute('aria-invalid'), 'true');
  ok('API save belum dipanggil saat validasi gagal', !calls.includes('saveCk'));
  standaloneDoc.getElementById('app-dialog-ok').click();

  standaloneDoc.getElementById('ck-kilometer').value = '62.000';
  standaloneDoc.getElementById('ck-bbmMasuk').value = '1/2';
  standaloneDoc.getElementById('ck-bbmKeluar').value = '1/4';
  standaloneDoc.querySelector('[data-action="save"]').click();
  await tick();
  ok('saveCk benar-benar dipanggil dari standalone', calls.includes('saveCk'));
  ok('dialog berhasil muncul setelah simpan', standaloneDoc.getElementById('app-dialog')?.textContent.includes('Berhasil'));
  ok('dialog berhasil menyebut form kosong', standaloneDoc.getElementById('app-dialog')?.textContent.includes('dikosongkan'));
  standaloneDoc.getElementById('app-dialog-ok').click();
  const standaloneSaveUrl = [...urls].reverse().find((u) => u.includes('action=saveCk')) || '';
  const standaloneSent = JSON.parse(new URL(standaloneSaveUrl).searchParams.get('data'));
  eq('items CK standalone terkirim', standaloneSent.items.length, 2);
  eq('kendaraan CK standalone terkirim', standaloneSent.kendaraan, 'KT 8107 YV');
  eq('tipe mobil standalone terkirim', standaloneSent.tipeMobil, 'Avanza');
  eq('Kilometer dinormalisasi', standaloneSent.kilometer, '62000');
  eq('catatan rusak standalone terkirim', standaloneSent.items[0].catatan, 'retak');
  ok('damage koordinat tetap terkirim', Array.isArray(standaloneSent.damages) && standaloneSent.damages.length === 1 && standaloneSent.damages[0].view === 'KIRI');
  ok('payload tidak mengirim PNG', !('pngs' in standaloneSent));
  ok('tidak ada alert gambar terlalu besar', !standaloneDoc.getElementById('ck-msg')?.textContent.includes('Gambar kerusakan'));
  eq('form kembali kosong setelah simpan', standaloneDoc.getElementById('ck-kendaraan').value, '');
  eq('tipe mobil kembali kosong setelah simpan', standaloneDoc.getElementById('ck-tipeMobil').value, '');
  ok('link PDF tidak ditampilkan ke user', !standaloneDoc.getElementById('ck-hasil')?.textContent.includes('CK-'));
  eq('error standalone', standaloneErrors, []);

  // ---- Skenario 4: MANPOWER di dashboard yang sama ----
  console.log('\n--- section MANPOWER ---');
  calls.length = 0;
  urls.length = 0;
  doc.querySelector('[data-page="manpower-requisition"]').click();
  await tick();
  eq('judul Manpower Requisition', doc.getElementById('title').textContent, 'Manpower Requisition');
  eq('2 requisition tampil', doc.querySelectorAll(`#mr-tbody tr`).length, 2);
  const mrActions = [...doc.querySelectorAll('#mr-tbody tr:first-child [data-action]')].map((el) => el.dataset.action);
  ok('aksi list Manpower: detail, cetak, hapus', ['detail', 'print', 'delete'].every((a) => mrActions.includes(a)));
  const mrActionCell = doc.querySelector('#mr-tbody tr:first-child > td.sticky-col > div');
  ok(
    'aksi Manpower urut ke bawah rata kanan',
    !!mrActionCell && mrActionCell.classList.contains('flex-col') && mrActionCell.classList.contains('items-end'),
  );
  eq('sel aksi Manpower tidak bersarang', doc.querySelectorAll('#mr-tbody tr:first-child > td').length, 6);
  doc.querySelector('#mr-tbody tr').click();
  await tick(50);
  ok('klik baris Manpower membuka drawer', !doc.getElementById('drawer').classList.contains('hidden'));
  doc.querySelector('[data-action="close-drawer"]').click();
  await tick();
  doc.querySelector('#mr-tbody-cards > div').click();
  await tick(50);
  ok('klik kartu Manpower membuka drawer', !doc.getElementById('drawer').classList.contains('hidden'));
  doc.querySelector('[data-action="close-drawer"]').click();
  await tick();
  doc.querySelector('[data-action="detail"][data-id="4"]').click();
  await tick(50);
  ok('drawer Manpower Requisition terbuka', !doc.getElementById('drawer').classList.contains('hidden'));
  const contentPad = doc.querySelector('#drawer .mpr-drawer .content-pad');
  Object.defineProperty(contentPad, 'clientHeight', { configurable: true, get: () => 100 });
  Object.defineProperty(contentPad, 'scrollHeight', { configurable: true, get: () => 200 });
  const outlineCell = doc.querySelector('#drawer .mpr-outline-cell');
  const outlineBefore = outlineCell.innerHTML;
  outlineCell.textContent = `${outlineBefore} teks yang bikin lembar penuh`;
  outlineCell.dispatchEvent(new window.Event('input', { bubbles: true }));
  eq('editor A5 menolak teks saat lembar penuh', outlineCell.innerHTML, outlineBefore);
  doc.querySelector('#mr-r-requesterName').textContent = 'Budi Update';
  doc.querySelector('[data-action="save"][data-id="4"]').click();
  await tick();
  ok('saveRequest dipanggil', calls.includes('saveRequest'));

  doc.querySelector('[data-action="print"][data-id="4"]').click();
  await tick(50);
  ok('modal tanda tangan Manpower Requisition muncul', !doc.getElementById('sig-modal').classList.contains('hidden'));
  doc.getElementById('sig-name-approved').value = 'Sari';
  doc.getElementById('sig-name-requested').value = 'Budi Santoso';
  doc.getElementById('sig-confirm').click();
  await tick(50);
  ok('area cetak Manpower Requisition tampil', !doc.getElementById('print-manpower-requisition').classList.contains('hidden'));
  eq('nama tersimpan di area cetak', doc.getElementById('mpr-requestedName').textContent, 'Budi Santoso');
  // Nomor baris dicetak oleh kolom "no" di form, jadi teks isinya tanpa "1.".
  eq('job outline masuk cetak', doc.getElementById('mpr-outline-1').textContent, 'Ganti lampu');
  doc.querySelector('[data-action="close-drawer"]').click();

  doc.querySelector('[data-page="job-completion"]').click();
  await tick();
  eq('judul Job Completion', doc.getElementById('title').textContent, 'Job Completion');
  eq('1 completion tampil', doc.querySelectorAll(`#mc-tbody tr`).length, 1);
  const mcActions = [...doc.querySelectorAll('#mc-tbody tr:first-child [data-action]')].map((el) => el.dataset.action);
  ok('aksi list Job Completion: detail, cetak, hapus', ['detail', 'print', 'delete'].every((a) => mcActions.includes(a)));
  const mcActionCell = doc.querySelector('#mc-tbody tr:first-child > td.sticky-col > div');
  ok(
    'aksi Job Completion urut ke bawah rata kanan',
    !!mcActionCell && mcActionCell.classList.contains('flex-col') && mcActionCell.classList.contains('items-end'),
  );
  eq('sel aksi Job Completion tidak bersarang', doc.querySelectorAll('#mc-tbody tr:first-child > td').length, 6);
  doc.querySelector('#mc-tbody tr').click();
  await tick(50);
  ok('klik baris Job Completion membuka drawer', !doc.getElementById('drawer').classList.contains('hidden'));
  doc.querySelector('[data-action="close-drawer"]').click();
  await tick();
  doc.querySelector('#mc-tbody-cards > div').click();
  await tick(50);
  ok('klik kartu Job Completion membuka drawer', !doc.getElementById('drawer').classList.contains('hidden'));
  doc.querySelector('[data-action="close-drawer"]').click();
  await tick();
  doc.querySelector('[data-action="detail"][data-id="7"]').click();
  await tick(50);
  ok('drawer Job Completion terbuka', !doc.getElementById('drawer').classList.contains('hidden'));
  ok('drawer Job Completion memakai lembar form HTML', !!doc.querySelector('#drawer .jc-paper'));
  ok('lembar drawer bisa diketik', doc.querySelector('#drawer [data-f="jobName"]').getAttribute('contenteditable') === 'true');
  eq('lembar drawer punya 17 baris pekerjaan', doc.querySelectorAll('#drawer .jc-jobs tbody tr').length >= 17, true);
  doc.querySelector('#drawer [data-f="jobName"]').textContent = 'Panel Servis';
  doc.querySelector('[data-action="save"][data-id="7"]').click();
  await tick();
  ok('saveCompletion dipanggil', calls.includes('saveCompletion'));
  const completionSave = bodies.filter((b) => b.action === 'saveCompletion').pop();
  eq('job name dari lembar ikut tersimpan', completionSave?.fields?.jobName, 'Panel Servis');
  doc.querySelector('[data-action="print"][data-id="7"]').click();
  await tick(50);
  ok('modal tanda tangan Job Completion muncul', !doc.getElementById('sig-modal').classList.contains('hidden'));
  doc.getElementById('sig-name-reported').value = 'Andi';
  doc.getElementById('sig-name-endUser').value = 'Joko';
  doc.getElementById('sig-confirm').click();
  await tick(50);
  ok('area cetak Job Completion tampil', !doc.getElementById('print-job-completion').classList.contains('hidden'));
  eq('job rows tergenerate', doc.querySelectorAll('#jc-jobRows tr').length >= 17, true);
  eq('nama end user masuk cetak', doc.getElementById('jc-endUserName').textContent, 'Joko');

  console.log('\n--- tidak ada error JS sepanjang jalan ---');
  eq('error', errors, []);
  console.log(`\n=== ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });