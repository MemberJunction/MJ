---
'@memberjunction/mobile-app': patch
---

feat(mobile-app): the voice screen says once per call why the call has no avatar

The mobile voice screen shows the realtime runtime's avatar notice under its top row, in the same words as the web call overlay, for example "Audio only: this app can't show the avatar" when an agent's avatar was granted (the app has no surface to play it) or "Audio only: this voice model can't show an avatar". It shows once per call, has a ✕ named "Dismiss", hides itself after 10 seconds, and goes when the session ends; a new call (switching agent) can show it again. TalkBack reads it through a polite live region and VoiceOver through a queued announcement. `AvatarNoticePresenter` holds those rules and `AvatarNoticeText` the sentences, one per reason, keyed by every reason `@memberjunction/ai` defines.
