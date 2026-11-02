---
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
"@memberjunction/livekit-room-server": patch
---

Let an idle MJAPI stop polling its database. `AgentRunWatchdog` stops its heartbeat and stop-relay poll when the last run finishes and starts them again on the next run, untracks a run before the subclass `finalizeRun` hook, and validates `Configure()`; its stale-run sweep keeps its default (every 5 minutes once an agent has run) and `agentRunWatchdog.sweepIntervalMs: 0` (env `MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS`) leaves only the startup sweep. New switches, defaults unchanged: `agentSessions.janitor` (`MJ_SESSION_JANITOR_ENABLED`, `MJ_SESSION_JANITOR_SWEEP_INTERVAL_MS`), `agentSessions.bridgeReconciler` (`MJ_BRIDGE_RECONCILER_ENABLED`, `MJ_BRIDGE_RECONCILER_SWEEP_INTERVAL_MS`), `agentSessions.handoffOfferExpiry` (`MJ_HANDOFF_OFFER_EXPIRY_ENABLED`, `MJ_HANDOFF_OFFER_EXPIRY_SWEEP_INTERVAL_MS`; `HandoffOfferRegistry.StartPeriodicSweep()` is new) and `conversationDetailReconciler` (`MJ_CONVERSATION_DETAIL_RECONCILER_ENABLED`, `MJ_CONVERSATION_DETAIL_RECONCILER_SWEEP_INTERVAL_MS`). See `guides/SERVERLESS_DATABASE_AUTO_PAUSE_GUIDE.md`.
