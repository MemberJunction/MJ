---
"@memberjunction/ai-realtime-client": patch
---

Adds `LocalMediaController` to `@memberjunction/ai-realtime-client/media`: the user's camera and microphone. It lists devices (following `devicechange`), starts and stops each kind only when asked, moves a live kind to another device inside the same `MediaStream` (releasing the current device first, as mobile browsers need, and reopening it if the new one fails), and restarts a kind on the system default device when the device in use goes away. It reports state through an rxjs `State$` and a `State` getter, and `Start` and `SwitchDevice` resolve with a status instead of throwing. The package now declares `rxjs`, which `@memberjunction/global` already brought in.
