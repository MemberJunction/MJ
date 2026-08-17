---
"@memberjunction/ai-bridge-server": patch
"@memberjunction/server": patch
---

Ask the server whether multi-agent rooms actually take turns

`MJ_REALTIME_MODERATOR_MODE` is off by default, and with it off a multi-agent room is a free-for-all:
every agent hears everything and decides for itself when to speak, including in response to the other
agents. Reasonable for a webinar, crosstalk for anything structured — and **nothing at the API surface
said which one you had**. Every mutation succeeds identically either way, so a deployment that never
set the variable, or mistyped it, found out by listening.

Adds `RealtimeRoomMode { ModeratorMode }` and the `AIBridgeEngine.HasTurnModerator` accessor behind it.
It reports the **effective** state — whether a turn moderator is actually bound — rather than echoing
the environment variable, so a typo reads as off instead of reading as what was intended. Authenticated,
since it describes server configuration; not otherwise gated, being one boolean about how rooms behave
that any client able to start one already needs.
