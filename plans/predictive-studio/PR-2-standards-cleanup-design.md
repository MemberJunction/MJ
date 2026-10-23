# PS PR 2 (`#5978`) — Coding-Standards Cleanup Spec

**Date**: 2026-10-23
**Branch**: `ps/pr-2-truth-suite-containment`
**PR**: [#5978 — planted-truth suite and Phase-0 containment](https://github.com/MemberJunction/MJ/pull/5978)
**Binding standard**: `coding_standards.md` (cited below as §N)
**Precedent**: [`PR-1-an-bc-review-design.md`](PR-1-an-bc-review-design.md) and PR 1's gate layout (commit `ce758af8ce`)

---

## 1. Goal and decisions

An audit of the PR (270 files, ~96k lines) against `coding_standards.md` found that it rebuilt MJ's Testing Framework next
to itself, committed generated output and one-off scripts, moved logic into Core with heuristics and compatibility shims,
and carried changes unrelated to Predictive Studio. Four of the findings are correctness bugs in the gates themselves.

Clean it up **in this one PR**, following the shape PR 1 already established.

| # | Decision |
|---|---|
| D1 | One PR, cleaned in place. No split. |
| D2 | Gates follow PR 1's pattern: one `MJ: Tests` row + one `NamedCheck` per gate in `integration-test-suite`, grouped in a Test Suite, run by `mj test suite`. No parallel registry, runner, outcome model or report. |
| D3 | All 68 datasets stay generated and loadable. A real test ("PS truth datasets: load and verify") loads all 68 and checks every row count. |
| D4 | G0.2 and G0.3 (owned by PR 4) are `MJ: Tests` rows with `Status = 'Pending'`, outside the suite. MJ has no expected-fail outcome; none is invented. |
| D5 | The CI/lane machinery is dropped. Tiers (`mutation`, `live-model`) are the only run gating. CI wiring comes later. |
| D6 | At-risk logic stays in Core (the only browser-safe package both `ng-dashboards` and `ng-core-entity-forms` import); its contents are fixed and Core's stale "types-only" header is corrected. |
| D7 | No migration and no new columns (memory: generic mechanisms first). Polarity uses the existing `OutcomeConfig.Polarity`; importance kind travels with the model's stored training output. |
| D8 | Compatibility shims this PR added are deleted. Deprecated stubs already published on `next` are left as they are (the repo naming rule keeps them for consumers); where this PR removed or extended one, that change is reverted so the diff stays minimal. |

### Lessons carried from PR 1's review
- No Predictive Studio logic in shared or foundational packages beyond what both consumers need (§4 "keep core lightweight").
- Use the MJ mechanism that exists before building one (§3 "check for existing utilities", §6).
- PascalCase public surface, static methods on the owning class, no backward-compatibility shims (§2, §3).
- Only ship what is wired: no stub tests, no dead entry points, docs that match the wiring (§3, §11).
- Clean, minimal diff: nothing unrelated to the PR's purpose (§13).

---

## 2. Gate correctness fixes (do these first)

| Bug | Where | Fix |
|---|---|---|
| Stub gates reported as passing | `TruthSuite/scripts/report.mjs:34` | Removed with the runner (§3). Stubs no longer exist as code. |
| Any failure counts as a refusal (G0.7, G0.8, G0.9) | `TruthSuite/src/harness/containment-probe.ts:21-28` | Engine operations return a typed refusal code (§5.2); checks assert on the code. A crash, GraphQL error or timeout fails the gate. |
| Outcomes decided by error-message regex (G0.1 `1,?000`, G0.11 `/not evaluated as a forecast/`) | `TruthSuite/gates/containment.gates.test.ts:21, 329` | Assert on `ReadCapError` / a typed reason code (§2, §8). |
| Live stories and UI text judged by 8 regexes (G0.6) | `Core/src/causal-copy.ts`, `TruthSuite/src/gates/causal-copy.ts` | `LLMJudgeOracle` with a strict criterion (§3.2). Both regex files deleted. |
| Non-transactional scenario load leaves a stale stamp on an empty table | `TruthSuite/src/db/scenario-loader.ts:71-87, 157-173, 229-240` | One transactional loader (§4.3). |

---

## 3. Gates on MJ's Testing Framework

### 3.1 Layout (mirrors PR 1)

```
metadata-optional/integration-test/
  test-suites/.ps-gates-containment-suite.json        "Predictive Studio Gates — Containment"
  tests/gates/.gate-W1-S7.5.json                       G0.1   (one file per gate, PR 1's naming)
  tests/gates/.gate-W1-S9.3.json                       G0.6
  ...                                                  G0.4, G0.5, G0.7–G0.12
  tests/gates/.gate-W2-C1.1.json                       G0.2   Status = Pending, not in the suite
  tests/gates/.gate-W3-C1.1.json                       G0.3   Status = Pending, not in the suite
  tests/gates/.ps-truth-datasets-load.json             68-dataset load and verify
packages/TestingFramework/integration-test-suite/src/checks/
  ps-gate-<id>.checks.ts                               one NamedCheck per gate
  ps-gates/                                            shared fixture (dataset load, trained-model fixtures)
```

Each test row uses `TypeID = Integration Test`, PR 1's tag set (`gate`, `G0.x`, `owner:PR2`, `phase:0`, `dataset:…`,
`criterion:…`) and `Configuration: { tier, transport: "server", checks: [{ type }] }`. Tier: `live-model` for G0.6,
`mutation` for the rest and for the dataset test. PR 1's G7.x gates stay in PR 1's suite and are no longer bridged.

