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

var BUILD = "3.1";
var TOKEN_DAYS = 14;
var HASH_ROUNDS = 150;
var MAX_FAILS = 5;
// Kho Script Properties tối đa 500 KB. Tiếng Việt có dấu chiếm 2-3 byte mỗi ký tự, nên giới hạn thận trọng.
var MAX_DATA_CHARS = 90000;
var CHUNK = 3000;

// Mã bí mật nằm trong địa chỉ lịch iCal (?ics=MÃ) để Airbnb, Booking... đọc lịch. Đổi chuỗi này thì địa chỉ cũ ngừng hoạt động.
var ICS_TOKEN = "DOI-MA-LICH";

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
    if (req.since !== undefined && Number(req.since) === m.version) {
      return { ok: true, notModified: true, version: m.version };
    }
    var raw = readData_();
    return { ok: true, version: m.version, updatedAt: m.updatedAt, updatedBy: m.updatedBy, data: raw ? JSON.parse(raw) : null };
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

/* ---------- lịch iCal cho Airbnb, Booking ---------- */

// Chỉ xuất ngày bị chặn, không có tên, số điện thoại, giá hay ghi chú của khách.
function icsDate_(d) {
  return d.replace(/-/g, "");
}

function icsAddDay_(d) {
  var t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

function icsText_(token) {
  var bookings = [];
  var raw = readData_();
  if (raw) {
    try {
      bookings = JSON.parse(raw).bookings || [];
    } catch (err) {}
  }
  var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  var cut = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DearSunday//Lich//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Dear Sunday"];
  bookings.forEach(function (b) {
    if (!b || !b.id || !b.startAt || !b.endAt) return;
    var s = String(b.startAt).slice(0, 10);
    var e = String(b.endAt).slice(0, 10);
    if (e < cut) return;
    if (e <= s) e = icsAddDay_(s); // gói trong ngày chặn cả ngày đó
    L.push("BEGIN:VEVENT", "UID:" + String(b.id).replace(/[^A-Za-z0-9_-]/g, "") + "@dearsunday", "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + icsDate_(s), "DTEND;VALUE=DATE:" + icsDate_(e), "SUMMARY:Dear Sunday - da dat", "TRANSP:OPAQUE", "END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}

function ics_(token) {
  if (ICS_TOKEN === "DOI-MA-LICH" || token !== ICS_TOKEN) {
    return out_({ ok: false, service: "DearSunday", build: BUILD, error: "Địa chỉ lịch không đúng" });
  }
  return ContentService.createTextOutput(icsText_(token)).setMimeType(ContentService.MimeType.ICAL);
}

// Chạy trong editor để xem địa chỉ lịch cần dán vào Airbnb, Booking.
function layLinkLich() {
  Logger.log(ScriptApp.getService().getUrl() + "?ics=" + ICS_TOKEN);
}
