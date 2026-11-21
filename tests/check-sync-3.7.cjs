const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict');
const DIR=__dirname+'/../apps-script/';
const SRC={Code:fs.readFileSync(DIR+'Code.gs','utf8'),Push:fs.readFileSync(DIR+'Push.gs','utf8'),Ota:fs.readFileSync(DIR+'OtaFinance.gs','utf8')};
const H=3600000,MIN=60000;
let NOW=Date.UTC(2026,11,1,3,0,0);
class FD extends Date{constructor(...a){if(a.length===0)super(NOW);else super(...a);}static now(){return NOW;}}
const sb=b=>Array.from(b).map(x=>x>127?x-256:x);
function makeEnv(order){
  order=order||['Code','Push','Ota'];
  const props={},cache={},env={props,fetch:null};
  const out=s=>({s,getContent(){return this.s;},setMimeType(){return this;}});
  const ctx={console:{error(){},log(){}},Date:FD,JSON,Math,isFinite,Object,Array,String,Number,Error,RegExp,parseInt,Logger:{log(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k in props?props[k]:null,getProperties:()=>Object.assign({},props),
      setProperty:(k,v)=>{props[k]=String(v);},setProperties:o=>{for(const k in o)props[k]=String(o[k]);},deleteProperty:k=>{delete props[k];}})},
    LockService:{getScriptLock:()=>({waitLock(){},tryLock(){return true;},releaseLock(){}})},
    CacheService:{getScriptCache:()=>({get:k=>k in cache?cache[k]:null,put:(k,v)=>{cache[k]=String(v);},remove:k=>{delete cache[k];}})},
    ContentService:{createTextOutput:out,MimeType:{JSON:'json',ICAL:'ical'}},
    ScriptApp:{getService:()=>({getUrl:()=>'https://script.google.com/macros/s/TEST/exec'}),getProjectTriggers:()=>[],getOAuthToken:()=>'x'},
    UrlFetchApp:{fetch:(u,o)=>env.fetch(u,o)},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
      computeDigest:(a,s)=>sb(crypto.createHash(a).update(s,'utf8').digest()),
      computeHmacSha256Signature:(s,k)=>sb(crypto.createHmac('sha256',k).update(s).digest()),
      base64EncodeWebSafe:x=>(typeof x==='string'?Buffer.from(x,'utf8'):Buffer.from(x.map(v=>v&255))).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),
      base64DecodeWebSafe:s=>sb(Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64')),
      newBlob:b=>({getDataAsString:()=>Buffer.from(b.map(v=>v&255)).toString('utf8')}),
      getUuid:()=>crypto.randomUUID(),formatDate:d=>new Date(d.getTime()+7*H).toISOString().slice(0,10)}};
  vm.createContext(ctx);order.forEach(n=>vm.runInContext(SRC[n],ctx,{filename:n+'.gs'}));
  env.ctx=ctx;env.post=o=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(o)}}).s);
  env.data=()=>JSON.parse(ctx.readData_()||'null');
  ctx.addUser_('admin','secret1','admin');env.admin=env.post({action:'login',username:'admin',password:'secret1'}).token;
  assert.ok(env.admin);
  env.saveBk=list=>{const m=env.post({action:'load',token:env.admin});
    const d=env.data()||{prices:{sunday:{gia:850000},night:{gia:600000}},tx:[],bookings:[]};d.bookings=list;
    const r=env.post({action:'save',token:env.admin,baseVersion:m.version,data:d});assert.equal(r.ok,true,JSON.stringify(r));};
  env.ics=()=>ctx.doGet({parameter:{ics:ctx.icsToken_()}}).s;
  env.state=()=>ctx.extState_();
  env.pushes=t=>Object.keys(props).filter(k=>k.indexOf('PUSH_EVENT_')===0).map(k=>JSON.parse(props[k])).filter(e=>!t||e.title.indexOf(t)===0);
  return env;
}
const ymd=d=>d.replace(/-/g,'');
const addD=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const rangesOf=txt=>{const r=[];const re=/DTSTART;VALUE=DATE:(\d{8})\r\nDTEND;VALUE=DATE:(\d{8})/g;let m;
  while((m=re.exec(txt)))r.push([m[1].replace(/(\d{4})(\d\d)(\d\d)/,'$1-$2-$3'),m[2].replace(/(\d{4})(\d\d)(\d\d)/,'$1-$2-$3')]);return r;};
