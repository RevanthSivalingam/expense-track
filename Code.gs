/*************************************************************
 * EXPENSE TRACKER — Server (Code.gs)
 * Google Apps Script bound to a Google Sheet (the database).
 *
 * Sections:
 *   1. CONFIG / schema constants
 *   2. doGet / include  (serves the web app)
 *   3. SheetService     (create + seed tabs, bulk read, lock)
 *   4. ExpenseService   (add / list / delete)
 *   5. CategoryService  (list / add / soft-delete)
 *   6. ReportService    (month / year aggregation)
 *   7. PUBLIC API        (the functions the client calls)
 *************************************************************/

/* ============================ 1. CONFIG ============================ */
var TZ = 'Asia/Kolkata';

var SHEETS = { EXPENSES: 'Expenses', CATEGORIES: 'Categories', CONFIG: 'Config' };

// Column index (0-based) → real column = index + 1
var EXP = { ID: 0, DATE: 1, AMOUNT: 2, CATEGORY: 3, PAYMENT: 4, NOTE: 5, CREATED: 6 };
var EXP_HEADERS = ['ID', 'Date', 'Amount', 'Category', 'PaymentMethod', 'Note', 'CreatedAt'];

var CAT = { NAME: 0, SORT: 1, ACTIVE: 2 };
var CAT_HEADERS = ['Name', 'SortOrder', 'Active'];

var CFG_HEADERS = ['Key', 'Value'];

var DEFAULT_CATEGORIES = [
  'Vegetables', 'Dining/Food orders', 'Fuel/Petrol', 'Groceries', 'Transport', 'Bills', 'Other'
];

var DEFAULT_CONFIG = {
  currency: 'INR',
  locale: 'en-IN',
  defaultPaymentMethod: 'UPI',
  schemaVersion: '1'
};

var PAYMENT_METHODS = ['Cash', 'UPI', 'Card'];
var AMOUNT_FORMAT = '"₹"#,##0.00'; // ₹ is display format only; cell stores a number

/* ===================== 2. doGet / include ===================== */
function doGet() {
  ensureSheets_(); // idempotent — creates + seeds tabs on first load
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Expenses')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    // NOTE: Apps Script's addMetaTag() only permits a small whitelist.
    // 'viewport' + 'apple-mobile-web-app-capable' are allowed (the latter is
    // what makes iOS launch the home-screen app full-screen). Other tags like
    // 'theme-color' / 'apple-mobile-web-app-status-bar-style' throw
    // "meta tag not allowed in this context", so they're intentionally omitted.
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

// Pull an .html partial into Index.html via <?!= include('Name') ?>
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ===================== 3. SheetService ===================== */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheets_() {
  var ss = ss_();

  var exp = ss.getSheetByName(SHEETS.EXPENSES);
  if (!exp) {
    exp = ss.insertSheet(SHEETS.EXPENSES);
    exp.getRange(1, 1, 1, EXP_HEADERS.length).setValues([EXP_HEADERS]).setFontWeight('bold');
    exp.setFrozenRows(1);
    exp.getRange('B:B').setNumberFormat('dd-MMM-yyyy');        // Date
    exp.getRange('C:C').setNumberFormat(AMOUNT_FORMAT);        // Amount
    exp.getRange('G:G').setNumberFormat('dd-MMM-yyyy HH:mm');  // CreatedAt
  }

  var cat = ss.getSheetByName(SHEETS.CATEGORIES);
  if (!cat) {
    cat = ss.insertSheet(SHEETS.CATEGORIES);
    cat.getRange(1, 1, 1, CAT_HEADERS.length).setValues([CAT_HEADERS]).setFontWeight('bold');
    cat.setFrozenRows(1);
    var rows = DEFAULT_CATEGORIES.map(function (name, i) { return [name, i, true]; });
    cat.getRange(2, 1, rows.length, CAT_HEADERS.length).setValues(rows);
  }

  var cfg = ss.getSheetByName(SHEETS.CONFIG);
  if (!cfg) {
    cfg = ss.insertSheet(SHEETS.CONFIG);
    cfg.getRange(1, 1, 1, CFG_HEADERS.length).setValues([CFG_HEADERS]).setFontWeight('bold');
    cfg.setFrozenRows(1);
    var crows = Object.keys(DEFAULT_CONFIG).map(function (k) { return [k, DEFAULT_CONFIG[k]]; });
    cfg.getRange(2, 1, crows.length, CFG_HEADERS.length).setValues(crows);
  }
}

// Bulk-read all data rows (below header) as a 2D array. [] if empty.
function readData_(sheetName) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
}

