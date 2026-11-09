/**
 * Code.gs — Backend JSON MANPOWER untuk dashboard Facility PT HBPA
 * ==================================================================
 * Menyediakan API admin untuk dua tab respons Google Form:
 *   - Requests
 *   - Job Completion
 *
 * Tidak ada pengidentifikasi internal, status, atau trigger form.
 * Semua akses dibatasi action yang dikenal. Data edit memakai rowId + sig.
 * ==================================================================
 */

var MR_CONFIG = {
  timezone: 'Asia/Makassar',
  tabs: {
    requests: 'Requests',
    completion: 'Job Completion'
  },
  /** Batas body POST (JSON). */
  maxBodyBytes: 200000
};

/** Field langsung yang bisa dibaca/diedit. Header boleh punya alias dari Google Form. */
var REQUEST_FIELDS = [
  { key: 'timestamp', label: 'Timestamp', aliases: ['Timestamp'] },
  { key: 'requesterEmail', label: 'Requester Email', aliases: ['Requester Email', 'Email Address', 'Email'] },
  { key: 'requesterName', label: 'Requester Name', aliases: ['Requester Name', 'Nama Requester'] },
  { key: 'department', label: 'Department', aliases: ['Department'] },
  { key: 'division', label: 'Division', aliases: ['Division'] },
  { key: 'requestedDate', label: 'Requested Date', aliases: ['Requested Date', 'Requested date'] },
  { key: 'requiredManpower', label: 'Required Manpower', aliases: ['Required Manpower'] },
  { key: 'jobOutline', label: 'Job Outline', aliases: [], virtual: true }
];

var COMPLETION_FIELDS = [
  { key: 'timestamp', label: 'Timestamp', aliases: ['Timestamp'] },
  { key: 'submittedByEmail', label: 'Submitted By (Email)', aliases: ['Submitted By (Email)', 'Completed By (Email)', 'Email Address', 'Email'] },
  { key: 'reportedBy', label: 'Reported By', aliases: ['Reported By'] },
  { key: 'jobName', label: 'Job Name', aliases: ['Job Name'] },
  { key: 'jobNo', label: 'Job No.', aliases: ['Job No.', 'Job No'] },
  { key: 'location', label: 'Location', aliases: ['Location'] },
  { key: 'dateTime', label: 'Date & Time', aliases: ['Date & Time', 'Job Date & Time'] },
  { key: 'manpower', label: 'Manpower', aliases: [], virtual: true },
  { key: 'jobDescriptionLog', label: 'Job Description Log', aliases: [], virtual: true },
  { key: 'endUserName', label: 'End User Name', aliases: ['End User Name'] },
  { key: 'endUserPosition', label: 'End User Position', aliases: ['End User Position'] }
];

/* ================== PINTU MASUK ================== */

function doGet(e) {
  var param = (e && e.parameter) ? e.parameter : {};
  var action = param.action || 'getSummary';
  return respond_(function () {
    return dispatch_(action, param);
  });
}

function doPost(e) {
  return respond_(function () {
    var body = parsePost_(e);
    if (!body || !body.action) throw new Error('POST harus berisi action.');
    var action = body.action;
    delete body.action;
    return dispatch_(action, body);
  });
}

function respond_(fn) {
  try {
    var result = fn();
    return json_({ success: true, data: result });
  } catch (err) {
    Logger.log(err && err.stack ? err.stack : String(err));
    return json_({ success: false, message: String(err && err.message ? err.message : err) });
  }
}

function dispatch_(action, param) {
  param = param || {};
  switch (action) {
    case 'getSummary':       return getSummary_();
    case 'getRequests':      return listRows_('requests', param);
    case 'getRequest':       return getRow_('requests', rowId_(param));
    case 'getCompletions':   return listRows_('completion', param);
    case 'getCompletion':    return getRow_('completion', rowId_(param));
    case 'saveRequest':      return saveRow_('requests', param);
    case 'createRequest':    return createRow_('requests', param);
    case 'saveCompletion':   return saveRow_('completion', param);
    case 'createCompletion': return createRow_('completion', param);
    case 'deleteRequest':    return deleteRow_('requests', param);
    case 'deleteCompletion': return deleteRow_('completion', param);
    default: throw new Error('Aksi tidak dikenal: ' + action);
  }
}

