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
      const ensure = (ri, ci) => {
        while (grid.length <= ri) grid.push([]);
        while (grid[ri].length <= ci) grid[ri].push('');
      };
      return {
        getDisplayValues: () => out.map((l) => l.map(String)),
        getValues: () => out.map((l) => l.slice()),
        getFormulas: () => out.map((l) => l.map(() => '')),
        setValue(v) {
          ensure(r - 1, c - 1);
          grid[r - 1][c - 1] = v;
        },
        setValues(v) {
          for (let i = 0; i < nr; i++)
            for (let j = 0; j < nc; j++) {
              ensure(r - 1 + i, c - 1 + j);
              grid[r - 1 + i][c - 1 + j] = v[i][j];
            }
        },
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
  ['NO', 'NAMA', 'KONTAK', 'HARI & TGL PEMINJAMAN', 'KEPERLUAN', 'HARI & TGL PENGEMBALIAN',
    '  BARANG 1  ', 'QTY', 'KONDISI AMBIL', 'TAMBAH?',
    'BARANG 2  ', 'QTY', 'KONDISI AMBIL', 'TAMBAH?',
    '  PERSETUJUAN PEMINJAM  ', 'KONDISI KEMBALI 1', 'KONDISI KEMBALI 2'],
  ['001', 'Rina', '08123', '10/10/2026', 'Pekerjaan lapangan', '01/10/2026',
    'Kamera', '1', 'Baik', '', 'Tripod', '2', 'Rusak ringan', '', 'Rina', '', ''],
]);

const book = { TAB_TRANSPORT: transport, TAB_INVENTARIS: inventaris };
const ss = {
  getActiveSpreadsheet: () => ss,
  getSheetByName: (n) => book[n] || null,
  getActiveSheet: () => transport,
  insertSheet: (n) => { const s = sheet([]); book[n] = s; return s; },
};

const sentMail = [];
const driveFiles = [];
const driveFolders = {};
const htmlFiles = [];
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
    base64Decode: (s) => Array.from(Buffer.from(String(s), 'base64')),
    newBlob: (bytes, type, name) => {
      const blob = {
        getBytes: () => bytes,
        getContentType: () => type,
        getName: () => blob._name || name,
        setName(n) { blob._name = n; return blob; },
      };
      return blob;
    },
    sleep() {},
  },
  ContentService: { createTextOutput: (s) => ({ setMimeType() { return { text: s }; } }), MimeType: { JSON: 'json' } },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Logger: { log: (...a) => console.log('   [log]', ...a) },
  MailApp: { sendEmail: (o) => sentMail.push(o) },
  HtmlService: {
    createHtmlOutputFromFile: (file) => {
      htmlFiles.push(file);
      return {
        setTitle(title) {
          return { kind: 'html', file, title };
        },
      };
    },
    createHtmlOutput: () => ({
      getBlob: () => ({
        getAs: () => ({
          _name: '',
          setName(n) { this._name = n; return this; },
          getName() { return this._name; },
        }),
      }),
    }),
  },
  UrlFetchApp: { fetch() { throw new Error('offline'); } },
  Session: {
    getActiveUser: () => ({ getEmail: () => ctx.SESSION_EMAIL || '' }),
    getEffectiveUser: () => ({ getEmail: () => ctx.SESSION_EMAIL || '' }),
  },
  DriveApp: {
    getFolderById: (id) => {
      const f = driveFolders[id];
      if (!f) throw new Error('Folder tidak ditemukan (seperti perilaku GAS asli).');
      return f;
    },
    getFoldersByName: (n) => ({ hasNext: () => !!driveFolders[n], next: () => driveFolders[n] }),
    createFolder: (name) => {
      driveFolders[name] = driveFolders[name] || {
        getId: () => 'fdr-' + name,
        createFile(blob) {
          const name2 = blob.getName();
          const file = {
            getName: () => name2,
            getUrl: () => 'https://drive.example/' + encodeURIComponent(name2),
            getId: () => 'file-' + name2,
          };
          driveFiles.push(file);
          return file;
        },
      };
      return driveFolders[name];
    },
  },
  driveFiles,
};
ctx.globalThis = ctx;
ctx.SESSION_EMAIL = 'admin@hbpa.test';
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
eq('noSurat otomatis format NNN/BULAN/FCL/YYYY', list.data.items[0].noSurat, '002/X/FCL/2026');
eq('tanggal pengajuan dari Timestamp', list.data.items[1].tglPengajuan, '18/10/2026');
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

