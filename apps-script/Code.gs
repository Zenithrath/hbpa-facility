/**
 * Code.gs — Backend JSON untuk Dashboard Facility PT HBPA
 * ============================================================================
 * CARA PAKAI
 *   1. Buat/ buka Google Apps Script yang menempel pada spreadsheet target.
 *   2. Ganti seluruh isi file Code.gs dengan isi file ini.
 *   3. isi CONFIG di bawah SESUAI spreadsheet kamu.
 *   4. Jalankan sekali fungsi setup() dari editor (Run > setup).
 *   5. Deploy > New deployment > Web app
 *        Execute as        : Me
 *        Who has access    : Anyone
 *   6. Salin URL /exec dan tempel ke src/config.ts (API_URL).
 *
 * CATATAN PENTING SOAL CORS
 *   Apps Script tidak bisa mengirim header Access-Control-Allow-Origin, jadi
 *   browser yang memanggil dari domain lain akan kena error CORS. Yang
 *  _memang_ berhasil adalah permintaan GET sederhana (tanpa header khusus):
 *   browser tidak mengirim preflight OPTIONS, dan balasannya boleh dibaca.
 *   Karena itu SELURUH API di sini memakai GET, termasuk operasi tulis.
 *   Jangan menambah header custom di sisi browser, nanti CORS muncul lagi.
 *
 * PEMETAAN KOLOM
 *   Backend TIDAK memakai nomor kolom, melainkan membaca judul di baris 1.
 *   Jadi urutan kolom di spreadsheet bebas, dan menambah kolom di tengah
 *   tidak membuat data lama salah tempat.
 * ============================================================================
 */

var CONFIG = {
  timezone: 'Asia/Makassar',

  tabs: {
    transport: 'TAB_TRANSPORT',
    inventaris: 'TAB_INVENTARIS'
  },

  /** Email tujuan + logo untuk lampiran PDF. */
  mail: {
    to: 'djibril.ranggadeja@gmail.com',
    logoUrl: 'https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png',
    logoDriveId: ''   // isi ID file Drive kalau logo tidak termuat dari URL
  },

  /** Umbral cache statistik di server (detik). */
  statsCacheSec: 180
};

/** Status yang sah. Nilai lama (Approved/Completed/Done) dinormalkan ke sini. */
var STATUS_CANON = ['Pending', 'Disetujui', 'Ditolak', 'Selesai'];
var STATUS_ALIAS = {
  'pending': 'Pending',
  'disetujui': 'Disetujui',
  'approved': 'Disetujui',
  'ditolak': 'Ditolak',
  'rejected': 'Ditolak',
  'selesai': 'Selesai',
  'completed': 'Selesai',
  'done': 'Selesai'
};

/** Jumlah permintaan yang boleh dikirim dalam satu email. */
var MAX_EMAIL_ROWS = 10;

/** Panjang JSON yang boleh masuk lewat query string. */
var MAX_WRITE_BYTES = 4000;


/* ============================================================================
   PINTU MASUK
   ============================================================================ */