The twelve gate bodies in `gates/containment.gates.test.ts` move into the checks with their measured values and detail
strings intact. The harness (`src/harness/*`) becomes the shared fixture under `checks/ps-gates/`, decomposed into
static methods on owning classes (§2), with one process helper replacing the two hand-rolled `spawn` wrappers (§3) and
one results-directory accessor (§3).

### 3.2 G0.6 with `LLMJudgeOracle`

The check collects (a) the user-facing strings of the Predictive Studio dashboards, Core and the story prompt
templates, and (b) ten live-generated model stories, then calls `LLMJudgeOracle.evaluate` with `strictMode: true` and
criteria equivalent to:

1. Describes features only as associated with the outcome or weighted by the model.
2. Makes no claim that changing a feature changes the outcome.
3. Gives no advice to act on a feature in order to change the outcome.

Precedent: `integration-test-suite/src/checks/rubrics.checks.ts`; the package already depends on
`@memberjunction/testing-engine` and `@memberjunction/rubrics`. The agent is called in process through `AgentRunner`
rather than spawning `agent-step.ts` / `story-step.ts`.

### 3.3 Deleted (truth-suite framework)
`gates/gates.json`, `gates/registry-stubs.gates.test.ts`, `gates/*.gates.test.ts` (bodies moved), `src/registry/`,
`src/gates/`, `vitest.gates.config.ts`, `scripts/run-truth.mjs`, `scripts/report.mjs`, `scripts/import-gates.mjs`,
`scripts/readme-walkthrough.mts`, `src/readme/`, `scripts/smoke-w1.mts`, `scripts/majority-rule-check.mts`,
`scripts/ui-fixture.mts`, `baselines/`, `generators/calibrate_intercept.mjs`, `src/harness/agent-step.ts`,
`src/harness/story-step.ts`. The 111-gate inventory stays in the plan doc only.

---

## 4. Truth-suite package: data only

### 4.1 Generators
Port `generators/*.mjs` to typed TypeScript inside the package's `tsconfig` (§2). Merge the code duplicated between
`make_world` and `make_world_multiclass`, use `gen_lib`'s CSV writer everywhere (the local one does not escape), drop
stale `probes/` headers and the dead `worlds-domain` fallback. Golden hashes must stay byte-identical for all 68 datasets;
any intentional change regenerates them and says why.

### 4.2 Tables
One table per data shape with a dataset-key column (about 10 tables instead of 44): W1–W8 share one `Person` and one
`MembershipYear` table; scenario tables are keyed by column shape, not by scenario. Drop the five tables nothing loads
(`Scn_R2real`, `Scn_T1real`, `SeriesFrame_T1real`, `SeriesTrain_T1real`, `PersonYear`). The migration keeps only the
DDL (~50 lines); `scripts/provision.mjs` runs scoped CodeGen against the private database. `provision.mjs` stops
regenerating the entities sync file in a `finally` block, and builds its pool through `TruthConnection` (§3).

### 4.3 Loader
One `LoadDataset(ref)` replaces `WorldLoader` and the three scenario loaders: delete, bulk load and stamp in one
transaction, reading `AllowDirectSQLInsert/Delete` from `EntityInfo` rather than raw SQL against `__mj`, and checking the
bulk-insert row count instead of hand-written `COUNT(*)` (§3, §6). The unreachable `T1-real` branch goes.

### 4.4 Python and statistics
Keep `judges/holdout_rebuild.py`, `paths.py` and `scenarios/manifest.py`. Delete the other judges, `refpipe/`,
`stats/`, the `judges/cli.py` dispatcher, their tests and the `fixtures/real` files only they read. Delete
`src/stats/binomial.ts` and the TS-only statistics used only by tests; keep `ConfidenceInterval` only if a check uses
it, renamed from `wilson.ts` to `confidence-interval.ts`. Add `mypy --strict` to the package's test script and fix what
it reports.

### 4.5 Naming
Rename `CatalogEntry.ID` to `Code` (§1) and revert the two `UUIDCompliance.test.ts` exceptions.

---

## 5. Product code

### 5.1 Core
- **`at-risk-rules.ts`**: drawer copy back to Angular; record label from the entity's name field (metadata), not
  `MemberName`/`FullName`; delete the six free wrappers (callers use `AtRiskRules.*`); PascalCase members and remove the
  false `case-violation-ok` markers; `RiskBand` union instead of `| string`; narrow parsed JSON with type guards; `||`
  for fallbacks; thresholds from `OutcomeConfig` where it defines them.
- **Polarity**: `ResolveRenewalPolarity`'s substring and payload-text matching is replaced by `OutcomeConfig.Polarity`,
  set when the pipeline is built. Fail closed when it is absent (no inversion guessed).
