# AI Model Replacement Feature

## Context

When an AI Model is deactivated (`IsActive = false`), prompts that reference it fall back to lesser models based on PowerRank — or fail entirely under the `Specific` selection strategy. There is no way to specify a direct successor model.

**Real-world example**: A developer's prompt was configured to use Gemini 3 Pro. When a new MJ version deactivated that model, the prompt silently fell back to weaker models. The developer had to manually discover the issue and update their prompt to use Gemini 3.1 Pro. If the system knew Gemini 3 Pro's replacement was Gemini 3.1 Pro, it would have automatically substituted.

The `AIModel` entity already has `PriorVersionID` (backward version chain) but no forward-pointing replacement reference. This plan adds `ReplacementModelID` with automatic resolution logic and save-time validation.

---

## Architecture Overview

### New Field
- `ReplacementModelID` on `AIModel` — nullable self-referential FK (same pattern as existing `PriorVersionID`)

### Core Resolution Logic
- Centralized `ResolveActiveModel()` method on `AIEngineBase` — walks the replacement chain with cycle detection, type safety, and logging
- Called at all points where a specific model is looked up by ID and checked for `IsActive`
- General model pool filters (PowerRank-based selection) remain unchanged — they should only return active models

### Save-Time Validation
- Override `ValidateAsync()` in `MJAIModelEntityExtended` to enforce that `ReplacementModelID` (when set) references a model with the same `AIModelTypeID`
- Uses `RunView` for async lookup (avoids circular dependency between `CorePlus` and `BaseAIEngine` packages)

---

## Key Files

| File | Role |
|------|------|
| [MJAIModelEntityExtended.ts](packages/AI/CorePlus/src/MJAIModelEntityExtended.ts) | Entity class — add `ValidateAsync()` override |
| [BaseAIEngine.ts](packages/AI/BaseAIEngine/src/BaseAIEngine.ts) | Add `ResolveActiveModel()` + `followReplacementChain()` |
| [AIEngine.ts](packages/AI/Engine/src/AIEngine.ts) | Add delegation method |
| [AIPromptRunner.ts](packages/AI/Prompts/src/AIPromptRunner.ts) | Update 5 `IsActive` check points |
| [ExecutionPlanner.ts](packages/AI/Prompts/src/ExecutionPlanner.ts) | Update 3 `IsActive` check points |
| [.ai-models.json](metadata/ai-models/.ai-models.json) | Populate `ReplacementModelID` for known model pairs |

---

## Task List

### Task 1: Database Migration
**Create** `migrations/v5/V[TIMESTAMP]__v5.9.x__Add_ReplacementModelID_To_AIModel.sql`

```sql
ALTER TABLE ${flyway:defaultSchema}.AIModel
ADD ReplacementModelID UNIQUEIDENTIFIER NULL;

ALTER TABLE ${flyway:defaultSchema}.AIModel
ADD CONSTRAINT FK_AIModel_ReplacementModel
    FOREIGN KEY (ReplacementModelID)
    REFERENCES ${flyway:defaultSchema}.AIModel(ID);

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a replacement model. When this model is inactive and ReplacementModelID is set, the system automatically substitutes the replacement. Supports transitive chains with cycle detection. The replacement must be of the same AIModelTypeID.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'ReplacementModelID';
```

Do NOT add FK indexes or `__mj` columns — CodeGen handles these.

---

### Task 1.5: Run CodeGen
After the migration is applied to the database, run CodeGen to generate the `ReplacementModelID` property and related infrastructure. **This must complete before any TypeScript code changes** — the generated getter/setter won't exist until CodeGen runs.