function parsePost_(e) {
  var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
  if (!raw) throw new Error('Tidak ada data POST.');
  if (raw.length > MR_CONFIG.maxBodyBytes) throw new Error('Payload terlalu besar.');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('Body POST tidak bisa dibaca JSON.');
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function rowId_(param) {
  var rowId = Number(param.rowId || param.id);
  if (!rowId) throw new Error('rowId wajib diisi.');
  return rowId;
}

/* ================== SHEET & HEADER ================== */

function sheet_(which) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = MR_CONFIG.tabs[which];
  var sh = ss && name ? ss.getSheetByName(name) : null;
  if (!sh) throw new Error('Tab "' + (name || which) + '" tidak ditemukan di spreadsheet.');
  return sh;
}

function specs_(which) {
  return which === 'requests' ? REQUEST_FIELDS : COMPLETION_FIELDS;
}

function normalize_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function headerLookup_(sh) {
  var lastCol = sh.getLastColumn();
  if (!lastCol) return {};
  var headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var out = {};
  for (var i = 0; i < headers.length; i++) {
    var key = normalize_(headers[i]);
    if (key && !out[key]) out[key] = i + 1;
  }
  return out;
}

function columnMap_(sh, which) {
  var lookup = headerLookup_(sh);
  var byKey = {};
  specs_(which).forEach(function (f) {
    if (f.virtual) return;
    for (var i = 0; i < f.aliases.length; i++) {
      var col = lookup[normalize_(f.aliases[i])];
      if (col) {
        byKey[f.key] = col;
        return;
      }
    }
  });
  return byKey;
}

function splitNumberedLines_(text, maxRows) {
  var lines = String(text || '').split(/\r?\n/)
    .map(function (line) { return line.trim(); })
    .filter(function (line) { return line !== ''; });
  if (lines.length > maxRows) throw new Error('Maksimal ' + maxRows + ' baris.');
  return lines.map(function (line) { return line.replace(/^\s*\d+[\.\)]\s*/, ''); });
}

function findOrCreateColumn_(sh, title) {
  var key = normalize_(title);
  var lookup = headerLookup_(sh);
  if (lookup[key]) return lookup[key];
  var col = sh.getLastColumn() + 1;
  sh.getRange(1, col).setValue(title).setFontWeight('bold');
  return col;
}

function readRow_(row, rowId, which, byKey, allCols) {
  var item = itemFromRow_(row, rowId, which, byKey);

  function cell(title) {
    var col = allCols[normalize_(title)];
    return col ? String(row[col - 1] == null ? '' : row[col - 1]).trim() : '';
  }

  if (which === 'requests') {
    var outline = [];
    for (var i = 1; i <= 10; i++) {
      var value = cell('Job Out Line ' + i);
      if (value) outline.push(i + '. ' + value);
    }
    item.jobOutline = outline.join('\n');
    return item;
  }

  var manpower = [];
  for (var m = 1; m <= 4; m++) {
    var name = cell('Manpower ' + m + ' - Name');
    var classification = cell('Manpower ' + m + ' - Classification');
    if (name || classification) manpower.push(m + '. ' + name + (classification ? ' | ' + classification : ''));
  }
  item.manpower = manpower.join('\n');

  var logs = [];
  for (var n = 1; n <= 15; n++) {
    var dateTime = cell('No. ' + n + ' - Date & Time');
    var description = cell('No. ' + n + ' - Job Description');
    if (dateTime || description) logs.push(n + '. ' + dateTime + (description ? ' | ' + description : ''));
  }
  item.jobDescriptionLog = logs.join('\n');
  return item;
}

function sig_(row) {
  return (row || []).map(function (v) { return String(v == null ? '' : v).trim(); }).join('|');
}