const days=rs=>{const o=new Set();rs.forEach(([s,e])=>{for(let d=s;d<e;d=addD(d,1))o.add(d);});return o;};
const toRanges=set=>{const a=[...set].sort(),out=[];a.forEach(d=>{const l=out[out.length-1];if(l&&l[1]===d)l[1]=addD(d,1);else out.push([d,addD(d,1)]);});return out;};

// nền tảng mô phỏng: đọc lịch app (và lịch nền tảng khác nếu nối trực tiếp) sau mỗi 'period' giờ rồi xuất lại ngày bận
class Plat{
  constructor(id,o){this.id=id;this.ownSum=o.ownSum;this.impSum=o.impSum;this.period=o.period*H;this.readsApp=o.readsApp!==false;this.link=o.link||null;
    this.own=[];this.imp=new Set();this.last=NOW;this.desc=o.desc||'';}
  ownDays(){return days(this.own);}
  export(){
    const L=['BEGIN:VCALENDAR','VERSION:2.0'];let n=0;
    this.own.forEach(([s,e])=>L.push('BEGIN:VEVENT','UID:own-'+this.id+'-'+(n++),'DTSTART;VALUE=DATE:'+ymd(s),'DTEND;VALUE=DATE:'+ymd(e),'SUMMARY:'+this.ownSum,...(this.desc?['DESCRIPTION:'+this.desc]:[]),'END:VEVENT'));
    toRanges(this.imp).forEach(([s,e])=>L.push('BEGIN:VEVENT','UID:blk-'+this.id+'-'+(n++),'DTSTART;VALUE=DATE:'+ymd(s),'DTEND;VALUE=DATE:'+ymd(e),'SUMMARY:'+this.impSum,'END:VEVENT'));
    L.push('END:VCALENDAR');return L.join('\r\n')+'\r\n';}
  read(appFeed){
    const od=this.ownDays(),imp=new Set();
    const add=txt=>days(rangesOf(txt)).forEach(d=>{if(!od.has(d))imp.add(d);});
    if(this.readsApp)add(appFeed());
    if(this.link)add(this.link.export());
    this.imp=imp;this.last=NOW;}
  maybeRead(appFeed){if(NOW-this.last>=this.period)this.read(appFeed);}
}
function world(opt){
  opt=opt||{};const env=makeEnv();
  const air=new Plat('airbnb',{ownSum:'Reserved',impSum:'Airbnb (Not available)',period:(opt.pa||3),readsApp:opt.airApp!==false,link:null,desc:'Reservation URL: https://www.airbnb.com/hosting/reservations/details/HM123'});
  const bk=new Plat('booking',{ownSum:'CLOSED - Not available',impSum:'CLOSED - Not available',period:(opt.pb||4)});
  const ag=new Plat('agoda',{ownSum:'Booked',impSum:'Blocked',period:(opt.pg||6)});
  if(opt.direct)air.link=bk;
  const plats={airbnb:air,booking:bk,agoda:ag},host={'air.example':air,'bk.example':bk,'ag.example':ag};
  env.fetch=u=>{const h=/https:\/\/([^\/]+)/.exec(u)[1];const t=host[h].export();return{getResponseCode:()=>200,getContentText:()=>t};};
  env.ctx.props_().setProperty('EXT_SRC',JSON.stringify({airbnb:'https://air.example/a.ics',booking:'https://bk.example/b.ics',agoda:'https://ag.example/g.ics'}));
  const w={env,plats,air,bk,ag,appFeed:()=>env.ics(),
    tick(n){for(let i=0;i<(n||1);i++){NOW+=30*MIN;Object.values(plats).forEach(p=>p.maybeRead(w.appFeed));env.ctx.capNhatLichNgoai();}},
    hours(h){w.tick(h*2);}};
  env.saveBk([]);env.ctx.capNhatLichNgoai();w.tick(1); // mốc ban đầu (không báo)
  return w;
}
const D0='2026-12-20',D2='2026-12-22';
const real=(w,src)=>w.env.state().events.filter(x=>!src||x.src===src);
const echoCount=(w,src)=>JSON.parse(w.env.ctx.props_().getProperty('EXT_'+src)).ev.filter(x=>x[3]).length;
const bkApp=(id,s,e)=>({id,name:'Nguyen Van A',phone:'0912345678',price:777777,startAt:s+'T14:00',endAt:e+'T11:00',pkg:'night',code:'654321',note:'ghi chu rieng'});
const allBusy=(w)=>{const o={};for(const k of ['airbnb','booking','agoda']){const p=w.plats[k];o[k]=[...days(rangesOf(p.export())),...p.ownDays()].some(d=>d>=D0&&d<D2);}
  o.app=rangesOf(w.env.ics()).some(([s,e])=>s<D2&&D0<e);o.state=real(w).length>0;return o;};

