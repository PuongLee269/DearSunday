/* Kiểm thử giao diện web 3.7 bằng Playwright (không cần mạng).
   Chạy: node tests/check-web-3.7.cjs
   Hai chế độ máy chủ giả: "cu" (build 3.4/3.5: không Agoda, action mới trả unknown action) và "moi". */
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm'), cp = require('child_process');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const DOCS = process.env.DOCS_DIR || path.join(__dirname, '..', 'docs');
const API_HOST = 'script.google.com';
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) { passes++; console.log('  ok   ' + msg); } else { fails++; console.log('  FAIL ' + msg); } }

/* ---------- 1. kiểm cú pháp ---------- */
function syntax() {
  console.log('# cú pháp');
  fs.readdirSync(DOCS).filter(f => f.endsWith('.js')).forEach(f => {
    const r = cp.spawnSync('node', ['--check', path.join(DOCS, f)]);
    ok(r.status === 0, 'node --check docs/' + f + (r.status ? ' ' + r.stderr : ''));
  });
  const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const tmp = fs.mkdtempSync('/tmp/ds-blk-');
  blocks.forEach((m, i) => {
    const f = path.join(tmp, 'blk' + i + '.js'); fs.writeFileSync(f, m[1]);
    const r = cp.spawnSync('node', ['--check', f]);
    ok(r.status === 0, 'node --check khối <script> #' + (i + 1) + (r.status ? ' ' + r.stderr : ''));
  });
  /* trình xử lý notificationclick của service worker */
  const calls = []; const listeners = {};
  const sw = {
    addEventListener: (n, f) => { listeners[n] = f; }, importScripts(u) { if (/push-config/.test(u)) vm.runInContext(fs.readFileSync(path.join(DOCS, 'push-config.js'), 'utf8'), sw); }, firebase: { initializeApp() {}, messaging() {} },
    location: { origin: 'https://x.github.io' }, registration: { scope: 'https://x.github.io/DearSunday/' },
    clients: {
      matchAll: async () => [{ url: 'https://x.github.io/DearSunday/', focus: () => { calls.push('focus'); return 1; } }],
      openWindow: async u => { calls.push('open ' + u); }
    }, URL
  };
  sw.self = sw; vm.createContext(sw);
  vm.runInContext(fs.readFileSync(path.join(DOCS, 'firebase-messaging-sw.js'), 'utf8'), sw);
  ok(typeof listeners.notificationclick === 'function', 'service worker có notificationclick');
  if (!listeners.notificationclick) return;
  let waited, closed = false, stopped = false;
  listeners.notificationclick({ stopImmediatePropagation() { stopped = true; }, notification: { close() { closed = true; }, data: { url: 'https://evil.example/x' } }, waitUntil(p) { waited = p; } });
  return waited.then(() => {
    ok(closed && stopped && calls[0] === 'focus', 'notificationclick: đóng thông báo, focus cửa sổ app đang mở');
    sw.clients.matchAll = async () => [];
    listeners.notificationclick({ stopImmediatePropagation() {}, notification: { close() {}, data: { url: 'https://evil.example/x' } }, waitUntil(p) { waited = p; } });
    return waited;
  }).then(() => {
    ok(calls[1] === 'open https://x.github.io/DearSunday/', 'notificationclick: không có cửa sổ thì mở trang gốc, không mở link ngoài');
    listeners.notificationclick({ stopImmediatePropagation() {}, notification: { close() {}, data: { url: './?tab=fin' } }, waitUntil(p) { waited = p; } });
    return waited;
  }).then(() => ok(calls[2] === 'open https://x.github.io/DearSunday/?tab=fin', 'notificationclick: mở đúng url trong data.url cùng nguồn'));
}

/* ---------- 2. máy chủ tĩnh + API giả ---------- */
function staticServer() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(DOCS, p);
      if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('no'); return; }
      const ct = f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : f.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/octet-stream';
      rsp.writeHead(200, { 'content-type': ct, 'service-worker-allowed': '/' }); rsp.end(fs.readFileSync(f));
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const pad2 = n => String(n).padStart(2, '0');
const isoD = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const addD = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoD(d); };
const HR = 3600000;
const win = (s, e) => { const a = new Date(s + ':00+07:00').getTime(), b = new Date(e + ':00+07:00').getTime(); return { from: Math.floor(a / HR) * HR, to: Math.ceil((b + HR) / HR) * HR }; };