function doGet(e) {
  var param = (e && e.parameter) ? e.parameter : {};
  var action = param.action || 'getBootstrap';
  var result;

  try {
    result = dispatch_(action, param);
  } catch (err) {
    result = fail_(String(err && err.message ? err.message : err));
    Logger.log('[' + action + '] ' + err);
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(action, param) {
  switch (action) {
    case 'getBootstrap':        return getBootstrap_();
    case 'getDashboardStats':   return { success: true, data: { stats: computeStats_() } };
    case 'getRequests':         return getRequests_(param);
    case 'getRequestDetail':    return getRequestDetail_(param.rowId || param.id);
    case 'createRequest':       return createRequest_(parseBody_(param));
    case 'updateRequest':       return updateRequest_(parseBody_(param));
    case 'updateRequestStatus': return updateRequestStatus_(param);
    case 'deleteRequest':       return deleteRequest_(param.rowId || param.id);
    case 'sendEmail':           return sendEmail_(param);

    case 'getInventarisData':   return getInventarisData_();
    case 'saveInventaris':      return saveInventaris_(parseBody_(param));

    case 'diagnose':            return { success: true, data: diagnose_() };
    default:                    return fail_('Aksi tidak dikenal: ' + action);
  }
}

function parseBody_(param) {
  if (!param.data) return {};
  try {
    return JSON.parse(param.data);
  } catch (e) {
    throw new Error('Data yang dikirim tidak bisa dibaca JSON.');
  }
}

function ok_(data) { return { success: true, data: data }; }
function fail_(message) { return { success: false, message: message }; }


/* ============================================================================
   SPREADSHEET
   ============================================================================ */

function sheet_(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = CONFIG.tabs[key];
  var sh = name ? ss.getSheetByName(name) : ss.getActiveSheet();
  if (!sh) throw new Error('Tab "' + (name || '(tab aktif)') + '" tidak ditemukan. Periksa CONFIG.tabs.');
  return sh;
}

function normalize_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dash_(v) {
  var s = String(v == null ? '' : v).trim();
  return s === '' ? '-' : s;
}

function normalizeStatus_(v) {
  var key = String(v == null ? '' : v).trim().toLowerCase();
  return STATUS_ALIAS[key] || 'Pending';
}

/**
 * Status inventaris hanya punya dua nilai.
 * Semua nilai lain (termasuk string yang tidak dikenal) dianggap masih
 * dipinjam, jadi baris lama tanpa kolom STATUS tidak salah tampil.
 */
function normalizeInvStatus_(v) {
  return normalizeStatus_(v) === 'Selesai' ? 'Selesai' : 'Dipinjam';
}

function parseDate_(value) {
  var s = String(value == null ? '' : value);
  var m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    var a = +m[1], b = +m[2], mon = a, day = b;
    if (a > 12 && b <= 12) { mon = b; day = a; }
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return new Date(+m[3], mon - 1, day);
  }
  return null;
}

function fmt_(date, pattern) {
  return Utilities.formatDate(date, CONFIG.timezone, pattern);
}

/* ============================================================================
   PEMETAAN KOLOM BERSAMA
   ============================================================================
   spec = {
   *   fields: [{ key, aliases:[..], contains:[..] }],
   *   repeat: [{ key, re: /^barang(\d*)$/ }]
   * }
   Urutan fields menentukan prioritas: yang lebih spesifik ditulis lebih dulu.
   ============================================================================ */

var COLS = {
  transport: {
    fields: [
      { key: 'no',        aliases: ['no', 'nomor', 'nosurat'] },
      { key: 'nama',      aliases: ['nama'],                 contains: ['nama'] },
      { key: 'dept',      aliases: ['divisi', 'department', 'dept'], contains: ['divisi', 'department', 'dept'] },
      { key: 'ijn',       aliases: ['ijn'],                  contains: ['ijn'] },
      { key: 'tujuan',    aliases: ['tujuan'],               contains: ['tujuan'] },
      { key: 'tglJam',    aliases: ['haritanggaljam', 'haritgljam', 'haritanggal'] },
      { key: 'tanggal',   aliases: ['tanggal'] },
      { key: 'nopol',     aliases: ['nopol', 'platno', 'platnomor', 'nopolkendaraan'], contains: ['nopol'] },
      { key: 'keperluan', aliases: ['keperluan'] },
      { key: 'status',    contains: ['status'] },
      { key: 'pemohon',   aliases: ['pemohon'],              contains: ['pemohon'] },
      { key: 'disetujui', aliases: ['disetujui'],            contains: ['disetujui'] },
      { key: 'driver',    aliases: ['driver', 'drivername', 'namadriver'], contains: ['driver'] },
      { key: 'timestamp', aliases: ['timestamp', 'waktupengajuan'] }
    ],
    repeat: [],
    identity: ['no', 'nama', 'tanggal']
  },

  inventaris: {
    fields: [
      { key: 'no',               aliases: ['no', 'nomor', 'nodok', 'nodokumen', 'nomordokumen'], col: 1 },
      { key: 'nama',             aliases: ['nama', 'namapeminjam'], contains: ['nama'] },
      { key: 'kontak',           aliases: ['kontak', 'nomerkontak', 'hp', 'nohp'], contains: ['kontak'] },
      { key: 'tglPinjam',        aliases: ['tglpeminjaman', 'tglpinjam', 'peminjaman'], contains: ['peminjaman'] },
      { key: 'tglKembali',       aliases: ['tglpengembalian', 'pengembalian', 'tglkembali', 'rencanakembali'] },
      { key: 'keperluan',        aliases: ['keperluan'] },
      { key: 'status',           contains: ['status'], create: 'STATUS' },
      { key: 'tglKembaliAktual', aliases: ['tglkembaliaktual', 'tglkembalianaktual', 'tglpengembalianaktual', 'kembalianaktual'], contains: ['aktual'], create: 'TGL KEMBALI AKTUAL' },
      { key: 'catatan',          aliases: ['catatan'], contains: ['catatan'], create: 'CATATAN' }
    ],
    repeat: [
      { key: 'barang',         label: 'BARANG',          re: /^barang(\d*)$/ },
      { key: 'qty',            label: 'QTY',             re: /^qty(\d*)$/ },
      { key: 'kondisiAmbil',   label: 'KONDISI AMBIL',   re: /^kondisiambil(\d*)$/ },
      { key: 'kondisiKembali', label: 'KONDISI KEMBALI', re: /^kondisikembali(\d*)$/ }
    ],
    identity: ['no', 'nama', 'tglPinjam']
  }
};

var colCache_ = {};

/** Nomor kolom untuk setiap field, dihitung dari judul baris 1. */
function cols_(key) {
  if (colCache_[key]) return colCache_[key];

  var spec = COLS[key];
  var sh = sheet_(key);
  var lastCol = sh.getLastColumn();
  var head = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : [];
  var out = { fields: {}, groups: {} };

  for (var i = 0; i < head.length; i++) {
    var n = normalize_(head[i]);
    if (!n) continue;
    var col = i + 1;

    for (var r = 0; r < (spec.repeat || []).length; r++) {
      var rep = spec.repeat[r];
      var m = n.match(rep.re);
      if (!m) continue;
      var num = m[1] ? m[1] : '1';
      var g = out.groups[num] || (out.groups[num] = {});
      if (!g[rep.key]) g[rep.key] = col;
    }

    for (var f = 0; f < spec.fields.length; f++) {
      var fd = spec.fields[f];
      if (out.fields[fd.key]) continue;
      var exact = fd.aliases && fd.aliases.indexOf(n) !== -1;
      var loose = fd.contains && fd.contains.some(function (c) { return n.indexOf(c) !== -1; });
      if (exact || loose) out.fields[fd.key] = col;
    }
  }

  // Kolom cadangan untuk judul yang tidak dikenali.
  for (var j = 0; j < spec.fields.length; j++) {
    var fb = spec.fields[j];
    if (!out.fields[fb.key] && fb.col) out.fields[fb.key] = fb.col;
  }

  colCache_[key] = out;
  return out;
}

function val_(row, colsMap, fieldKey) {
  var c = colsMap.fields[fieldKey];
  return c ? String(row[c - 1] == null ? '' : row[c - 1]) : '';
}

/**
 * Sidik baris dari beberapa field identitas. Dipakai untuk menolak simpan
 * kalau baris di spreadsheet sudah bergeser karena sort/filter/hapus.
 */
function sig_(row, colsMap, key) {
  var spec = COLS[key];
  return (spec.identity || []).map(function (k) {
    return val_(row, colsMap, k).trim();
  }).join('|');
}

/** Semua baris data sebagai array nilai tampilan + nomor baris sheet. */
function readAll_(key) {
  var sh = sheet_(key);
  if (sh.getLastRow() < 2) return { rows: [], colsMap: cols_(key) };

  var colsMap = cols_(key);
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) rows.push({ rowId: i + 2, data: values[i] });
  return { rows: rows, colsMap: colsMap };
}


