/**
 * DearSunday Homestay - máy chủ đồng bộ (Google Apps Script).
 *
 * - Dữ liệu và tài khoản lưu trong kho riêng của chính script (Script Properties), không cần quyền Google Sheets hay Drive.
 *   Vì vậy script không đòi cấp quyền gì và không hiện cảnh báo "chưa xác minh ứng dụng".
 * - Tài khoản do Admin cấp. Mật khẩu được băm (muối + SHA-256 nhiều vòng), không lưu mật khẩu gốc.
 * - Phiên đăng nhập là token ký HMAC, hết hạn sau TOKEN_DAYS ngày, mất hiệu lực khi đổi mật khẩu hoặc khóa tài khoản.
 * - Quyền Admin được kiểm tra ở đây (phía máy chủ) cho mọi thao tác quản trị.
 * - Dữ liệu cả homestay là 1 JSON, cắt thành nhiều mảnh nhỏ vì mỗi giá trị lưu tối đa 9 KB.
 *
 * Cách triển khai: xem apps-script/README.md
 */

// Đổi chuỗi này trước khi triển khai. Chỉ dùng 1 lần, để tạo Admin đầu tiên (không cần nếu có SEED_USERS).
var SETUP_CODE = "DOI-MA-NAY";

// Tài khoản tạo sẵn, được thêm 1 lần khi chưa có ai. Mỗi mục: {username, salt, hash, role}.
// Chỉ lưu muối và mã băm, không lưu mật khẩu. Để trống nếu muốn tạo Admin bằng SETUP_CODE trên trang web.
var SEED_USERS = [];

var BUILD = "3.3";
var TOKEN_DAYS = 14;
var HASH_ROUNDS = 150;
var MAX_FAILS = 5;
// Kho Script Properties tối đa 500 KB. Tiếng Việt có dấu chiếm 2-3 byte mỗi ký tự, nên giới hạn thận trọng.
var MAX_DATA_CHARS = 90000;
var CHUNK = 3000;

function doGet(e) {
  if (e && e.parameter && e.parameter.ics !== undefined) return ics_(String(e.parameter.ics));
  try {
    return out_({ ok: true, service: "DearSunday", build: BUILD, hasUsers: readUsers_().length > 0 });
  } catch (err) {
    console.error(err);
    return out_({ ok: false, service: "DearSunday", build: BUILD, error: String(err && err.message) });
  }
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
    return out_(fn(req));
  } catch (err) {
    if (err && err.code) return out_({ ok: false, error: err.message, code: err.code });
    console.error(err);
    return out_({ ok: false, error: "Lỗi máy chủ: " + String(err && err.message), code: "server" });
  }
}

var ACTIONS_ = {
  status: status_,
  bootstrap: bootstrap_,
  login: login_,
  me: me_,
  load: load_,
  save: save_,
  changePassword: changePassword_,
  listUsers: listUsers_,
  createUser: createUser_,
  setPassword: setPassword_,
  setRole: setRole_,
  setActive: setActive_,
  deleteUser: deleteUser_,
  extInfo: extInfo_,
  setExt: setExt_,
  syncExt: syncExt_,
  rotateIcs: rotateIcs_,
  ttInfo: ttInfo_,
  ttSet: ttSet_,
  ttPick: ttPick_,
  ttCode: ttCode_
};

/* ---------- tiện ích ---------- */

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, msg) {
  var e = new Error(msg);
  e.code = code;
  throw e;
}

function norm_(s) {
  return String(s || "").trim().toLowerCase();
}

function checkName_(name) {
  if (!/^[a-z0-9._-]{3,30}$/.test(name)) fail_("bad", "Tên đăng nhập gồm 3-30 ký tự: chữ thường, số, dấu . _ -");
}

function checkPass_(pw) {
  if (String(pw || "").length < 6) fail_("bad", "Mật khẩu cần ít nhất 6 ký tự");
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

/* ---------- mật khẩu và token ---------- */

function hex_(bytes) {
  return bytes
    .map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? "0" + v : v;
    })
    .join("");
}

