# PS PR 1 (`#5540`) — Architectural Layering & Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all `AN-BC` `CHANGES_REQUESTED` review comments, CodeQL security alerts, and Gemini 4 Argon adversarial review findings on PR `#5540` by removing all Feature Pipeline concepts from foundational packages (`RecordSetProcessor`, `Scheduling`, `TestingFramework`, core guides), extracting server-side Feature Pipeline execution into `@memberjunction/feature-pipelines-engine`, converting the Version Steward into a scheduled `MJ: Record Processes` row, and unifying `RecordSetProcessor` public interfaces to `PascalCase`.

**Architecture:** Foundational packages (`@memberjunction/record-set-processor-base`, `@memberjunction/record-set-processor`, `@memberjunction/scheduling-engine`, `@memberjunction/testing-engine`) expose generic extension hooks (`RecordProcessorRegistry`, `IRecordProcessor` optional hooks, `BaseTestDriver` registration, `RecordProcessScheduledJobDriver`). `@memberjunction/feature-pipelines` remains browser-safe (spec, validation, cache, version service, run-result builders), while the new `@memberjunction/feature-pipelines-engine` package houses server-side execution (`InferProcessor`, drivers, `@RegisterForStartup` registration of `'Infer'`, `FeaturePipelineGoldenSetDriver`, `FeaturePipelineVersionSteward`, and `StewardFeaturePipelineVersionAction`).

**Tech Stack:** TypeScript 5.9, Node.js ESM (`tsx`, `tsc && tsc-alias`), Angular 21, Vitest, pnpm workspaces, MemberJunction Core / Actions / RecordSetProcessor / Scheduling / TestingFramework.

