---
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/server": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/ai-agents": minor
"@memberjunction/auth-providers": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/livekit-room-server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Field active-status enforcement relocation, plus the "Meet" app rename, quieter operational logging, and a telemetry suppression refinement.

**Field active-status enforcement (`@memberjunction/core`, `@memberjunction/generic-database-provider`)**
- Deprecated-field warnings and disabled-field exceptions are now enforced at the field-access boundary genuine code flows through — `BaseEntity.Get()`, `Set()`, and `SetMany()` (what the generated strongly-typed accessors call) — instead of on the low-level `EntityField.Value` accessor. This flips a leaky blocklist (assert on every `.Value` touch, then suppress at each internal call site) into a precise allowlist, and fixes false deprecation warnings emitted on every load/save of a record that merely *contains* a deprecated column (e.g. `"MJ: AI Agent Runs".AgentState`) even when no code uses it.
- New memoized `EntityInfo.HasInactiveFields` fast-path gate: entities whose fields are all `Active` (the vast majority) pay only a single cached boolean check in the hot read/write paths.
- `EntityField.ActiveStatusAssertions` is retained as a `@deprecated` no-op for backward compatibility; the six now-redundant internal suppression toggles were removed. Warning caller strings are now accurate (`BaseEntity.Get`/`Set`) instead of the misleading `"EntityField.Value setter"`.

**Telemetry (`@memberjunction/core`)**
- Suppress "load this into a dedicated engine cache" telemetry suggestions for entities that have explicitly opted out of caching (`EntityInfo.AllowCaching = false`), reusing the existing flag as the single source of truth.

**Quieter operational logging (`@memberjunction/scheduling-engine`, `@memberjunction/ai-agents`, `@memberjunction/server`, `@memberjunction/server-bootstrap`, `@memberjunction/server-bootstrap-lite`)**
- Scheduled-job no-op runs (e.g. the Agent Memory Manager finding no new activity) now collapse to the engine's `Starting`/`Completed` heartbeat; the per-agent and memory-manager internal traces are verbose-only.
- Cleaner server startup logging: transient boot spinner, true total timing, less redundant output, and the `CustomColumnPromoter` registration log demoted to verbose-only.

**"Meet" app + local LiveKit dev (`@memberjunction/ng-explorer-core`, `@memberjunction/livekit-room-server`, `@memberjunction/auth-providers`, `@memberjunction/server`)**
- Renamed the Realtime app to "Meet", with the Live Room now defaulting to the Realtime co-agent instead of starting with no agent, plus a local LiveKit dev server and supporting docs.