function hash_(salt, pw) {
  var h = pw;
  for (var i = 0; i < HASH_ROUNDS; i++) {
    h = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + h + pw, Utilities.Charset.UTF_8));
  }
  return h;
}

function key_() {
  var p = props_();
  var k = p.getProperty("HMAC_KEY");
  if (!k) {
    k = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty("HMAC_KEY", k);
  }
  return k;
}

function sign_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, key_()));
}

function makeToken_(u) {
  var payload = Utilities.base64EncodeWebSafe(
    JSON.stringify({ u: u.username, pv: u.hash.slice(0, 10), exp: Date.now() + TOKEN_DAYS * 86400000 }),
    Utilities.Charset.UTF_8
  );
  return payload + "." + sign_(payload);
}

function auth_(req, needAdmin) {
  var t = String(req.token || "");
  var i = t.indexOf(".");
  if (i < 1) fail_("auth", "Chưa đăng nhập");
  var p = t.slice(0, i);
  if (sign_(p) !== t.slice(i + 1)) fail_("auth", "Phiên đăng nhập không hợp lệ");
  var d;
  try {
    d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p)).getDataAsString());
  } catch (err) {
    fail_("auth", "Phiên đăng nhập không hợp lệ");
  }
  if (!d.exp || d.exp < Date.now()) fail_("auth", "Phiên đăng nhập đã hết hạn");
  var u = findUser_(d.u);
  if (!u || !u.active || u.hash.slice(0, 10) !== d.pv) fail_("auth", "Tài khoản không còn hiệu lực");
  if (needAdmin && u.role !== "admin") fail_("forbidden", "Chỉ Admin được thực hiện thao tác này");
  return u;
}

/* ---------- người dùng ---------- */

function seedUsers_() {
  var p = props_();
  if (!SEED_USERS.length || p.getProperty("SEEDED") || p.getProperty("USERS")) return;
  var list = SEED_USERS.map(function (u) {
    return { username: u.username, salt: u.salt, hash: u.hash, role: u.role === "admin" ? "admin" : "staff", active: true, created: Date.now() };
  });
  p.setProperties({ USERS: JSON.stringify(list), SEEDED: "1" }, false);
}

function isDefaultPw_(u) {
  for (var i = 0; i < SEED_USERS.length; i++) {
    if (SEED_USERS[i].username === u.username && SEED_USERS[i].hash === u.hash) return true;
  }
  return false;
}

function readUsers_() {
  seedUsers_();
  var raw = props_().getProperty("USERS");
  return raw ? JSON.parse(raw) : [];
}

function writeUsers_(list) {
  props_().setProperty("USERS", JSON.stringify(list));
}

function findUser_(name) {
  name = norm_(name);
  var users = readUsers_();
  for (var i = 0; i < users.length; i++) if (users[i].username === name) return users[i];
  return null;
}

function addUser_(name, pw, role) {
  var salt = Utilities.getUuid();
  var list = readUsers_();
  var u = { username: name, salt: salt, hash: hash_(salt, pw), role: role, active: true, created: Date.now() };
  list.push(u);
  writeUsers_(list);
  return u;
}

function updateUser_(name, fn) {
  var list = readUsers_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].username === name) {
      fn(list[i]);
      writeUsers_(list);
      return list[i];
    }
  }
  return null;
}

function publicUser_(u) {
  return { username: u.username, role: u.role, active: u.active, created: u.created || null };
}

function publicUsers_() {
  return readUsers_().map(publicUser_);
}

function activeAdmins_() {
  return readUsers_().filter(function (u) {
    return u.role === "admin" && u.active;
  });
}

/* ---------- đăng nhập ---------- */

function status_() {
  return { ok: true, hasUsers: readUsers_().length > 0 };
}

function throttle_(key) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get(key) || 0);
  if (fails >= MAX_FAILS) fail_("locked", "Thử sai quá nhiều lần. Vui lòng đợi 10 phút rồi thử lại.");
  return {
    fail: function () {
      cache.put(key, String(fails + 1), 600);
    },
    clear: function () {
      cache.remove(key);
    }
  };
}

