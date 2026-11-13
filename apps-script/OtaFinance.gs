/* Calendar-derived estimates; receipt confirmation is atomic and idempotent. */
var OTA_NAMES_={airbnb:'Airbnb',booking:'Booking.com',agoda:'Agoda'};
function otaDay_(s){
  return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
}
function otaMoney_(v){return typeof v==='number' && isFinite(v) && Math.floor(v)===v && v>0 && v<=1000000000;}
function otaConfig_(){return JSON.parse(props_().getProperty('OTA_CONFIG')||'{}');}
function otaWrite_(d,user){
  var raw=JSON.stringify(d);if(raw.length>MAX_DATA_CHARS)fail_('big','Dữ liệu quá lớn');
  writeData_(raw);var m=meta_();setMeta_({version:m.version+1,updatedAt:Date.now(),updatedBy:user});
}
function otaCaptureData_(d){
  if(!Array.isArray(d.otaLedger))d.otaLedger=[];
  var changed=false;
  extState_().events.forEach(function(x){
    var id='ota:'+x.src+':'+x.s+':'+x.e;
    if(d.otaLedger.some(function(r){return r.id===id;}))return;
    d.otaLedger.push({id:id,source:x.src,start:x.s,end:x.e,origin:'ical',createdAt:Date.now()});changed=true;
  });return changed;
}
function otaCapture_(){
  withLock_(function(){var raw=readData_();if(!raw)return;var d=JSON.parse(raw);if(otaCaptureData_(d))otaWrite_(d,'calendar');});
}
function otaQuote_(row,d,config){
  var cfg=config[row.source]||{},pkg=cfg.pkg||'sunday',price=d.prices&&d.prices[pkg]&&d.prices[pkg].gia;
  var nights=Math.round((Date.parse(row.end+'T00:00:00Z')-Date.parse(row.start+'T00:00:00Z'))/86400000);
  var rate=cfg.percent,configured=typeof rate==='number'&&isFinite(rate)&&rate>=0&&rate<=100;
  var valid=otaMoney_(price)&&nights>0&&configured;
  var gross=valid?Math.round(price*nights):null;
  var fee=valid?Math.round(gross*rate/100):null;
  var net=valid?gross-fee:null;
  return {pkg:pkg,nightly:otaMoney_(price)?price:null,nights:nights,percent:configured?rate:null,gross:gross,fee:fee,net:net,
    error:!otaMoney_(price)?'Chưa có giá gói trong app':!configured?'Admin chưa cấu hình chiết khấu':nights<=0?'Khoảng ngày không hợp lệ':''};
}
function otaInfo_(req){
  auth_(req,false);
  return withLock_(function(){
    var raw=readData_();if(!raw)fail_('bad','Chờ app đồng bộ dữ liệu trước khi tính tiền');
    var d=JSON.parse(raw);if(otaCaptureData_(d))otaWrite_(d,'calendar');
    var config=otaConfig_(),active={};extState_().events.forEach(function(x){active['ota:'+x.src+':'+x.s+':'+x.e]=true;});
    return {ok:true,config:config,rows:(d.otaLedger||[]).map(function(r){return Object.assign({},r,{inCalendar:!!active[r.id],quote:otaQuote_(r,d,config)});})};
  });
}
function otaSetConfig_(req){
  var user=auth_(req,true),input=req.config||{},out={};
  Object.keys(OTA_NAMES_).forEach(function(src){
    var c=input[src]||{},v=c.percent;
    if(v!==null && (typeof v!=='number'||!isFinite(v)||v<0||v>100))fail_('bad','Chiết khấu phải từ 0 đến 100%, hoặc để trống');
    if(c.pkg!=='sunday'&&c.pkg!=='night')fail_('bad','Chỉ chọn gói qua đêm');
    out[src]={percent:v,pkg:c.pkg,updatedAt:Date.now(),updatedBy:user.username};
  });
  return withLock_(function(){props_().setProperty('OTA_CONFIG',JSON.stringify(out));return {ok:true};});
}
function otaAdd_(req){
  var user=auth_(req,false),src=req.source,s=req.start,e=req.end,reference=String(req.reference||'').trim();
  if(!OTA_NAMES_[src]||!otaDay_(s)||!otaDay_(e)||e<=s||reference.length<1||reference.length>100)fail_('bad','Kiểm tra nền tảng, mã đơn và ngày nhận/trả');
  return withLock_(function(){
    var d=JSON.parse(readData_()||'{}');if(!Array.isArray(d.otaLedger))d.otaLedger=[];
    if(d.otaLedger.some(function(r){return r.source===src&&r.reference===reference;}))fail_('bad','Mã đơn đã có trong bảng đối soát');
    var id='ota:'+src+':'+s+':'+e;
    var r=d.otaLedger.filter(function(x){return x.id===id;})[0];
    if(r&&r.receipt)fail_('bad','Khoảng ngày này đã được xác nhận thu tiền');
    if(!r){r={id:id,source:src,start:s,end:e,origin:'manual',createdAt:Date.now()};d.otaLedger.push(r);}
    r.reference=reference;r.realBooking=true;
    otaWrite_(d,user.username);return {ok:true};
  });
}
function otaReceive_(req){
  var user=auth_(req,false);
  if(req.confirmed!==true||req.realBooking!==true)fail_('bad','Cần xác nhận đây là đơn thật và Anh đã nhận tiền');
  return withLock_(function(){
    var d=JSON.parse(readData_()||'{}'),r=(d.otaLedger||[]).filter(function(x){return x.id===req.id;})[0];
    if(!r)fail_('bad','Không tìm thấy mục đối soát, hãy tải lại');
    var txId='receipt:'+r.id;
    if(r.receipt||(d.tx||[]).some(function(t){return t.id===txId;}))return {ok:true,already:true};
    var reference=String(req.reference||'').trim();
    if(!reference||reference.length>100)fail_('bad','Cần mã đơn để tránh ghi thu trùng');
    if((d.otaLedger||[]).some(function(x){return x.id!==r.id&&x.source===r.source&&x.reference===reference&&x.receipt;}))fail_('bad','Mã đơn này đã xác nhận nhận tiền');
    var q=otaQuote_(r,d,otaConfig_());
    if(q.error||!otaMoney_(q.net))fail_('bad',q.error||'Số tiền dự kiến phải lớn hơn 0');
    if(req.expectedNet!==q.net||req.expectedNightly!==q.nightly||req.expectedPercent!==q.percent||req.expectedPkg!==q.pkg)fail_('bad','Giá hoặc chiết khấu đã đổi. Tải lại và kiểm tra trước khi xác nhận');
    if(!otaDay_(req.receivedOn)||req.receivedOn>Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd'))fail_('bad','Ngày nhận tiền không hợp lệ hoặc ở tương lai');
    if(!otaMoney_(req.actualAmount))fail_('bad','Nhập số tiền thực nhận lớn hơn 0');
    r.reference=reference;r.realBooking=true;
    r.receipt={at:Date.now(),by:user.username,receivedOn:req.receivedOn,amount:req.actualAmount,quote:q};
    if(!Array.isArray(d.tx))d.tx=[];
    d.tx.push({id:txId,type:'INCOME',cat:'Tiền phòng · '+OTA_NAMES_[r.source],amt:req.actualAmount,
      desc:OTA_NAMES_[r.source]+' · '+reference+' · '+r.start+' → '+r.end,bk:r.id,otaId:r.id,
      at:Date.parse(req.receivedOn+'T12:00:00+07:00'),confirmedAt:r.receipt.at,confirmedBy:user.username});
    otaWrite_(d,user.username);return {ok:true,amount:req.actualAmount};
  });
}
// Prevent stale clients, merges and ordinary saves from modifying confirmed receipts.
function otaProtectSave_(incoming,current){
  incoming.otaLedger=current.otaLedger||[];
  var receipts=(current.tx||[]).filter(function(t){return t.otaId;});
  incoming.tx=(incoming.tx||[]).filter(function(t){return !t.otaId&&String(t.id).indexOf('receipt:ota:')!==0;}).concat(receipts);
}
