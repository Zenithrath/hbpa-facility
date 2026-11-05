/**
 * SetupChecklistForm.gs — pembuat Google Form Checklist Kendaraan.
 *
 * Tempel file ini di project Apps Script yang sama dengan Code.gs,
 * lalu jalankan setupChecklistForm() satu kali (atau lewat menu "Checklist").
 *
 * Hasil:
 * - Form "Checklist Kendaraan - PT HBPA" berisi identitas kendaraan dan grid
 *   kondisi per grup item (Kaca, Body Mobil, Ban, ...).
 * - Setiap kiriman Form otomatis ditambahkan ke tab TAB_CEKKENDARANA dengan
 *   format yang sama seperti input manual dari aplikasi: ID_CK, Items_JSON,
 *   Damages_JSON, Has_Rusak, dan seterusnya.
 * - Trigger onChecklistFormSubmit selalu dipasang ulang supaya tidak dobel.
 *
 * Form TIDAK di-link sebagai destination spreadsheet. Kalau di-link, Google
 * akan membuat tab "Form Responses" baru yang tidak dibaca aplikasi. Trigger
 * inilah yang menulis ke tab checklist yang benar.
 *
 * Catatan: tanda kerusakan pada gambar mobil (view/x/y) hanya bisa dibuat
 * dari aplikasi. Form hanya mencatat status per item + satu catatan global.
 */

var CK_FORM_PROP = 'FORM_CHECKLIST';
var CK_FORM_TITLE = 'Checklist Kendaraan - PT HBPA';
var CK_FORM_STATUS = ['Baik', 'Rusak', 'Tidak Ada'];
var CK_FORM_BBM = ['E', '1/4', '1/2', '3/4', 'F'];
var CK_FORM_NOTE_TITLE = 'Catatan kerusakan (opsional)';

var CK_FORM_HEADERS = [
  'ID_CK', 'Tanggal', 'Counter', 'Tipe_Mobil', 'No_Polisi', 'Driver', 'Kilometer',
  'BBM_Masuk', 'BBM_Keluar', 'Keterangan', 'Diperiksa_Oleh', 'Status', 'Created_By',
  'Created_At', 'Link_PDF', 'Items_JSON', 'Damages_JSON', 'Has_Rusak', 'Request_Id'
];

/** Cadangan kalau tab TAB_Item kosong / belum dibuat. */
var CK_FORM_DEFAULT_GROUPS = [
  { grup: 'Kaca', items: ['Depan', 'Kiri', 'Kanan', 'Spion Kanan', 'Spion Kiri', 'Spion Dalam'] },
  { grup: 'Body Mobil', items: ['Depan', 'Grill', 'Fender', 'Pintu Dpn Kanan', 'Pintu Dpn Kiri', 'Pintu Blk Kanan', 'Pintu Blk Kiri', 'Pintu Belakang'] },
  { grup: 'Ban', items: ['Kanan Depan', 'Kiri Depan', 'Kanan Belakang', 'Kiri Belakang', 'Serep'] },
  { grup: 'Mesin', items: ['Oli Mesin', 'Minyak Rem', 'Air Radiator', 'Air ACCU', 'Air Wiper'] },
  { grup: 'Lampu', items: ['Besar', 'Kecil', 'Rem', 'Sen Depan', 'Sen Belakang'] },
  { grup: 'Eksterior', items: ['Talang Air', 'Plat Belakang', 'Plat Depan'] },
  { grup: 'Kelengkapan', items: ['Kunci Roda', 'Dongkrak', 'P3K', 'STNK', 'APAR'] },
  { grup: 'Interior', items: ['Jok', 'Stir', 'Karpet Dasar', 'Persneling', 'Rem Tangan', 'Dashboard', 'Sendalan', 'AC', 'Charger', 'Radio', 'Power Window', 'Gauges'] }
];

/* =====================================================
   MENU SPREADSHEET
   ===================================================== */