function getConfig_() {
  var out = {};
  readData_(SHEETS.CONFIG).forEach(function (r) { if (r[0] !== '') out[String(r[0])] = r[1]; });
  Object.keys(DEFAULT_CONFIG).forEach(function (k) { if (!(k in out)) out[k] = DEFAULT_CONFIG[k]; });
  return out;
}

// Wrap every WRITE so concurrent taps can't corrupt rows.
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); }
  finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}

/* ---- date helpers (server is the source of truth for "today") ---- */
function dateToISO_(d) {
  if (d instanceof Date) return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  var s = String(d || '');
  return s ? s.substring(0, 10) : '';
}
function isoToDate_(iso) {
  var p = String(iso).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); // midnight in script TZ
}
function todayISO_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

/* ===================== 4. ExpenseService ===================== */
function addExpense_(input) {
  var amount = Number(input.amount);
  if (!(amount > 0)) return { ok: false, error: 'Amount must be greater than 0' };

  var category = String(input.category || '').trim();
  if (!category) return { ok: false, error: 'Pick a category' };

  var payment = PAYMENT_METHODS.indexOf(input.paymentMethod) >= 0 ? input.paymentMethod : 'Cash';
  var note = String(input.note || '').trim();
  var dateISO = input.dateISO ? String(input.dateISO) : todayISO_();
  var dateVal = isoToDate_(dateISO);

  return withLock_(function () {
    var sh = ss_().getSheetByName(SHEETS.EXPENSES);
    var id = Utilities.getUuid();
    sh.appendRow([id, dateVal, amount, category, payment, note, new Date()]);
    return { ok: true, id: id };
  });
}

function getExpenses_(opts) {
  opts = opts || {};
  var rows = readData_(SHEETS.EXPENSES).filter(function (r) { return r[EXP.ID] !== ''; });

  if (opts.period && opts.value) {
    rows = rows.filter(function (r) {
      var iso = dateToISO_(r[EXP.DATE]);
      if (opts.period === 'day') return iso === opts.value;          // 'YYYY-MM-DD'
      if (opts.period === 'month') return iso.substring(0, 7) === opts.value;
      if (opts.period === 'year') return iso.substring(0, 4) === opts.value;
      return true;
    });
  }

  // newest first (by date, then sheet order)
  rows.sort(function (a, b) {
    var da = dateToISO_(a[EXP.DATE]), db = dateToISO_(b[EXP.DATE]);
    return da === db ? 0 : (da < db ? 1 : -1);
  });

  var total = 0;
  var list = rows.map(function (r) {
    var amt = Number(r[EXP.AMOUNT]) || 0;
    total += amt;
    return {
      id: r[EXP.ID],
      dateISO: dateToISO_(r[EXP.DATE]),
      amount: amt,
      category: r[EXP.CATEGORY],
      paymentMethod: r[EXP.PAYMENT],
      note: r[EXP.NOTE]
    };
  });

  if (opts.limit) list = list.slice(0, opts.limit);
  return { expenses: list, total: total };
}

function deleteExpense_(id) {
  if (!id) return { ok: false, error: 'Missing id' };
  return withLock_(function () {
    var sh = ss_().getSheetByName(SHEETS.EXPENSES);
    var last = sh.getLastRow();
    if (last < 2) return { ok: false, error: 'not_found' };
    var ids = sh.getRange(2, EXP.ID + 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) { sh.deleteRow(i + 2); return { ok: true }; }
    }
    return { ok: false, error: 'not_found' };
  });
}

/* ===================== 5. CategoryService ===================== */
function getCategories_(includeInactive) {
  var list = readData_(SHEETS.CATEGORIES)
    .filter(function (r) { return String(r[CAT.NAME]).trim() !== ''; })
    .map(function (r) {
      return { name: String(r[CAT.NAME]), sortOrder: Number(r[CAT.SORT]) || 0, active: r[CAT.ACTIVE] !== false };
    });
  if (!includeInactive) list = list.filter(function (c) { return c.active; });
  list.sort(function (a, b) { return (a.sortOrder - b.sortOrder) || (a.name < b.name ? -1 : 1); });
  return list;
}