// ---------- 1. Booking mới -> xuất -> Airbnb/Agoda xuất ngược ----------
{const w=world();
 w.bk.own.push([D0,D2]);w.tick(1);
 assert.equal(JSON.stringify(real(w).map(x=>x.src+x.s+x.e)),JSON.stringify(['booking'+D0+D2]),'đơn Booking hiện');
 assert.ok(rangesOf(w.env.ics()).some(r=>r[0]===D0&&r[1]===D2),'app xuất đơn Booking');
 assert.equal(w.env.pushes('Lịch Booking').length,1);
 w.hours(12);
 assert.ok(w.air.imp.has(D0)&&w.ag.imp.has(D0),'Airbnb, Agoda đã nhập lịch app');
 const st=real(w);assert.equal(st.length,1,'không còn đơn ma: '+JSON.stringify(st));
 assert.equal(echoCount(w,'airbnb'),1);assert.equal(echoCount(w,'agoda'),1);
 assert.equal(w.env.ctx.extInfoOut_().sources.find(s=>s.id==='airbnb').count,0);assert.equal(w.env.ctx.extInfoOut_().sources.find(s=>s.id==='airbnb').echo,1);
 const cal=JSON.parse(w.env.ctx.doGet({parameter:{cal:'1'}}).s);assert.equal(JSON.stringify(cal.night),JSON.stringify([D0,addD(D0,1)]));
 const bkCount=(w.env.ics().match(/BEGIN:VEVENT/g)||[]).length;assert.equal(bkCount,1,'chỉ 1 sự kiện xuất, echo không được xuất lại');
 assert.equal((w.env.data().otaLedger||[]).length,1,'chỉ 1 dự tính OTA');
 assert.equal(w.env.pushes().length,1,'không push cho echo');
 assert.equal(w.env.ctx.extState_().conflicts.length,0);
 console.log('ok 1');
 // ---------- 2. Hủy -> mọi nơi trống trong <= 1 ngày ----------
 w.bk.own=[];const t0=NOW;
 w.tick(1);
 assert.ok(!rangesOf(w.env.ics()).some(r=>r[0]<D2&&D0<r[1]),'app ngừng xuất ngay');
 let seenEchoAlive=false;
 for(let i=0;i<48;i++){w.tick(1);assert.ok(!rangesOf(w.env.ics()).some(r=>r[0]<D2&&D0<r[1]),'không xuất lại echo ở '+i);
   if(w.air.imp.has(D0)&&echoCount(w,'airbnb'))seenEchoAlive=true;
   assert.equal(real(w).length,0,'echo còn sót không thành đơn thật');
   if(NOW-t0>=24*H)break;}
 assert.ok(seenEchoAlive,'đã có lúc Airbnb còn giữ echo');
 const b=allBusy(w);assert.ok(!Object.values(b).some(Boolean),'mọi nơi trống: '+JSON.stringify(b));
 assert.equal(echoCount(w,'airbnb'),0);
 assert.equal(w.env.ctx.extState_().conflicts.length,0);
 console.log('ok 2 (vòng lặp 3 nền tảng, trống sau',(NOW-t0)/H,'giờ)');
 // ---------- 4. nhả rồi có đơn Booking mới cùng ngày sau > 2h ----------
 w.hours(3);w.bk.own.push([D0,D2]);w.tick(1);
 assert.equal(real(w,'booking').length,1,'đơn Booking mới cùng ngày là đơn thật');
 assert.ok(rangesOf(w.env.ics()).some(r=>r[0]===D0&&r[1]===D2),'và được xuất');
 w.hours(12);assert.equal(real(w).length,1);
 console.log('ok 4');}

