# Generic Fire-and-Forget Save Queue

**Status:** Proposed (spec only — no implementation yet)
**Branch:** `claude/generic-entity-save-queue`
**Author:** Claude + Amith
**Related fix:** agent-run-step / prompt-run "stuck at Running" race fix (branch `claude/model-selection-perf-regression-lywodz`)

---

## 0. Implementation status (2026-06-20)

- ✅ **Layer A** `KeyedSerialTaskQueue` (`@memberjunction/global`) — implemented **self-bounding** (in-flight set + failure counters, not a growing pending list) + 8 unit tests.
- ✅ **Layer B** `BaseEntitySaveQueue` (`@memberjunction/core`) — implemented + 8 unit tests (race-proofing test ported from `AgentRunStepSaveQueue`).
- ✅ **New consumer** `GenericProcessRunTracker` (`@memberjunction/record-set-processor`) — fire-and-forget per-record detail writes + flush on complete (35 tests green).
- ✅ **Migration 1/3** `AgentRunStepSaveQueue` (`@memberjunction/ai-core-plus`) → thin wrapper; existing race test stays green (8/8).
- ✅ **Migration 2/3** `ActionEngine` log (`@memberjunction/actions`) → shared queue; suite green (152/152, incl. a fixed pre-existing `MJLruCache` mock gap).
- ⏳ **Migration 3/3** `AIPromptRunner` + `AIModelRunner` (`@memberjunction/ai-prompts`) — **DEFERRED for a careful pass.** `updatePromptRun` sets ~50 fields (with conditionals/computations) across two files + the consolidated path, on the critical AI-execution path, and uses a rich `this.logError` (category/metadata) rather than the global `LogError`. Wrapping those mutations into post-INSERT `Update` callbacks warrants per-statement review (and a decision on preserving the structured logging) rather than a rushed change. The existing hand-rolled queue keeps working until then.

Changeset added (patch): `global`, `core`, `ai-core-plus`, `actions`, `record-set-processor`. `ai-prompts` joins when migration 3/3 lands; this file moves to `plans/complete/` then.

---

## 1. Motivation

Three subsystems independently hand-roll the **same** fire-and-forget persistence pattern:

| Site | INSERT (fire-and-forget) | UPDATE / finalize | Flush |
|---|---|---|---|
| `AgentRunStepSaveQueue` (`@memberjunction/ai-core-plus`) | `Insert()` → `step.Save()` not awaited | `QueueUpdate()` chained after insert, `IgnoreDirtyState` | `Flush()` `allSettled` + failure counts |
| `ActionEngine` log (`@memberjunction/actions`) | `StartActionLog()` → `_logInsertPromises` map | `finalizeActionLog()` awaits insert, then mutates + saves | per-invocation, `void`-fired |
| `AIPromptRunner` prompt-run (`@memberjunction/ai-prompts`) | `createPromptRun()` → `queuePromptRunSave()` | `updatePromptRun()` mutates + `queuePromptRunSave()` | `WaitForPendingPromptRunSaves()` |

Three copies → drift. Concretely, a subtle TOCTOU race ("step stuck at `Running` / `null TargetLogID`") existed in the agent-step copy but **not** in the action-log copy, because only the action-log copy applied its mutation **after** awaiting the INSERT. The prompt-runner copy had the same latent gap (masked only because the model call almost always outlasts the INSERT round-trip).

**The shared correctness invariant** that must be impossible to get wrong:

> A field mutation made after a fire-and-forget INSERT is fired must be applied **after** that INSERT (and `BaseEntity.finalizeSave`'s `init()` + `SetMany(insertedRow)` reload) has landed — otherwise the reload reverts the mutation and the chained UPDATE force-persists stale values.

A single, tested utility makes this invariant **structural** (you physically cannot mutate-before-insert through the API) and deletes ~3× the chaining/flush/error-handling boilerplate.

---

## 2. Design — two layers

### Layer A — `KeyedSerialTaskQueue` (in `@memberjunction/global`)

A pure, entity-agnostic primitive. MJGlobal is the lowest layer and **cannot** reference `BaseEntity`, so this knows nothing about entities — just opaque `object` keys and `() => Promise` tasks.

```ts
// packages/MJGlobal/src/KeyedSerialTaskQueue.ts
export interface SerialTaskFlushResult {
  /** Tasks that rejected (threw) OR resolved a falsy "not ok" value. */
  failures: number;
  /** Tasks that rejected (threw). */
  rejections: number;
}

export class KeyedSerialTaskQueue {
  /** Latest tail promise per key (object identity) — tasks for the SAME key serialize. */
  private tails = new WeakMap<object, Promise<unknown>>();
  /** Every enqueued task, for Flush() to await. Different keys run concurrently. */
  private pending: Promise<unknown>[] = [];
  private onError?: (err: unknown, label?: string) => void;

  constructor(opts?: { onError?: (err: unknown, label?: string) => void }) { this.onError = opts?.onError; }

  /**
   * Enqueue `task` to run AFTER all prior tasks for `key` resolve. Fire-and-forget: returns the promise
   * but the caller need not await. Never rejects outward — failures are captured for Flush() and routed
   * to `onError`. `isOk` lets callers treat a falsy resolved value (e.g. BaseEntity.Save() → false) as a
   * failure without throwing.
   */
  enqueue<T>(key: object, task: () => Promise<T>, opts?: { label?: string; isOk?: (v: T) => boolean }): Promise<T | undefined>;

  /** Await every enqueued task (allSettled), drain, and report failure/rejection counts. */
  flush(): Promise<SerialTaskFlushResult>;
}
```

**Why this shape is race-proof by construction:** the "mutate after insert" rule falls out for free. The UPDATE is enqueued as a task `() => { mutate(entity); return entity.Save(); }`. Because `enqueue` chains it after the INSERT task on the same key, `mutate` *cannot* run until the INSERT resolves. There is no API surface that lets you mutate before the prior task completes.

**Key = object identity** via `WeakMap` (no leak; GC-friendly). Different keys → concurrent. Same key → strictly serialized in enqueue order.

### Layer B — `BaseEntitySaveQueue` (in `@memberjunction/core`)

Entity-aware façade built **on top of** Layer A. Core depends on MJGlobal and owns `BaseEntity`, so this layer captures the `Save()` calls, `IgnoreDirtyState`, and `LatestResult` error extraction — the parts the three sites currently duplicate.

```ts
// packages/MJCore/src/generic/BaseEntitySaveQueue.ts
export class BaseEntitySaveQueue {
  private queue = new KeyedSerialTaskQueue({ onError: (e, l) => LogError(`${l}: ${msg(e)}`) });

  /** Fire-and-forget INSERT of a freshly-NewRecord()'d entity. Key = the entity instance. */
  Insert(entity: BaseEntity): void;

  /**
   * Fire-and-forget UPDATE chained after the entity's INSERT. `applyMutation` runs INSIDE the post-INSERT
   * task (i.e. after finalizeSave's reload), so its values always survive. Force-persists with
   * IgnoreDirtyState. Pass no mutation only when fields are already set AND cannot race an in-flight INSERT.
   */
  Update(entity: BaseEntity, applyMutation?: (entity: BaseEntity) => void): void;

  /** Await all pending saves; returns failure diagnostics. Call at run/goal finalize. */
  Flush(): Promise<SerialTaskFlushResult>;
}
```

`Insert`/`Update` simply `queue.enqueue(entity, () => entity.Save(opts), { isOk: ok => ok === true, label: ... })`, with `Update` running `applyMutation(entity)` first inside the task.

---

## 3. Migration plan

> The recently-fixed `AgentRunStepSaveQueue`, the action-log dance, and the prompt-runner chain map all collapse onto `BaseEntitySaveQueue`. The action log is already correct — migration is pure de-duplication there, not a behavior change.

### 3.1 `AgentRunStepSaveQueue` → thin wrapper (or deleted)
- It adds nothing over `BaseEntitySaveQueue` except the `MJAIAgentRunStepEntity` type. Either:
  - **(a)** delete it and use `BaseEntitySaveQueue` directly in `BaseAgent` (`_stepSaveQueue: BaseEntitySaveQueue`), or
  - **(b)** keep a 5-line typed subclass for call-site readability.
- `BaseAgent.finalizeStepEntity` / `queueStepSave` / the three `TargetLogID` sites already pass `applyMutation` (post-fix) — they map 1:1 onto `Update(entity, applyMutation)`.
- Keep the `completedAt`-capture idempotency in `finalizeAgentRunStep` (already added).

### 3.2 `ActionEngine` log → `BaseEntitySaveQueue`
- Replace `_logInsertPromises` map + `finalizeActionLog`'s manual `await insert` with:
  - `StartActionLog`: `this._logQueue.Insert(logEntity)`.
  - `EndActionLog`: capture end-state locals, then `this._logQueue.Update(logEntity, l => { l.EndedAt = endedAt; l.Params = finalParams; l.ResultCode = ...; l.Message = ...; })`.
- Add a `Flush()` at the action-run boundary if a caller needs durability (today it's per-invocation void-fired; preserve that default).

### 3.3 `AIPromptRunner` prompt-run → `BaseEntitySaveQueue`
- Replace `_promptRunSaveChains` / `_pendingPromptRunSaves` / `queuePromptRunSave` with a `BaseEntitySaveQueue`.
- `createPromptRun`: `Insert(promptRun)`.
- `updatePromptRun`: drop the explicit `await this._promptRunSaveChains.get(...)` (post-fix) and instead pass the final mutations as `Update(promptRun, pr => { /* set all final fields */ })` — the queue applies them post-INSERT.
- `WaitForPendingPromptRunSaves()` → `Flush()`.
- Consolidated/parallel paths: same treatment.

---

## 4. Testing strategy

- **Layer A unit tests** (`KeyedSerialTaskQueue`): per-key serialization order; cross-key concurrency; fire-and-forget never rejects outward; `flush` `allSettled` + counts; `isOk` falsy → failure; drain on re-flush; `WeakMap` key reuse.
- **Layer B unit tests** (`BaseEntitySaveQueue`): with a fake `BaseEntity`, prove `Update(applyMutation)` survives an INSERT whose `finalizeSave` reverts a field (port the race test we already wrote for `AgentRunStepSaveQueue`); `IgnoreDirtyState` is set on updates; insert before update.
- **Migration regression**: keep each site's existing tests green; the agent-step race test moves to Layer B.
- **No DB in unit tests** — fake entities, as today.

---

## 5. Risks & open questions

1. **Layering:** Layer A in MJGlobal must stay dependency-free (no core import). Confirm MJGlobal has no existing util that already half-does this.
2. **Manifest/tree-shaking:** neither layer uses `@RegisterClass`, so no manifest concern.
3. **`WeakMap` vs `Map` for keys:** `WeakMap` avoids leaks but can't be enumerated; `flush` tracks tasks in a separate array, so that's fine. Confirm no need to enumerate by key.
4. **Backward-compat window:** migrate the three sites in one PR (small, mechanical) vs. land Layers A/B first and migrate incrementally. Recommendation: **Layers A+B + all three migrations in one PR**, since the value is the de-dup and the race-proofing — partial migration leaves a copy that can still drift.
5. **`ServerBootstrapLite` / cross-package:** Layer B lives in core; all three consumers already depend on core. No new dependency edges.
6. **Naming:** `KeyedSerialTaskQueue` vs `SerialTaskQueue` vs `PerKeyTaskChain`; `BaseEntitySaveQueue` vs `EntitySaveQueue`. Decide before implementation.

---

## 6. Rollout

- **Separate PR** from the race fix (which ships on `claude/model-selection-perf-regression-lywodz`).
- Order: (1) Layer A + tests, (2) Layer B + tests, (3) migrate the 3 sites, (4) delete the dead boilerplate, (5) changeset (patch: `@memberjunction/global`, `@memberjunction/core`, `@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/ai-prompts`, `@memberjunction/actions`).
- Net LOC: should be **negative** (three hand-rolled queues → two small shared classes + thin call sites).

---

## Appendix — the race, in one paragraph

A fire-and-forget INSERT serializes the entity's *current* fields and, on completion, `BaseEntity.finalizeSave` runs `init()` (wipe) + `SetMany(insertedRow)` (repopulate from the inserted row). Any field mutated on that same entity instance **between** insert-dispatch and insert-completion is therefore reverted. If the subsequent UPDATE is force-persisted (`IgnoreDirtyState`) against the reverted entity, it writes the stale pre-mutation values. The fix — applying the mutation **inside the post-insert continuation** — is exactly what the new queue's `Update(entity, applyMutation)` guarantees by construction.