function makeData() {
  const s1 = addD(5) + 'T14:00', e1 = addD(6) + 'T11:00', w1 = win(s1, e1);
  return {
    plants: [{ id: 'p1', name: 'Trầu bà', days: 2 }], water: Date.now() - 72 * HR,
    toys: [{ id: 'o1', name: 'Jenga', empty: false, lost: false }],
    clean: { last: Date.now() - 30 * HR, tasks: [{ id: 'c1', text: 'Hút bụi', done: false }] },
    notes: [], todos: [],
    prices: { sunday: { gia: 850000, ghi: '' }, night: { gia: 600000, ghi: '' } },
    guests: [
      { id: 'gA', name: 'Khách A', phone: '0900000001', status: 'VERIFIED', ver: [], codes: [] },
      { id: 'gB', name: 'Khách B', phone: '0900000002', status: 'PENDING', ver: [], codes: [] }
    ],
    tx: [{ id: 't1', type: 'INCOME', cat: 'Tiền phòng', amt: 1000000, desc: 'Thanh toán đủ · Khách A', at: Date.now() - HR, bk: 'bk1' }],
    bookings: [
      { id: 'bk1', name: 'Khách A', phone: '0900000001', note: '', pkg: 'sunday', nights: 1, startAt: s1, endAt: e1, le: 0, price: 1000000, paidAmt: 1000000, code: '123456', codeId: 1, codeFrom: w1.from, codeTo: w1.to },
      { id: 'bk2', name: 'Khách X', phone: '', note: '', pkg: 'night', nights: 1, startAt: addD(-20) + 'T22:00', endAt: addD(-19) + 'T11:00', le: 0, price: 600000, paidAmt: 600000 }
    ]
  };
}

function fakeServer(mode, opt) {
  opt = opt || {};
  const st = { mode, data: opt.data || makeData(), version: 7, log: [], tt: opt.tt !== false, failSave: false, authFail: false, codeN: 100 };
  const unknown = { ok: false, error: 'unknown action', code: 'bad' };
  const MISSING = ['otaInfo', 'otaSetConfig', 'otaAdd', 'otaReceive', 'otaCancel', 'pushRegister', 'pushUnregister', 'pushInfo', 'pushTest'];
  st.handle = (body) => {
    st.log.push(body);
    const a = body.action;
    if (st.authFail && a !== 'login') return { ok: false, code: 'auth', error: 'Phiên hết hạn' };
    if (st.mode === 'cu' && MISSING.includes(a) && !(opt.otaInfoOld && (a === 'otaInfo'))) return unknown;
    switch (a) {
      case 'status': return { ok: true, hasUsers: true };
      case 'me': return { ok: true, user: 'admin', role: 'admin' };
      case 'login': return { ok: true, token: 'tok', user: 'admin', role: 'admin' };
      case 'load': {
        const ev = [{ src: 'airbnb', s: addD(10), e: addD(12) }, { src: 'booking', s: addD(14), e: addD(15) }];
        if (st.mode === 'moi' || opt.extraSrc) { ev.push({ src: 'agoda', s: addD(20), e: addD(22) }); ev.push({ src: 'vrbo', s: addD(25), e: addD(26) }); }
        const r = { ok: true, version: st.version, data: st.data, updatedAt: Date.now(), updatedBy: 'admin', tt: st.tt, extAt: 5 };
        if (!opt.noExt) r.ext = ev;
        return r;
      }
      case 'save': st.data = body.data; st.version++; return { ok: true, version: st.version, updatedAt: Date.now(), updatedBy: 'admin' };
      case 'listUsers': return { ok: true, users: [{ username: 'admin', role: 'admin', active: true }] };
      case 'ttInfo': return { ok: true, ready: true, hasClient: true, alias: 'Cửa', auto: true, locks: [] };
      case 'extInfo': return { ok: true, icsUrl: 'https://x', auto: true, sources: [{ id: 'airbnb', name: 'Airbnb', has: false }, { id: 'booking', name: 'Booking.com', has: false }].concat(st.mode === 'moi' ? [{ id: 'agoda', name: 'Agoda', has: false }] : []) };
      case 'ttCode': {
        const b = st.data.bookings.find(x => x.id === body.bookingId);
        if (!b) return { ok: false, error: 'Chưa tìm thấy đặt phòng' };
        const w = win(b.startAt, b.endAt);
        if (st.mode === 'moi' && b.code && b.codeFrom === w.from && b.codeTo === w.to) return { ok: true, code: b.code, from: b.codeFrom, to: b.codeTo };
        const old = b.code; b.code = String(++st.codeN) + '999'; b.codeFrom = w.from; b.codeTo = w.to; st.version++;
        const r = { ok: true, code: b.code, from: w.from, to: w.to };
        if (st.mode === 'moi' && old) { r.replaced = true; r.oldCode = old; }
        return r;
      }
      case 'otaInfo': return { ok: true, config: {}, rows: [{ id: 'ota:booking:2026-12-11:2026-12-13', source: 'booking', start: '2026-12-11', end: '2026-12-13', origin: 'ical', inCalendar: true, quote: { nights: 2, nightly: 850000, pkg: 'sunday', gross: 1700000, percent: 20, fee: 340000, net: 1360000 }, receipt: { amount: 1350000, receivedOn: '2026-11-13' } }] };
      case 'otaCancel': return { ok: true };
      case 'pushRegister': case 'pushUnregister': return { ok: true };
      case 'pushInfo': return { ok: true, items: [] };
      case 'changePassword': return { ok: true, token: 'tok2' };
    }
    return { ok: false, error: 'Không rõ yêu cầu', code: 'bad' };
  };
  return st;
}

