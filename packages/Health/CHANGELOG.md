# @memberjunction/health

## 6.3.0-edge.2

### Patch Changes

- Updated dependencies [c6b3913]
- Updated dependencies [f41ea95]
- Updated dependencies [0360f3f]
- Updated dependencies [3c70bf7]
- Updated dependencies [2f41586]
- Updated dependencies [30460b0]
- Updated dependencies [916fe91]
- Updated dependencies [d7a630c]
- Updated dependencies [dfc0449]
- Updated dependencies [2122c07]
- Updated dependencies [0711e70]
- Updated dependencies [90174df]
- Updated dependencies [4feb8ad]
- Updated dependencies [d7a630c]
- Updated dependencies [9499d4b]
- Updated dependencies [d635ec5]
- Updated dependencies [5f514f2]
- Updated dependencies [3d5adab]
- Updated dependencies [9471265]
- Updated dependencies [942e220]
- Updated dependencies [346795c]
- Updated dependencies [a5dbc84]
- Updated dependencies [c63e493]
- Updated dependencies [193d979]
- Updated dependencies [6cd3f38]
- Updated dependencies [be7f58e]
  - @memberjunction/core@6.3.0-edge.2
  - @memberjunction/global@6.3.0-edge.2

## 6.3.0-edge.1

### Patch Changes

- 46173bd: Unified telemetry lifecycle, health signal catalog, live verification probes, consent-gated share layer, and OpenTelemetry spine:
  - In `@memberjunction/core`, extend `TelemetryManager.Instance.OnEvent` with lifecycle phase options (`TelemetryOnEventOptions` supporting `Phases?: readonly ('start' | 'end')[]`), balanced start/end emission across suppression boundaries, and automatic `'end'` eviction notification on active event cap so span bridges do not leak open spans. Add `TotalInputTokens` and `TotalOutputTokens` to `TelemetryEvent`.
  - In `@memberjunction/ai-prompts`, wire `AIPromptRunner.ExecutePrompt` to `TelemetryManager.Instance.StartEvent('AI', ...)` and `EndEvent(...)` with `inputTokens` and `outputTokens` for runtime prompt observability.
  - Introduce `@memberjunction/health` package containing:
    - Pluggable health signal catalog and probe engine (`BaseHealthProbe`, `MJHealthEngine`) with point-in-time and continuous evaluation of database connectivity, metadata cache parity, queue worker heartbeats, OpenApp fleet statuses, runtime event loop lag, and AI provider readiness.
    - Deterministic agent remediation playbooks (`YellowPlaybook`, `RedPlaybook`) for every signal with bounded autonomous action limits and human escalation runbooks.
    - Live transactional entity CRUD probes (`LiveEntityCrudProbe`, `BaseLiveCrudVerifier`) with guaranteed rollback on transactional database writes.
    - In-process telemetry signal bridge (`LocalTelemetrySignalBridge`) rolling execution counts, durations, and token metrics into bounded time buckets with zero network egress.
    - Consent-gated share layer (`ShareLayerPackager`, `BaseTelemetrySink`) and closed compile-time/runtime schema allowlist DSL (`TelemetrySchemaDsl`) enforcing that customer data, raw SQL text, prompt text, completions, and user IDs can never leave the deployment boundary.
    - Full OpenTelemetry spine (`OtelSdk`, `OtelSpanBridge`, `OtelMetrics`, `OtelHttpPropagation`) providing zero-overhead opt-in distributed tracing, semantic conventions (`db.*`, `gen_ai.*`), W3C `traceparent` context propagation, and runtime/health metric instruments.
- 116cb9a: Tests: raise tight wall-clock bounds on pathological-input checks (TextToolLibrary ReDoS, template, RouteScrubber, FeaturePipelines numeric coercion) to 500–2000 ms, and the conversations pre-discovery "returns without waiting" checks from 5/15 ms to 45 ms (still below the fake worker's 50 ms delay). They guard against catastrophic backtracking or waiting, not machine speed; v6.3.0-edge.0's publish gate failed a 200 ms bound at 211 ms on a CI runner.
- Updated dependencies [d4350c0]
- Updated dependencies [2f64a46]
- Updated dependencies [e5a392f]
- Updated dependencies [2d938cf]
- Updated dependencies [7a3333e]
- Updated dependencies [0f4d357]
- Updated dependencies [1351528]
- Updated dependencies [3abebb3]
- Updated dependencies [44b885a]
- Updated dependencies [e768fd4]
- Updated dependencies [acd082e]
- Updated dependencies [e73f729]
- Updated dependencies [c5a5197]
- Updated dependencies [880a114]
- Updated dependencies [fa811cc]
- Updated dependencies [bc39181]
- Updated dependencies [1f24d8a]
- Updated dependencies [c51c6f3]
- Updated dependencies [35bffba]
- Updated dependencies [86326f2]
- Updated dependencies [a9e640a]
- Updated dependencies [46173bd]
- Updated dependencies [4262206]
- Updated dependencies [f53f828]
- Updated dependencies [2b4969f]
- Updated dependencies [dc30912]
- Updated dependencies [d1bf1c9]
- Updated dependencies [0af123e]
- Updated dependencies [05100bd]
- Updated dependencies [fff3a52]
- Updated dependencies [38ca94f]
- Updated dependencies [6ea73e6]
- Updated dependencies [7ad8b8a]
- Updated dependencies [1197598]
- Updated dependencies [ce32cbf]
- Updated dependencies [64cc6f4]
- Updated dependencies [7747b73]
- Updated dependencies [3e9d745]
- Updated dependencies [687393c]
  - @memberjunction/core@6.3.0-edge.1
  - @memberjunction/global@6.3.0-edge.1
