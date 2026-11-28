---
"@memberjunction/core": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/task-graph": minor
"@memberjunction/server": minor
---

Switch the default task-graph execution isolation level (`Limits.Isolation.DefaultIsolation`) from `'InProcess'` to `'Worker'` after verifying full behavioral parity across model-written task graphs (sequential pipelines, parallel fan-out/join, exclusive-group branching, error/retry semantics, waiting steps, user/security-envelope propagation, cancellation, and inline scripts). Preserves explicit `'InProcess'` opt-in (via `spec.isolation`, `TaskGraphSubmitContext.Isolation`, `mj.config.cjs` `limits.isolation.defaultIsolation`, and upgraded Flow agent rows with `AIAgent.Isolation = 'InProcess'`), enforces narrow-only stricter agent isolation on model-written graph submission, aligns `WorkerIsolationRunner` strict-mode and post-message worker teardown with `InProcessIsolationRunner`, and propagates per-graph limits overrides and step timeouts into isolation runners.