**Spec:** [`plans/predictive-studio/PR-1-an-bc-review-design.md`](file:///Users/arieglazier/repos/MJ_PR1/plans/predictive-studio/PR-1-an-bc-review-design.md)

## Global Constraints

- **Worktree**: All changes target `/Users/arieglazier/repos/MJ_PR1` (branch `ps/pr-1-feature-pipelines`).
- **NO `git commit` without explicit user approval** (`AGENTS.md` Rule 1 — skip commit steps unless the user explicitly asks to commit).
- **NO `any` or lazy `unknown` types** (`AGENTS.md` Rule 2).
- **NO `.Get()` / `.Set()` as a substitute for generated entity types** (`AGENTS.md` Rule 2b).
- **Derive union types from entities (`SomeEntity['FieldName']`)** (`AGENTS.md` Rule 2c).
- **Never stage or commit local host artifacts** (`packages/GeneratedEntities/**`, `packages/MJAPI/src/generated/**`, `packages/MJExplorer/src/app/generated/**`) (`AGENTS.md` Rule 3c).
- **Browser manifest guard**: `.github/scripts/check-browser-manifest-leakage.mjs` must pass — `@memberjunction/feature-pipelines` must not import `@memberjunction/aiengine`, `@memberjunction/ai-prompts`, `@memberjunction/templates`, or `node:*`.
- **Unit tests**: Every modified package's `npm run build` and `npm run test` must pass (`AGENTS.md` Rule 6).

---

### Task 1: CodeQL & Coding Standards Fixes in `@memberjunction/feature-pipelines`, `@memberjunction/ng-record-process-studio`, and `@memberjunction/ng-core-entity-forms`

**Files:**
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/cache/FeatureValueCacheService.ts:685-705`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/entities/MJFeaturePipelineVersionEntityExtended.ts:8-90`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/Angular/Generic/record-process-studio/src/lib/feature-pipeline-builder/feature-pipeline-builder.component.ts:1342-1357`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/Angular/Generic/record-process-studio/src/lib/record-process-studio/record-process-studio.component.ts:15-28`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/Angular/Explorer/core-entity-forms/src/lib/panels/feature-values/feature-values.logic.ts:1-85`
- Test: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/__tests__/cache.test.ts`
- Test: `/Users/arieglazier/repos/MJ_PR1/packages/Angular/Generic/record-process-studio/src/lib/feature-pipeline-builder/feature-pipeline-builder.component.dom.test.ts`

**Interfaces:**
- Consumes: `SafeJSONParse` from `@memberjunction/global`, `MJFeatureValueEntity` and `MJRecordProcessEntity` from `@memberjunction/core-entities`.
- Produces: Non-polynomial numeric regex in `FeatureValueCacheService.FiniteNumberOf`, prototype-safe property assignment in `FeaturePipelineBuilderComponent.onOutputPropertyChange`, `SafeJSONParse` usage in `MJFeaturePipelineVersionEntityExtended.ParseDetails` and `FeatureValuesPanelModel.DisplayValue`, and entity-derived union types on `FeatureValueRow.Source`, `FeatureValueCard.Source`, and `ProcessRow`.

- [ ] **Step 1: Add regression unit test for numeric strings in `cache.test.ts`**

Add a test in `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/__tests__/cache.test.ts` verifying `FeatureValueCacheService.TypedColumnValuesOf` handles long digit strings with trailing non-numeric characters in O(n) time without backtracking:

```typescript
it('rejects long digit strings with trailing non-numeric characters without polynomial backtracking', () => {
    const start = Date.now();
    const result = FeatureValueCacheService.TypedColumnValuesOf('1'.repeat(5000) + 'a');
    expect(Date.now() - start).toBeLessThan(100);
    expect(result.ValueNumeric).toBeNull();
    expect(result.ValueText).toBe('1'.repeat(5000) + 'a');
});
```

- [ ] **Step 2: Fix polynomial regex in `FeatureValueCacheService.ts` and `SafeJSONParse` in `MJFeaturePipelineVersionEntityExtended.ts`**

In `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/cache/FeatureValueCacheService.ts`:

```typescript
    protected static readonly NUMERIC_STRING_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
```

In `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/entities/MJFeaturePipelineVersionEntityExtended.ts`:
Import `SafeJSONParse` from `@memberjunction/global` and update `ParseDetails`:

```typescript
    protected static ParseDetails(details: string | null): Record<string, unknown> | null {
        if (!details) {
            return null;
        }
        const parsed: unknown = SafeJSONParse<Record<string, unknown>>(details);
        return IsPlainObject(parsed) ? parsed : null;
    }
```

- [ ] **Step 3: Fix prototype-polluting assignment in `feature-pipeline-builder.component.ts` and entity-derived types in `record-process-studio.component.ts` and `feature-values.logic.ts`**

In `/Users/arieglazier/repos/MJ_PR1/packages/Angular/Generic/record-process-studio/src/lib/feature-pipeline-builder/feature-pipeline-builder.component.ts`:

```typescript
    public OnOutputPropertyChange(index: number, prop: 'Name' | 'Ref', event: Event): void {
        if (!this.spec?.Outputs || index < 0 || index >= this.spec.Outputs.length) return;
        const output = this.spec.Outputs[index];
        const val = (event.target as HTMLInputElement).value;
        if (prop === 'Name') {
            output.Name = val;
            if (!output.Ref || output.Ref === `$.${output.Name}`) {
                output.Ref = `$.${val}`;
            }
        } else if (prop === 'Ref') {
            output.Ref = val;
        }
        this.emitSpecChange();
    }
```

In `/Users/arieglazier/repos/MJ_PR1/packages/Angular/Generic/record-process-studio/src/lib/record-process-studio/record-process-studio.component.ts`:
Import `type { MJRecordProcessEntity } from '@memberjunction/core-entities'` and type `ProcessRow`:

```typescript
interface ProcessRow {
    ID: string;
    Name: string;
    Description?: string;
    Entity: string;
    EntityID: string;
    WorkType: MJRecordProcessEntity['WorkType'];
    Status: MJRecordProcessEntity['Status'];
    ScopeType: MJRecordProcessEntity['ScopeType'];
    ScopeFilter?: string;
    ScopeViewID?: string;
    ScopeListID?: string;
}
```

In `/Users/arieglazier/repos/MJ_PR1/packages/Angular/Explorer/core-entity-forms/src/lib/panels/feature-values/feature-values.logic.ts`:
Import `SafeJSONParse` from `@memberjunction/global` and `type { MJFeatureValueEntity } from '@memberjunction/core-entities'`, type `Source: MJFeatureValueEntity['Source']` on `FeatureValueRow` and `FeatureValueCard`, and use `SafeJSONParse` in `DisplayValue`:

```typescript
        if (!isNullish(row.ValueJSON) && row.ValueJSON !== '') {
            const parsed = SafeJSONParse<unknown>(row.ValueJSON);
            return parsed !== null ? JSON.stringify(parsed) : row.ValueJSON;
        }
```

- [ ] **Step 4: Run tests in all 3 packages**

Run:
```bash
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines test
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/Angular/Generic/record-process-studio test
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/Angular/Explorer/core-entity-forms test
```
Expected: PASS.

---

### Task 2: Decouple `@memberjunction/record-set-processor-base` & `@memberjunction/feature-pipelines` and Unify `PascalCase` Base Interfaces

**Files:**
- Move: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/providers/metadata-provider-capabilities.ts` → `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/metadata-provider-capabilities.ts`
- Move: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/feature-pipeline-run-results.ts` → `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/versions/feature-pipeline-run-results.ts`
- Move: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/__tests__/feature-pipeline-run-results.test.ts` → `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/__tests__/feature-pipeline-run-results.test.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/types.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/interfaces.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/registry.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/index.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/index.ts`

**Interfaces:**
- Produces in `@memberjunction/record-set-processor-base`:
  - `MetadataProviderCapabilities` (`RunIsolated`, `IsTransactionalProvider`)
  - `RecordProcessorBuildContext` (adds `Provider?: IMetadataProvider`)
  - `RecordProcessorContext` (100% `PascalCase`: `ContextUser`, `Provider`, `ProcessRunID`, `RecordProcessID`, `EntityID`, `OverwriteHumanValues`, `DryRun`, `TriggeredBy`, `BypassCache`)
  - `RecordSetProcessOptions` (100% `PascalCase`: `Source`, `Processor`, `Tracker`, `ContextUser`, `Provider`, `RecordProcessID`, `ScheduledJobRunID`, `EntityID`, `TriggeredBy`, `BatchSize`, `MaxConcurrency`, `ErrorThresholdPercent`, `DelayBetweenBatchesMs`, `RateLimit`, `Resume`, `MaxRecords`, `OnProgress`, `OnAfterBatch`, `Configuration`, `DryRun`, `SkipUnchanged`, `WatermarkStrategy`, `LastRunAt`, `OverwriteHumanValues`)
  - `ProcessorRunSummaryContext` (`RecordProcessID?: string; Counts: RunCounts; Status: ProcessRunStatusValue; DryRun: boolean; Results: ReadonlyArray<RecordResult>`)
  - `IRecordProcessor` hooks (`ComputeBasisHash?`, `DefaultDryRunSampleSize?`, `FailRunOnRecordError?`, `PrepareOutputMapping?`, `BuildRunSummary?`)
  - `ProcessRunSummary` (`ResultSummary?: unknown; WouldRefuse?: string`)
  - `WriteBackValuePreview` (`{ Name: string; Label?: string; Previous: unknown; Proposed: unknown }`) and `WriteBackResult.previewValues?: WriteBackValuePreview[]`
- Produces in `@memberjunction/feature-pipelines`:
  - `FeaturePipelineRunPin`, `FeaturePipelineRunResult`, `FeaturePipelineRecordResult`, `FeaturePipelineRunResults`

- [ ] **Step 1: Move `MetadataProviderCapabilities` to `@memberjunction/record-set-processor-base` and `FeaturePipelineRunResults` (+ types) to `@memberjunction/feature-pipelines`**

1. Create `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/metadata-provider-capabilities.ts` with `MetadataProviderCapabilities` (`RunIsolated`, `IsTransactionalProvider`) and export it from `packages/RecordSetProcessor/base/src/index.ts`.
2. In `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/providers/metadata-provider-capabilities.ts`, import `MetadataProviderCapabilities` from `@memberjunction/record-set-processor-base` (keeping the internal path working for `FeaturePipelineVersionService.ts`).
3. Move `FeaturePipelineRunPin`, `FeaturePipelineRunResult`, `FeaturePipelineRecordResult extends RecordResult`, and `FeaturePipelineRunResults` into `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/versions/feature-pipeline-run-results.ts` and export from `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/index.ts`.
4. Move `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/__tests__/feature-pipeline-run-results.test.ts` to `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines/src/__tests__/feature-pipeline-run-results.test.ts`.

- [ ] **Step 2: Update `types.ts`, `interfaces.ts`, `registry.ts`, and `index.ts` in `@memberjunction/record-set-processor-base`**

In `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/types.ts`:
- Remove `FeaturePipelineRunPin`, `FeaturePipelineRunResult`, `FeatureValuePreview`, `RecordResult.PipelinePin`, and `RecordResult.PipelineVersion`.
- Update `ProcessRunSummary`:
  ```typescript
  export interface ProcessRunSummary extends RunCounts {
      Status: ProcessRunStatusValue;
      Total: number | null;
      StartTime?: Date;
      EndTime?: Date;
      ErrorMessage?: string;
      /** Optional processor-specific run summary persisted as JSON in `MJ: Process Runs.ResultSummary`. */
      ResultSummary?: unknown;
      /** On a dry run, why a real run would be refused (e.g. a prerequisite or version gate is not met). */
      WouldRefuse?: string;
  }
  ```
- Replace `FeatureValuePreview` / `previewFeatureValues` on `WriteBackResult` with:
  ```typescript
  export interface WriteBackValuePreview {
      Name: string;
      Label?: string;
      Previous: unknown;
      Proposed: unknown;
  }
  ```
  and `previewValues?: WriteBackValuePreview[]` on `WriteBackResult`.

In `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/interfaces.ts`:
- Convert `RecordProcessorContext` and `RecordSetProcessOptions` to 100% `PascalCase`.
- Replace `CurrentRunPin?()` and `CurrentRunRefusal?()` on `IRecordProcessor` with:
  ```typescript
  export interface ProcessorRunSummaryContext {
      RecordProcessID?: string;
      Counts: RunCounts;
      Status: ProcessRunStatusValue;
      DryRun: boolean;
      Results: ReadonlyArray<RecordResult>;
  }

  export interface IRecordProcessor {
      ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult>;
      ProcessBatch?(records: RecordRef[], context: RecordProcessorContext): Promise<Map<string, RecordResult> | RecordResult[]>;
      Preflight?(context: RecordProcessorContext): Promise<void>;
      ComputeBasisHash?(record: RecordRef, context: RecordProcessorContext): Promise<string | undefined>;
      DefaultDryRunSampleSize?: number;
      FailRunOnRecordError?: boolean;
      PrepareOutputMapping?(mapping: Record<string, unknown> | undefined): { OutputMapping?: Record<string, unknown>; HasUnmappedWrites?: boolean };
      BuildRunSummary?(context: ProcessorRunSummaryContext): { ResultSummary?: unknown; WouldRefuse?: string };
  }
  ```

In `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base/src/registry.ts`:
- Add `Provider?: IMetadataProvider` to `RecordProcessorBuildContext`.

- [ ] **Step 3: Build and test `@memberjunction/record-set-processor-base` and `@memberjunction/feature-pipelines`**

Run:
```bash
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base build
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/base test
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines build
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelines test
```
Expected: PASS.

---

### Task 3: Clean `@memberjunction/record-set-processor` of All Feature Pipeline Imports & Unify `PascalCase`

**Files:**
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/package.json`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/index.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/RecordSetProcessor.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/RecordProcessExecutor.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/processors/WriteBackProcessor.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/processors/ActionRecordProcessor.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/processors/AgentRecordProcessor.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/processors/FieldRulesProcessor.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/trackers/GenericProcessRunTracker.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/watermark/WatermarkService.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/writeBack.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/operations/RecordProcessControlOperations.ts`
- Test: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/__tests__/RecordSetProcessor.test.ts`
- Test: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/__tests__/facade.test.ts`
- Test: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/__tests__/processors.test.ts`
- Test: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/__tests__/watermark.test.ts`
- Test: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/__tests__/genericProcessRunTracker.test.ts`
- Test: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/__tests__/recordProcessExecutor.test.ts`
- Test: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/__tests__/RecordProcessRunNowOperation.test.ts`
- Test: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/src/__tests__/writeBackReconcile.test.ts`

**Interfaces:**
- Consumes: `@memberjunction/record-set-processor-base` interfaces from Task 2.
- Produces: Clean `@memberjunction/record-set-processor` with zero `@memberjunction/feature-pipelines` dependency, generic `DeferredRecordWriteSource` (`DeferRecordWritesToWriteBack`, `WriteDeferredRecordValues`, `DiscardDeferredRecordValues`), `DeferredRecordWriteOutcome { Upserted: number; Unchanged: number }`, `PreviewRecordValues(recordID): WriteBackValuePreview[]`, and 100% `PascalCase` `RunRecordProcessOptions`, `WatermarkDecision`, `CheckBatchWatermarksParams`, and `UpdateWatermarkParams`.

- [ ] **Step 1: Update `WriteBackProcessor.ts`, `writeBack.ts`, `WatermarkService.ts`, and `GenericProcessRunTracker.ts`**

1. In `writeBack.ts`: change `import { MetadataProviderCapabilities } from '@memberjunction/feature-pipelines'` to `import { MetadataProviderCapabilities } from '@memberjunction/record-set-processor-base'`.
2. In `WriteBackProcessor.ts`:
   - Remove `@memberjunction/feature-pipelines` import.
   - Define `export interface DeferredRecordWriteOutcome { Upserted: number; Unchanged: number }` and `export interface DeferredRecordWriteSource { DeferRecordWritesToWriteBack(): void; WriteDeferredRecordValues(recordID: string, provider: IMetadataProvider): Promise<DeferredRecordWriteOutcome | null>; DiscardDeferredRecordValues(recordID: string): void }`.
   - Use `PreviewRecordValues(recordID: string): WriteBackValuePreview[]` and assign `writeBack.previewValues = preview`.
   - Forward `DefaultDryRunSampleSize`, `FailRunOnRecordError`, `PrepareOutputMapping`, `BuildRunSummary`, and `ComputeBasisHash` (without `as { ...?: unknown }` casts) to `this.inner`, and add `CanComputeBasisHash(): boolean { return typeof this.inner.ComputeBasisHash === 'function'; }`.
3. In `WatermarkService.ts`:
   - Convert `WatermarkDecision`, `CheckBatchWatermarksParams`, and `UpdateWatermarkParams` to `PascalCase`.
   - Replace `hasComputeBasisHash(processor: unknown)` with a typed check `CanComputeBasisHash(processor: IRecordProcessor | undefined)` that checks `typeof processor?.ComputeBasisHash === 'function'` and (when `CanComputeBasisHash` exists on a decorator like `WriteBackProcessor`) `processor.CanComputeBasisHash() !== false`.
4. In `GenericProcessRunTracker.ts`:
   - Replace `if (summary.FeaturePipeline) { run.ResultSummary = JSON.stringify(summary.FeaturePipeline); }` with `if (summary.ResultSummary !== undefined) { run.ResultSummary = JSON.stringify(summary.ResultSummary); }`.

- [ ] **Step 2: Update `RecordSetProcessor.ts`, `RecordProcessExecutor.ts`, `ActionRecordProcessor.ts`, `AgentRecordProcessor.ts`, `FieldRulesProcessor.ts`, and `RecordProcessControlOperations.ts`**

1. In `RecordSetProcessor.ts`:
   - Use `PascalCase` properties on `RecordSetProcessOptions` and `RecordProcessorContext`.
   - Replace `if (options.FeaturePipeline && status === 'Completed' && counts.Error > 0)` with `if (options.Processor.FailRunOnRecordError && status === 'Completed' && counts.Error > 0) { status = 'Failed'; }`.
   - Collect `RecordResult[]` during the run when `typeof options.Processor.BuildRunSummary === 'function'`, and at completion invoke `options.Processor.BuildRunSummary({ RecordProcessID: options.RecordProcessID, Counts: counts, Status: status, DryRun: options.DryRun === true, Results: collectedResults })` to populate `ResultSummary` and `WouldRefuse` on `ProcessRunSummary`.
2. In `RecordProcessExecutor.ts`:
   - Remove `InferProcessor` and `@memberjunction/feature-pipelines` imports.
   - Convert `RunRecordProcessOptions` to `PascalCase`.
   - Route `WorkType === 'Infer'` through `this.resolveFromRegistry(rp, dryRun, provider)` (passing `Provider: provider` in `RecordProcessorBuildContext`).
   - Use `processor.DefaultDryRunSampleSize` in `DryRunMaxRecords(rp, options, processor)`.
   - Call `base.PrepareOutputMapping?.(outputMapping)` to get enriched `OutputMapping` and `HasUnmappedWrites`.
3. In `ActionRecordProcessor.ts`, `AgentRecordProcessor.ts`, `FieldRulesProcessor.ts`, and `RecordProcessControlOperations.ts`:
   - Update `RecordProcessorContext` and `RunRecordProcessOptions` accesses to `PascalCase`, and read `result.WouldRefuse` in `RecordProcessControlOperations.ts`.

- [ ] **Step 3: Update `packages/RecordSetProcessor/engine/package.json`, `src/index.ts`, and unit tests**

- Remove `@memberjunction/feature-pipelines` and `@memberjunction/entity-documents` from `packages/RecordSetProcessor/engine/package.json`.
- Remove Feature Pipeline exports (`InferProcessor`, `BaseFeaturePipelineDriver`, etc.) from `packages/RecordSetProcessor/engine/src/index.ts` (moving those source and test files in Task 4).
- Update the remaining 8 unit test files in `packages/RecordSetProcessor/engine/src/__tests__/` to use `PascalCase` option/context properties and generic processor hooks.

- [ ] **Step 4: Build and test `@memberjunction/record-set-processor`**

Run:
```bash
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine build
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine test
```
Expected: PASS.

---

### Task 4: Create `@memberjunction/feature-pipelines-engine` and Move Execution, Golden-Set Driver, and Version Steward

**Files:**
- Create: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelinesEngine/package.json`
- Create: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelinesEngine/tsconfig.json`
- Create: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelinesEngine/vitest.config.ts`
- Create: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelinesEngine/src/index.ts`
- Create: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelinesEngine/src/startup/FeaturePipelineStartup.ts`
- Create: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelinesEngine/src/actions/StewardFeaturePipelineVersionAction.ts`
- Move from `packages/RecordSetProcessor/engine/src/`:
  - `processors/InferProcessor.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/processors/InferProcessor.ts`
  - `processors/FeaturePipelineEscalation.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/processors/FeaturePipelineEscalation.ts`
  - `processors/FeaturePipelineHumanValueGuard.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/processors/FeaturePipelineHumanValueGuard.ts`
  - `processors/FeaturePipelineErrors.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/processors/FeaturePipelineErrors.ts`
  - `feature-pipeline-drivers/BaseFeaturePipelineDriver.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/drivers/BaseFeaturePipelineDriver.ts`
  - `feature-pipeline-drivers/LLMFeaturePipelineDriver.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/drivers/LLMFeaturePipelineDriver.ts`
  - `feature-pipeline-drivers/DecisionFeaturePipelineDriver.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/drivers/DecisionFeaturePipelineDriver.ts`
  - All 11 Feature Pipeline test files + `helpers/cache-entry.ts` + `history-store-double.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/__tests__/`
- Move from `packages/TestingFramework/Engine/src/drivers/`:
  - `FeaturePipelineGoldenSetDriver.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/testing/FeaturePipelineGoldenSetDriver.ts`
  - `golden-set-scoring.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/testing/golden-set-scoring.ts`
  - `golden-label-quality.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/testing/golden-label-quality.ts`
  - `FeaturePipelineGoldenSetDriver.test.ts`, `golden-set-scoring.test.ts`, `golden-label-quality.test.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/__tests__/`
- Move from `packages/Scheduling/engine/src/`:
  - `FeaturePipelineVersionSteward.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/steward/FeaturePipelineVersionSteward.ts`
  - `__tests__/FeaturePipelineVersionSteward.test.ts` → `packages/AI/Knowledge/FeaturePipelinesEngine/src/__tests__/FeaturePipelineVersionSteward.test.ts`
- Delete: `/Users/arieglazier/repos/MJ_PR1/packages/Scheduling/engine/src/drivers/FeaturePipelineVersionStewardDriver.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/Scheduling/engine/package.json`, `src/index.ts`, `src/drivers/index.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/Engine/package.json`, `src/index.ts`, `src/drivers/index.ts`

**Interfaces:**
- Consumes: `@memberjunction/feature-pipelines`, `@memberjunction/record-set-processor-base`, `@memberjunction/record-set-processor`, `@memberjunction/testing-engine`, `@memberjunction/actions`, `@memberjunction/actions-base`.
- Produces: `@memberjunction/feature-pipelines-engine` exporting `InferProcessor`, `RegisterInferRecordProcessor`, `FeaturePipelineStartup`, `BaseFeaturePipelineDriver`, `LLMFeaturePipelineDriver`, `DecisionFeaturePipelineDriver`, `FeaturePipelineEscalation`, `FeaturePipelineHumanValueGuard`, `FeaturePipelineErrors`, `FeaturePipelineGoldenSetDriver`, `GoldenSetScorer`, `GoldenLabelQualityCheck`, `FeaturePipelineVersionSteward`, and `StewardFeaturePipelineVersionAction`.

- [ ] **Step 1: Create `packages/AI/Knowledge/FeaturePipelinesEngine` (`package.json`, `tsconfig.json`, `vitest.config.ts`) and move files**

Create `package.json`:
```json
{
  "name": "@memberjunction/feature-pipelines-engine",
  "type": "module",
  "version": "6.2.0-edge.4",
  "description": "MemberJunction: Feature Pipelines Engine - server-side execution, drivers, golden-set test driver, and version steward for Knowledge Hub Feature Pipelines.",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "/dist"
  ],
  "scripts": {
    "build": "tsc && tsc-alias -f",
    "watch": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "author": "MemberJunction.com",
  "license": "BUSL-1.1",
  "dependencies": {
    "@memberjunction/actions": "6.2.0-edge.4",
    "@memberjunction/actions-base": "6.2.0-edge.4",
    "@memberjunction/ai": "6.2.0-edge.4",
    "@memberjunction/ai-core-plus": "6.2.0-edge.4",
    "@memberjunction/ai-prompts": "6.2.0-edge.4",
    "@memberjunction/aiengine": "6.2.0-edge.4",
    "@memberjunction/core": "6.2.0-edge.4",
    "@memberjunction/core-entities": "6.2.0-edge.4",
    "@memberjunction/entity-documents": "6.2.0-edge.4",
    "@memberjunction/feature-pipelines": "6.2.0-edge.4",
    "@memberjunction/global": "6.2.0-edge.4",
    "@memberjunction/record-set-processor": "6.2.0-edge.4",
    "@memberjunction/record-set-processor-base": "6.2.0-edge.4",
    "@memberjunction/templates": "6.2.0-edge.4",
    "@memberjunction/testing-engine": "6.2.0-edge.4",
    "@memberjunction/testing-engine-base": "6.2.0-edge.4"
  },
  "devDependencies": {
    "@memberjunction/unit-testing": "6.2.0-edge.4",
    "@types/node": "24.10.11",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/MemberJunction/MJ"
  }
}
```

- [ ] **Step 2: Implement generic `IRecordProcessor` hooks on `InferProcessor` and create `FeaturePipelineStartup` & `StewardFeaturePipelineVersionAction`**

1. In `InferProcessor.ts`:
   - Set `public readonly DefaultDryRunSampleSize = 25;` and `public readonly FailRunOnRecordError = true;`.
   - Implement `DeferRecordWritesToWriteBack()`, `WriteDeferredRecordValues()`, `DiscardDeferredRecordValues()`, and `PreviewRecordValues()` (producing `{ Name: f.FeatureName, Label: `${f.FeatureName} (feature value)`, Previous: f.Previous, Proposed: f.Proposed }`).
   - Implement `PrepareOutputMapping(mapping)` (populating `fieldLookups` from `this.spec?.Outputs` and returning `HasUnmappedWrites: this.spec?.Outputs?.some((o) => !OutputTargets.HasWriteTarget(o)) === true`).
   - Implement `BuildRunSummary(context: ProcessorRunSummaryContext)` calling `FeaturePipelineRunResults.Build(context.RecordProcessID || '', context.Counts, context.Results, context.Status, this.CurrentRunPin(), this.CurrentRunRefusal(), context.DryRun)`.
   - Update all `RecordProcessorContext` accesses to `PascalCase`.
2. Create `src/startup/FeaturePipelineStartup.ts`:
   ```typescript
   import { IMetadataProvider, IStartupSink, LogStatusEx, RegisterForStartup, UserInfo } from '@memberjunction/core';
   import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
   import { BaseSingleton } from '@memberjunction/global';
   import { RecordProcessorRegistry, type RecordProcessorBuildContext } from '@memberjunction/record-set-processor-base';
   import { InferProcessor } from '../processors/InferProcessor';

   export function RegisterInferRecordProcessor(): void {
       RecordProcessorRegistry.Instance.Register('Infer', (context: RecordProcessorBuildContext) => {
           const rp = context.RecordProcess as MJRecordProcessEntity | undefined;
           if (!rp) {
               throw new Error(`Record Process '${context.RecordProcessName || context.RecordProcessID || 'unknown'}': WorkType=Infer requires the loaded MJRecordProcessEntity on RecordProcessorBuildContext.RecordProcess`);
           }
           return InferProcessor.FromRecordProcess(rp, context.Provider);
       });
   }

   @RegisterForStartup({
       description: 'Feature Pipeline Infer processor registration',
   })
   export class FeaturePipelineStartup extends BaseSingleton<FeaturePipelineStartup> implements IStartupSink {
       public static get Instance(): FeaturePipelineStartup {
           return super.getInstance<FeaturePipelineStartup>();
       }
       protected constructor() {
           super();
       }
       public async HandleStartup(_contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
           RegisterInferRecordProcessor();
           LogStatusEx({
               message: '[FeaturePipelineStartup] Registered Infer processor for Record Set Processing.',
               verboseOnly: true,
           });
       }
   }
   ```
   Also call `RegisterInferRecordProcessor()` when `@memberjunction/feature-pipelines-engine` module is imported so unit/integration tests that import `@memberjunction/feature-pipelines-engine` without running `StartupManager` have `'Infer'` registered automatically.
3. In `FeaturePipelineVersionSteward.ts` and `StewardFeaturePipelineVersionAction.ts`:
   - Add `StewardPipelineByID(recordProcessID: string, p: StewardRunParams): Promise<StewardOutcome[]>` to `FeaturePipelineVersionSteward`.
   - Create `StewardFeaturePipelineVersionAction` (`@RegisterClass(BaseAction, 'Steward Feature Pipeline Version')`) in `src/actions/StewardFeaturePipelineVersionAction.ts` with unit tests in `src/__tests__/FeaturePipelineVersionSteward.test.ts`.

- [ ] **Step 3: Clean `@memberjunction/scheduling-engine` and `@memberjunction/testing-engine` and build/test all 3 packages**

1. Remove `FeaturePipelineVersionStewardDriver.ts`, `FeaturePipelineVersionSteward.ts`, and `@memberjunction/feature-pipelines` + `@memberjunction/testing-engine` from `packages/Scheduling/engine`.
2. Remove `FeaturePipelineGoldenSetDriver.ts`, `golden-set-scoring.ts`, `golden-label-quality.ts`, and `@memberjunction/feature-pipelines` + `@memberjunction/record-set-processor` from `packages/TestingFramework/Engine`.
3. Run:
   ```bash
   pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/Scheduling/engine build && pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/Scheduling/engine test
   pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/Engine build && pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/Engine test
   pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelinesEngine build && pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelinesEngine test
   ```
   Expected: PASS.

---

### Task 5: Update Downstream Callers (`PredictiveStudio`, `CoreActions`, `RecordChanges`, `RecordCloning`, `ng-entity-action-ux`, `ServerBootstrap`)

**Files:**
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/AI/PredictiveStudio/Engine/src/operations/run-feature-pipeline.operation.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/AI/PredictiveStudio/Engine/src/operations/__tests__/run-feature-pipeline.operation.test.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/AI/PredictiveStudio/Engine/src/scoring/MLScoringRecordProcessor.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/AI/PredictiveStudio/Engine/src/scoring/__tests__/MLScoringRecordProcessor.test.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/Actions/CoreActions/src/custom/data/run-record-process.action.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/Actions/CoreActions/src/__tests__/run-record-process.action.test.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordChanges/src/RecordChangeProcessTrigger.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordChanges/src/__tests__/RecordChangeProcessTrigger.test.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordCloning/engine/src/CloneRecordProcessor.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordCloning/engine/src/__tests__/CloneRecordProcessor.test.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/Angular/Generic/entity-action-ux/src/lib/write-back-preview.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/Angular/Generic/entity-action-ux/src/__tests__/write-back-preview.test.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/ServerBootstrap/package.json` & `src/generated/mj-class-registrations.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/ServerBootstrapLite/package.json` & `src/generated/mj-class-registrations.ts`

**Interfaces:**
- Consumes: `PascalCase` `RecordProcessorContext`, `RecordSetProcessOptions`, `RunRecordProcessOptions`, `ProcessRunSummary.WouldRefuse`, and `WriteBackValuePreview` (`previewValues`).
- Produces: Updated downstream callers and server bootstrap manifests registering `@memberjunction/feature-pipelines-engine` classes (`FeaturePipelineStartup`, `LLMFeaturePipelineDriver`, `DecisionFeaturePipelineDriver`, `FeaturePipelineGoldenSetDriver`, `StewardFeaturePipelineVersionAction`).

- [ ] **Step 1: Update `PredictiveStudio/Engine`, `CoreActions`, `RecordChanges`, `RecordCloning`, and `ng-entity-action-ux`**

1. In `run-feature-pipeline.operation.ts` and `run-feature-pipeline.operation.test.ts`: use `PascalCase` `RunRecordProcessOptions` (`ContextUser`, `Provider`, `TriggeredBy`, `SingleRecordID`, `DryRun`, `OverwriteHumanValues`, `Scope`, `OnProgress`) and read `result.WouldRefuse`.
2. In `MLScoringRecordProcessor.ts` & test, `run-record-process.action.ts` & test, `RecordChangeProcessTrigger.ts` & test, and `CloneRecordProcessor.ts` & test: update `RecordProcessorContext` / `RunRecordProcessOptions` properties to `PascalCase`.
3. In `packages/Angular/Generic/entity-action-ux/src/lib/write-back-preview.ts` & test: replace `FeatureValuePreview` / `previewFeatureValues` with `WriteBackValuePreview` / `previewValues` (`Field: p.Label || p.Name`).
4. In `packages/ServerBootstrap` and `packages/ServerBootstrapLite`: add `@memberjunction/feature-pipelines-engine` to `package.json` and update `mj-class-registrations.ts` so `FeaturePipelineGoldenSetDriver`, `LLMFeaturePipelineDriver`, `DecisionFeaturePipelineDriver`, and `StewardFeaturePipelineVersionAction` are imported from `@memberjunction/feature-pipelines-engine` (and `FeaturePipelineVersionStewardDriver` is removed).

- [ ] **Step 2: Build and run unit tests across all updated packages + verify browser manifest guard**

Run:
```bash
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/AI/PredictiveStudio/Engine test
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/Actions/CoreActions test -- src/__tests__/run-record-process.action.test.ts
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/RecordChanges test
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/RecordCloning/engine test
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/Angular/Generic/entity-action-ux test
node /Users/arieglazier/repos/MJ_PR1/.github/scripts/check-browser-manifest-leakage.mjs
```
Expected: All tests and the browser manifest leakage check PASS.

---

### Task 6: Seed Version Steward Metadata, Extend Integration Test Suite, and Clean Documentation

**Files:**
- Delete: `/Users/arieglazier/repos/MJ_PR1/metadata/scheduled-job-types/.feature-pipeline-version-steward-type.json`
- Create: `/Users/arieglazier/repos/MJ_PR1/metadata/actions/.feature-pipeline-version-steward.json`
- Create: `/Users/arieglazier/repos/MJ_PR1/metadata/record-processes/.feature-pipeline-version-steward.json`
- Modify: `/Users/arieglazier/repos/MJ_PR1/metadata/scheduled-jobs/.feature-pipeline-version-steward-job.json`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/package.json`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/lib/golden-label-quality-rig.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/src/checks/feature-pipeline-core.checks.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/src/checks/feature-value-only.checks.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/src/checks/fp-gate-c2-1.checks.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/src/checks/fp-gate-c2-2.checks.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/src/checks/fp-gate-c2-3.checks.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/src/checks/fp-gate-c2-5.checks.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/src/checks/fp-gates/feature-pipeline-gate-stub-driver.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/src/checks/fp-gates/fp-gate-fixture.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/src/checks/fp-live-jobtitle.checks.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite/src/pipeline-type-measurement/processors.ts`
- Modify: `/Users/arieglazier/repos/MJ_PR1/guides/RECORD_SET_PROCESSING_GUIDE.md`
- Modify: `/Users/arieglazier/repos/MJ_PR1/guides/PREDICTIVE_STUDIO_GUIDE.md`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/RecordSetProcessor/engine/README.md`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/Scheduling/engine/README.md`
- Modify: `/Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/Engine/README.md`
- Create: `/Users/arieglazier/repos/MJ_PR1/packages/AI/Knowledge/FeaturePipelinesEngine/README.md`

- [ ] **Step 1: Update Version Steward metadata files**

1. Delete `/Users/arieglazier/repos/MJ_PR1/metadata/scheduled-job-types/.feature-pipeline-version-steward-type.json`.
2. Create `/Users/arieglazier/repos/MJ_PR1/metadata/actions/.feature-pipeline-version-steward.json` (Action `"Steward Feature Pipeline Version"`, `ID: "8C4E9A12-3B7D-4F6E-9A2C-5D8E1B4F7A90"`, `DriverClass: "Steward Feature Pipeline Version"`, input param `RecordProcessID`, output params `Outcomes`, `Version`, `LastAction`, `Detail`, and `Run Record Processes` authorization).
3. Create `/Users/arieglazier/repos/MJ_PR1/metadata/record-processes/.feature-pipeline-version-steward.json` (`ID: "A6E7D1B2-5439-4E8B-9C1D-7F3E2A1B4C5D"`, `Name: "Feature Pipeline Version Steward"`, `EntityID: "@lookup:MJ: Entities.Name=MJ: Record Processes"`, `CategoryID: "@lookup:MJ: Record Process Categories.Name=Feature Pipeline"`, `WorkType: "Action"`, `ActionID: "@lookup:MJ: Actions.Name=Steward Feature Pipeline Version"`, `InputMapping: "{\"RecordProcessID\":\"recordId\"}"`, `ScopeType: "Filter"`, `ScopeFilter: "WorkType='Infer' AND Status='Active'"`, `SkipUnchanged: false`, `Status: "Active"`, `ScheduleEnabled: true`, `CronExpression: "0 */15 * * * *"`, `Timezone: "UTC"`).
4. Update `/Users/arieglazier/repos/MJ_PR1/metadata/scheduled-jobs/.feature-pipeline-version-steward-job.json` to use `JobTypeID: "@lookup:MJ: Scheduled Job Types.DriverClass=RecordProcessScheduledJobDriver"` and `Configuration: { "RecordProcessID": "A6E7D1B2-5439-4E8B-9C1D-7F3E2A1B4C5D" }`.

- [ ] **Step 2: Update `integration-test-suite` imports & `PascalCase` options, and add `FP8` & `FP9` checks**

1. Add `@memberjunction/feature-pipelines-engine` to `packages/TestingFramework/integration-test-suite/package.json`.
2. Update imports of `InferProcessor`, `BaseFeaturePipelineDriver`, `GoldenLabelQualityCheck`, etc. in `integration-test-suite` to `@memberjunction/feature-pipelines-engine` and update `RecordSetProcessor.Instance.Process(...)` / `RecordProcessExecutor.RunByID(...)` calls to `PascalCase`.
3. In `feature-pipeline-core.checks.ts`, add:
   - `FP8`: Verifies `RecordProcessorRegistry.Instance.Has('Infer')` is `true` and `new RecordProcessExecutor().BuildProcessor(rp, false, ctx.Provider)` resolves and executes the `Infer` processor through the registry.
   - `FP9`: Verifies `FeaturePipelineVersionSteward.Instance.StewardPipelineByID(fx.RecordProcessID, { ContextUser: ctx.User, Provider: ctx.Provider })` (the body of `StewardFeaturePipelineVersionAction`) plans and reports the version stewardship outcome for the bundle's pipeline.

- [ ] **Step 3: Clean `guides/RECORD_SET_PROCESSING_GUIDE.md` & core READMEs, and document in `PREDICTIVE_STUDIO_GUIDE.md` & `FeaturePipelinesEngine/README.md`**

1. Remove Feature Pipeline specifics from `guides/RECORD_SET_PROCESSING_GUIDE.md`, `packages/RecordSetProcessor/engine/README.md`, `packages/Scheduling/engine/README.md`, and `packages/TestingFramework/Engine/README.md`.
2. Add the Feature Pipeline dry-run, `FeaturePipelineRunResult`, `FeaturePipelineGoldenSetDriver`, and scheduled `Feature Pipeline Version Steward` Record Process documentation to `guides/PREDICTIVE_STUDIO_GUIDE.md` and `packages/AI/Knowledge/FeaturePipelinesEngine/README.md`.

- [ ] **Step 4: Run `integration-test-suite` build and unit tests + final Gemini 4 Argon verification pass**

Run:
```bash
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite build
pnpm --dir /Users/arieglazier/repos/MJ_PR1/packages/TestingFramework/integration-test-suite test
```
And verify zero Feature Pipeline references remain in foundational packages:
```bash
git -C /Users/arieglazier/repos/MJ_PR1 grep -ni "feature[- ]pipeline" packages/RecordSetProcessor/ packages/Scheduling/ packages/TestingFramework/Engine/ guides/RECORD_SET_PROCESSING_GUIDE.md
```
Expected: Build and unit tests PASS, and `git grep` returns zero unwanted matches in foundational packages.
