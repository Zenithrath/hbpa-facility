/* Smoke test Code.gs: jalankan di Node dengan Spreadsheet & layanan GAS di-stub. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'apps-script', 'Code.gs');

let pass = 0, fail = 0;
const eq = (l, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + l + (ok ? '' : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`));
};

/* ---------- Spreadsheet palsu ---------- */
function sheet(rows) {
  const grid = rows.map((r) => r.slice());
  const cols = () => Math.max(0, ...grid.map((r) => r.length));
  return {
    grid,
    getName: () => 'x',
    getParent: () => ss,
    getLastRow: () => grid.length,
    getLastColumn: () => cols(),
    getRange(r, c, nr = 1, nc = 1) {
      const out = [];
      for (let i = 0; i < nr; i++) {
        const line = [];
        for (let j = 0; j < nc; j++) line.push(grid[r - 1 + i]?.[c - 1 + j] ?? '');
        out.push(line);
      }
      return {
        getDisplayValues: () => out.map((l) => l.map(String)),
        getValues: () => out.map((l) => l.slice()),
        getFormulas: () => out.map((l) => l.map(() => '')),
        setValue(v) { for (let i = 0; i < nr; i++) grid[r - 1 + i][c - 1] = v; },
        setValues(v) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) grid[r - 1 + i][c - 1 + j] = v[i][j]; },
      };
    },
    appendRow(row) { grid.push(row.slice()); },
    deleteRow(n) { grid.splice(n - 1, 1); },
  };
}

const transport = sheet([
  ['NO.', 'NAMA', 'DIVISI', 'IJN', 'TUJUAN', 'HARI/TANGGAL/JAM', 'TANGGAL',
    'NO. POL. KENDARAAN', 'KEPERLUAN', 'STATUS', 'PEMOHON', 'DISETUJUI', 'DRIVER NAME', 'TIMESTAMP'],
  ['TR/202610/001', 'Budi', 'Produksi', '001234', 'Balikpapan', 'Senin, 08:00', '19/10/2026',
    'KT 8107 YV', 'KOperasi', 'Approved', 'Budi', 'Sari', 'Andi', '18/10/2026 09:00'],
  ['', 'Dewi', 'Sdm', '009876', 'Tarakan', 'Selasa, 09:00', '18/10/2026',
    'KT 1234 AB', 'Rapat', '', 'Dewi', '', '', '19/10/2026 10:00'],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
]);

const inventaris = sheet([
  ['NO', 'NAMA', 'KONTAK', 'TGL PEMINJAMAN', 'TGL PENGEMBALIAN', 'KEPERLUAN',
    'BARANG1', 'QTY1', 'KONDISI AMBIL1', 'KONDISI KEMBALI1',
    'BARANG2', 'QTY2', 'KONDISI AMBIL2', 'KONDISI KEMBALI2'],
  ['001', 'Rina', '08123', '10/10/2026', '01/10/2026', 'Pekerjaan lapangan',
    'Kamera', '1', 'Baik', '', 'Tripod', '2', 'Baik', ''],
]);

const ss = {
  getActiveSpreadsheet: () => ss,
  getSheetByName: (n) => (n === 'TAB_TRANSPORT' ? transport : n === 'TAB_INVENTARIS' ? inventaris : null),
  getActiveSheet: () => transport,
};

const sentMail = [];
const ctx = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
  Utilities: {
    formatDate(d, tz, p) {
      const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const pad = (n) => String(n).padStart(2, '0');
      return p.replace('MMMM', M[d.getMonth()]).replace('MMM', M[d.getMonth()])
        .replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()));
    },
    base64Encode: (b) => Buffer.from(b).toString('base64'),
    sleep() {},
  },
  ContentService: { createTextOutput: (s) => ({ setMimeType() { return { text: s }; } }), MimeType: { JSON: 'json' } },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Logger: { log: (...a) => console.log('   [log]', ...a) },
  MailApp: { sendEmail: (o) => sentMail.push(o) },
  HtmlService: { createHtmlOutput: () => ({ getBlob: () => ({ getAs: () => ({ setName() {} }) }) }) },
  UrlFetchApp: { fetch() { throw new Error('offline'); } },
  DriveApp: {},
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'Code.gs' });

