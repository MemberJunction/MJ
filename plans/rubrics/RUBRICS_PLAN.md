# Rubrics — a first-class MemberJunction primitive

> **Status:** schema and CodeGen tails are in the branch. Engine, testing-framework, agent, and UI
> work (R2 onward, T, A, U) has not started. `guides/RUBRICS_GUIDE.md` is still owed.
> **Schema:** `migrations/v6/V202609302204__v6.2.x__Rubrics.sql`, `…2205…`, and `…2206…`.
> Hand-written DDL is the tables and the consensus wrapper views. Layering flags live in
> `metadata/entities/.layered-base-views.json`. Label name-field pins live in
> `metadata/entities/.rubric-label-name-fields.json`. Neither is an `UPDATE` in a migration.
> `V202609302205` is the captured inner views only. CodeGen tails are appended (§9, task R0).
> **Scope of this plan:** the core primitive, the testing framework integration, and the agent
> integration. All three ship from this plan.
>
> **How to use this document.** It is the implementing agent's task state. Work the §15 task list
> in order, tick boxes in place (`- [x]`), and append a dated note to §16's progress log whenever a
> task changes state. When reality forces a design change, update the relevant section and record
> why in §16 — never let the plan and the code disagree silently.

---

## 1. What a rubric is, and why it belongs in core

A rubric is **weighted, nested criteria that a record is evaluated against, producing scores and a
verdict.** It is a small idea that applies almost everywhere:

- **AI evaluation** — judging an agent's or prompt's output in a test, or sampling production runs.
- **Peer review** — several reviewers scoring a submission (a paper, a proposal, an abstract) on the
  same criteria, then reconciling.
- **Awards and competitions** — a judging panel scoring nominees; ranking within a category.
- **Procurement** — a deeply nested requirements matrix; vendors assert compliance, evaluators
  score the responses; some requirements are knockouts.
- **Accreditation and audits** — standards → criteria → required evidence; a self-study rated by
  the institution and again by a visiting team.
- **Hiring** — structured interview and resume evaluation.

MemberJunction today has no shared model for this. The testing framework carries an unused
`TestRubric` table and a list of judge criteria strings; applications built on MJ have each built
their own rubric tables with incompatible shapes. Putting the primitive in core means the testing
framework and agents use it directly, and every application inherits storage, scoring math,
versioning, AI and human evaluators, consensus, and UI widgets instead of rebuilding them.

### 1.1 Goals

1. One generic data model for rubric **definitions**, **evaluations** and **consensus**.
2. Deterministic, well-specified **scoring math** on a single normalized **0..1** scale.
3. **Immutable, semantically versioned** rubric versions and **immutable** submitted evaluations.
4. Pluggable **evaluators**: human, AI prompt, agent, deterministic rules, self-assessment, external.
5. **Multiple evaluators per record**, with consensus and disagreement available cheaply on read.
6. First-class use in the **testing framework** (a `rubric` oracle, human per-criterion review,
   judge calibration) and by **agents** (published rubrics, self-check, production sampling).
7. Reusable **UI** for building, filling in, displaying and comparing rubrics.
8. An agent that helps people **author** good rubrics.

### 1.2 Non-goals

- **Decisions and routing.** A rubric produces a score, gate results, a pass/fail against a
  threshold, and a band label. What happens next — accept, advance, route to a person, release a
  decision — belongs to the consuming application. Core never owns a disposition.
- **Reviewer assignment, conflict-of-interest rules, and workflow.** Consumers own who evaluates
  what and when. Core owns how an evaluation is recorded and scored.
- **Population scoring models.** Formula-over-data scoring of whole populations (engagement or
  health scores recomputed on a schedule) is a different shape and is out of scope.
- **PostgreSQL migration counterparts** — produced by the build engineer at release time
  (`migrations/CLAUDE.md`). Nothing in this plan hand-writes PG SQL.

### 1.3 Consumers this is designed for

The testing framework and agents are built in this plan. Beyond core, known consumers are the
**Caliber** conversational-assessment app and **ATS** on top of it (each has its own plan-only PR
describing its migration onto core rubrics — see §14), and a future **generic submissions /
peer-review application** (calls for submissions, multi-reviewer review rounds, awards). None of
their vocabulary appears in the core model; the §13 guide's examples keep the design honest
against all of them.

---

## 2. What exists today (verified 2026-09-30)

