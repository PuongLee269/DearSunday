/**
 * DearSunday Homestay - máy chủ đồng bộ (Google Apps Script), bản 4.
 *
 * - Không có tài khoản hay mật khẩu. Mọi máy dùng chung một MÃ ĐỒNG BỘ (SYNC_KEY) để đọc và ghi dữ liệu.
 * - Quyền Admin trong app là mã PIN lưu riêng trên từng máy, chỉ khóa giao diện, máy chủ không kiểm tra.
 * - Dữ liệu lưu trong kho riêng của script (Script Properties), không cần quyền Google Sheets hay Drive.
 *   Dữ liệu cả homestay là 1 JSON, cắt thành mảnh nhỏ vì mỗi giá trị lưu tối đa 9 KB.
 * - Đoán sai mã quá nhiều lần thì bị khóa tạm thời. Chạy hàm moKhoa() trong editor để gỡ ngay.
 *
 * Cách triển khai: xem apps-script/README.md
 */

// Đổi chuỗi này thành mã bí mật của bạn (dài, khó đoán) trước khi triển khai.
var SYNC_KEY = "DOI-MA-NAY";

var BUILD = "4";
var MAX_FAILS = 20;
var MAX_DATA_CHARS = 90000;
var CHUNK = 3000;

function doGet() {
  return out_({ ok: true, service: "DearSunday", build: BUILD, configured: SYNC_KEY !== "DOI-MA-NAY" });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return out_({ ok: false, error: "Yêu cầu không hợp lệ", code: "bad" });
  }
  var fn = ACTIONS_[req.action];
  if (!fn) return out_({ ok: false, error: "Không rõ yêu cầu", code: "bad" });
  try {
    checkKey_(req.key);
    return out_(fn(req));
  } catch (err) {
    if (err && err.code) return out_({ ok: false, error: err.message, code: err.code });
    console.error(err);
    return out_({ ok: false, error: "Lỗi máy chủ: " + String(err && err.message), code: "server" });
  }
}

var ACTIONS_ = { status: status_, load: load_, save: save_ };

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, msg) {
  var e = new Error(msg);
  e.code = code;
  throw e;
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ---------- kiểm tra mã ---------- */

function checkKey_(key) {
  if (SYNC_KEY === "DOI-MA-NAY") fail_("setup", "Hãy đặt SYNC_KEY trong script rồi triển khai lại");
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get("fails") || 0);
  if (fails >= MAX_FAILS) fail_("locked", "Nhập sai mã quá nhiều lần. Vui lòng đợi 10 phút rồi thử lại.");
  if (String(key || "") !== SYNC_KEY) {
    cache.put("fails", String(fails + 1), 600);
    fail_("auth", "Mã đồng bộ không đúng");
  }
  if (fails) cache.remove("fails");
}

// Chạy tay trong editor nếu bị khóa vì nhập sai nhiều lần.
function moKhoa() {
  CacheService.getScriptCache().remove("fails");
  Logger.log("Đã gỡ khóa.");
}

/* ---------- dữ liệu ---------- */

function status_() {
  return { ok: true };
}

function meta_() {
  var raw = props_().getProperty("META");
  return raw ? JSON.parse(raw) : { version: 0, updatedAt: null, updatedBy: null };
}

function setMeta_(m) {
  props_().setProperty("META", JSON.stringify(m));
}

function readData_() {
  var all = props_().getProperties();
  var n = Number(all.DATA_N || 0);
  if (!n) return null;
  var parts = [];
  for (var i = 0; i < n; i++) parts.push(all["D" + i] || "");
  return parts.join("");
}

function writeData_(str) {
  var p = props_();
  var old = Number(p.getProperty("DATA_N") || 0);
  var n = Math.ceil(str.length / CHUNK);
  var obj = {};
  for (var i = 0; i < n; i++) obj["D" + i] = str.slice(i * CHUNK, (i + 1) * CHUNK);
  obj.DATA_N = String(n);
  p.setProperties(obj, false);
  for (var j = n; j < old; j++) p.deleteProperty("D" + j);
}

function load_(req) {
  return withLock_(function () {
    var m = meta_();
    if (req.since !== undefined && Number(req.since) === m.version) {
      return { ok: true, notModified: true, version: m.version };
    }
    var raw = readData_();
    return { ok: true, version: m.version, updatedAt: m.updatedAt, updatedBy: m.updatedBy, data: raw ? JSON.parse(raw) : null };
  });
}

function save_(req) {
  if (!req.data || typeof req.data !== "object") fail_("bad", "Thiếu dữ liệu");
  var str = JSON.stringify(req.data);
  if (str.length > MAX_DATA_CHARS) fail_("big", "Dữ liệu quá lớn. Hãy tải bản sao lưu trong Cài đặt rồi xóa bớt dữ liệu cũ.");
  return withLock_(function () {
    var m = meta_();
    if (Number(req.baseVersion) !== m.version) {
      var cur = readData_();
      return { ok: false, conflict: true, version: m.version, updatedAt: m.updatedAt, updatedBy: m.updatedBy, data: cur ? JSON.parse(cur) : null };
    }
    writeData_(str);
    var next = { version: m.version + 1, updatedAt: Date.now(), updatedBy: "" };
    setMeta_(next);
    return { ok: true, version: next.version, updatedAt: next.updatedAt, updatedBy: next.updatedBy };
  });
}
