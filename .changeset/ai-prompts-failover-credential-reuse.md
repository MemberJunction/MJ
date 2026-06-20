---
"@memberjunction/ai-prompts": patch
---

Reuse model selection's credential probes in the failover loop instead of recomputing them.

`selectModelWithAPIKeyTracked` already walks the priority-ordered candidate list and probes
`hasCredentialsAvailable` until it finds the highest-priority credentialed candidate. Last night's
failover fix (skip uncredentialed candidates) re-derived those same probes from scratch inside
`executeModelWithFailover`, duplicating work selection had already done.

`selectModel` now threads the credential-availability it computed (keyed `driverClass:modelID:vendorId`,
the same key the failover loop uses) through `ModelSelectionResult` →
`executeWithValidationRetries` → `executeModelWithFailover`, which seeds its failover credential cache
from it. On the happy path failover does ZERO redundant `hasCredentialsAvailable` calls; the
not-evaluated tail (intentionally absent from the map, preserving the selection short-circuit) is still
probed lazily only if a real failure forces failover to walk down to it. No behavior change — purely
removes recomputation. Adds regression tests covering the reuse, the seeded-map authority, and the
lazy tail probe.

Also unifies the parallel execution path with the single-model path to eliminate logic drift.
`ParallelExecutionCoordinator` now extends `AIPromptRunner` and delegates each task's model call to
the inherited `executeModel`, so credential resolution (full hierarchical chain, not just legacy env
keys), driver/vendor selection, ChatParams construction (temperature/topP/effort/stop/response-format/
prefill), media handling, and streaming all live in ONE place. This removes the coordinator's duplicate
`buildMessageArray`/`Provider`/credential logic, fixes the `model.DriverClass` fallback that diverged
from the single path, and fixes a latent bug where per-task model parameters mutated the shared params
object. The base resolves the coordinator via the ClassFactory (`@RegisterClass`) to avoid a circular
import. Streaming is now also wired on the single-model path (`params.onStreaming`), which previously
hardcoded `StreamingEnabled = false`. Adds tests that lock in the inheritance/delegation so the paths
can't silently drift again.