/* ---------- helpers ---------- */
const call = (action, p = {}) => {
  const res = ctx.doGet({ parameter: { action, ...p } });
  return JSON.parse(res.text);
};
const post = (action, data) => call(action, { data: JSON.stringify(data) });

console.log('\n--- pemetaan kolom dari judul ---');
const diag = call('diagnose');
eq('tab transport', diag.data.transport.tab, 'TAB_TRANSPORT');
eq('tidak ada kolom transport hilang', diag.data.transport.missing, []);
eq('grup barang terdeteksi', diag.data.inventaris.groups, ['1', '2']);
eq('kolom yang dibuat otomatis', diag.data.inventaris.willCreate, ['STATUS', 'TGL KEMBALI AKTUAL', 'CATATAN']);
eq('nama terdeteksi di kolom B', diag.data.transport.matched.find((m) => m.startsWith('nama')), 'nama (kolom 2)');

console.log('\n--- getBootstrap ---');
const boot = call('getBootstrap');
eq('sukses', boot.success, true);
eq('total', boot.data.stats.total, 2);
eq('approved', boot.data.stats.approved, 1);
eq('pending', boot.data.stats.pending, 1);
eq('baris kosong dilewati', boot.data.stats.total, 2);
eq('divisi terdeteksi', boot.data.departments.slice(0, 2), ['Produksi', 'Sdm']);
eq('tidak ada peringatan', boot.data.missingFields, []);

console.log('\n--- getRequests ---');
const list = call('getRequests', { pageSize: 10 });
eq('2 baris', list.data.items.length, 2);
eq('terbaru di atas', list.data.items[0].nama, 'Dewi');
eq('noSurat dari kolom NO', list.data.items[1].noSurat, 'TR/202610/001');
eq('noSurat otomatis saat kolom NO kosong', /^TR\/\d{6}\/\d{3}$/.test(list.data.items[0].noSurat), true);
eq('status lama Approved -> Disetujui', list.data.items[1].status, 'Disetujui');
eq('status kosong -> Pending', list.data.items[0].status, 'Pending');
eq('paginasi', list.data.pagination.total, 2);
eq('filter q', call('getRequests', { q: 'rina' }).data.items.length, 0);
eq('filter q (tarakan)', call('getRequests', { q: 'tarakan' }).data.items.length, 1);
eq('filter status', call('getRequests', { status: 'Disetujui' }).data.items.length, 1);
eq('sig terisi', typeof list.data.items[0].sig, 'string');

console.log('\n--- updateRequest + sig ---');
const target = list.data.items[0];
const upd = post('updateRequest', { rowId: target.rowId, sig: target.sig, nama: 'Dewi Putri', nopol: 'kt 7777 xx', status: 'Selesai' });
eq('sukses', upd.success, true);
eq('tanpa peringatan', upd.warning || '', '');
eq('nama tersimpan', transport.grid[2][1], 'Dewi Putri');
eq('nopol uppercase', transport.grid[2][7], 'KT 7777 XX');
eq('status tersimpan', transport.grid[2][9], 'Selesai');

const stale = post('updateRequest', { rowId: target.rowId, sig: 'sidonya-berubah', nama: 'X' });
eq('tolak kalau baris bergeser', stale.success, false);
eq('pesan guard', /sudah berubah/.test(stale.message), true);
eq('nilai lama tidak ditimpa', transport.grid[2][1], 'Dewi Putri');

console.log('\n--- kolom yang hilang dari spreadsheet ---');
const keepDriver = transport.grid[0][12];
transport.grid[0][12] = 'SOME_OTHER_COLUMN';   // judul tidak dikenal
vm.runInContext('colCache_ = {};', ctx);
const drv = ctx.listTransport_()[0];
eq('kolom Driver jadi kosong, bukan error', drv.driver, '-');
const missWarn = post('updateRequest', { rowId: 2, driver: 'Agus' });
eq('peringatan nama kolom', /tidak ada di spreadsheet/.test(missWarn.warning || ''), true);
eq('tidak ada error JSON', missWarn.success, true);
transport.grid[0][12] = keepDriver;
vm.runInContext('colCache_ = {};', ctx);
eq('pulih setelah judul dikembalikan', ctx.listTransport_()[0].driver, 'Andi');

