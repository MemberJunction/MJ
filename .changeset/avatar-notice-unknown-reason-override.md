---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-mj-livekit-room": patch
---

A host can word the avatar notice for a reason this version doesn't know. `AvatarNoticeOverrides` gains an `unknown` key, which `AvatarNoticeText` uses for a `null` reason and for a reason with no line in `AVATAR_NOTICE_TEXT` (such a reason used to throw). Without it, or with a blank one, the line is `AVATAR_NOTICE_UNKNOWN_REASON_TEXT`, worded as before. The key doesn't stand in for a known reason the host leaves out. The meeting room's `AvatarNoticeLabels` takes it, so a reason the room can't name, such as a newer bot's, reads in the host's words.