// ---------- 2b. nối trực tiếp Airbnb<-Booking; 8 ----------
{const w=world({direct:true,airApp:false});
 w.bk.own.push([D0,D2]);w.air.read(w.appFeed); // Airbnb đọc Booking ngay, trước khi app xuất
 assert.ok(w.air.imp.has(D0));
 NOW+=30*MIN;w.env.ctx.capNhatLichNgoai(); // lần đọc đầu thấy cả hai
 assert.equal(real(w).length,1,'chỉ đơn Booking');assert.equal(real(w)[0].src,'booking');
 assert.equal(echoCount(w,'airbnb'),1,'Airbnb là mirror');
 assert.equal(w.env.ctx.extState_().conflicts.length,0,'không báo trùng giả');
 assert.equal(w.env.pushes('Trùng').length,0);assert.equal(w.env.pushes('Lịch Airbnb').length,0);
 w.hours(5);assert.equal(real(w).length,1);
 // hủy: Booking bỏ ngay, Airbnb giữ block vài giờ
 w.bk.own=[];w.air.last=NOW;const t0=NOW;w.tick(1);
 assert.ok(w.air.imp.has(D0),'Airbnb còn block');
 assert.equal(real(w).length,0,'mirror sót lại không thành đơn thật');
 assert.ok(!rangesOf(w.env.ics()).some(r=>r[0]<D2&&D0<r[1]),'không xuất lại');
 for(let i=0;i<48&&NOW-t0<24*H;i++){w.tick(1);assert.equal(real(w).length,0);assert.ok(!rangesOf(w.env.ics()).some(r=>r[0]<D2&&D0<r[1]));}
 const b=allBusy(w);assert.ok(!Object.values(b).some(Boolean),JSON.stringify(b));
 console.log('ok 8 + 2b (nối trực tiếp)');
 // biến thể: nối trực tiếp VÀ dán link app vào Airbnb
 const v=world({direct:true,airApp:true});
 v.bk.own.push([D0,D2]);v.air.read(v.appFeed);v.hours(10);
 assert.equal(real(v).length,1);
 v.bk.own=[];const t1=NOW;for(let i=0;i<48&&NOW-t1<24*H;i++)v.tick(1);
 const bb=allBusy(v);assert.ok(!Object.values(bb).some(Boolean),'biến thể: '+JSON.stringify(bb));
 console.log('ok 2c (nối trực tiếp + link app)');}

// ---------- 2d. nền tảng đọc chậm 12 giờ ----------
for(const direct of [false,true]){
 const w=world({pa:12,pb:12,pg:12,direct,airApp:true});
 w.bk.own.push([D0,D2]);w.air.read(w.appFeed);w.hours(30);
 assert.equal(real(w).length,1);
 w.bk.own=[];const t0=NOW;let clean=null;
 for(let i=0;i<96;i++){w.tick(1);assert.equal(real(w).length,0,'echo sót không thành đơn thật (12h) '+i);
   assert.ok(!rangesOf(w.env.ics()).some(r=>r[0]<D2&&D0<r[1]),'không xuất lại (12h)');
   if(clean===null&&!Object.values(allBusy(w)).some(Boolean))clean=NOW-t0;}
 assert.ok(clean!==null&&clean<=24*H,'sạch sau '+clean/H+' giờ');
 console.log('ok 2d (chậm 12h, nối trực tiếp='+direct+', sạch sau',clean/H,'giờ)');
}

