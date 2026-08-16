---
'@memberjunction/schema-engine': patch
'@memberjunction/server': patch
---

Publish Runtime Schema Update runs to the integration progress stream, so an RSU is observable the way a sync or a connector build is.

`IntegrationRunKind` has always included `'RSU'` and `RUN_KIND_TO_TOPIC` has always mapped it to an `'RSU'` subscription channel, but nothing in production ever published to it — the channel carried no traffic and `IntegrationTailRunEvents` had no RSU runs to tail. The only live signal was polling `RuntimeSchemaUpdateStatus`, which reports the *current* step and nothing else: no history, no durable record, and nothing readable at all across the mid-run API restart the pipeline performs on itself as one of its own steps. A run that failed after that restart left no artifact to inspect.

`@memberjunction/schema-engine` now publishes framework-free lifecycle events (`run.start` / `step.start` / `step.end` / `run.end`) through an opt-in `PipelineObserver`, defaulting to `null` so a process that never registers one (the CLI, tests) pays nothing. `@memberjunction/server` translates them onto the progress-artifact stream, so an RSU run produces the same `manifest.json` / `progress.jsonl` / `result.json` triple as any other run kind. The split is deliberate: SchemaEngine sits below the progress-artifacts package and must not depend on it, so the emitter lifecycle lives one layer up where both are already dependencies.

This makes RSU runs **observable, not resumable** — a retry re-enters the pipeline and is legitimately a new run with its own start/end pair, not a continuation. What survives the mid-run restart is the record, not the run.

Correctness details: `run.end` publishes from a `finally` so it fires on normal completion, early validation failure, and a throw that produces no result at all — without the last case an observer's run would stay in flight forever. `runStep` is the single chokepoint for step publication, and a `recordStep` helper replaces the three remaining direct `steps.push` sites so a step cannot be recorded without being published. Counts are emitted once at run level in migrations, never per step: a per-step quartet would make a 12-step single-migration run report `processed: 12`. A failed step is a `stage.error` rather than a `stage.complete`, because a per-item failure does not abort the batch.

`RSUProgressBridge` is a `BaseSingleton`. Its `CurrentRunID` exists so a resolver that has just triggered an RSU can hand its client a run to tail, and that is only reachable if the instance is — previously the bridge was constructed inside its registration function and the sole surviving reference was the observer closure, leaving the accessor unreachable from any caller. `Configure()` supplies emitter options (a settable property because `BaseSingleton` requires a zero-argument constructor) and `Reset()` returns the bridge to idle without emitting a terminal event, so process-wide state cannot leak between runs or hold an interval open.
