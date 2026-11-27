---
"@memberjunction/ai": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/core-actions": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Phase 2.7 adversarial review hardening, `2.8` documentation suite, and live integration coverage (`IT195`) for the BaseAgent refactor:

- Enforce full multi-hop `BaseAgentID` ancestor ceilings, narrow-only security invariants, non-null limit preservation, unconditional `DriverClass` checks, and `IAgentConfiguration` JSON validation across `MJAIAgentEntityServer`, `MJAIAgentCategoryEntityServer`, `MJAIAgentTypeEntityServer`, and `MJAIAgentStepTypeEntityServer`.
- Re-evaluate `ResolvePlanModeGate` during `RestorePausedRunFromCheckpoint` so unapproved Plan Mode runs remain gated on resume.
- Refine `AgentStuckDetector` to distinguish synthetic post-action `Retry` continuations and track inline artifact/conversation/agent tool calls and memory writes.
- Wire `SafeResolveEffectiveAgentProperties` across runtime cascade consumers (prompt defaults, compaction, memory context builder, scoped search, plan mode, sub-agent consult rounds, and execution limits) and reset per-run `helperPlugins` before resolving `setup`/`realtime` seams.
- Default `httpDispatcher` `bodyTimeoutMs` to a finite 30-minute window and auto-wire Node's built-in `undici` dispatcher in `MJServer` startup; suspend `AgentLivenessWatchdog` during browser client-tool round-trips.
- Refine `V202611271804` backfill to scope to root agents without freezing untouched defaults; deepen all 13 per-helper unit test suites; add `IT195` live integration checks; lift the temporary `BaseAgent` freeze guard; and publish the four canonical agent guides and README overhauls.