function bootstrap_(req) {
  if (readUsers_().length) fail_("forbidden", "Đã có tài khoản, không thể khởi tạo lại");
  if (SETUP_CODE === "DOI-MA-NAY") fail_("setup", "Hãy đổi SETUP_CODE trong script rồi triển khai lại");
  var th = throttle_("fail:__setup");
  if (String(req.setupCode || "") !== SETUP_CODE) {
    th.fail();
    fail_("setup", "Sai mã thiết lập");
  }
  var name = norm_(req.username);
  checkName_(name);
  checkPass_(req.password);
  return withLock_(function () {
    if (readUsers_().length) fail_("forbidden", "Đã có tài khoản, không thể khởi tạo lại");
    var u = addUser_(name, String(req.password), "admin");
    th.clear();
    return { ok: true, token: makeToken_(u), user: u.username, role: u.role, defaultPassword: false };
  });
}

function login_(req) {
  var name = norm_(req.username);
  var th = throttle_("fail:" + name);
  var u = findUser_(name);
  if (!u || !u.active || hash_(u.salt, String(req.password || "")) !== u.hash) {
    th.fail();
    fail_("login", "Sai tên đăng nhập hoặc mật khẩu");
  }
  th.clear();
  return { ok: true, token: makeToken_(u), user: u.username, role: u.role, defaultPassword: isDefaultPw_(u) };
}

function me_(req) {
  var u = auth_(req);
  return { ok: true, user: u.username, role: u.role, defaultPassword: isDefaultPw_(u) };
}

function changePassword_(req) {
  var u = auth_(req);
  if (hash_(u.salt, String(req.oldPassword || "")) !== u.hash) fail_("login", "Mật khẩu hiện tại không đúng");
  checkPass_(req.newPassword);
  return withLock_(function () {
    return { ok: true, token: setPass_(u.username, String(req.newPassword)) };
  });
}

function setPass_(name, pw) {
  var salt = Utilities.getUuid();
  var updated = updateUser_(name, function (x) {
    x.salt = salt;
    x.hash = hash_(salt, pw);
  });
  return makeToken_(updated);
}

/* ---------- dữ liệu ---------- */

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
  auth_(req);
  return withLock_(function () {
    var m = meta_();
    var x = extState_();
    var extPart = { extAt: x.at, tt: ttReady_() };
    if (Number(req.extSince) !== x.at) extPart.ext = x.events;
    if (req.since !== undefined && Number(req.since) === m.version) {
      return Object.assign({ ok: true, notModified: true, version: m.version }, extPart);
    }
    var raw = readData_();
    return Object.assign({ ok: true, version: m.version, updatedAt: m.updatedAt, updatedBy: m.updatedBy, data: raw ? JSON.parse(raw) : null }, extPart);
  });
}

function save_(req) {
  var u = auth_(req);
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
    var next = { version: m.version + 1, updatedAt: Date.now(), updatedBy: u.username };
    setMeta_(next);
    return { ok: true, version: next.version, updatedAt: next.updatedAt, updatedBy: next.updatedBy };
  });
}

/* ---------- quản trị tài khoản (chỉ Admin) ---------- */

function listUsers_(req) {
  auth_(req, true);
  return { ok: true, users: publicUsers_() };
}

function createUser_(req) {
  auth_(req, true);
  var name = norm_(req.username);
  checkName_(name);
  checkPass_(req.password);
  var role = req.role === "admin" ? "admin" : "staff";
  return withLock_(function () {
    if (findUser_(name)) fail_("bad", "Tên đăng nhập đã tồn tại");
    addUser_(name, String(req.password), role);
    return { ok: true, users: publicUsers_() };
  });
}

function setPassword_(req) {
  var me = auth_(req, true);
  var target = findUser_(req.username);
  if (!target) fail_("bad", "Không tìm thấy tài khoản");
  checkPass_(req.password);
  return withLock_(function () {
    var token = setPass_(target.username, String(req.password));
    var res = { ok: true, users: publicUsers_() };
    if (target.username === me.username) res.token = token;
    return res;
  });
}

