/* No offline caching of private app data. */
// Bấm vào thông báo: mở hoặc đưa app lên trước. Đăng ký trước SDK Firebase và chặn trình xử lý sau để không mở hai cửa sổ.
self.addEventListener('notificationclick',function(event){
  event.stopImmediatePropagation();
  event.notification.close();
  var d=event.notification.data||{},fm=d.FCM_MSG||{},link=d.url||(fm.fcmOptions&&fm.fcmOptions.link)||(fm.data&&fm.data.url)||'';
  var root=self.registration.scope,target=root;
  try{var u=new URL(link||root,root);if(u.origin===self.location.origin)target=u.href}catch(e){}
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){
      var c=list[i];
      if(c.url.indexOf(root)===0&&'focus' in c)return c.focus();
    }
    return self.clients.openWindow?self.clients.openWindow(target):undefined;
  }));
});
importScripts('./push-config.js');
importScripts('https://www.gstatic.com/firebasejs/13.3.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.3.0/firebase-messaging-compat.js');
firebase.initializeApp(self.DEARSUNDAY_PUSH.firebase);
firebase.messaging();
// FCM displays background notification messages and opens fcm_options.link.
