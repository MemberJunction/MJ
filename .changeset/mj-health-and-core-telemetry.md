---
"@memberjunction/core": patch
"@memberjunction/health": patch
"@memberjunction/ai-prompts": patch
---

Unified telemetry lifecycle, health signal catalog, live verification probes, consent-gated share layer, and OpenTelemetry spine:
- In `@memberjunction/core`, extend `TelemetryManager.Instance.OnEvent` with lifecycle phase options (`TelemetryOnEventOptions` supporting `Phases?: readonly ('start' | 'end')[]`), balanced start/end emission across suppression boundaries, and automatic `'end'` eviction notification on active event cap so span bridges do not leak open spans. Add `TotalInputTokens` and `TotalOutputTokens` to `TelemetryEvent`.
- In `@memberjunction/ai-prompts`, wire `AIPromptRunner.ExecutePrompt` to `TelemetryManager.Instance.StartEvent('AI', ...)` and `EndEvent(...)` with `inputTokens` and `outputTokens` for runtime prompt observability.
- Introduce `@memberjunction/health` package containing:
  - Pluggable health signal catalog and probe engine (`BaseHealthProbe`, `MJHealthEngine`) with point-in-time and continuous evaluation of database connectivity, metadata cache parity, queue worker heartbeats, OpenApp fleet statuses, runtime event loop lag, and AI provider readiness.
  - Deterministic agent remediation playbooks (`YellowPlaybook`, `RedPlaybook`) for every signal with bounded autonomous action limits and human escalation runbooks.
  - Live transactional entity CRUD probes (`LiveEntityCrudProbe`, `BaseLiveCrudVerifier`) with guaranteed rollback on transactional database writes.
  - In-process telemetry signal bridge (`LocalTelemetrySignalBridge`) rolling execution counts, durations, and token metrics into bounded time buckets with zero network egress.
  - Consent-gated share layer (`ShareLayerPackager`, `BaseTelemetrySink`) and closed compile-time/runtime schema allowlist DSL (`TelemetrySchemaDsl`) enforcing that customer data, raw SQL text, prompt text, completions, and user IDs can never leave the deployment boundary.
  - Full OpenTelemetry spine (`OtelSdk`, `OtelSpanBridge`, `OtelMetrics`, `OtelHttpPropagation`) providing zero-overhead opt-in distributed tracing, semantic conventions (`db.*`, `gen_ai.*`), W3C `traceparent` context propagation, and runtime/health metric instruments.