function itemFromRow_(row, rowId, which, byKey) {
  var item = { rowId: rowId, sig: sig_(row) };
  specs_(which).forEach(function (f) {
    var col = byKey[f.key];
    item[f.key] = col ? String(row[col - 1] == null ? '' : row[col - 1]).trim() : '';
  });
  return item;
}

function readAll_(which) {
  var sh = sheet_(which);
  var byKey = columnMap_(sh, which);
  var lastCol = sh.getLastColumn();
  var start = 2;
  var count = sh.getLastRow() - start + 1;
  if (count < 1) return { items: [], byKey: byKey };

  var rows = sh.getRange(start, 1, count, lastCol).getDisplayValues();
  var allCols = headerLookup_(sh);
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    items.push(readRow_(rows[i], start + i, which, byKey, allCols));
  }
  return { items: items, byKey: byKey };
}

/* ================== API ================== */

function getSummary_() {
  var req = readAll_('requests').items;
  var comp = readAll_('completion').items;
  return {
    totalRequests: req.length,
    totalCompletions: comp.length,
    latestRequest: req.length ? req[req.length - 1] : null,
    latestCompletion: comp.length ? comp[comp.length - 1] : null
  };
}

function listRows_(which, param) {
  var read = readAll_(which);
  var query = String(param.q || '').toLowerCase().trim();
  var items = read.items.slice();
  var specs = specs_(which);

  if (query) {
    items = items.filter(function (item) {
      return specs.some(function (f) {
        return String(item[f.key] || '').toLowerCase().indexOf(query) >= 0;
      });
    });
  }

  items.sort(function (a, b) { return b.rowId - a.rowId; });
  var page = Math.max(1, parseInt(param.page, 10) || 1);
  var pageSize = Math.min(100, Math.max(1, parseInt(param.pageSize, 10) || 50));
  var start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page: page,
      pageSize: pageSize,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize))
    }
  };
}

function getRow_(which, rowId) {
  var sh = sheet_(which);
  if (rowId < 2 || rowId > sh.getLastRow()) throw new Error('Data tidak ditemukan.');
  var byKey = columnMap_(sh, which);
  var allCols = headerLookup_(sh);
  var row = sh.getRange(rowId, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  return readRow_(row, rowId, which, byKey, allCols);
}

function saveVirtualFields_(sh, rowId, which, fields) {
  function valueText(value) { return value === undefined || value === null ? '' : String(value); }

  if (fields.jobOutline !== undefined) {
    var outline = valueText(fields.jobOutline).split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line !== ''; });
    if (outline.length > 10) throw new Error('Maksimal 10 poin Job Outline.');
    for (var i = 0; i < 10; i++) {
      var line = outline[i] || '';
      var col = findOrCreateColumn_(sh, 'Job Out Line ' + (i + 1));
      sh.getRange(rowId, col).setValue(line.replace(/^\s*\d+[\.\)]\s*/, ''));
    }
  }

  if (fields.manpower !== undefined) {
    var lines = valueText(fields.manpower).split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line !== ''; });
    if (lines.length > 4) throw new Error('Maksimal 4 manpower.');
    for (var m = 0; m < 4; m++) {
      var line = lines[m] || '';
      var clean = line.replace(/^\s*\d+[\.\)]\s*/, '');
      var split = clean.indexOf('|');
      var name = split >= 0 ? clean.slice(0, split).trim() : clean.trim();
      var classification = split >= 0 ? clean.slice(split + 1).trim() : '';
      sh.getRange(rowId, findOrCreateColumn_(sh, 'Manpower ' + (m + 1) + ' - Name')).setValue(name);
      sh.getRange(rowId, findOrCreateColumn_(sh, 'Manpower ' + (m + 1) + ' - Classification')).setValue(classification);
    }
  }

  if (fields.jobDescriptionLog !== undefined) {
    var entries = valueText(fields.jobDescriptionLog).split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line !== ''; });
    if (entries.length > 15) throw new Error('Maksimal 15 job description.');
    for (var n = 0; n < 15; n++) {
      var line = entries[n] || '';
      var clean = line.replace(/^\s*\d+[\.\)]\s*/, '');
      var split = clean.indexOf('|');
      var dateTime = split >= 0 ? clean.slice(0, split).trim() : '';
      var description = split >= 0 ? clean.slice(split + 1).trim() : clean.trim();
      sh.getRange(rowId, findOrCreateColumn_(sh, 'No. ' + (n + 1) + ' - Date & Time')).setValue(dateTime);
      sh.getRange(rowId, findOrCreateColumn_(sh, 'No. ' + (n + 1) + ' - Job Description')).setValue(description);
    }
  }
}