console.log('\n--- inventaris ---');
const inv = call('getInventarisData');
eq('1 baris', inv.data.length, 1);
eq('noDok', inv.data[0].noDok, '001');
eq('item punya n (bug lama)', inv.data[0].items.map((i) => i.n), ['1', '2']);
eq('barang', inv.data[0].items.map((i) => i.barang), ['Kamera', 'Tripod']);
eq('status default', inv.data[0].status, 'Dipinjam');

const invSave = post('saveInventaris', {
  rowId: 2, sig: inv.data[0].sig, status: 'Selesai',
  tglKembaliAktual: '20/10/2026', catatan: 'Lengkap',
  lines: [{ n: '1', kondisiKembali: 'Rusak' }, { n: '2', kondisiKembali: 'Baik' }],
});
eq('sukses', invSave.success, true);
eq('kondisi kembali 1', inventaris.grid[1][9], 'Rusak');
eq('kondisi kembali 2', inventaris.grid[1][13], 'Baik');
eq('kolom STATUS dibuat', inventaris.grid[0][14], 'STATUS');
eq('nilai STATUS', inventaris.grid[1][14], 'Selesai');
eq('kolom TGL dibuat', inventaris.grid[0][15], 'TGL KEMBALI AKTUAL');
eq('nilai TGL', inventaris.grid[1][15], '20/10/2026');
eq('kolom CATATAN dibuat', inventaris.grid[0][16], 'CATATAN');

const inv2 = call('getInventarisData');
eq('baca ulang kondisi kembali', inv2.data[0].items.map((i) => i.kondisiKembali), ['Rusak', 'Baik']);
eq('baca ulang status', inv2.data[0].status, 'Selesai');

console.log('\n--- guard inventaris ---');
const badInv = post('saveInventaris', { rowId: 2, sig: 'x', status: 'Selesai', lines: [] });
eq('tolak', badInv.success, false);

console.log('\n--- create & delete ---');
const created = post('createRequest', { nama: 'Eka', tujuan: 'Banjarmasin', dept: 'GA', tglJam: 'Rabu, 07:00', keperluan: 'KNeeds' });
eq('sukses', created.success, true);
eq('baris baru ada', transport.getLastRow(), 5);
eq('status awal', transport.grid[4][9], 'Pending');
const createdList = call('getRequests');
const eka = createdList.data.items.find((i) => i.nama === 'Eka');
eq('Eka punya sig', typeof eka.sig, 'string');

eq('hapus berhasil', call('deleteRequest', { rowId: 5 }).success, true);
eq('kembali 4 baris', transport.getLastRow(), 4);

console.log('\n--- email ---');
call('sendEmail', { rowIds: '2,3' });
eq('1 email terkirim', sentMail.length, 1);
eq('2 lampiran PDF', sentMail[0].attachments.length, 2);
ok_subject();
function ok_subject() {
  eq('subjek memuat jumlah', /2 permintaan/.test(sentMail[0].subject), true);
  eq('nama pengirim', sentMail[0].name, 'Facility Department PT HBPA');
}
eq('lebih dari 10 ditolak', call('sendEmail', { rowIds: '1,2,3,4,5,6,7,8,9,10,11' }).success, false);

console.log('\n--- error handling ---');
eq('aksi ngawur ditolak', call('ngawur').success, false);
eq('rowId ngawur ditolak', call('getRequestDetail', { rowId: '999' }).success, false);
eq('tab hilang memberi pesan jelas', call('getBootstrap', {}) && (() => {
  ctx.CONFIG.tabs.transport = 'TIDAK_ADA';
  const r = call('getBootstrap');
  ctx.CONFIG.tabs.transport = 'TAB_TRANSPORT';
  return r.success === false && /tidak ditemukan/.test(r.message);
})(), true);

console.log('\n--- payloadzorOS ---');
eq('payload kegedean ditolak', post('updateRequest', { rowId: 2, keperluan: 'x'.repeat(5000) }).success, false);

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);