// ---------- 11. nhân viên nhập trước, Booking đến sau -> echo; xóa app -> nhả sau 36h ----------
{const w=world();
 w.env.saveBk([bkApp('b1',D0,D2)]);w.tick(1);
 w.bk.own.push([D0,D2]);w.tick(1);
 assert.equal(real(w,'booking').length,0,'ban đầu bị coi là echo');
 assert.equal(JSON.parse(w.env.ctx.props_().getProperty('EXT_booking')).ev[0][3],1);
 w.env.saveBk([]);const td=NOW;let rel=null;
 for(let i=0;i<110;i++){w.tick(1);
   const r=real(w,'booking').length===1;
   if(r&&rel===null)rel=NOW-td;
   if(rel===null)assert.ok(!rangesOf(w.env.ics()).some(x=>x[0]===D0&&x[1]===D2),'chưa nhả: chưa xuất');}
 assert.ok(rel!==null&&rel<=36*H+30*MIN&&rel>=30*H,'nhả sau '+rel/H+' giờ');
 assert.ok(rangesOf(w.env.ics()).some(x=>x[0]===D0&&x[1]===D2),'đơn Booking có trong lịch xuất');
 assert.equal(real(w,'booking').length,1);
 console.log('ok 11 (nhả sau',rel/H,'giờ)');
 // mirror cũng được nhả khi đơn gốc biến mất > 36h mà block còn
 const m=world({direct:true,airApp:false});
 m.bk.own.push([D0,D2]);m.air.read(m.appFeed);m.tick(1);assert.equal(echoCount(m,'airbnb'),1);
 m.bk.own=[];m.air.period=1000*H;m.air.last=NOW; // Airbnb kẹt block mãi
 for(let i=0;i<90;i++)m.tick(1);
 assert.equal(real(m,'airbnb').length,1,'mirror kẹt > 36h được nhả thành đơn thật');
 console.log('ok 11b (mirror nhả)');}

// ---------- 3. đặt phòng trong app ----------
{const w=world();
 w.env.saveBk([bkApp('b1',D0,addD(D0,1)),bkApp('b2',addD(D0,1),D2)]); // hai đơn liền kề
 w.tick(1);w.hours(12);
 assert.ok(w.air.imp.has(D0)&&w.air.imp.has(addD(D0,1)));
 assert.equal(real(w).length,0,'không đơn ma');assert.ok(echoCount(w,'airbnb')>=1);
 assert.equal(w.env.pushes('Lịch').length,0,'echo không push');assert.equal(w.env.pushes('Trùng').length,0);
 console.log('ok 3');
 // echo theo ICS_SENT thuần (không còn đơn gốc để làm mốc): đơn app bị xóa nhưng Airbnb đọc lịch cũ rồi hiện sau đó
 const e=makeEnv();const s=(a,b)=>[a,b];
 const sent={};sent[D0+'|'+D2]=[1000,5000];
 assert.equal(e.ctx.icsEchoOf_(sent,D0,D2,2000),true,'trong khoảng');
 assert.equal(e.ctx.icsEchoOf_(sent,D0,D2,5000+2*H),true,'đúng hạn 2 giờ');
 assert.equal(e.ctx.icsEchoOf_(sent,D0,D2,5000+2*H+1),false,'quá hạn -> đơn thật');
 assert.equal(e.ctx.icsEchoOf_(sent,D0,D2,1000),false,'trước khi app xuất');
 assert.equal(e.ctx.icsEchoOf_(sent,D0,addD(D2,1),2000),false,'vượt ngoài khoảng đã xuất');
 sent[D2+'|'+addD(D2,1)]=[1000,5000];assert.equal(e.ctx.icsEchoOf_(sent,D0,addD(D2,1),2000),true,'gộp ngày liền kề');
 console.log('ok 3b (quy tắc echo)');}