const FB_APP = 'export function initializeApp(){return {}}';
const FB_MSG = 'export async function isSupported(){return true} export function getMessaging(){return {}} export async function getToken(){return "tok-new"} export function onMessage(){} export async function deleteToken(){return true}';

async function newPage(browser, base, st, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: o.w || 390, height: 800 }, serviceWorkers: 'allow', permissions: o.perm ? ['notifications'] : [] });
  const errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(base)) return route.continue();
    if (u.includes(API_HOST)) {
      let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) { }
      if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      if (st.failSave && body.action === 'save') return route.abort('failed');
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(st.handle(body)) });
    }
    if (u.includes('fonts.googleapis.com')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (u.includes('fonts.gstatic.com')) return route.abort();
    if (u.includes('firebase-app-compat.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'self.firebase={initializeApp:function(){},messaging:function(){}};' });
    if (u.includes('firebase-messaging-compat.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    if (u.includes('firebase-app.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FB_APP });
    if (u.includes('firebase-messaging.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FB_MSG });
    return route.abort();
  });
  const seed = Object.assign({ 'dearsunday-auth': JSON.stringify({ token: 'tok', user: 'admin', role: 'admin' }) }, o.ls || {});
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); Object.keys(s).forEach(k => localStorage.setItem(k, s[k])); } }, seed);
  if (o.perm) await ctx.addInitScript(() => { try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); } catch (e) { } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/index.html');
  await page.waitForFunction(() => document.querySelector('#syncChip') && /Đã đồng bộ/.test(document.querySelector('#syncChip').textContent), null, { timeout: 15000 });
  return { ctx, page, errors };
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const TABS = ['home', 'items', 'clean', 'guests', 'fin', 'notes', 'settings', 'account'];

