# PR 2 (#5978) Coding-Standards Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring PR #5978 into line with `coding_standards.md` in place: gates on MJ's Testing Framework (PR 1's layout), gate correctness bugs fixed, the truth-suite framework and dead code removed, product-code violations fixed, unrelated changes out.

**Architecture:** Each PR 2 gate becomes a `NamedCheck` bundle in `@memberjunction/integration-test-suite` plus one `MJ: Tests` record, grouped in the suite "Predictive Studio Gates — Containment" and run by `mj test suite`. The truth-suite package keeps the datasets (generators, loader, catalog) and the harness the checks call; its own registry, runner, report and stubs are deleted. Refusals travel as typed `ResultCode`s on the remote-operation result, so gates never read error text.

**Tech Stack:** TypeScript (ESM), Vitest, Angular 21, Python 3.11/3.12 (FastAPI, scikit-learn, pytest, mypy), SQL Server, MJ Testing Framework (`@memberjunction/testing-integration`, `@memberjunction/testing-engine`).

**Spec:** [`PR-2-standards-cleanup-design.md`](PR-2-standards-cleanup-design.md) (amended in Task 0). Standard: `/Users/arieglazier/repos/MJ_20260925/coding_standards.md`.

## Global Constraints

- Branch `ps/pr-2-truth-suite-containment`; it must track `origin/ps/pr-2-truth-suite-containment` (`git branch -vv`) before any push. Never push to `next`/`main`.
- Stage files explicitly (`git add <path>`); never `git add -A`/`.`. Never commit `mj.config.cjs`, `packages/GeneratedEntities/**`, `packages/MJAPI/src/generated/**`, `packages/MJExplorer/src/app/generated/**`.
- No `git checkout --`, `git restore`, `git reset --hard`. Revert a file to `next` with `git show origin/next:<path> > <path>` only for a file that exists on `next`; delete new files with `git rm`.
- No `any`; no net-new `unknown` without a justifying comment; derive unions from entities (`MJMLModelEntity['Status']`); PascalCase for public/exported members and functions; camelCase for `private`; static methods on the owning class, not free functions; `||` for fallbacks except where 0 is a legitimate value (comment it); `===`/`!==` only.
- No migration under `migrations/`; no PostgreSQL work; no new database columns.
- Deprecated stubs that exist on `origin/next` stay; shims this PR added are deleted (spec D8).
- Every task ends with the touched packages built (`cd <pkg> && pnpm run build`) and tested (`pnpm test`), counts recorded in the commit body.
- One private database: `MJ_PS_PR2_final` (already provisioned). Before any `mj migrate`/`codegen`/`sync push`, confirm no other session uses it.
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014V9eKSHb4FKFJ3rMpoL58i
  ```

## Review Focus

1. **Operation crashes during a refusal gate** (sidecar down, GraphQL error, timeout) — the gate must FAIL, not count a refusal. Pinned in Task 1 (`refusal-codes.test.ts`, "EXECUTION_ERROR is not a refusal") and Task 7 (`containment-probe.test.ts`).
2. **A model with no stored importance kind** (trained before this change) — global drivers stay hidden (fail closed). Pinned in Task 2 (`importance-display.test.ts`).
3. **A model whose Lineage has no outcome config and a target name that implies nothing** — risk is not inverted. Pinned in Task 3 (`at-risk-rules.test.ts`, "no polarity → no inversion").
4. **A dataset load that fails half-way** — the table must not keep the previous dataset's stamp. Pinned in Task 7 (`dataset-loader.db.test.ts`).
5. **The LLM judge returns an unparseable answer for a story** — G0.6 must fail with the judge message, not pass. Pinned in Task 9 (`ps-gate-judge.test.ts`).

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/AI/PredictiveStudio/Core/src/refusal-codes.ts` (new) | `PredictiveStudioRefusalCode` union + `PredictiveStudioRefusalCodes` constants (browser-safe, shared by Engine and harness) |
| `packages/AI/PredictiveStudio/Engine/src/operations/refusals.ts` (new) | Maps PS refusal errors to `ResultCode`s; one `ExecuteServer` body shared by the two operations |
| `packages/AI/PredictiveStudio/Core/src/importance-display.ts` | Reads the stored importance kind instead of an algorithm-name list |
| `packages/AI/PredictiveStudio/Core/src/at-risk-rules.ts` | At-risk derivations; PascalCase; polarity from `ResolveOutcomeConfig` |
| `packages/AI/PredictiveStudio/Core/src/trust.ts` | Trust verdict logic as statics on `TrustVerdicts` |
| `packages/AI/PredictiveStudio/TruthSuite/src/harness/*` | Harness the gate checks call (kept, cleaned) |
| `packages/AI/PredictiveStudio/TruthSuite/src/db/dataset-loader.ts` (new) | One transactional loader for every dataset kind |
| `packages/TestingFramework/integration-test-suite/src/checks/ps-gates/ps-gate-fixture.ts` (new) | Harness adapter + `PsGate.Assert` + lifecycle |
| `packages/TestingFramework/integration-test-suite/src/checks/ps-gate-*.checks.ts` (new, 13 files) | One bundle per gate + the dataset bundle |
| `metadata-optional/integration-test/tests/gates/.gate-*.json`, `.ps-truth-datasets-load.json` (new) | One `MJ: Tests` record per bundle |
| `metadata-optional/integration-test/test-suites/.ps-gates-containment-suite.json`, `.ps-gates-pending-suite.json` (new) | The two suites |

---

### Task 0: Amend the spec to match the code

The investigation for this plan found six places where the spec does not fit the code. Record them before implementing.

**Files:**
- Modify: `plans/predictive-studio/PR-2-standards-cleanup-design.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Add a "Spec amendments (2026-10-23, from planning)" section after §7**

```markdown
## 8. Spec amendments (2026-10-23, from planning)

| # | Amends | Change | Why |
|---|---|---|---|
| A1 | §3.1, §4 | The harness stays in the truth-suite package (`src/harness`); `checks/ps-gates/` holds only a thin adapter. | Both packages are private, so `integration-test-suite` can depend on the truth suite; moving ~1,000 lines across packages adds diff without changing behaviour (§13). |
| A2 | §4.2 | Per-dataset tables stay; only the five never-loaded tables are dropped. | The loader deletes and reloads one table per dataset; sharing W1–W8 tables would change which rows an already-trained fixture model scores between gates. With CodeGen at provision the tables add no committed lines. |
| A3 | §4.2 | `provision.mjs` keeps regenerating `.pstruth-entities.json` after `mj sync push`. | The generator is the file's source of truth; committing sync blocks would dirty the tree on every provision. |
| A4 | §5.1 | Polarity comes from `ResolveOutcomeConfig(model).Polarity` (explicit config in Lineage first, its existing default otherwise). | `ResolveOutcomeConfig` already exists on `next`; this removes the second, divergent rule (§3 "unify divergent predicates"). Replacing the existing resolver's default is outside this PR. |
| A5 | §3.1 | G0.2/G0.3 join a second suite, "Predictive Studio Gates — Pending (PR 4)". | `sibling-parity.test.ts` requires every `tests/gates/` record to be in a `.ps-gates-*` suite. Status stays `Pending`. |
| A6 | §5.2 | Refusal codes travel as `RemoteOpResult.ResultCode`, set by a shared `ExecuteServer` override in the two PS operations. | `BaseRemotableOperation.ExecuteServer` maps every throw to `EXECUTION_ERROR`; changing MJCore is outside the PR's scope. `ResultCode` already crosses GraphQL (`graphQLDataProvider.ts:2044`). |
```

- [ ] **Step 2: Commit**

```bash
git add plans/predictive-studio/PR-2-standards-cleanup-design.md
git commit -m "docs(predictive-studio): amend the cleanup spec with what planning found"
```

---

### Task 1: Typed refusal codes on Train and Score

**Files:**
- Create: `packages/AI/PredictiveStudio/Core/src/refusal-codes.ts`
- Modify: `packages/AI/PredictiveStudio/Core/src/index.ts`
- Create: `packages/AI/PredictiveStudio/Engine/src/operations/refusals.ts`
- Modify: `packages/AI/PredictiveStudio/Engine/src/operations/train-model.operation.ts:42-80`
- Modify: `packages/AI/PredictiveStudio/Engine/src/operations/score-record-set.operation.ts:43-70`
- Test: `packages/AI/PredictiveStudio/Engine/src/operations/__tests__/refusal-codes.test.ts`

**Interfaces:**
- Produces: `type PredictiveStudioRefusalCode = 'READ_CAP_EXCEEDED' | 'AS_OF_NO_EFFECT' | 'MODEL_NOT_SCORABLE' | 'MODEL_NEEDS_TRAINING' | 'EXPERIMENT_SESSIONS_UNAVAILABLE'`; `PredictiveStudioRefusalCodes.IsRefusal(code: string | undefined): code is PredictiveStudioRefusalCode` (Core); `PredictiveStudioRefusals.CodeOf(e: Error): PredictiveStudioRefusalCode | null` and `PredictiveStudioRefusals.ExecuteServer<TOut>(authorize: () => Promise<boolean>, execute: () => Promise<TOut>, operationKey: string): Promise<RemoteOpResult<TOut>>` (Engine).

- [ ] **Step 1: Write the failing test**

```ts
// packages/AI/PredictiveStudio/Engine/src/operations/__tests__/refusal-codes.test.ts
import { describe, it, expect } from 'vitest';
import { PredictiveStudioRefusals } from '../refusals';
import { ReadCapExceededError } from '../../feature-assembly/read-cap-error';
import { AsOfSettingHasNoEffectError } from '../../training/as-of-refusal';
import { ModelNotScorableError, ModelNeedsTrainingError } from '../../scoring/model-readiness';
import { ExperimentSessionsUnavailableError } from '../../actions/run-experiment.deps';