function saveRow_(which, body) {
  var rowId = rowId_(body);
  var fields = body.fields && typeof body.fields === 'object' ? body.fields : body;
  var sh = sheet_(which);
  if (rowId < 2 || rowId > sh.getLastRow()) throw new Error('Data tidak ditemukan.');

  var currentRow = sh.getRange(rowId, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  if (body.sig && sig_(currentRow) !== body.sig) {
    throw new Error('Isi baris ini sudah berubah di spreadsheet. Muat ulang halaman lalu coba lagi.');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    var byKey = columnMap_(sh, which);
    saveVirtualFields_(sh, rowId, which, fields);
    specs_(which).forEach(function (f) {
      if (f.virtual) return;
      if (fields[f.key] === undefined || fields[f.key] === null) return;
      var col = byKey[f.key];
      if (!col) {
        col = sh.getLastColumn() + 1;
        sh.getRange(1, col).setValue(f.label).setFontWeight('bold');
        byKey[f.key] = col;
      }
      sh.getRange(rowId, col).setValue(String(fields[f.key] == null ? '' : fields[f.key]));
    });
  } finally {
    lock.releaseLock();
  }
  return getRow_(which, rowId);
}

function createRow_(which, body) {
  body = body || {};
  var fields = body.fields && typeof body.fields === 'object' ? body.fields : body;
  if (which === 'requests' && !String(fields.requesterName || '').trim()) {
    throw new Error('Requester Name wajib diisi.');
  }
  if (which === 'completion' && !String(fields.reportedBy || '').trim() && !String(fields.jobName || '').trim()) {
    throw new Error('Reported By atau Job Name wajib diisi.');
  }
  if (JSON.stringify(fields).length > MR_CONFIG.maxBodyBytes) {
    throw new Error('Payload terlalu besar.');
  }

  var sh = sheet_(which);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  var rowId = 0;
  try {
    var lastCol = sh.getLastColumn();
    sh.appendRow(Array.from({ length: Math.max(lastCol, 1) }, function () { return ''; }));
    rowId = sh.getLastRow();

    var byKey = columnMap_(sh, which);
    if (!fields.timestamp) fields.timestamp = new Date();
    saveVirtualFields_(sh, rowId, which, fields);
    specs_(which).forEach(function (f) {
      if (f.virtual) return;
      if (fields[f.key] === undefined || fields[f.key] === null) return;
      var col = byKey[f.key];
      if (!col) {
        col = sh.getLastColumn() + 1;
        sh.getRange(1, col).setValue(f.label).setFontWeight('bold');
        byKey[f.key] = col;
      }
      sh.getRange(rowId, col).setValue(String(fields[f.key] == null ? '' : fields[f.key]));
    });
  } finally {
    lock.releaseLock();
  }
  return getRow_(which, rowId);
}

function deleteRow_(which, body) {
  var rowId = rowId_(body);
  var sh = sheet_(which);
  if (rowId < 2 || rowId > sh.getLastRow()) throw new Error('Data tidak ditemukan.');
  var currentRow = sh.getRange(rowId, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  if (body.sig && sig_(currentRow) !== body.sig) {
    throw new Error('Isi baris ini sudah berubah di spreadsheet. Muat ulang halaman lalu coba lagi.');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    sh.deleteRow(rowId);
  } finally {
    lock.releaseLock();
  }
  return { deleted: true };
}
