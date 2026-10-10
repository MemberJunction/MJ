---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-conversations": patch
---

`MediaLayoutPrefs` in `@memberjunction/ai-realtime-client/media` reads and saves a host's layout (its moves and picture-in-picture boxes) in a per-user settings store under the host's own keys. MJ's `UserInfoEngine` is such a store (`MediaLayoutSettings`). A store that is not ready reads as nothing saved and is skipped when writing, and a saved layout keeps the newest `MEDIA_LAYOUT_SAVED_LIMIT` (50) moves and boxes. `RecordPipRect` keeps the boxes the user moved most recently last. The realtime call saves its layout through them, under its existing keys, with nothing changing on screen; the meeting room's MJ host is next.
