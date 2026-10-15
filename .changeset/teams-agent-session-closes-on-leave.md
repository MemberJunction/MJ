---
"@memberjunction/telephony-adapters": patch
---

A Teams meeting agent's `MJ: AI Agent Sessions` row now closes when the bot's bridge ends (#5427). Before, the session a Teams join (`StartTeamsMeetingSession`) created stayed `Active` after the bot left the meeting, until the janitor's staleness sweep closed it, 15 minutes or more later, as `Janitor`.

- `TeamsMeetingsService` passes the bridge engine an end-of-session hook, as phone and room calls do. Once the bridge has ended, whatever ended it (the meeting ended, everyone left, the engine reaped the bridge, the model session was lost), the hook closes the session through `CloseAgentSessionRow` with the bridge's reason: `Explicit` for a stop or `HostEnded`, otherwise the bridge's own (`Error`, `Janitor`, `Shutdown`). A session already closed keeps its reason.
- A scheduled join's session, which the calendar watcher creates and passes in, is left open as before.
