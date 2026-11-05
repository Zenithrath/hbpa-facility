/* Uji SetupChecklistForm.gs: form dibuat, trigger tunggal, dan jawaban dipetakan ke saveCk_. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'apps-script', 'SetupChecklistForm.gs');

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (ok ? '' : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`));
};
const ok = (label, cond) => eq(label, Boolean(cond), true);

function makeSheet(rows) {
  const grid = (rows || []).map((r) => r.slice());
  const cols = () => Math.max(0, ...grid.map((r) => r.length));
  return {
    grid,
    getLastRow: () => grid.length,
    getLastColumn: cols,
    getRange(r, c, nr = 1, nc = 1) {
      const ensure = (ri, ci) => {
        while (grid.length <= ri) grid.push([]);
        while (grid[ri].length <= ci) grid[ri].push('');
      };
      return {
        getDisplayValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const line = [];
            for (let j = 0; j < nc; j++) line.push(String(grid[r - 1 + i]?.[c - 1 + j] ?? ''));
            out.push(line);
          }
          return out;
        },
        setValues(values) {
          for (let i = 0; i < nr; i++) {
            for (let j = 0; j < nc; j++) {
              ensure(r - 1 + i, c - 1 + j);
              grid[r - 1 + i][c - 1 + j] = values[i][j];
            }
          }
        },
        setValue(value) {
          ensure(r - 1, c - 1);
          grid[r - 1][c - 1] = value;
        },
      };
    },
    setFrozenRows() {},
  };
}

const book = {};
const ss = {
  getSheetByName: (name) => book[name] || null,
  insertSheet(name) {
    const sh = makeSheet([]);
    book[name] = sh;
    return sh;
  },
};

function makeItem(type, title) {
  const item = {
    type,
    title: title || '',
    rows: [],
    columns: [],
    required: false,
    getType: () => type,
    getTitle() { return item.title; },
    setTitle(value) { item.title = value; return item; },
    setHelpText() { return item; },
    setRequired(value) { item.required = Boolean(value); return item; },
    setRows(values) { item.rows = values.slice(); return item; },
    setColumns(values) { item.columns = values.slice(); return item; },
    setChoiceValues() { return item; },
    setValidation() { return item; },
  };
  item.asGridItem = () => ({ getRows: () => item.rows.slice() });
  return item;
}

function makeForm(title) {
  const form = {
    id: 'form-checklist',
    title,
    items: [],
    getId: () => form.id,
    getTitle: () => form.title,
    getPublishedUrl: () => 'https://forms.example/checklist',
    getItems: () => form.items.slice(),
    deleteItem(item) {
      const index = form.items.indexOf(item);
      if (index >= 0) form.items.splice(index, 1);
    },
    getResponses: () => [],
    addSectionHeaderItem() { const it = makeItem('SECTION_HEADER'); form.items.push(it); return it; },
    addPageBreakItem() { const it = makeItem('PAGE_BREAK'); form.items.push(it); return it; },
    addDateItem() { const it = makeItem('DATE'); form.items.push(it); return it; },
    addTextItem() { const it = makeItem('TEXT'); form.items.push(it); return it; },
    addParagraphTextItem() { const it = makeItem('PARAGRAPH_TEXT'); form.items.push(it); return it; },
    addListItem() { const it = makeItem('LIST'); form.items.push(it); return it; },
    addGridItem() { const it = makeItem('GRID'); form.items.push(it); return it; },
    setTitle(value) { form.title = value; return form; },
    setDescription() { return form; },
    setConfirmationMessage() { return form; },
    setProgressBar() { return form; },
    setShuffleQuestions() { return form; },
    setAllowResponseEdits() { return form; },
    setCollectEmail() { return form; },
  };
  return form;
}

const forms = {};
const triggers = [];
const alerts = [];
const properties = {};

const ctx = {
  console,
  CONFIG: { spreadsheetId: 'ss-1', timezone: 'Asia/Makassar', tabs: { ck: 'TAB_CEKKENDARAAN', mItem: 'TAB_Item' } },
  SpreadsheetApp: {
    openById: () => ss,
    getActiveSpreadsheet: () => ss,
    getUi: () => ({ alert: (message) => alerts.push(message) }),
  },
  FormApp: {
    create(title) {
      const form = makeForm(title);
      forms[form.id] = form;
      return form;
    },
    openById(id) {
      if (!forms[id]) throw new Error('Form tidak ditemukan');
      return forms[id];
    },
    ItemType: { GRID: 'GRID' },
    createTextValidation: () => ({
      requireTextMatchesPattern() { return this; },
      setHelpText() { return this; },
      build() { return {}; },
    }),
  },
  ScriptApp: {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger(target) {
      const index = triggers.indexOf(target);
      if (index >= 0) triggers.splice(index, 1);
    },
    newTrigger(handler) {
      const builder = {
        form: null,
        forForm(form) { builder.form = form; return builder; },
        onFormSubmit() { return builder; },
        create() {
          triggers.push({
            form: builder.form,
            getHandlerFunction: () => handler,
          });
        },
      };
      return builder;
    },
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => properties[key] || null,
      setProperty: (key, value) => { properties[key] = value; },
      deleteProperty: (key) => { delete properties[key]; },
    }),
  },
  DriveApp: {
    getFileById: () => ({ setTrashed() {} }),
  },
  Session: { getScriptTimeZone: () => 'Asia/Makassar' },
  Utilities: {
    formatDate(date, tz, pattern) {
      const pad = (n) => String(n).padStart(2, '0');
      return pattern
        .replace('yyyy', date.getFullYear())
        .replace('MM', pad(date.getMonth() + 1))
        .replace('dd', pad(date.getDate()));
    },
  },
  Logger: { log: (...args) => console.log('   [log]', ...args) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'SetupChecklistForm.gs' });

const saved = [];
ctx.saveCk_ = (body) => {
  saved.push(body);
  return { success: true, data: { item: { id: 'CK-20261018-001' }, hasRusak: body.items.some((it) => it.status === 'Rusak') } };
};

function fakeResponse(overrides = {}) {
  const entries = [
    ['DATE', 'Tanggal', new Date(2026, 9, 18)],
    ['TEXT', 'Counter', 'C-01'],
    ['TEXT', 'Tipe Mobil', 'Avanza'],
    ['TEXT', 'No. Polisi', 'kt 8107 yv'],
    ['TEXT', 'Driver', 'Andi'],
    ['TEXT', 'Kilometer', '62000'],
    ['LIST', 'BBM Masuk', '1/2'],
    ['LIST', 'BBM Keluar', '1/4'],
    ['PARAGRAPH_TEXT', 'Keterangan', 'Tolong periksa bawah'],
    ['TEXT', 'Diperiksa Oleh', 'Budi'],
    ['GRID', 'Kaca', ['Baik', 'Rusak', 'Tidak Ada', 'Baik', 'Baik', 'Baik'], ['Depan', 'Kiri', 'Kanan', 'Spion Kanan', 'Spion Kiri', 'Spion Dalam']],
    ['GRID', 'Ban', ['Baik', 'Baik', 'Baik', 'Baik', 'Rusak'], ['Kanan Depan', 'Kiri Depan', 'Kanan Belakang', 'Kiri Belakang', 'Serep']],
    ['PARAGRAPH_TEXT', 'Catatan kerusakan (opsional)', 'Retak dan aus'],
  ];

  return {
    getItemResponses: () => entries
      .filter(([type, title]) => !overrides[title])
      .map(([type, title, value, rows]) => ({
        getItem: () => {
          const item = makeItem(type, title);
          if (rows) item.rows = rows.slice();
          return item;
        },
        getResponse: () => value,
      })),
  };
}

console.log('\n--- setup form ---');
const url = ctx.setupChecklistForm();
eq('URL form dikembalikan', url, 'https://forms.example/checklist');
ok('header ID_CK dibuat di tab checklist', book.TAB_CEKKENDARAAN.grid[0].includes('ID_CK'));
ok('header Items_JSON dibuat', book.TAB_CEKKENDARAAN.grid[0].includes('Items_JSON'));
eq('satu trigger form', triggers.length, 1);
eq('handler trigger', triggers[0].getHandlerFunction(), 'onChecklistFormSubmit');
eq('judul form', forms['form-checklist'].title, 'Checklist Kendaraan - PT HBPA');

const gridItems = forms['form-checklist'].items.filter((item) => item.getType() === 'GRID');
eq('8 grid grup item', gridItems.length, 8);
const kaca = gridItems.find((item) => item.getTitle() === 'Kaca');
eq('grid Kaca berisi 6 item', kaca.rows.length, 6);
eq('kolom status grid', kaca.columns, ['Baik', 'Rusak', 'Tidak Ada']);
ok('grid wajib diisi', kaca.required);
ok('ada pertanyaan No. Polisi', forms['form-checklist'].items.some((item) => item.title === 'No. Polisi'));
ok('ada pertanyaan BBM Masuk', forms['form-checklist'].items.some((item) => item.title === 'BBM Masuk'));
ok('ada catatan kerusakan', forms['form-checklist'].items.some((item) => item.title === 'Catatan kerusakan (opsional)'));
ok('link form ditampilkan', alerts.some((message) => message.includes('https://forms.example/checklist')));

console.log('\n--- setup ulang tidak menggandakan trigger/pertanyaan ---');
ctx.setupChecklistForm();
eq('trigger tetap satu', triggers.length, 1);
eq('grid tetap 8', forms['form-checklist'].items.filter((item) => item.getType() === 'GRID').length, 8);

console.log('\n--- jawaban form dipetakan ke saveCk_ ---');
saved.length = 0;
ctx.onChecklistFormSubmit({ response: fakeResponse() });
eq('saveCk_ dipanggil sekali', saved.length, 1);
const body = saved[0] || {};
eq('tanggal dd/MM/yyyy', body.tanggal, '18/10/2026');
eq('counter', body.counter, 'C-01');
eq('plat diteruskan', body.kendaraan, 'kt 8107 yv');
eq('tipe mobil', body.tipeMobil, 'Avanza');
eq('driver', body.driver, 'Andi');
eq('kilometer', body.kilometer, '62000');
eq('bbm masuk', body.bbmMasuk, '1/2');
eq('bbm keluar', body.bbmKeluar, '1/4');
eq('keterangan', body.keterangan, 'Tolong periksa bawah');
eq('diperiksa oleh', body.diperiksaOleh, 'Budi');
eq('asal data', body.createdBy, 'Google Form');
eq('damage dari form kosong', body.damages, []);
eq('11 item dari 2 grid', body.items.length, 11);

const kiri = body.items.find((it) => it.grup === 'Kaca' && it.item === 'Kiri');
const kanan = body.items.find((it) => it.grup === 'Kaca' && it.item === 'Kanan');
const serep = body.items.find((it) => it.grup === 'Ban' && it.item === 'Serep');
const depan = body.items.find((it) => it.grup === 'Kaca' && it.item === 'Depan');
eq('status Rusak terbaca', kiri.status, 'Rusak');
eq('catatan menempel ke item rusak', kiri.catatan, 'Retak dan aus');
eq('status Tidak Ada terbaca', kanan.status, 'Tidak Ada');
eq('catatan menempel ke item tidak ada', kanan.catatan, 'Retak dan aus');
eq('item baik tanpa catatan', depan.catatan, '');
eq('grid kedua ikut', serep.status, 'Rusak');

console.log('\n--- kiriman tanpa plat dilewati ---');
saved.length = 0;
ctx.onChecklistFormSubmit({ response: fakeResponse({ 'No. Polisi': true }) });
eq('saveCk_ tidak dipanggil', saved.length, 0);

console.log('\n--- konversi tanggal ---');
eq('tanggal ISO', ctx.ckDateText_('2026-10-18'), '18/10/2026');
eq('tanggal sudah dd/MM/yyyy', ctx.ckDateText_('18/10/2026'), '18/10/2026');
eq('tanggal kosong jadi hari ini', /^\d{2}\/\d{2}\/\d{4}$/.test(ctx.ckDateText_('')), true);

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);
