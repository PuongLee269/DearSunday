const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict');
const DIR=__dirname+'/../apps-script/';
const SRC={Code:fs.readFileSync(DIR+'Code.gs','utf8'),Push:fs.readFileSync(DIR+'Push.gs','utf8'),Ota:fs.readFileSync(DIR+'OtaFinance.gs','utf8')};
const sb=b=>Array.from(b).map(x=>x>127?x-256:x);
function makeEnv(order){
  const props={},cache={};
  const env={props,fetchLog:[],fetch:null,tt:{calls:0,codeSeq:1000,expireOnce:0}};
  const out=s=>({s,mime:null,setMimeType(m){this.mime=m;return this;},getContent(){return this.s;}});
  const ctx={console:{error(){},log(){}},Date,JSON,Math,isFinite,Object,Array,String,Number,Error,RegExp,parseInt,
    Logger:{log(){}},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:k=>k in props?props[k]:null,getProperties:()=>Object.assign({},props),
      setProperty:(k,v)=>{props[k]=String(v);},setProperties:(o)=>{for(const k in o)props[k]=String(o[k]);},
      deleteProperty:k=>{delete props[k];}})},
    LockService:{getScriptLock:()=>({waitLock(){},tryLock(){return true;},releaseLock(){}})},
    CacheService:{getScriptCache:()=>({get:k=>k in cache?cache[k]:null,put:(k,v)=>{cache[k]=String(v);},remove:k=>{delete cache[k];}})},
    ContentService:{createTextOutput:out,MimeType:{JSON:'json',ICAL:'ical'}},
    ScriptApp:{getService:()=>({getUrl:()=>'https://script.google.com/macros/s/TEST/exec'}),getProjectTriggers:()=>[],getOAuthToken:()=>'x'},
    UrlFetchApp:{fetch:(url,opt)=>{env.fetchLog.push(url);return env.fetch(url,opt);}},
    Utilities:{
      DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
      computeDigest:(a,s)=>sb(crypto.createHash(a).update(s,'utf8').digest()),
      computeHmacSha256Signature:(s,k)=>sb(crypto.createHmac('sha256',k).update(s).digest()),
      base64EncodeWebSafe:x=>(typeof x==='string'?Buffer.from(x,'utf8'):Buffer.from(x.map(v=>v&255))).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),
      base64DecodeWebSafe:s=>sb(Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64')),
      newBlob:b=>({getDataAsString:()=>Buffer.from(b.map(v=>v&255)).toString('utf8')}),
      getUuid:()=>crypto.randomUUID(),
      formatDate:(d)=>new Date(d.getTime()+7*3600000).toISOString().slice(0,10)}};
  vm.createContext(ctx);
  order.forEach(n=>vm.runInContext(SRC[n],ctx,{filename:n+'.gs'}));
  env.ctx=ctx;
  env.get=p=>JSON.parse(ctx.doGet({parameter:p||{}}).s);
  env.post=o=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(o)}}).s);
  env.data=()=>JSON.parse(ctx.readData_()||'null');
  return env;
}
function bootUsers(env){
  env.ctx.addUser_('admin','secret1','admin');env.ctx.addUser_('staff','secret2','staff');
  env.admin=env.post({action:'login',username:'admin',password:'secret1'}).token;
  env.staff=env.post({action:'login',username:'staff',password:'secret2'}).token;
  assert.ok(env.admin&&env.staff,'login');
}
function save(env,tok,data){
  const m=env.post({action:'load',token:tok});
  const r=env.post({action:'save',token:tok,baseVersion:m.version,data});
  assert.equal(r.ok,true,'save '+JSON.stringify(r));return r;
}
const BK=()=>({prices:{sunday:{gia:850000},night:{gia:600000}},tx:[],bookings:[{id:'b1',name:'Nguyen Van A',phone:'0912345678',price:777777,startAt:'2026-12-20T14:00',endAt:'2026-12-21T11:00',pkg:'sunday'}]});

