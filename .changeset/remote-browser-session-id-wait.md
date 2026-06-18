---
"@memberjunction/ng-conversations": patch
---

Fix the "session ID missing to drive computer use" race in the Remote Browser realtime channel with defense-in-depth.

The channel's `AgentSessionID` is a live getter over the session service's current id — `null` in the window BEFORE the session mints (the realtime model can fire a `browser_*` tool the first beat it connects, before `mintSession` binds the id) and again after teardown. The three model-facing tool paths (`ApplyAgentTool`, `achieveGoal`/`browser_AchieveGoal`, `interpretPage`/`browser_DescribePage`+`browser_LocateElement`) previously read the id synchronously and failed instantly when it was null.

- New `BaseRealtimeChannelClient.ResolveAgentSessionId()` (generic, so every channel benefits) briefly WAITS for the id to bind — resolving immediately on the common path, polling on a short interval up to a bounded timeout, and bailing fast if the channel is disposed (`Context` goes null) so it never waits on a torn-down session. Wait bounds are protected fields tests can shrink.
- The three tool paths now route through it, so a tool invoked a beat early waits for the session to come live instead of returning a hard failure to the model.

Tests added for the mint-race wait + the existing null-forever guards (shortened so they stay fast).
