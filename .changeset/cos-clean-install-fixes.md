---
"@memberjunction/scheduling-engine": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
---

Chief of Staff fixes found on a clean install:

- **Wake results read as text.** An Agent-target routine's run summary, and so its notification, is now the agent's final message instead of the payload JSON (which showed as escaped `&quot;` text). The payload still drives OnChange hashing. An `AgentWake` run no longer turns the wake state it was handed into a "<Agent> Payload" artifact; generated files and media are still saved.
- **Event-driven wakes are named like the others.** An approval or inter-agent wake routine is named `<Agent> — Wake (<key>)` from the user's policy, instead of `AgentWake (<key>)`.
- **`Schedule Next Agent Wake` parameters match the code.** The action now declares `WorkstreamKey`, `Timezone`, `WakeAtISO`, `WakeInMinutes`, `WatchedEntities` and `WakeGate`, accepts the already-declared `NextWakeAt` and `DelayMinutes` as the same values, and returns `ScheduledWakeTime`. An agent that sent only the declared names lost the time zone and the workstream key.
- **Prompt (metadata).** The Chief of Staff prompt lists the columns of the core views, filters every query to the current user, excludes `Information` requests from pending approvals, passes the user's time zone with a recurring wake, and reuses an existing routine's `WorkstreamKey` to change it.
