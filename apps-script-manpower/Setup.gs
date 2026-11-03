/**
 * Setup.gs — pembuat Google Form + link ke spreadsheet MANPOWER
 *
 * Jalankan setup() dari Apps Script.
 *
 * - Jika belum ada data, setup memperbarui Form yang sudah ada di Script
 *   Properties tanpa mengganti ID/URL Form; pertanyaan dibangun ulang dan
 *   sheet respons diisi ulang dari nol.
 * - Jika sudah ada jawaban di tab respons, setup tidak mengubah apa pun.
 * - resetManpower() membuat backup, menghapus sheet respons/Config, dan
 *   membuat Form baru dari nol.
 */

var REQUEST_SHEET = 'Requests';
var COMPLETION_SHEET = 'Job Completion';
var PROP_REQUEST = 'FORM_REQUEST';
var PROP_COMPLETION = 'FORM_COMPLETION';
const OUTLINE_ROWS = 10;
const MANPOWER_ROWS = 4;
const JOB_DESC_ROWS = 15;

function findResponseSheets_(ss) {
  var valid = ['Requests', 'Job Completion'];
  return ss.getSheets().filter(function (sheet) {
    var name = sheet.getName();
    return valid.indexOf(name) >= 0 || /^Form Responses(\s|$|\d)/i.test(name);
  });
}

function hasFormData_(ss) {
  return findResponseSheets_(ss).some(function (sheet) {
    return sheet.getLastRow() > 1;
  });
}

function backupSpreadsheet_(ss, label) {
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  var file = DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + ' - Backup ' + label + ' ' + stamp);
  Logger.log('Backup dibuat: ' + file.getName() + ' (' + file.getId() + ')');
  return file;
}

function deleteResponseSheets_(ss, tempSheet) {
  ss.getSheets().forEach(function (sheet) {
    if (tempSheet && sheet.getSheetId() === tempSheet.getSheetId()) return;
    var name = sheet.getName();
    if (name === REQUEST_SHEET || name === COMPLETION_SHEET || /^Form Responses(\s|$|\d)/i.test(name)) {
      ss.deleteSheet(sheet);
    }
  });
}

function clearForm_(form) {
  form.getItems().forEach(function (item) {
    try {
      form.deleteItem(item);
    } catch (err) {
      Logger.log('Item form dilewati: ' + err);
    }
  });
}

function unlinkFormIfLinked_(ss, form) {
  try {
    if (form.getDestinationType && form.getDestinationType() === FormApp.DestinationType.SPREADSHEET &&
        String(form.getDestinationId()) === String(ss.getId())) {
      form.removeDestination();
    }
  } catch (err) {
    Logger.log('Unlink form dilewati: ' + err);
  }
}

function rebuildForm_(ss, form, builder, desiredName, requiredHeaders) {
  clearForm_(form);
  var beforeIds = sheetIds_(ss);
  builder(form);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  return useOrRenameResponseSheet_(ss, desiredName, requiredHeaders, beforeIds);
}

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script ini harus ditempel pada spreadsheet target.');

  deleteFormTriggers_();

  var responseSheets = findResponseSheets_(ss);
  if (responseSheets.some(function (sheet) { return sheet.getLastRow() > 1; })) {
    Logger.log('Ada jawaban di tab respons; setup tetap memperbarui form dan sheet. (Gunakan resetManpower() untuk mulai dari nol.)');
  }

  if (responseSheets.length) backupSpreadsheet_(ss, 'before-setup');

  var temp = ss.insertSheet('_Setup');
  var requestForm = getOrCreateForm_(PROP_REQUEST, 'Manpower Requisition Form - Hidup Baru', createRequestForm_);
  var completionForm = getOrCreateForm_(PROP_COMPLETION, 'Job Completion Report - Hidup Baru', createCompletionForm_);

  unlinkFormIfLinked_(ss, requestForm);
  unlinkFormIfLinked_(ss, completionForm);
  deleteResponseSheets_(ss, temp);
  var requestsSheet = rebuildForm_(ss, requestForm, buildRequestForm_, REQUEST_SHEET, ['Requester Name', 'Department']);
  var completionSheet = rebuildForm_(ss, completionForm, buildCompletionForm_, COMPLETION_SHEET, ['Reported By', 'Job Name']);

  var config = ss.getSheetByName('Config') || ss.insertSheet('Config');
  config.clear();
  config.getRange(1, 1, 6, 2).setValues([
    ['Item', 'Link / Catatan'],
    ['Form Manpower Requisition', requestForm.getPublishedUrl()],
    ['Form Job Completion Report', completionForm.getPublishedUrl()],
    ['Requests', REQUEST_SHEET],
    ['Job Completion', COMPLETION_SHEET],
    ['Catatan', 'Dashboard MANPOWER membaca kedua sheet ini. Form boleh diedit, tetapi jangan ubah nama kolom utama tanpa update API.']
  ]);
  config.getRange(1, 1, 1, 2).setFontWeight('bold');
  config.autoResizeColumns(1, 2);

  if (temp && ss.getSheetByName('_Setup')) ss.deleteSheet(temp);
  Logger.log('Setup selesai.');
  Logger.log('Requests : ' + requestForm.getPublishedUrl());
  Logger.log('Completion: ' + completionForm.getPublishedUrl());
}