const blankStatus = post('updateRequest', { rowId: target.rowId, status: '' });
eq('status kosong tidak error', blankStatus.success, true);
eq('status kosong tidak menghapus status', transport.grid[2][9], 'Selesai');

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

console.log('\n--- kolom TANGGAL opsional ---');
const keepTgl = transport.grid[0][6];
transport.grid[0][6] = 'TGL SURAT';
vm.runInContext('colCache_ = {};', ctx);
eq('tanggal tidak dianggap kolom wajib', call('getBootstrap').data.missingFields, []);
eq('kolom tanggal tetap kosong tanpa error', ctx.listTransport_()[0].tanggal, '-');
const tglSave = post('updateRequest', { rowId: 2, tanggal: '21/10/2026' });
eq('simpan tanggal tidak error', tglSave.success, true);
eq('tanpa peringatan tanggal', tglSave.warning || '', '');
eq('sel tanggal lama tidak tersentuh', transport.grid[1][6], '19/10/2026');
transport.grid[0][6] = keepTgl;
vm.runInContext('colCache_ = {};', ctx);

console.log('\n--- nomor surat bisa diedit ---');
const noSave = post('updateRequest', { rowId: 2, noSurat: '010/X/FCL/2026' });
eq('nomor surat tersimpan', transport.grid[1][0], '010/X/FCL/2026');
post('updateRequest', { rowId: 2, noSurat: '' });
eq('nomor kosong dibuat otomatis', ctx.listTransport_()[0].noSurat, '001/X/FCL/2026');
post('updateRequest', { rowId: 2, noSurat: 'TR/202610/001' });
eq('nomor dipulihkan', transport.grid[1][0], 'TR/202610/001');

console.log('\n--- jam pemakaian ---');
post('updateRequest', { rowId: 3, jam: '9:30' });
eq('jam digabung ke HARI/TANGGAL/JAM', transport.grid[2][5], 'Senin, 19/10/2026 09:30');
eq('jam ngawur ditolak', post('updateRequest', { rowId: 3, jam: 'pagi' }).success, false);

console.log('\n--- inventaris ---');
const inv = call('getInventarisData');
eq('1 baris', inv.data.length, 1);
eq('noDok', inv.data[0].noDok, '001');
eq('item punya n (bug lama)', inv.data[0].items.map((i) => i.n), ['1', '2']);
eq('barang', inv.data[0].items.map((i) => i.barang), ['Kamera', 'Tripod']);
eq('qty tiap grup', inv.data[0].items.map((i) => i.qty), ['1', '2']);
eq('kondisi ambil tiap grup', inv.data[0].items.map((i) => i.kondisiAmbil), ['Baik', 'Rusak ringan']);
eq('tgl kembali dari judul "Hari & Tgl Pengembalian"', inv.data[0].tglKembali, '01/10/2026');
eq('status default', inv.data[0].status, 'Dipinjam');

