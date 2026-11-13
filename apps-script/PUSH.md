# Web Push notifications

The web app uses Firebase Cloud Messaging, project `dearsunday-notifications`, on the free Spark plan. Firebase configuration and the public VAPID key are in `docs/push-config.js`. No service-account private key is used.

Deploy `Code.gs`, `Push.gs` and `appsscript.json` together. Keep the production script's existing private configuration. Authorize the explicit scopes as the deployment owner, who must also have FCM send access on the Firebase project. Update the existing web-app deployment so app URLs and calendar tokens stay unchanged.

The existing 30-minute calendar trigger detects additions/removals of date ranges from successful Airbnb and Booking feeds. It records at most 30 generic history entries, sends to opted-in active users' devices, and retries failed sends up to three times. Failed calendar downloads preserve the previous baseline. Existing events do not produce a startup flood. iCal changes are not proof of a booking or cancellation; no guest details are transmitted.

Each browser/device must independently enable notifications after login. Use Chrome/Edge on desktop or Android; on iPhone/iPad add the app to the Home Screen from Safari and open that icon. Press **Bật thông báo trên thiết bị này**, allow notifications, then **Gửi thông báo thử**. **Tắt thông báo** removes that device registration. Notification settings on the OS can still suppress delivery.

Agoda is not a direct input source in the current app calendar reader, so this version does not promise direct Agoda alerts. This is not a guest-message or email integration.

Verification: syntax checks for the browser client/service worker, and the VM checks in the implementation workspace cover silent baseline, retained state on fetch failure, change detection, unchanged-feed deduplication, bounded history and queue size. Real delivery still requires an opted-in browser and a successful test send.