// ---------- 5 và 9. Airbnb Reserved trùng ----------
{const w=world();
 w.env.saveBk([bkApp('b1',D0,D2)]);w.tick(2);
 w.air.own.push([D0,addD(D2,1)]); // Airbnb 'Reserved' thật chồng lệch ngày với app
 w.tick(1);
 assert.equal(real(w,'airbnb').length,1,'vẫn là đơn thật');
 const c=w.env.state().conflicts;assert.equal(c.length,1);assert.equal(c[0].src.join(),'airbnb,app');assert.equal(c[0].s,D0);assert.equal(c[0].e,D2);assert.equal(w.env.state().dupes.length,0);
 assert.ok(!JSON.stringify(c).includes('Nguyen'));
 assert.equal(w.env.pushes('Trùng').length,1);
 w.hours(6);assert.equal(w.env.pushes('Trùng').length,1,'không lặp');assert.equal(w.env.state().conflicts.length,1);
 console.log('ok 5');
 // 9: Booking thật có trước, Airbnb Reserved thật sau, cùng ngày
 const x=world();x.bk.own.push(['2026-12-27','2026-12-29']);x.tick(2);
 x.air.own.push(['2026-12-27','2026-12-29']);x.tick(1);
 const cs=x.env.state().conflicts;assert.equal(cs.length,1);assert.equal(cs[0].src.join(),'airbnb,booking');
 assert.equal(x.env.pushes('Trùng').length,1);x.hours(4);assert.equal(x.env.pushes('Trùng').length,1);
 // Airbnb Reserved bằng DESCRIPTION (không phải SUMMARY Reserved)
 const t=x.env.ctx.parseIcs_('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261230\r\nDTEND;VALUE=DATE:20261231\r\nSUMMARY:Airbnb (Not available)\r\nDESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/X\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\nSUMMARY:Airbnb (Not available)\r\nEND:VEVENT\r\nEND:VCALENDAR');
 assert.equal(t[0][2],1);assert.equal(t[1][2],0);
 console.log('ok 9');}

// ---------- 10. trùng đúng ngày: không đỏ, không push, vào dupes; nhân viên nhập tay rồi xóa ----------
{const w=world();
 w.bk.own.push([D0,D2]);w.tick(2); // Booking thật có trước
 w.env.saveBk([bkApp('b1',D0,D2)]);w.tick(2); // nhân viên nhập đúng ngày
 const st=w.env.state();
 assert.equal(st.conflicts.length,0,'không trùng đỏ');assert.equal(w.env.pushes('Trùng').length,0,'không push');
 assert.equal(st.dupes.length,1);assert.equal(st.dupes[0].src.join(),'app,booking');assert.equal(st.dupes[0].s,D0);assert.ok(!JSON.stringify(st.dupes).includes('Nguyen'));
 assert.equal(real(w,'booking').length,1);
 w.env.saveBk([]);w.hours(6); // xóa đặt phòng app
 assert.equal(real(w,'booking').length,1,'đơn Booking vẫn là đơn thật');
 assert.ok(rangesOf(w.env.ics()).some(r=>r[0]===D0&&r[1]===D2),'và vẫn được xuất');
 assert.equal(w.env.state().dupes.length,0);
 // Booking thật mới đến, nhân viên nhập app cùng ngày; Airbnb nối trực tiếp (mirror) vẫn không dùng app làm mốc
 const x=world();x.env.saveBk([bkApp('b9','2027-01-10','2027-01-12')]);x.tick(1);
 x.env.ctx.props_().setProperty('ICS_SENT','{}'); // không có dấu vết xuất: chỉ còn app làm mốc
 x.bk.own.push(['2027-01-10','2027-01-12']);x.tick(1);
 assert.equal(real(x,'booking').length,1,'đơn Booking không bị mirror vì trùng app');
 // lệch ngày vẫn đỏ + push
 const y=world();y.env.saveBk([bkApp('b1',D0,D2)]);y.tick(1);y.bk.own.push([addD(D0,1),addD(D2,1)]);y.tick(1);
 assert.equal(y.env.state().conflicts.length,1);assert.equal(y.env.pushes('Trùng').length,1);
 console.log('ok 10');}