function setRole_(req) {
  auth_(req, true);
  var target = findUser_(req.username);
  if (!target) fail_("bad", "Không tìm thấy tài khoản");
  var role = req.role === "admin" ? "admin" : "staff";
  return withLock_(function () {
    if (target.role === "admin" && target.active && role !== "admin" && activeAdmins_().length <= 1) {
      fail_("bad", "Phải còn ít nhất 1 Admin đang hoạt động");
    }
    updateUser_(target.username, function (x) {
      x.role = role;
    });
    return { ok: true, users: publicUsers_() };
  });
}

function setActive_(req) {
  var me = auth_(req, true);
  var target = findUser_(req.username);
  if (!target) fail_("bad", "Không tìm thấy tài khoản");
  var active = !!req.active;
  return withLock_(function () {
    if (!active && target.username === me.username) fail_("bad", "Không thể tự khóa tài khoản của chính mình");
    if (!active && target.role === "admin" && activeAdmins_().length <= 1) {
      fail_("bad", "Phải còn ít nhất 1 Admin đang hoạt động");
    }
    updateUser_(target.username, function (x) {
      x.active = active;
    });
    return { ok: true, users: publicUsers_() };
  });
}

function deleteUser_(req) {
  var me = auth_(req, true);
  var target = findUser_(req.username);
  if (!target) fail_("bad", "Không tìm thấy tài khoản");
  return withLock_(function () {
    if (target.username === me.username) fail_("bad", "Không thể tự xóa tài khoản của chính mình");
    if (target.role === "admin" && target.active && activeAdmins_().length <= 1) {
      fail_("bad", "Phải còn ít nhất 1 Admin đang hoạt động");
    }
    writeUsers_(
      readUsers_().filter(function (x) {
        return x.username !== target.username;
      })
    );
    return { ok: true, users: publicUsers_() };
  });
}

/* ---------- lịch iCal xuất cho Airbnb, Booking ---------- */

// Mã trong địa chỉ lịch (?ics=MÃ) tự tạo và lưu trong script. Tạo lại mã bằng taoLaiMaLich() hoặc nút trong Cài đặt.
function icsToken_() {
  var p = props_();
  var t = p.getProperty("ICS_TOKEN");
  if (!t) {
    t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 40);
    p.setProperty("ICS_TOKEN", t);
  }
  return t;
}

function icsUrl_() {
  return ScriptApp.getService().getUrl() + "?ics=" + icsToken_();
}

function icsDate_(d) {
  return d.replace(/-/g, "");
}

