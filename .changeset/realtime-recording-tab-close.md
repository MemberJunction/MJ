---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-conversations": patch
---

Realtime call recordings are no longer lost when the tab is closed right after End (#5195). Teardown now closes the session before it uploads the recording, so a tab closed mid-upload leaves the session `Closed` instead of open, and a driver `Disconnect()` that throws no longer skips the close.

The runtime exposes `SavingRecording$` / `IsSavingRecording`, and `RealtimeSessionService` uses it to show the browser's "Leave site?" prompt while the recording is still uploading (desktop browsers only).