// ---------- 6. dữ liệu cũ, ICS_SENT lớn ----------
{const w=world();
 w.env.ctx.props_().setProperty('EXT_booking',JSON.stringify({at:NOW-1000,ok:true,err:'',ev:[['2026-12-24','2026-12-26']]}));
 assert.equal(real(w,'booking').length,1,'[s,e] cũ đọc được');
 assert.equal(w.env.ctx.extInfoOut_().sources.find(s=>s.id==='booking').count,1);
 w.bk.own.push(['2026-12-24','2026-12-26']);w.tick(1);
 assert.equal(real(w,'booking').length,1);assert.equal(JSON.parse(w.env.ctx.props_().getProperty('EXT_booking')).ev[0].length,4);
 const big={};for(let i=0;i<400;i++){const d=addD('2027-03-01',i);big[d+'|'+addD(d,1)]=[NOW-i*1000,NOW-i*1000];}
 big['2026-01-01|2026-01-02']=[NOW,NOW];big['2026-12-30|2026-12-31']=[NOW-5*86400000,NOW-5*86400000];
 w.env.ctx.props_().setProperty('ICS_SENT',JSON.stringify(big));
 w.env.ctx.icsSentUpdate_([D0+'|'+D2],NOW);
 const raw=w.env.ctx.props_().getProperty('ICS_SENT'),o=JSON.parse(raw);
 assert.ok(raw.length<=6000,'ICS_SENT '+raw.length);assert.ok(o[D0+'|'+D2],'mục mới giữ');
 assert.ok(!o['2026-01-01|2026-01-02']&&!o['2026-12-30|2026-12-31'],'mục quá hạn bị bỏ');
 assert.ok(!o[addD('2027-03-01',399)+'|'+addD('2027-03-01',400)],'mục cũ nhất bị cắt');
 // ICS_SENT hỏng không làm hỏng việc trả lịch
 w.env.ctx.props_().setProperty('ICS_SENT','{hong');assert.ok(w.env.ics().includes('BEGIN:VCALENDAR'));
 console.log('ok 6');}

// ---------- 7. riêng tư ----------
{const w=world();
 w.env.saveBk([bkApp('b1',D0,D2)]);
 w.bk.own.push(['2026-12-24','2026-12-26']);w.air.own.push(['2026-12-28','2026-12-30']);w.ag.own.push(['2027-01-02','2027-01-03']);w.tick(2);
 assert.ok(w.env.state().events.length===3);
 const ics=w.env.ics(),cal=w.env.ctx.doGet({parameter:{cal:'1'}}).s;
 assert.ok((ics.match(/BEGIN:VEVENT/g)||[]).length===4,'app + 3 nền tảng');
 for(const [n,t] of [['ics',ics],['cal',cal]])for(const bad of ['Nguyen','0912345678','777777','654321','ghi chu','850000','airbnb','Airbnb','booking','Booking','agoda','Agoda','HM123','CLOSED'])assert.ok(!t.includes(bad),n+' lộ '+bad);
 assert.ok(ics.includes('2027-01-02'.replace(/-/g,'')));
 console.log('ok 7');}