describe('PredictiveStudioRefusals', () => {
  it('maps each refusal error to its code', () => {
    expect(PredictiveStudioRefusals.CodeOf(ReadCapExceededError.ForTraining('E', 10, 10, 20))).toBe('READ_CAP_EXCEEDED');
    expect(PredictiveStudioRefusals.CodeOf(new AsOfSettingHasNoEffectError('pipeline', 'column', 'p1'))).toBe('AS_OF_NO_EFFECT');
    expect(PredictiveStudioRefusals.CodeOf(new ModelNotScorableError('m1', 'Archived'))).toBe('MODEL_NOT_SCORABLE');
    expect(PredictiveStudioRefusals.CodeOf(new ModelNeedsTrainingError('needs training'))).toBe('MODEL_NEEDS_TRAINING');
    expect(PredictiveStudioRefusals.CodeOf(new ExperimentSessionsUnavailableError())).toBe('EXPERIMENT_SESSIONS_UNAVAILABLE');
  });

  it('EXECUTION_ERROR is not a refusal: a plain error keeps the generic code', async () => {
    const r = await PredictiveStudioRefusals.ExecuteServer(async () => true, async () => { throw new Error('sidecar unreachable'); }, 'K');
    expect(r).toEqual({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'sidecar unreachable' });
  });

  it('a refusal returns its code and message', async () => {
    const r = await PredictiveStudioRefusals.ExecuteServer(async () => true, async () => { throw new AsOfSettingHasNoEffectError('train-input', 'column', 'p1'); }, 'K');
    expect(r.Success).toBe(false);
    expect(r.ResultCode).toBe('AS_OF_NO_EFFECT');
  });

  it('keeps the FORBIDDEN and SUCCESS outcomes of the base class', async () => {
    expect((await PredictiveStudioRefusals.ExecuteServer(async () => false, async () => 1, 'K')).ResultCode).toBe('FORBIDDEN');
    expect(await PredictiveStudioRefusals.ExecuteServer(async () => true, async () => 7, 'K')).toEqual({ Success: true, ResultCode: 'SUCCESS', Output: 7 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/AI/PredictiveStudio/Engine && pnpm exec vitest run src/operations/__tests__/refusal-codes.test.ts`
Expected: FAIL — `Cannot find module '../refusals'`. (If `ExperimentSessionsUnavailableError`'s constructor takes arguments, match its current signature in the test.)

- [ ] **Step 3: Add the Core code type**

```ts
// packages/AI/PredictiveStudio/Core/src/refusal-codes.ts
/**
 * @module refusal-codes
 *
 * The machine-readable reasons Predictive Studio refuses a training or scoring request. They travel as the remote
 * operation's `ResultCode`, so callers (the UI, the gate checks) branch on the code and never on the message text.
 */

/** Why a Train or Score request was refused. */
export type PredictiveStudioRefusalCode =
  | 'READ_CAP_EXCEEDED'
  | 'AS_OF_NO_EFFECT'
  | 'MODEL_NOT_SCORABLE'
  | 'MODEL_NEEDS_TRAINING'
  | 'EXPERIMENT_SESSIONS_UNAVAILABLE';

/** The refusal codes and the check that a result code is one of them. */
export class PredictiveStudioRefusalCodes {
  public static readonly All: ReadonlyArray<PredictiveStudioRefusalCode> = [
    'READ_CAP_EXCEEDED', 'AS_OF_NO_EFFECT', 'MODEL_NOT_SCORABLE', 'MODEL_NEEDS_TRAINING', 'EXPERIMENT_SESSIONS_UNAVAILABLE',
  ];

  /** True when `code` is a Predictive Studio refusal (a generic code such as `EXECUTION_ERROR` is not). */
  public static IsRefusal(code: string | undefined): code is PredictiveStudioRefusalCode {
    return code !== undefined && (PredictiveStudioRefusalCodes.All as ReadonlyArray<string>).includes(code);
  }
}
```

Add to `Core/src/index.ts`: `export * from './refusal-codes';`

- [ ] **Step 4: Add the Engine mapping**

```ts
// packages/AI/PredictiveStudio/Engine/src/operations/refusals.ts
import type { RemoteOpResult } from '@memberjunction/core';
import type { PredictiveStudioRefusalCode } from '@memberjunction/predictive-studio-core';
import { ReadCapExceededError } from '../feature-assembly/read-cap-error';
import { AsOfSettingHasNoEffectError } from '../training/as-of-refusal';
import { ModelNotScorableError, ModelNeedsTrainingError } from '../scoring/model-readiness';
import { ExperimentSessionsUnavailableError } from '../actions/run-experiment.deps';

/**
 * Turns Predictive Studio refusal errors into typed `ResultCode`s on the operation result.
 *
 * Why this repeats `BaseRemotableOperation.ExecuteServer`'s three outcomes: the base maps every throw to
 * `EXECUTION_ERROR`, which loses the refusal type before it reaches the caller, and changing that base belongs to
 * MJCore, outside Predictive Studio. Keep the FORBIDDEN / SUCCESS / EXECUTION_ERROR shapes identical to the base.
 */
export class PredictiveStudioRefusals {
  /** The refusal code for a Predictive Studio refusal error; null for any other error. */
  public static CodeOf(e: Error): PredictiveStudioRefusalCode | null {
    if (e instanceof ReadCapExceededError) return 'READ_CAP_EXCEEDED';
    if (e instanceof AsOfSettingHasNoEffectError) return 'AS_OF_NO_EFFECT';
    if (e instanceof ModelNotScorableError) return 'MODEL_NOT_SCORABLE';
    if (e instanceof ModelNeedsTrainingError) return 'MODEL_NEEDS_TRAINING';
    if (e instanceof ExperimentSessionsUnavailableError) return 'EXPERIMENT_SESSIONS_UNAVAILABLE';
    return null;
  }

  /** The operation's server-side run with refusal errors returned as their codes. */
  public static async ExecuteServer<TOut>(
    authorize: () => Promise<boolean>,
    execute: () => Promise<TOut>,
    operationKey: string,
  ): Promise<RemoteOpResult<TOut>> {
    try {
      if (!(await authorize())) {
        return { Success: false, ResultCode: 'FORBIDDEN', ErrorMessage: `Not authorized to run operation '${operationKey}'` };
      }
      return { Success: true, ResultCode: 'SUCCESS', Output: await execute() };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return { Success: false, ResultCode: PredictiveStudioRefusals.CodeOf(error) || 'EXECUTION_ERROR', ErrorMessage: error.message };
    }
  }
}
```

- [ ] **Step 5: Override `ExecuteServer` in both server operations**

In `train-model.operation.ts`, inside `PredictiveStudioTrainModelServerOperation` (types are the ones `InternalExecute` already uses; `RemoteOpServerContext` and `RemoteOpResult` come from `@memberjunction/core`):

```ts
  /** Returns refusals as typed `ResultCode`s (see `PredictiveStudioRefusals`). */
  public override async ExecuteServer(
    input: PredictiveStudioTrainModelInput,
    context: RemoteOpServerContext,
  ): Promise<RemoteOpResult<PredictiveStudioTrainModelOutput>> {
    return PredictiveStudioRefusals.ExecuteServer(
      () => this.Authorize(input, context.user),
      () => this.InternalExecute(input, context.provider, context.user, context),
      this.OperationKey,
    );
  }
```

Do the same in `score-record-set.operation.ts` with `PredictiveStudioScoreRecordSetInput` / `PredictiveStudioScoreRecordSetOutput`. Use the input/output type names already imported at the top of each file.

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/AI/PredictiveStudio/Core && pnpm run build && cd ../Engine && pnpm run build && pnpm test`
Expected: the new test passes; the Engine suite stays green.

- [ ] **Step 7: Commit**

```bash
git add packages/AI/PredictiveStudio/Core/src/refusal-codes.ts packages/AI/PredictiveStudio/Core/src/index.ts \
  packages/AI/PredictiveStudio/Engine/src/operations/refusals.ts packages/AI/PredictiveStudio/Engine/src/operations/train-model.operation.ts \
  packages/AI/PredictiveStudio/Engine/src/operations/score-record-set.operation.ts packages/AI/PredictiveStudio/Engine/src/operations/__tests__/refusal-codes.test.ts
git commit -m "feat(predictive-studio): training and scoring refusals return typed result codes"
```

---

### Task 2: Importance display from the stored importance kind

**Files:**
- Modify: `packages/AI/PredictiveStudio/Sidecar/src/python/app/main.py:530-560` (`_extract_importance`) and `:260-269`
- Modify: `packages/AI/PredictiveStudio/Sidecar/src/python/app/schemas.py:95`
- Modify: `packages/AI/PredictiveStudio/Core/src/sidecar-contract.ts:179`
- Modify: `packages/AI/PredictiveStudio/Core/src/evaluation-record.ts`
- Modify: `packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts` (where `EvaluationLineage` is written)
- Modify: `packages/AI/PredictiveStudio/Core/src/importance-display.ts`
- Modify callers: `packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts:662`, `packages/Angular/Explorer/core-entity-forms/src/lib/custom/MLModels/ps-model-detail.component.ts:321`, `packages/Angular/Explorer/core-entity-forms/src/lib/panels/model-predictions/model-prediction.logic.ts:195`
- Test: `packages/AI/PredictiveStudio/Core/src/__tests__/importance-display.test.ts`, `packages/AI/PredictiveStudio/Sidecar/src/python/tests/test_importance_kind.py`

**Interfaces:**
- Produces: `type ImportanceKind = 'coefficient' | 'split_or_impurity' | 'none'` (Core `sidecar-contract.ts`); `TrainResponse.feature_importance_kind: ImportanceKind`; `EvaluationRecord.ImportanceKind: ImportanceKind | null`; `ImportanceDisplay.GlobalDriversShowable(lineageJSON: string | null | undefined): boolean`.

- [ ] **Step 1: Write the failing Core test**

```ts
// packages/AI/PredictiveStudio/Core/src/__tests__/importance-display.test.ts
import { describe, it, expect } from 'vitest';
import { ImportanceDisplay } from '../importance-display';

const lineage = (kind: string | undefined): string => JSON.stringify({ evaluation: kind === undefined ? {} : { ImportanceKind: kind } });

describe('ImportanceDisplay.GlobalDriversShowable', () => {
  it('shows coefficient importance', () => expect(ImportanceDisplay.GlobalDriversShowable(lineage('coefficient'))).toBe(true));
  it('hides split/impurity importance', () => expect(ImportanceDisplay.GlobalDriversShowable(lineage('split_or_impurity'))).toBe(false));
  it('hides a model with no stored kind (trained before the kind was recorded)', () => {
    expect(ImportanceDisplay.GlobalDriversShowable(lineage(undefined))).toBe(false);
    expect(ImportanceDisplay.GlobalDriversShowable(null)).toBe(false);
  });
});
```

Before writing, read `evaluation-record.ts` `EvaluationLineage.Read` and match the Lineage key it reads (`evaluation`); adjust `lineage()` to that exact shape.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/AI/PredictiveStudio/Core && pnpm exec vitest run src/__tests__/importance-display.test.ts`
Expected: FAIL (the current method takes an algorithm name).

- [ ] **Step 3: Write the failing sidecar test**

```python
# packages/AI/PredictiveStudio/Sidecar/src/python/tests/test_importance_kind.py
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from app.main import _extract_importance

X = np.array([[0.0, 1.0], [1.0, 0.0], [0.0, 0.0], [1.0, 1.0]])
y = np.array([0, 1, 0, 1])


def test_linear_model_reports_coefficient_kind() -> None:
    _, kind = _extract_importance(LogisticRegression().fit(X, y), ["a", "b"])
    assert kind == "coefficient"


def test_tree_model_reports_split_or_impurity_kind() -> None:
    _, kind = _extract_importance(RandomForestClassifier(n_estimators=3, random_state=0).fit(X, y), ["a", "b"])
    assert kind == "split_or_impurity"
```

Run: `cd packages/AI/PredictiveStudio/Sidecar && node scripts/run-pytest.mjs -k importance_kind` — Expected: FAIL (returns a dict, not a tuple).

- [ ] **Step 4: Make `_extract_importance` return the kind**

In `main.py`, change the signature to `def _extract_importance(estimator: Any, columns: List[str]) -> Tuple[Dict[str, float], ImportanceKind]:` and return `(values_map, "split_or_impurity")` on the `feature_importances_` branch, `(values_map, "coefficient")` on the `coef_` branch, `({}, "none")` otherwise. At line 260: `feature_importance, importance_kind = _extract_importance(estimator, output_columns)` and add `"feature_importance_kind": importance_kind` to `result`. In `schemas.py` add `ImportanceKind = Literal["coefficient", "split_or_impurity", "none"]` and `feature_importance_kind: ImportanceKind = "none"` beside `feature_importance` (line 95), and pass it through wherever `feature_importance` is copied into the response model.

- [ ] **Step 5: Carry the kind into Core and the stored lineage**

`sidecar-contract.ts`: add `export type ImportanceKind = 'coefficient' | 'split_or_impurity' | 'none';` and `feature_importance_kind?: ImportanceKind;` beside `feature_importance` (line 179). `evaluation-record.ts`: give the exported `EvaluationRecord` interface a JSDoc block (what it records and where it is stored), add `ImportanceKind: ImportanceKind | null;` to it (with JSDoc "Which kind of number the stored feature importance is; null for models trained before it was recorded"), set it in the builder from the response, and read it in `Read` only when it is one of the three literals. In `training-engine.ts`, pass `response.feature_importance_kind || null` into the evaluation record it writes to Lineage.

- [ ] **Step 6: Rewrite `ImportanceDisplay`**

```ts
// packages/AI/PredictiveStudio/Core/src/importance-display.ts
/**
 * @module importance-display
 *
 * Which stored feature importances may be shown to people as a global "drivers" list. Linear models store
 * |coefficient|, which is comparable across features; tree models store split or impurity counts, which favour noisy
 * continuous and many-valued columns, so those lists stay hidden until held-out permutation importance exists. The
 * sidecar reports which kind it produced and training stores it in the model's evaluation lineage.
 */
import { EvaluationLineage } from './evaluation-record';

/** Which global feature-importance lists people may see. */
export class ImportanceDisplay {
  /** Plain note shown where a hidden global list used to be. */
  public static readonly HiddenNote =
    "This model's feature weights are the algorithm's own split or impurity counts, which favour noisy and many-valued " +
    'columns, so they are hidden until held-out importance is available.';

  /** Whether a model's global importance list may be shown, from its stored Lineage. Unknown kinds are hidden (fail closed). */
  public static GlobalDriversShowable(lineageJSON: string | null | undefined): boolean {
    return EvaluationLineage.Read(lineageJSON || null)?.ImportanceKind === 'coefficient';
  }
}
```

- [ ] **Step 7: Update the three callers**

Pass the model's `Lineage` instead of its algorithm name: `ImportanceDisplay.GlobalDriversShowable(model.Lineage)` at each listed line (use the variable already holding the `MJMLModelEntity` there).

- [ ] **Step 8: Run tests and builds**

Run: `cd packages/AI/PredictiveStudio/Core && pnpm run build && pnpm test`; `cd ../Sidecar && node scripts/run-pytest.mjs`; `cd ../Engine && pnpm run build && pnpm test`; `cd ../../../Angular/Explorer/dashboards && pnpm run build && pnpm test`; `cd ../core-entity-forms && pnpm run build && pnpm test`.
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add packages/AI/PredictiveStudio/Sidecar/src/python/app/main.py packages/AI/PredictiveStudio/Sidecar/src/python/app/schemas.py \
  packages/AI/PredictiveStudio/Sidecar/src/python/tests/test_importance_kind.py packages/AI/PredictiveStudio/Core/src/sidecar-contract.ts \
  packages/AI/PredictiveStudio/Core/src/evaluation-record.ts packages/AI/PredictiveStudio/Core/src/importance-display.ts \
  packages/AI/PredictiveStudio/Core/src/__tests__/importance-display.test.ts packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts \
  packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts \
  packages/Angular/Explorer/core-entity-forms/src/lib/custom/MLModels/ps-model-detail.component.ts \
  packages/Angular/Explorer/core-entity-forms/src/lib/panels/model-predictions/model-prediction.logic.ts
git commit -m "fix(predictive-studio): decide importance display from the stored importance kind, not algorithm names"
```

---

### Task 3: `at-risk-rules.ts` cleanup and one polarity rule

**Files:**
- Modify: `packages/AI/PredictiveStudio/Core/src/at-risk-rules.ts` (whole file)
- Modify callers: `packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-predictions-grid.component.ts:43-44,785,795`, `.../resources/ps-predictions-resource.component.ts:6,662,771`, `.../components/ps-row-drivers.component.ts`, `.../predictive-studio-score-history.service.ts`, `.../business-predictions.view-models.ts`, `packages/Angular/Explorer/core-entity-forms/src/lib/custom/MLModels/ml-model-view-models.ts:83-91`, `.../panels/model-predictions/model-prediction.logic.ts`, and every template that binds `recordId`/`label`/`score`/`riskPct`/`class`/`band`/`status`/`badgeColor`/`icon`/`drivers`/`up`/`value` of these types
- Test: `packages/AI/PredictiveStudio/Core/src/__tests__/at-risk-rules.test.ts`

**Interfaces:**
- Produces: `AtRiskRow { RecordID; Label; Score; RiskPct; Class; Band: RiskBand; Status?; BadgeColor?; Icon?; Drivers }`, `RowDriver { Label; Value; Up }`, `RunDetailLike { RecordID; ResultPayload? }`, `type RiskBand = 'high' | 'medium' | 'low'`; `AtRiskRules.BuildAtRiskOptions(model: OutcomeModelLike): ParseAtRiskOptions` where `OutcomeModelLike = Parameters<typeof ResolveOutcomeConfig>[0]`; `AtRiskRules.LabelFromRecord(row, nameField: string | null): string | null`. Removed: the six free functions at lines 390-416, `ResolveRenewalPolarity`, `RenewalPolarityResult`.

- [ ] **Step 1: Write the failing tests**

```ts
// add to packages/AI/PredictiveStudio/Core/src/__tests__/at-risk-rules.test.ts
import { describe, it, expect } from 'vitest';
import { AtRiskRules } from '../at-risk-rules';

describe('AtRiskRules.BuildAtRiskOptions (one polarity rule)', () => {
  it('inverts risk for a model whose outcome config says the score is the good outcome', () => {
    const lineage = JSON.stringify({ outcomeConfig: { Polarity: 'positive' } });
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: lineage, TargetVariable: 'X', ProblemType: 'classification' }).InvertedRisk).toBe(true);
  });
  it('does not invert an adverse-polarity model', () => {
    const lineage = JSON.stringify({ outcomeConfig: { Polarity: 'adverse' } });
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: lineage, TargetVariable: 'X', ProblemType: 'classification' }).InvertedRisk).toBe(false);
  });
  it('no polarity → no inversion: nothing guessed from payload text', () => {
    expect(AtRiskRules.BuildAtRiskOptions({ Lineage: null, TargetVariable: 'Outcome', ProblemType: 'classification' }).InvertedRisk).toBe(false);
  });
});

describe('AtRiskRules.LabelFromRecord', () => {
  it('uses the entity name field', () => {
    expect(AtRiskRules.LabelFromRecord({ DisplayName: 'Ada', MemberName: 'ignored' }, 'DisplayName')).toBe('Ada');
  });
  it('falls back to FirstName/LastName/Email, then null', () => {
    expect(AtRiskRules.LabelFromRecord({ FirstName: 'Ada', LastName: 'L' }, null)).toBe('Ada L');
    expect(AtRiskRules.LabelFromRecord({}, null)).toBeNull();
  });
});
```

Before Step 3, run `ResolveOutcomeConfig({ Lineage: null, TargetVariable: 'Outcome', ProblemType: 'classification' })` mentally against `outcome-config.ts:208-280` and confirm its default `Polarity` for that input is `'adverse'` or absent; if it is `'positive'`, change the third test's target to one the resolver maps to adverse and note it.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/AI/PredictiveStudio/Core && pnpm exec vitest run src/__tests__/at-risk-rules.test.ts`
Expected: FAIL (`BuildAtRiskOptions` takes payloads; `LabelFromRecord` takes one argument).

- [ ] **Step 3: Rewrite the file**

Apply, in order:
1. Rename the members of `AtRiskRow`, `RowDriver`, `RunDetailLike` to PascalCase (`recordId`→`RecordID`, `label`→`Label`, `score`→`Score`, `riskPct`→`RiskPct`, `class`→`Class`, `band`→`Band`, `status`→`Status`, `badgeColor`→`BadgeColor`, `icon`→`Icon`, `drivers`→`Drivers`, `value`→`Value`, `up`→`Up`) and delete every `case-violation-ok-legacy-back-compat` marker. The file is new in Core in this PR, so these are new public names (spec §5.1).
2. Add `export type RiskBand = 'high' | 'medium' | 'low';` and type `Band: RiskBand`. Where `resolveScoreBand()` supplies a band key outside the three, map it with a `switch` that defaults to `'low'` and comment why.
3. Replace `BuildAtRiskOptions(payloads, targetVariable, outcomeConfig)` with:
   ```ts
   /** The At-Risk options for a model: its resolved outcome config, and risk inverted when the score is the good outcome. */
   public static BuildAtRiskOptions(model: OutcomeModelLike): ParseAtRiskOptions {
     const outcomeConfig = ResolveOutcomeConfig(model);
     return { InvertedRisk: outcomeConfig.Polarity === 'positive' && model?.ProblemType !== 'regression', OutcomeConfig: outcomeConfig };
   }
   ```
   with `export type OutcomeModelLike = Parameters<typeof ResolveOutcomeConfig>[0];` and `ResolveOutcomeConfig` imported from `./outcome-config`. Delete `ResolveRenewalPolarity` and `RenewalPolarityResult`.
4. `LabelFromRecord(row, nameField)`: first `row[nameField]` when `nameField` is set, then `Name`, `FirstName`+`LastName`, `Email`, then the existing first-short-string fallback. Delete the `MemberName`/`Member`/`FullName` line.
5. `ParseRowDrivers(raw: unknown, …)`: keep the parameter (it is a JSON boundary) with the comment `// unknown: parsed JSON from a stored payload; narrowed below`, and replace the `as Array<{…}>` cast with a type guard `private static isDriverLike(d: unknown): d is Record<string, unknown>` (`typeof d === 'object' && d !== null`). Same for the payload parsing in `ParseAtRiskRows` and `TopGlobalDrivers`.
6. Replace `??` fallbacks with `||` where the left side cannot legitimately be `0` or `''` (lines 187-188, 295-299); where it can, keep `??` with a comment.
7. Move `DriverBadge`'s copy out: keep `DriverRaisesRisk` in Core; move `DriverBadgeText` and the `DriverBadge` type to `packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-row-drivers.component.ts` as a `private static`. If the truth-suite harness calls `DriverBadgeText`, have it call `DriverRaisesRisk` and compare booleans instead.
8. Delete the six free functions at the end of the file (lines 390-416).
9. Fix the module header: remove "Core is types-only" claims elsewhere in Core that this PR wrote (`grep -rn "types-only" packages/AI/PredictiveStudio/Core/src`) and say "pure, dependency-free, browser-safe".

- [ ] **Step 4: Update callers**

Replace calls to the deleted free functions with `AtRiskRules.<Name>`; replace `ResolveRenewalPolarity(...)` call sites with `AtRiskRules.BuildAtRiskOptions(model)`; pass the target entity's name field to `LabelFromRecord` (`provider.EntityByName(entityName)?.NameField?.Name || null`, using the component's `this.ProviderToUse`). Rename the member reads in the TypeScript and in every template (`grep -rn "\.riskPct\|\.recordId\|\.badgeColor\|\.drivers\|\.band\b" packages/Angular/Explorer/dashboards/src/PredictiveStudio packages/Angular/Explorer/core-entity-forms/src`). Delete `HumanizeFeatureName`/`humanizeFeatureName` wrappers in `ml-model-view-models.ts:83-91` and call `AtRiskRules.HumanizeFeatureName`.

- [ ] **Step 5: Build and test everything that imports Core**

Run: `cd packages/AI/PredictiveStudio/Core && pnpm run build && pnpm test && cd ../Engine && pnpm run build && pnpm test && cd ../TruthSuite && pnpm run build && pnpm test && cd ../../../Angular/Explorer/dashboards && pnpm run build && pnpm test && cd ../core-entity-forms && pnpm run build && pnpm test`
Expected: green; fix every compile error the renames surface.

- [ ] **Step 6: Commit**

```bash
git add packages/AI/PredictiveStudio/Core/src packages/AI/PredictiveStudio/TruthSuite/src \
  packages/Angular/Explorer/dashboards/src/PredictiveStudio packages/Angular/Explorer/core-entity-forms/src/lib
git commit -m "refactor(predictive-studio): at-risk rules use PascalCase, one polarity rule and the entity name field"
```

(Before committing, run `git status --short` and confirm only files this task touched are staged.)

---

### Task 4: `trust.ts` as statics; shims per D8

**Files:**
- Modify: `packages/AI/PredictiveStudio/Core/src/trust.ts`
- Modify callers found by `grep -rn "DeriveTrustVerdict\|TrustEvidenceLine\|TrustDots\|withheldReason\|majorityBaseline\|MajorityBaselineFinding" packages --include=*.ts --include=*.html | grep -v node_modules | grep -v /dist/`
- Test: `packages/AI/PredictiveStudio/Core/src/__tests__/trust.test.ts`

**Interfaces:**
- Produces: `TrustVerdicts.DeriveTrustVerdict(model)`, `TrustVerdicts.TrustEvidenceLine(...)`, `TrustVerdicts.TrustDots(...)` holding the logic; `TrustVerdict.WithheldReason`, `TrustVerdict.MajorityBaseline`; `MajorityBaselineFinding { Rule; Enforced; Accuracy; BaselineAccuracy; … }` (PascalCase of each current member).

- [ ] **Step 1: Record which free functions and stubs exist on `next`**

Run: `git show origin/next:packages/AI/PredictiveStudio/Core/src/trust.ts | grep -n "^export function\|@deprecated"` and save the list in the commit body. Exported functions present on `next` stay as `@deprecated` one-line stubs calling the static (D8); functions new in this PR (`noBetterThanMajority`, `majorityFinding`, `cappedVerdict`) become `private static` members.

- [ ] **Step 2: Write the failing test**

```ts
// add to packages/AI/PredictiveStudio/Core/src/__tests__/trust.test.ts
import { TrustVerdicts } from '../trust';
it('exposes the new verdict members in PascalCase', () => {
  const v = TrustVerdicts.DeriveTrustVerdict({ Metrics: '{}', HoldoutMetrics: '{}', Lineage: null });
  expect(v).toHaveProperty('WithheldReason');
  expect(v).toHaveProperty('MajorityBaseline');
});
```

Match the argument to the interface `DeriveTrustVerdict` accepts (see `trust.ts:28`).

- [ ] **Step 3: Run it to verify it fails**

Run: `cd packages/AI/PredictiveStudio/Core && pnpm exec vitest run src/__tests__/trust.test.ts` — Expected: FAIL on `WithheldReason`.

- [ ] **Step 4: Refactor**

1. Move the bodies of `DeriveTrustVerdict`, `TrustEvidenceLine`, `TrustDots` into `public static` methods of `TrustVerdicts`; the exported free functions that existed on `next` become `/** @deprecated Use {@link TrustVerdicts.X}. */` stubs; the ones new in this PR are deleted.
2. Restore the `trustEvidenceLine` / `trustDots` stubs this PR removed: `git show origin/next:packages/AI/PredictiveStudio/Core/src/trust.ts` shows their exact text; re-add them pointing at the statics.
3. Rename the members this PR added: `withheldReason`→`WithheldReason`, `majorityBaseline`→`MajorityBaseline`, every member of `MajorityBaselineFinding` to PascalCase. Members of `TrustVerdict` that exist on `next` (`grade`, `canAct`, …) keep their names.
4. Split `DeriveTrustVerdict` (lines 264-331) into `private static` steps: `bestMetrics`, `headlineFor`, `applyCaps`, each ≤40 lines.
5. Use `=== null` / `!== undefined` consistently in the `if` chain at 274-283.
6. Restore the header's "why" paragraph from `git show origin/next:packages/AI/PredictiveStudio/Core/src/trust.ts | sed -n 1,20p` and append the new rules after it.

- [ ] **Step 5: Update callers, build, test**

Rename member reads at the grep hits (TS and HTML). Run the same build/test chain as Task 3 Step 5.

- [ ] **Step 6: Commit**

```bash
git add packages/AI/PredictiveStudio/Core/src/trust.ts packages/AI/PredictiveStudio/Core/src/__tests__/trust.test.ts <each caller file from the grep>
git commit -m "refactor(predictive-studio): trust verdict logic as TrustVerdicts statics; keep next's deprecated stubs"
```

---

### Task 5: Engine dead code and standards fixes

**Files:**
- Modify: `packages/AI/PredictiveStudio/Engine/src/actions/run-experiment.deps.ts`, `.../actions/run-experiment.action.ts`, `.../operations/delegation.ts:200-220`
- Modify: `packages/AI/PredictiveStudio/Engine/src/actions/score-record-set.runner.ts:158-300`
- Modify: `packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder-agent.ts:188,201-214,269,294`
- Modify: `packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts:108,124,383`
- Modify: `packages/AI/PredictiveStudio/Engine/src/scoring/ml-model-inference-processor.ts:262-270`
- Create: `packages/AI/PredictiveStudio/Core/src/experiment-sessions.ts` (exported from `Core/src/index.ts`; Core because the Angular experiments page reads it and the dashboards package depends on Core only)
- Test: `packages/AI/PredictiveStudio/Engine/src/actions/__tests__/experiment-sessions.test.ts`, existing runner/agent/processor tests

**Interfaces:**
- Produces: `ExperimentSessions.Enabled: false`, `ExperimentSessions.DisabledReason: string` (static readonly; the Angular experiments page binds to these in Task 11); `ExperimentSessionsUnavailableError.Message` (static readonly, replaces `EXPERIMENT_SESSIONS_UNAVAILABLE_MESSAGE`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/AI/PredictiveStudio/Engine/src/actions/__tests__/experiment-sessions.test.ts
import { describe, it, expect } from 'vitest';
import { ExperimentSessions } from '@memberjunction/predictive-studio-core';
import { ExperimentSessionsUnavailableError } from '../run-experiment.deps';

describe('ExperimentSessions', () => {
  it('is switched off with one reason the UI and the error share', () => {
    expect(ExperimentSessions.Enabled).toBe(false);
    expect(new ExperimentSessionsUnavailableError().message).toBe(ExperimentSessions.DisabledReason);
  });
});
```

Run: `cd packages/AI/PredictiveStudio/Engine && pnpm exec vitest run src/actions/__tests__/experiment-sessions.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Add the capability and collapse the dead chain**

```ts
// packages/AI/PredictiveStudio/Core/src/experiment-sessions.ts
/**
 * Whether experiment sessions can run. They are switched off because the session runner cannot yet train the
 * experiments it plans; the Model Development Agent hands approved plans to the Pipeline Builder instead. One flag and
 * one reason, shared by the refusal error and the UI.
 */
export class ExperimentSessions {
  public static readonly Enabled = false;
  public static readonly DisabledReason =
    'Experiment sessions are switched off: the session runner cannot yet train the experiments it plans. ' +
    'Build the pipeline with the Pipeline Builder instead.';
}
```

Then in `run-experiment.deps.ts`: delete `BuildWithResolver`, `UnresolvedPipelineResolver`, `BuildProductionExperimentDeps`, and the exported constant `EXPERIMENT_SESSIONS_UNAVAILABLE_MESSAGE`; `ExperimentSessionsUnavailableError` takes no arguments and calls `super(ExperimentSessions.DisabledReason)`. In `run-experiment.action.ts` throw `new ExperimentSessionsUnavailableError()` at the top of the action body when `!ExperimentSessions.Enabled`. Delete the orchestrator branch in `delegation.ts` that called `BuildProductionExperimentDeps` (around line 211) and anything only it used (`grep -n` each removed symbol until no hits remain). Keep the Engine's README in step with the removal.

If `ExperimentSessions.DisabledReason` differs from the current message text, keep the current text (the Angular copy in Task 11 will read it from here).

- [ ] **Step 3: Score runner**

In `score-record-set.runner.ts`:
1. Make `provider: IMetadataProvider` required in the runner's params type and remove the three `|| new RunView()` fallbacks and their `global-provider-ok` markers (lines 163, 254, 284); use `RunView.FromMetadataProvider(provider)` (the pattern in `integration-test-suite/src/checks/fp-gate-c2-1.checks.ts:28`). Fix every caller the compiler reports by passing the provider it already has.
2. In `resolveList`, replace the `entity_object` read (line 214) with `ResultType: 'simple'`, `Fields: entityInfo.PrimaryKeys.map((pk) => pk.Name)`, and build refs with `CompositeKey.FromEntityRecord(entityInfo, row)`.
3. Extract the chunk loop (201-227) and `resolveFilter`'s success check/ref mapping into `private async resolveIDChunks(...)` and `private toRecordRefs(...)`, used by both.

- [ ] **Step 4: Report builder, training engine, inference processor**

- `pipeline-builder-agent.ts`: remove the parameter this PR added to the deprecated `generateMarkdownReport` stub (restore its `next` signature: `git show origin/next:packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder-agent.ts | grep -n "generateMarkdownReport" -A6`); `score != null` → `score !== null && score !== undefined`; `scoreVal == null` → `scoreVal === null || scoreVal === undefined`; type the grade parameter `TrustGrade | null` and render `null` as `'Not measured'` inside the report function.
- `training-engine.ts`: parse `ParseMajorityBaselineRule` once (line 108) and pass the result into `Build` (line 124); delete the unused `_response` parameter (line 383) and its call-site argument.
- `ml-model-inference-processor.ts:262-270`: replace the two `CanScore` checks with one ordered `switch (model.Status)` over `MJMLModelEntity['Status']`: `'Draft'` → needs-training check then refuse; scorable statuses → continue; `default` → `throw new ModelNotScorableError(...)`. Keep the existing order of the needs-training error for a Draft with no artifact (the opt-in auto-train path depends on it).

- [ ] **Step 5: Build and test**

Run: `cd packages/AI/PredictiveStudio/Engine && pnpm run build && pnpm test`
Expected: green (update tests that referenced deleted symbols by deleting those cases, not by re-adding the symbols).

- [ ] **Step 6: Commit**

```bash
git add packages/AI/PredictiveStudio/Engine
git commit -m "refactor(predictive-studio): remove dead experiment-session wiring; provider-scoped scoring reads; strict equality"
```

(`git add packages/AI/PredictiveStudio/Engine` is a directory this task owns entirely; confirm with `git status --short packages/AI/PredictiveStudio/Engine` first.)

---

### Task 6: Sidecar cleanup

**Files:**
- Modify: `packages/AI/PredictiveStudio/Sidecar/src/python/app/main.py:108,268,442-497,456`, `schemas.py:99`, `algorithms.py:71-123`
- Modify: `packages/AI/PredictiveStudio/Sidecar/scripts/setup-python.mjs:45-56`, `scripts/python-probe.mjs`, `scripts/python-probe.d.mts`
- Modify: `packages/AI/PredictiveStudio/Engine/README.md:109-121`, `packages/AI/PredictiveStudio/Sidecar/README.md:86-96`

**Interfaces:**
- Produces: `DEFAULT_RANDOM_STATE: int = 0` (algorithms.py); `@dataclass(frozen=True) class FoldContext` (main.py); `PythonProbe.FormatVersion(v: { Major: number; Minor: number; Patch: number }): string` (static).

- [ ] **Step 1: Pin current behaviour**

Run: `cd packages/AI/PredictiveStudio/Sidecar && node scripts/run-pytest.mjs` and record the pass count. These tests are the regression net for this task.

- [ ] **Step 2: Apply**

1. `schemas.py:99`: `validation_out_of_sample: bool = True` as the response-model default; delete the literal `True` assignments at `main.py:108` and `:268`.
2. `algorithms.py`: `DEFAULT_RANDOM_STATE = 0` at module top; replace the five `"random_state": 0` with `"random_state": DEFAULT_RANDOM_STATE`.
3. `main.py`: introduce
   ```python
   @dataclass(frozen=True)
   class FoldContext:
       X: np.ndarray
       y: np.ndarray
       algorithm: str
       hyperparameters: Dict[str, Any]
       is_classification: bool
       class_labels: List[Any]
       encoder: Any
       feature_cols: List[str]
       random_state: int
   ```
   (fields = the positional parameters `_kfold_out_of_fold_metrics` and `_fit_fold` currently share; read the two signatures and use exactly their names and types). Change both functions to take `ctx: FoldContext` plus their fold-specific arguments, and split `_kfold_out_of_fold_metrics` so each function is ≤40 lines. Delete the comment at line 456 citing line numbers.
4. `python-probe.mjs`: add `static FormatVersion(v) { return \`${v.Major}.${v.Minor}.${v.Patch}\`; }` (and its declaration in `python-probe.d.mts`); use it in `#describeProbe` and in `setup-python.mjs:45,49,56`; replace the literal "3.11 or 3.12" at line 46 with `PythonProbe.SupportedMinors.map((m) => \`3.${m}\`).join(' or ')` (match `SupportedMinors`' real shape).
5. Keep the Python setup block in `Sidecar/README.md`; in `Engine/README.md` replace lines 109-121 with one sentence linking to it.

- [ ] **Step 3: Test**

Run: `node scripts/run-pytest.mjs` (same pass count as Step 1) and `cd ../Engine && pnpm test`.

- [ ] **Step 4: Commit**

```bash
git add packages/AI/PredictiveStudio/Sidecar packages/AI/PredictiveStudio/Engine/README.md
git commit -m "refactor(predictive-studio): sidecar constants and fold context; one setup README"
```

---

### Task 7: Truth-suite harness and data fixes

**Files:**
- Modify: `packages/AI/PredictiveStudio/TruthSuite/src/harness/types.ts` (`TrainAttempt`, `ScoreAttempt`)
- Modify: `.../src/harness/train.ts`, `.../src/harness/score.ts`, `.../src/harness/containment-probe.ts`, `.../src/harness/judge-bridge.ts`, `.../src/harness/agent.ts`, `.../src/harness/artifacts.ts`, `.../src/harness/promote.ts`, `.../src/harness/pipelines.ts`, `.../src/harness/agent-plan.ts`, `.../src/harness/datasets.ts`
- Create: `.../src/db/dataset-loader.ts`; Delete: `.../src/db/world-loader.ts`, `.../src/db/scenario-loader.ts`
- Modify: `.../src/db/bulk-load.ts:20-34`, `.../src/data/catalog.ts`, `.../src/data/cli.ts`, `.../scripts/provision.mjs`, `.../scripts/gen-pstruth-ddl.mjs`, `.../migrations/V202610130001__pstruth_tables.sql`
- Revert: `packages/MJGlobal/src/__tests__/UUIDCompliance.test.ts`
- Test: `.../src/harness/__tests__/containment-probe.test.ts`, `.../src/db/__tests__/dataset-loader.db.test.ts`

**Interfaces:**
- Consumes: `PredictiveStudioRefusalCode`, `PredictiveStudioRefusalCodes.IsRefusal` (Task 1).
- Produces: `TrainAttempt.RefusalCode: PredictiveStudioRefusalCode | null`; `ScoreAttempt.RefusalCode: PredictiveStudioRefusalCode | null`; `ContainmentProbe.WasRefusedBeforeTraining(a: TrainAttempt, expected: PredictiveStudioRefusalCode): boolean`; `ContainmentProbe.WasScoringRefused(a: ScoreAttempt, expected: PredictiveStudioRefusalCode): boolean`; `DatasetLoader.Load(ref: DatasetRef): Promise<LoadedDataset>`; `CatalogEntry.Code` (was `ID`); `HarnessProcess.Run(cmd: string, args: string[], opts): Promise<{ Code: number; Stdout: string; Stderr: string }>`; `HarnessPaths.ResultsDir(): string`.

- [ ] **Step 1: Write the failing probe tests**

```ts
// replace the WasRefused* cases in packages/AI/PredictiveStudio/TruthSuite/src/harness/__tests__/containment-probe.test.ts
import { describe, it, expect } from 'vitest';
import { ContainmentProbe } from '../containment-probe';
import type { TrainAttempt, ScoreAttempt } from '../types';

const train = (over: Partial<TrainAttempt>): TrainAttempt => ({ Ok: false, ErrorMessage: 'x', RefusalCode: null, ModelID: null, TrainingRunID: null, HoldoutMetricsJSON: null, DurationMs: 1, ...over });
const score = (over: Partial<ScoreAttempt>): ScoreAttempt => ({ Ok: false, ErrorMessage: 'x', RefusalCode: null, Scored: 0, Failed: 0, Skipped: 0, WroteBack: false, Predictions: [], DurationMs: 1, ...over });

describe('refusals are decided by code', () => {
  it('a crash is not a refusal', () => {
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ RefusalCode: null }), 'AS_OF_NO_EFFECT')).toBe(false);
    expect(ContainmentProbe.WasScoringRefused(score({ RefusalCode: null }), 'MODEL_NOT_SCORABLE')).toBe(false);
  });
  it('the expected code is a refusal; a different code is not', () => {
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ RefusalCode: 'AS_OF_NO_EFFECT' }), 'AS_OF_NO_EFFECT')).toBe(true);
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ RefusalCode: 'READ_CAP_EXCEEDED' }), 'AS_OF_NO_EFFECT')).toBe(false);
  });
  it('a refusal that still produced a model is not a refusal', () => {
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ RefusalCode: 'AS_OF_NO_EFFECT', ModelID: 'm1' }), 'AS_OF_NO_EFFECT')).toBe(false);
  });
});
```

Run: `cd packages/AI/PredictiveStudio/TruthSuite && pnpm exec vitest run src/harness/__tests__/containment-probe.test.ts` — Expected: FAIL.

- [ ] **Step 2: Carry the code through the harness**

- `types.ts`: add `RefusalCode: PredictiveStudioRefusalCode | null;` to `TrainAttempt` and `ScoreAttempt`.
- `train.ts` / `score.ts`: set `RefusalCode: PredictiveStudioRefusalCodes.IsRefusal(r.ResultCode) ? r.ResultCode : null` on the failure path and `null` on success.
- `containment-probe.ts`:
  ```ts
  /** Refused before training: the operation returned the expected refusal code and produced no model. */
  public static WasRefusedBeforeTraining(a: TrainAttempt, expected: PredictiveStudioRefusalCode): boolean {
    return !a.Ok && a.RefusalCode === expected && a.ModelID === null;
  }

  /** Scoring refused: the expected refusal code and nothing scored. */
  public static WasScoringRefused(a: ScoreAttempt, expected: PredictiveStudioRefusalCode): boolean {
    return !a.Ok && a.RefusalCode === expected && a.Scored === 0;
  }
  ```
  Delete `ReadStoredGateDecision`, `ReverifiesStoredDecision`, `ApplyTimeIndexDeclaration`'s constant `true` return (make it `void`, the caller saves), `GenerateModelStory` (callers use `h.GenerateStory`), and the `LastTimeIndexDeclared` plumbing in `pipelines.ts:16,75-84` and `types.ts`. G0.2's half (b) is a Pending gate; its body reads "no stored gate outcome yet" as inconsistent directly (Task 9 moves it).
- `promote.ts`: replace `unknown` at lines 16 and 29 with the operation's output type; replace `as AlgorithmKey` (45) with a guard `HarnessModels.IsAlgorithmKey(v: string): v is AlgorithmKey` over the six keys; replace `as MJMLModelEntity['Status']` (144) by typing the source field. Lines 75/116: `ResultType: 'simple'`, `Fields: ['Status', 'Notes', 'ValidationResults']`.
- Make the free functions in `score.ts:20,26`, `promote.ts:14,27`, `agent.ts:11,27,34`, `story-step.ts:13` static members of their files' classes (`HarnessScoring`, `HarnessModels`, `HarnessAgent`).
- Create `src/harness/process.ts` with `HarnessProcess.Run` (the one `spawn`-to-promise helper, from `judge-bridge.ts:26-42`) and use it in `judge-bridge.ts` and `agent.ts`. Create `HarnessPaths.ResultsDir()` in `artifacts.ts`: `process.env.TRUTH_RESULTS_DIR || path.join(TruthSuite root, '.run', 'results')`, and use it in `artifacts.ts`, `agent.ts`.
- `judge-bridge.ts:12-24`: drop the hard-coded `/opt/homebrew/opt/libomp/lib`; resolve the interpreter the same way `MLSidecar` does (import the resolver the Sidecar package exports; if it does not export one, keep the venv lookup and say so in a comment).
- `pipelines.ts:28-32` and `agent-plan.ts:16-20`: one `HarnessPipelines.FeatureKind(column)` static used by both.
- `datasets.ts:89,104-118`: replace raw `mssql` counts with `RunView.FromMetadataProvider(provider).RunView({ EntityName, ResultType: 'count_only', BypassCache: true }, user)`; keep the reset as SQL (sanctioned by `AllowDirectSQLUpdate`) but read the flag from `EntityInfo` first.

- [ ] **Step 3: Write the failing loader test**

```ts
// packages/AI/PredictiveStudio/TruthSuite/src/db/__tests__/dataset-loader.db.test.ts (runs under vitest.db.config.ts)
import { describe, it, expect } from 'vitest';
import { DatasetLoader } from '../dataset-loader';
import { TruthConnection } from '../connection';
import { DatasetStamp } from '../stamp';

describe('DatasetLoader', () => {
  it('a failed load leaves no stale stamp', async () => {
    const pool = await TruthConnection.OpenPool();
    try {
      await DatasetLoader.Load({ Kind: 'scenario', ID: 'C2', Seed: 42 });
      const bad = DatasetLoader.LoadWithRowSource({ Kind: 'scenario', ID: 'D1c', Seed: 42 }, async function* () { yield { ID: 'not-a-guid' }; });
      await expect(bad).rejects.toThrow();
      expect(await DatasetStamp.Read(pool, 'Scn_D1c')).toBeNull();
    } finally {
      await pool.close();
    }
  });
});
```

`DatasetStamp.Read(pool, table)` returns the stamp string or null (`src/db/stamp.ts:12`). Run this test on a freshly provisioned database, where `Scn_D1c` has never been loaded: a load that fails must roll back and leave it unstamped. `LoadWithRowSource` is the seam the loader exposes for this test (Step 4).

Run: `pnpm exec vitest run --config vitest.db.config.ts src/db/__tests__/dataset-loader.db.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: One transactional loader**

Create `src/db/dataset-loader.ts` with `class DatasetLoader { static Load(ref); static LoadWithRowSource(ref, rows) }`. Body, for every kind: open a transaction on the truth pool; `DELETE FROM pstruth.<table>`; bulk insert (existing `bulk-load.ts` helper); compare the insert's row count with the manifest's expected count (no hand-written `COUNT(*)`); write the stamp; commit; on any error roll back and rethrow. Move the manifest parsing, row hashing and seed-tag building from `world-loader.ts:50-87` and the three `scenario-loader.ts` methods into `protected static` helpers of `DatasetLoader` (one copy). Delete the unreachable `T1-real` branch. `bulk-load.ts:20-34`: replace the raw `__mj.Entity` query with `entityInfo.AllowDirectSQLInsert && entityInfo.AllowDirectSQLDelete` from `TruthEntities.ForTable`. Point `datasets.ts` at `DatasetLoader.Load` and `git rm` the two old loaders.

- [ ] **Step 5: DDL-only migration, CodeGen at provision, dead tables**

1. `gen-pstruth-ddl.mjs`: delete the `Scn_R2real`, `Scn_T1real`, `T1real` series tables and `PersonYear` (lines 74-89 region) and the `REAL_R2` constant.
2. Regenerate the migration with only DDL: `node scripts/gen-pstruth-ddl.mjs > migrations/V202610130001__pstruth_tables.sql`, and `node scripts/gen-pstruth-ddl.mjs --metadata`.
3. `provision.mjs`: after `mj migrate --schema pstruth`, run the scoped CodeGen in the main path (move the `--codegen` block's `copyFileSync` + `run(... 'codegen', '--skipfiles' ...)` before the entity count, and delete the `--codegen` flag mode and `findNewestCodeGenSql`). Keep the `finally` regeneration of `.pstruth-entities.json` (amendment A3). Build the pool through `TruthConnection` instead of the local `openPool` (honours `DB_TRUST_SERVER_CERTIFICATE`).
4. Because the existing private database already holds the CodeGen'd tables, verify on a fresh database: `MJ_PS_PR2_clean` created per the `bootstrap-clean-db` skill, then `pnpm run truth:provision` → expect `pstruth: 39 entities, direct SQL sanctioned on 39` (44 minus the 5 dropped).

- [ ] **Step 6: `CatalogEntry.ID` → `Code`; revert the UUID exceptions**

Rename the member in `catalog.ts` and `cli.ts` (and every reader: `grep -rn "\.ID\b" src/data src/harness | grep -i catalog`). Then `git show origin/next:packages/MJGlobal/src/__tests__/UUIDCompliance.test.ts > packages/MJGlobal/src/__tests__/UUIDCompliance.test.ts` and run `cd packages/MJGlobal && pnpm test`.

- [ ] **Step 7: Test**

Run: `cd packages/AI/PredictiveStudio/TruthSuite && pnpm run build && pnpm test && pnpm run test:db` (DB tests against `MJ_PS_PR2_clean`).

- [ ] **Step 8: Commit**

```bash
git add packages/AI/PredictiveStudio/TruthSuite/src packages/AI/PredictiveStudio/TruthSuite/scripts/provision.mjs \
  packages/AI/PredictiveStudio/TruthSuite/scripts/gen-pstruth-ddl.mjs packages/AI/PredictiveStudio/TruthSuite/migrations \
  packages/AI/PredictiveStudio/TruthSuite/metadata packages/MJGlobal/src/__tests__/UUIDCompliance.test.ts
git commit -m "fix(predictive-studio): truth harness decides refusals by code; one transactional loader; CodeGen at provision"
```

---

### Task 8: Generators in TypeScript

**Files:**
- Rename + convert: `packages/AI/PredictiveStudio/TruthSuite/generators/{gen_lib,loom,make_world,make_world_multiclass,make_scenario,derive_t3_lag}.mjs` → `src/generators/*.ts`
- Delete: `generators/calibrate_intercept.mjs`
- Modify: `src/data/catalog.ts` (generator paths), `tsconfig.json`, `generators/__tests__` → `src/generators/__tests__`

**Interfaces:**
- Produces: `WorldSpec`, `ScenarioSpec` interfaces matching `fixtures/worlds/*.json` and `fixtures/scenarios/specs/*.json`; `GenLib.WriteCsv(path: string, rows: ReadonlyArray<Record<string, string | number | boolean | null>>): void` (escapes commas, quotes, newlines).

- [ ] **Step 1: Pin output**

Run: `pnpm run test:regeneration` and confirm it compares all 68 datasets against `fixtures/golden-hashes.json`. This is the test for the whole task.

- [ ] **Step 2: Convert**

For each file: `git mv generators/<f>.mjs src/generators/<f>.ts`, add types (spec interfaces from the JSON, typed row records), replace `toCsv` in `make_world.ts` with `GenLib.WriteCsv`, move the shared people-generation block and the duplicated header code of `make_world`/`make_world_multiclass` into `GenLib` statics, merge the identical `attendScore`/`cancelScore` bodies, use `engine.sigmoid` in place of `gen_lib.sigmoid`, drop the `probes/` headers, the `worlds-domain` fallback and the `make_scenario.ts:20` / `make_world.ts:4` references to files that do not exist. Keep `loom.ts`'s dynamic `import()` with its comment (category: runtime plugin discovery). Free functions become statics on `GenLib`, `WorldGenerator`, `ScenarioGenerator`.

`git rm generators/calibrate_intercept.mjs`.

- [ ] **Step 3: Verify byte-identical output**

Run: `pnpm run build && pnpm run test:regeneration` — Expected: all 68 golden hashes match. A mismatch means the port changed behaviour; fix the port, never the hashes.

- [ ] **Step 4: Commit**

```bash
git add packages/AI/PredictiveStudio/TruthSuite/src/generators packages/AI/PredictiveStudio/TruthSuite/src/data/catalog.ts packages/AI/PredictiveStudio/TruthSuite/tsconfig.json
git add -u packages/AI/PredictiveStudio/TruthSuite/generators
git commit -m "refactor(predictive-studio): truth-suite generators in typed TypeScript, output byte-identical"
```

---

### Task 9: Gates as MJ Tests

**Files:**
- Create: `packages/TestingFramework/integration-test-suite/src/checks/ps-gates/ps-gate-fixture.ts`
- Create: `packages/TestingFramework/integration-test-suite/src/checks/ps-gates/ps-gate-judge.ts`
- Create: `packages/TestingFramework/integration-test-suite/src/checks/ps-gate-{w1-s7-5,w1-s9-3,w1-s7-3,w4-s2-1,w2-s5-3,w1-s5-4,t4-s6-5,w7-s4-2,w1-s9-4,w1-s9-5,w2-c1-1,w3-c1-1,datasets}.checks.ts` (map each to its `TruthGate.Define` title; the remaining G0.10 title is the one at `containment.gates.test.ts:270-302`)
- Modify: `packages/TestingFramework/integration-test-suite/src/index.ts`, `package.json` (add `"@memberjunction/predictive-studio-truth-suite": "workspace:*"` and `"@memberjunction/predictive-studio-core"` matching the repo's version spec), `src/__tests__/check-registry.test.ts`
- Create: `metadata-optional/integration-test/tests/gates/.gate-<title>.json` × 12, `.ps-truth-datasets-load.json`; `metadata-optional/integration-test/test-suites/.ps-gates-containment-suite.json`, `.ps-gates-pending-suite.json`
- Move: `packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-row-drivers.truth.dom.test.ts` → its assertions into `ps-gate-w1-s9-4.checks.ts`; delete the file
- Test: `packages/TestingFramework/integration-test-suite/src/__tests__/ps-gate-judge.test.ts`

**Interfaces:**
- Consumes: `TruthHarness` and `RunFixtures` (truth-suite `src/harness`), `ContainmentProbe.WasRefusedBeforeTraining(a, code)` / `WasScoringRefused(a, code)` (Task 7), `EvaluationLineage.NotEvaluatedAsForecast` (Core).
- Produces: `PsGate.Harness(ctx: IntegrationCheckContext): Promise<TruthHarness>`; `PsGate.Assert(m: GateMeasurement): void`; `PsGate.Lifecycle: BundleLifecycle`; `PsGateJudge.NoCausalClaims(ctx, texts: string[], testName: string): Promise<OracleResult>`.

- [ ] **Step 1: Write the failing judge test**

```ts
// packages/TestingFramework/integration-test-suite/src/__tests__/ps-gate-judge.test.ts
import { describe, it, expect } from 'vitest';
import { PsGateJudge } from '../checks/ps-gates/ps-gate-judge';

describe('PsGateJudge.Verdict', () => {
  it('passes only when the oracle passed', () => {
    expect(PsGateJudge.Verdict({ oracleType: 'llm-judge', passed: true, score: 1, message: 'ok' })).toEqual({ Passed: true, Detail: 'ok' });
  });
  it('an unparseable judge answer fails with the judge message', () => {
    expect(PsGateJudge.Verdict({ oracleType: 'llm-judge', passed: false, score: 0, message: 'could not parse the judge reply' }))
      .toEqual({ Passed: false, Detail: 'could not parse the judge reply' });
  });
});
```

Run: `cd packages/TestingFramework/integration-test-suite && pnpm exec vitest run src/__tests__/ps-gate-judge.test.ts` — Expected: FAIL.

- [ ] **Step 2: The judge**

```ts
// packages/TestingFramework/integration-test-suite/src/checks/ps-gates/ps-gate-judge.ts
import type { MJTestEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { LLMJudgeOracle } from '@memberjunction/testing-engine';
import type { OracleResult } from '@memberjunction/testing-engine-base';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';

/** G0.6's judge: an LLM grades text against "no causal claims" criteria (replaces the regex phrase list). */
export class PsGateJudge {
  /** The criteria every judged text must meet. */
  public static readonly Criteria: ReadonlyArray<string> = [
    'Describes features only as associated with the outcome or weighted by the model.',
    'Makes no claim that changing a feature changes the outcome.',
    'Gives no advice to act on a feature in order to change the outcome.',
  ];

  /** Grade `texts` (one judgment over all of them) with the gate's MJ: Tests row as the subject. */
  public static async NoCausalClaims(ctx: IntegrationCheckContext, texts: string[], testName: string): Promise<OracleResult> {
    const test = await PsGateJudge.loadTest(ctx, testName);
    return new LLMJudgeOracle().evaluate(
      { test, actualOutput: texts.join('\n\n---\n\n'), contextUser: ctx.User, provider: ctx.Provider },
      { criteria: [...PsGateJudge.Criteria], strictMode: true },
    );
  }

  /** The gate outcome for an oracle result: it passes only when the oracle passed, and reports the oracle's message. */
  public static Verdict(result: OracleResult): { Passed: boolean; Detail: string } {
    return { Passed: result.passed === true, Detail: result.message };
  }

  private static async loadTest(ctx: IntegrationCheckContext, name: string): Promise<MJTestEntity> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTestEntity>(
      { EntityName: 'MJ: Tests', ExtraFilter: `Name = '${EscapeSQLString(name)}'`, ResultType: 'entity_object' }, ctx.User);
    if (!r.Success || r.Results.length !== 1) throw new Error(`MJ: Tests '${name}' not found: ${r.ErrorMessage || `${r.Results.length} rows`}`);
    return r.Results[0];
  }
}
```

Confirm the `OracleResult` import path by `grep -n "OracleResult" packages/TestingFramework/Engine/src/index.ts packages/TestingFramework/EngineBase/src/index.ts`; use whichever package exports it.

- [ ] **Step 3: The fixture adapter**

```ts
// packages/TestingFramework/integration-test-suite/src/checks/ps-gates/ps-gate-fixture.ts
/**
 * Fixture for the Predictive Studio containment gate bundles. The gates drive Predictive Studio through MJAPI as the
 * browser does (client transport), on datasets the truth suite generates and loads into the private `pstruth` schema.
 * The harness lives in @memberjunction/predictive-studio-truth-suite; this file adapts it to the check contract.
 */
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert, type BundleLifecycle, type IntegrationCheckContext } from '@memberjunction/testing-integration';
import { RunFixtures, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** What a gate body returns: pass/fail, the measured values and one plain sentence. */
export interface GateMeasurement {
  Passed: boolean;
  Measured: Record<string, number | string | boolean | null>;
  Detail: string;
}

/** The adapter every PS gate bundle uses. */
export class PsGate {
  /** The run harness bound to the check's client provider. */
  public static async Harness(ctx: IntegrationCheckContext): Promise<TruthHarness> {
    if (!(ctx.Provider instanceof GraphQLDataProvider)) {
      throw new Error('Predictive Studio gates run on the client transport (Configuration.transport = "client").');
    }
    return RunFixtures.HarnessFor(ctx.Provider, ctx.User);
  }

  /** Log the measurement and fail the check when it did not pass. */
  public static Assert(m: GateMeasurement): void {
    console.log(`      → ${m.Detail}  ${JSON.stringify(m.Measured)}`);
    Assert(m.Passed, m.Detail);
  }

  /** Bundle lifecycle: nothing to create up front; teardown removes the run's "PSTruth:" pipelines and models. */
  public static readonly Lifecycle: BundleLifecycle = {
    Setup: async () => { /* datasets load lazily per gate (DatasetLoader.Load is idempotent by stamp) */ },
    Teardown: async (ctx) => { await RunFixtures.CleanupRun(ctx.User); },
  };
}
```

Add to the truth suite (`src/harness/run-fixtures.ts`): `public static async HarnessFor(provider: GraphQLDataProvider, user: UserInfo): Promise<TruthHarness>` (build the same object `GetRunHarness` builds, from the given provider/user instead of `HarnessConnect`) and `public static async CleanupRun(user: UserInfo): Promise<void>` (delete this run's `PSTruth: … <RunID>` pipelines and models through the entity layer, checking every `Delete()` result). Export `RunFixtures`, `TruthHarness`, `ContainmentProbe`, `HarnessDatasets`, `AgentPlans`, `W_WORLD_FEATURES`, `W_WORLD_DENY_FIELDS`, `ConfidenceInterval`, `SeedRule` from the truth suite's `src/index.ts`. If `GateMeasurement` already exists in the truth suite (`src/gates/results.ts`), move it into `src/harness/types.ts` and import it here instead of redefining (§2 no duplicate types).

- [ ] **Step 4: One bundle per gate**

For each `TruthGate.Define('<title>', async (h) => { BODY })` in `gates/containment.gates.test.ts` and `gates/feature-pipelines.gates.test.ts`' non-G7 parts, create `ps-gate-<slug>.checks.ts`:

```ts
// packages/TestingFramework/integration-test-suite/src/checks/ps-gate-w4-s2-1.checks.ts
/** Gate G0.8 "W4 → S2.1": an as-of setting that has no effect is refused before training, 2 of 2 variants. */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ContainmentProbe, W_WORLD_FEATURES } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

export const PsGateW4S21Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w4-s2-1.G0.8', Name: 'G0.8 W4 → S2.1: no-effect as-of settings refused before training', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w4 = await h.EnsureLoaded({ Kind: 'world', ID: 'W4-pit', Seed: 42 });
      const features = [...W_WORLD_FEATURES, 'PersonStatusNow'];
      const a = await h.Train(await h.CreatePipeline(PsGateSpecs.W(h, 'G0.8 W4 column-mode', w4, { Features: features, AsOf: { Mode: 'column', Column: 'StartDate' } })));
      const b = await h.Train(await h.CreatePipeline(PsGateSpecs.W(h, 'G0.8 W4 asOf-input', w4, { Features: features })), { AsOf: { Mode: 'column', Column: 'StartDate' } });
      const refused = [a, b].filter((x) => ContainmentProbe.WasRefusedBeforeTraining(x, 'AS_OF_NO_EFFECT')).length;
      PsGate.Assert({
        Passed: refused === 2,
        Measured: { refused, columnModeCode: a.RefusalCode, asOfInputCode: b.RefusalCode, columnModeModel: a.ModelID, asOfInputModel: b.ModelID },
        Detail: `${refused} of 2 no-effect as-of variants refused before training`,
      });
    },
  },
];

for (const c of PsGateW4S21Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w4-s2-1', PsGate.Lifecycle);
```

Move the gate file's `spec()` helper to `ps-gates/ps-gate-specs.ts` as `PsGateSpecs.W(h, tag, dataset, over)` and `walk()` as `PsGateSpecs.Walk(dir, keep)`. Move every other body the same way — the body text is unchanged except:
- `return { Passed, Measured, Detail }` → `PsGate.Assert({ Passed, Measured, Detail })`.
- G0.1 (`W1 → S7.5`): `CAP_NAMED.test(t.ErrorMessage || '')` → `t.RefusalCode === 'READ_CAP_EXCEEDED'`; same for `s`. Delete `CAP_NAMED`.
- G0.7 (`W1 → S7.3`): `WasScoringRefused(x.a)` → `WasScoringRefused(x.a, 'MODEL_NOT_SCORABLE')` for both models. `RunFixtures.W1S42Model` is a trained Draft (it has an artifact) and `ModelNotScorableError.CanScore` allows only Validated and Published, so both refuse with `MODEL_NOT_SCORABLE`. Measured reports the codes, not the messages.
- G0.9 (`W2 → S5.3`): no refusal code applies to noise data, so delete the `WasRefusedBeforeTraining` branch. A failed training (`!t.Ok`) throws `new Error(\`${label}: training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage}\`)`; only the AUC interval decides the gate.
- G0.11 (`T4 → S6.5`): `/not evaluated as a forecast/i.test(v.Reason)` → `v.Reason === EvaluationLineage.NotEvaluatedAsForecast`; delete the `declared` counter (Task 7 removed `LastTimeIndexDeclared`).
- G0.6 (`W1 → S9.3`): replace the `CausalCopyScan` lines with
  ```ts
  const uiTexts = PsGateSpecs.UserFacingStrings(files);       // string literals from the scanned .ts/.html files
  const ui = PsGateJudge.Verdict(await PsGateJudge.NoCausalClaims(ctx, uiTexts, 'W1 -> S9.3'));
  const st = PsGateJudge.Verdict(await PsGateJudge.NoCausalClaims(ctx, stories, 'W1 -> S9.3'));
  PsGate.Assert({ Passed: ui.Passed && st.Passed && stories.length === 10, Measured: { filesScanned: files.length, storiesGenerated: stories.length, uiJudge: ui.Detail, storiesJudge: st.Detail }, Detail: `UI text: ${ui.Detail}; stories: ${st.Detail}` });
  ```
  `PsGateSpecs.UserFacingStrings(files)` moves the string-literal extraction from `TruthSuite/src/gates/causal-copy.ts:20-43` (it is the only part kept), returning the literal texts instead of regex hits; it must handle multi-line template literals (read the whole file, not line by line). The check is `RequiresLiveModel: true` (not `RequiresMutation`) and throws a clear error when `AI_VENDOR_API_KEY__GeminiLLM` is unset.
- G0.4 (`W1 → S9.4`): fold in the assertions of `ps-row-drivers.truth.dom.test.ts` that check the badge for AutoRenew rows (the badge decision is `AtRiskRules.DriverRaisesRisk`; assert `false` for the 488 rows), then `git rm` the DOM test.
- G0.2 / G0.3 (`W2 → C1.1`, `W3 → C1.1`): same move; half (b) of G0.2 counts every published run as inconsistent (no stored gate outcome exists until PR 4).

New bundle `ps-truth-datasets.checks.ts`: one check per catalog entry and base seed (`CATALOG` × `DatasetSeeds.SeedSet(kind, code, 'base')` = 68), built at module load:

```ts
export const PsTruthDatasetChecks: NamedCheck[] = CATALOG.flatMap((entry) =>
  DatasetSeeds.SeedSet(entry.Kind, entry.Code, 'base').map((seed): NamedCheck => ({
    Id: `ps-truth-datasets.${entry.Code}-s${seed}`,
    Name: `${entry.Kind} ${entry.Code} seed ${seed}: loads and every row reads back through MJAPI`,
    RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const ds = await h.EnsureLoaded(PsGateSpecs.Ref(entry.Kind, entry.Code, seed));
      const res = await RunView.FromMetadataProvider(ctx.Provider).RunView({ EntityName: ds.Entity.Name, ResultType: 'count_only', BypassCache: true }, ctx.User);
      Assert(res.Success, `count of ${ds.Entity.Name}: ${res.ErrorMessage}`);
      Assert(ds.RowCount > 0, `${entry.Code} s${seed} loaded no rows`);
      AssertEqual(res.TotalRowCount, ds.RowCount, `${ds.Entity.Name} row count through MJAPI`);
    },
  })),
);
```

`PsGateSpecs.Ref(kind, code, seed): DatasetRef` narrows `code` with guards over the `WorldID` / `ScenarioID` unions (no `as` casts). The equality is exact because the loader now replaces the table's rows in one transaction.

Add each new module to `src/index.ts` after the `fp-gate` block: `export * from './checks/ps-gate-w1-s7-5.checks';` … and `export * from './checks/ps-truth-datasets.checks';`. Add each bundle and its check count to the two lists in `check-registry.test.ts` (the counts map near line 323 and the Id list near line 571).

- [ ] **Step 5: Test metadata**

One record per bundle under `metadata-optional/integration-test/tests/gates/` (PR 1's shape; new UUIDs from `uuidgen`, uppercase):

```json
{
  "fields": {
    "TypeID": "@lookup:MJ: Test Types.Name=Integration Test",
    "Name": "W4 -> S2.1",
    "Description": "Gate G0.8 (owner PR 2, phase 0, dataset W4, criterion S2.1): a pipeline whose as-of setting has no effect is refused before training, 2 of 2 variants (column mode on the pipeline, and an asOf input on the Train call). Refusal is read from the operation's AS_OF_NO_EFFECT result code.",
    "Status": "Active",
    "Tags": "[\"gate\",\"G0.8\",\"owner:PR2\",\"phase:0\",\"dataset:W4\",\"criterion:S2.1\"]",
    "InputDefinition": {},
    "ExpectedOutcomes": { "summary": "2 of 2 no-effect as-of variants refused with AS_OF_NO_EFFECT; no model created." },
    "Configuration": { "tier": "mutation", "transport": "client", "checks": [ { "type": "ps-gate-w4-s2-1" } ] }
  },
  "primaryKey": { "ID": "<uuidgen>" }
}
```

Names use `->` like PR 1 (`"W1 -> S7.5"`). G0.6's record has `"tier": "live-model"`. G0.2/G0.3 have `"Status": "Pending"` and a description that says PR 4 activates them. The datasets record is named `"PS truth datasets: load and verify"`.

Suites (`.ps-gates-containment-suite.json`, `.ps-gates-pending-suite.json`) follow `.ps-gates-feature-pipelines-suite.json`: the containment suite lists the ten PR 2 gates and the datasets test (`Sequence` 1..11, datasets first); the pending suite lists G0.2 and G0.3. Each suite description states the run command:
`MJ_INTEGRATION_TEST=1 RUN_MUTATION_TESTS=1 pnpm mj test suite "Predictive Studio Gates — Containment"` (MJAPI and the truth sidecar running; `pnpm run truth:provision` done).

- [ ] **Step 6: Unit tests of the suite package**

Run: `cd packages/TestingFramework/integration-test-suite && pnpm run build && pnpm test`
Expected: green, including `sibling-parity.test.ts` and `check-registry.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/TestingFramework/integration-test-suite/src packages/TestingFramework/integration-test-suite/package.json \
  metadata-optional/integration-test/tests/gates metadata-optional/integration-test/test-suites/.ps-gates-containment-suite.json \
  metadata-optional/integration-test/test-suites/.ps-gates-pending-suite.json packages/AI/PredictiveStudio/TruthSuite/src pnpm-lock.yaml
git rm packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-row-drivers.truth.dom.test.ts
git commit -m "test(predictive-studio): containment gates as MJ Tests in the integration suite; G0.6 graded by the LLM judge"
```

Run `pnpm install` at the repo root after the `package.json` edit, before building.

---

### Task 10: Delete the truth-suite framework and dead code

**Files:**
- Delete (`git rm -r`): `packages/AI/PredictiveStudio/TruthSuite/{gates,src/registry,src/gates,src/readme,baselines}`, `vitest.gates.config.ts`, `scripts/{run-truth.mjs,report.mjs,import-gates.mjs,readme-walkthrough.mts,smoke-w1.mts,majority-rule-check.mts,ui-fixture.mts}`, `src/harness/{agent-step.ts,story-step.ts}` (after Task 7 moved the agent call in process — see Step 1), `src/stats/binomial.ts`, `packages/AI/PredictiveStudio/Core/src/causal-copy.ts`, `packages/AI/PredictiveStudio/Core/src/__tests__/causal-copy.test.ts`, `packages/AI/PredictiveStudio/Engine/src/__tests__/causal-copy-scan.test.ts`
- Delete Python: `python/truthsuite/judges/{cli,judge,judge_multiclass,delong,verdicts,scenarios}.py`, `python/truthsuite/refpipe/`, `python/truthsuite/stats/`, their `python/tests/*`, `fixtures/real/` (after confirming only the deleted Python reads them: `grep -rn "fixtures/real\|fixtures', 'real" packages/AI/PredictiveStudio/TruthSuite`)
- Modify: `Core/src/index.ts`, `Engine/src/agent/__tests__/pipeline-builder-agent.test.ts:207`, `TruthSuite/package.json`, `TruthSuite/README.md`, `TruthSuite/python/requirements.txt`, `TruthSuite/scripts/run-pytest.mjs`, `src/stats/seed-rules.ts`, `src/stats/wilson.ts` → `src/stats/confidence-interval.ts`

- [ ] **Step 1: Agent calls in process**

`src/harness/agent.ts` spawns `agent-step.ts`/`story-step.ts`. Replace the spawns with in-process calls through `AgentRunner` from `@memberjunction/ai-agents` (already a dependency), keeping `RunBuilderAgent`'s and `GenerateStory`'s signatures; delete the `storyQueues` static and the `--count 10` coupling (each `GenerateStory` call runs one story). Then `git rm src/harness/agent-step.ts src/harness/story-step.ts`.

- [ ] **Step 2: Delete**

Run the `git rm` commands for the file list above. Remove `export * from './causal-copy';` from `Core/src/index.ts`; delete the `CausalCopy` assertion at `pipeline-builder-agent.test.ts:207` (G0.6's judge covers it). Rename `wilson.ts` → `confidence-interval.ts` (`git mv`) and update imports. Delete the TS stats tests that covered only `binomial.ts` and `SeedRule.PassProbability`; keep `SeedRule.Passes`/`AcceptanceRange` (G0.2 uses them).

- [ ] **Step 3: Package scripts and README**

`package.json` scripts become exactly:
```json
"build": "tsc && tsc-alias -f",
"test": "vitest run",
"test:db": "vitest run --config vitest.db.config.ts",
"test:regeneration": "vitest run --config vitest.regeneration.config.ts",
"test:python": "node scripts/run-pytest.mjs && node scripts/run-pytest.mjs --mypy",
"truth:loom": "node scripts/fetch-loom.mjs",
"truth:data": "tsx src/data/cli.ts",
"truth:provision": "node scripts/provision.mjs",
"truth:sidecar": "tsx scripts/sidecar.mts",
"setup:python": "node scripts/setup-python.mjs"
```
Description: `"Predictive Studio planted-truth datasets and the harness the containment gate checks use. Repo-local test content; never published."` Add a `--mypy` mode to `run-pytest.mjs` that runs `python -m mypy --config-file python/mypy.ini python/truthsuite python/tests` with the venv interpreter; remove `ignore_missing_imports = True` from `mypy.ini` and fix the errors it reports (start with `tests/test_judge_scenarios.py` if it survives; it is deleted with `scenarios.py`). Rewrite `README.md`: what the package holds (catalog of 68 datasets: list the world and scenario IDs from `catalog.ts`), setup (`truth:loom`, `setup:python`, `truth:provision`, `truth:sidecar`), and how gates run (`mj test suite "Predictive Studio Gates — Containment"`).

- [ ] **Step 4: Test**

Run: `cd packages/AI/PredictiveStudio/Core && pnpm run build && pnpm test && cd ../Engine && pnpm run build && pnpm test && cd ../TruthSuite && pnpm run build && pnpm test && pnpm run test:python && cd ../../../TestingFramework/integration-test-suite && pnpm run build && pnpm test`

- [ ] **Step 5: Commit**

```bash
git add -u packages/AI/PredictiveStudio
git add packages/AI/PredictiveStudio/TruthSuite/src/stats/confidence-interval.ts packages/AI/PredictiveStudio/TruthSuite/README.md packages/AI/PredictiveStudio/TruthSuite/package.json
git commit -m "refactor(predictive-studio): remove the truth suite's own runner, registry, regex judge and unreachable judges"
```

(`git add -u` stages only tracked modifications and deletions under that path; check `git status --short packages/AI/PredictiveStudio` first.)

---

### Task 11: Angular cleanup

**Files:**
- Modify: `packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-pipeline-wizard.component.ts:147-153,548-576,749-756,1096-1098`
- Modify: `.../components/ps-pipelines.component.ts:747,2191-2201`
- Modify: `.../components/ps-experiments.component.ts:58,86`
- Modify: `packages/Angular/Explorer/core-entity-forms/src/lib/custom/MLModels/ps-model-detail.component.ts:310-323`, `ml-model-view-models.ts:284-289`
- Modify: `packages/Angular/Explorer/core-entity-forms/src/lib/panels/model-predictions/model-prediction.panel.ts:24`
- Modify: `packages/Angular/Explorer/dashboards/src/__tests__/predictive-studio-score-history.test.ts`
- Modify: `.../components/ps-predictions-grid.component.ts:134-135,763`
- Modify: `.../predictive-studio-score-history.service.ts:127`, `e2e/fixtures.ts:23,64`
- Modify: plan-ID comments in `ps-row-drivers.component.ts:6`, `ml-model-view-models.ts:285`, `model-prediction.logic.ts:193`

**Interfaces:**
- Consumes: `ExperimentSessions.Enabled`, `ExperimentSessions.DisabledReason` from `@memberjunction/predictive-studio-core` (Task 5 puts the class in Core because the dashboards package depends on Core, not on the server Engine).
- Consumes: `ModelImportanceView.DisplayedFeatureImportance` (existing, `ml-model-view-models.ts:284`).

- [ ] **Step 1: Dead as-of code**

Wizard: delete `AsOfMode`, `AsOfColumn`, `AsOfOffsetDays`, `DateFields`, their camelCase twins, and the conditional spreads; the spec builder emits `AsOf: { Mode: 'none' }`. Pipelines page: delete `SetAsOfColumn`, `SetAsOfOffset` and twins; replace the `<select>` at line 747 with read-only text showing the stored mode and, when it is not `none`, an `mjButton` "Reset to none" that saves `{ "Mode": "none" }` through the existing pipeline save path.

- [ ] **Step 2: Experiments page binds to the capability**

Expose `public readonly SessionsEnabled = ExperimentSessions.Enabled;` and `public readonly SessionsDisabledReason = ExperimentSessions.DisabledReason;` on the component; the template shows `{{ SessionsDisabledReason }}` inside `@if (!SessionsEnabled)` at both places (lines 58, 86) instead of the literal copy. Update `ps-experiments.component.dom.test.ts` to assert the bound text equals `ExperimentSessions.DisabledReason`.

- [ ] **Step 3: One importance gate; unused import**

`ps-model-detail.component.ts:310-323`: replace the inline gate with `ModelImportanceView.DisplayedFeatureImportance(...)` (pass what it takes); keep that method as the only copy. Remove the unused `ParseDrivers` import from `model-prediction.panel.ts:24`.

- [ ] **Step 4: Typed fakes**

In `predictive-studio-score-history.test.ts`, replace the seven `as unknown as RunView` / `as unknown as IMetadataProvider` with small classes: `class FakeRunView implements Pick<RunView, 'RunView' | 'RunViews'> { … }` returning the fixture results, and pass them through the service's existing injection seam (read the service constructor/params for the seam; if it accepts only `RunView`, widen the parameter type to `Pick<RunView, 'RunView' | 'RunViews'>`).

- [ ] **Step 5: Bounded predictions read**

`ps-predictions-grid.component.ts:763`: replace `IgnoreMaxRows: true` with keyset paging: loop `RunView({ …, MaxRows: 1000, AfterKey: lastKey })` with `lastKey = CompositeKey.FromEntityRecord(entityInfo, rows[rows.length - 1])` until a short page, capped at `PsPredictionsGrid.MaxDetailRows = 50_000` (private static readonly), showing "Showing the first 50,000 predictions" when the cap is hit. See `guides/KEYSET_PAGINATION_GUIDE.md`. Move `type PredictionDetailRow` (134) above the component's JSDoc.

- [ ] **Step 6: Small items**

`??` → `||` at `predictive-studio-score-history.service.ts:127` and `e2e/fixtures.ts:23,64` (both left sides are strings where `''` should fall back). Replace plan-ID references ("gate W1 → S9.4", "C4 / F-SC-11", "D2-38", "M-final.5") in the three listed comments with the reason they encode.

- [ ] **Step 7: Build and test**

Run: `cd packages/Angular/Explorer/dashboards && pnpm run build && pnpm test && cd ../core-entity-forms && pnpm run build && pnpm test`; `npm run check:ui` from the root.

- [ ] **Step 8: Commit**

```bash
git add packages/Angular/Explorer/dashboards/src packages/Angular/Explorer/core-entity-forms/src e2e/fixtures.ts
git commit -m "refactor(predictive-studio): remove dead as-of UI, bind the sessions notice to the engine, bounded predictions read"
```

---

### Task 12: Metadata, prompt, guide, plan doc

**Files:**
- Modify: `metadata/actions/predictive-studio/.predictive-studio-actions.json:356` (Run Experiment Session)
- Modify: `metadata/scheduled-jobs/.predictive-studio-maintenance-job.json`
- Modify: `metadata/prompts/templates/model-development-agent/model-development-agent.template.md:53-72`
- Modify: `guides/PREDICTIVE_STUDIO_GUIDE.md:20`
- Modify: `plans/predictive-studio/PR-2-truth-suite-containment.md`
- Modify: `.changeset/ps-truth-suite-containment.md`

- [ ] **Step 1: Action and job**

Set the Run Experiment Session action's `Status` to `"Disabled"` (`MJ: Actions.Status` allows Active, Disabled, Pending). Maintenance job: `Name` back to `"Predictive Studio Maintenance"`; `Description`: `"Kept Disabled: no Action backs this job yet, so it must stay Disabled. It will run the Predictive Studio maintenance pass (staleness, scheduled re-scoring, retraining with a challenger comparison) once that action exists."`

- [ ] **Step 2: Prompt**

In step 4 ("Report"): "When the session finishes" → "When the Pipeline Builder finishes"; describe its output (the created pipeline, the trained candidates, the published model or the reason it stayed in Draft) instead of "the leaderboard". Replace the disclaimer paragraph (lines 62-68) with: `Describe features only as associated with the outcome or weighted by the model; never as causes or levers. If the results show no feature weights, say they are hidden for this kind of model.`

- [ ] **Step 3: Guide and plan doc**

Guide line 20: list experiment sessions and maintenance/retrain as "built, not wired" (matching the guide's own notes at line 868). Plan doc: set its header `Status` to `in-review`, tick the checkboxes for work the PR contains (match against the gate list: the ten PR 2 gates and their containment items), delete the external "plans repo `AGENTS.md`" bootstrap instructions and the sample agent payloads (from about line 6901 to the end of that sample), and add a line at the top pointing to `PR-2-standards-cleanup-design.md`.

- [ ] **Step 4: Changeset**

Add `"@memberjunction/ng-base-forms"` only if Task 13 keeps base-forms changes; otherwise leave the package list. Update the body: replace "explicit deactivation of un-wired experiment sessions and maintenance jobs" with the final wording, and keep the unmeasured-models note.

- [ ] **Step 5: Verify metadata pushes on the clean database**

Run (env pointing at `MJ_PS_PR2_clean`): `npx mj sync push --dir=metadata --ci` — expect no errors; then restore any sync-block write-back in files that were clean before (`git diff --stat metadata`, and for each file this task did not edit: `git show HEAD:<path> > <path>`).

- [ ] **Step 6: Commit**

```bash
git add metadata/actions/predictive-studio/.predictive-studio-actions.json metadata/scheduled-jobs/.predictive-studio-maintenance-job.json \
  metadata/prompts/templates/model-development-agent/model-development-agent.template.md guides/PREDICTIVE_STUDIO_GUIDE.md \
  plans/predictive-studio/PR-2-truth-suite-containment.md .changeset/ps-truth-suite-containment.md
git commit -m "docs(predictive-studio): status, prompt and guide match the switched-off wiring; plan doc current"
```

---

### Task 13: Changes that leave the PR

**Files:**
- Delete: `.github/workflows/ps-truth-suite.yml`
- Revert to `next`: `.github/workflows/test.yml` (only the PATHS line this PR added), `packages/TestingFramework/integration-test-suite/src/checks/cache-gauntlet.checks.ts`, `packages/Angular/Generic/base-forms/src/lib/links/record-link-utils.ts`, `.../record-links.component.ts`, `.../record-preview-popover.component.ts`

- [ ] **Step 1: Remove and revert**

```bash
git rm .github/workflows/ps-truth-suite.yml
for f in packages/TestingFramework/integration-test-suite/src/checks/cache-gauntlet.checks.ts \
  packages/Angular/Generic/base-forms/src/lib/links/record-link-utils.ts \
  packages/Angular/Generic/base-forms/src/lib/links/record-links.component.ts \
  packages/Angular/Generic/base-forms/src/lib/record-preview-popover/record-preview-popover.component.ts; do
  git show origin/next:"$f" > "$f"
done
```

(Confirm each base-forms path with `git diff --name-only origin/next...HEAD -- packages/Angular/Generic/base-forms` before running.) In `test.yml`, delete only the `.github/workflows/ps-truth-suite.yml` line this PR added (`git diff origin/next -- .github/workflows/test.yml` must be empty after).

- [ ] **Step 2: Check the required gates still pass without them**

Run: `npm run check:guards`, `npm run check:standards`, `cd .github/scripts && npx vitest run`, `cd packages/Angular/Generic/base-forms && pnpm run build && pnpm test`.
- If `check:guards` fails on the base-forms files, restore this PR's version of the failing file only (`git show HEAD~0:<path>` from before this task's commit) and record the reason in the PR description.
- The cache-gauntlet change is needed only if the deterministic integration tier fails CG5 on this branch; Task 14 runs that tier and decides.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml packages/TestingFramework/integration-test-suite/src/checks/cache-gauntlet.checks.ts packages/Angular/Generic/base-forms/src
git commit -m "chore: take the CI workflow and the unrelated cache and base-forms fixes out of PR 2"
```

---

### Task 14: Verification, PR description, push

- [ ] **Step 1: Repo gates**

Run: `npm run check:guards && npm run check:standards && npm run check:esm && npm run check:changeset` — Expected: all pass.

- [ ] **Step 2: Unit tests of every touched package**

Run `pnpm test` in: Core, Engine, Sidecar (`node scripts/run-pytest.mjs`), TruthSuite (`pnpm test`, `pnpm run test:python`, `pnpm run test:regeneration`), dashboards, core-entity-forms, base-forms, integration-test-suite, MJGlobal. Record pass/fail/skip counts.

- [ ] **Step 3: Mutation spot-checks**

For each, make the change, run the named test, confirm it goes red, revert the change with an `Edit` (not git):
1. `PredictiveStudioRefusals.CodeOf`: return `null` for `AsOfSettingHasNoEffectError` → `refusal-codes.test.ts` red.
2. `ContainmentProbe.WasRefusedBeforeTraining`: drop `a.RefusalCode === expected` → `containment-probe.test.ts` red.
3. `AtRiskRules.BuildAtRiskOptions`: `'positive'` → `'adverse'` → `at-risk-rules.test.ts` red.
4. `ImportanceDisplay.GlobalDriversShowable`: `=== 'coefficient'` → `!== 'none'` → `importance-display.test.ts` red.

- [ ] **Step 4: Clean end-to-end run**

On `MJ_PS_PR2_clean` (fresh, per the `bootstrap-clean-db` skill, plus bizapps-common is not needed):
```bash
cd packages/AI/PredictiveStudio/TruthSuite && pnpm run truth:loom && pnpm run setup:python && pnpm run truth:provision
pnpm run truth:sidecar &           # leave running
cd /Users/arieglazier/repos/MJ_20260925 && GRAPHQL_PORT=4001 pnpm run start:api &   # wait until it accepts connections
MJ_INTEGRATION_TEST=1 RUN_MUTATION_TESTS=1 pnpm mj test suite "Predictive Studio Gates — Containment"
MJ_INTEGRATION_TEST=1 RUN_MUTATION_TESTS=1 pnpm mj test run "W2 -> C1.1"
MJ_INTEGRATION_TEST=1 RUN_MUTATION_TESTS=1 pnpm mj test run "W3 -> C1.1"
pnpm run test:integration
```
Expected: the containment suite passes 11/11 (ten gates + the 68-dataset test); G0.2 and G0.3 report their results (G0.3 fails as expected until PR 4; say so); the deterministic integration tier passes (if CG5 fails, restore the cache-gauntlet change from Task 13 and re-run).

Verify with `sqlcmd` using `.env` credentials: `SELECT t.Name, tr.Status FROM __mj.vwTestRuns tr JOIN __mj.Test t ON t.ID = tr.TestID WHERE t.Name LIKE 'W%->%' OR t.Name LIKE 'T4%' OR t.Name LIKE 'PS truth%' ORDER BY tr.__mj_CreatedAt DESC` — 11 Passed rows for this run.

Stop MJAPI and the sidecar. Restore any sync write-back as in Task 12 Step 5.

- [ ] **Step 5: PR description**

Merge `origin/next` if the branch is behind (no conflicts expected; if any, resolve each file by reading both sides). Update the PR body: the gates now run as MJ Tests (`mj test suite "Predictive Studio Gates — Containment"`), the refusal codes, the importance kind, the removed framework, what left the PR, the new diff size (`git diff --stat origin/next...HEAD | tail -1`), and the Step 2–4 numbers. Keep it human-readable and short, as before.

- [ ] **Step 6: Push**

```bash
git branch -vv | grep '^\*'     # must show [origin/ps/pr-2-truth-suite-containment]
git push origin ps/pr-2-truth-suite-containment
gh pr checks 5978 --watch
```
Expected: all required checks green.