const invSave = post('saveInventaris', {
  rowId: 2, sig: inv.data[0].sig, status: 'Selesai', noDok: 'PB/HBPA/001',
  tglKembaliAktual: '20/10/2026', catatan: 'Lengkap',
  lines: [{ n: '1', kondisiKembali: 'Rusak' }, { n: '2', kondisiKembali: 'Baik' }],
});
eq('sukses', invSave.success, true);
eq('no dokumen tersimpan', inventaris.grid[1][0], 'PB/HBPA/001');
eq('kondisi kembali 1', inventaris.grid[1][15], 'Rusak');
eq('kondisi kembali 2', inventaris.grid[1][16], 'Baik');
eq('kolom STATUS dibuat', inventaris.grid[0][17], 'STATUS');
eq('nilai STATUS', inventaris.grid[1][17], 'Selesai');
eq('kolom TGL dibuat', inventaris.grid[0][18], 'TGL KEMBALI AKTUAL');
eq('nilai TGL', inventaris.grid[1][18], '20/10/2026');
eq('kolom CATATAN dibuat', inventaris.grid[0][19], 'CATATAN');

const inv2 = call('getInventarisData');
eq('baca ulang kondisi kembali', inv2.data[0].items.map((i) => i.kondisiKembali), ['Rusak', 'Baik']);
eq('baca ulang no dokumen', inv2.data[0].noDok, 'PB/HBPA/001');
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

console.log('\n--- payload kegedean ---');
eq('payload kegedean ditolak', post('updateRequest', { rowId: 2, keperluan: 'x'.repeat(5000) }).success, false);

console.log('\n--- statistik recent ---');
eq('recent berisi 5 terbaru', call('getDashboardStats').data.stats.recent.length, 2);

console.log('\n--- trigger email otomatis ---');
const props = {};
ctx.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => (k in props ? props[k] : null),
    setProperty: (k, v) => { props[k] = v; },
  }),
};
ctx.ScriptApp = {
  created: [],
  getProjectTriggers: () => ctx.ScriptApp.triggers || [],
  deleteTrigger() {},
  newTrigger(name) {
    const t = { name, spec: '' };
    t.forSpreadsheet = () => t;
    t.onFormSubmit = () => { t.spec = 'form'; return t; };
    t.timeBased = () => { t.spec = 'time'; return t; };
    t.everyMinutes = (m) => { t.every = m; return t; };
    t.create = () => { ctx.ScriptApp.created.push(t); return t; };
    return t;
  },
};

const before = sentMail.length;
props.HBPA_LAST_NOTIFIED_ROW = '2';
ctx.notifyNewRows();
eq('baris baru dikirimi email', sentMail.length - before, 1);
eq('baris yang dikirim adalah baris terbaru', /Dewi Putri/.test(sentMail.at(-1).body), true);
eq('penanda baris terakhir ikut maju', props.HBPA_LAST_NOTIFIED_ROW, '3');
eq('tidak kirim ulang baris yang sama', (ctx.notifyNewRows(), sentMail.length - before), 1);

props.HBPA_LAST_NOTIFIED_ROW = '1';
const bulk = sentMail.length;
ctx.notifyNewRows();
eq('kirim semua baris yang tertinggal', sentMail.length - bulk, 2);
eq('tidak melewati batas', sentMail.length - bulk <= 10, true);

props.HBPA_LAST_NOTIFIED_ROW = null;
const fresh = sentMail.length;
ctx.notifyNewRows();
eq('tanpa setup: tidak kirim massal', sentMail.length - fresh, 0);
eq('langsung mencatat baris terakhir', props.HBPA_LAST_NOTIFIED_ROW, '3');

const installed = ctx.setupTriggers();
eq('setupTriggers mengembalikan pesan', /terpasang/.test(installed), true);
eq('2 trigger dibuat', ctx.ScriptApp.created.length, 2);
eq('trigger form dibuat', ctx.ScriptApp.created.some((t) => t.name === 'onFormSubmitTrigger'), true);
eq('trigger 5 menit dibuat', ctx.ScriptApp.created.some((t) => t.every === 5), true);
eq('testEmail jalan', /terkirim/.test(ctx.testEmail()), true);

