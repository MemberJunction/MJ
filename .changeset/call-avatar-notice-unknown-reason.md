---
"@memberjunction/ai": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/mobile-app": patch
---

A call whose mint gives an avatar reason this version doesn't know, such as a newer server's, now says it is audio only instead of showing no notice. `ParseRealtimeAvatarStatus` keeps such a status without the reason and marks it `ReasonUnknown` (`ParsedRealtimeAvatarStatus`); a reason that isn't text still reads as no status. The runtime's notice then has no `Reason` (`RealtimeAvatarNotice.Reason` is optional), and the call overlay and the mobile voice screen say "Audio only: the avatar can't be shown in this call" (`AVATAR_NOTICE_CALL_UNKNOWN_REASON_TEXT` in `ng-realtime-media`, with a copy in the mobile app). `AvatarNoticeText` gives a `null` reason that line without `NameAgent` and the meeting's `AVATAR_NOTICE_UNKNOWN_REASON_TEXT` with it, so the meeting room reads as before. A host words it with `unknown` in the call overlay's `AvatarNoticeLabels`, as in the meeting room.