/* ============================================================================
   MODUL TRANSPORTASI
   ============================================================================ */

function transportItem_(row, colsMap, rowId) {
  var tanggal = val_(row, colsMap, 'tanggal').trim();
  var stamp = val_(row, colsMap, 'timestamp').trim();
  var dateObj = parseDate_(tanggal) || parseDate_(stamp) || parseDate_(val_(row, colsMap, 'tglJam'));

  // Nomor dari kolom NO.; kalau kosong baru dihitung dari baris & bulan.
  var no = val_(row, colsMap, 'no').trim();
  if (!no) {
    var basis = dateObj || new Date();
    no = 'TR/' + fmt_(basis, 'yyyyMM') + '/' + ('000' + (rowId - 1)).slice(-3);
  }

  return {
    rowId: rowId,
    sig: sig_(row, colsMap, 'transport'),
    noSurat: no,
    timestamp: stamp || tanggal || '-',
    nama: dash_(val_(row, colsMap, 'nama')),
    dept: dash_(val_(row, colsMap, 'dept')),
    ijn: dash_(val_(row, colsMap, 'ijn')),
    tujuan: dash_(val_(row, colsMap, 'tujuan')),
    tglJam: dash_(val_(row, colsMap, 'tglJam')),
    tanggal: tanggal || '-',
    nopol: dash_(val_(row, colsMap, 'nopol')),
    keperluan: dash_(val_(row, colsMap, 'keperluan')),
    status: normalizeStatus_(val_(row, colsMap, 'status')),
    pemohon: dash_(val_(row, colsMap, 'pemohon')),
    disetujui: dash_(val_(row, colsMap, 'disetujui')),
    driver: dash_(val_(row, colsMap, 'driver')),
    tglCetak: fmt_(new Date(), 'dd/MM/yyyy')
  };
}

