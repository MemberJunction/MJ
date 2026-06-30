# Follow-up Task: Codebase-wide "Fire-and-Forget" Logging/Telemetry Audit

**Status:** First sweep DONE (2026-06-13) — AIModelRunner + ActionEngineServer converted; see "Sweep results" below. Remaining candidate areas (communication/notification logs, scheduled-job run logs, integration sync logs, MJServer audit resolvers) not yet examined.
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

## Sweep results (2026-06-13)

A third reference implementation now exists for the **singleton** case:
3. **`packages/Actions/Engine/src/generic/ActionEngine.ts`** — `queueLogSave()` / `_logSaveChains`.
   Because `ActionEngineServer` is a long-lived singleton (not per-run like AIPromptRunner/
   AIModelRunner), there's no natural "flush" point, so each chain **self-cleans its Map entry on
   settle** (`current.finally(() => if still latest, delete)`) to avoid unbounded Map growth. Copy
   this variant when converting any singleton's telemetry writes.

### Converted (observability → fire-and-forget)
- **`packages/AI/Prompts/src/AIModelRunner.ts`** — the 3 embedding/model-run `AIPromptRun` saves
  (create 'Running' + complete + fail). Per-instance chain + `WaitForPendingPromptRunSaves()`.
  Tested: `AIModelRunner.fire-and-forget.test.ts`.
- **`packages/Actions/Engine/src/generic/ActionEngine.ts`** — `StartActionLog` INSERT +
  `EndActionLog` UPDATE (and the `StartAndEndActionLog` single-insert path). Singleton self-cleaning
  chain. Verified every `result.LogEntry.ID` consumer (BaseAgent `TargetLogID`, pipeline `logRef`,
  MCPServer `runId`) only reads the **client-generated** ID — none reads back persisted DB state, and
  `AIAgentRunStep.TargetLogID` is a polymorphic soft ref (no hard FK). Existing ActionEngine tests
  updated to the async contract (`vi.waitFor`) + new ordering/self-clean tests added.

### Examined and LEFT (NOT converted — with reason)
- **`packages/APIKeys/Engine/src/UsageLogger.ts`** — the saved log's `ID` is returned to the caller
  as `LogId` in the authorization response; synchronous persistence is part of that contract.
- **`packages/Angular/Explorer/dashboards/src/Scheduling/services/scheduling-instrumentation.service.ts`**
  — user-initiated CRUD; the boolean `Save()` result drives the UI (refresh vs. error). Contract write.
- **`packages/geo/geo-core/src/GeoCodeSyncService.ts`** — the create-row `Save()` **return value drives
  the concurrent-batch race fallback** (on a unique-key violation it loads the existing row), so
  fire-and-forget would break that handling. Left as-is. (The geocoding work is already off the user
  path via the AfterSave hook.)

## Candidate sites to audit (not yet verified — remaining work)

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