// (i) thứ tự nạp
for(const order of [['Code','Push','Ota'],['Ota','Push','Code'],['Code']]){
  const label=order.join('→'),e=makeEnv(order),full=order.length===3;
  assert.equal(e.get().ok,true,label+' doGet');assert.equal(e.get().build,'3.7');
  assert.equal(e.post({action:'status'}).ok,true);
  bootUsers(e);
  save(e,e.admin,BK());
  assert.equal(e.post({action:'load',token:e.staff}).data.bookings.length,1,label+' load');
  const o=e.post({action:'otaInfo',token:e.staff}),p=e.post({action:'pushInfo',token:e.staff});
  if(full){assert.equal(o.ok,true,label+' ota');assert.equal(p.ok,true,label+' push');}
  else{assert.equal(o.code,'missing',label);assert.equal(o.ok,false);assert.match(o.error,/thiếu phần OtaFinance/);
       assert.equal(p.code,'missing');assert.match(p.error,/Push\.gs/);
       assert.equal(e.post({action:'otaCancel',token:e.admin,id:'x'}).code,'missing');}
  assert.equal(e.post({action:'constructor'}).code,'bad','prototype action blocked');
  console.log('ok i ',label);
}
// chỉ Code.gs: đồng bộ lịch ngoài không sập
{const e=makeEnv(['Code']);bootUsers(e);save(e,e.admin,BK());
 e.ctx.props_().setProperty('EXT_SRC',JSON.stringify({agoda:'https://x.example/a.ics'}));
 e.fetch=()=>({getResponseCode:()=>200,getContentText:()=>'BEGIN:VCALENDAR\r\nEND:VCALENDAR'});
 assert.equal(e.post({action:'syncExt',token:e.admin}).ok,true,'syncExt chỉ Code.gs');}

// (ii) ttCode_
function ttEnv(){
  const e=makeEnv(['Code','Push','Ota']);bootUsers(e);save(e,e.admin,BK());
  e.ctx.ttSetCfg_({clientId:'c',clientSecret:'s',username:'u',pwdMd5:'p',lockId:1,ver:4});
  let n=0;
  e.fetch=(url,opt)=>{
    const body=o=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(o)});
    if(url.indexOf('/oauth2/token')>0)return body({access_token:'AT',expires_in:7200});
    if(url.indexOf('/keyboardPwd/get')>0){n++;e.tt.calls=n;
      if(e.tt.expireOnce){e.tt.expireOnce--;e.tt.tokenFail=(e.tt.tokenFail||0)+1;return body({errcode:e.tt.errcode});}
      return body({keyboardPwd:String(100000+n),keyboardPwdId:n});}
    return body({});};
  return e;
}
{const e=ttEnv();
 const a=e.post({action:'ttCode',token:e.staff,bookingId:'b1'}),b=e.post({action:'ttCode',token:e.staff,bookingId:'b1'});
 assert.equal(a.ok,true);assert.equal(a.code,'100001');assert.equal(b.code,'100001');assert.equal(e.tt.calls,1,'TTLock chỉ gọi 1 lần');
 assert.equal(a.replaced,undefined);assert.equal(b.from,a.from);
 // đổi giờ
 const d=e.data();d.bookings[0].endAt='2026-12-22T11:00';save(e,e.admin,d);
 const c=e.post({action:'ttCode',token:e.staff,bookingId:'b1'});
 assert.equal(c.replaced,true);assert.equal(c.oldCode,'100001');assert.equal(c.code,'100002');assert.equal(e.tt.calls,2);
 assert.equal(e.data().bookings[0].code,'100002');assert.equal(e.data().bookings[0].codeTo,c.to);
 assert.equal(e.post({action:'ttCode',token:e.staff,bookingId:'b1'}).code,'100002');assert.equal(e.tt.calls,2);
 console.log('ok ii');
 // (c) errcode 10003/10004 làm mới token và thử lại
 for(const code of [10003,10004]){
   const f=ttEnv();f.tt.expireOnce=1;f.tt.errcode=code;
   const r=f.post({action:'ttCode',token:f.staff,bookingId:'b1'});
   assert.equal(r.ok,true,'errcode '+code+JSON.stringify(r));assert.equal(f.tt.calls,2);
 }
 console.log('ok 10003/10004');}

