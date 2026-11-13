/* No offline caching of private app data. */
importScripts('./push-config.js');
importScripts('https://www.gstatic.com/firebasejs/13.3.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.3.0/firebase-messaging-compat.js');
firebase.initializeApp(self.DEARSUNDAY_PUSH.firebase);
firebase.messaging();
// FCM displays background notification messages and opens fcm_options.link.
