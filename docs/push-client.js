(function(){
  'use strict';
  var TOKEN_KEY='dearsunday-push-device', READY=null, messaging=null, registration=null;
  var section=document.createElement('div');
  section.className='panel stack';section.id='pushPanel';
  section.innerHTML='<h2>Thông báo đặt phòng</h2><p id="pushState">Chưa bật thông báo trên thiết bị này.</p><p class="muted">Nhận báo khi lịch nền tảng có ngày bận mới hoặc ngày không còn trong lịch. Nội dung không có tên khách, số điện thoại hay mã cửa. Lịch được đọc mỗi 30 phút.</p><p class="muted">iPhone/iPad: thêm app vào Màn hình chính từ Safari, rồi mở app từ biểu tượng đó để bật thông báo.</p><div class="bar"><button class="btn" id="pushEnable" type="button">Bật thông báo trên thiết bị này</button><button class="btn ghost" id="pushDisable" type="button" hidden>Tắt thông báo</button><button class="btn ghost" id="pushTest" type="button" hidden>Gửi thông báo thử</button><button class="btn ghost" id="pushRefresh" type="button">Xem lịch sử mới</button></div><div id="pushHistory" class="list"></div>';
  document.querySelector('#home > .stack').appendChild(section);
  function status(t){document.getElementById('pushState').textContent=t;}
  function checked(r){if(!r||!r.ok)throw new Error(r&&r.error||'Không thực hiện được');return r;}
  function token(){return lsGet(TOKEN_KEY+'-user')===A.user?lsGet(TOKEN_KEY)||'':'';}
  function buttons(){var on=!!token()&&self.Notification&&Notification.permission==='granted';document.getElementById('pushEnable').hidden=on;document.getElementById('pushDisable').hidden=!token();document.getElementById('pushTest').hidden=!on;}
  async function init(){
    if(READY)return READY;
    READY=(async function(){
      if(!('serviceWorker' in navigator)||!('PushManager' in self)||!('Notification' in self))throw new Error('Trình duyệt này chưa hỗ trợ thông báo đẩy. Trên iPhone hãy mở app từ Màn hình chính.');
      if(!self.DEARSUNDAY_PUSH || !DEARSUNDAY_PUSH.vapidKey)throw new Error('Thông báo đang được cấu hình; chưa có khóa Web Push.');
      var sdk=await import('https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js');
      var fcm=await import('https://www.gstatic.com/firebasejs/13.3.0/firebase-messaging.js');
      if(!await fcm.isSupported())throw new Error('Trình duyệt này chưa hỗ trợ thông báo. Hãy thử Chrome/Edge hoặc app trên Màn hình chính iPhone.');
      registration=await navigator.serviceWorker.register('./firebase-messaging-sw.js',{scope:'./'});
      await navigator.serviceWorker.ready;
      messaging=fcm.getMessaging(sdk.initializeApp(DEARSUNDAY_PUSH.firebase));
      fcm.onMessage(messaging,function(payload){
        var n=payload.notification||{};
        registration.showNotification(n.title||'Dear Sunday',{body:n.body||'Lịch phòng có cập nhật.',icon:'./icons/icon-192.png',tag:payload.messageId||'dearsunday',data:{url:location.href}});
        refresh();
      });
      return fcm;
    })().catch(function(e){READY=null;throw e;});return READY;
  }
  async function refresh(){
    if(MODE!=='cloud')return;
    try{
      var r=checked(await api('pushInfo',{}));
      document.getElementById('pushHistory').innerHTML=r.items.length?r.items.map(function(x){return '<div class="li"><div><b>'+esc(x.title)+'</b><div>'+esc(x.body)+'</div><small>'+esc(dt(x.at))+'</small></div></div>';}).join(''):'<p class="muted">Chưa có thay đổi mới. Các lượt đã có trước khi bật tính năng không tạo thông báo hàng loạt.</p>';
      if(r.error)status(r.error);else status(token()&&Notification.permission==='granted'?'Đã bật trên thiết bị này.':'Chưa bật thông báo trên thiết bị này.');
      buttons();
    }catch(e){status(e.message);}
  }
  document.getElementById('pushEnable').onclick=async function(){
    this.disabled=true;
    try{
      if(MODE!=='cloud')throw new Error('Hãy đăng nhập trước khi bật thông báo.');
      if(!self.Notification)throw new Error('Trình duyệt chưa hỗ trợ thông báo. Trên iPhone, hãy thêm app vào Màn hình chính.');
      // Request permission only in response to the user's button press.
      var permission=await Promise.race([Notification.requestPermission(),new Promise(function(resolve,reject){setTimeout(function(){reject(new Error('Chưa nhận được phản hồi xin quyền. Hãy mở app bằng Chrome/Edge hoặc app đã thêm vào Màn hình chính, cho phép Thông báo rồi bấm bật lại.'));},20000);})]);
      if(permission!=='granted')throw new Error('Chưa được cấp quyền. Anh có thể bật quyền Thông báo trong cài đặt trình duyệt.');
      var fcm=await init(), t=await fcm.getToken(messaging,{vapidKey:DEARSUNDAY_PUSH.vapidKey,serviceWorkerRegistration:registration});
      checked(await api('pushRegister',{pushToken:t}));lsSet(TOKEN_KEY,t);lsSet(TOKEN_KEY+'-user',A.user);buttons();await refresh();
    }catch(e){status(e.message);}finally{this.disabled=false;}
  };
  document.getElementById('pushDisable').onclick=async function(){
    this.disabled=true;
    try{var t=token();checked(await api('pushUnregister',{pushToken:t}));lsDel(TOKEN_KEY);try{var f=await init();await f.deleteToken(messaging);}catch(e){}buttons();status('Đã tắt thông báo trên thiết bị này.');}catch(e){status(e.message);}finally{this.disabled=false;}
  };
  document.getElementById('pushTest').onclick=async function(){this.disabled=true;try{checked(await api('pushTest',{pushToken:token()}));status('Đã gửi thử. Hãy kiểm tra thông báo của thiết bị.');}catch(e){status(e.message);}finally{this.disabled=false;}};
  document.getElementById('pushRefresh').onclick=refresh;
  var originalStart=startCloud;
  startCloud=function(){originalStart();refresh();};
  // Rebind a remembered token to the current signed-in account only after explicit enable.
  var originalLogout=forceLogout;
  forceLogout=function(message){lsDel(TOKEN_KEY);originalLogout(message);};
  buttons();refresh();
})();