// (iii) otaCancel
{const e=makeEnv(['Code','Push','Ota']);bootUsers(e);save(e,e.admin,BK());
 const cfg={airbnb:{percent:17,pkg:'sunday'},booking:{percent:20,pkg:'sunday'},agoda:{percent:20,pkg:'sunday'}};
 assert.equal(e.post({action:'otaSetConfig',token:e.admin,config:cfg}).ok,true);
 assert.equal(e.post({action:'otaAdd',token:e.staff,source:'agoda',reference:'AG1',start:'2026-12-20',end:'2026-12-22'}).ok,true);
 const row=e.post({action:'otaInfo',token:e.staff}).rows[0],q=row.quote;
 const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
 const rc=e.post({action:'otaReceive',token:e.staff,id:row.id,reference:'AG1',expectedNet:q.net,expectedNightly:q.nightly,expectedPercent:q.percent,expectedPkg:q.pkg,actualAmount:q.net,receivedOn:today,realBooking:true,confirmed:true});
 assert.equal(rc.ok,true,JSON.stringify(rc));assert.equal(e.data().tx.length,1);
 assert.equal(e.post({action:'otaCancel',token:e.staff,id:row.id}).code,'forbidden');
 assert.equal(e.data().tx.length,1);
 // client cũ còn giữ giao dịch thu
 const stale=e.data();
 assert.equal(e.post({action:'otaCancel',token:e.admin,id:row.id}).ok,true);
 assert.equal(e.data().tx.length,0,'giao dịch thu bị xóa');
 assert.equal(e.data().otaLedger[0].receipt,undefined);
 assert.equal(e.post({action:'otaCancel',token:e.admin,id:'nope'}).ok,false);
 save(e,e.admin,stale);
 assert.equal(e.data().tx.length,0,'save chung không khôi phục');assert.equal(e.data().otaLedger[0].receipt,undefined);
 // xác nhận lại được
 assert.equal(e.post({action:'otaReceive',token:e.staff,id:row.id,reference:'AG1',expectedNet:q.net,expectedNightly:q.nightly,expectedPercent:q.percent,expectedPkg:q.pkg,actualAmount:q.net,receivedOn:today,realBooking:true,confirmed:true}).ok,true);
 assert.equal(e.data().tx.length,1);
 console.log('ok iii');}

// (iv) icsDay_
{const e=makeEnv(['Code']),f=e.ctx.icsDay_;
 assert.equal(f('20261220T170000Z'),'2026-12-21');assert.equal(f('20261220T100000Z'),'2026-12-20');
 assert.equal(f('20261231T180000Z'),'2027-01-01');
 assert.equal(f('20261220'),'2026-12-20');assert.equal(f('20261220T170000'),'2026-12-20');assert.equal(f(''),'');
 console.log('ok iv');}

