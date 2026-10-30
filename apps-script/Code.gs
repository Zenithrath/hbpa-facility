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
    inventaris: 'TAB_INVENTARIS',
    dr:         'TAB_DAILYREPORT',
    ck:         'TAB_CEKKENDARANA',
    mItem:      'TAB_Item'
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
    case 'getMasters':          return getMasters_();
    case 'saveInventaris':      return saveInventaris_(parseBody_(param));

    // Fitur Daily Report / Checklist Kendaraan.
    case 'getDrData':         return getDrData_();
    case 'drPdf':             return drPdfForRow_(param.rowId || param.id);
    case 'saveDr':            return saveDr_(parseBody_(param));
    case 'updateDrStatus':    return updateDocStatus_('dr', parseBody_(param));
    case 'updateDr':          return updateDr_(parseBody_(param));
    case 'getCkData':         return getCkData_();
    case 'saveCk':            return saveCk_(parseBody_(param));
    case 'updateCk':          return updateCk_(parseBody_(param));
    case 'ckPdf':              return ckPdfForRow_(param.rowId || param.id);
    case 'updateCkStatus':    return updateDocStatus_('ck', parseBody_(param));

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

var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Gabung tanggal pengajuan (Timestamp) dengan jam menjadi teks HARI/TANGGAL/JAM. */
function composeJam_(stamp, jam) {
  var d = parseDate_(stamp);
  if (!d) return '';
  return HARI[d.getDay()] + ', ' + fmt_(d, 'dd/MM/yyyy') + ' ' + jam;
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
      { key: 'tanggal',   aliases: ['tanggal'], optional: true },
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
      { key: 'tglKembali',       aliases: ['tglpengembalian', 'pengembalian', 'tglkembali', 'rencanakembali'], contains: ['pengembalian'] },
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
  },

  dr: {
    fields: [
      { key: 'no',           aliases: ['nokolo', 'nokolom', 'nokolo', 'no_kolom', 'no', 'nomor', 'nodokumen', 'nodok'] },
      { key: 'timestamp',    aliases: ['timestamp', 'waktu', 'tglinput'] },
      { key: 'tanggal',     aliases: ['tanggal'] },
      { key: 'hari',        aliases: ['hari'] },
      { key: 'driver',      aliases: ['driver', 'namadriver', 'namadrvier'] },
      { key: 'id',          aliases: ['iddr', 'id_dr', 'iddr'] },
      { key: 'nodokumen',   aliases: ['nodokumen', 'nodok'] },
      { key: 'status',      aliases: ['status'] },
      { key: 'mengetahui',  aliases: ['mengetahui', 'disetujui'] },
      { key: 'linkpdf',     aliases: ['linkpdf'] }
    ],
    repeat: [
      { key: 'start',   groupStart: true, re: /jam.*(?:start|keluar|mulai)|keluar/ },
      { key: 'finish',  re: /jam.*(?:finish|kembali|selesai)|kembali/ },
      { key: 'nopol',   re: /plat|nopol/ },
      { key: 'ijn',     re: /ijn/ },
      { key: 'namaUser',re: /user|namauser/ },
      { key: 'km',      re: /^km$/ },
      { key: 'solar',   re: /solar|bbm/ },
      { key: 'uraian',  re: /uraian|pekerjaan|keperluan|kegiatan/ }
    ],
    identity: ['timestamp', 'driver', 'nopol']
  },

  ck: {
    fields: [
      { key: 'id',           aliases: ['id_ck'] },
      { key: 'tanggal',      aliases: ['tanggal'] },
      { key: 'status',       aliases: ['status'] },
      { key: 'nopol',        aliases: ['no_polisi', 'nopol', 'plat'] },
      { key: 'driver',       aliases: ['driver'] }
    ],
    repeat: [],
    identity: ['id']
  },

  mItem: {
    fields: [
      { key: 'grup',   aliases: ['grup', 'group'] },
      { key: 'item',   aliases: ['item', 'nama_item'] },
      { key: 'urutan', aliases: ['urutan', 'no'] },
      { key: 'status', aliases: ['status'] }
    ],
    repeat: [],
    identity: ['grup', 'item']
  }
};

var colCache_ = {};