/**
 * Menu ini hanya muncul kalau project Apps Script terikat (container-bound)
 * ke spreadsheet. Kalau tidak muncul, jalankan fungsinya dari editor.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Checklist')
      .addItem('Buat / perbarui Form Checklist', 'setupChecklistForm')
      .addItem('Buka Form Checklist', 'openChecklistForm')
      .addItem('Pasang ulang trigger', 'installChecklistFormTrigger')
      .addItem('Hapus Form & buat baru', 'resetChecklistForm')
      .addToUi();
  } catch (err) {
    Logger.log('Menu Checklist tidak bisa dipasang: ' + err);
  }
}

/* =====================================================
   SETUP
   ===================================================== */

/**
 * Membuat (atau memakai ulang) Form Checklist, memastikan tab checklist ada,
 * lalu memasang trigger submit. Aman dijalankan berulang.
 *
 * Kalau Form sudah punya respons, pertanyaan TIDAK dibangun ulang supaya
 * jawaban lama tidak rusak. Untuk membangun ulang dari nol, jalankan
 * resetChecklistForm().
 */
function setupChecklistForm() {
  ckEnsureChecklistSheet_();

  var form = ckGetOrCreateForm_();
  var responses = 0;
  try { responses = form.getResponses().length; } catch (err) { responses = 0; }

  if (responses > 0) {
    Logger.log('Form sudah memiliki ' + responses + ' respons. Pertanyaan tidak diubah. ' +
      'Jalankan resetChecklistForm() kalau memang ingin membuat ulang.');
  } else {
    ckBuildFormQuestions_(form);
  }

  ckInstallFormTrigger_(form);

  var url = form.getPublishedUrl();
  Logger.log('Form Checklist siap: ' + url);
  Logger.log('Semua kiriman Form masuk ke tab ' + ckTabName_() + '.');
  ckAlert_('Form Checklist siap:\n' + url + '\n\nKiriman Form otomatis masuk ke tab ' + ckTabName_() + '.');
  return url;
}

/** Pasang ulang trigger submit tanpa mengubah pertanyaan Form. */
function installChecklistFormTrigger() {
  var form = ckGetExistingForm_();
  if (!form) throw new Error('Form belum ada. Jalankan setupChecklistForm() dulu.');
  ckInstallFormTrigger_(form);
  Logger.log('Trigger onChecklistFormSubmit dipasang ulang untuk: ' + form.getPublishedUrl());
  return form.getPublishedUrl();
}

/** Tampilkan / catat URL Form yang sedang dipakai. */
function openChecklistForm() {
  var form = ckGetExistingForm_();
  if (!form) throw new Error('Form belum ada. Jalankan setupChecklistForm() dulu.');
  var url = form.getPublishedUrl();
  Logger.log('Form Checklist: ' + url);
  ckAlert_('Link Form Checklist:\n' + url);
  return url;
}

/**
 * Pindahkan Form lama ke Trash, lalu buat Form baru dari nol.
 * Data yang sudah masuk ke TAB_CEKKENDARANA tidak dihapus.
 */
function resetChecklistForm() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CK_FORM_PROP);

  ckDeleteFormTriggers_();

  if (id) {
    try {
      DriveApp.getFileById(id).setTrashed(true);
      Logger.log('Form lama dipindahkan ke Trash: ' + id);
    } catch (err) {
      Logger.log('Form lama tidak bisa dipindahkan ke Trash: ' + err);
    }
    props.deleteProperty(CK_FORM_PROP);
  }

  return setupChecklistForm();
}

/* =====================================================
   SPREADSHEET
   ===================================================== */

function ckTabName_() {
  return (typeof CONFIG !== 'undefined' && CONFIG.tabs && CONFIG.tabs.ck)
    ? CONFIG.tabs.ck
    : 'TAB_CEKKENDARANA';
}