/**
 * Reset total MANPOWER: backup spreadsheet, unlink + trash form lama,
 * hapus sheet respons/config lama, lalu buat setup baru dari nol.
 *
 * Aman dijalankan manual karena:
 * - spreadsheet disalin ke Google Drive lebih dulu;
 * - form/sheet yang sudah terunlink harus lewat removeDestination();
 * - sheet lain yang tidak cocok dengan nama lama tidak dihapus.
 */
function resetManpower() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script ini harus ditempel pada spreadsheet target.');

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  var backup = DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + ' - Backup ' + stamp);
  Logger.log('Backup dibuat: ' + backup.getName() + ' (' + backup.getId() + ')');

  // Google butuh minimal satu sheet. Sheet sementara memastikan proses boleh menghapus sheet lama.
  var temp = ss.insertSheet('_Setup');

  trashAndUnlinkForm_(PROP_REQUEST);
  trashAndUnlinkForm_(PROP_COMPLETION);
  var unlinked = unlinkFormsLinkedToSpreadsheet_(ss);
  Logger.log('Form linked ke spreadsheet ini yang di-unlink: ' + unlinked);

  var targets = [REQUEST_SHEET, COMPLETION_SHEET, 'Config'];
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (sheet.getSheetId() === temp.getSheetId()) return;
    if (targets.indexOf(name) < 0 && !/^Form Responses(\s|$|\d)/i.test(name)) return;
    ss.deleteSheet(sheet);
  });

  deleteFormTriggers_();
  clearSetupProperties_();

  setup();

  // setup() sudah membuat sheet baru. Baru hapus sheet sementara ini.
  var createdTemp = ss.getSheetByName('_Setup');
  if (createdTemp) ss.deleteSheet(createdTemp);
  Logger.log('resetManpower selesai. Spreadsheet hasil reset sudah siap dipakai.');
}

/** MEMINDAHKAN kedua form ke Trash. Sheet respons tidak ikut dihapus. */
function resetForms() {
  trashForm_(PROP_REQUEST);
  trashForm_(PROP_COMPLETION);
  deleteFormTriggers_();
  Logger.log('Form MANPOWER dipindahkan ke Trash. Jalankan setup() untuk membuat form baru.');
}

function deleteFormTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var fn = trigger.getHandlerFunction();
    if (fn === 'onRequestSubmit' || fn === 'onCompletionSubmit' || fn === 'onManpowerFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function sheetIds_(ss) {
  return ss.getSheets().map(function (sh) { return sh.getSheetId(); });
}

function getOrCreateForm_(key, title, creator) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(key);
  if (id) {
    try {
      return FormApp.openById(id);
    } catch (err) {
      props.deleteProperty(key);
    }
  }
  var form = creator();
  props.setProperty(key, form.getId());
  return form;
}

function connectForm_(ss, beforeIds, form, desiredName, requiredHeaders) {
  var destination = '';
  try { destination = form.getDestinationId() || ''; } catch (err) { destination = ''; }

  if (destination && destination !== ss.getId()) {
    throw new Error('Form sudah terhubung ke spreadsheet lain. Putuskan dulu atau jalankan resetForms() jika memang ingin membuat ulang.');
  }

  if (destination === ss.getId()) {
    var existing = ss.getSheetByName(desiredName);
    if (existing && hasHeaders_(existing, requiredHeaders)) return existing;
    return useOrRenameResponseSheet_(ss, desiredName, requiredHeaders, null);
  }

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  return useOrRenameResponseSheet_(ss, desiredName, requiredHeaders, beforeIds);
}