/* ----------------------------------------------------------------------------
   SURAT TUGAS / DAILY REPORT + CHECKLIST KENDARAAN (FM-FCL-02.04)
   ---------------------------------------------------------------------------- */

console.log('\n--- setup tab baru DR/CK ---');
// Tab lama bernama DR harus diganti nama, bukan dibiarkan dobel.
book['DR'] = sheet([
  ['ID_DR', 'Hari', 'Tanggal', 'Driver', 'Mengetahui', 'Status', 'Created_By', 'Created_At', 'Link_PDF',
    'No', 'Start', 'Finish', 'Total', 'No_Plat', 'IJN', 'Nama_User', 'KM', 'Solar', 'Uraian'],
  ['DR-20261001-001', 'Kamis', '01/10/2026', 'Lama', 'Sari', 'Selesai', 'x', '01/10/2026 08:00', '',
    '1', '08:00', '09:00', '01:00', 'KT 1', '', '', '', '', ''],
]);
book['DR'].setName = function (name) { book[name] = this; delete book['DR']; };
const renameMsg = ctx.setupTabsBaru();
eq('tab DR lama di-rename', Boolean(book['TAB_DAILYREPORT']), true);
eq('pesan rename', /DR -> TAB_DAILYREPORT/.test(renameMsg), true);

// Mulai dari tab baru yang header-nya standar.
delete book['TAB_DAILYREPORT'];
vm.runInContext('colCache_ = {};', ctx);
ctx.setupTabsBaru();
eq('tab TAB_DAILYREPORT dibuat', Boolean(book['TAB_DAILYREPORT']), true);
const CK_TAB = ctx.CONFIG.tabs.ck;
const ITEM_TAB = ctx.CONFIG.tabs.mItem;
eq('tab CK dibuat', Boolean(book[CK_TAB]), true);
eq('tab M_Item dibuat', Boolean(book[ITEM_TAB]), true);
eq('M_Item terisi dari kertas asli', book[ITEM_TAB].grid.length > 50, true);
eq('setup idempoten', /semua tab sudah ada/.test(ctx.setupTabsBaru()), true);

const DR_TAB = 'TAB_DAILYREPORT';
eq('header DR baru', book[DR_TAB].grid[0].slice(0, 9),
  ['ID_DR', 'Hari', 'Tanggal', 'Driver', 'Mengetahui', 'Status', 'Created_By', 'Created_At', 'Link_PDF']);

console.log('\n--- Daily Report: validasi ---');
eq('tanggal ngawur', post('saveDr', { tanggal: 'obama', rows: [] }).success, false);
eq('tanpa baris terisi', post('saveDr', { tanggal: '18/10/2026', driver: 'Andi', rows: [{ start: '', finish: '' }] }).success, false);
eq('start ngawur', post('saveDr', { tanggal: '18/10/2026', driver: 'Andi', rows: [{ start: 'x', finish: '12:00' }] }).success, false);
eq('finish sebelum start', post('saveDr', { tanggal: '18/10/2026', driver: 'Andi', rows: [{ start: '12:00', finish: '08:00' }] }).success, false);
eq('km bukan angka', post('saveDr', { tanggal: '18/10/2026', driver: 'Andi', rows: [{ start: '07:00', finish: '08:00', nopol: 'KT 8107 YV', km: 'banyak' }] }).success, false);
eq('driver kosong ditolak', post('saveDr', { tanggal: '18/10/2026', driver: '', rows: [{ start: '07:00', finish: '08:00' }] }).success, false);

