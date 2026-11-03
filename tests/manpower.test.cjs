/* Test Apps Script MANPOWER: API JSON, guard sig, dan larangan workflow lama. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appDir = path.join(__dirname, '..', 'apps-script-manpower');
const API_SRC = path.join(appDir, 'Code.gs');
const SETUP_SRC = path.join(appDir, 'Setup.gs');

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok ? '' : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`));
};

function sheet(rows) {
  const grid = rows.map((r) => r.slice());
  const cols = () => Math.max(0, ...grid.map((r) => r.length));
  return {
    grid,
    getName: () => 'x',
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
        setValue(v) {
          ensure(r - 1, c - 1);
          grid[r - 1][c - 1] = v;
        },
        setValues(v) {
          for (let i = 0; i < nr; i++) {
            for (let j = 0; j < nc; j++) {
              ensure(r - 1 + i, c - 1 + j);
              grid[r - 1 + i][c - 1 + j] = v[i][j];
            }
          }
        },
        setFontWeight() { return this; },
      };
    },
    deleteRow(n) { grid.splice(n - 1, 1); },
    setFrozenRows() {},
    autoResizeColumns() {},
  };
}

const requestHeaders = [
  'Timestamp', 'Requester Email', 'Requester Name', 'Department', 'Division',
  'Requested Date', 'Required Manpower',
].concat(Array.from({ length: 10 }, (_, i) => `Job Out Line ${i + 1}`));
const completionHeaders = [
  'Timestamp', 'Email Address', 'Reported By', 'Job Name', 'Job No.', 'Location', 'Date & Time',
].concat(
  Array.from({ length: 4 }, (_, i) => [`Manpower ${i + 1} - Name`, `Manpower ${i + 1} - Classification`]).flat(),
  Array.from({ length: 15 }, (_, i) => [`No. ${i + 1} - Date & Time`, `No. ${i + 1} - Job Description`]).flat(),
  ['End User Name', 'End User Position'],
);
const requestRows = [
  requestHeaders,
  ['03/11/2026 07:00', 'budi@hbpa.test', 'Budi', 'Produksi', 'Maintenance', '03/11/2026', 'Electrical, Civil',
    'Ganti lampu', 'Perbaiki kabel', ...Array(8).fill('')],
  ['02/11/2026 08:30', 'sari@hbpa.test', 'Sari', 'GA', 'General', '02/11/2026', 'Mechanical',
    'Service kompresor', ...Array(9).fill('')],
];
const completionRows = [
  completionHeaders,
  ['03/11/2026 16:00', 'andi@hbpa.test', 'Andi', 'Perbaikan Panel', 'MR-01', 'Workshop', '03/11/2026 13:30',
    'Andi', 'Electrical', 'Budi', 'Civil', ...Array(4).fill(''),
    '03/11/2026 08:00', 'Cek panel', '03/11/2026 10:00', 'Ganti kabel', ...Array(26).fill(''),
    'Joko', 'Supervisor'],
];
const requests = sheet(requestRows);
const completions = sheet(completionRows);

const book = { Requests: requests, 'Job Completion': completions };
const ss = {
  getActiveSpreadsheet: () => ss,
  getSheetByName: (name) => book[name] || null,
  insertSheet(name) {
    const sh = sheet([]);
    book[name] = sh;
    return sh;
  },
};

const ctx = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {}, waitLock() {} }) },
  Logger: { log: () => {} },
  ContentService: {
    createTextOutput: (text) => ({
      setMimeType() { return { text }; },
    }),
    MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
  },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(API_SRC, 'utf8'), ctx, { filename: 'apps-script-manpower/Code.gs' });

const get = (action, params = {}) => {
  const res = ctx.doGet({ parameter: { action, ...params } });
  return JSON.parse(res.text);
};
const post = (action, body = {}) => {
  const res = ctx.doPost({ postData: { contents: JSON.stringify({ action, ...body }) } });
  return JSON.parse(res.text);
};

console.log('\n--- daftar & detail MANPOWER ---');
const list = get('getRequests');
eq('list sukses', list.success, true);
eq('terbaru di atas', list.data.items.map((x) => x.rowId), [3, 2]);
eq('alias email request terbaca', list.data.items[0].requesterEmail, 'sari@hbpa.test');
eq('detail completion dari alias Email Address', get('getCompletion', { rowId: 2 }).data.submittedByEmail, 'andi@hbpa.test');
eq('filter pencarian', get('getRequests', { q: 'budi' }).data.items.length, 1);
const completionItem = get('getCompletion', { rowId: 2 }).data;
eq('job outline tergabung dari kolom form', list.data.items[0].jobOutline, '1. Service kompresor');
eq('manpower tergabung dari kolom form', completionItem.manpower, '1. Andi | Electrical\n2. Budi | Civil');
eq('job description tergabung dari kolom form', completionItem.jobDescriptionLog, '1. 03/11/2026 08:00 | Cek panel\n2. 03/11/2026 10:00 | Ganti kabel');
eq('end user terbaca', completionItem.endUserName, 'Joko');

console.log('\n--- edit & guard row bergeser ---');
const reqRow = list.data.items[0];
const saved = post('saveRequest', { rowId: reqRow.rowId, sig: reqRow.sig, fields: { requesterName: 'Sari Update' } });
eq('edit tersimpan', saved.success, true);
eq('nama tersimpan di sheet', book.Requests.grid[reqRow.rowId - 1][2], 'Sari Update');
const stale = post('saveRequest', { rowId: reqRow.rowId, sig: 'sig-lama', fields: { department: 'Salah' } });
eq('sig basi ditolak', stale.success, false);
eq('nilai tidak berubah', book.Requests.grid[reqRow.rowId - 1][3], 'GA');

console.log('\n--- gabung/pecah field berulang ---');
const completionAgain = get('getCompletion', { rowId: 2 }).data;
const savedCompletion = post('saveCompletion', {
  rowId: 2,
  sig: completionAgain.sig,
  fields: {
    manpower: '1. Andi | Electrical\n2. Budi | Civil',
    jobDescriptionLog: '1. 03/11/2026 09:00 | Revisi panel',
  },
});
eq('edit field berulang sukses', savedCompletion.success, true);
eq('manpower dipecah ke kolom', book['Job Completion'].grid[1][7], 'Andi');
eq('manpower classification dipecah', book['Job Completion'].grid[1][8], 'Electrical');
eq('job log dipecah ke kolom', book['Job Completion'].grid[1][15], '03/11/2026 09:00');
eq('job description dipecah ke kolom', book['Job Completion'].grid[1][16], 'Revisi panel');

console.log('\n--- aksi tidak dikenal ---');
eq('aksi ngawur ditolak', get('hapusSemua').success, false);
eq('POST tanpa action ditolak', ctx.doPost({ postData: { contents: JSON.stringify({ rowId: 2 }) } }).text.includes('action'), true);

console.log('\n--- Setup tanpa workflow lama ---');
const api = fs.readFileSync(API_SRC, 'utf8');
const setup = fs.readFileSync(SETUP_SRC, 'utf8');
['Request ID', 'Status', 'onRequestSubmit', 'onCompletionSubmit', 'refreshDropdown', 'Completed At'].forEach((token) => {
  eq('API tidak mengandung token lama: ' + token, api.includes(token), false);
});
eq('Setup tidak membuat trigger form', /ScriptApp\.newTrigger/.test(setup), false);
eq('Setup tetap membersihkan trigger lama', /deleteFormTriggers_/.test(setup), true);
eq('Setup tetap ada resetForms', fs.readFileSync(SETUP_SRC, 'utf8').includes('function resetForms()'), true);
eq('Setup punya resetManpower dengan backup', /function resetManpower\(\)[\s\S]*makeCopy/.test(fs.readFileSync(SETUP_SRC, 'utf8')), true);
eq('Setup unlink form sebelum hapus sheet', /removeDestination/.test(fs.readFileSync(SETUP_SRC, 'utf8')), true);
const setupBody = setup.match(/function setup\(\)[\s\S]*?(?=\nfunction resetManpower)/)?.[0] || '';
const unlinkAt = setupBody.indexOf('unlinkFormIfLinked_(ss, requestForm)');
const deleteAt = setupBody.indexOf('deleteResponseSheets_(ss, temp)');
eq('setup cek data sebelum rebuild', setupBody.includes('getLastRow() > 1'), true);
eq('setup backup sebelum rebuild', setupBody.includes("backupSpreadsheet_(ss, 'before-setup')"), true);
eq('setup unlink form sebelum hapus sheet', unlinkAt >= 0 && deleteAt > unlinkAt, true);

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);