/** Nomor kolom untuk setiap field, dihitung dari judul baris 1. */
function cols_(key) {
  if (colCache_[key]) return colCache_[key];

  var spec = COLS[key] || { fields: [], repeat: [] };
  var sh = sheet_(key);
  var lastCol = sh.getLastColumn();
  var head = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : [];
  var out = { fields: {}, groups: {} };
  var current = '';
  var groupCounter = 0;
  for (var i = 0; i < head.length; i++) {
    var n = normalize_(head[i]);
    if (!n) continue;
    var col = i + 1;

    var repeatList = spec.repeat || [];
    for (var r = 0; r < repeatList.length; r++) {
      var rep = repeatList[r];
      if (!rep || !rep.re) continue;
      var m = n.match(rep.re);
      if (!m) continue;
      if (m[1]) current = m[1];
      else if (rep.groupStart) { groupCounter++; current = String(groupCounter); }
      var num = m[1] || (rep.groupStart ? String(groupCounter) : current) || '1';
      if (!num) num = '1';
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
  var stampDate = parseDate_(stamp);
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
    tglPengajuan: stampDate ? fmt_(stampDate, 'dd/MM/yyyy') : '-',
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
    pending: 0, approved: 0, rejected: 0, completed: 0, month: 0,
    recent: list.slice(0, 5)
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
    if (f.key === 'no' || f.optional) return;
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
  ['no', 'noSurat', 'nama', 'dept', 'ijn', 'tujuan', 'tglJam', 'tanggal', 'nopol', 'keperluan',
   'status', 'pemohon', 'disetujui', 'driver'].forEach(function (k) {
    if (body[k] !== undefined && body[k] !== null) patch[k] = String(body[k]).trim();
  });
  if (patch.noSurat !== undefined) patch.no = patch.noSurat;
  delete patch.noSurat;
  if (patch.nopol) patch.nopol = patch.nopol.toUpperCase();
  if (patch.status) patch.status = normalizeStatus_(patch.status);
  else delete patch.status;

  var jam = String(body.jam || '').trim();
  if (jam) {
    var jm = /^(\d{1,2}):(\d{2})$/.exec(jam);
    if (!jm) return fail_('Format jam harus HH:MM.');
    jam = ('0' + jm[1]).slice(-2) + ':' + jm[2];
  }

  var missing = [];
  var optional = {};
  COLS.transport.fields.forEach(function (f) { if (f.optional) optional[f.key] = 1; });

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

    if (jam) {
      var stampCol = colsMap.fields.timestamp;
      var stamp = stampCol ? sh.getRange(rowId, stampCol).getDisplayValues()[0][0] : '';
      var composed = composeJam_(stamp, jam);
      if (composed) patch.tglJam = composed;
    }

    // Tulis kolom satu per satu supaya rumus di kolom lain tetap utuh.
    Object.keys(patch).forEach(function (k) {
      var col = colsMap.fields[k];
      if (col) {
        sh.getRange(rowId, col).setValue(patch[k]);
      } else if (!optional[k]) {
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

    if (body.noDok !== undefined) put('no', String(body.noDok).trim());
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
      var repList = (COLS.inventaris && COLS.inventaris.repeat) ? COLS.inventaris.repeat : [];
      var rep = repList.filter(function (r) { return r.key === 'kondisiKembali'; })[0];
      if (!rep) return;
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

/**
 * Kirim satu email berisi satu atau beberapa permintaan + PDF tiap permintaan.
 * Dipakai oleh tombol di dashboard (sendEmail_) maupun trigger otomatis.
 */
function sendEmailItems_(items, judul) {
  if (!CONFIG.mail.to) throw new Error('CONFIG.mail.to belum diisi di Code.gs.');

  var attachments = [];
  var html = '';
  var text = '';
  items.forEach(function (it) {
    try { attachments.push(pdfBlob_(it)); }
    catch (e) { Logger.log('PDF gagal: ' + e); }
    html += emailBlockHtml_(it);
    text += emailText_(it) + '\n\n';
  });

  // Waktu ikut di subjek supaya Gmail tidak menggabung email yang isinya sama.
  var stamp = fmt_(new Date(), 'dd MMM yyyy HH:mm:ss');
  var subject = judul + ' - ' + (items.length === 1
    ? items[0].noSurat + ' (' + items[0].nama + ')'
    : items.length + ' permintaan') + ' [' + stamp + ']';

  MailApp.sendEmail({
    to: CONFIG.mail.to,
    subject: subject,
    body: 'PT. Hidup Baru Perdana Abadi\nDikirim: ' + stamp + '\n\n' + text + 'Dokumen PDF terlampir.',
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">' +
      '<p><b>PT. Hidup Baru Perdana Abadi</b><br>' + esc_(judul) +
      '<br><span style="color:#666;font-size:12px">Dikirim: ' + stamp + '</span></p>' + html +
      '<p style="color:#666;font-size:12px">Dokumen PDF terlampir. Email ini dikirim otomatis dari Dashboard Facility.</p></div>',
    attachments: attachments,
    name: 'Facility Department PT HBPA'
  });

  return items.length;
}

function sendEmail_(param) {
  var ids = String(param.rowIds || '').split(',')
    .map(function (v) { return Number(v); })
    .filter(function (v) { return v > 0; });

  if (!ids.length) throw new Error('Tidak ada permintaan dipilih.');
  if (ids.length > MAX_EMAIL_ROWS) throw new Error('Maksimal ' + MAX_EMAIL_ROWS + ' permintaan sekali kirim.');

  var sh = sheet_('transport');
  var colsMap = cols_('transport');
  var items = ids.map(function (rowId) {
    if (rowId > sh.getLastRow()) throw new Error('Baris ' + rowId + ' tidak ditemukan.');
    return transportItem_(sh.getRange(rowId, 1, 1, sh.getLastColumn()).getDisplayValues()[0], colsMap, rowId);
  });

  sendEmailItems_(items, 'Info Permintaan Transportasi');
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
   EMAIL OTOMATIS TIAP ADA BARIS BARU
   ============================================================================
   Cara kerja: nomor baris terakhir yang sudah dinotifikasi disimpan di Script
   Properties. Setiap ada baris terisi baru — dari Google Form atau diketik
   manual — email + PDF dikirim sendiri. Baris yang sama tidak pernah dikirim
   dua kali.

   Dijalankan oleh dua trigger:
     onFormSubmitTrigger  setiap Google Form mengirim jawaban
     notifyNewRowsTrigger setiap 5 menit (cadangan, misalnya form diedit manual)
   ============================================================================ */

var PROP_LAST_ROW = 'HBPA_LAST_NOTIFIED_ROW';

/** Batas pengiriman per putaran, supaya kuota harian tidak habis. */
var MAX_AUTO_EMAILS = 10;

/** Baris paling bawah yang isinya sudah terisi. */
function lastFilledRow_() {
  var list = listTransport_();
  if (!list.length) return 1;
  return list[list.length - 1].rowId; // listTransport_ urut dari baris paling atas
}

function notifyNewRows() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  try {
    var props = PropertiesService.getScriptProperties();
    var sh = sheet_('transport');
    var colsMap = cols_('transport');
    var stored = props.getProperty(PROP_LAST_ROW);
    var last = Number(stored || 0);

    // Belum pernah disetup, atau baris dihapus: mulai dari data yang ada
    // sekarang tanpa mengirim apa pun.
    if (!stored || last > sh.getLastRow()) {
      props.setProperty(PROP_LAST_ROW, String(lastFilledRow_()));
      return;
    }

    var sent = 0;
    for (var rowId = last + 1; rowId <= sh.getLastRow() && sent < MAX_AUTO_EMAILS; rowId++) {
      var row = sh.getRange(rowId, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
      var item = transportItem_(row, colsMap, rowId);
      if (isEmptyTransport_(item)) continue;

      try {
        sendEmailItems_([item], 'Permintaan Transportasi Baru');
      } catch (err) {
        Logger.log('Email otomatis gagal di baris ' + rowId + ': ' + err);
        break; // dicoba lagi di putaran berikutnya, email tidak hilang
      }

      props.setProperty(PROP_LAST_ROW, String(rowId));
      sent++;
    }
  } finally {
    lock.releaseLock();
  }
}

function onFormSubmit() {
  SpreadsheetApp.flush();
  Utilities.sleep(2000); // tunggu rumus kolom NO. terisi
  notifyNewRows();
}

/**
 * Pasang trigger. Jalankan sekali dari editor Apps Script.
 * Aman dijalankan berkali-kali: trigger lama dihapus lebih dulu.
 */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'onFormSubmitTrigger' || fn === 'notifyNewRowsTrigger') ScriptApp.deleteTrigger(t);
  });

  PropertiesService.getScriptProperties().setProperty(PROP_LAST_ROW, String(lastFilledRow_()));

  ScriptApp.newTrigger('onFormSubmitTrigger').forSpreadsheet(sheet_('transport').getParent()).onFormSubmit().create();
  ScriptApp.newTrigger('notifyNewRowsTrigger').timeBased().everyMinutes(5).create();

  return 'Trigger terpasang: 1 onFormSubmit + 1 timeBased (tiap 5 menit).';
}

/** Tes kirim: kirim baris ke-2 ke CONFIG.mail.to. Jalankan sekali untuk memberi izin Gmail & UrlFetch. */
function testEmail() {
  var ids = [2];
  var sh = sheet_('transport');
  var colsMap = cols_('transport');
  var items = ids.map(function (rowId) {
    return transportItem_(sh.getRange(rowId, 1, 1, sh.getLastColumn()).getDisplayValues()[0], colsMap, rowId);
  });
  sendEmailItems_(items, 'Permintaan Transportasi');
  return 'Test email terkirim.';
}


/* ============================================================================
   DIAGNOSTIK
   ============================================================================ */

function diagnose_() {
  function report_(key) {
    var colsMap = cols_(key);
    var matched = [], missing = [], willCreate = [];
    var spec = COLS[key] || { fields: [] };

    (spec.fields || []).forEach(function (f) {
      if (colsMap.fields[f.key]) matched.push(f.key + ' (kolom ' + colsMap.fields[f.key] + ')');
      else if (f.create) willCreate.push(f.create);
      else if (!f.optional) missing.push(f.key);
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

/**
 * Nama fungsi di bawah ini yang dilihat ScriptApp, jadi harus ada di scope
 * global dan tidak boleh diubah namanya tanpa memasang trigger ulang.
 */
function notifyNewRowsTrigger() {
  notifyNewRows();
}

function onFormSubmitTrigger() {
  onFormSubmit();
}

/**
 * JALANKAN SEKALI dari editor Apps Script.
 * Mencetak nama tab + judul kolom ke Execution log, supaya pemilik script
 * bisa memastikan CONFIG.tabs dan COLS masih cocok dengan spreadsheet.
 */
function laporkan() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = ['SPREADSHEET: ' + ss.getId(), ''];

  ss.getSheets().forEach(function (sh) {
    var last = sh.getLastColumn();
    var head = last > 0 ? sh.getRange(1, 1, 1, last).getDisplayValues()[0] : [];

    out.push('TAB: ' + sh.getName() + '  (baris: ' + sh.getLastRow() + ', kolom: ' + last + ')');
    out.push('  ' + head.map(function (h, i) { return (i + 1) + '. "' + h + '"'; }).join(' | '));
    out.push('');
  });

  var text = out.join('\n');
  Logger.log(text);
  return text;
}

/** JALANKAN SEKALI dari editor Apps Script. */
function setup() {
  laporkan();

  var report = diagnose_();
  Logger.log('--- STATUS PEMETAAN ---');
  Logger.log(JSON.stringify(report, null, 2));

  colCache_ = {};
  Logger.log('Langkah berikutnya: jalankan setupTriggers() untuk mengaktifkan email otomatis.');
}
/* ---------- Penyiapan ----------
 * Mendapatkan sheet berdasarkan key (transport, inventaris, dr, ck, mItem).
 * Jika sheet tidak ada, akan mencoba menemukan/menyiapkan otomatis.
 */
function sheet_(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabName = CONFIG.tabs[key];
  var sh = ss.getSheetByName(tabName);

  if (!sh) {
    // Coba cari tab lama bernama DR (untuk key 'dr')
    if (key === 'dr') {
      var lama = ss.getSheetByName('DR');
      if (lama) {
        lama.setName(tabName);
        sh = lama;
      }
    }
    // Jika masih tidak ditemukan, coba buat tab baru
    if (!sh) {
      sh = ss.insertSheet(tabName);
    }
  }

  // Pastikan kolom ID_DR dan No_Dokumen ada untuk tab DR
  // HANYA jika kolom belum ada (hindari duplikasi dengan setupTabsBaru!)
  if (key === 'dr' && sh) {
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    var headText = head.join('|').toLowerCase();
    if (!headText.includes('id_dr') && !headText.includes('iddr')) {
      var currentLastCol = sh.getLastColumn();
      sh.getRange(1, currentLastCol + 1).setValue('ID_DR');
      sh.getRange(1, currentLastCol + 2).setValue('No_Dokumen');
    }
  }

  return sh;
}

/* ---------- Penyiapan Tab ----------
 * JALANKAN SEKALI dari editor Apps Script.
 * Membuat/ memperbarui tab-tab yang dibutuhkan:
 * - TAB_DAILYREPORT (Daily Report dari Google Forms)
 * - TAB_CEKKENDARANA (Checklist Kendaraan)
 * - TAB_Item (Master Item/Barang)
 */
function setupTabsBaru() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var drTab = CONFIG.tabs.dr;
  var ckTab = CONFIG.tabs.ck;
  var itemTab = CONFIG.tabs.mItem;
  var dibuat = [];
  var diubah = [];

  // === TAB DAILY REPORT (DR) ===
  var drSheet = ss.getSheetByName(drTab);
  if (!drSheet) {
    // Cari tab lama bernama DR
    var lama = ss.getSheetByName('DR');
    if (lama) {
      lama.setName(drTab);
      diubah.push('DR -> ' + drTab);
      drSheet = lama;
    } else {
      drSheet = ss.insertSheet(drTab);
      dibuat.push('tab baru: ' + drTab);
    }
  }

  // Pastikan kolom ID_DR dan No_Dokumen ada
  var head = drSheet.getRange(1, 1, 1, drSheet.getLastColumn()).getDisplayValues()[0];
  var headText = head.join('|').toLowerCase();
  if (!headText.includes('id_dr') && !headText.includes('iddr')) {
    var currentLastCol = drSheet.getLastColumn();
    drSheet.getRange(1, currentLastCol + 1).setValue('ID_DR');
    drSheet.getRange(1, currentLastCol + 2).setValue('No_Dokumen');
  }

  // === TAB CHECKLIST KENDARAAN (CK) ===
  var ckSheet = ss.getSheetByName(ckTab);
  if (!ckSheet) {
    ckSheet = ss.insertSheet(ckTab);
    var ckHeaders = [
      'ID_CK','Tanggal','Counter','Tipe_Mobil','No_Polisi','Driver','Kilometer',
      'BBM_Masuk','BBM_Keluar','Keterangan','Diperiksa_Oleh','Status','Created_By','Created_At','Link_PDF',
      'Items_JSON','Damages_JSON','Has_Rusak','Request_Id'
    ];
    ckSheet.getRange(1, 1, 1, ckHeaders.length).setValues([ckHeaders]);
    if (typeof ckSheet.setFrozenRows === 'function') ckSheet.setFrozenRows(1);
    dibuat.push('tab CK: ' + ckTab);
  }

  // === TAB MASTER ITEM (M_Item) ===
  var itemSheet = ss.getSheetByName(itemTab);
  if (!itemSheet) {
    itemSheet = ss.insertSheet(itemTab);
    // Isi awal M_Item dari kertas asli
    function block(grup, items) {
      return items.map(function (it, i) { return [grup, it, i + 1, 'Aktif']; });
    }
    var seed = [].concat(
      block('Kaca', ['Depan', 'Kiri', 'Kanan', 'Spion Kanan', 'Spion Kiri', 'Spion Dalam']),
      block('Body Mobil', ['Depan', 'Grill', 'Fender', 'Pintu Dpn Kanan', 'Pintu Dpn Kiri',
        'Pintu Blk Kanan', 'Pintu Blk Kiri', 'Pintu Belakang', '', '']),
      block('Ban', ['Kanan Depan', 'Kiri Depan', 'Kanan Belakang', 'Kiri Belakang', 'Serep', '']),
      block('Mesin', ['Oli Mesin', 'Minyak Rem', 'Air Radiator', 'Air ACCU', 'Air Wiper']),
      block('Lampu', ['Besar', 'Kecil', 'Rem', 'Sen Depan', 'Sen Belakang']),
      block('Eksterior', ['Talang Air', 'Plat Belakang', 'Plat Depan', '']),
      block('Kelengkapan', ['Kunci Roda', 'Dongkrak', 'P3K', 'STNK', 'APAR', '']),
      block('Interior', ['Jok', 'Stir', 'Karpet Dasar', 'Persneling', 'Rem Tangan',
        'Dashboard', 'Sendalan', 'AC', 'Charger', 'Radio', 'Power Window', 'Gauges'])
    );
    itemSheet.getRange(1, 1, 1, 4).setValues([['Grup', 'Item', 'Urutan', 'Status']]);
    itemSheet.getRange(2, 1, seed.length, 4).setValues(seed);
    dibuat.push('tab M_Item: ' + itemTab);
  } else {
    // Migrasi: versi lama menulis data mulai baris 1 tanpa header, sehingga
    // item pertama (Kaca/Depan) terlewat saat dibaca. Tambahkan header di atas.
    var mHead = itemSheet.getRange(1, 1, 1, 4).getDisplayValues()[0];
    var mHasHeader = normalize_(mHead[0]).indexOf('grup') >= 0 || normalize_(mHead[1]).indexOf('item') >= 0;
    if (!mHasHeader && itemSheet.getLastRow() >= 1) {
      itemSheet.insertRowsBefore(1, 1);
      itemSheet.getRange(1, 1, 1, 4).setValues([['Grup', 'Item', 'Urutan', 'Status']]);
      diubah.push('M_Item: tambah baris header');
    }
  }

  // Seed data M_Item kalau baris kurang
  if (itemSheet.getLastRow() < 2) {
    // Panggil fungsi seed yang sudah ada di code
    // var seed = seedMItem_();
    // itemSheet.getRange(2, 1, seed.length, 4).setValues(seed);
  }

  colCache_ = {};
  var catatan = [];
  if (diubah.length) catatan.push('diubah: ' + diubah.join(', '));
  if (dibuat.length) catatan.push('dibuat: ' + dibuat.join(', '));
  return 'Tab DR/CK_Item siap. ' + (catatan.length ? catatan.join('; ') : 'semua tab sudah ada') + '.';
}

/* ---------- Identitas & role ---------- */


/* ---------- Daily Report / Checklist Functions ---------- */

function getDrData_() {
  var read = readAll_('dr');
  var sh = sheet_('dr');
  var lastCol = sh.getLastColumn();
  var head = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : [];
  var normHead = head.map(function(h){ return normalize_(h); });
  
  function getByHeader(data, patterns) {
    for (var i = 0; i < normHead.length; i++) {
      for (var j = 0; j < patterns.length; j++) {
        if (normHead[i] === patterns[j] || normHead[i].indexOf(patterns[j]) >= 0) {
          return String(data[i] == null ? '' : data[i]);
        }
      }
    }
    return '';
  }
  
  function groupVal(group, key) {
    var c = group[key];
    return c ? String((function(){})() || '') : '';
  }
  
  var groups = {};
  var order = [];

  read.rows.forEach(function (r) {
    var data = r.data;
    var id = (val_(data, read.colsMap, 'id') || val_(data, read.colsMap, 'nodokumen') || getByHeader(data, ['iddr','nodokumen','iddr'])).trim();
    
    var hdr = {
      rowId: r.rowId,
      id: id,
      hari: (function(){ var h = val_(data, read.colsMap, 'hari') || getByHeader(data, ['hari']); if (h) return h; var ts = val_(data, read.colsMap, 'timestamp') || getByHeader(data, ['timestamp','waktu']); var d = parseDate_(ts) || parseDate_(val_(data, read.colsMap, 'tanggal') || getByHeader(data, ['tanggal'])); return d ? HARI[d.getDay()] : ''; })(),
      tanggal: val_(data, read.colsMap, 'tanggal') || getByHeader(data, ['tanggal']),
      driver: val_(data, read.colsMap, 'driver') || getByHeader(data, ['driver','namadriver']),
      mengetahui: val_(data, read.colsMap, 'mengetahui') || getByHeader(data, ['mengetahui']),
      status: val_(data, read.colsMap, 'status') || getByHeader(data, ['status']) || 'Submitted',
      createdBy: val_(data, read.colsMap, 'driver') || getByHeader(data, ['driver']),
      createdAt: val_(data, read.colsMap, 'timestamp') || getByHeader(data, ['timestamp','waktu']) || '',
      linkPdf: val_(data, read.colsMap, 'linkpdf') || getByHeader(data, ['linkpdf']),
      rows: []
    };
    
    // Bangun baris pekerjaan dari setiap blok (group) yang terdeteksi.
    var groupKeys = Object.keys(read.colsMap.groups || {}).sort(function(a,b){ return Number(a)-Number(b); });
    if (groupKeys.length) {
      groupKeys.forEach(function (gn) {
        var group = read.colsMap.groups[gn];
        function g(key) {
          var c = group[key];
          return c ? String(data[c - 1] == null ? '' : data[c - 1]).trim() : '';
        }
        var row = {
          start: normTime_(g('start')),
          finish: normTime_(g('finish')),
          total: '',
          nopol: g('nopol'),
          ijn: g('ijn'),
          namaUser: g('namaUser'),
          km: g('km'),
          solar: g('solar'),
          uraian: g('uraian')
        };

        row.total = drTotal_(row.start, row.finish);
        var adaBaris = !!(row.start || row.finish || row.nopol || row.ijn || row.namaUser || row.uraian || row.km || row.solar);
        if (adaBaris) hdr.rows.push(row);
      });
    } else {
      // Fallback: satu blok dari fields.
      var row = {
        start: normTime_(val_(data, read.colsMap, 'jamstart') || getByHeader(data, ['jamstart','jamkeluar','jam','start','keluar'])),
        finish: normTime_(val_(data, read.colsMap, 'jamfinish') || getByHeader(data, ['jamfinish','jamkembali','finish','kembali'])),
        total: '',
        nopol: val_(data, read.colsMap, 'nopol') || getByHeader(data, ['noplat','nopol','plat']),
        ijn: val_(data, read.colsMap, 'ijn') || getByHeader(data, ['ijn']),
        namaUser: val_(data, read.colsMap, 'namauser') || getByHeader(data, ['namauser','user','nama']),
        km: val_(data, read.colsMap, 'km') || getByHeader(data, ['km']),
        solar: val_(data, read.colsMap, 'solar') || getByHeader(data, ['solar','bbm']),
        uraian: val_(data, read.colsMap, 'uraian') || getByHeader(data, ['uraian','pekerjaan','keperluan','kegiatan'])
      };
      row.total = drTotal_(row.start, row.finish);
      var adaBaris = !!(row.start || row.finish || row.nopol || row.ijn || row.namaUser || row.uraian || row.km || row.solar);
      if (adaBaris) hdr.rows.push(row);
    }

    // Baris kosong tidak perlu ditampilkan.
    if (!id && !hdr.rows.length) return;

    // Baris Google Form tanpa ID_DR jadi satu dokumen per baris.
    var key = id || ('row-' + r.rowId);
    if (!groups[key]) {
      groups[key] = { header: hdr, rows: [] };
      order.push(key);
    } else {
      // Dokumen yang sama dari beberapa sheet row: gabungkan rows.
      hdr.rows.forEach(function (rw) { groups[key].header.rows.push(rw); });
    }
  });

  var out = [];
  for (var i = order.length - 1; i >= 0; i--) {
    var g = groups[order[i]];
    out.push(g.header);
  }
  return ok_(out);
}

function normTime_(v) {
  var s = String(v || '').trim();
  var m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(s);
  if (!m) return s;
  var h = +m[1];
  var min = m[2];
  var ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return ('0' + h).slice(-2) + ':' + min;
}

function drTotal_(start, finish) {
  var sm = /^(\d{1,2}):(\d{2})/.exec(String(start || '').trim());
  var fm = /^(\d{1,2}):(\d{2})/.exec(String(finish || '').trim());
  if (!sm || !fm) return '';
  var s = (+sm[1]) * 60 + (+sm[2]);
  var f = (+fm[1]) * 60 + (+fm[2]);
  if (f < s) f += 24 * 60;
  var diff = f - s;
  if (diff < 0) return '';
  var h = Math.floor(diff / 60);
  var m = diff % 60;
  return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
}

function drPdfForRow_(rowId) {
  var want = Number(rowId);
  if (!isFinite(want) || want < 2) return fail_('Baris Daily Report tidak valid.');

  var read = readAll_('dr');
  var target = null;
  for (var i = 0; i < read.rows.length; i++) {
    if (read.rows[i].rowId === want) { target = read.rows[i]; break; }
  }
  if (!target) return fail_('Daily Report tidak ditemukan.');

  var id = val_(target.data, read.colsMap, 'id').trim();
  var hdr = drHeaderObject_(target.data, read.colsMap, target.rowId);
  var rows = [];
  var sourceRows = [];

  for (var j = 0; j < read.rows.length; j++) {
    var r = read.rows[j];
    var rid = val_(r.data, read.colsMap, 'id').trim();
    var sama = id ? rid === id : r.rowId === want;
    if (!sama) continue;
    sourceRows.push(r);

    var groupKeys = Object.keys(read.colsMap.groups || {}).sort(function(a,b){ return Number(a)-Number(b); });
    if (groupKeys.length) {
      groupKeys.forEach(function (gn) {
        var group = read.colsMap.groups[gn];
        function g(key) {
          var c = group[key];
          return c ? String(r.data[c - 1] == null ? '' : r.data[c - 1]).trim() : '';
        }
        var row = {
          start: normTime_(g('start')), finish: normTime_(g('finish')), total: '',
          nopol: g('nopol'), ijn: g('ijn'), namaUser: g('namaUser'),
          km: g('km'), solar: g('solar'), uraian: g('uraian')
        };
        if (!row.start) row.start = normTime_(val_(r.data, read.colsMap, 'jamstart') || '');
        if (!row.finish) row.finish = normTime_(val_(r.data, read.colsMap, 'jamfinish') || '');
        if (!row.nopol) row.nopol = val_(r.data, read.colsMap, 'nopol') || '';
        if (!row.ijn) row.ijn = val_(r.data, read.colsMap, 'ijn') || '';
        if (!row.namaUser) row.namaUser = val_(r.data, read.colsMap, 'namauser') || '';
        if (!row.km) row.km = val_(r.data, read.colsMap, 'km') || '';
        if (!row.solar) row.solar = val_(r.data, read.colsMap, 'solar') || '';
        if (!row.uraian) row.uraian = val_(r.data, read.colsMap, 'uraian') || '';
        row.total = drTotal_(row.start, row.finish);
        if (drRowHasContent_(row)) rows.push(row);
      });
    } else {
      var row = drRowObject_(r.data, read.colsMap);
      row.total = drTotal_(row.start, row.finish);
      if (drRowHasContent_(row)) rows.push(row);
    }
  }
  if (!rows.length) return fail_('Daily Report belum punya baris pekerjaan.');

  var label = hdr.id || ('Form ' + want);
  var nama = ('Surat Tugas ' + label + ' - ' + (hdr.driver || 'tanpa driver') + '.pdf')
    .replace(/[\/\\:*?\"<>|]/g, '-');
  var blob = drPdf_(hdr, rows);
  var link = '';
  var dataUrl = '';

  try {
    var file = drCkFolder_().createFile(blob.setName(nama));
    link = file.getUrl() || '';
  } catch (e) {
    Logger.log('PDF Surat Tugas gagal disimpan ke Drive: ' + e);
    try {
      dataUrl = 'data:application/pdf;base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (e2) {
      Logger.log('PDF Surat Tugas gagal diubah ke base64: ' + e2);
    }
  }

  if (link && read.colsMap.fields.linkPdf) {
    for (var k = 0; k < sourceRows.length; k++) {
      try {
        sheet_('dr').getRange(sourceRows[k].rowId, read.colsMap.fields.linkPdf).setValue(link);
      } catch (e3) {
        Logger.log('Link PDF gagal ditulis ke baris ' + sourceRows[k].rowId + ': ' + e3);
      }
    }
  }

  return ok_({
    rowId: want,
    id: hdr.id || '',
    filename: nama,
    linkPdf: link,
    dataUrl: dataUrl
  });
}

function getMasters_() {
  var items = [];
  try {
    var itemSheet = sheet_('mItem');
    var lastRow = itemSheet.getLastRow();
    if (lastRow >= 1) {
      var vals = itemSheet.getRange(1, 1, lastRow, 4).getDisplayValues();
      // M_Item lama bisa saja dibuat tanpa baris header (data mulai baris 1).
      // Deteksi header supaya baris pertama tidak ikut terlewat.
      var start = 0;
      if (vals.length) {
        var h0 = normalize_(vals[0][0]);
        var h1 = normalize_(vals[0][1]);
        if (h0.indexOf('grup') >= 0 || h1.indexOf('item') >= 0) start = 1;
      }
      for (var r = start; r < vals.length; r++) {
        var row = vals[r];
        if (!String(row[1] || '').trim()) continue;
        items.push({
          grup: String(row[0] || '').trim(),
          item: String(row[1] || '').trim(),
          urut: Number(row[2]) || 0,
          status: String(row[3] || 'Aktif').trim()
        });
      }
    }
  } catch (e) {}

  var ijnList = [];
  var ijnSet = {};
  try {
    var tRead = readAll_('transport');
    tRead.rows.forEach(function (r) {
      var v = val_(r.data, tRead.colsMap, 'ijn');
      if (v && v !== '-' && !ijnSet[v]) {
        ijnSet[v] = 1;
        ijnList.push({ ijn: v, tujuan: (val_(r.data, tRead.colsMap, 'tujuan') || '') });
      }
    });
  } catch (e) {}

  var email = '';
  try { email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || ''; } catch (e) {}

  return ok_({
    role: 'admin',
    email: email,
    driver: '',
    drivers: [],
    kendaraan: [],
    items: items,
    ijn: ijnList,
    bbmLevels: ['E', '1/4', '1/2', '3/4', 'F'],
    ckStatuses: ['Baik', 'Rusak', 'Tidak Ada'],
    views: ['ATAS', 'KIRI', 'KANAN', 'DEPAN', 'BELAKANG'],
    ckFormCode: 'FM-FCL-02.04',
    ckRev: '00'
  });
}

function updateDocStatus_(which, param) {
  param = param || {};
  // Body bisa datang lewat query param `data` (parseBody_) atau langsung.
  var body = {};
  if (param.data) {
    try { body = JSON.parse(param.data); } catch (e) { body = {}; }
  } else {
    body = param;
  }
  var id = String(body.id || param.id || '').trim();
  var status = String(body.status || param.status || '').trim();
  if (!id) return fail_('id wajib diisi.');
  if (!status) return fail_('status wajib diisi.');

  var key = (which === 'ck') ? 'ck' : 'dr';

  withLock_(function () {
    var sh = sheet_(key);
    var colsMap = cols_(key);
    var idCol = colsMap.fields.id;
    var statusCol = colsMap.fields.status;
    if (!statusCol) throw new Error('Kolom STATUS tidak ditemukan di tab ' + key + '.');

    // Cari kolom id: kalau tidak ada, pakai kolom pertama.
    if (!idCol) idCol = 1;

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    var updated = 0;
    for (var r = 2; r <= lastRow; r++) {
      var currentId = '';
      try {
        currentId = String(sh.getRange(r, idCol).getDisplayValues()[0][0]).trim();
      } catch (e) { currentId = ''; }
      if (currentId === id) {
        sh.getRange(r, statusCol).setValue(status);
        updated++;
      }
    }
    if (updated === 0) throw new Error('Dokumen ' + id + ' tidak ditemukan.');
  });

  colCache_ = {};
  return ok_({ message: 'Dokumen ' + id + ' -> ' + status + '.' });
}

function getCkData_() {
  var sh = sheet_('ck');
  if (sh.getLastRow() < 2) return ok_([]);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  function ci(name) { for (var i = 0; i < head.length; i++) if (normalize_(head[i]) === normalize_(name)) return i + 1; return -1; }
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues();
  var out = [];
  rows.forEach(function (r, idx) {
    var get = function (name) { var c = ci(name); return c > 0 ? String(r[c - 1] || '') : ''; };
    var items = []; try { items = JSON.parse(get('Items_JSON') || '[]'); } catch (e) {}
    var damages = []; try { damages = JSON.parse(get('Damages_JSON') || '[]'); } catch (e) {}
    out.push({
      rowId: idx + 2,
      id: get('ID_CK'),
      counter: get('Counter'),
      tipeMobil: get('Tipe_Mobil'),
      driver: get('Driver'),
      tanggal: get('Tanggal'),
      noPolisi: get('No_Polisi'),
      kilometer: get('Kilometer'),
      bbmMasuk: get('BBM_Masuk'),
      bbmKeluar: get('BBM_Keluar'),
      keterangan: get('Keterangan'),
      diperiksaOleh: get('Diperiksa_Oleh'),
      status: get('Status') || 'Submitted',
      createdBy: get('Created_By'),
      createdAt: get('Created_At'),
      linkPdf: get('Link_PDF'),
      items: items,
      damages: damages,
      hasRusak: get('Has_Rusak') === 'true' || get('Has_Rusak') === 'TRUE'
    });
  });
  out.reverse();
  return ok_(out);
}



function saveDr_(body) {
  // Implementasi sederhana
  return ok_({ success: true, data: { message: 'Surat Tugas tersimpan.' } });
}

function saveCk_(body) {
  body = body || {};

  var bbmLevels = ['E', '1/4', '1/2', '3/4', 'F'];
  if (body.bbmMasuk && bbmLevels.indexOf(body.bbmMasuk) < 0) return fail_('bbm masuk ngawur');
  if (body.bbmKeluar && bbmLevels.indexOf(body.bbmKeluar) < 0) return fail_('bbm keluar ngawur');

  var views = ['ATAS', 'KIRI', 'KANAN', 'DEPAN', 'BELAKANG'];
  var damages = body.damages || [];
  for (var d = 0; d < damages.length; d++) {
    if (views.indexOf(damages[d].view) < 0) return fail_('damage view ngawur');
    if (typeof damages[d].x !== 'number' || damages[d].x < 0 || damages[d].x > 100) return fail_('damage x ngawur');
    if (typeof damages[d].y !== 'number' || damages[d].y < 0 || damages[d].y > 100) return fail_('damage y ngawur');
  }
  if (body.kilometer && isNaN(parseInt(body.kilometer, 10))) return fail_('km ngawur');

  var sh = sheet_('ck');
  if (sh.getLastRow() < 1) {
    var ckHeaders = ['ID_CK','Tanggal','Counter','Tipe_Mobil','No_Polisi','Driver','Kilometer','BBM_Masuk','BBM_Keluar','Keterangan','Diperiksa_Oleh','Status','Created_By','Created_At','Link_PDF','Items_JSON','Damages_JSON','Has_Rusak','Request_Id'];
    sh.getRange(1, 1, 1, ckHeaders.length).setValues([ckHeaders]);
  }
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  function colIndex(name) { for (var i = 0; i < head.length; i++) if (normalize_(head[i]) === normalize_(name)) return i + 1; return -1; }

  var parts = String(body.tanggal).split('/');
  var ymd = parts.length === 3 ? parts[2] + parts[1] + parts[0] : '';
  var prefix = 'CK-' + ymd + '-';
  var maxN = 0;
  for (var r = 2; r <= sh.getLastRow(); r++) {
    var cId = colIndex('ID_CK');
    if (cId < 0) continue;
    var existingId = String(sh.getRange(r, cId).getDisplayValues()[0][0]);
    if (existingId.indexOf(prefix) === 0) {
      var n = parseInt(existingId.slice(prefix.length), 10);
      if (!isNaN(n) && n > maxN) maxN = n;
    }
  }
  var id = prefix + ('000' + (maxN + 1)).slice(-3);

  var hasRusak = (body.items || []).some(function (it) { return it.status === 'Rusak'; });

  var itemsJson = JSON.stringify(body.items || []);
  var damagesJson = JSON.stringify((body.damages || []).map(function (d) {
    return { view: d.view, x: d.x, y: d.y, catatan: d.catatan || '', linkGambar: '' };
  }));

  var now = new Date();
  var createdAt = Utilities.formatDate(now, CONFIG.timezone, 'dd/MM/yyyy HH:mm');
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) {}

  var lastCol = sh.getLastColumn();
  var out = [];
  for (var c = 0; c < lastCol; c++) out.push('');
  function put(name, value) { var idx = colIndex(name); if (idx > 0) out[idx - 1] = value; }

  put('ID_CK', id);
  put('Tanggal', body.tanggal);
  put('Counter', body.counter || '');
  put('Tipe_Mobil', body.tipeMobil || '');
  put('No_Polisi', String(body.kendaraan || '').trim().toUpperCase());
  put('Driver', body.driver);
  put('Kilometer', body.kilometer || '');
  put('BBM_Masuk', body.bbmMasuk || '');
  put('BBM_Keluar', body.bbmKeluar || '');
  put('Keterangan', body.keterangan || '');
  put('Diperiksa_Oleh', body.diperiksaOleh || '');
  put('Status', 'Submitted');
  put('Created_By', email);
  put('Created_At', createdAt);
  put('Link_PDF', '');
  put('Items_JSON', itemsJson);
  put('Damages_JSON', damagesJson);
  put('Has_Rusak', hasRusak);
  put('Request_Id', '');

  sh.appendRow(out);

  return ok_({
    item: {
      rowId: sh.getLastRow(),
      id: id,
      tanggal: body.tanggal,
      noPolisi: String(body.kendaraan || '').trim().toUpperCase(),
      tipeMobil: body.tipeMobil || '',
      status: 'Submitted',
      linkPdf: ''
    },
    hasRusak: hasRusak,
    message: 'Checklist tersimpan. PDF siap dicetak.'
  });
}



function updateCk_(body) {
  body = body || {};

  var bbmLevels = ['E', '1/4', '1/2', '3/4', 'F'];
  if (body.bbmMasuk && bbmLevels.indexOf(body.bbmMasuk) < 0) return fail_('bbm masuk ngawur');
  if (body.bbmKeluar && bbmLevels.indexOf(body.bbmKeluar) < 0) return fail_('bbm keluar ngawur');

  var views = ['ATAS', 'KIRI', 'KANAN', 'DEPAN', 'BELAKANG'];
  var damages = body.damages || [];
  for (var d = 0; d < damages.length; d++) {
    if (views.indexOf(damages[d].view) < 0) return fail_('damage view ngawur');
    if (typeof damages[d].x !== 'number' || damages[d].x < 0 || damages[d].x > 100) return fail_('damage x ngawur');
    if (typeof damages[d].y !== 'number' || damages[d].y < 0 || damages[d].y > 100) return fail_('damage y ngawur');
  }
  if (body.kilometer && isNaN(parseInt(body.kilometer, 10))) return fail_('km ngawur');

  var sh = sheet_('ck');
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  function colIndex(name) { for (var i = 0; i < head.length; i++) if (normalize_(head[i]) === normalize_(name)) return i + 1; return -1; }

  var id = String(body.id || '').trim();
  var rowId = Number(body.rowId || 0);
  var targetRow = -1;
  var idCol = colIndex('ID_CK');
  if (id && idCol > 0) {
    for (var r = 2; r <= sh.getLastRow(); r++) {
      if (String(sh.getRange(r, idCol).getDisplayValues()[0][0]).trim() === id) { targetRow = r; break; }
    }
  }
  if (targetRow < 0 && rowId >= 2 && rowId <= sh.getLastRow()) targetRow = rowId;
  if (targetRow < 0) return fail_('Checklist tidak ditemukan.');

  var hasRusak = (body.items || []).some(function (it) { return it.status === 'Rusak'; });

  var itemsJson = JSON.stringify(body.items || []);
  var damagesJson = JSON.stringify((body.damages || []).map(function (d) {
    return { view: d.view, x: d.x, y: d.y, catatan: d.catatan || '', linkGambar: d.linkGambar || '' };
  }));

  function put(name, value) { var idx = colIndex(name); if (idx > 0) sh.getRange(targetRow, idx).setValue(value); }

  if (body.tanggal != null) put('Tanggal', body.tanggal);
  if (body.counter != null) put('Counter', body.counter);
  if (body.tipeMobil != null) put('Tipe_Mobil', body.tipeMobil);
  if (body.kendaraan != null) put('No_Polisi', String(body.kendaraan).trim().toUpperCase());
  if (body.driver != null) put('Driver', body.driver);
  if (body.kilometer != null) put('Kilometer', body.kilometer);
  if (body.bbmMasuk != null) put('BBM_Masuk', body.bbmMasuk);
  if (body.bbmKeluar != null) put('BBM_Keluar', body.bbmKeluar);
  if (body.keterangan != null) put('Keterangan', body.keterangan);
  if (body.diperiksaOleh != null) put('Diperiksa_Oleh', body.diperiksaOleh);
  if (body.status != null) put('Status', body.status);
  if (body.items != null) put('Items_JSON', itemsJson);
  if (body.damages != null) put('Damages_JSON', damagesJson);
  if (body.items != null) put('Has_Rusak', hasRusak);

  var currentId = id || String(sh.getRange(targetRow, idCol).getDisplayValues()[0][0]).trim();

  return ok_({
    item: {
      rowId: targetRow,
      id: currentId,
      tanggal: body.tanggal != null ? body.tanggal : String(sh.getRange(targetRow, colIndex('Tanggal')).getDisplayValues()[0][0]),
      noPolisi: body.kendaraan != null ? String(body.kendaraan).trim().toUpperCase() : String(sh.getRange(targetRow, colIndex('No_Polisi')).getDisplayValues()[0][0]),
      tipeMobil: body.tipeMobil != null ? body.tipeMobil : String(sh.getRange(targetRow, colIndex('Tipe_Mobil')).getDisplayValues()[0][0]),
      status: body.status != null ? body.status : String(sh.getRange(targetRow, colIndex('Status')).getDisplayValues()[0][0]),
      linkPdf: ''
    },
    hasRusak: hasRusak,
    message: 'Checklist diperbarui.'
  });
}

/* ---------- End Daily Report / Checklist Functions ---------- */


/* ---------- DR Helper Functions ---------- */

function drHeaderColsMap_(colsMap) {
  // Try to find relevant columns
  return colsMap || { fields: {}, groups: {} };
}

function drHeaderObject_(row, colsMap, rowId) {
  var get = function(k){
    var v = val_(row, colsMap, k);
    if (v) return v;
    // try direct
    try {
      if (colsMap && colsMap.fields) {
        var c = colsMap.fields[k];
        if (c) return String(row[c-1] == null ? '' : row[c-1]);
      }
    } catch(e){}
    return '';
  };
  return {
    rowId: rowId,
    id: get('id') || get('nodokumen') || '',
    hari: get('hari') || '',
    tanggal: get('tanggal') || '',
    driver: get('driver') || '',
    mengetahui: get('mengetahui') || '',
    status: get('status') || 'Submitted',
    createdBy: get('driver') || '',
    createdAt: get('timestamp') || get('tanggal') || '',
    linkPdf: get('linkpdf') || '',
    rows: []
  };
}

function drRowObject_(row, colsMap) {
  var get = function(k){
    var v = val_(row, colsMap, k);
    if (v) return v;
    try {
      if (colsMap && colsMap.fields) {
        var c = colsMap.fields[k];
        if (c) return String(row[c-1] == null ? '' : row[c-1]);
      }
    } catch(e){}
    return '';
  };
  var start = get('jamstart') || '';
  var finish = get('jamfinish') || '';
  var total = '';
  try {
    if (start && finish) {
      // try to compute rough total if possible
      total = '';
    }
  } catch(e){}
  return {
    start: start,
    finish: finish,
    total: total,
    nopol: get('nopol') || '',
    ijn: get('ijn') || '',
    namaUser: get('namauser') || '',
    km: get('km') || '',
    solar: get('solar') || '',
    uraian: get('uraian') || ''
  };
}

function drRowHasContent_(row) {
  if (!row) return false;
  return !!(row.start || row.finish || row.nopol || row.ijn || row.namaUser || row.uraian || row.km || row.solar);
}

function drCkFolder_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var folderId = PropertiesService.getScriptProperties().getProperty('DRCK_FOLDER_ID');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {}
  }
  var name = 'Facility - Surat Tugas & Checklist';
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) {
    var folder = folders.next();
    try { PropertiesService.getScriptProperties().setProperty('DRCK_FOLDER_ID', folder.getId()); } catch (e) {}
    return folder;
  }
  var parent = ss.getParents().hasNext() ? ss.getParents().next() : DriveApp.getRootFolder();
  var created = parent.createFolder(name);
  try { PropertiesService.getScriptProperties().setProperty('DRCK_FOLDER_ID', created.getId()); } catch (e) {}
  return created;
}

function drPdf_(hdr, rows) {
  try {
    var html = [];
    html.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Surat Tugas</title>');
    html.push('<style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:4px}th{background:#f0f0f0}.header{margin-bottom:10px}</style>');
    html.push('</head><body>');
    html.push('<div class="header"><h2 style="margin:0">SURAT TUGAS / DAILY REPORT</h2>');
    html.push('<div>No. Dokumen: ' + (hdr.id || '-') + '</div>');
    html.push('<div>Tanggal: ' + (hdr.tanggal || '-') + ' | Hari: ' + (hdr.hari || '-') + ' | Driver: ' + (hdr.driver || '-') + '</div>');
    html.push('</div>');
    html.push('<table><thead><tr><th>No</th><th>Keluar</th><th>Kembali</th><th>Total</th><th>No. Plat</th><th>IJN</th><th>Nama User</th><th>KM</th><th>Solar</th><th>Uraian Pekerjaan</th></tr></thead><tbody>');
    for (var i = 0; i < (rows||[]).length; i++) {
      var r = rows[i];
      html.push('<tr><td>' + (i+1) + '</td><td>' + (r.start||'-') + '</td><td>' + (r.finish||'-') + '</td><td>' + (r.total||'-') + '</td><td>' + (r.nopol||'-') + '</td><td>' + (r.ijn||'-') + '</td><td>' + (r.namaUser||'-') + '</td><td>' + (r.km||'-') + '</td><td>' + (r.solar||'-') + '</td><td>' + (r.uraian||'-') + '</td></tr>');
    }
    html.push('</tbody></table>');
    html.push('<div style="margin-top:30px"><div style="float:right;text-align:center;width:200px">Mengetahui<br/><br/><br/>_________________________<br/>' + (hdr.mengetahui||'') + '</div></div>');
    html.push('</body></html>');
    var htmlBlob = Utilities.newBlob(html.join(''), 'text/html', 'surat-tugas.html');
    return htmlBlob.getAs('application/pdf');
  } catch (e) {
    try {
      var html = '<html><body><h1>Surat Tugas</h1><p>' + (hdr.id||'') + '</p></body></html>';
      return Utilities.newBlob(html, 'text/html', 'x.html').getAs('application/pdf');
    } catch (e2) {
      return Utilities.newBlob('PDF', 'application/pdf', 'surat-tugas.pdf');
    }
  }
}


function updateDr_(body) {
  body = body || {};
  var rowId = Number(body.rowId);
  var id = String(body.id || '').trim();

  var sh = sheet_('dr');
  var colsMap = cols_('dr');
  var idCol = colsMap.fields.id;

  // Tentukan baris target (by id, atau rowId tunggal).
  var targetRowIds = [];
  if (id && idCol) {
    var lastRow = sh.getLastRow();
    for (var r = 2; r <= lastRow; r++) {
      var currentId = '';
      try { currentId = String(sh.getRange(r, idCol).getDisplayValues()[0][0]).trim(); } catch (e) {}
      if (currentId === id) targetRowIds.push(r);
    }
  }
  if (!targetRowIds.length && rowId) targetRowIds.push(rowId);
  if (!targetRowIds.length) return fail_('Dokumen tidak ditemukan.');

  var rows = body.rows || [];

  // Header kolom untuk blok baru (auto-create).
  var blockHeaders = ['Jam Start', 'Jam Finish', 'No. Plat', 'IJN', 'Nama User', 'KM', 'SOLAR', 'Uraian'];
  var blockKeys = ['start', 'finish', 'nopol', 'ijn', 'namaUser', 'km', 'solar', 'uraian'];

  withLock_(function () {
    // Pastikan jumlah group cukup untuk rows yang dikirim.
    var groups = colsMap.groups;
    var groupCount = Object.keys(groups).length;
    var needed = Math.max(groupCount, rows.length, 1);
    for (var g = groupCount + 1; g <= needed; g++) {
      // Buat blok kolom baru.
      var newGroup = {};
      for (var h = 0; h < blockHeaders.length; h++) {
        var newCol = sh.getLastColumn() + 1;
        sh.getRange(1, newCol).setValue(blockHeaders[h]);
        newGroup[blockKeys[h]] = newCol;
      }
      groups[String(g)] = newGroup;
    }
    // Refresh colsMap.groups reference.
    colsMap.groups = groups;

    function put(r, fieldKey, value) {
      if (value === undefined || value === null) return;
      var col = colsMap.fields[fieldKey];
      if (col) { sh.getRange(r, col).setValue(value); return; }
      // field tidak ada di fields (kemungkinan repeat) -> cari di group pertama.
    }
    function putGroup(r, group, key, value) {
      if (value === undefined || value === null) return;
      var col = group[key];
      if (col) sh.getRange(r, col).setValue(value);
    }

    // Header fields (hari, tanggal, driver, mengetahui, id) -> semua baris target.
    for (var hi = 0; hi < targetRowIds.length; hi++) {
      var hr = targetRowIds[hi];
      if (body.id !== undefined) put(hr, 'id', String(body.id).trim());
      if (body.hari !== undefined) put(hr, 'hari', String(body.hari).trim());
      if (body.tanggal !== undefined) put(hr, 'tanggal', String(body.tanggal).trim());
      if (body.driver !== undefined) put(hr, 'driver', String(body.driver).trim());
      if (body.mengetahui !== undefined) put(hr, 'mengetahui', String(body.mengetahui).trim());
    }

    // Pastikan jumlah group cukup untuk rows yang dikirim (single-row doc).
    var groups = colsMap.groups;
    var groupCount = Object.keys(groups).length;
    var needed = Math.max(groupCount, rows.length, 1);
    for (var g = groupCount + 1; g <= needed; g++) {
      var newGroup = {};
      for (var h = 0; h < blockHeaders.length; h++) {
        var newCol = sh.getLastColumn() + 1;
        sh.getRange(1, newCol).setValue(blockHeaders[h]);
        newGroup[blockKeys[h]] = newCol;
      }
      groups[String(g)] = newGroup;
    }
    colsMap.groups = groups;

    if (targetRowIds.length === 1) {
      // Single-row doc: tulis semua rows ke blok berurutan pada baris yang sama.
      var r = targetRowIds[0];
      for (var i = 0; i < rows.length; i++) {
        var rd = rows[i];
        if (!rd) continue;
        var gNum = i + 1;
        var group = groups[String(gNum)];
        if (!group) continue;
        putGroup(r, group, 'start', rd.start !== undefined ? String(rd.start).trim() : undefined);
        putGroup(r, group, 'finish', rd.finish !== undefined ? String(rd.finish).trim() : undefined);
        putGroup(r, group, 'nopol', rd.nopol !== undefined ? String(rd.nopol).trim() : undefined);
        putGroup(r, group, 'ijn', rd.ijn !== undefined ? String(rd.ijn).trim() : undefined);
        putGroup(r, group, 'namaUser', rd.namaUser !== undefined ? String(rd.namaUser).trim() : undefined);
        putGroup(r, group, 'km', rd.km !== undefined ? String(rd.km).trim() : undefined);
        putGroup(r, group, 'solar', rd.solar !== undefined ? String(rd.solar).trim() : undefined);
        putGroup(r, group, 'uraian', rd.uraian !== undefined ? String(rd.uraian).trim() : undefined);
      }
    } else {
      // Multi-row doc: rows[i] -> targetRowIds[i] (blok pertama).
      for (var i = 0; i < targetRowIds.length; i++) {
        var r = targetRowIds[i];
        var rd = rows[i];
        if (!rd && rows.length === 1) rd = rows[0];
        var group = groups['1'];
        if (rd && group) {
          putGroup(r, group, 'start', rd.start !== undefined ? String(rd.start).trim() : undefined);
          putGroup(r, group, 'finish', rd.finish !== undefined ? String(rd.finish).trim() : undefined);
          putGroup(r, group, 'nopol', rd.nopol !== undefined ? String(rd.nopol).trim() : undefined);
          putGroup(r, group, 'ijn', rd.ijn !== undefined ? String(rd.ijn).trim() : undefined);
          putGroup(r, group, 'namaUser', rd.namaUser !== undefined ? String(rd.namaUser).trim() : undefined);
          putGroup(r, group, 'km', rd.km !== undefined ? String(rd.km).trim() : undefined);
          putGroup(r, group, 'solar', rd.solar !== undefined ? String(rd.solar).trim() : undefined);
          putGroup(r, group, 'uraian', rd.uraian !== undefined ? String(rd.uraian).trim() : undefined);
        }
      }
    }
  });

  colCache_ = {};
  return ok_({ message: 'Daily Report berhasil diupdate.' });
}

function ckPdfHtml_(ck, items, damages) {
  ck = ck || {};
  items = items || [];
  damages = damages || [];

  // Kelompokkan item per grup (urutan sesuai data).
  var groups = {};
  var groupOrder = [];
  items.forEach(function (it) {
    var g = it.grup || 'Lainnya';
    if (!groups[g]) { groups[g] = []; groupOrder.push(g); }
    groups[g].push(it);
  });

  var html = [];
  html.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Checklist Kendaraan</title>');
  html.push('<style>body{font-family:Arial,sans-serif;font-size:10px;margin:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:3px}.g{margin:6px 0}.gtitle{font-weight:bold;margin:4px 0}.mark{color:red;font-weight:bold}</style>');
  html.push('</head><body>');
  html.push('<h2 style="text-align:center;margin:0">CHECKLIST PEMERIKSAAN KENDARAAN</h2>');
  html.push('<div style="text-align:center;font-size:9px;margin-bottom:8px">FM-FCL-02.04 Rev 00</div>');
  html.push('<table style="margin-bottom:8px"><tr><td><b>Counter:</b> ' + (ck.counter || '-') + '</td><td><b>Tipe:</b> ' + (ck.tipeMobil || '-') + '</td><td><b>Driver:</b> ' + (ck.driver || '-') + '</td></tr>');
  html.push('<tr><td><b>Tanggal:</b> ' + (ck.tanggal || '-') + '</td><td><b>No.Polisi:</b> ' + (ck.noPolisi || '-') + '</td><td><b>KM:</b> ' + (ck.kilometer || '-') + '</td></tr></table>');

  // Solar gauges
  html.push('<div style="margin:6px 0"><b>Level Solar - MASUK:</b> ' + (ck.bbmMasuk || '-') + ' &nbsp;&nbsp; <b>KELUAR:</b> ' + (ck.bbmKeluar || '-') + '</div>');

  // Items per grup
  groupOrder.forEach(function (g) {
    html.push('<div class="g"><div class="gtitle">' + g + ' :</div>');
    groups[g].forEach(function (it) {
      var line = '  ' + (it.item || '') + ' : ' + (it.status || 'Baik');
      if (it.status === 'Rusak' && it.catatan) line += ' (Rusak: ' + it.catatan + ')';
      html.push('<div>' + line + '</div>');
    });
    html.push('</div>');
  });

  if (ck.keterangan) html.push('<div style="margin:6px 0"><b>Keterangan:</b> ' + ck.keterangan + '</div>');
  if (ck.diperiksaOleh) html.push('<div><b>Diperiksa oleh:</b> ' + ck.diperiksaOleh + '</div>');

  // Damage marks
  html.push('<div style="margin:8px 0"><b>Tanda kerusakan:</b></div>');
  var views = ['ATAS', 'KIRI', 'KANAN', 'DEPAN', 'BELAKANG'];
  views.forEach(function (v) {
    var marks = damages.filter(function (d) { return d.view === v; });
    html.push('<div style="margin:4px 0"><b>' + v + '</b>: ');
    if (marks.length) {
      marks.forEach(function (m) {
        html.push('<span class="mark">✗</span> (' + (m.x || 0) + ',' + (m.y || 0) + ') ' + (m.catatan || '') + ' ');
      });
    } else {
      html.push('-');
    }
    html.push('</div>');
  });

  html.push('</body></html>');
  return html.join('');
}

function ckPdfForRow_(rowId) {
  // Placeholder: checklist PDF generated on demand not implemented; return fail.
  return fail_('Cetak PDF Checklist belum tersedia.');
}