CodeGen will automatically:
- Add `ReplacementModelID` getter/setter to `MJAIModelEntity` in [entity_subclasses.ts](packages/MJCoreEntities/src/generated/entity_subclasses.ts)
- Add `ReplacementModelID` field and `MJAIModels_ReplacementModelIDArray` resolver to [generated.ts](packages/MJServer/src/generated/generated.ts) (following the existing `PriorVersionID` pattern)
- Regenerate `vwAIModels` view to include the new column
- Regenerate `spCreateAIModel` and `spUpdateAIModel` stored procedures with the new `@ReplacementModelID` parameter
- Create FK index `IDX_AUTO_MJ_FKEY_AIModel_ReplacementModelID`
- Insert `EntityField` metadata record

---

### Task 2: Entity Validation in MJAIModelEntityExtended
**File**: [MJAIModelEntityExtended.ts](packages/AI/CorePlus/src/MJAIModelEntityExtended.ts)

Override `ValidateAsync()` to enforce that `ReplacementModelID` (when set) references a model with the same `AIModelTypeID`. The base entity save flow at [baseEntity.ts:1974](packages/MJCore/src/generic/baseEntity.ts#L1974) calls `ValidateAsync()` and merges results with sync `Validate()`.

**Critical**: Must also override `DefaultSkipAsyncValidation` to return `false`. The base class defaults to `true` (skipping async validation entirely — see [baseEntity.ts:2460-2462](packages/MJCore/src/generic/baseEntity.ts#L2460-L2462)). Without this override, `ValidateAsync()` will never be called during `Save()`.

**Reference implementation**: [MJAICredentialBindingEntityExtended.ts](packages/AI/BaseAIEngine/src/MJAICredentialBindingEntityExtended.ts) — uses the exact same pattern (override `ValidateAsync()` + `DefaultSkipAsyncValidation`, use `RunView` for lookup, `UUIDsEqual` for comparison).

**Imports to add**:
```typescript
import { RunView, ValidationResult, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
```

**Approach**:
1. Override `DefaultSkipAsyncValidation` to return `false`
2. Override `ValidateAsync()`:
   - Call `super.ValidateAsync()` first
   - If `ReplacementModelID` is null, skip (valid — replacement is optional)
   - If `ReplacementModelID` equals `this.ID` (self-reference), add `ValidationErrorInfo`: "A model cannot be its own replacement." (runtime cycle detection also catches this, but save-time validation provides better UX)
   - If `ReplacementModelID` is set, use `RunView` with `ResultType: 'simple'` and `Fields: ['ID', 'AIModelTypeID']` to load the replacement model
   - If replacement model doesn't exist, add `ValidationErrorInfo` with `ValidationErrorType.Failure`
   - Compare `AIModelTypeID` using `UUIDsEqual()` — if mismatch, add `ValidationErrorInfo` with field name `'ReplacementModelID'` and a clear message

**Why `ValidateAsync()` instead of `Validate()`**: Looking up the replacement model requires a data query. `Validate()` is synchronous and cannot do async lookups. `ValidateAsync()` is designed for exactly this.

**Why not use `AIEngineBase.Instance.Models`**: `CorePlus` cannot import `BaseAIEngine` without creating a circular dependency (`BaseAIEngine` already depends on `CorePlus`). `RunView` from `@memberjunction/core` is already a dependency.

---

### Task 3: Add `ResolveActiveModel()` to AIEngineBase
**File**: [BaseAIEngine.ts](packages/AI/BaseAIEngine/src/BaseAIEngine.ts)

Add `LogStatus` to the imports from `@memberjunction/core` (line 1 — currently only `LogError` is imported).

Add two methods after `GetConfigurationChain()` (which ends at line 751), following the same chain-walking pattern:

**`ResolveActiveModel(modelId: string, models?: MJAIModelEntityExtended[]): MJAIModelEntityExtended | null`** — Public. Accepts an optional `models` array; if omitted, uses `this._models` (the cached singleton data). If the model is active, returns it immediately (zero overhead common case). If inactive, calls `followReplacementChain()`.

The optional parameter is needed because `ExecutionPlanner` receives `allModels` as a method parameter (not from the singleton). Callers like `AIPromptRunner` that access `AIEngine.Instance.Models` directly can omit it.

**`followReplacementChain(startModel, models): MJAIModelEntityExtended | null`** — Private. Walks the `ReplacementModelID` chain within the given `models` array:
- Cycle detection via `Set<string>` with `NormalizeUUID()` keys (both already imported from `@memberjunction/global`)
- Type safety — replacement must have same `AIModelTypeID` as original model
- Missing/nonexistent replacement — return `null` with `LogStatus()` message
- Transparency — log the full chain on successful resolution (e.g., `"Model replacement resolved: Gemini 3 Pro -> Gemini 3.1 Pro (active)"`)
- Return `null` on any failure, allowing callers to fall back to existing PowerRank selection

---

### Task 4: Add Delegation in AIEngine
**File**: [AIEngine.ts](packages/AI/Engine/src/AIEngine.ts)

Add a delegation method after the existing method delegation section (~after line 293, following the pattern of methods like `GetConfigurationChain` at lines 241-243):
```typescript
public ResolveActiveModel(modelId: string, models?: MJAIModelEntityExtended[]): MJAIModelEntityExtended | null {
    return this.Base.ResolveActiveModel(modelId, models);
}
```
Note: `AIEngine` accesses `AIEngineBase` via the protected `this.Base` property (lines 103-106).

---

### Task 5: Integrate into AIPromptRunner
**File**: [AIPromptRunner.ts](packages/AI/Prompts/src/AIPromptRunner.ts)

Replace 5 specific-model `IsActive` checks with `ResolveActiveModel()` calls:

| Line | Method | Change |
|------|--------|--------|
| 1666-1668 | `buildCandidatesForExplicitModel()` | Replace `find` + `!model.IsActive` with `ResolveActiveModel()` |
| 1826 | `buildCandidatesFromPromptModels()` | Replace `find` + `!model.IsActive` with `ResolveActiveModel()` |
| 1968 | `addPromptSpecificCandidates()` | Replace `find` + `model.IsActive` with `ResolveActiveModel()` |
| 2009 | `addConfigurationFallbackCandidates()` — parent config models | Replace `find` + `model.IsActive` with `ResolveActiveModel()` |
| 2037 | `addConfigurationFallbackCandidates()` — null config (universal) models | Replace `find` + `model.IsActive` with `ResolveActiveModel()` |

**No change at line 2077** (`getModelPoolForStrategy()`) — general pool filter should only contain active models; replacement logic is for specific model lookups by ID.

**No change at lines 377, 466** — these are `Credential.IsActive` checks (not AI Model), unrelated to this feature.

**Pattern**:
```typescript
// Before
const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID));
if (!model || !model.IsActive) continue;

// After
const model = AIEngine.Instance.ResolveActiveModel(pm.ModelID);
if (!model) continue;
```

---

### Task 5.5: Update selectionReason for Replacement Resolution
**File**: [AIPromptRunner.ts](packages/AI/Prompts/src/AIPromptRunner.ts)

The system tracks why a model was selected via `AIModelSelectionInfo` (defined in [prompt.types.ts:291-326](packages/AI/CorePlus/src/prompt.types.ts#L291-L326)). The `selectionReason` string is built at lines ~1554-1568 and stored in the `AIPromptRun` audit trail (lines ~2425-2442).

When `ResolveActiveModel()` returns a model different from the originally requested one (i.e., a replacement was followed), the `selectionReason` should indicate this. The `ResolveActiveModel()` method should return enough context for the caller to detect this — either by returning the original model ID alongside the resolved model, or by the caller comparing the requested ID against the returned model's ID.

**Approach**: After each `ResolveActiveModel()` call in AIPromptRunner, compare the requested `modelId` against the returned `model.ID`. If they differ (replacement was used), annotate the candidate's source or tag it so the selection reason builder can include text like `"Resolved via replacement chain: Original Model -> Replacement Model"`.

---

### Task 6: Integrate into ExecutionPlanner
**File**: [ExecutionPlanner.ts](packages/AI/Prompts/src/ExecutionPlanner.ts)

**Important**: Unlike `AIPromptRunner`, `ExecutionPlanner` receives `allModels` as a method parameter (not from the singleton). All calls must pass `allModels` as the second argument to `ResolveActiveModel()` to respect the caller's contract.

| Line | Method | Change |
|------|--------|--------|
| ~353 | `createModelSpecificPlan()` | Replace `allModels.find(...)` with `AIEngineBase.Instance.ResolveActiveModel(pm.ModelID, allModels)` |
| 417 | `selectBestModel()` — prompt-specific | Replace `allModels.find(...)` with `AIEngineBase.Instance.ResolveActiveModel(pm.ModelID, allModels)` |
| ~471 | `getAvailableModels()` — prompt-specific | Replace `allModels.find(...)` with `AIEngineBase.Instance.ResolveActiveModel(pm.ModelID, allModels)` |

**No change at lines 425, 486** — general pool filters.

---

### Task 7: Unit Tests

**Test `ResolveActiveModel()` in BaseAIEngine tests**:
1. Returns active model unchanged
2. Returns `null` for unknown model ID
3. Follows single-hop replacement (A inactive -> B active)
4. Follows transitive chain (A -> B -> C active)
5. Detects circular chain (A -> B -> A), returns `null`
6. Detects self-reference (A -> A), returns `null`
7. Returns `null` when replacement is inactive with no further chain
8. Returns `null` on `AIModelTypeID` mismatch
9. Returns `null` when `ReplacementModelID` references nonexistent model
10. Works correctly with explicit `models` array parameter (for ExecutionPlanner usage)
11. Uses `this._models` when `models` parameter is omitted (for AIPromptRunner usage)

**Test `ValidateAsync()` in CorePlus tests**:
1. Passes when `ReplacementModelID` is null
2. Passes when replacement has same `AIModelTypeID`
3. Fails with validation error when replacement has different `AIModelTypeID`
4. Fails with validation error when replacement model doesn't exist
5. Fails with validation error on self-reference (`ReplacementModelID` = own `ID`)

---

### Task 8: Update Metadata for Known Replacements
**File**: [.ai-models.json](metadata/ai-models/.ai-models.json)

For inactive models with known replacements, add `ReplacementModelID` using `@lookup:` references:
```json
{
    "fields": {
        "Name": "Gemini 3 Pro",
        "IsActive": false,
        "ReplacementModelID": "@lookup:MJ: AI Models.Name=Gemini 3.1 Pro"
    }
}
```

Survey existing inactive models and populate replacements where applicable.

---

### Task 9: Build and Verify
1. Build affected packages: `npm run build` in `packages/AI/CorePlus`, `packages/AI/BaseAIEngine`, `packages/AI/Engine`, `packages/AI/Prompts`
2. Run unit tests: `npm run test` in `packages/AI/BaseAIEngine` and `packages/AI/CorePlus`
3. Run existing prompt runner tests: `npm run test` in `packages/AI/Prompts` — verify no regressions

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Active model (common case) | `ResolveActiveModel()` returns immediately — zero overhead |
| Single-hop replacement | A (inactive) -> B (active): returns B, logs chain |
| Multi-hop chain | A -> B -> C (active): follows transitively, logs full chain |
| Self-reference | A -> A: rejected at save-time validation; also caught by runtime cycle detection |
| Circular chain | A -> B -> A: detected via `Set`, returns `null` with log |
| Inactive replacement, no further chain | A -> B (inactive, no replacement): returns `null`, falls through to PowerRank |
| AIModelTypeID mismatch | A (LLM) -> B (Embeddings): rejected at both save-time validation and runtime resolution |
| Missing replacement model | A references nonexistent ID: returns `null` with log |
| `ReplacementModelID` is null | No replacement configured — existing behavior unchanged |