console.log('\n--- Daily Report: simpan ---');
const beforeDrCk = sentMail.length;
const dr = post('saveDr', {
  tanggal: '18/10/2026', driver: 'Andi', mengetahui: 'Sari',
  rows: [{ start: '7:30', finish: '12:00', nopol: 'Kt 8107 YV', ijn: '001234', namaUser: 'Dewi', km: '120', solar: '10', uraian: 'Antar karyawan' }],
});
eq('sukses', dr.success, true);
eq('ID format DR-YYYYMMDD-NNN', dr.data.item.id, 'DR-20261018-001');
eq('hari otomatis', dr.data.item.hari, 'Minggu');
eq('link PDF dari Drive', /drive\.example/.test(dr.data.item.linkPdf), true);
eq('tidak ada email saat simpan DR', sentMail.length, beforeDrCk);
eq('pesan simpan DR menyebut PDF', /PDF siap dicetak/.test(dr.data.message), true);
eq('baris DR tersimpan', book[DR_TAB].grid.length, 2);
eq('jam start dinormalkan', book[DR_TAB].grid[1][10], '07:30');
eq('total dihitung server', book[DR_TAB].grid[1][12], '04:30');

const dr2 = post('saveDr', { tanggal: '18/10/2026', driver: 'Budi', mengetahui: 'Sari', rows: [{ start: '13:00', finish: '15:00', nopol: 'KT 9999 ZZ' }] });
eq('ID kedua berlanjut', dr2.data.item.id, 'DR-20261018-002');
eq('mobil kedua tersimpan', book[DR_TAB].grid[2][13], 'KT 9999 ZZ');

const drList = call('getDrData').data;
eq('getDrData terbaru dulu', drList.map((x) => x.id), ['DR-20261018-002', 'DR-20261018-001']);
eq('rows ikut', drList[1].rows.length, 1);
eq('uraian ikut', drList[1].rows[0].uraian, 'Antar karyawan');

console.log('\n--- Daily Report: status & PDF ---');
const dbgUpd = post('updateDrStatus', { id: 'DR-20261018-001', status: 'Selesai' });
eq('tandai Selesai', dbgUpd.success, true);
eq('status tersimpan', book[DR_TAB].grid[1][5], 'Selesai');

const drPdf = call('drPdf', { rowId: 2 });
eq('PDF on-demand sukses', drPdf.success, true);
eq('PDF on-demand dapat link', /drive\.example/.test(drPdf.data.linkPdf), true);
eq('Link_PDF ditulis balik', book[DR_TAB].grid[1][8], drPdf.data.linkPdf);

eq('drPdfHtml_ ada judul', /SURAT TUGAS \/ DAILY REPORT/.test(ctx.drPdfHtml_({ id: 'x', hari: 'Minggu', tanggal: '18/10/2026', driver: 'A', mengetahui: 'B' }, [{ start: '08:00', finish: '09:00' }])), true);
eq('drPdfHtml_ ada 10 baris', (ctx.drPdfHtml_({ id: 'x', hari: 'Minggu', tanggal: 't', driver: 'A', mengetahui: '' }, [{ start: '08:00', finish: '09:00' }]).match(/data-dr-row/g) || []).length, 10);
eq('lebih 10 baris lanjut halaman', /Halaman 2 dari 2/.test(ctx.drPdfHtml_({ id: 'x', hari: 'M', tanggal: 't', driver: 'A', mengetahui: '' }, Array.from({ length: 12 }, () => ({ start: '08:00', finish: '09:00' })))), true);
const drPdfHtml = ctx.drPdfHtml_({ id: 'x', hari: 'Minggu', tanggal: '18/10/2026', driver: 'A', mengetahui: 'B' }, [{ start: '08:00', finish: '09:00' }]);
const drPdfFirstRow = drPdfHtml.split('<tr data-dr-row>')[1].split('</tr>')[0];
eq('baris PDF 12 sel (3 jam + 6 isian + 3 paraf)', (drPdfFirstRow.match(/<td/g) || []).length, 12);
eq('satu halaman tanpa page-break', (drPdfHtml.match(/page-break-after:always/g) || []).length, 0);