function ckSpreadsheet_() {
  if (typeof CONFIG !== 'undefined' && CONFIG.spreadsheetId) {
    return SpreadsheetApp.openById(CONFIG.spreadsheetId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ckEnsureChecklistSheet_() {
  try {
    if (typeof setupTabsBaru === 'function') setupTabsBaru();
  } catch (err) {
    Logger.log('setupTabsBaru dilewati: ' + err);
  }

  var ss = ckSpreadsheet_();
  var name = ckTabName_();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  var lastCol = sh.getLastColumn();
  var head = lastCol > 0
    ? sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0]
    : [];
  var existing = head.map(ckNorm_);
  var missing = [];

  for (var h = 0; h < CK_FORM_HEADERS.length; h++) {
    if (existing.indexOf(ckNorm_(CK_FORM_HEADERS[h])) < 0) missing.push(CK_FORM_HEADERS[h]);
  }

  if (missing.length) {
    if (lastCol === 0) {
      sh.getRange(1, 1, 1, CK_FORM_HEADERS.length).setValues([CK_FORM_HEADERS]);
    } else {
      sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    }
    Logger.log('Kolom checklist ditambahkan: ' + missing.join(', '));
  }

  if (sh.getLastRow() > 0 && typeof sh.setFrozenRows === 'function') sh.setFrozenRows(1);

  // Code.gs menyimpan cache nomor kolom per eksekusi; buang supaya header baru terbaca.
  try { colCache_ = {}; } catch (err) { /* bukan project Code.gs, abaikan */ }

  return sh;
}

/** Grup & item dari tab master, fallback ke daftar bawaan kertas checklist. */
function ckFormGroups_() {
  var groups = [];
  try { groups = ckReadMasterGroups_(); } catch (err) {
    Logger.log('Gagal membaca master item: ' + err);
  }
  return groups.length ? groups : CK_FORM_DEFAULT_GROUPS;
}

function ckReadMasterGroups_() {
  var ss = ckSpreadsheet_();
  var tab = (typeof CONFIG !== 'undefined' && CONFIG.tabs && CONFIG.tabs.mItem)
    ? CONFIG.tabs.mItem
    : 'TAB_Item';
  var sh = ss.getSheetByName(tab);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  var head = values.shift().map(ckNorm_);
  var grupCol = head.indexOf('grup');
  var itemCol = head.indexOf('item');
  var urutCol = head.indexOf('urutan');
  var statusCol = head.indexOf('status');
  if (grupCol < 0 || itemCol < 0) return [];

  var order = [];
  var map = {};

  values.forEach(function (row, rowIndex) {
    var grup = String(row[grupCol] || '').trim();
    var item = String(row[itemCol] || '').trim();
    var status = statusCol >= 0 ? String(row[statusCol] || '').trim().toLowerCase() : 'aktif';
    if (!grup || !item) return;
    if (status && status !== 'aktif') return;

    if (!map[grup]) {
      map[grup] = { grup: grup, rows: [] };
      order.push(grup);
    }
    map[grup].rows.push({
      item: item,
      urut: urutCol >= 0 ? (parseInt(row[urutCol], 10) || 0) : rowIndex,
      index: rowIndex
    });
  });

  return order.map(function (grup) {
    var rows = map[grup].rows.slice().sort(function (a, b) {
      return (a.urut - b.urut) || (a.index - b.index);
    });
    return { grup: grup, items: rows.map(function (row) { return row.item; }) };
  });
}

/* =====================================================
   FORM
   ===================================================== */

function ckGetExistingForm_() {
  var id = PropertiesService.getScriptProperties().getProperty(CK_FORM_PROP);
  if (!id) return null;
  try {
    return FormApp.openById(id);
  } catch (err) {
    PropertiesService.getScriptProperties().deleteProperty(CK_FORM_PROP);
    return null;
  }
}

function ckGetOrCreateForm_() {
  var form = ckGetExistingForm_();
  if (form) return form;

  form = FormApp.create(CK_FORM_TITLE);
  PropertiesService.getScriptProperties().setProperty(CK_FORM_PROP, form.getId());
  Logger.log('Form baru dibuat: ' + form.getId());
  return form;
}

function ckBuildFormQuestions_(form) {
  var items = form.getItems();
  for (var i = items.length - 1; i >= 0; i--) form.deleteItem(items[i]);

  form.setTitle(CK_FORM_TITLE);
  form.setDescription(
    'Form Checklist Kendaraan PT HBPA.\n\n' +
    'Isi identitas kendaraan, lalu pilih kondisi setiap item. ' +
    'Data otomatis masuk ke dashboard Facility dan bisa dicetak dari aplikasi.\n\n' +
    'Catatan: tanda kerusakan pada gambar mobil hanya bisa dibuat lewat aplikasi.'
  );
  form.setConfirmationMessage('Checklist tersimpan. Data sudah masuk ke dashboard Facility.');
  form.setProgressBar(true);
  form.setShuffleQuestions(false);
  form.setAllowResponseEdits(false);
  try { form.setCollectEmail(false); } catch (err) { /* opsional */ }

  /* --- Identitas kendaraan --- */
  form.addSectionHeaderItem().setTitle('Identitas Kendaraan');

  form.addDateItem()
    .setTitle('Tanggal')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Counter')
    .setHelpText('Contoh: C-01');

  form.addTextItem()
    .setTitle('Tipe Mobil')
    .setHelpText('Contoh: Avanza');

  form.addTextItem()
    .setTitle('No. Polisi')
    .setHelpText('Contoh: KT 8107 YV')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Driver')
    .setRequired(true);

  var kilometer = form.addTextItem()
    .setTitle('Kilometer')
    .setHelpText('Contoh: 62000 atau 62.000. Boleh dikosongkan kalau tidak diketahui.');
  try {
    kilometer.setValidation(
      FormApp.createTextValidation()
        .requireTextMatchesPattern('^[0-9]{1,3}([.,][0-9]{3})*$|^[0-9]+$')
        .setHelpText('Isi kilometer dengan angka, misalnya 62000 atau 62.000.')
        .build()
    );
  } catch (err) { /* validasi tidak wajib */ }

  form.addListItem()
    .setTitle('BBM Masuk')
    .setChoiceValues(CK_FORM_BBM);

  form.addListItem()
    .setTitle('BBM Keluar')
    .setChoiceValues(CK_FORM_BBM);

  form.addParagraphTextItem()
    .setTitle('Keterangan')
    .setHelpText('Catatan umum kondisi kendaraan.');

  form.addTextItem()
    .setTitle('Diperiksa Oleh')
    .setRequired(true);

  /* --- Grid kondisi per grup --- */
  var groups = ckFormGroups_();
  groups.forEach(function (group, index) {
    form.addPageBreakItem().setTitle('Pemeriksaan ' + (index + 1) + ' — ' + group.grup);
    form.addGridItem()
      .setTitle(group.grup)
      .setHelpText('Pilih kondisi setiap item.')
      .setRows(group.items)
      .setColumns(CK_FORM_STATUS)
      .setRequired(true);
  });

  /* --- Catatan kerusakan --- */
  form.addPageBreakItem().setTitle('Catatan');
  form.addParagraphTextItem()
    .setTitle(CK_FORM_NOTE_TITLE)
    .setHelpText('Catatan ini ditempel ke semua item yang berstatus Rusak atau Tidak Ada.');

  Logger.log('Pertanyaan Form dibangun ulang: ' + groups.length + ' grup item.');
}

/* =====================================================
   TRIGGER & PEMETAAN JAWABAN
   ===================================================== */

function ckDeleteFormTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onChecklistFormSubmit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function ckInstallFormTrigger_(form) {
  ckDeleteFormTriggers_();
  ScriptApp.newTrigger('onChecklistFormSubmit')
    .forForm(form)
    .onFormSubmit()
    .create();
  Logger.log('Trigger onChecklistFormSubmit dipasang.');
}

/**
 * Dipanggil otomatis oleh Google Form setiap ada kiriman.
 * Jangan jalankan manual tanpa event.
 */
function onChecklistFormSubmit(e) {
  if (!e || !e.response) {
    Logger.log('onChecklistFormSubmit harus berjalan dari trigger Form.');
    return;
  }

  var body;
  try {
    body = ckBodyFromFormResponse_(e.response);
  } catch (err) {
    Logger.log('Gagal membaca jawaban Form: ' + err);
    return;
  }

  if (!body.kendaraan || !body.driver || !body.items.length) {
    Logger.log('Kiriman Form dilewati: plat/driver/item kosong.');
    return;
  }

  try {
    // Kunci supaya nomor ID_CK tidak bentrok kalau ada dua kiriman bersamaan.
    var result;
    if (typeof withLock_ === 'function') {
      result = withLock_(function () { return saveCk_(body); });
    } else {
      result = saveCk_(body);
    }
    if (!result || result.success === false) {
      Logger.log('Gagal menyimpan checklist Form: ' + JSON.stringify(result));
      return;
    }
    Logger.log('Checklist Form tersimpan: ' + result.data.item.id +
      ' (' + body.items.length + ' item, rusak: ' + result.data.hasRusak + ')');
  } catch (err) {
    Logger.log('Error saat menyimpan checklist Form: ' + err);
  }
}

function ckBodyFromFormResponse_(response) {
  var values = {};
  var grids = [];
  var note = '';

  var responses = response.getItemResponses() || [];
  for (var i = 0; i < responses.length; i++) {
    var itemResponse = responses[i];
    var item = itemResponse.getItem();
    var title = String(item.getTitle() || '').trim();
    var value = itemResponse.getResponse();
    var isGrid = false;
    try { isGrid = item.getType() === FormApp.ItemType.GRID; } catch (err) { isGrid = false; }

    if (isGrid) {
      var rows = [];
      try { rows = item.asGridItem().getRows(); } catch (err) { rows = []; }
      grids.push({
        grup: title,
        rows: rows || [],
        answers: Array.isArray(value) ? value : []
      });
    } else if (title === CK_FORM_NOTE_TITLE) {
      note = ckText_(value);
    } else {
      values[title] = value;
    }
  }

  // Fallback kalau judul grid tidak bisa dibaca (mis. Form lama).
  var groups = [];
  if (grids.some(function (grid) { return !grid.rows.length; })) {
    groups = ckFormGroups_();
  }
  function fallbackRows(grup) {
    for (var g = 0; g < groups.length; g++) {
      if (groups[g].grup === grup) return groups[g].items;
    }
    return [];
  }

  var items = [];
  grids.forEach(function (grid) {
    var rows = grid.rows.length ? grid.rows : fallbackRows(grid.grup);
    rows.forEach(function (itemName, index) {
      var status = ckStatus_(grid.answers[index]);
      items.push({
        grup: grid.grup,
        item: itemName,
        status: status,
        catatan: status === 'Baik' ? '' : note
      });
    });
  });

  return {
    tanggal: ckDateText_(values['Tanggal']),
    counter: ckText_(values['Counter']),
    kendaraan: ckText_(values['No. Polisi']),
    tipeMobil: ckText_(values['Tipe Mobil']),
    driver: ckText_(values['Driver']),
    kilometer: ckText_(values['Kilometer']),
    bbmMasuk: ckText_(values['BBM Masuk']),
    bbmKeluar: ckText_(values['BBM Keluar']),
    keterangan: ckText_(values['Keterangan']),
    diperiksaOleh: ckText_(values['Diperiksa Oleh']),
    items: items,
    damages: [],
    createdBy: 'Google Form'
  };
}

/* =====================================================
   BANTUAN
   ===================================================== */

function ckText_(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ').trim();
  return String(value).trim();
}

function ckStatus_(value) {
  var text = ckText_(value).toLowerCase();
  if (text === 'rusak') return 'Rusak';
  if (text === 'tidak ada' || text === 'tidakada') return 'Tidak Ada';
  return 'Baik';
}

function ckDateText_(value) {
  var tz = (typeof CONFIG !== 'undefined' && CONFIG.timezone) ? CONFIG.timezone : Session.getScriptTimeZone();

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, tz, 'dd/MM/yyyy');
  }

  var text = ckText_(value);
  var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];

  var slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (slash) {
    var day = ('0' + slash[1]).slice(-2);
    var month = ('0' + slash[2]).slice(-2);
    return day + '/' + month + '/' + slash[3];
  }

  if (!text) return Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy');
  return text;
}

function ckNorm_(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function ckAlert_(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (err) {
    // Dipanggil dari editor/trigger: cukup lihat Logger.log.
  }
}