function icsAddDay_(d) {
  var t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

function icsStamp_(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

// Chỉ xuất ngày bị chặn, không có tên, số điện thoại, giá hay ghi chú của khách.
function icsText_() {
  var bookings = [];
  var raw = readData_();
  if (raw) {
    try {
      bookings = JSON.parse(raw).bookings || [];
    } catch (err) {}
  }
  var m = meta_();
  var mod = icsStamp_(m.updatedAt || Date.now());
  var seq = m.version || 0;
  var cut = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DearSunday//Lich//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Dear Sunday"];
  bookings.forEach(function (b) {
    if (!b || !b.id || !b.startAt || !b.endAt) return;
    var s = String(b.startAt).slice(0, 10);
    var e = String(b.endAt).slice(0, 10);
    if (e < cut) return;
    if (e <= s) e = icsAddDay_(s); // gói trong ngày chặn cả ngày đó
    L.push("BEGIN:VEVENT", "UID:" + String(b.id).replace(/[^A-Za-z0-9_-]/g, "") + "@dearsunday", "DTSTAMP:" + mod, "LAST-MODIFIED:" + mod, "SEQUENCE:" + seq,
      "DTSTART;VALUE=DATE:" + icsDate_(s), "DTEND;VALUE=DATE:" + icsDate_(e), "SUMMARY:Reserved", "TRANSP:OPAQUE", "END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}

function ics_(token) {
  if (token !== icsToken_()) {
    return out_({ ok: false, service: "DearSunday", build: BUILD, error: "Địa chỉ lịch không đúng" });
  }
  return ContentService.createTextOutput(icsText_()).setMimeType(ContentService.MimeType.ICAL);
}

// Chạy trong editor để xem địa chỉ lịch cần dán vào Airbnb, Booking.
function layLinkLich() {
  Logger.log(icsUrl_());
}

// Tạo mã mới: địa chỉ cũ ngừng hoạt động, phải dán lại địa chỉ mới vào Airbnb, Booking.
function taoLaiMaLich() {
  props_().deleteProperty("ICS_TOKEN");
  Logger.log("Địa chỉ lịch mới: " + icsUrl_());
}

function rotateIcs_(req) {
  auth_(req, true);
  taoLaiMaLich();
  return { ok: true, icsUrl: icsUrl_() };
}

/* ---------- nhập lịch từ Airbnb, Booking (iCal) ---------- */

var EXT_SOURCES = { airbnb: "Airbnb", booking: "Booking.com" };

function extSrc_() {
  var raw = props_().getProperty("EXT_SRC");
  return raw ? JSON.parse(raw) : {};
}

function extRec_(id) {
  var raw = props_().getProperty("EXT_" + id);
  return raw ? JSON.parse(raw) : null;
}

function icsFold_(txt) {
  return String(txt).replace(/\r?\n[ \t]/g, "");
}

function icsDay_(v) {
  var m = /(\d{4})(\d{2})(\d{2})/.exec(v || "");
  return m ? m[1] + "-" + m[2] + "-" + m[3] : "";
}

// Đọc các VEVENT thành cặp ngày [bắt đầu, kết thúc). Bỏ sự kiện đã hủy, đã qua, và sự kiện do chính Dear Sunday xuất ra.
function parseIcs_(txt) {
  var cut = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  var lines = icsFold_(txt).split(/\r?\n/);
  var out = [], seen = {}, cur = null;
  lines.forEach(function (ln) {
    if (ln === "BEGIN:VEVENT") { cur = {}; return; }
    if (ln === "END:VEVENT") {
      if (cur && cur.s && !cur.cancel && !/dear\s*sunday|dearsunday/i.test((cur.sum || "") + (cur.uid || ""))) {
        var e = cur.e;
        if (!e || e <= cur.s) e = icsAddDay_(cur.s);
        if (e >= cut) {
          var k = cur.s + "|" + e;
          if (!seen[k]) { seen[k] = 1; out.push([cur.s, e]); }
        }
      }
      cur = null;
      return;
    }
    if (!cur) return;
    var i = ln.indexOf(":");
    if (i < 0) return;
    var name = ln.slice(0, i).split(";")[0].toUpperCase();
    var val = ln.slice(i + 1);
    if (name === "DTSTART") cur.s = icsDay_(val);
    else if (name === "DTEND") cur.e = icsDay_(val);
    else if (name === "STATUS") cur.cancel = /CANCEL/i.test(val);
    else if (name === "SUMMARY") cur.sum = val;
    else if (name === "UID") cur.uid = val;
  });
  out.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  return out.slice(0, 300);
}

function fetchExt_() {
  var p = props_();
  var src = extSrc_();
  Object.keys(EXT_SOURCES).forEach(function (id) {
    if (!src[id]) { p.deleteProperty("EXT_" + id); return; }
    var old = extRec_(id);
    var rec = { at: Date.now(), ok: false, err: "", ev: [] };
    try {
      var r = UrlFetchApp.fetch(src[id], { muteHttpExceptions: true, followRedirects: true });
      var code = r.getResponseCode();
      var body = r.getContentText();
      if (code !== 200) rec.err = "Nền tảng trả về mã " + code;
      else if (body.indexOf("BEGIN:VCALENDAR") < 0) rec.err = "Địa chỉ này không phải lịch iCal";
      else { rec.ok = true; rec.ev = parseIcs_(body); }
    } catch (err) {
      rec.err = "Không đọc được: " + String(err && err.message).slice(0, 120);
    }
    if (!rec.ok && old && old.ev) rec.ev = old.ev; // lỗi tạm thời thì giữ lịch lần trước
    p.setProperty("EXT_" + id, JSON.stringify(rec));
  });
  p.setProperty("EXT_AT", String(Date.now()));
}

function extState_() {
  var events = [];
  Object.keys(EXT_SOURCES).forEach(function (id) {
    var r = extRec_(id);
    if (r && r.ev) r.ev.forEach(function (x) { events.push({ src: id, s: x[0], e: x[1] }); });
  });
  return { at: Number(props_().getProperty("EXT_AT") || 0), events: events };
}

function extInfo_(req) {
  auth_(req, true);
  return extInfoOut_();
}

function extInfoOut_() {
  var src = extSrc_();
  var list = Object.keys(EXT_SOURCES).map(function (id) {
    var r = extRec_(id);
    var host = "";
    if (src[id]) { var m = /^https:\/\/([^\/?#]+)/.exec(src[id]); host = m ? m[1] : ""; }
    return { id: id, name: EXT_SOURCES[id], has: !!src[id], host: host, at: r ? r.at : null, ok: r ? r.ok : null, err: r ? r.err : "", count: r && r.ev ? r.ev.length : 0 };
  });
  return { ok: true, sources: list, icsUrl: icsUrl_(), auto: autoOn_() };
}

function setExt_(req) {
  auth_(req, true);
  var src = extSrc_();
  (req.sources || []).forEach(function (x) {
    if (!EXT_SOURCES[x.id]) return;
    var u = String(x.url || "").trim();
    if (u && !/^https:\/\/\S+$/.test(u)) fail_("bad", "Địa chỉ " + EXT_SOURCES[x.id] + " phải bắt đầu bằng https://");
    if (u.indexOf(ScriptApp.getService().getUrl()) === 0) fail_("bad", "Đây là địa chỉ lịch của Dear Sunday, không phải của " + EXT_SOURCES[x.id]);
    if (u) src[x.id] = u;
    else delete src[x.id];
  });
  props_().setProperty("EXT_SRC", JSON.stringify(src));
  fetchExt_();
  return extInfoOut_();
}

function syncExt_(req) {
  auth_(req, true);
  fetchExt_();
  return extInfoOut_();
}

// Hàm cho bộ hẹn giờ, 30 phút một lần.
function capNhatLichNgoai() {
  fetchExt_();
}

function autoOn_() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "capNhatLichNgoai"; });
}

// Chạy một lần trong editor: bật tự cập nhật lịch Airbnb, Booking mỗi 30 phút (Google sẽ hỏi cấp quyền).
function caiTuDongLich() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "capNhatLichNgoai") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("capNhatLichNgoai").timeBased().everyMinutes(30).create();
  fetchExt_();
  Logger.log("Đã bật tự cập nhật mỗi 30 phút.");
}

/* ---------- khóa thông minh TTLock: tự tạo mã vào cửa ---------- */
// Dùng TTLock Open Platform (https://euopen.ttlock.com). Cần tài khoản nhà phát triển đã được duyệt (clientId, clientSecret)
// và tài khoản app TTLock đang quản lý khóa. Mật khẩu TTLock chỉ lưu dạng MD5, không lưu mật khẩu gốc.
var TT_HOST = "https://api.sciener.com";
var TT_TZ = "+07:00";        // múi giờ Việt Nam: giờ trong đặt phòng là giờ địa phương
var TT_LEAD_HOURS = 24;      // tự tạo mã khi còn tối đa số giờ này trước giờ nhận phòng
var TT_GRACE_AFTER_H = 1;    // mã còn hiệu lực thêm số giờ này sau giờ trả phòng

function md5_(s) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8));
}

function ttCfg_() {
  var raw = props_().getProperty("TT_CFG");
  return raw ? JSON.parse(raw) : {};
}

function ttSetCfg_(c) {
  props_().setProperty("TT_CFG", JSON.stringify(c));
}

function ttReady_() {
  var c = ttCfg_();
  return !!(c.clientId && c.clientSecret && c.username && c.pwdMd5 && c.lockId);
}

function ttForm_(path, form) {
  var r = UrlFetchApp.fetch(TT_HOST + path, { method: "post", payload: form, muteHttpExceptions: true });
  var body = {};
  try {
    body = JSON.parse(r.getContentText());
  } catch (err) {
    fail_("tt", "TTLock trả về dữ liệu không đọc được (mã " + r.getResponseCode() + ")");
  }
  return body;
}

function ttToken_(force) {
  var p = props_();
  var c = ttCfg_();
  var raw = p.getProperty("TT_TOKEN");
  var t = raw ? JSON.parse(raw) : null;
  if (!force && t && t.exp > Date.now() + 3600000) return t.access;
  if (!c.clientId || !c.clientSecret || !c.username || !c.pwdMd5) fail_("tt", "Chưa nhập đủ thông tin TTLock");
  var b = ttForm_("/oauth2/token", { clientId: c.clientId, clientSecret: c.clientSecret, username: c.username, password: c.pwdMd5 });
  if (!b.access_token) fail_("tt", "TTLock từ chối đăng nhập: " + (b.errmsg || b.description || "kiểm tra lại thông tin") );
  p.setProperty("TT_TOKEN", JSON.stringify({ access: b.access_token, exp: Date.now() + Number(b.expires_in || 0) * 1000 }));
  return b.access_token;
}

// Gọi API có accessToken. Hết hạn token (mã 10004) thì xin token mới và thử lại một lần.
function ttCall_(path, params, retried) {
  var c = ttCfg_();
  var form = Object.assign({ clientId: c.clientId, accessToken: ttToken_(!!retried), date: String(Date.now()) }, params || {});
  var b = ttForm_(path, form);
  if (b.errcode && b.errcode !== 0) {
    if (b.errcode === 10004 && !retried) return ttCall_(path, params, true);
    fail_("tt", "TTLock báo lỗi " + b.errcode + ": " + (b.errmsg || b.description || ""));
  }
  return b;
}

function ttLocks_() {
  var b = ttCall_("/v3/lock/list", { pageNo: "1", pageSize: "100" });
  return (b.list || []).map(function (l) {
    return { lockId: l.lockId, alias: l.lockAlias || l.lockName, battery: l.electricQuantity, ver: l.keyboardPwdVersion, gateway: l.hasGateway };
  });
}

function ttInfoOut_(locks) {
  var c = ttCfg_();
  var out = { ok: true, ready: ttReady_(), username: c.username || "", hasClient: !!(c.clientId && c.clientSecret), lockId: c.lockId || null, alias: c.alias || "", auto: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "tuTaoMaKhoa"; }) };
  if (locks) out.locks = locks;
  return out;
}