console.log('\n--- Daily Report: baris Google Form tanpa ID ---');
const formHeaders = ['Timestamp', 'Nama Driver', 'Tanggal', 'No. Plat', 'IJN', 'Nama User', 'KM', 'Solar', 'Uraian Pekerjaan', 'Jam Keluar', 'Jam Kembali'];
book['TAB_FORM_DR'] = sheet([
  formHeaders,
  ['29/10/2026 08:15:00', 'Sopir Form', '29/10/2026', 'KT 1234 AB', '009876', 'Rina', '45', '5', 'Antar sample', '07:15:00', '09:45:00'],
  ['29/10/2026 10:00:00', 'Sopir Form', '29/10/2026', 'KT 1234 AB', '009876', 'Rina', '50', '4', 'Ambil sample', '10:00:00', '11:00:00'],
  ['', '', '', '', '', '', '', '', '', '', ''],
]);
ctx.CONFIG.tabs.dr = 'TAB_FORM_DR';
vm.runInContext('colCache_ = {};', ctx);

const formList = call('getDrData').data;
eq('dua baris form jadi dua dokumen', formList.length, 2);
eq('driver dari form', formList[0].driver, 'Sopir Form');
eq('tanggal dari Timestamp', formList[0].tanggal, '29/10/2026');
eq('hari dari Timestamp', formList[0].hari, 'Kamis');
eq('ID form kosong (tanpa ID_DR)', formList[0].id, '');
eq('jam keluar dinormalkan', formList[1].rows[0].start, '07:15');
eq('total form dihitung', formList[1].rows[0].total, '02:30');

const formPdf = call('drPdf', { rowId: 2 });
eq('PDF form on-demand', formPdf.success, true);
eq('link PDF form', /drive\.example/.test(formPdf.data.linkPdf), true);
eq('tanpa kolom Link_PDF tidak error', book['TAB_FORM_DR'].grid.length, 4);

ctx.CONFIG.tabs.dr = DR_TAB;
vm.runInContext('colCache_ = {};', ctx);

console.log('\n--- masters ---');
const masters = call('getMasters').data;
eq('role admin', masters.role, 'admin');
eq('driver dikosongkan (input teks)', masters.drivers, []);
eq('kendaraan dikosongkan (input teks)', masters.kendaraan, []);
eq('M_Item ke menu form', masters.items.length > 50, true);
eq('Kaca Depan ikut terbaca dari M_Item', masters.items.some((x) => x.grup === 'Kaca' && x.item === 'Depan'), true);
eq('IJN dari tab Permintaan', masters.ijn.map((x) => x.ijn), ['001234', '009876']);

console.log('\n--- Checklist Kendaraan ---');
eq('bbm ngawur ditolak', post('saveCk', { tanggal: '18/10/2026', kendaraan: 'KT 8107 YV', driver: 'Andi', bbmMasuk: 'p', items: [{ grup: 'Kaca', item: 'Depan', status: 'Baik' }] }).success, false);
eq('kendaraan kosong ditolak', post('saveCk', { tanggal: '18/10/2026', kendaraan: '', driver: 'Andi', items: [{ grup: 'Kaca', item: 'Depan', status: 'Baik' }] }).success, false);
eq('items kosong ditolak', post('saveCk', { tanggal: '18/10/2026', kendaraan: 'KT 8107 YV', driver: 'Andi', items: [] }).success, false);
eq('status item ngawur', post('saveCk', { tanggal: '18/10/2026', kendaraan: 'KT 8107 YV', driver: 'Andi', items: [{ grup: 'Kaca', item: 'Depan', status: 'Boleh' }] }).success, false);
eq('damage view ngawur', post('saveCk', { tanggal: '18/10/2026', kendaraan: 'KT 8107 YV', driver: 'Andi', items: [{ grup: 'Kaca', item: 'Depan', status: 'Baik' }], damages: [{ view: 'ATAS-BETON', x: 10, y: 10 }] }).success, false);
eq('damage x ngawur', post('saveCk', { tanggal: '18/10/2026', kendaraan: 'KT 8107 YV', driver: 'Andi', items: [{ grup: 'Kaca', item: 'Depan', status: 'Baik' }], damages: [{ view: 'ATAS', x: 120, y: 10 }] }).success, false);