/** Baris dianggap kosong kalau nama, tujuan, dan keperluan semuanya kosong. */
function isEmptyTransport_(item) {
  return item.nama === '-' && item.tujuan === '-' && item.keperluan === '-';
}

function listTransport_() {
  var read = readAll_('transport');
  var out = [];
  for (var i = 0; i < read.rows.length; i++) {
    var item = transportItem_(read.rows[i].data, read.colsMap, read.rows[i].rowId);
    if (!isEmptyTransport_(item)) out.push(item);
  }
  return out;
}

function getRequests_(param) {
  var list = listTransport_();
  var q = String(param.q || '').toLowerCase().trim();

  if (q) {
    list = list.filter(function (r) {
      return (r.noSurat + ' ' + r.nama + ' ' + r.tujuan + ' ' + r.dept + ' ' +
              r.nopol + ' ' + r.keperluan + ' ' + r.driver).toLowerCase().indexOf(q) !== -1;
    });
  }
  if (param.status) {
    var wanted = normalizeStatus_(param.status);
    list = list.filter(function (r) { return r.status === wanted; });
  }
  if (param.dept) {
    list = list.filter(function (r) { return r.dept === param.dept; });
  }

  list.sort(function (a, b) { return b.rowId - a.rowId; });

  var page = Math.max(1, parseInt(param.page, 10) || 1);
  var pageSize = Math.min(200, Math.max(1, parseInt(param.pageSize, 10) || 100));
  var total = list.length;
  var start = (page - 1) * pageSize;

  return {
    success: true,
    data: {
      items: list.slice(start, start + pageSize),
      pagination: {
        page: page,
        pageSize: pageSize,
        total: total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
      }
    }
  };
}

function getRequestDetail_(rowId) {
  rowId = Number(rowId);
  if (!rowId) return fail_('rowId wajib diisi.');
  var sh = sheet_('transport');
  if (rowId < 2 || rowId > sh.getLastRow()) return fail_('Data tidak ditemukan.');
  return ok_(transportItem_(sh.getRange(rowId, 1, 1, sh.getLastColumn()).getDisplayValues()[0], cols_('transport'), rowId));
}

function computeStats_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('hbpa_stats');
  if (hit) return JSON.parse(hit);

  var list = listTransport_();
  var now = new Date();
  var cm = now.getMonth(), cy = now.getFullYear();

  var stats = {
    total: list.length,
    pending: 0, approved: 0, rejected: 0, completed: 0, month: 0
  };

  list.forEach(function (r) {
    if (r.status === 'Disetujui') stats.approved++;
    else if (r.status === 'Ditolak') stats.rejected++;
    else if (r.status === 'Selesai') stats.completed++;
    else stats.pending++;

    var d = parseDate_(r.tanggal) || parseDate_(r.timestamp);
    if (d && d.getMonth() === cm && d.getFullYear() === cy) stats.month++;
  });

  cache.put('hbpa_stats', JSON.stringify(stats), CONFIG.statsCacheSec);
  return stats;
}

function departments_() {
  var seen = {};
  var out = [];
  CONFIG.departments = CONFIG.departments || [];
  CONFIG.departments.forEach(function (d) { if (!seen[d]) { seen[d] = 1; out.push(d); } });

  listTransport_().forEach(function (r) {
    var d = r.dept;
    if (d && d !== '-' && !seen[d]) { seen[d] = 1; out.push(d); }
  });
  return out;
}

function getBootstrap_() {
  return ok_({
    stats: computeStats_(),
    departments: departments_(),
    missingFields: missingFields_('transport'),
    itemColumns: Object.keys(cols_('inventaris').groups).length
  });
}

function missingFields_(key) {
  var spec = COLS[key];
  var colsMap = cols_(key);
  var missing = [];
  spec.fields.forEach(function (f) {
    if (f.key === 'no') return;
    if (!colsMap.fields[f.key]) missing.push(f.key);
  });
  return missing;
}

