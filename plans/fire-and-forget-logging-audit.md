# Follow-up Task: Codebase-wide "Fire-and-Forget" Logging/Telemetry Audit

**Status:** Not started — backlog
**Created:** 2026-06-13
**Origin:** Spun out of the AIPromptRunner performance work (see "Done so far" below). The user's guidance: adopt a fire-and-forget mindset for persistence that is *observability, not part of the success contract* — do the work, log failures, but don't make the hot path wait on a DB round-trip when nothing downstream needs the write to have landed.

## The pattern (canonical implementation)

Two reference implementations now exist; copy their shape:

1. **`packages/AI/Agents/src/base-agent.ts`** — `queueStepSave()` / `_stepSavePromises` / `_pendingSaves`, flushed in `finalizeAgentRun()` via `Promise.allSettled`. Step saves are sequenced per-entity-instance so create (INSERT) always precedes finalize (UPDATE).
2. **`packages/AI/Prompts/src/AIPromptRunner.ts`** — `queuePromptRunSave()` / `_promptRunSaveChains` / `_pendingPromptRunSaves`, plus `WaitForPendingPromptRunSaves()` for tests/callers that need durability. (Added in the perf pass.)

### Rules that make it safe (must hold before converting any site)

1. **Chain writes to the same record by entity INSTANCE, not ID** — guarantees the INSERT lands before any UPDATE, so a slow INSERT can't clobber the finalized row. (`Map<EntityInstance, Promise>`.)
2. **The PK must be available before the write completes** when anything downstream reads it. MJ `BaseEntity.NewRecord()` client-generates the UUID for single-column `uniqueidentifier` PKs, so `.ID` is safe to read immediately — verify this holds for the entity in question (composite or server-generated PKs do NOT qualify).
3. **No hard FK depends on the row being written first.** Check the schema: if another fire-and-forget write on a *different* chain has an FK to this row, the two independent chains can violate ordering. (AIPromptRun was safe because `AIAgentRunStep.TargetLogID` is a *polymorphic* soft reference, not an FK.)
4. **Failures are logged, never swallowed silently, and never thrown into the hot path.** Attach `.then(ok => log if !ok).catch(log)` so the promise always settles.
5. **Provide a flush** (`WaitForPending*`) for tests and for callers that genuinely need durability before proceeding.

## Candidate sites to audit (not yet verified — this is the task)

Sweep for `await <entity>.Save()` where the result is only used for logging and nothing downstream depends on the row being persisted synchronously. Likely candidates:

- **Action execution logs** — `packages/Actions/**` (ActionEngine / action log entity saves around run start/finish).
- **AI Agent Run / Run Step** — already done in `base-agent.ts`; confirm no remaining awaited telemetry saves (e.g. mid-run progress updates).
- **Prompt Runs** — done in `AIPromptRunner.ts`; confirm `AIModelRunner` (embedding runs) uses the same pattern.
- **Communication / notification send logs**, **audit/record-change side writes**, **scheduled-job run logs**, **integration sync logs** — anywhere a "we did X, write a row about it" save is awaited inline.
- **MJServer resolvers** that write an audit/telemetry row before returning a result the client is waiting on.

### Method

1. `grep -rn "await .*\.Save()" packages/ | grep -iE "log|run|audit|track|telemetry|step|history"` as a starting net.
2. For each hit, classify: **(a) part of the success contract** (caller/DB integrity needs it) → leave awaited; **(b) pure observability** → convert using the rules above.
3. Add/extend unit tests asserting ordering (create-before-update) and non-fatal failure handling.

## Done so far (the AIPromptRunner perf pass that spawned this)

- `BaseAIEngine`: memoized `InferenceProviderTypeID` + `IsInferenceProvider()` helper; lazy `ModelsByID` / `VendorsByID` / `ModelTypesByID` / `ConfigurationsByID` / `ModelVendorsByModelID` / `PromptModelsByPromptID` indexes (invalidated in `AdditionalLoading`). Delegated from `AIEngine`.
- `AIPromptRunner`: replaced linear scans with the maps + `model.ModelVendors`; cached parsed `OutputExample`; short-circuit credential evaluation after first hit (tail marked "not-evaluated") with `AIPromptParams.forceFullModelEvaluation` escape hatch; single `resolveScalarInferenceParams` helper feeding both ChatParams and the persisted record; fire-and-forget prompt-run saves.
- `ExecutionPlanner`, `MJAICredentialBindingEntityExtended`, `ai-prompt-form.component` updated to the new engine tooling.