// ---------- 12. Airbnb xuất ngược đặt phòng app có từ trước ICS_SENT ----------
{const A='2026-12-22',B='2026-12-23',C='2026-12-24',E='2026-12-25';
 const mk=()=>{const w=world();w.air.period=1;w.air.readsApp=false;w.env.saveBk([bkApp('b1',A,B),bkApp('b2',C,E)]);
   const key=(s,e)=>s+'|'+e;
   // dữ liệu cũ: Airbnb đã lưu hai khoảng này như đơn thật, chưa có ICS_SENT
   w.env.ctx.props_().setProperty('ICS_SENT','{}');
   w.env.ctx.props_().setProperty('EXT_airbnb',JSON.stringify({at:NOW,ok:true,err:'',ev:[[A,B,NOW-90*24*H,0],[C,E,NOW-90*24*H,0]]}));
   return w;};
 // (a) không dấu hiệu: thành echo sau 1 lần đọc
 {const w=mk();w.air.imp=new Set([A,C]);w.air.period=1000*H;w.air.last=NOW;w.env.ctx.capNhatLichNgoai();
  const ev=JSON.parse(w.env.ctx.props_().getProperty('EXT_airbnb')).ev;
  assert.ok(ev.every(x=>x[3]===1),'echo '+JSON.stringify(ev));
  assert.equal(w.env.state().dupes.length,0,'dupes rỗng');assert.equal(w.env.state().events.length,0);
  assert.equal(w.env.state().conflicts.length,0);assert.equal(w.env.pushes('Lịch').length,0);
  assert.equal(rangesOf(w.env.ics()).filter(r=>r[0]===A||r[0]===C).length,2,'không xuất lại ngoài đặt phòng app');
  assert.ok(!/ext-/.test(w.env.ics()),'không xuất lại sự kiện nền tảng');
  // (c) xóa đặt phòng app: echo nhả sau 36 giờ nếu sự kiện còn
  w.env.saveBk([]);const td=NOW;let rel=null;
  for(let i=0;i<110;i++){w.tick(1);const r=w.env.state().events.length===2;if(r&&rel===null)rel=NOW-td;
    if(rel===null)assert.ok(!/ext-/.test(w.env.ics()),'chưa nhả: chưa xuất');}
  assert.ok(rel!==null&&rel>=30*H&&rel<=36*H+30*MIN,'nhả sau '+rel/H);
  assert.ok(/ext-/.test(w.env.ics()),'đã nhả: được xuất');console.log('ok 12a/12c');}
 // (b) Airbnb "Reserved" trùng khít: vẫn đơn thật, có trong dupes
 {const w=mk();w.air.own=[[A,B]];w.env.ctx.capNhatLichNgoai();
  const ev=JSON.parse(w.env.ctx.props_().getProperty('EXT_airbnb')).ev;
  assert.equal(ev.find(x=>x[0]===A)[3],0);
  const st=w.env.state();assert.equal(st.events.length,1);assert.equal(st.dupes.length,1);assert.equal(st.dupes[0].s,A);
  w.air.own=[[A,'2026-12-24']];w.env.ctx.capNhatLichNgoai(); // lệch ngày: vẫn thật, vào conflicts
  assert.equal(w.env.state().conflicts.length>=1,true);console.log('ok 12b');}
}

// ---------- thiếu Push.gs / OtaFinance.gs ----------
{const e=makeEnv(['Code']);e.ctx.props_().setProperty('EXT_SRC',JSON.stringify({booking:'https://bk.example/b.ics'}));
 const bk=new Plat('booking',{ownSum:'X',impSum:'X',period:4});bk.own.push([D0,D2]);
 e.fetch=()=>({getResponseCode:()=>200,getContentText:()=>bk.export()});
 e.ctx.capNhatLichNgoai();e.saveBk([bkApp('b1',D0,D2)]);e.ctx.capNhatLichNgoai();
 assert.equal(e.state().events.length,1);console.log('ok chỉ Code.gs');}
// ---------- 13. ngày nhập xa hơn ~11 tháng bị bỏ ----------
{const env=makeEnv(['Code','Push','Ota']);
 const feed=['BEGIN:VCALENDAR','VERSION:2.0',
   'BEGIN:VEVENT','UID:far','DTSTART;VALUE=DATE:20271126','DTEND;VALUE=DATE:20271128','SUMMARY:Airbnb (Not available)','END:VEVENT',
   'BEGIN:VEVENT','UID:near','DTSTART;VALUE=DATE:20261231','DTEND;VALUE=DATE:20270102','SUMMARY:Airbnb (Not available)','END:VEVENT',
   'END:VCALENDAR'].join('\r\n')+'\r\n';
 env.ctx.props_().setProperty('EXT_SRC',JSON.stringify({airbnb:'https://air.example/a.ics'}));
 env.fetch=()=>({getResponseCode:()=>200,getContentText:()=>feed});
 env.ctx.capNhatLichNgoai();
 const ev=env.state().events;
 assert.ok(!ev.some(x=>x.s==='2027-11-26'),'sự kiện 360 ngày bị bỏ: '+JSON.stringify(ev));
 assert.ok(ev.some(x=>x.s==='2026-12-31'),'sự kiện 30 ngày còn');
 const ics=env.ics();
 assert.ok(!ics.includes('20271126'),'không xuất ngày xa');
 assert.ok(ics.includes('20261231'),'xuất ngày gần');
 console.log('ok 13');}

console.log('PASS: check-sync-3.7');
