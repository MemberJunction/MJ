---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/actions": patch
"@memberjunction/record-set-processor": patch
---

Generic fire-and-forget save queue — de-duplicates the hand-rolled "INSERT (fire-and-forget) → chained UPDATE" persistence pattern and makes the "stuck at Running" race structurally impossible.

- **`KeyedSerialTaskQueue`** (`@memberjunction/global`) — entity-agnostic per-key serial task chain: same-key tasks serialize (the next can't start until the prior settles), different-key tasks run concurrently, failures are tallied for `flush()` and never propagate outward. Self-bounding (only in-flight tasks retained + failure counters), so a long-lived queue that never flushes doesn't grow.
- **`BaseEntitySaveQueue`** (`@memberjunction/core`) — entity façade: `Insert(entity)` / `Update(entity, applyMutation?)` / `Flush()`. `Update`'s mutation runs *inside* the post-INSERT task (after `finalizeSave`'s reload), so it can never be reverted — the race is impossible by construction. Force-persists updates with `IgnoreDirtyState`.
- **Adopted in**: `GenericProcessRunTracker` (`@memberjunction/record-set-processor`) now fire-and-forgets per-record detail writes off the loop and flushes on completion; `AgentRunStepSaveQueue` (`@memberjunction/ai-core-plus`) is now a thin wrapper over the shared queue; `ActionEngine`'s action-execution log (`@memberjunction/actions`) drops its bespoke insert-promise map for the shared queue.

(Also fixes a pre-existing `MJLruCache` mock gap in the Actions/Engine test suite.)
