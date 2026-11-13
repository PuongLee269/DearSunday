const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let db={prices:{sunday:{gia:850000},night:{gia:600000}},tx:[]},meta={version:1},properties={},actor={username:'admin',role:'admin'};
const ctx={Date,JSON,Math,isFinite,MAX_DATA_CHARS:90000,
  auth_:(r,admin)=>{if(admin&&actor.role!=='admin')throw Error('admin only');return actor;},
  fail_:(c,m)=>{throw Error(m);},withLock_:fn=>fn(),readData_:()=>JSON.stringify(db),writeData_:raw=>db=JSON.parse(raw),
  meta_:()=>meta,setMeta_:v=>meta=v,props_:()=>({getProperty:k=>properties[k]||null,setProperty:(k,v)=>properties[k]=v}),
  extState_:()=>({events:[{src:'booking',s:'2026-12-11',e:'2026-12-13'}]}),
  Utilities:{formatDate:()=> '2026-11-13'}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/OtaFinance.gs','utf8'),ctx);
const cfg={airbnb:{percent:17.05,pkg:'sunday'},booking:{percent:20,pkg:'sunday'},agoda:{percent:20,pkg:'sunday'}};
ctx.otaSetConfig_({config:cfg});
let result=ctx.otaInfo_({}),r=result.rows[0];
assert.equal(r.quote.nights,2);assert.equal(r.quote.gross,1700000);assert.equal(r.quote.fee,340000);assert.equal(r.quote.net,1360000);
assert.equal(ctx.otaQuote_({...r,source:'airbnb'},db,cfg).net,1410150,'Airbnb fee: 17.05%');
let req={id:r.id,reference:'TEST-1',expectedNet:1360000,expectedNightly:850000,expectedPercent:20,expectedPkg:'sunday',actualAmount:1350000,receivedOn:'2026-11-13',realBooking:true,confirmed:true};
assert.throws(()=>ctx.otaReceive_({...req,confirmed:false}),/xác nhận/);
assert.throws(()=>ctx.otaReceive_({...req,receivedOn:'2026-11-14'}),/tương lai/);
assert.throws(()=>ctx.otaReceive_({...req,expectedNet:1}),/đã đổi/);
assert.equal(db.tx.length,0);
ctx.otaReceive_(req);ctx.otaReceive_(req);assert.equal(db.tx.length,1);assert.equal(db.tx[0].amt,1350000);
const receiptSnapshot=JSON.stringify(db.otaLedger[0].receipt);
db.prices.sunday.gia=900000;cfg.booking.percent=30;ctx.otaSetConfig_({config:cfg});
assert.equal(JSON.stringify(ctx.otaInfo_({}).rows[0].receipt),receiptSnapshot,'Price/config changes preserve old receipt snapshot');
let incoming={tx:[],otaLedger:[]};ctx.otaProtectSave_(incoming,db);assert.equal(incoming.tx.length,1);assert.equal(incoming.otaLedger.length,1);
actor={username:'staff',role:'staff'};assert.throws(()=>ctx.otaSetConfig_({config:cfg}),/admin only/);
assert.equal(ctx.otaQuote_({...r,source:'airbnb'},db,{}).net,null,'Unknown discount is not zero');
assert.equal(ctx.otaQuote_(r,{prices:{}},cfg).net,null,'Missing nightly price is not zero');
assert.equal(ctx.otaDay_('2026-02-30'),false);
ctx.otaAdd_({source:'agoda',reference:'AG-TEST',start:'2026-12-20',end:'2026-12-22'});
assert.equal(db.otaLedger.length,2);assert.throws(()=>ctx.otaAdd_({source:'agoda',reference:'AG-TEST',start:'2026-12-23',end:'2026-12-25'}),/đã có/);
assert.equal(db.bookings,undefined,'No booking/calendar changes');
console.log('PASS: nightly dates, fee math, admin access, missing config, atomic idempotent receipt, stale quote, actual cash, immutable history, manual Agoda, no calendar mutation');