function useOrRenameResponseSheet_(ss, desiredName, requiredHeaders, beforeIds) {
  // Jika sheet dengan nama desired sudah ada, rename dulu ke nama backup
  // supaya sheet respons baru bisa mengambil nama desired (tanpa error "sudah ada").
  var desired = ss.getSheetByName(desiredName);
  if (desired && beforeIds && beforeIds.indexOf(desired.getSheetId()) < 0) {
    // desired adalah sheet baru (respons form), tidak perlu rename.
  } else if (desired) {
    var backupName = desiredName + ' (lama)';
    var counter = 1;
    while (ss.getSheetByName(backupName)) { backupName = desiredName + ' (lama ' + counter + ')'; counter++; }
    try { desired.setName(backupName); } catch (err) { /* biarkan, akan di-handle di bawah */ }
    desired = ss.getSheetByName(desiredName); // null setelah rename
  }

  if (desired && hasHeaders_(desired, requiredHeaders)) return desired;

  var candidates = ss.getSheets().filter(function (sh) {
    if (beforeIds && beforeIds.indexOf(sh.getSheetId()) >= 0) return false;
    return hasHeaders_(sh, ['Timestamp'].concat(requiredHeaders));
  });

  if (candidates.length === 0) {
    throw new Error('Sheet respons untuk "' + desiredName + '" tidak bisa dikenali. Cek tab baru di spreadsheet.');
  }

  // Pilih kandidat terakhir (paling baru dibuat oleh Google Forms).
  var chosen = candidates[candidates.length - 1];

  if (desired) {
    // desired lama (bukan respons form) — rename ke backup
    var backupName2 = desiredName + ' (lama)';
    var c2 = 1;
    while (ss.getSheetByName(backupName2)) { backupName2 = desiredName + ' (lama ' + c2 + ')'; c2++; }
    try { desired.setName(backupName2); } catch (err) { /* abaikan */ }
  }

  chosen.setName(desiredName);
  chosen.setFrozenRows(1);
  return chosen;
}

function hasHeaders_(sheet, headers) {
  if (!sheet || sheet.getLastColumn() < headers.length) return false;
  var actual = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); });
  return headers.every(function (header) {
    return actual.indexOf(String(header).toLowerCase().replace(/[^a-z0-9]/g, '')) >= 0;
  });
}

function collectFormCandidates_() {
  var formType = 'application/vnd.google-apps.form';
  var out = [];
  var iterators = [DriveApp.getFilesByType(formType), DriveApp.getTrashedFiles()];
  iterators.forEach(function (iterator) {
    while (iterator.hasNext()) {
      var file = iterator.next();
      try {
        if (String(file.getMimeType()) === formType) out.push(file);
      } catch (err) { /* abaikan file yang tidak bisa dibaca */ }
    }
  });
  return out;
}

function unlinkFormsLinkedToSpreadsheet_(ss) {
  var count = 0;
  collectFormCandidates_().forEach(function (file) {
    var form = null;
    var wasAlreadyAccessible = false;

    try {
      form = FormApp.openById(file.getId());
      wasAlreadyAccessible = true;
    } catch (err) {
      try {
        // Form yang ada di Trash harus dikembalikan dulu agar bisa di-unlink.
        file.setTrashed(false);
        form = FormApp.openById(file.getId());
      } catch (err2) {
        return;
      }
    }

    try {
      var destinationType = form.getDestinationType ? form.getDestinationType() : null;
      var destinationId = form.getDestinationId ? String(form.getDestinationId()) : '';
      var linked = destinationType === FormApp.DestinationType.SPREADSHEET && destinationId === String(ss.getId());
      if (!linked) {
        if (!wasAlreadyAccessible) {
          try { file.setTrashed(true); } catch (err3) { /* biarkan tetap di Trash */ }
        }
        return;
      }

      form.removeDestination();
      file.setTrashed(true);
      count += 1;
      Logger.log('Form di-unlink dan dipindahkan ke Trash: ' + file.getName());
    } catch (err4) {
      Logger.log('Unlink gagal untuk ' + file.getName() + ': ' + err4);
    }
  });
  return count;
}

function trashAndUnlinkForm_(key) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(key);
  if (!id) return;

  var file = null;
  try {
    file = DriveApp.getFileById(id);
    // Restore sementara bila form sudah ada di Trash, supaya bisa di-unlink dulu.
    file.setTrashed(false);
  } catch (err) {
    props.deleteProperty(key);
    return;
  }

  try {
    FormApp.openById(id).removeDestination();
  } catch (err) {
    Logger.log('Unlink form dilewati: ' + err);
  }

  try {
    if (file) file.setTrashed(true);
  } catch (err) {
    Logger.log('Memindahkan form ke Trash gagal: ' + err);
  }
  props.deleteProperty(key);
}

function clearSetupProperties_() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_REQUEST);
  PropertiesService.getScriptProperties().deleteProperty(PROP_COMPLETION);
}

function trashForm_(key) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(key);
  if (id) {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (err) { /* form sudah hilang */ }
  }
  props.deleteProperty(key);
}

/* ================== PEMBUATAN FORM ================== */

