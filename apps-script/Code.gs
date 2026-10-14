/**
 * DearSunday Homestay - máy chủ đồng bộ (Google Apps Script gắn với 1 Google Sheet).
 *
 * - Tài khoản do Admin cấp. Mật khẩu được băm (muối + SHA-256 nhiều vòng), không lưu mật khẩu gốc.
 * - Phiên đăng nhập là token ký HMAC, hết hạn sau TOKEN_DAYS ngày, mất hiệu lực khi đổi mật khẩu hoặc khóa tài khoản.
 * - Quyền Admin được kiểm tra ở đây (phía máy chủ) cho mọi thao tác quản trị.
 * - Dữ liệu cả homestay là 1 JSON, lưu trong sheet "Data" (cắt nhiều dòng vì mỗi ô tối đa 50.000 ký tự).
 *
 * Cách triển khai: xem apps-script/README.md
 */

// Đổi chuỗi này trước khi triển khai. Chỉ dùng 1 lần, để tạo tài khoản Admin đầu tiên.
var SETUP_CODE = "DOI-MA-NAY";

var TOKEN_DAYS = 14;
var HASH_ROUNDS = 150;
var MAX_FAILS = 5;
var MAX_DATA_CHARS = 1500000;
var CHUNK = 40000;
var BACKUP_EVERY_MS = 60 * 60 * 1000;

var SH_USERS = "Users";
var SH_DATA = "Data";
var SH_BACKUP = "Backup";
var USER_HEADER = ["username", "salt", "hash", "role", "active", "created"];

function doGet() {
  return out_({ ok: true, service: "DearSunday", hint: "Ứng dụng gọi bằng POST" });
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
    return out_({ ok: false, error: "Lỗi máy chủ", code: "server" });
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
  deleteUser: deleteUser_
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

function sheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (header) sh.appendRow(header);
  }
  return sh;
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
  var p = PropertiesService.getScriptProperties();
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

function readUsers_() {
  var sh = sheet_(SH_USERS, USER_HEADER);
  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0]) continue;
    out.push({
      row: i + 1,
      username: String(r[0]),
      salt: String(r[1]),
      hash: String(r[2]),
      role: String(r[3]),
      active: r[4] === true || String(r[4]).toLowerCase() === "true",
      created: r[5]
    });
  }
  return out;
}

function findUser_(name) {
  name = norm_(name);
  var users = readUsers_();
  for (var i = 0; i < users.length; i++) if (users[i].username === name) return users[i];
  return null;
}

function addUser_(name, pw, role) {
  var salt = Utilities.getUuid();
  sheet_(SH_USERS, USER_HEADER).appendRow([name, salt, hash_(salt, pw), role, true, new Date()]);
  return findUser_(name);
}

function publicUser_(u) {
  return { username: u.username, role: u.role, active: u.active, created: u.created ? new Date(u.created).getTime() : null };
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
    return { ok: true, token: makeToken_(u), user: u.username, role: u.role };
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
  return { ok: true, token: makeToken_(u), user: u.username, role: u.role };
}

function me_(req) {
  var u = auth_(req);
  return { ok: true, user: u.username, role: u.role };
}

function changePassword_(req) {
  var u = auth_(req);
  if (hash_(u.salt, String(req.oldPassword || "")) !== u.hash) fail_("login", "Mật khẩu hiện tại không đúng");
  checkPass_(req.newPassword);
  return withLock_(function () {
    return { ok: true, token: setPass_(u, String(req.newPassword)) };
  });
}

function setPass_(u, pw) {
  var salt = Utilities.getUuid();
  var h = hash_(salt, pw);
  var sh = sheet_(SH_USERS, USER_HEADER);
  sh.getRange(u.row, 2, 1, 2).setValues([[salt, h]]);
  return makeToken_({ username: u.username, hash: h });
}

/* ---------- dữ liệu ---------- */

function meta_() {
  var raw = PropertiesService.getScriptProperties().getProperty("META");
  return raw ? JSON.parse(raw) : { version: 0, updatedAt: null, updatedBy: null };
}