function ttInfo_(req) {
  auth_(req, true);
  return ttInfoOut_(null);
}

// Lưu thông tin (để trống ô nào thì giữ giá trị cũ), đăng nhập thử và trả danh sách khóa để chọn.
function ttSet_(req) {
  auth_(req, true);
  var c = ttCfg_();
  if (req.clientId) c.clientId = String(req.clientId).trim();
  if (req.clientSecret) c.clientSecret = String(req.clientSecret).trim();
  if (req.username) c.username = String(req.username).trim();
  if (req.password) c.pwdMd5 = md5_(String(req.password));
  props_().deleteProperty("TT_TOKEN");
  ttSetCfg_(c);
  var locks = ttLocks_();
  return ttInfoOut_(locks);
}

function ttPick_(req) {
  auth_(req, true);
  var locks = ttLocks_();
  var l = locks.filter(function (x) { return String(x.lockId) === String(req.lockId); })[0];
  if (!l) fail_("bad", "Không tìm thấy khóa này trong tài khoản TTLock");
  var c = ttCfg_();
  c.lockId = l.lockId;
  c.alias = l.alias;
  c.ver = l.ver || 4;
  ttSetCfg_(c);
  return ttInfoOut_(locks);
}

function ttMs_(local) {
  return new Date(String(local) + ":00" + TT_TZ).getTime();
}