| Area | Current state | Consequence |
|---|---|---|
| `MJ: Test Rubrics` (`TestRubric`) | Created in `migrations/v2/V202511091152…`. Untyped `Criteria` JSON, free-text `Version`, scoped to one Test Type, no FK from Test/TestRun/Suite, no seed rows. Cached by `TestEngineBase` and has a custom form; **never read during execution.** | Dead schema. Deprecated via metadata (`metadata/entities/.test-rubrics-deprecation.json`: `Status = Deprecated` + new description), table dropped at the next major. |
| Judge criteria | `Test.ExpectedOutcomes.judgeValidationCriteria: string[]`, read by `LLMJudgeOracle` and by Computer Use's judge (`packages/AI/ComputerUse/src/judge/rubric.ts`: `CriterionVerdict {criterion, met, evidence}`). | The de-facto rubric is an unweighted list of binary criteria. It becomes an **inline rubric** (§10.4). |
| `LLMJudgeOracle` | Looks up a prompt named `"Test LLM Judge"` that **does not exist** in `metadata/`; hardcoded pass thresholds (`LLMJudgeOracle.ts:158` — every criterion ≥ 0.8 in strict mode, else overall ≥ 0.7); ignores `config.model/temperature/promptTemplate`. | Cannot run as shipped. Rebuilt on the rubric engine (§10.4). |
| `AgentEvalDriver` | `const skipOracles = true` (`AgentEvalDriver.ts:846`); a completed run is marked Passed with score 0. | Agent eval oracles never run. Fixed in §10.1. |
| Test scoring | Per-oracle-type weighted mean (`BaseTestDriver.calculateScore`); per-oracle `weight` ignored; per-criterion results only survive as untyped JSON in `TestRun.ResultDetails`; suite average computed but **never persisted**. | Rubric results get real rows; suite score persisted (`TestSuiteRun.Score`, added by the migration). |
| Human feedback | `MJ: Test Run Feedbacks`: one `Rating` (1–10) + `IsCorrect` per run. | Kept. Per-criterion human scoring is added through rubric evaluations (§10.6). |
| Decision primitive | `ScoreQuestion`/`ScoreAnswer` (`packages/AI/Core/src/generic/decision.types.ts`) return a level plus per-level probabilities and confidence; `AIDecisionRunner` runs them. | Backend for the per-criterion AI evaluation mode (§8.3). |
| Layered base views | `Entity.GeneratedBaseViewName` (MJ#3419): CodeGen writes an inner view, the app owns a thin wrapper. Pilot: `V202608050100` / `V202608050105`. | Used for on-demand consensus (§7, §9). |

---

## 3. Concepts

Three things, kept separate on purpose:

1. **Rubric definition** — what we judge against. A `Rubric` is a stable identity; its content lives
   in `RubricVersion`s. Only one Draft exists at a time; publishing freezes it and assigns a
   semantic version computed from what changed.
2. **Evaluation** — **one evaluator's** judgment of **one subject record** against **one pinned
   version**, optionally within a **context** (the test, review round or workflow step that asked).
   Editable as a Draft; on submit the result is computed once and stored; then it is immutable.
3. **Consensus** — how several evaluations of the same subject combine. A **cohort** is every
   Submitted, non-Self evaluation with the same subject, the same context, and the same rubric and
   **major** version. Cohort statistics are computed on read by the layered base views (cheap
   aggregates) and by the engine (median, trimmed mean, agreement statistics).

**Decisions stay with the consumer.** Core reports score, gates, pass/fail against a threshold,
band and completeness. The consumer decides what they mean, and a human releases any decision
that matters.

### 3.1 Evaluator types

| `EvaluatorType` | Who | Identity recorded |
|---|---|---|
| `Human` | A person filling in the form | `EvaluatorUserID` (required) |
| `AIPrompt` | An LLM judge via `AIPromptRunner` | `AIPromptRunID` |
| `Agent` | An agent that may use tools (query data, fetch documents) | `AIAgentRunID` |
| `Deterministic` | Rules in `RubricCriterion.EvaluatorConfig` | `EvaluatorName` (driver class) |
| `Self` | The subject's own party — a vendor asserting compliance, an institution's self-study, an applicant's self-rating | `EvaluatorUserID` when known. **Excluded from reviewer consensus**; reported as `SelfAssessmentScore`. |
| `External` | Imported from another system | `EvaluatorName`, `Metadata` |

`Self` is what lets procurement ("vendor asserts, evaluators score") and accreditation
("self-study, then visiting team") be two evaluations of one subject instead of a special case.

---

## 4. Data model

All tables are in the core schema; entity names get the `MJ: ` prefix from CodeGen. Full column
definitions, constraints and descriptions are in `V202609302204__v6.2.x__Rubrics.sql` — that file
is authoritative; this section explains the shape.

```
MJ: Rubric Categories        tree of folders
MJ: Rubric Scales            reusable scale: ScaleType Levels | Numeric (Min/Max/Step/HigherIsBetter)
 └ MJ: Rubric Scale Levels   Label, Value (raw), NormalizedValue (0..1, explicit), Sequence
MJ: Rubrics                  Name (unique), CategoryID, Status
 └ MJ: Rubric Versions       Major/Minor/Patch (NULL while Draft), Status Draft|Published|Retired,
    │                        BasedOnVersionID, Instructions, PassThreshold, MinimumCompleteness,
    │                        NotApplicablePolicy, ScoreDisplayMin/Max, Requested/Computed/AppliedBump,
    │                        ChangeSummary, ChangeDetails (JSON diff), ContentHash, ScoringHash
    ├ MJ: Rubric Criteria    tree: ParentID, Key (cross-version identity), NodeType Group|Criterion,
    │  │                     ScaleID (leaves only), Weight, IsAdvisory, IsGate + GateMinimumScore,
    │  │                     NotApplicablePolicy (override), RollupMethod (groups), EvidenceRequired,
    │  │                     RationaleRequired, Sequence, Guidance, EvaluatorConfig (JSON)
    │  └ MJ: Rubric Criterion Levels   per-criterion anchor text: ScaleLevelID xor AnchorValue
    └ MJ: Rubric Bands       Label, MinScore/MaxScore on 0..1, DisplayTone — interpretation only

MJ: Rubric Evaluations       RubricVersionID (pinned), Subject EntityID+RecordID,
 │                           Context EntityID+RecordID (optional), EvaluatorType + identity,
 │                           Status Draft|Submitted|Superseded|Withdrawn|Failed,
 │                           SupersedesEvaluationID, and the COMPUTED result: NormalizedScore,
 │                           Passed, Outcome, PassThresholdApplied, GateFailed, BandID, Completeness,
 │                           counts, Confidence, ScoringEngineVersion. Narrative, Metadata (JSON).
 └ MJ: Rubric Evaluation Scores   one row per node: ScaleLevelID | RawValue | IsNotApplicable;
                             IsComputed (group rollups); NormalizedScore, EffectiveWeight,
                             OverallContribution, GateFailed, Completeness, Confidence,
                             Rationale, Evidence (JSON)

MJ: AI Agent Rubrics         AgentID, RubricID, Purpose Evaluation|SelfCheck|ProductionSampling,
                             IsDefault, Status, PassThreshold, SampleRate, MaxSelfCheckAttempts,
                             EvaluatorConfig (JSON), Sequence
Test.RubricID, TestSuite.RubricID, TestSuiteRun.Score   (testing framework)
```

**Design notes**

- **Rows, not a document.** Results point at real criterion rows, so "which criterion fails most"
  is plain SQL and per-criterion consensus is a join. The cost — cloning criteria into each new
  version — is paid once per publish.
- **`Key` is identity across versions.** Results are compared and aggregated by `Key`. Renaming a
  key is a removal plus an addition, i.e. a major bump.
- **Weights are relative among siblings.** A node's share of the total is the product of normalized
  weights down its path. There is no requirement that weights sum to anything.
- **Scales are shared, then frozen.** A scale used by any published version cannot change its
  type, range, direction or levels (descriptions may still be edited). To change a scale, create a
  new one. This keeps a version's `ScoringHash` meaningful without copying scales per version.
- **Subject and context are generic record references** (`EntityID` + `RecordID` string, the same
  pattern MJ uses for record-level links), so any entity can be evaluated.
- **Real FKs for evaluator provenance** (`AIPromptRunID`, `AIAgentRunID`, `EvaluatorUserID`) so an
  AI judgment traces to its exact model call, cost and raw output.

### 4.1 JSONType columns (authored by the implementing agent, task R1)

Add interfaces under `metadata/entities/JSONType-interfaces/` with bridge records, following the
`IAIConfiguration.ts` pattern (see `migrations/CLAUDE.md` for the four-step
`migrate → codegen --skipfiles → sync push → codegen --skipdb` order these need):

| Column | Interface | Shape (sketch) |
|---|---|---|
| `RubricCriterion.EvaluatorConfig` | `IRubricCriterionEvaluatorConfig` | `{ Deterministic?: IRubricDeterministicRule; AI?: { Hints?: string; RequireQuote?: boolean }; Extensions?: Record<string, JsonObject> }` — `Extensions` is keyed by consuming app (e.g. `"Caliber"`) so apps can attach per-criterion settings without core knowing their vocabulary; because it lives in `EvaluatorConfig`, changing it is a major bump and it versions with the criterion for free |
| `RubricEvaluationScore.Evidence` | `IRubricEvidence[]` | discriminated union on `Type`: `Quote {Text, Start?, End?, Verified?}`, `Turn {ConversationDetailID?, TurnIndex, Quote?}`, `File {FileID, Page?, Note?}`, `Url {Url, Title?}`, `Record {EntityName, RecordID, Note?}`, `Media {FileID, StartMs, EndMs}` |
| `RubricEvaluation.Metadata` | `IRubricEvaluationMetadata` | `{ Evaluator?: {Name, Settings}, Samples?: {Count, Spread}, Timings?, RequestedBy?: {EntityName, RecordID}, DroppedEvidenceCount?, Warnings?: string[] }` |
| `RubricVersion.ChangeDetails` | `IRubricVersionChangeDetails` | `{ BaseVersionID, Changes: {Path, Property, From, To, Bump}[] }` |
| `AIAgentRubric.EvaluatorConfig` | `IRubricEvaluatorSelection` | `{ EvaluatorType, EvaluatorName?, PromptID?, AgentID?, ModelID?, Samples?, Mode?: 'SinglePass'\|'PerCriterion' }` |

`IRubricDeterministicRule`: `{ Path: string /* JSON path into subject content */, Operator: 'equals'|'notEquals'|'in'|'notIn'|'contains'|'exists'|'between'|'gte'|'lte'|'matches', Values: unknown[], LevelWhenTrue: string /* level label or numeric value */, LevelWhenFalse: string, NotApplicableWhenMissing?: boolean }`.

---

## 5. Versioning

### 5.1 Lifecycle

```
          create / clone latest                 publish (server computes bump)
(none) ─────────────────────────▶ Draft ─────────────────────────────────▶ Published ◀──▶ Retired
                                    │ edit freely                               frozen        frozen
                                    └─ delete (only while Draft)
```

- **At most one Draft per rubric** (filtered unique index). A new draft is always a deep clone of the
  **latest published version** (`BasedOnVersionID`), so drafts never branch.
- Publishing is the only way numbers are assigned. `Published ↔ Retired` is the only change a frozen
  version allows. Retired versions stay valid for evaluations already pinned to them and for
  superseding those evaluations; new evaluations pin the latest `Published` version.
- A new consumer-facing evaluation **never pins a Draft**. The builder offers a *preview* evaluation
  against a draft that is scored in memory and never persisted.

### 5.2 Semantic version rule (computed by the server)

The bump describes **whether scores stay comparable**, not what happened to rows:

| Bump | Meaning | Triggered by (any one) |
|---|---|---|
| **Major** | Scores from the new version are **not comparable** with the previous version | Add or remove a non-advisory node; change a node's `Key`, `ParentID`, `NodeType`, `Weight`, `ScaleID`, `IsAdvisory`, `IsGate`, `GateMinimumScore`, `NotApplicablePolicy`, `RollupMethod` or `EvaluatorConfig`; change the version's `NotApplicablePolicy` |
| **Minor** | Scores comparable; **verdicts or interpretation** may differ | Change `PassThreshold` or `MinimumCompleteness`; add, remove or change a band's range or tone; add or remove an **advisory** criterion; change `EvidenceRequired` / `RationaleRequired` |
| **Patch** | **Wording only** | `Name`, `Description`, `Guidance`, `Instructions`, level `Descriptor`s, band `Label`/`Description`, `Sequence`, `ScoreDisplayMin/Max` |

- The first published version is `1.0.0` (`ComputedBump = 'Initial'`).
- `AppliedBump = max(ComputedBump, RequestedBump)`; an author may bump **higher**, never lower.
  `Major` → `M+1.0.0`, `Minor` → `M.m+1.0`, `Patch` → `M.m.p+1`.
- A draft identical to its base cannot be published ("no changes").
- `ChangeDetails` records every change with the bump it required, so the publish dialog can say
  *why* a change is major.
- **Caveat worth knowing:** wording is what an AI judge reads, so a patch can shift AI scores.
  "Patch" means comparable by intent; judge calibration (§10.8) is what detects drift.

### 5.3 Hashes

Both computed server-side at publish from a canonical JSON serialization (nodes sorted by `Key`,
properties sorted, decimals rendered with fixed precision, scale levels included by value):

- `ScoringHash` — only the Major-row properties plus the scales' levels. Equal `ScoringHash` ⇒
  identical scores from identical answers.
- `ContentHash` — everything, including wording.

A unit test asserts the invariant *"two versions within one major share a ScoringHash, and a Major
bump always changes it"* by generating random diffs.

### 5.4 Immutability

Two layers:

1. **Primary — entity server subclasses** (`MJCoreEntitiesServer`) refuse the change in
   `ValidateAsync` with a clear message ("Create a new draft version to change it").
2. **Backstop — database triggers**, committed in the migration: `trgRubricVersion_Immutable`,
   `trgRubricCriterion_Immutable`, `trgRubricCriterionLevel_Immutable`, `trgRubricBand_Immutable`,
   `trgRubricScale_Immutable`, `trgRubricScaleLevel_Immutable`, `trgRubricEvaluation_Immutable`,
   `trgRubricEvaluationScore_Immutable` (errors 51101–51110). They reference only columns the
   migration declares — never `__mj_UpdatedAt` — so CodeGen's timestamp trigger still works on
   frozen rows, and they compare with `EXCEPT` so `NULL → value` changes are caught.

**Delete behavior.** Draft versions and Draft evaluations must be deletable with their children.
Set `CascadeDeletes = 1` on `MJ: Rubric Versions` and `MJ: Rubric Evaluations` via
`metadata/entities` (task R1); the triggers still refuse deleting anything frozen.

---

## 6. Scoring semantics

Implemented once, as pure functions in `@memberjunction/rubrics-base` (`RubricScoring`), and used
by the server at submit, by the builder's preview, and by the inline-rubric test oracle.
`ScoringEngineVersion = '1.0'` is stamped on every evaluation; any change to these rules bumps it.

### 6.1 Leaf normalization

- **Levels scale:** `s = level.NormalizedValue` (explicit, so non-linear scales like
  *Partial = 0.4* are expressible).
- **Numeric scale:** `s = clamp((v − Min) / (Max − Min), 0, 1)`, inverted (`1 − s`) when
  `HigherIsBetter = 0`. Values outside the range or off-`Step` are validation errors, not clamps.

### 6.2 Not applicable and unanswered

Effective policy = `criterion.NotApplicablePolicy ?? version.NotApplicablePolicy`.

| Answer | Policy | Effect |
|---|---|---|
| N/A | `ExcludeAndRedistribute` (default) | Node excluded; siblings' weights renormalize. Not counted in completeness. |
| N/A | `CountAsZero` | Scored as `s = 0`; counts as applicable and scored. |
| N/A | `FailEvaluation` | Node excluded from the math; `Outcome = NotApplicableFailure`. |
| N/A | `NotAllowed` | **Submit is refused** (validation error naming the criterion). |
| No answer | — | Node excluded from the math (weights redistribute) but counts as applicable-unscored, lowering `Completeness`. |

A **group** with no included descendants has no score and is excluded from its parent the same way.

### 6.3 Rollup

For a group over its included, non-advisory children `i` with weights `wᵢ`:

- `WeightedMean` (default): `s = Σ wᵢ·sᵢ / Σ wᵢ`. If every included weight is 0, fall back to an
  equal-weight mean (publish validation warns when a group's non-advisory children are all weight 0).
- `Minimum` / `Maximum`: the weakest / strongest child.

The overall score is a `WeightedMean` over the top-level nodes. Stored per node:
`EffectiveWeight = wᵢ / Σ w(included siblings)`; `OverallContribution = sᵢ × Π EffectiveWeight`
along the path to the root — defined only when every ancestor uses `WeightedMean` (NULL below a
`Minimum`/`Maximum` group). Under all-`WeightedMean` trees, leaf contributions sum to the overall score.

**Advisory** nodes are scored and stored (`NormalizedScore`) but never enter any rollup, gate,
completeness or verdict.

### 6.4 Gates

A node with `IsGate = 1` fails its gate when its score `< GateMinimumScore`, **or when it has no
score because it was unanswered** — a knockout cannot be passed by silence. A gate leaf answered
N/A follows its N/A policy; publish validation warns if a gate's effective policy is
`ExcludeAndRedistribute` (usually a mistake). Any failed gate sets `GateFailed = 1` on the node and
the evaluation.

### 6.5 Completeness, threshold, outcome, band

- `Completeness = scored applicable non-advisory leaves / applicable non-advisory leaves`
  (NULL-safe: 1 when nothing is applicable and nothing is required).
- **Pass threshold** used = consumer override ?? `version.PassThreshold`; stored as
  `PassThresholdApplied`.
- **Outcome**, first match wins:
  1. `Incomplete` — overall score NULL, or `Completeness < MinimumCompleteness`
  2. `NotApplicableFailure`
  3. `GateFailed`
  4. `BelowThreshold` / `Passed` — when a threshold applies
  5. `Scored` — no threshold (and no failure above)
- `Passed = 1` iff `Outcome = Passed`; `NULL` iff `Outcome = Scored`, or `Outcome = Incomplete`
  with no threshold and no gates; otherwise `0`.
- **Band** = the band with `MinScore ≤ score < MaxScore` (the top band includes 1). Display only.
- `Confidence` = the `OverallContribution`-weighted mean of leaf confidences that were reported.
- Stored decimals are rounded to 6 places after computing in double precision.

---

## 7. Evaluation lifecycle

```
create (Draft) ──▶ answer / N/A / rationale / evidence ──▶ submit ──▶ Submitted ──┬─▶ Superseded
      │                                                     (server computes)     └─▶ Withdrawn
      └─▶ evaluator error ──▶ Failed (terminal, ErrorMessage kept for audit)
```

- **Creation rules** (entity server): the pinned version is `Published` (or `Retired` only when
  superseding an evaluation pinned to it); score rows reference criteria **of that version**;
  `ScaleLevelID` belongs to the criterion's scale; `RawValue` only on Numeric scales; `IsComputed`
  rows are server-written only.
- **Submit** happens in `RubricEvaluationEntityServer.Save()` when `Status` moves `Draft →
  Submitted`, so the UI, GraphQL, actions and agents all get identical behavior. Inside one
  transaction (see `guides/BASE_ENTITY_SERVER_PATTERNS.md`):
  1. validate (N/A `NotAllowed`, `RationaleRequired`, `EvidenceRequired`, scale membership);
  2. compute (§6) from the cached version tree;
  3. write leaf computed fields and insert/update `IsComputed` group rows — **while the parent is
     still Draft**, because the score trigger refuses writes once it is not;
  4. write the evaluation's computed fields, `SubmittedAt`, `ScoringEngineVersion`, then `Status`;
  5. if `SupersedesEvaluationID` is set, move that evaluation (same subject, context and rubric,
     currently `Submitted`) to `Superseded`.
- **Corrections are never edits.** A reviewer who changes their mind creates a new evaluation that
  supersedes the old one. A reviewer who recuses withdraws.

---

## 8. Engine, evaluators and packages

### 8.1 Packages

| Package | Path | Tier | Contents |
|---|---|---|---|
| `@memberjunction/rubrics-base` | `packages/Rubrics/Base` | UI-safe | `RubricEngineBase` (a `BaseEngine` caching categories, scales + levels, rubrics, **published** versions with their criteria/levels/bands, agent rubrics); `RubricScoring` (pure §6 math); `RubricVersionDiff` (pure §5.2 classifier); shared types (`RubricTree`, `RubricAnswer`, `RubricComputedResult`, `RubricConsensusStats`) |
| `@memberjunction/rubrics` | `packages/Rubrics/Engine` | server | `RubricEngine` (`BaseSingleton`, composes the base): `Evaluate()`, `StartHumanEvaluation()`, `GetConsensus()`, `GetAgreement()`, `GetDiagnostics()`, `ResolveVersion()`; `BaseRubricEvaluator` + the built-in evaluators; `BaseRubricSubjectContentProvider` + built-in providers; hashing (`ContentHash`/`ScoringHash`) |
| entity server subclasses | `packages/MJCoreEntitiesServer` | server | `RubricVersionEntityServer` (clone, validate, publish, hashes, bump), `RubricCriterionEntityServer`, `RubricEvaluationEntityServer` (creation rules, submit), `RubricEvaluationScoreEntityServer`, `RubricScaleEntityServer` (frozen-when-used) |
| `@memberjunction/ng-rubrics` | `packages/Angular/Generic/rubrics` | client | L1/L2 widgets (§12) |

`packages/Rubrics/*` must be added to the workspace globs (`package.json` `workspaces` and
`pnpm-workspace.yaml`). Declare every import (pnpm is strict). No dynamic imports.

### 8.2 The evaluator seam

```ts
export abstract class BaseRubricEvaluator {
    /** Produce answers for every leaf of the version; the engine persists and submits them. */
    public abstract Evaluate(request: RubricEvaluatorRequest): Promise<RubricEvaluatorOutput>;
}
// Registered: @RegisterClass(BaseRubricEvaluator, '<EvaluatorType>' or '<EvaluatorType>:<Name>')

export interface RubricEvaluatorRequest {
    Version: RubricTree;                   // resolved, cached, immutable
    Subject: { EntityName: string; RecordID: string };
    Context?: { EntityName: string; RecordID: string };
    Content: RubricSubjectContent;         // from a content provider or supplied by the caller
    Settings: IRubricEvaluatorSelection;   // prompt/agent/model/samples/mode
    ContextUser: UserInfo;
}
export interface RubricEvaluatorOutput {
    Answers: RubricAnswer[];               // per leaf Key: level label | value | NotApplicable,
                                           // rationale, evidence, confidence
    Narrative?: string;
    AIPromptRunID?: string; AIAgentRunID?: string;
    Metadata?: IRubricEvaluationMetadata;
}
```

`RubricEngine.Evaluate(params)` resolves the version (§10.2 for tests), the evaluator (ClassFactory)
and the content (§8.4), runs it, maps answers to score rows, saves a Draft, submits it, and returns
the computed result. An evaluator that throws produces a `Failed` evaluation with `ErrorMessage` —
never a silent skip.

### 8.3 Built-in evaluators

- **`LLMRubricEvaluator`** (`AIPrompt`) — runs the core prompt **"Rubric Evaluator"**
  (`metadata/prompts/templates/rubrics/rubric-evaluator.template.md`). The template renders the
  version's instructions, the criteria tree with guidance, every scale level with the criterion's own
  anchor text, and the subject content fenced as untrusted input. Output JSON:
  `{criteria: [{key, level?|value?, notApplicable?, rationale, evidence[], confidence}], narrative}`.
  Post-processing: unknown keys are dropped and counted in `Metadata.Warnings`; levels map by label;
  out-of-range values are errors; **quoted evidence is verified against the text content** and
  unverifiable quotes are dropped (`DroppedEvidenceCount`). Modes:
  - `SinglePass` (default) — one call for the whole rubric;
  - `PerCriterion` — one `ScoreQuestion` per leaf via `AIDecisionRunner`, giving per-level
    probabilities; `Confidence` = probability of the chosen level. Costlier, better calibrated.
  - `Samples: n` — n runs; the median level per criterion is kept and the spread recorded.
- **`AgentRubricEvaluator`** (`Agent`) — runs a configured agent (default: the core **"Rubric
  Evaluation Agent"**, a Loop agent that can use read-only tools such as querying data or fetching a
  document) and expects the same output payload. For subjects that need investigation, not just
  reading.
- **`DeterministicRubricEvaluator`** (`Deterministic`) — applies each leaf's
  `EvaluatorConfig.Deterministic` rule to the subject content's JSON. A leaf without a rule is left
  unanswered. No model call.
- **Human** — no evaluator class. `StartHumanEvaluation()` creates the Draft; the scoring-form widget
  saves answers; the user submits.

### 8.4 Subject content providers

`BaseRubricSubjectContentProvider.GetContent(subject, contextUser): Promise<RubricSubjectContent>`
returns `{ Text?: string; Data?: Record<string, unknown>; Files?: {FileID, Name}[] }`. Registered by
entity name. Built-ins:

| Entity | Content |
|---|---|
| `MJ: Test Runs` | the test's input, expected outcomes and actual output; for agent tests a compact trace summary; outputs as files |
| `MJ: AI Agent Runs` | the conversation turns and final payload |
| `MJ: AI Prompt Runs` | rendered messages and result |
| `MJ: Conversations` | the transcript |
| *(fallback)* | the record's fields via `GetAll()`, **respecting field-level permissions for the context user** |

Callers may pass `Content` directly to skip the provider.

### 8.5 Consensus, agreement and diagnostics (engine)

- `GetConsensus(subject, context?, rubricID, major, method)` — methods `Mean` (matches the view),
  `Median`, `TrimmedMean(p)`; returns overall and per-criterion statistics plus a disagreement
  measure (population std-dev and range).
- `GetAgreement(rubricID, major, filter)` — for subjects that have both human and AI evaluations:
  per criterion, exact-level agreement, mean absolute error, bias (mean signed difference) and
  **quadratic-weighted Cohen's kappa**; across more than two human raters, **Krippendorff's alpha**
  (ordinal). Reported only when the sample is at least 20 subjects (configurable), with the sample
  size attached — never a bare statistic.
- `GetDiagnostics(rubricID, major)` — item analysis to improve a rubric: per criterion N/A rate,
  unanswered rate, level usage, std-dev, criterion-to-total correlation, pairwise criterion
  correlation. Flags `NoDiscrimination`, `RangeCollapse`, `HighCorrelation`, `MostlyNotApplicable`,
  `InsufficientData`. Used by the Rubric Architect (§11.5) and the builder.

### 8.6 Actions (boundaries for agents, workflows and low-code)

Thin wrappers over `RubricEngine` (never an action calling an action):

- **Evaluate Record Against Rubric** — rubric (name or ID), subject entity + record, optional
  context, evaluator selection, threshold → evaluation ID, score, outcome, per-criterion summary.
- **Get Rubric Consensus** — subject (+ context), rubric, method → statistics.
- **Get Rubric** — rubric name/ID (+ version) → the tree, for agents that need to read criteria.
- **Create Rubric Draft** — a rubric tree payload → a Draft version (never publishes).

Publishing stays a human action in the UI or CLI.

---

## 9. Layered base views: the migration sequence

`MJ: Rubric Evaluations` and `MJ: Rubric Evaluation Scores` are **layered**: CodeGen generates the
inner views `vwRubricEvaluationsGenerated` / `vwRubricEvaluationScoresGenerated`, and MJ owns the
public base views `vwRubricEvaluations` / `vwRubricEvaluationScores`, which do `SELECT g.*` plus the
consensus columns. (Mechanism: `packages/CodeGenLib/CLAUDE.md` § "Base views: generated, custom,
or LAYERED".)

### 9.1 Three files, flags in metadata

Entity and EntityField values are declarative JSON under `metadata/entities/`, applied with
`mj sync push`. A feature migration does not `UPDATE` or `INSERT` those rows. The release
build turns the folder into one metadata migration. A migration that updates them drifts
from the folder, gets checksum-locked, and skips the sync engine.

`metadata/entities/.layered-base-views.json` is the source for `BaseViewGenerated` and
`GeneratedBaseViewName` on `MJ: Rubric Evaluations` and `MJ: Rubric Evaluation Scores`.
`metadata/entities/.rubric-label-name-fields.json` pins `Label` as the name field on
`MJ: Rubric Scale Levels` and `MJ: Rubric Bands` (`IsNameField: true`,
`AutoUpdateIsNameField: false`). CodeGen only auto-flags a column literally named `Name`,
and the inner score view joins the chosen level only when that flag is set before the
view is generated.

| File | Hand-written section | CodeGen section (appended) | Why it is its own file |
|---|---|---|---|
| `V202609302204__v6.2.x__Rubrics.sql` | tables, constraints, triggers, descriptions | entity registration (public views, procs, fields) | — |
| `V202609302205__v6.2.x__Rubrics_Layered_Base_View_Flags.sql` | none — no Entity or EntityField DML | the two **inner** views | The inner views cannot be created until 2204's capture has registered the entities, and they cannot live below that capture because it is replaced wholesale. |
| `V202609302206__v6.2.x__Rubrics_Consensus_Views.sql` | `CREATE OR ALTER VIEW` for the two public wrappers | virtual EntityFields for the wrapper columns, and CRUD that returns them | A view cannot be created before the view it selects from, and hand-written SQL cannot live below a CodeGen section that is replaced wholesale. |

`BaseViewGenerated` is set to false in the same metadata record as `GeneratedBaseViewName`.
New entities are created with `BaseViewGenerated = 1`, and the column check rejects an inner
name while CodeGen still owns the public view.

### 9.2 Procedure (task R0) — on a private database at the last released version

The three files in §9.1 are the capture targets. Inner views go in **2205**, not in 2204.
2204's CodeGen section is entity registration only.

```bash
# Private DB only: one database per agent (migrations/CLAUDE.md).
# Park 2205 and 2206 until the entities exist and the inner views exist, respectively.
mj migrate                                   # 2204 hand DDL only.
mj codegen --skipfiles --no-ai               # PASS 1 — entity rows, public views, procs.
#   → append to 2204, below 50 blank lines and the banner.
mj sync push --dir=metadata --include=entities
# PASS 2 — flipping the flags is not an entity modification, so a plain run CREATEs the
# inner views in the database but OMITS them from the SQL log. Temporarily, in mj.config.cjs:
#   forceRegeneration: { enabled: true, baseViews: true,
#     entityWhereClause: "Name IN ('MJ: Rubric Evaluations','MJ: Rubric Evaluation Scores')" }
mj codegen --skipfiles --no-ai
#   → confirm vwRubricEvaluationsGenerated and vwRubricEvaluationScoresGenerated are both
#     in this capture, and the score view LEFT OUTER JOINs RubricScaleLevel. Append to 2205.
#     Revert mj.config.cjs.
# Apply 2206's hand wrapper views.
mj codegen --skipfiles --no-ai               # PASS 3 — virtual fields on the wrappers
#   → append to 2206. The capture must not DROP or CREATE the public views.
mj codegen --skipdb --no-ai                  # entity classes, resolvers, forms
# revert sync write-back (lastModified/checksum) before committing
```

Checks before committing:
- `node .github/scripts/check-migration-entityfield-sequence.mjs` — no literal `Sequence` values.
- `npm run check:codegen-tail` — every new table has its generated entity.
- In pass 3's capture, confirm **no DDL targets `vwRubricEvaluations` / `vwRubricEvaluationScores`**
  (CodeGen must only refresh/grant them, guarded by existence) — the pilot's banner explains why.
- **From zero:** build a clean database, run all three migrations, then
  `mj sync push --dir=metadata --include=entities`, then `mj codegen --skipfiles`.
  `vwRubricEvaluations` must still select `CohortMeanScore`. Do not put the layering flags
  back into a migration to make a no-sync CodeGen pass. That was the wrong gate: those
  columns are metadata, and the release build is what emits their migration.

### 9.3 What the wrapper columns are

`vwRubricEvaluations` adds `RubricID`, `Rubric`, `RubricMajorVersion`, `RubricVersionLabel`, and the
cohort statistics `CohortEvaluationCount`, `CohortScoredCount`, `CohortPassedCount`,
`CohortMeanScore`, `CohortMinScore`, `CohortMaxScore`, `CohortScoreStdDev`, `CohortHumanCount`,
`CohortHumanMeanScore`, `CohortAICount`, `CohortAIMeanScore`, `SelfAssessmentScore`, `SelfAssessmentCount`,
`DeviationFromCohortMean`.

`SelfAssessmentScore` is the maximum `NormalizedScore` among Submitted `Self` rows in the cohort.
A second submitted self-assessment is not rejected: supersede already has a `Superseded` status,
and a unique constraint would have to reach through `RubricVersion.MajorVersion`. `SelfAssessmentCount`
sits beside the max so a collapsed second score is visible. The count is the number of Submitted
`Self` rows in that same cohort, including ones whose score is still null.

`vwRubricEvaluationScores` adds `CriterionKey`, `CriterionNodeType`, `CriterionParentID`,
`EvaluationStatus`, `EvaluatorType`, `EvaluatorUserID`, subject/context columns, `RubricID`,
`RubricMajorVersion`, and per-criterion `CriterionCohortCount`, `CriterionCohortMeanScore`,
`CriterionCohortMinScore`, `CriterionCohortMaxScore`, `CriterionCohortScoreStdDev`,
`CriterionCohortHumanMeanScore`, `CriterionCohortAIMeanScore`.

They use a correlated `OUTER APPLY` rather than window functions so that loading one record seeks
`IX_RubricEvaluation_Cohort` instead of computing every partition. Median, trimmed mean and agreement
statistics are engine-side (§8.5); PG conversion of `OUTER APPLY`/`STDEV` is the converter's job.

---

## 10. Testing framework integration

### 10.1 Turn Agent Eval oracles back on
Remove `skipOracles = true` in `AgentEvalDriver.runOraclesForMultiTurn`; honor `evaluationStrategy`
(`final-turn-only` | `each-turn` | `all-turns-aggregate`). A completed run with zero oracles and no
resolved rubric stays Failed with a clear message (current `determineStatus` behavior), not
"Passed with score 0". Update the driver's tests.

### 10.2 Rubric resolution for a test run
First match wins:
1. Run option `--rubric <name|id>[@<major.minor.patch>]` (CLI) / `RunTest` option `RubricID` — an
   experiment override for a whole run.
2. The `rubric` oracle's own config (`rubricId` / `rubricVersionId`).
3. `Test.RubricID`.
4. `TestSuite.RubricID` of the suite being run, walking up `ParentID`.
5. For Agent Eval tests: the target agent's default `Evaluation` rubric (`MJ: AI Agent Rubrics`).
6. None.

The version pinned is the latest `Published` one **at suite-run start** (cached per suite run, so a
publish mid-run cannot split a suite across versions), unless a version is named explicitly.

### 10.3 The `rubric` oracle
`packages/TestingFramework/Engine/src/oracles/RubricOracle.ts`, type `rubric`, registered with the
built-ins. Config: `{ rubricId?, rubricVersionId?, evaluator?: IRubricEvaluatorSelection,
passThreshold?, samples? }`. It calls `RubricEngine.Evaluate` with **subject = `MJ: Test Runs` /
the run ID** and **context = `MJ: Tests` / the test ID** (the TestRun row exists before oracles run),
and returns:

```ts
{ oracleType: 'rubric',
  passed: evaluation.Passed ?? !evaluation.GateFailed,
  score: evaluation.NormalizedScore ?? 0,
  message: '<rubric> v<label>: <Outcome> (<score shown on display scale>)',
  details: { RubricEvaluationID, RubricVersionLabel, Outcome, Criteria: [{Key, Name, NormalizedScore, GateFailed, Rationale}] } }
```

**Implicit rubric.** When §10.2 resolves a rubric and the test configures no `rubric` oracle, the
driver adds one. It always gates status; it contributes to the score when `scoringWeights` is absent
or names `rubric`. Document this in the Engine README.

### 10.4 Inline criteria and `llm-judge`
`judgeValidationCriteria: string[]` keeps working as an **inline rubric**: every string is a binary
leaf (`Met` = 1 / `Not met` = 0) with equal weight, scored by the same `RubricScoring` library and
the same "Rubric Evaluator" prompt. Inline rubrics have no version row, so their results are **not**
persisted as `RubricEvaluation`s; they stay typed in `OracleResult.details`.
- `LLMJudgeOracle` is rebuilt on this path. The hardcoded thresholds go: `config.passThreshold`
  (default 0.7, preserving today's behavior), and `strictMode` makes every inline criterion a gate at
  1.0. `config.model` is honored. The nonexistent "Test LLM Judge" prompt lookup is removed.
- Computer Use's `CriterionVerdict {criterion, met, evidence}` maps onto the same inline shape; its
  engine keeps its own judge loop (it needs verdicts mid-run), but its test driver reports through
  the inline rubric so results look the same everywhere.
- `mj test promote-criteria <test>` converts a test's inline criteria into a Rubric (Draft) and sets
  `Test.RubricID`, so teams can graduate to weighted, versioned rubrics without retyping.

### 10.5 Suite score
`TestEngine.updateSuiteRun` persists `TestSuiteRun.Score` = mean `Score` of executed (non-Skipped)
test runs — the value `RunSuite` already computes as `averageScore`.

### 10.6 Human per-criterion review
When a run was judged with a rubric, the test run feedback dialog gains **"Score against rubric"**,
using `mj-rubric-scoring-form` to create a `Human` evaluation with the same subject and context.
`MJ: Test Run Feedbacks` is unchanged and still records the overall rating and correctness override.
Because both evaluations share a cohort, `CohortHumanMeanScore` vs `CohortAIMeanScore` and the
per-criterion columns show human–AI disagreement with no extra work.

### 10.7 Testing UI
- Run detail: per-criterion breakdown (`mj-rubric-result`) with rationale and evidence.
- **Review tab:** a queue ordered by human–AI disagreement (largest |human mean − AI mean| first,
  per criterion) — where judge prompts most need work.
- Analytics: rubric score trend per test/suite; per-criterion failure rates across runs.
- Test and suite forms: a rubric picker for `RubricID`.

### 10.8 Judge calibration (new test type)
Add Test Type **"Rubric Judge Calibration"** (`metadata/test-types/`) with driver
`RubricCalibrationTestDriver` in `@memberjunction/testing-engine`:
- `InputDefinition`: `{ rubricId, goldSet: { subjectEntity, filter? } | { subjects: [{entity, recordID}] }, evaluator: IRubricEvaluatorSelection }`.
- For each gold subject that has a Submitted **Human** evaluation (same rubric and major), run the AI
  evaluator (context = the calibration Test) and compute §8.5 agreement statistics.
- `ExpectedOutcomes`: `{ minWeightedKappa?, maxMeanAbsoluteError?, minExactAgreement?, perCriterion?: {...} }`.
- One `OracleResult` per criterion plus one overall. Score = overall weighted kappa clamped to 0..1.

This closes the loop: rubrics judge tests, and tests check the judges. A changed judge prompt, a
new model, or a patch-level wording change can be proven not to have moved scores.

### 10.9 Repeats and flakiness
With `RepeatCount > 1`, each repeat's rubric evaluation is recorded; `--flaky-check` reports
per-criterion score spread in addition to the overall variance it already reports.

### 10.10 CLI
- `mj test run|suite … --rubric <name|id>[@version]` (§10.2 override).
- `mj test report` shows the per-criterion breakdown.
- New `mj rubric` topic (thin shims in `packages/MJCLI`, logic in `@memberjunction/rubrics`):
  `list`, `show <rubric>[@version]`, `diff <rubric> <v1> <v2>` (prints the §5.2 classification),
  `validate <file>` (tree rules, weights, gates, scales), `evaluate --rubric --entity --record
  [--evaluator]`.

### 10.11 Deprecate `TestRubric`
Deprecation is metadata, not DDL: `metadata/entities/.test-rubrics-deprecation.json` (committed with this plan) sets
the entity's `Status` to `Deprecated` and replaces its `Description`; it reaches hosts through the
release's consolidated metadata sync. Mark `TestEngineBase`'s rubric getter and loader `@deprecated`,
remove the form from the Testing app nav, and file the removal for the next major version. Fix the
READMEs that claim `LLMJudgeOracle` uses rubrics.

---

## 11. Agent integration

### 11.1 Agents publish rubrics
`MJ: AI Agent Rubrics` links an agent to rubrics by purpose. Agent metadata can declare them under
`relatedEntities` with `@lookup` to rubrics authored under `metadata/rubrics/` (§11.6). The agent
form in Explorer gets a **Rubrics** tab.

### 11.2 Evaluation
The agent's default `Evaluation` rubric is step 5 of §10.2, so every Agent Eval test of that agent is
judged by it unless the test says otherwise.

### 11.3 Self-check
When an agent has an Active `SelfCheck` rubric, `BaseAgent` evaluates the **candidate final output**
before returning it — at the same point the `finishIf` gate runs (`base-agent.ts`):
- subject = `MJ: AI Agent Runs` / the current run; evaluator per `EvaluatorConfig` (default
  `LLMRubricEvaluator`); threshold = link override ?? version default;
- recorded as an agent run step of the existing `StepType = 'Validation'`, linked to the evaluation;
- **Loop agents:** on failure, if attempts < `MaxSelfCheckAttempts` (default 1), the failed criteria
  and their rationales are fed back as the next turn's input and the loop continues; otherwise it
  returns with the failure recorded (never silently).
- **Flow agents:** evaluated and recorded at the end; no retry.
- Opt-in only; cost and latency are the agent owner's choice.

### 11.4 Production sampling
A scheduled job **"Evaluate Sampled Agent Runs"** (MJ scheduled jobs, no new queue):
- for each Active `ProductionSampling` link, select recently completed runs of that agent with no
  evaluation for that rubric;
- keep a run when `hash(runID) mod 10 000 < SampleRate × 10 000` (deterministic, reproducible);
- evaluate asynchronously — never on the agent's response path.

A **drift view** in the AI dashboards: a rolling mean per agent, rubric and criterion against the
previous period; a drop beyond a configured threshold raises a notification. Build the view in this
plan; the alerting can follow.

### 11.5 Core rubric agents and prompts (metadata)
- Prompt **"Rubric Evaluator"** — §8.3.
- Agent **"Rubric Evaluation Agent"** (Loop) — read-only tools for evaluations that need
  investigation; the `AgentRubricEvaluator` default.
- Agent **"Rubric Architect"** (Loop) — helps people author rubrics; **produces Drafts, never
  publishes**:
  - draft a rubric from a description, a policy or sample documents;
  - **import** a requirements matrix from a spreadsheet (CSV/XLSX; nesting from numbered paths like
    `3.2.1` or indentation; weights and knockout flags from columns);
  - **critique** a rubric: vague or overlapping criteria, missing anchors, weight sanity, gates with
    risky N/A policies;
  - **improve from data** using `GetDiagnostics` and `GetAgreement` — which criteria don't
    discriminate, which ones humans and AI disagree on.

### 11.6 Rubrics as metadata
Core ships example rubrics and scales under `metadata/rubrics/` and `metadata/rubric-scales/`
(declarative JSON with `uuidgen` primary keys, no `sync` blocks — `metadata/CLAUDE.md` rule 1b).
Because published versions are frozen, **a change to a shipped rubric is a new version object in the
JSON, never an edit to an existing one** — an edit would be refused by the triggers on push, which is
the intended behavior. Shipped scales: `Binary (Met / Not met)`, `Likert 1-5`, `Compliance
(Compliant / Partial / Non-compliant)`, `Percentage 0-100`.

---

## 12. UI

Follow `guides/UI_LAYERING_GUIDE.md`. Nothing below L3 imports the router or an Explorer package.

| Component (`@memberjunction/ng-rubrics`) | Layer | Purpose |
|---|---|---|
| `mj-rubric-builder` | L2 | tree editor for a Draft: add/move nodes, weights with live share %, scale picker, per-level anchors, gates, N/A policy, bands; validation panel; **preview** a score from sample answers |
| `mj-rubric-publish-dialog` | L2 | shows the computed bump and each change's reason (`ChangeDetails`), optional higher bump, change summary |
| `mj-rubric-version-diff` | L2 | side-by-side diff of two versions |
| `mj-rubric-scoring-form` | L2 | fill in an evaluation: keyboard-first (built for reviewers doing hundreds), N/A, rationale, evidence, required-field enforcement, draft autosave, submit |
| `mj-rubric-result` | L1/L2 | score on the display scale, band, gates, completeness, per-criterion bars with rationale/evidence |
| `mj-rubric-comparison-matrix` | L2 | evaluators × criteria for a cohort; disagreement highlighting; human vs AI; self-assessment column |

Explorer (L3): custom entity forms for `MJ: Rubrics` (versions list + builder + publish),
`MJ: Rubric Evaluations` (result view + cohort comparison), `MJ: Rubric Scales`; a **Rubrics** nav
item in the AI application. Design tokens only; `<mj-loading>`; confirm left, cancel right;
`NotifyLoadComplete()` in resource components.

---

## 13. Documentation

- **`guides/RUBRICS_GUIDE.md`** (index it in `guides/README.md`): concepts, the scoring rules (§6)
  as a readable spec, versioning (§5), evaluators, consensus, blinding (§13.1), and **worked
  examples**, each with a full rubric and a sample of evaluations:
  1. **Agent evaluation** — a research agent judged on accuracy, sourcing and completeness; an AI
     judge plus a human reviewer; the calibration test.
  2. **Peer review with multiple reviewers** — a generic submissions/peer-review app: three reviewers
     per submission, blinded until submission, consensus by mean, the comparison matrix in a
     committee meeting, a reviewer withdrawing for a conflict.
  3. **Awards judging** — a judging panel, ranking within a category by cohort mean, a knockout
     eligibility criterion.
  4. **Procurement requirements** — a nested matrix with knockout (gate) requirements, a Compliance
     scale, `Self` vendor assertions followed by evaluator scoring, `NotAllowed` N/A on mandatory items.
  5. **Accreditation** — standards → criteria with `EvidenceRequired` file evidence; a self-study
     (`Self`) and a visiting-team evaluation of the same subject.
  6. **Hiring interviews** — a structured interview rubric with anchored 1–5 levels, human
     interviewers and an AI transcript evaluation side by side.
- Package READMEs for `rubrics-base`, `rubrics`, `ng-rubrics`; the TestingFramework and Engine
  READMEs (rubric oracle, resolution order, inline criteria, calibration test type).

### 13.1 Blinding and permissions
Consensus columns would leak peer scores to a reviewer whose own evaluation is still a Draft. Core
provides:
- `RubricEngine.GetVisibleEvaluations(subject, context, user, blinding)` with
  `blinding: 'None' | 'UntilSubmitted' | 'Always'`, which also blanks cohort columns on rows the user
  may not see aggregated;
- guidance for consumers to add **row-level security** on `MJ: Rubric Evaluations` and **field-level
  permissions** (`MJ: Entity Field Permissions`) on the cohort columns for reviewer roles.
Core's default entity permissions: read for authenticated users on definitions; evaluations readable
by their evaluator and by roles the consumer grants.

---

## 14. Consumers outside core (passing mention only)

- **Caliber** moves its rubric, version, criterion, section and scoring onto core rubrics; its own
  assessment record keeps session, integrity and disposition and references a core evaluation. Its
  score-scale inconsistency and model-chosen disposition are refactored around the §6 rules. Plan-only
  PR: [MemberJunction/bizapps-caliber#513](https://github.com/MemberJunction/bizapps-caliber/pull/513).
- **ATS** follows through Caliber; its assessment rollup reads the core evaluation instead of
  re-declaring the per-criterion score type. Plan-only PR:
  [MemberJunction/bizapps-ats#102](https://github.com/MemberJunction/bizapps-ats/pull/102).
- A future **generic submissions / peer-review application** uses evaluations with a review round as
  the context, the blinding API, and the comparison matrix.

---

## 15. Task list (work in order)

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (say why in §16).

**R — core**
- [ ] **R0** Run the §9.2 procedure: CodeGen captures appended to 2204 and 2206, generated
      entities committed, from-zero build green. Add `packages/Rubrics/*` to workspace globs.
      Layered flags stay in `metadata/entities/.layered-base-views.json` — no Entity UPDATE migration.
- [ ] **R1** Metadata: JSONType interfaces + bridge records (§4.1); layered flags + `CascadeDeletes`
      in `metadata/entities`; `IsHierarchy` config on `RubricCriterion.ParentID` and
      `RubricCategory.ParentID` (see `guides/RECURSIVE_FOREIGN_KEYS_AND_HIERARCHIES_GUIDE.md`);
      shipped scales (§11.6).
- [~] **R2** `@memberjunction/rubrics-base`: `RubricScoring` (§6) and `RubricVersionDiff` (§5.2) as
      pure functions with exhaustive unit tests — every N/A policy, rollup, gate edge case, the
      all-zero-weight fallback, completeness, outcome precedence, rounding; property tests for the
      ScoringHash/major invariant. Then `RubricEngineBase`.
- [~] **R3** Entity server subclasses: version clone/validate/publish (tree rules, bump, hashes);
      scale freeze; evaluation creation rules and submit (§7); score validation. Unit tests with mocks.
- [ ] **R4** `@memberjunction/rubrics`: `RubricEngine`, evaluator seam, content providers,
      deterministic evaluator, consensus/agreement/diagnostics statistics (unit-tested against
      hand-computed fixtures, including kappa and alpha).
- [ ] **R5** "Rubric Evaluator" prompt + `LLMRubricEvaluator` (SinglePass, PerCriterion via
      `AIDecisionRunner`, samples, evidence verification).
- [ ] **R6** Actions (§8.6).
- [ ] **R7** Integration bundle **"Rubrics"** (deterministic tier, client-first): publish +
      classification, immutability triggers (raw SQL attempts must fail with 511xx), submit math
      round-trip, supersede/withdraw, consensus view columns vs engine `Mean`, cascade delete of drafts.

**T — testing framework**
- [ ] **T1** Re-enable Agent Eval oracles (§10.1).
- [ ] **T2** Rubric resolution + suite-run version pinning (§10.2).
- [ ] **T3** `RubricOracle` + implicit rubric (§10.3).
- [ ] **T4** Inline rubric path; rebuild `LLMJudgeOracle`; Computer Use driver reporting;
      `mj test promote-criteria` (§10.4).
- [ ] **T5** Persist `TestSuiteRun.Score` (§10.5).
- [ ] **T6** Human per-criterion review in the feedback dialog (§10.6).
- [ ] **T7** Testing UI: run detail, Review disagreement queue, analytics, rubric pickers (§10.7).
- [ ] **T8** Judge calibration test type + driver (§10.8).
- [ ] **T9** Repeats/flaky per-criterion spread (§10.9); CLI (§10.10).
- [ ] **T10** `TestRubric` deprecation and README corrections (§10.11).

**A — agents**
- [ ] **A1** Agent rubric links: metadata support, agent form Rubrics tab (§11.1).
- [ ] **A2** Default Evaluation rubric in resolution (§11.2) — lands with T2.
- [ ] **A3** Self-check in `BaseAgent` (§11.3) with tests for pass, retry-then-pass,
      exhausted-attempts and Flow-agent paths.
- [ ] **A4** Production sampling job + drift view (§11.4).
- [ ] **A5** Rubric Evaluation Agent, `AgentRubricEvaluator` (§8.3).
- [ ] **A6** Rubric Architect agent: draft, import, critique, improve-from-data (§11.5).

**U — UI and docs**
- [ ] **U1** `@memberjunction/ng-rubrics` widgets (§12).
- [ ] **U2** Explorer forms and nav (§12).
- [ ] **U3** `guides/RUBRICS_GUIDE.md` with the six worked examples; READMEs (§13).
- [ ] **U4** Example rubrics under `metadata/rubrics/` matching the guide's examples.

**Definition of done** (repo `CLAUDE.md`): every touched package builds and its unit tests pass;
`pnpm run test:integration` passes with the new bundle; `npm run check:codegen-tail`,
`check-migration-entityfield-sequence`, `check:ui` and `check:changeset` pass; a from-zero
`bootstrap-clean-db` build succeeds. Report pass/fail/skip counts.

---

## 16. Progress log

- **2026-10-01** — R3 started. Version publish validates the tree, refuses an identical
  draft, and writes the bump plus ContentHash and ScoringHash. Clone keeps keys and
  rewrites parent ids. Submit calls `RubricScoring.compute` and returns that result.
  A scale used by a published version refuses structural edits. Tests are mocks, not a
  live database. Save does not yet wrap the submit transaction.
- **2026-10-01** — `RubricEngineBase` caches categories, scales with levels, rubrics, agent
  rubric links, and published versions with their criteria, anchors, bands, and scales.
  Drafts are not cached. The class holds no database; the server engine will load rows
  and call `replaceCache`.
- **2026-10-01** — An advisory node's parent and type use the same non-major bump as its
  weight. Reparenting an advisory node does not change ScoringHash.
- **2026-10-01** — Scoring review. A scale value change is Major. Bands match by label.
  Advisory-to-advisory scoring edits are Minor. FailEvaluation of the only leaf is
  NotApplicableFailure. Anchors in the content projection match by normalized value,
  not by level id.
- **2026-10-01** — R2 started. `@memberjunction/rubrics-base` has `RubricScoring` and
  `RubricVersionDiff` with unit tests for every N/A policy, both rollups, the zero-weight
  fallback, gates, completeness, outcome order, six-place rounding, bump classification,
  and the ScoringHash invariant. `RubricEngineBase` is not in this commit.
- **2026-10-01** — Correction: the three hand-written `UPDATE`s in `V202609302205` are removed.
  Layering flags stay only in `.layered-base-views.json`. Label name-field pins are
  `.rubric-label-name-fields.json` (Entity Field lookups, no sync block, no hand-written UUID).
  The CodeGen section of 2205 — the inner views — stays. A no-sync CodeGen run is not the gate
  for these columns.
- **2026-10-01** — Review of `552e976a`. Draft delete is `INSTEAD OF DELETE`: a second
  cascade on `FK_RubricCriterion_Parent` is illegal (multiple cascade paths), so the trigger
  clears anchors, then parent links, then criteria, then bands. `GeneratePluralName` pluralizes
  the last PascalCase segment, so the base view is `vwRubricCriteria`. IT96 is sequence 50,
  before the client-transport block. On `MJ_6_2_CLEAN_pr4937_proof2` (105 migrations, then
  `mj codegen --skipfiles` with no sync) `BaseView` is `vwRubricCriteria`, `vwRubricCriterions`
  does not exist, and `vwRubricEvaluations` still selects `CohortMeanScore`. IT96 with
  `RUN_MUTATION_TESTS=1`: 5 passed, 0 failed, 0 skipped.
- **2026-09-30** — Review of `9c8a8611`. Restored `V202609302205`: migrate does not sync metadata,
  so the layering flags have to be in the migration or the next CodeGen replaces the wrappers.
  The metadata file stays. `GeneratePluralName` pluralizes the last word (`Rubric Criterion` →
  `Rubric Criteria`). `TestSuiteRun.Score` is `DECIMAL(9,6)`. `Label` is pinned as the name field
  on scale levels and bands before the inner-view capture. `SelfAssessmentCount` is beside the
  max. Immutability triggers are the `rubrics` integration bundle (IT96). Proof:
  `MJ_6_2_CLEAN_pr4937_proof` applied 105 migrations, then `mj codegen --skipfiles --no-ai`
  with no metadata sync. `vwRubricEvaluations` still selects `CohortMeanScore` and
  `SelfAssessmentCount` from `vwRubricEvaluationsGenerated`. The entity is
  `MJ: Rubric Criteria`. `TestSuiteRun.Score` is `decimal(9,6)`. Updating `PassThreshold`
  on a published version threw 51102.
- **2026-09-30** — CodeGen tail captured. Pass 1 registers the entities. Pass 2, after
  `mj sync push` of `.layered-base-views.json`, appends the inner views to `V202609302204`.
  Pass 3 appends the wrapper virtual fields to `V202609302206`. Generated entity classes,
  GraphQL schema, and forms are committed. A fresh database (`MJ_6_2_CLEAN_pr4937_verify`)
  applied both migrations, 104 scripts, with no error. `check:codegen-tail` and
  `check-migration-entityfield-sequence` passed. R0 is not done: `packages/Rubrics/*` is
  not in the workspace globs, and the package build is not started.
- **2026-09-30** — Removed `V202609302205` (the `UPDATE Entity` that set layered-base-view flags).
  Those flags now live only in `metadata/entities/.layered-base-views.json`, applied with
  `mj sync push`. `V202609302206` stays: the consensus wrappers are schema DDL, and they have
  to run after 2204's CodeGen section creates the inner views.
- **2026-09-30** — `TestRubric` deprecation moved out of the migration into
  `metadata/entities/.test-rubrics-deprecation.json` (entity `Status = Deprecated` + description).
- **2026-09-30** — Design agreed. Hand-written DDL committed (tables, constraints, immutability
  triggers, descriptions, wrapper views). CodeGen captures, code, and UI not started. The
  `Check migrations` job reports the missing codegen tail until R0 is done.

---

## 17. Open questions

1. **Nav home for Rubrics.** Proposed: the AI application. Alternative: its own application, if
   non-AI consumers (reviews, procurement) become the main users.
2. **Cross-major consensus.** Cohorts stop at the major-version boundary by design. If a consumer
   needs to compare across majors, the answer is per-criterion comparison by `Key` with a clear
   "not comparable overall" label — to be designed when a consumer asks.
3. **Evidence storage for large media.** Evidence references files and media spans; nothing is
   copied. Revisit if a consumer needs immutable evidence snapshots.
