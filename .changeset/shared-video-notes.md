---
"@memberjunction/ai": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-realtime-client": patch
---

The notes a realtime model gets when the video it sees changes now come from one module in `@memberjunction/ai`: `VideoSourceSeenNote` ("[You can now see: Ada's screen]", several sources joined with ", "), `VideoSourceEndedNote` ("[You can no longer see: Bob's camera]"), `VideoSourceTurnedOffNote` ("[You can no longer see: Whiteboard (the user turned it off)]") and `VideoSourceTurnedOnNote` ("[You can now see: Whiteboard (turned back on)]"). A browser call's `VideoSourceArbiter` and a meeting's bridge engine both build their notes with them, where each had its own copy of the wording. No note's text changes, and `FormatSwitchNote`, `FormatDisabledNote` and `FormatEnabledNote` still override the call's. `@memberjunction/ai-bridge-server` no longer exports its own `VideoSourceSeenNote` and `VideoSourceEndedNote`, added earlier in this release; import them from `@memberjunction/ai`.