const sentBase = sentMail.length;
// Item seperti yang akan dikirim form: daftar penuh dari M_Item tanpa slot tanpa label.
const masterItems = book[ITEM_TAB].grid.slice(1)
  .filter((r) => String(r[1] || '').trim())
  .map((r) => ({
    grup: r[0], item: r[1],
    status: r[1] === 'Oli Mesin' ? 'Rusak' : 'Baik',
    catatan: r[1] === 'Oli Mesin' ? 'bocor' : '',
  }));
masterItems.forEach((it) => { if (it.item === 'Kiri' && it.grup === 'Kaca') { it.status = 'Tidak Ada'; it.catatan = ''; } });
const ck = post('saveCk', {
  tanggal: '18/10/2026', counter: 'C-01', kendaraan: 'kt 8107 yv', driver: 'Andi',
  tipeMobil: 'Avanza',
  kilometer: '62000', bbmMasuk: '1/2', bbmKeluar: '1/4',
  keterangan: 'Tolong periksa bawah', diperiksaOleh: 'Budi',
  items: masterItems,
  damages: [{ view: 'KIRI', x: 30, y: 40, catatan: 'retak' }],
});
eq('sukses', ck.success, true);
eq('ID format CK-YYYYMMDD-NNN', ck.data.item.id, 'CK-20261018-001');
eq('plat dinormalkan', ck.data.item.noPolisi, 'KT 8107 YV');
eq('tipe dari payload', ck.data.item.tipeMobil, 'Avanza');
eq('tidak ada email saat simpan CK', sentMail.length, sentBase);
eq('pesan simpan CK menyebut PDF', /PDF siap dicetak/.test(ck.data.message), true);
eq('items tersimpan di CK (1 baris)', book[CK_TAB].grid.length - 1, 1);
const ckRow = book[CK_TAB].grid[1];
const itemsJson = JSON.parse(ckRow[15] || '[]');
const dmgJson = JSON.parse(ckRow[16] || '[]');
eq('catatan rusak ikut', (itemsJson.find(function(it){return it.item==='Oli Mesin'})||{}).catatan, 'bocor');
eq('status rusak ikut', (itemsJson.find(function(it){return it.item==='Oli Mesin'})||{}).status, 'Rusak');
eq('damage tersimpan di CK', dmgJson.length, 1);
eq('damage view', dmgJson[0].view, 'KIRI');
eq('koordinat damage yang disimpan', dmgJson[0].linkGambar || '', '');

const ck2 = post('saveCk', {
  tanggal: '18/10/2026', kendaraan: 'KT 9999 ZZ', driver: 'Budi',
  items: [{ grup: 'Ban', item: 'Serep', status: 'Baik' }, { grup: 'Lampu', item: 'Besar', status: 'Baik' }],
});
eq('ID kedua berlanjut', ck2.data.item.id, 'CK-20261018-002');
eq('tetap tanpa email CK kedua', sentMail.length, sentBase);

const ckList = call('getCkData').data;
eq('getCkData terbaru dulu', ckList.map((x) => x.id), ['CK-20261018-002', 'CK-20261018-001']);
eq('hasRusak terhitung', ckList.map((x) => x.hasRusak), [false, true]);
eq('items ikut', ckList[1].items.length, masterItems.length);
eq('damages ikut', ckList[1].damages.length, 1);

console.log('\n--- updateCk ---');
const ckUpd = post('updateCk', {
  id: 'CK-20261018-001',
  rowId: 2,
  driver: 'Andi Update',
  kilometer: '63000',
  items: masterItems,
  damages: [],
});
eq('updateCk sukses', ckUpd.success, true);
eq('updateCk ubah driver', book[CK_TAB].grid[1][5], 'Andi Update');
eq('updateCk ubah km', book[CK_TAB].grid[1][6], '63000');
eq('updateCk items tersimpan', JSON.parse(book[CK_TAB].grid[1][15]).length, masterItems.length);
eq('updateCk kosongkan damage', JSON.parse(book[CK_TAB].grid[1][16]).length, 0);
eq('updateCk tanpa id gagal', post('updateCk', { id: 'CK-TIDAK-ADA' }).success, false);