- **`trust.ts`**: logic into static methods on `TrustVerdicts`; delete the free functions this PR added and
  revert its removal of the `trustEvidenceLine` / `trustDots` stubs (D8); PascalCase on `MajorityBaselineFinding`, `withheldReason`, `majorityBaseline`; split `DeriveTrustVerdict`;
  one equality style; restore the "why" header.
- **Importance display**: the sidecar reports the importance kind it produced (coefficient, split, impurity, gain)
  alongside the importances; it is stored with the model's training output; `ImportanceDisplay` reads it. Delete the
  algorithm-name set.
- **`causal-copy.ts`**: deleted, with `Engine/src/__tests__/causal-copy-scan.test.ts` and the assertion in
  `pipeline-builder-agent.test.ts`.
- **`evaluation-record.ts`**: JSDoc on `EvaluationRecord`.

### 5.2 Engine
- Typed refusal codes on the train and score operation results (lifecycle status, no-effect as-of, dry run, read cap,
  forecast not origin-split); checks assert on them.
- Delete `BuildWithResolver`, `UnresolvedPipelineResolver`, `BuildProductionExperimentDeps` and the dead orchestrator
  chain in `delegation.ts`; refuse once at the action boundary; the message becomes a static on
  `ExperimentSessionsUnavailableError`.
- `score-record-set.runner.ts`: required `provider` (no bare `new RunView()`), `simple` + PK `Fields`, shared chunk helper.
- `pipeline-builder-agent.ts`: revert the new parameter on the deprecated `generateMarkdownReport` stub (D8); strict equality; `TrustGrade | null` parameter.
- `training-engine.ts`: parse the majority-baseline rule once; drop `_response`.
- `ml-model-inference-processor.ts`: one status switch on `MJMLModelEntity['Status']`.

### 5.3 Sidecar
`validation_out_of_sample` set once in the response model; `DEFAULT_RANDOM_STATE`; a fold-context dataclass for
`_kfold_out_of_fold_metrics` / `_fit_fold`; remove line-number comments; `setup-python.mjs` uses `PythonProbe`'s version
helpers and `SupportedMinors`; one README holds the setup block.

### 5.4 Angular
- Dashboards call `AtRiskRules` statics; `HumanizeFeatureName` wrappers in `ml-model-view-models.ts` deleted.
- `ps-pipeline-wizard` / `ps-pipelines`: delete dead as-of state, setters and camelCase twins; replace the one-choice
  select with read-only text.
- `ps-experiments`: bind to an engine-exposed "sessions enabled" flag and reason (§4 capability flags) instead of copied text.
- One shared importance gate (`ModelImportanceView`) used by `ps-model-detail`.
- `predictive-studio-score-history.test.ts`: typed fakes, no `as unknown as`.
- `ps-predictions-grid`: keyset paging with a bound instead of `IgnoreMaxRows: true` (§7).
- Remove the unused `ParseDrivers` import; move `PredictionDetailRow` above the component JSDoc; replace plan-ID
  comments with the reason; move `ps-row-drivers.truth.dom.test.ts` into the G0.6 check.

### 5.5 Metadata and docs
- `Run Experiment Session` action: `Status` inactive in `.predictive-studio-actions.json`.
- Maintenance scheduled job: original name restored, stays Disabled, short accurate description.
- `guides/PREDICTIVE_STUDIO_GUIDE.md` status row: sessions and maintenance built, not wired.
- `model-development-agent.template.md`: step 4 describes the Pipeline Builder's output; the disclaimer paragraph becomes
  one rule.
- TruthSuite README: the datasets that exist and the real run commands.
- `PR-2-truth-suite-containment.md`: status and checkboxes match reality; remove the external-repo bootstrap and the
  sample agent payloads.

### 5.6 Leaving the PR
The CI workflow and its `test.yml` line; the `cache-gauntlet.checks.ts` change; the `base-forms` primary-key fixes.
Each moves to its own small PR (CI dropped for now). If a required check on this branch fails without one of them, it
stays, and the PR description says which and why.

---

## 6. Verification

1. Unit tests of every touched package, with pass/fail/skip counts.
2. `check:guards`, `check:standards`, `check:esm`, `mypy --strict` on the remaining Python.
3. Mutation spot-checks (§13): flip each refusal-code check, the polarity read and the importance-kind read, and confirm
   a named test goes red.
4. Fresh private database: `truth:provision`, then
   `MJ_INTEGRATION_TEST=1 RUN_MUTATION_TESTS=1 mj test suite "Predictive Studio Gates — Containment"`
   (live-model is on by default via `RUN_AGENT_TESTS`; all ten PR 2 gates and the 68-dataset test pass), the two Pending tests run individually and reported, and
   `pnpm run test:integration`.
5. Database records checked with `sqlcmd` (Test Runs, model statuses).
6. PR description updated with the new numbers and the reduced diff size.

## 7. Out of scope
New gate implementations for PR 3–5; CI scheduling; PostgreSQL; any migration in `migrations/`.