function setMeta_(m) {
  PropertiesService.getScriptProperties().setProperty("META", JSON.stringify(m));
}

function readChunks_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 1) return null;
  var vals = sh.getRange(1, 1, last, 1).getValues();
  var s = vals
    .map(function (r) {
      return String(r[0]).slice(1);
    })
    .join("");
  return s || null;
}

function writeChunks_(name, str) {
  var sh = sheet_(name);
  sh.clearContents();
  var parts = [];
  for (var i = 0; i < str.length; i += CHUNK) parts.push(["D" + str.slice(i, i + CHUNK)]);
  if (!parts.length) return;
  var range = sh.getRange(1, 1, parts.length, 1);
  range.setNumberFormat("@");
  range.setValues(parts);
}

function backupIfDue_(oldStr) {
  var props = PropertiesService.getScriptProperties();
  var at = Number(props.getProperty("BACKUP_AT") || 0);
  if (Date.now() - at < BACKUP_EVERY_MS) return;
  writeChunks_(SH_BACKUP, oldStr);
  props.setProperty("BACKUP_AT", String(Date.now()));
}

function load_(req) {
  auth_(req);
  var m = meta_();
  if (req.since !== undefined && Number(req.since) === m.version) {
    return { ok: true, notModified: true, version: m.version };
  }
  var raw = readChunks_(SH_DATA);
  return { ok: true, version: m.version, updatedAt: m.updatedAt, updatedBy: m.updatedBy, data: raw ? JSON.parse(raw) : null };
}

function save_(req) {
  var u = auth_(req);
  if (!req.data || typeof req.data !== "object") fail_("bad", "Thiếu dữ liệu");
  var str = JSON.stringify(req.data);
  if (str.length > MAX_DATA_CHARS) fail_("big", "Dữ liệu quá lớn");
  return withLock_(function () {
    var m = meta_();
    if (Number(req.baseVersion) !== m.version) {
      var cur = readChunks_(SH_DATA);
      return { ok: false, conflict: true, version: m.version, updatedAt: m.updatedAt, updatedBy: m.updatedBy, data: cur ? JSON.parse(cur) : null };
    }
    var old = readChunks_(SH_DATA);
    if (old) backupIfDue_(old);
    writeChunks_(SH_DATA, str);
    var next = { version: m.version + 1, updatedAt: Date.now(), updatedBy: u.username };
    setMeta_(next);
    return { ok: true, version: next.version, updatedAt: next.updatedAt, updatedBy: next.updatedBy };
  });
}

/* ---------- quản trị tài khoản (chỉ Admin) ---------- */

function listUsers_(req) {
  auth_(req, true);
  return { ok: true, users: readUsers_().map(publicUser_) };
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
    return { ok: true, users: readUsers_().map(publicUser_) };
  });
}

function setPassword_(req) {
  var me = auth_(req, true);
  var target = findUser_(req.username);
  if (!target) fail_("bad", "Không tìm thấy tài khoản");
  checkPass_(req.password);
  return withLock_(function () {
    var token = setPass_(target, String(req.password));
    var res = { ok: true, users: readUsers_().map(publicUser_) };
    if (target.username === me.username) res.token = token;
    return res;
  });
}

function setRole_(req) {
  var me = auth_(req, true);
  var target = findUser_(req.username);
  if (!target) fail_("bad", "Không tìm thấy tài khoản");
  var role = req.role === "admin" ? "admin" : "staff";
  return withLock_(function () {
    if (target.role === "admin" && role !== "admin" && activeAdmins_().length <= 1) {
      fail_("bad", "Phải còn ít nhất 1 Admin đang hoạt động");
    }
    sheet_(SH_USERS, USER_HEADER).getRange(target.row, 4).setValue(role);
    return { ok: true, users: readUsers_().map(publicUser_) };
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
    sheet_(SH_USERS, USER_HEADER).getRange(target.row, 5).setValue(active);
    return { ok: true, users: readUsers_().map(publicUser_) };
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
    sheet_(SH_USERS, USER_HEADER).deleteRow(target.row);
    return { ok: true, users: readUsers_().map(publicUser_) };
  });
}