// Tạo mã theo khoảng thời gian (loại 3). TTLock làm tròn theo giờ: bắt đầu làm tròn xuống, kết thúc làm tròn lên.
function ttMakeCode_(startAt, endAt, name) {
  var c = ttCfg_();
  var H = 3600000;
  var s = Math.floor(ttMs_(startAt) / H) * H;
  var e = Math.ceil((ttMs_(endAt) + TT_GRACE_AFTER_H * H) / H) * H;
  if (!(e > s)) fail_("bad", "Giờ trả phòng phải sau giờ nhận phòng");
  var b = ttCall_("/v3/keyboardPwd/get", {
    lockId: String(c.lockId), keyboardPwdVersion: String(c.ver || 4), keyboardPwdType: "3",
    keyboardPwdName: String(name || "Dear Sunday").slice(0, 30), startDate: String(s), endDate: String(e)
  });
  if (!b.keyboardPwd) fail_("tt", "TTLock không trả về mã");
  return { code: String(b.keyboardPwd), codeId: b.keyboardPwdId, from: s, to: e };
}

// Ghi thay đổi vào dữ liệu đồng bộ từ phía máy chủ (tăng phiên bản để các máy tự nhận).
function mutateData_(fn) {
  return withLock_(function () {
    var raw = readData_();
    var data = raw ? JSON.parse(raw) : null;
    if (!data) fail_("bad", "Chưa có dữ liệu đồng bộ trên máy chủ");
    var res = fn(data);
    var str = JSON.stringify(data);
    if (str.length > MAX_DATA_CHARS) fail_("big", "Dữ liệu quá lớn");
    writeData_(str);
    var m = meta_();
    setMeta_({ version: m.version + 1, updatedAt: Date.now(), updatedBy: "ttlock" });
    return res;
  });
}