console.log('\n--- template PDF Checklist ---');
const ckHtml = ctx.ckPdfHtml_({ counter: 'C', tipeMobil: 'Avanza', driver: 'A', tanggal: '18/10/2026', noPolisi: 'KT', kilometer: '1', bbmMasuk: '1/2', bbmKeluar: 'E', keterangan: 'x', diperiksaOleh: 'Budi' }, masterItems, [{ view: 'KIRI', x: 20, y: 30, catatan: '' }]);
eq('judul checklist', /CHECKLIST PEMERIKSAAN/.test(ckHtml), true);
eq('gauge masuk & keluar', ckHtml.includes('MASUK') && ckHtml.includes('KELUAR'), true);
eq('grup dari kertas tampil', /Body Mobil :/.test(ckHtml) && /Interior :/.test(ckHtml), true);
eq('catatan rusak di garis', /Rusak: bocor/.test(ckHtml), true);
eq('tanda kerusakan digambar', /✗/.test(ckHtml), true);

console.log('\n--- akses DR/CK tanpa role ---');
ctx.SESSION_EMAIL = 'orang-asing@x.com';
eq('getMasters tetap bisa dibuka', call('getMasters').success, true);
eq('simpan DR tetap bisa (input Google Form)', post('saveDr', { tanggal: '19/10/2026', driver: 'Sopir Form', rows: [{ start: '07:00', finish: '08:00' }] }).success, true);
ctx.SESSION_EMAIL = 'admin@hbpa.test';

console.log('\n--- halaman user Apps Script ---');
const pageOk = ctx.doGet({ parameter: { page: 'checklist' } });
eq('hanya file checklist yang dilayani', pageOk.file, 'checklist');
eq('judul halaman checklist', pageOk.title, 'Checklist Kendaraan');
const pageNope = ctx.doGet({ parameter: { page: '../Code' } });
eq('page di luar whitelist tidak dilayani', /tidak ditemukan/i.test(pageNope.text || ''), true);
const pageDr = ctx.doGet({ parameter: { page: 'dr' } });
eq('page dr tidak dilayani', /tidak ditemukan/i.test(pageDr.text || ''), true);
eq('createHtmlOutputFromFile hanya dipanggil untuk checklist', htmlFiles, ['checklist']);

console.log('\n--- halaman DR/CK pindah ke frontend ---');
const pageFs = require('fs');
const appDir = path.join(__dirname, '..', 'apps-script');
eq('dr.html sudah dihapus', pageFs.existsSync(path.join(appDir, 'dr.html')), false);
eq('ck.html sudah dihapus', pageFs.existsSync(path.join(appDir, 'ck.html')), false);
const codeGs = pageFs.readFileSync(path.join(appDir, 'Code.gs'), 'utf8');
eq('tidak ada cabang page=dr/ck', /param\.page === 'dr'/.test(codeGs), false);
const checklistHtml = pageFs.readFileSync(path.join(appDir, 'checklist.html'), 'utf8');
eq('standalone tidak memakai asset JS/CSS eksternal', /(src|href)=\"[^\"]*(?:assets\/|\.\/assets)/.test(checklistHtml), false);
eq('standalone tidak memakai gambar webp relatif', /\.\/ck-[a-z]+\.webp/i.test(checklistHtml), false);
eq('standalone tidak berisi shell admin', /id=\"sidebar\"|id=\"nav\"/.test(checklistHtml), false);
eq('getMasters tetap JSON', call('getMasters').success, true);

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);