/* ---------- Tulis (selalu dengan lock) ---------- */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Server sedang sibuk. Coba lagi sebentar.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function createRequest_(body) {
  if (!body.nama || !body.tujuan) {
    return fail_('Nama dan tujuan wajib diisi.');
  }
  var raw = JSON.stringify(body);
  if (raw.length > MAX_WRITE_BYTES) return fail_('Data terlalu panjang untuk dikirim lewat URL.');

  withLock_(function () {
    var sh = sheet_('transport');
    var colsMap = cols_('transport');
    var lastCol = sh.getLastColumn();
    var out = [];
    for (var c = 0; c < lastCol; c++) out.push('');

    function put(fieldKey, value) {
      var col = colsMap.fields[fieldKey];
      if (col && value !== undefined && value !== null) out[col - 1] = value;
    }

    put('timestamp', new Date());
    put('nama', String(body.nama).trim());
    put('dept', String(body.dept || '-').trim());
    put('ijn', String(body.ijn || '-').trim());
    put('tujuan', String(body.tujuan).trim());
    put('tglJam', String(body.tglJam || '-').trim());
    put('tanggal', String(body.tanggal || '').trim());
    put('nopol', String(body.nopol || '-').trim().toUpperCase());
    put('keperluan', String(body.keperluan || '-').trim());
    put('pemohon', String(body.pemohon || '-').trim());
    put('disetujui', String(body.disetujui || '-').trim());
    put('driver', String(body.driver || '-').trim());
    put('status', normalizeStatus_(body.status));   // modul transportasi: Pending/Disetujui/Ditolak/Selesai

    sh.appendRow(out);
    clearStatsCache_();
  });

  return ok_({ message: 'Permintaan tersimpan.' });
}