function addCategory_(name) {
  name = String(name || '').trim();
  if (!name) return { ok: false, error: 'empty' };

  return withLock_(function () {
    var sh = ss_().getSheetByName(SHEETS.CATEGORIES);
    var last = sh.getLastRow();
    var data = last >= 2 ? sh.getRange(2, 1, last - 1, CAT_HEADERS.length).getValues() : [];

    for (var i = 0; i < data.length; i++) {
      if (String(data[i][CAT.NAME]).trim().toLowerCase() === name.toLowerCase()) {
        if (data[i][CAT.ACTIVE] === false) {           // reactivate a soft-deleted one
          sh.getRange(i + 2, CAT.ACTIVE + 1).setValue(true);
          return { ok: true, categories: getCategories_() };
        }
        return { ok: false, error: 'duplicate' };
      }
    }
    sh.appendRow([name, data.length, true]);
    return { ok: true, categories: getCategories_() };
  });
}

function deleteCategory_(name) {
  name = String(name || '').trim();
  if (!name) return { ok: false, error: 'empty' };

  return withLock_(function () {
    var sh = ss_().getSheetByName(SHEETS.CATEGORIES);
    var last = sh.getLastRow();
    if (last < 2) return { ok: false, error: 'not_found' };
    var data = sh.getRange(2, 1, last - 1, CAT_HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][CAT.NAME]).trim().toLowerCase() === name.toLowerCase()) {
        sh.getRange(i + 2, CAT.ACTIVE + 1).setValue(false); // soft delete keeps history valid
        return { ok: true, categories: getCategories_() };
      }
    }
    return { ok: false, error: 'not_found' };
  });
}

/* ===================== 6. ReportService ===================== */
function getReport_(period, value) {
  period = period || 'month';
  var data = getExpenses_({ period: period, value: value }).expenses;

  var total = 0, byCatMap = {};
  data.forEach(function (e) {
    total += e.amount;
    if (!byCatMap[e.category]) byCatMap[e.category] = { amount: 0, items: [] };
    byCatMap[e.category].amount += e.amount;
    byCatMap[e.category].items.push({           // data is newest-first, so items are too
      id: e.id, dateISO: e.dateISO, amount: e.amount, note: e.note, paymentMethod: e.paymentMethod
    });
  });

  var byCategory = Object.keys(byCatMap)
    .map(function (k) { return { category: k, amount: byCatMap[k].amount, count: byCatMap[k].items.length, items: byCatMap[k].items }; })
    .sort(function (a, b) { return b.amount - a.amount; });

  var trend;
  if (period === 'year') {
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var mTot = new Array(12).fill(0);
    data.forEach(function (e) { mTot[Number(e.dateISO.substring(5, 7)) - 1] += e.amount; });
    trend = months.map(function (lbl, i) { return { label: lbl, amount: mTot[i] }; });
  } else {
    var dayMap = {};
    data.forEach(function (e) { var d = e.dateISO.substring(8, 10); dayMap[d] = (dayMap[d] || 0) + e.amount; });
    trend = Object.keys(dayMap).sort().map(function (d) { return { label: d, amount: dayMap[d] }; });
  }

  return { period: period, value: value, total: total, byCategory: byCategory, trend: trend, count: data.length };
}

/* ===================== 7. PUBLIC API (client calls these) ===================== */
function getBootstrap() {
  var cfg = getConfig_();
  return {
    categories: getCategories_(),
    paymentMethods: PAYMENT_METHODS,
    defaultPaymentMethod: cfg.defaultPaymentMethod || 'UPI',
    currentDateISO: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
    currentMonthValue: Utilities.formatDate(new Date(), TZ, 'yyyy-MM'),
    currentYearValue: Utilities.formatDate(new Date(), TZ, 'yyyy'),
    locale: cfg.locale || 'en-IN'
  };
}
function addExpense(input)    { return addExpense_(input || {}); }
function getExpenses(opts)     { return getExpenses_(opts || {}); }
function deleteExpense(arg)    { return deleteExpense_(arg && arg.id); }
function getCategories(arg)    { return getCategories_(arg && arg.includeInactive); }
function addCategory(arg)      { return addCategory_(arg && arg.name); }
function deleteCategory(arg)   { return deleteCategory_(arg && arg.name); }
function getReport(arg)        { arg = arg || {}; return getReport_(arg.period, arg.value); }
