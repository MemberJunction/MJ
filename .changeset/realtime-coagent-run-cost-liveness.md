---
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
---

Fixed two bugs in the co-agent run that every voice session records. Both were found on a production call that ran 17 minutes on Gemini Live: the session showed $0.03, and its co-agent run was marked Failed.

- **Its cost was never recorded.** The realtime model's usage builds up on the co-agent's prompt run, which prices itself, but the co-agent's agent run kept `TotalCost` and `Total*TokensUsed` at 0. Anything that adds up agent runs left the voice model out. The realtime analytics dashboard showed only the delegated runs: $0.03 for a call whose model cost $0.81.
  - `FinalizeCoAgentRun` now copies the prompt run's tokens and cost onto the co-agent run, as an agent loop does from its prompt runs.
  - The copy happens whatever the run's status, so a run that was already ended still gets its cost.
- **The run watchdog force-failed long calls.** Because no agent loop owns the co-agent run, nothing stamped its liveness heartbeat. The watchdog failed every call that ran past about 5 minutes ("no liveness heartbeat … owning process presumed dead") while the call carried on.
  - The run is now registered with `AgentRunWatchdog` when it is created.
  - It is registered again on each persisted session heartbeat (`SessionManager`, via the new `RealtimeClientSessionService.KeepCoAgentRunAlive`), so whichever server instance the session talks to keeps it fresh.
  - It is unregistered once the run is finalized.
