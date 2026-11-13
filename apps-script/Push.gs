/* Push: authenticated device registration; generic calendar changes only. */
var PUSH_PROJECT = 'dearsunday-notifications';
var PUSH_HOME = 'https://puonglee269.github.io/DearSunday/';

function pushDevices_() {
  var all = props_().getProperties(), out = [];
  Object.keys(all).filter(function(k){ return k.indexOf('PUSH_DEVICE_') === 0; }).forEach(function(k){
    try { var d=JSON.parse(all[k]); d.key=k; out.push(d); } catch(e) {}
  });
  return out;
}
function pushDeviceKey_(token) {
  return 'PUSH_DEVICE_' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
}
function pushRegister_(req) {
  var user=auth_(req, false), token=String(req.pushToken||'');
  if (!/^[A-Za-z0-9_:.-]{30,4096}$/.test(token)) fail_('bad','Mã thiết bị không hợp lệ');
  return withLock_(function(){
    var key=pushDeviceKey_(token), devices=pushDevices_();
    if (!props_().getProperty(key) && devices.length>=20) fail_('bad','Đã đủ 20 thiết bị; hãy tắt thiết bị cũ');
    props_().setProperty(key, JSON.stringify({token:token, user:user.username, at:Date.now()}));
    return {ok:true};
  });
}
function pushUnregister_(req) {
  var user=auth_(req,false), key=pushDeviceKey_(String(req.pushToken||''));
  return withLock_(function(){
    var raw=props_().getProperty(key), d=raw?JSON.parse(raw):null;
    if(d && d.user===user.username) props_().deleteProperty(key);
    return {ok:true};
  });
}
function pushInfo_(req) {
  var user=auth_(req,false), all=props_().getProperties();
  var items=Object.keys(all).filter(function(k){return k.indexOf('PUSH_EVENT_')===0;}).map(function(k){return JSON.parse(all[k]);});
  items.sort(function(a,b){return b.at-a.at;});
  return {ok:true, devices:pushDevices_().filter(function(d){return d.user===user.username;}).length, items:items.slice(0,30), error:all.PUSH_LAST_ERROR||''};
}
function pushSend_(device,event) {
  var user=findUser_(device.user);
  if(!user || !user.active) {props_().deleteProperty(device.key);return true;}
  var payload={message:{token:device.token, notification:{title:event.title,body:event.body}, webpush:{headers:{TTL:'3600'},notification:{tag:event.id,icon:PUSH_HOME+'icons/icon-192.png'},fcm_options:{link:PUSH_HOME}}}};
  var response=UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/'+PUSH_PROJECT+'/messages:send',{
    method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:JSON.stringify(payload),muteHttpExceptions:true
  });
  var status=response.getResponseCode();
  if(status>=200 && status<300)return true;
  var data={}; try{data=JSON.parse(response.getContentText());}catch(e){}
  var invalid=(data.error && data.error.details || []).some(function(d){return d.errorCode==='UNREGISTERED';});
  if(invalid){props_().deleteProperty(device.key);return true;}
  // Do not expose response bodies: they can contain registration tokens.
  props_().setProperty('PUSH_LAST_ERROR','Gửi thông báo thất bại (HTTP '+status+'). Kiểm tra quyền Firebase của Apps Script.');
  return false;
}
function pushTest_(req) {
  var user=auth_(req,false), key=pushDeviceKey_(String(req.pushToken||''));
  var d=pushDevices_().filter(function(x){return x.key===key && x.user===user.username;})[0];
  if(!d)fail_('bad','Thiết bị chưa bật thông báo');
  var ok=pushSend_(d,{id:'test-'+Date.now(),title:'Dear Sunday',body:'Thông báo thử: thiết bị đã kết nối.'});
  return {ok:ok,error:ok?'':props_().getProperty('PUSH_LAST_ERROR')};
}
function pushCalendarChange_(source,old,rec) {
  // An unsuccessful fetch must never look like a cancellation. Baseline first success silently.
  if(!rec.ok)return;
  withLock_(function(){
    var p=props_(), baselineKey='PUSH_BASE_'+source, raw=p.getProperty(baselineKey);
    var previous=raw?JSON.parse(raw):(old&&old.ok?old.ev:null);
    var current=rec.ev||[];
    p.setProperty(baselineKey,JSON.stringify(current));
    if(!previous)return;
    var key=function(x){return x[0]+'|'+x[1];};
    var before=previous.map(key), after=current.map(key);
    var added=current.filter(function(x){return before.indexOf(key(x))<0;});
    var removed=previous.filter(function(x){return after.indexOf(key(x))<0;});
    if(!added.length && !removed.length)return;
    var body=[];
    if(added.length)body.push('Ngày bận mới: '+added.map(function(x){return x[0]+' → '+x[1];}).join(', '));
    if(removed.length)body.push('Ngày không còn trong lịch: '+removed.map(function(x){return x[0]+' → '+x[1];}).join(', '));
    body.push('Mở app để kiểm tra. iCal không xác nhận lý do thay đổi.');
    var id=Utilities.getUuid(), ev={id:id,at:Date.now(),title:'Lịch '+EXT_SOURCES[source]+' thay đổi',body:body.join('. ').slice(0,600)};
    p.setProperty('PUSH_EVENT_'+id,JSON.stringify(ev));
    var queue=JSON.parse(p.getProperty('PUSH_QUEUE')||'[]');
    queue.push({event:ev,pending:pushDevices_().map(function(d){return d.key;}),attempts:0});
    p.setProperty('PUSH_QUEUE',JSON.stringify(queue.slice(-2)));
    var keys=Object.keys(p.getProperties()).filter(function(k){return k.indexOf('PUSH_EVENT_')===0;});
    keys.sort(function(a,b){return JSON.parse(p.getProperty(b)).at-JSON.parse(p.getProperty(a)).at;});
    keys.slice(30).forEach(function(k){p.deleteProperty(k);});
  });
}
function pushFlush_() {
  withLock_(function(){
    var p=props_(), queue=JSON.parse(p.getProperty('PUSH_QUEUE')||'[]'), devices=pushDevices_();
    queue.forEach(function(q){
      q.pending=q.pending.filter(function(key){
        var d=devices.filter(function(x){return x.key===key;})[0];
        if(!d)return false;
        try{return !pushSend_(d,q.event);}catch(e){p.setProperty('PUSH_LAST_ERROR','Không gửi được thông báo; kiểm tra quyền Apps Script.');return true;}
      });
      q.attempts++;
    });
    p.setProperty('PUSH_QUEUE',JSON.stringify(queue.filter(function(q){return q.pending.length && q.attempts<3;})));
  });
}