function applyCode_(b, r) {
  b.code = r.code;
  b.codeId = r.codeId;
  b.codeFrom = r.from;
  b.codeTo = r.to;
}

function ttCode_(req) {
  auth_(req);
  if (!ttReady_()) fail_("bad", "Chưa kết nối khóa TTLock. Admin vào Cài đặt để kết nối.");
  var id = String(req.bookingId || "");
  var snap = JSON.parse(readData_() || "{}");
  var b0 = (snap.bookings || []).filter(function (x) { return x.id === id; })[0];
  if (!b0) fail_("bad", "Chưa tìm thấy đặt phòng này trên máy chủ. Hãy đợi đồng bộ rồi thử lại.");
  var r = ttMakeCode_(b0.startAt, b0.endAt, b0.name);
  mutateData_(function (d) {
    var b = (d.bookings || []).filter(function (x) { return x.id === id; })[0];
    if (b) applyCode_(b, r);
  });
  return { ok: true, code: r.code, from: r.from, to: r.to };
}

// Bộ hẹn giờ mỗi giờ: tạo mã cho đặt phòng sắp nhận (trong TT_LEAD_HOURS giờ tới) mà chưa có mã.
function tuTaoMaKhoa() {
  if (!ttReady_()) return;
  var snap = JSON.parse(readData_() || "{}");
  var now = Date.now();
  (snap.bookings || []).forEach(function (b0) {
    if (b0.code || !b0.startAt || !b0.endAt) return;
    var s = ttMs_(b0.startAt), e = ttMs_(b0.endAt);
    if (e <= now || s - now > TT_LEAD_HOURS * 3600000) return;
    try {
      var r = ttMakeCode_(b0.startAt, b0.endAt, b0.name);
      mutateData_(function (d) {
        var b = (d.bookings || []).filter(function (x) { return x.id === b0.id; })[0];
        if (b && !b.code) applyCode_(b, r);
      });
    } catch (err) {
      console.error("Không tạo được mã cho " + b0.id + ": " + err.message);
    }
  });
}

// Chạy một lần trong editor để bật tự tạo mã mỗi giờ (Google sẽ hỏi cấp quyền hẹn giờ).
function caiTuDongMaKhoa() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "tuTaoMaKhoa") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("tuTaoMaKhoa").timeBased().everyHours(1).create();
  Logger.log("Đã bật tự tạo mã vào cửa mỗi giờ.");
}