function addYesNoItem_(form, title) {
  var item = form.addMultipleChoiceItem().setTitle(title).setRequired(true);
  item.setChoiceValues(['Ya', 'Tidak']);
  return item;
}

function setYesNoItem_(item, noTarget) {
  item.setChoices([
    item.createChoice('Ya', FormApp.PageNavigationType.CONTINUE),
    item.createChoice('Tidak', noTarget),
  ]);
}

function createRequestForm_() {
  return buildRequestForm_(FormApp.create('Manpower Requisition Form - Hidup Baru'));
}

function buildRequestForm_(form) {
  form.setTitle('Manpower Requisition Form - Hidup Baru');
  form.setCollectEmail(true);
  form.setDescription('Isi form ini untuk mengajukan kebutuhan manpower.');
  form.setConfirmationMessage('Permintaan manpower sudah terkirim.');

  form.addTextItem().setTitle('Requester Name').setRequired(true);
  form.addTextItem().setTitle('Department').setRequired(true);
  form.addTextItem().setTitle('Division').setRequired(true);
  form.addDateItem().setTitle('Requested Date').setRequired(true);
  form.addCheckboxItem().setTitle('Required Manpower')
    .setChoiceValues(['Electrical', 'Civil', 'Mechanical']).setRequired(true);

  form.addSectionHeaderItem().setTitle('Job Out Line / Short Description')
    .setHelpText('Isi poin 1, lalu pilih apakah ingin menambah poin berikutnya.');
  var outlineItems = [];
  for (var i = 1; i <= OUTLINE_ROWS; i++) {
    if (i > 1) form.addPageBreakItem().setTitle('Job Out Line ' + i);
    form.addTextItem().setTitle('Job Out Line ' + i).setRequired(true);
    if (i < OUTLINE_ROWS) outlineItems.push(addYesNoItem_(form, 'Tambah Job Out Line ke-' + (i + 1) + '?'));
  }
  outlineItems.forEach(function (item) { setYesNoItem_(item, FormApp.PageNavigationType.SUBMIT); });
  return form;
}

function createCompletionForm_() {
  return buildCompletionForm_(FormApp.create('Job Completion Report - Hidup Baru'));
}

function buildCompletionForm_(form) {
  form.setTitle('Job Completion Report - Hidup Baru');
  form.setCollectEmail(true);
  form.setDescription('Isi form ini setelah pekerjaan selesai.');
  form.setConfirmationMessage('Laporan penyelesaian pekerjaan sudah terkirim.');

  form.addTextItem().setTitle('Reported By').setRequired(true);
  form.addTextItem().setTitle('Job Name').setRequired(true);
  form.addTextItem().setTitle('Job No.').setRequired(true);
  form.addTextItem().setTitle('Location').setRequired(true);
  form.addDateTimeItem().setTitle('Date & Time').setRequired(true);

  form.addSectionHeaderItem().setTitle('Manpower Name / Classification')
    .setHelpText('Isi manpower 1, lalu pilih apakah ingin menambah manpower berikutnya.');
  var manpowerItems = [];
  for (var i = 1; i <= MANPOWER_ROWS; i++) {
    if (i > 1) form.addPageBreakItem().setTitle('Manpower ' + i);
    form.addTextItem().setTitle('Manpower ' + i + ' - Name').setRequired(true);
    form.addTextItem().setTitle('Manpower ' + i + ' - Classification').setRequired(true);
    if (i < MANPOWER_ROWS) manpowerItems.push(addYesNoItem_(form, 'Tambah Manpower ke-' + (i + 1) + '?'));
  }

  var pageJob = form.addPageBreakItem().setTitle('Job Description - No. 1')
    .setHelpText('Isi sesuai tabel NO / Date & Time / Job Description.');
  var jobDescriptionItems = [];
  for (var j = 1; j <= JOB_DESC_ROWS; j++) {
    if (j > 1) form.addPageBreakItem().setTitle('Job Description - No. ' + j);
    form.addDateTimeItem().setTitle('No. ' + j + ' - Date & Time').setRequired(true);
    form.addTextItem().setTitle('No. ' + j + ' - Job Description').setRequired(true);
    if (j < JOB_DESC_ROWS) jobDescriptionItems.push(addYesNoItem_(form, 'Tambah Job Description ke-' + (j + 1) + '?'));
  }

  var pageEnd = form.addPageBreakItem().setTitle('End User');
  form.addTextItem().setTitle('End User Name').setRequired(true);
  form.addTextItem().setTitle('End User Position').setRequired(true);

  manpowerItems.forEach(function (item) { setYesNoItem_(item, pageJob); });
  jobDescriptionItems.forEach(function (item) { setYesNoItem_(item, pageEnd); });
  return form;
}