// (v) fetchExt_ lỗi không lộ URL; (vi) đọc lịch agoda
{const e=makeEnv(['Code','Push','Ota']);bootUsers(e);save(e,e.admin,BK());
 const URL_='https://secret.example/ical/SECRETTOKEN.ics';
 e.ctx.props_().setProperty('EXT_SRC',JSON.stringify({agoda:URL_}));
 e.ctx.props_().setProperty('PUSH_BASE_booking','[]');
 e.fetch=()=>{throw new Error('Address unavailable: '+URL_);};
 const r=e.post({action:'syncExt',token:e.admin});
 assert.equal(r.ok,true);
 const rec=e.ctx.props_().getProperty('EXT_agoda');
 assert.ok(!rec.includes('secret')&&!rec.includes('SECRETTOKEN'),'URL không vào rec.err');
 assert.ok(!JSON.stringify(r).includes('SECRETTOKEN'));assert.match(JSON.parse(rec).err,/Không tải được lịch/);
 // agoda hợp lệ, giờ UTC
 const d0=new Date(Date.now()+30*86400000),d1=new Date(Date.now()+32*86400000);
 const ymd=d=>d.toISOString().slice(0,10).replace(/-/g,'');
 const ics='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:ag-1\r\nSUMMARY:Agoda booking\r\nDTSTART;VALUE=DATE:'+ymd(d0)+'\r\nDTEND;VALUE=DATE:'+ymd(d1)+'\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:ag-2\r\nDTSTART:'+ymd(d1)+'T170000Z\r\nDTEND:'+ymd(d1)+'T180000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
 e.fetch=()=>({getResponseCode:()=>200,getContentText:()=>ics});
 e.ctx.props_().setProperty('PUSH_BASE_agoda','[]');
 const s=e.post({action:'syncExt',token:e.admin});assert.equal(s.ok,true);
 const ld=e.post({action:'load',token:e.staff});
 const ag=ld.ext.filter(x=>x.src==='agoda');
 assert.equal(ag.length,2);assert.equal(ag[0].s,d0.toISOString().slice(0,10));assert.equal(ag[0].e,d1.toISOString().slice(0,10));
 const nxt=new Date(d1.getTime()+86400000).toISOString().slice(0,10);
 assert.ok(ag.some(x=>x.s===nxt),'UTC 17:00 → ngày +1');
 // (f) tắt nguồn xóa PUSH_BASE_
 assert.ok(e.ctx.props_().getProperty('PUSH_BASE_agoda')!==null);
 e.post({action:'setExt',token:e.admin,sources:[{id:'agoda',url:''}]});
 assert.equal(e.ctx.props_().getProperty('PUSH_BASE_agoda'),null,'PUSH_BASE_ bị xóa');
 assert.equal(e.ctx.props_().getProperty('EXT_agoda'),null);
 console.log('ok v vi f');}

// (vii) ?cal=1 và ?ics không lộ riêng tư
{const e=makeEnv(['Code','Push','Ota']);bootUsers(e);save(e,e.admin,BK());
 const d=e.data();d.bookings[0].code='654321';d.bookings[0].codeFrom=1;d.bookings[0].note='ghi chu rieng';save(e,e.admin,d);
 const tok=e.ctx.icsToken_();
 const cal=e.ctx.doGet({parameter:{cal:'1'}}).s,ics=e.ctx.doGet({parameter:{ics:tok}}).s;
 for(const [n,t] of [['cal',cal],['ics',ics]])for(const bad of ['Nguyen','0912345678','777777','654321','ghi chu','850000'])assert.ok(!t.includes(bad),n+' lộ '+bad);
 assert.ok(ics.includes('BEGIN:VCALENDAR')&&ics.includes('2026-12-20'.replace(/-/g,'')),'ics có ngày');
 assert.equal(JSON.parse(cal).ok,true);
 assert.equal(JSON.parse(e.ctx.doGet({parameter:{ics:tok.slice(0,-1)+'0'}}).s).ok,false,'sai token');
 assert.equal(e.ctx.doGet({parameter:{ics:tok+'x'}}).s.includes('VCALENDAR'),false);
 console.log('ok vii');}

// (d) throttle: vẫn khóa sau MAX_FAILS
{const e=makeEnv(['Code']);bootUsers(e);let r;
 for(let i=0;i<5;i++)assert.equal(e.post({action:'login',username:'admin',password:'bad'}).code,'login');
 assert.equal(e.post({action:'login',username:'admin',password:'secret1'}).code,'locked');
 console.log('ok d');}
console.log('PASS: check-server-3.7');