function updateRequest_(body) {
  var rowId = Number(body.rowId);
  if (!rowId) return fail_('rowId wajib diisi.');
  if (JSON.stringify(body).length > MAX_WRITE_BYTES) {
    return fail_('Data terlalu panjang untuk dikirim lewat URL.');
  }

  var patch = {};
  ['nama', 'dept', 'ijn', 'tujuan', 'tglJam', 'tanggal', 'nopol', 'keperluan',
   'status', 'pemohon', 'disetujui', 'driver'].forEach(function (k) {
    if (body[k] !== undefined && body[k] !== null) patch[k] = String(body[k]).trim();
  });
  if (patch.nopol) patch.nopol = patch.nopol.toUpperCase();
  if (patch.status) patch.status = normalizeStatus_(patch.status);

  var missing = [];

  withLock_(function () {
    var sh = sheet_('transport');
    if (rowId < 2 || rowId > sh.getLastRow()) throw new Error('Data tidak ditemukan.');

    var colsMap = cols_('transport');

    if (body.sig) {
      var current = sh.getRange(rowId, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
      if (sig_(current, colsMap, 'transport') !== body.sig) {
        throw new Error('Isi baris ini sudah berubah di spreadsheet. Muat ulang halaman lalu coba lagi.');
      }
    }

    // Tulis kolom satu per satu supaya rumus di kolom lain tetap utuh.
    Object.keys(patch).forEach(function (k) {
      var col = colsMap.fields[k];
      if (col) {
        sh.getRange(rowId, col).setValue(patch[k]);
      } else {
        missing.push(k);
      }
    });

    clearStatsCache_();
  });

  return {
    success: true,
    data: { message: 'Tersimpan.' },
    warning: missing.length ? 'Kolom tidak ada di spreadsheet, tidak tersimpan: ' + missing.join(', ') : ''
  };
}

function updateRequestStatus_(param) {
  return updateRequest_({
    rowId: param.rowId,
    sig: param.sig,
    nopol: param.nopol,
    status: param.status
  });
}

function deleteRequest_(rowId) {
  rowId = Number(rowId);
  if (!rowId) return fail_('rowId wajib diisi.');

  withLock_(function () {
    var sh = sheet_('transport');
    if (rowId < 2 || rowId > sh.getLastRow()) throw new Error('Data tidak ditemukan.');
    sh.deleteRow(rowId);
    clearStatsCache_();
  });

  return ok_({ message: 'Dihapus.' });
}

function clearStatsCache_() {
  try {
    CacheService.getScriptCache().remove('hbpa_stats');
    colCache_ = {};
  } catch (e) {}
}


/* ============================================================================
   MODUL INVENTARIS
   ============================================================================ */

function inventarisLines_(row, colsMap) {
  var nums = Object.keys(colsMap.groups).sort(function (a, b) { return Number(a) - Number(b); });

  function pick(group, key) {
    var c = group[key];
    return c ? String(row[c - 1] == null ? '' : row[c - 1]).trim() : '';
  }

  var out = [];
  nums.forEach(function (n) {
    var group = colsMap.groups[n];
    var barang = pick(group, 'barang');
    if (!barang) return;
    out.push({
      n: n,
      barang: barang,
      qty: pick(group, 'qty') || '1',
      kondisiAmbil: pick(group, 'kondisiAmbil') || 'Baik',
      kondisiKembali: group.kondisiKembali ? (pick(group, 'kondisiKembali') || '-') : '-'
    });
  });
  return out;
}

function inventarisItem_(row, colsMap, rowId) {
  var no = val_(row, colsMap, 'no').trim();
  return {
    rowId: rowId,
    sig: sig_(row, colsMap, 'inventaris'),
    noDok: no || String(rowId),
    nama: dash_(val_(row, colsMap, 'nama')),
    kontak: dash_(val_(row, colsMap, 'kontak')),
    tglPinjam: dash_(val_(row, colsMap, 'tglPinjam')),
    tglKembali: dash_(val_(row, colsMap, 'tglKembali')),
    keperluan: dash_(val_(row, colsMap, 'keperluan')),
    status: normalizeInvStatus_(val_(row, colsMap, 'status')),
    tglKembaliAktual: dash_(val_(row, colsMap, 'tglKembaliAktual')),
    catatan: dash_(val_(row, colsMap, 'catatan')),
    items: inventarisLines_(row, colsMap)
  };
}

function getInventarisData_() {
  var read = readAll_('inventaris');
  var out = [];
  for (var i = 0; i < read.rows.length; i++) {
    var data = read.rows[i].data;
    var item = inventarisItem_(data, read.colsMap, read.rows[i].rowId);
    if (item.nama === '-' && !item.items.length) continue;
    out.push(item);
  }
  return ok_(out);
}

function saveInventaris_(body) {
  var rowId = Number(body.rowId);
  if (!rowId) return fail_('rowId wajib diisi.');
  if (JSON.stringify(body).length > MAX_WRITE_BYTES) {
    return fail_('Data terlalu panjang untuk dikirim lewat URL.');
  }

  withLock_(function () {
    var sh = sheet_('inventaris');
    if (rowId < 2 || rowId > sh.getLastRow()) throw new Error('Data tidak ditemukan.');

    var colsMap = cols_('inventaris');
    var lastCol = sh.getLastColumn();
    var range = sh.getRange(rowId, 1, 1, lastCol);
    var values = range.getValues()[0];
    var formulas = range.getFormulas()[0];

    if (body.sig && sig_(range.getDisplayValues()[0], colsMap, 'inventaris') !== body.sig) {
      throw new Error('Isi baris ini sudah berubah di spreadsheet. Muat ulang halaman lalu coba lagi.');
    }

    // Rumus di kolom lain tetap dipertahankan.
    var out = [];
    for (var c = 0; c < lastCol; c++) out.push(formulas[c] ? formulas[c] : values[c]);

    function put(fieldKey, value) {
      if (value === undefined || value === null) return;
      var col = colsMap.fields[fieldKey];
      if (col) { out[col - 1] = value; return; }
      var spec = COLS.inventaris.fields.filter(function (f) { return f.key === fieldKey; })[0];
      if (!spec || !spec.create) return;
      var newCol = sh.getLastColumn() + 1;
      sh.getRange(1, newCol).setValue(spec.create);
      out.push(value);
      colsMap.fields[fieldKey] = newCol;
    }

    put('status', normalizeInvStatus_(body.status));
    put('tglKembaliAktual', String(body.tglKembaliAktual || '').trim());
    put('catatan', String(body.catatan || '').trim());

    // Kondisi kembali per barang. Nomor kolom diambil dari items[].n
    // yang dikirim browser, jadi tidak perlu menebak urutan.
    var lines = body.lines || [];
    lines.forEach(function (line) {
      var group = colsMap.groups[String(line.n)];
      if (!group) return;
      if (group.kondisiKembali) {
        out[group.kondisiKembali - 1] = String(line.kondisiKembali || '-').trim();
        return;
      }
      var rep = COLS.inventaris.repeat.filter(function (r) { return r.key === 'kondisiKembali'; })[0];
      var newCol = sh.getLastColumn() + 1;
      sh.getRange(1, newCol).setValue(rep.label + ' ' + line.n);
      out.push(String(line.kondisiKembali || '-').trim());
      group.kondisiKembali = newCol;
    });

    var width = Math.min(out.length, sh.getLastColumn());
    sh.getRange(rowId, 1, 1, width).setValues([out.slice(0, width)]);
    colCache_ = {};
  });

  return ok_({ message: 'Tersimpan.' });
}


/* ============================================================================
   EMAIL + PDF
   ============================================================================ */

function sendEmail_(param) {
  var ids = String(param.rowIds || '').split(',')
    .map(function (v) { return Number(v); })
    .filter(function (v) { return v > 0; });

  if (!ids.length) throw new Error('Tidak ada permintaan dipilih.');
  if (ids.length > MAX_EMAIL_ROWS) throw new Error('Maksimal ' + MAX_EMAIL_ROWS + ' permintaan sekali kirim.');
  if (!CONFIG.mail.to) throw new Error('CONFIG.mail.to belum diisi di Code.gs.');

  var sh = sheet_('transport');
  var colsMap = cols_('transport');
  var items = ids.map(function (rowId) {
    if (rowId > sh.getLastRow()) throw new Error('Baris ' + rowId + ' tidak ditemukan.');
    return transportItem_(sh.getRange(rowId, 1, 1, sh.getLastColumn()).getDisplayValues()[0], colsMap, rowId);
  });

  var attachments = [];
  var html = '';
  var text = '';
  items.forEach(function (it) {
    try { attachments.push(pdfBlob_(it)); }
    catch (e) { Logger.log('PDF gagal: ' + e); }
    html += emailBlockHtml_(it);
    text += emailText_(it) + '\n\n';
  });

  var stamp = fmt_(new Date(), 'dd MMM yyyy HH:mm:ss');
  var subject = 'Info Permintaan Transportasi - ' + (items.length === 1
    ? items[0].noSurat + ' (' + items[0].nama + ')'
    : items.length + ' permintaan') + ' [' + stamp + ']';

  MailApp.sendEmail({
    to: CONFIG.mail.to,
    subject: subject,
    body: 'PT. Hidup Baru Perdana Abadi\nDikirim: ' + stamp + '\n\n' + text + 'Dokumen PDF terlampir.',
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">' +
      '<p><b>PT. Hidup Baru Perdana Abadi</b><br>Info Permintaan Transportasi' +
      '<br><span style="color:#666;font-size:12px">Dikirim: ' + stamp + '</span></p>' + html + '</div>',
    attachments: attachments,
    name: 'Facility Department PT HBPA'
  });

  return ok_({ sent: items.length });
}

function esc_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function emailFields_(it) {
  return [
    ['No', it.noSurat], ['Nama', it.nama], ['Divisi', it.dept], ['IJN', it.ijn],
    ['Tujuan', it.tujuan], ['Hari/Tgl/Jam', it.tglJam], ['Keperluan', it.keperluan],
    ['Plat No.', it.nopol], ['Driver', it.driver], ['Status', it.status]
  ];
}

function emailText_(it) {
  return emailFields_(it).map(function (f) { return f[0] + ': ' + f[1]; }).join('\n');
}

function emailBlockHtml_(it) {
  var rows = emailFields_(it).map(function (f) {
    return '<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap">' + esc_(f[0]) +
      '</td><td style="padding:4px 0"><b>' + esc_(f[1]) + '</b></td></tr>';
  }).join('');
  return '<table style="border-collapse:collapse;margin:0 0 16px;border-left:3px solid #0d9488;padding-left:10px">' +
    rows + '</table>';
}

function logoBlob_() {
  try {
    if (CONFIG.mail.logoDriveId) return DriveApp.getFileById(CONFIG.mail.logoDriveId).getBlob();
    var res = UrlFetchApp.fetch(CONFIG.mail.logoUrl, { muteHttpExceptions: true });
    var b = res.getBlob();
    if (res.getResponseCode() === 200 && /^image\/(png|jpe?g|gif)/.test(b.getContentType() || '')) return b;
  } catch (e) {
    Logger.log('Logo gagal dimuat: ' + e);
  }
  return null;
}

function pdfBlob_(it) {
  var waktu = it.tglJam !== '-' ? it.tglJam : it.tanggal;

  var logoHtml = '<b style="font-size:14pt">HBPA</b>';
  var logo = logoBlob_();
  if (logo) {
    logoHtml = '<img src="data:' + logo.getContentType() + ';base64,' +
      Utilities.base64Encode(logo.getBytes()) + '" style="height:44px">';
  }

  function row(label, value) {
    return '<tr><td style="width:32%;padding:5px 0"><b>' + label + '</b></td>' +
      '<td style="width:3%;padding:5px 0">:</td>' +
      '<td style="padding:5px 0;border-bottom:1px dotted #000;font-weight:bold">' + esc_(value) + '</td></tr>';
  }

  var html = '<html><body style="margin:0;padding:0;font-family:Arial,sans-serif;font-size:9.5pt;color:#000">' +
    '<table width="520" align="center" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td>' +
    '<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1.5px solid #000"><tr>' +
      '<td width="28%" align="center" valign="middle" style="border:1.5px solid #000;padding:6px">' + logoHtml + '</td>' +
      '<td width="72%" align="center" valign="middle" style="border:1.5px solid #000;padding:0">' +
        '<div style="font-weight:bold;font-size:10pt;padding:5px 0;border-bottom:1.5px solid #000">PT. HIDUP BARU PERDANA ABADI</div>' +
        '<div style="font-weight:bold;font-size:11.5pt;padding:5px 0">PERMINTAAN TRANSPORTASI</div>' +
      '</td></tr></table>' +
    '<table width="52%" align="right" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:10px;margin-bottom:12px;border:1.5px solid #000">' +
      '<tr><td style="padding:4px 8px;font-weight:bold;font-size:9pt">NO : ' + esc_(it.noSurat) + '</td></tr></table>' +
    '<div style="clear:both"></div>' +
    '<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:14px;margin-bottom:15px">' +
      row('N A M A', it.nama) + row('DEPARTMENT', it.dept) + row('IJN', it.ijn) +
      row('TUJUAN', it.tujuan) + row('HARI / TGL. / JAM', waktu) +
      row('NO. POL. KENDARAAN', it.nopol) + row('KEPERLUAN', it.keperluan) +
    '</table>' +
    '<div style="text-align:right;margin:0 10px 10px 0;font-size:9pt">Balikpapan, ' + esc_(it.tglCetak) + '</div>' +
    '<table width="100%" cellspacing="0" cellpadding="0" style="text-align:center;margin-top:5px;font-size:9pt"><tr>' +
      '<td width="50%"><b>Disetujui,</b><br><br><br><br>(.......................................)<br>' +
        '<span style="font-size:8pt;font-style:italic">(Facility Department)</span></td>' +
      '<td width="50%"><b>Pemohon,</b><br><br><br><br>(.......................................)</td>' +
    '</tr></table>' +
    '<table width="100%" cellspacing="0" cellpadding="0" style="margin-top:15px;font-size:7.5pt;font-style:italic">' +
      '<tr><td>FM-FCL-02.01</td><td align="right">Rev : 02 (080617)</td></tr></table>' +
    '</td></tr></table></body></html>';

  var pdf = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf');
  pdf.setName('Permintaan Transportasi - ' + it.noSurat.replace(/[\/\\:*?"<>|]/g, '-') + '.pdf');
  return pdf;
}


/* ============================================================================
   DIAGNOSTIK
   ============================================================================ */

function diagnose_() {
  function report_(key) {
    var colsMap = cols_(key);
    var matched = [], missing = [], willCreate = [];

    COLS[key].fields.forEach(function (f) {
      if (colsMap.fields[f.key]) matched.push(f.key + ' (kolom ' + colsMap.fields[f.key] + ')');
      else if (f.create) willCreate.push(f.create);
      else missing.push(f.key);
    });

    var groups = Object.keys(colsMap.groups).sort(function (a, b) { return Number(a) - Number(b); });
    return {
      tab: CONFIG.tabs[key],
      lastRow: sheet_(key).getLastRow(),
      matched: matched,
      missing: missing,
      willCreate: willCreate,
      groups: groups
    };
  }

  return { transport: report_('transport'), inventaris: report_('inventaris') };
}


/* ============================================================================
   PENYIAPAN
   ============================================================================ */

/** JALANKAN SEKALI dari editor Apps Script. */
function setup() {
  var report = diagnose_();
  Logger.log(JSON.stringify(report, null, 2));
  colCache_ = {};
  Logger.log('Siap. Sekarang Deploy > New deployment > Web app.');
}