/* ---------- 3. các nhóm kiểm ---------- */
async function groupLayout(browser, base, mode) {
  for (const w of [320, 390]) {
    console.log('# [' + mode + '] bố cục ' + w + 'px, không lỗi JS');
    const st = fakeServer(mode, { extraSrc: true });
    const { ctx, page, errors } = await newPage(browser, base, st, { w });
    for (const t of TABS) {
      if (t === 'account') await page.evaluate(() => show('account')); else await page.click('#tabs button[data-t="' + t + '"]');
      await page.waitForTimeout(150);
      const ov = await overflow(page);
      ok(ov <= 0, `tab ${t} không tràn ngang (${w}px, dư ${ov})`);
    }
    await page.click('#tabs button[data-t="guests"]');
    await page.click('[data-guest="gA"]'); await page.waitForTimeout(100);
    ok(await overflow(page) <= 0, 'chi tiết khách không tràn ngang');
    await page.click('#tabs button[data-t="home"]');
    await page.click('[data-newbk]'); await page.waitForTimeout(150);
    ok(await overflow(page) <= 0, 'khung đặt phòng không tràn ngang');
    await page.click('#bkCancel');
    await page.evaluate(() => notice('<b>Mã cửa cũ theo giờ cũ.</b> Tạo mã mới?', [{ k: 'new', t: 'Tạo mã mới', id: 'bk1' }, { k: 'ok', t: 'Để sau', ghost: 1 }]));
    const r = await page.evaluate(() => { const b = document.querySelector('#askBox').getBoundingClientRect(); return [b.left, b.right, innerWidth]; });
    ok(r[0] >= 0 && r[1] <= r[2] && await overflow(page) <= 0, 'hộp nhắc nằm gọn trong màn hình');
    await page.evaluate(() => hideNotice());
    ok(errors.length === 0, 'không có lỗi JS' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
}

async function groupExt(browser, base, mode) {
  console.log('# [' + mode + '] sự kiện nền tảng');
  let st = fakeServer(mode, { extraSrc: true });
  let { ctx, page, errors } = await newPage(browser, base, st);
  const names = await page.evaluate(() => extB().map(b => b.name));
  ok(names.includes('Khách đặt trên Agoda') && names.includes('Khách đặt trên Nền tảng'), 'Agoda và nền tảng lạ hiển thị: ' + names.join(', '));
  ok(await page.evaluate(() => /Nền tảng/.test(document.querySelector('#upList').textContent + document.querySelector('#calLegend').textContent)), 'danh sách/chú giải có tên chung "Nền tảng"');
  ok(errors.length === 0, 'không lỗi JS' + errors.join('|'));
  await ctx.close();
  /* dữ liệu EXT trong localStorage hỏng, máy chủ không trả ext */
  st = fakeServer(mode, { noExt: true });
  const bad = JSON.stringify({ at: 1, events: [null, 5, { src: 'agoda' }, { src: 'agoda', s: 'bad', e: 'bad' }, { src: 'zzz', s: addD(3), e: addD(4) }, { src: 'agoda', s: addD(8), e: addD(9) }] });
  ({ ctx, page, errors } = await newPage(browser, base, st, { ls: { 'dearsunday-ext': bad } }));
  const n = await page.evaluate(() => extB().length);
  ok(n === 2, 'EXT hỏng trong localStorage: bỏ qua mục hỏng, giữ 2 mục hợp lệ (có ' + n + ')');
  ok(errors.length === 0, 'EXT hỏng không gây lỗi JS' + errors.join('|'));
  await ctx.close();
  st = fakeServer(mode, { noExt: true });
  ({ ctx, page, errors } = await newPage(browser, base, st, { ls: { 'dearsunday-ext': '{not json' } }));
  ok(errors.length === 0, 'EXT không phải JSON: trang vẫn chạy');
  await ctx.close();
}

async function groupFinanceAndCode(browser, base, mode) {
  console.log('# [' + mode + '] tài chính khi sửa giá, mã cửa lệch giờ');
  const st = fakeServer(mode);
  const { ctx, page, errors } = await newPage(browser, base, st);
  const before = await page.evaluate(() => ({ tx: S.tx.length, paid: S.bookings[0].paidAmt }));
  await page.click('[data-bkedit="bk1"]');
  await page.fill('#bkPrice', '1200000');
  ok(/thiếu|Sửa giá không tự/.test(await page.textContent('#bkPayHint')), 'form báo sửa giá không tự ghi tiền');
  await page.click('#bkSave'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ tx: S.tx.length, paid: S.bookings[0].paidAmt, price: S.bookings[0].price }));
  ok(after.tx === before.tx && after.paid === before.paid && after.price === 1200000, 'sửa giá đặt phòng đã thu: không sinh giao dịch (tx ' + before.tx + '→' + after.tx + ')');
  ok(/Đã thu 1\.000\.000đ \/ giá 1\.200\.000đ — còn thiếu 200\.000đ/.test(await page.textContent('#upList')), 'thẻ đặt phòng nhắc "còn thiếu"');
  await page.click('[data-bkedit="bk1"]'); await page.fill('#bkPrice', '900000'); await page.click('#bkSave'); await page.waitForTimeout(300);
  ok(/dư 100\.000đ/.test(await page.textContent('#upList')) && await page.evaluate(() => S.tx.length) === before.tx, 'giá giảm: nhắc "dư", vẫn không tự hoàn tiền');
  ok(await page.locator('#upList [data-pay]').count() === 1, 'có nút Hoàn tiền dư để người dùng tự bấm');
  /* người dùng chủ động bấm "Thu nốt" thì mới có giao dịch */
  await page.click('[data-bkedit="bk1"]'); await page.fill('#bkPrice', '1200000'); await page.click('#bkSave'); await page.waitForTimeout(300);
  await page.click('#upList [data-pay]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => S.tx.length) === before.tx + 1, 'bấm Thu nốt mới tạo giao dịch');
  /* đổi giờ đặt phòng đã có mã */
  await page.evaluate(() => { const b = S.bookings[0]; b.price = 1000000; b.paidAmt = 1000000; save(); renderAll(); });
  ok(!(await page.textContent('#upList')).includes('Mã lệch giờ'), 'mã đúng giờ: không có nhãn "Mã lệch giờ"');
  await page.click('[data-bkedit="bk1"]');
  await page.click('[data-nights="1"]');
  await page.click('#bkSave'); await page.waitForTimeout(400);
  const askVisible = await page.isVisible('#askBox');
  ok(askVisible && /Mã cửa cũ theo giờ cũ\. Tạo mã mới\?/.test(await page.textContent('#askBox')), 'đổi giờ: hiện cảnh báo "Mã cửa cũ theo giờ cũ. Tạo mã mới?"');
  ok((await page.textContent('#upList')).includes('Mã lệch giờ') || (await page.textContent('#dayDetail')).includes('Mã lệch giờ'), 'thẻ đặt phòng có nhãn "Mã lệch giờ"');
  await page.click('#askBox [data-ask="new"]'); await page.waitForTimeout(800);
  const note = await page.textContent('#askBox');
  ok(/Mã cũ .*123456.* vẫn mở được cửa tới hết hạn \(không xóa từ xa được\)/.test(note), 'ghi chú mã cũ vẫn mở được cửa (' + (mode === 'moi' ? 'từ replaced/oldCode' : 'máy chủ cũ: tự so mã') + ')');
  await page.click('#askBox [data-ask="ok"]'); await page.waitForTimeout(400);
  ok(!(await page.textContent('#upList')).includes('Mã lệch giờ'), 'sau khi có mã mới: hết nhãn lệch giờ');
  ok(await page.evaluate(() => S.tx.length) === before.tx + 1, 'đổi giờ/tạo mã không tạo thêm giao dịch');
  ok(errors.length === 0, 'không lỗi JS' + errors.join('|'));
  await ctx.close();
}

async function groupForm(browser, base, mode) {
  console.log('# [' + mode + '] form đặt phòng: ngày trống, ô giá');
  const st = fakeServer(mode);
  const { ctx, page, errors } = await newPage(browser, base, st);
  await page.click('[data-newbk]');
  await page.click('[data-pkg="sunday"]');
  ok(await page.inputValue('#bkPrice') === '850000', 'chọn gói: tự điền giá gói');
  await page.fill('#bkPrice', ''); await page.waitForTimeout(150);
  ok(await page.inputValue('#bkPrice') === '', 'xóa trắng ô giá: không tự điền lại');
  await page.click('[data-nights="1"]'); await page.waitForTimeout(100);
  ok(await page.inputValue('#bkPrice') === '1700000', 'đổi số đêm: điền lại giá');
  await page.fill('#bkPrice', ''); await page.click('[data-pkg="night"]');
  ok(await page.inputValue('#bkPrice') === '600000', 'đổi gói: điền lại giá');
  const nb = await page.evaluate(() => S.bookings.length);
  await page.fill('#bkName', 'Khách Z');
  await page.fill('#bkDate', ''); await page.waitForTimeout(150);
  ok(/Chọn ngày/.test(await page.textContent('#bkWarn')) && await page.isDisabled('#bkSave'), 'xóa ngày: báo "Chọn ngày", nút lưu bị khóa');
  await page.evaluate(() => document.querySelector('#bkForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => S.bookings.length) === nb, 'xóa ngày: không lưu được');
  await page.fill('#bkDate', addD(40)); await page.waitForTimeout(100);
  ok(!(await page.isDisabled('#bkSave')), 'chọn lại ngày: lưu được');
  ok(errors.length === 0, 'không lỗi JS' + errors.join('|'));
  await ctx.close();
}

async function groupGuestCode(browser, base, mode) {
  console.log('# [' + mode + '] tab Khách hàng: mã khóa');
  let st = fakeServer(mode);
  let { ctx, page, errors } = await newPage(browser, base, st);
  await page.click('#tabs button[data-t="guests"]');
  await page.click('[data-guest="gB"]');
  const html = await page.content();
  ok(!/giả lập|id="cMail"|id="cFrom"|id="cLock"/.test(html), 'không còn ô/chữ giả lập (email, ID khóa, từ-đến)');
  await page.click('[data-guestcode="gB"]');
  ok(/Khách chưa có đặt phòng sắp tới — tạo mã trong đặt phòng/.test(await page.textContent('#toast')), 'khách không có đặt phòng: báo đúng câu');
  const codesBefore = await page.evaluate(() => JSON.stringify(S.guests.map(g => g.codes)));
  await page.click('[data-guest="gA"]');
  ok(await page.locator('[data-guestcode]').count() === 0 && /123456/.test(await page.textContent('#guestDetail')), 'khách có mã đúng giờ: hiện mã thật, không bắt tạo lại');
  /* khách có đặt phòng chưa có mã */
  await page.evaluate(() => { S.guests[1].name = 'Khách Y'; S.bookings.push({ id: 'bk3', name: 'Khách Y', phone: '', note: '', pkg: 'sunday', nights: 1, startAt: addDays(today(), 3) + 'T14:00', endAt: addDays(today(), 4) + 'T11:00', price: 0, paidAmt: 0 }); save(); renderAll(); });
  await page.waitForTimeout(1500);
  await page.click('[data-guest="gB"]');
  await page.click('[data-guestcode="gB"]'); await page.waitForTimeout(900);
  ok(st.log.some(b => b.action === 'ttCode' && b.bookingId === 'bk3'), 'bấm nút: gọi ttCode cho đặt phòng sắp tới của khách');
  ok(/\d{6,}/.test(await page.textContent('#guestDetail')) && st.data.bookings.find(b => b.id === 'bk3').code, 'mã thật từ máy chủ hiện ở thẻ khách');
  ok(await page.evaluate(() => JSON.stringify(S.guests.map(g => g.codes))) === codesBefore, 'không ghi mã giả vào dữ liệu khách');
  ok(errors.length === 0, 'không lỗi JS' + errors.join('|'));
  await ctx.close();
  /* chưa nối TTLock: ẩn */
  st = fakeServer(mode, { tt: false });
  ({ ctx, page, errors } = await newPage(browser, base, st));
  await page.click('#tabs button[data-t="guests"]'); await page.click('[data-guest="gA"]');
  ok(await page.locator('[data-guestcode], #guestDetail h3:has-text("Mã vào cửa")').count() === 0, 'chưa nối TTLock: khối mã bị ẩn');
  await ctx.close();
}

async function groupAgo(browser, base, mode) {
  console.log('# [' + mode + '] hàm ago');
  const st = fakeServer(mode);
  const { ctx, page, errors } = await newPage(browser, base, st);
  await page.click('#tabs button[data-t="items"]');
  ok(/Lần tưới gần nhất: 3 ngày trước/.test(await page.textContent('#plantsView')), 'tưới cây 72 giờ: "3 ngày trước"');
  await page.click('#tabs button[data-t="clean"]');
  ok(/Dọn lần cuối: 1 ngày trước/.test(await page.textContent('#cleanView')), 'dọn phòng 30 giờ: "1 ngày trước"');
  const r = await page.evaluate(() => [ago(0), ago(Date.now() - 5 * 60000), ago(Date.now() - 3 * 3600000), ago(Date.now() - 30000)]);
  ok(r.join('|') === 'chưa lần nào|5 phút trước|3 giờ trước|vừa xong', 'ago: ' + r.join(' | '));
  const dup = (fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8').match(/function ago\(/g) || []).length;
  ok(dup === 1, 'chỉ còn 1 khai báo hàm ago');
  ok(errors.length === 0, 'không lỗi JS');
  await ctx.close();
}

async function groupLogout(browser, base, mode) {
  console.log('# [' + mode + '] đăng xuất');
  let st = fakeServer(mode);
  let { ctx, page, errors } = await newPage(browser, base, st, { ls: { 'dearsunday-push-device': 'tok-old', 'dearsunday-push-device-user': 'admin', 'dearsunday-misc': '1' } });
  const keys0 = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('dearsunday')));
  ok(keys0.includes('dearsunday-ext') && keys0.includes('dearsunday-v2'), 'trước khi thoát có các khóa dearsunday*: ' + keys0.join(','));
  await page.click('#logoutBtn');
  await page.waitForFunction(() => !document.querySelector('#auth').hidden, null, { timeout: 15000 });
  const keys1 = await page.evaluate(() => Object.keys(localStorage).filter(k => k.toLowerCase().startsWith('dearsunday')));
  ok(keys1.length === 0, 'đăng xuất xóa hết khóa dearsunday* (còn: ' + keys1.join(',') + ')');
  ok(st.log.some(b => b.action === 'pushUnregister' && b.pushToken === 'tok-old'), 'gọi pushUnregister (lỗi máy chủ cũ vẫn bỏ qua)');
  ok(errors.length === 0, 'không lỗi JS' + errors.join('|'));
  await ctx.close();
  /* còn thay đổi chưa lưu, không đồng bộ được: hỏi xác nhận */
  st = fakeServer(mode);
  ({ ctx, page, errors } = await newPage(browser, base, st));
  st.failSave = true;
  await page.evaluate(() => { S.notes.push({ id: 'nx', text: 'chưa lưu', at: Date.now() }); save(); });
  const dlgs = [];
  page.once('dialog', async d => { dlgs.push(d.message()); await d.dismiss(); });
  await page.click('#logoutBtn'); await page.waitForTimeout(1500);
  ok(dlgs[0] === 'Còn thay đổi chưa lưu lên máy chủ, đăng xuất sẽ mất. Vẫn đăng xuất?', 'hỏi xác nhận đúng câu');
  ok(await page.evaluate(() => !!localStorage.getItem('dearsunday-v2') && document.querySelector('#auth').hidden), 'chọn Không: vẫn đăng nhập, dữ liệu còn');
  page.once('dialog', d => d.accept());
  await page.click('#logoutBtn');
  await page.waitForFunction(() => !document.querySelector('#auth').hidden, null, { timeout: 15000 });
  ok(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('dearsunday')).length) === 0, 'chọn Có: xóa sạch');
  await ctx.close();
  /* đồng bộ được thì không hỏi */
  st = fakeServer(mode);
  ({ ctx, page, errors } = await newPage(browser, base, st));
  await page.evaluate(() => { S.notes.push({ id: 'ny', text: 'sẽ lưu', at: Date.now() }); save(); });
  let asked = false; page.on('dialog', d => { asked = true; d.accept(); });
  await page.click('#logoutBtn');
  await page.waitForFunction(() => !document.querySelector('#auth').hidden, null, { timeout: 15000 });
  ok(!asked && st.data.notes.some(n => n.id === 'ny'), 'đồng bộ được: tự lưu lên máy chủ rồi thoát, không hỏi');
  await ctx.close();
  /* hết phiên: giữ dữ liệu chưa đồng bộ */
  st = fakeServer(mode);
  ({ ctx, page, errors } = await newPage(browser, base, st));
  st.authFail = true;
  await page.evaluate(() => { S.notes.push({ id: 'nz', text: 'giữ lại', at: Date.now() }); save(); });
  await page.waitForFunction(() => !document.querySelector('#auth').hidden, null, { timeout: 15000 });
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('dearsunday-v2') || 'null'));
  ok(kept && kept.notes.some(n => n.id === 'nz') && !(await page.evaluate(() => localStorage.getItem('dearsunday-auth'))), 'hết phiên (forceLogout): giữ dữ liệu chưa đồng bộ, chỉ bỏ phiên đăng nhập');
  await ctx.close();
}

