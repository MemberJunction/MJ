---
"@memberjunction/ng-conversations": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/mobile-app": patch
---

A realtime session in a conversation now reads as a voice call that belongs to the thread, not a banner laid across it.

- `ng-conversations`: the session card is laid out like a chat message, with the call icon in the avatar column, a header with the title and start time, and a bubble with the status, how long the call ran, how many messages were exchanged, the last line said, and a **Review call** button (**View call** while live). It keeps the message list's margins at every breakpoint. The card takes the viewer's id (`CurrentUserID`, passed by the message list), so the quoted line says "You" on your own call and names the caller on someone else's.
- `conversations-runtime`: the wording both surfaces share. The title is "Voice call with Sage" rather than "Realtime session · Sage", a server-shutdown close reads "Interrupted", and there are new helpers: `SessionCardStartedAt`, `SessionCardDurationLabel` ("Under a minute", "12 min", "1 hr 5 min"), `SessionCardMessageCountLabel` and `SessionCardSpeakerLabel`. The session lookup (`REALTIME_SESSION_META_FIELDS`) also reads `UserID`, `User` and `__mj_CreatedAt`, and the new `RealtimeSessionTimelineMeta` fields are optional, so existing callers still type-check.
- `mobile-app`: the session card takes the same title and message count as the web, and names the agent on its lines.