async function groupOta(browser, base, mode) {
  console.log('# [' + mode + '] hủy xác nhận thu (OTA)');
  const st = fakeServer(mode, { otaInfoOld: true });
  const { ctx, page, errors } = await newPage(browser, base, st);
  await page.click('#tabs button[data-t="fin"]');
  await page.waitForSelector('[data-ota-cancel]', { timeout: 5000 });
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.click('[data-ota-cancel]'); await page.waitForTimeout(800);
  const req = st.log.filter(b => b.action === 'otaCancel')[0];
  ok(req && req.id === 'ota:booking:2026-12-11:2026-12-13' && req.token === 'tok', 'gửi otaCancel với token và id mục đối soát');
  ok(dialogs.length === 1, 'có hộp xác nhận trước khi hủy');
  if (mode === 'cu') ok(/Cần cập nhật máy chủ để dùng chức năng này/.test(await page.textContent('#otaStatus')), 'máy chủ cũ: báo "Cần cập nhật máy chủ..."');
  else ok(st.log.filter(b => b.action === 'otaInfo').length >= 2, 'máy chủ mới: tải lại sau khi hủy');
  ok(errors.length === 0, 'không lỗi JS' + errors.join('|'));
  await ctx.close();
}

async function groupPushRenew(browser, base) {
  console.log('# [moi] lấy lại token thông báo im lặng');
  const st = fakeServer('moi');
  const { ctx, page, errors } = await newPage(browser, base, st, { perm: true, ls: { 'dearsunday-push-device': 'tok-old', 'dearsunday-push-device-user': 'admin' } });
  const granted = await page.evaluate(() => Notification.permission);
  if (granted !== 'granted') { console.log('  skip (headless không cấp quyền thông báo: ' + granted + ')'); await ctx.close(); return; }
  await page.waitForTimeout(2500);
  const reg = st.log.filter(b => b.action === 'pushRegister');
  ok(reg.length === 1 && reg[0].pushToken === 'tok-new', 'token đổi: gửi pushRegister với token mới');
  ok(await page.evaluate(() => localStorage.getItem('dearsunday-push-device')) === 'tok-new', 'lưu token mới');
  ok(errors.length === 0, 'không lỗi JS' + errors.join('|'));
  await ctx.close();
}

(async () => {
  await syntax();
  const srv = await staticServer(); const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of (process.env.MODES||"cu,moi").split(",")) {
      console.log('\n===== MÁY CHỦ GIẢ: ' + (mode === 'cu' ? 'CŨ (3.4/3.5)' : 'MỚI') + ' =====');
      await groupLayout(browser, base, mode);
      await groupExt(browser, base, mode);
      await groupFinanceAndCode(browser, base, mode);
      await groupForm(browser, base, mode);
      await groupGuestCode(browser, base, mode);
      await groupAgo(browser, base, mode);
      await groupLogout(browser, base, mode);
      await groupOta(browser, base, mode);
    }
    await groupPushRenew(browser, base);
  } catch (e) { fails++; console.log('FAIL ngoại lệ: ' + (e.stack || e)); }
  await browser.close(); srv.close();
  console.log(`\nKết quả: ${passes} đạt, ${fails} lỗi`);
  process.exit(fails ? 1 : 0);
})();
