# ✅ RESOLVED — score-time train/serve skew on virtual (denormalized) features

**Found:** 2026-06-30, via the in-browser E2E "Run now" on the Production tab (Operate flow).
**Fixed:** 2026-06-30 (same day, after review + sign-off on the approach).
**Severity:** High (predictions were silently wrong) — and **latent** (no existing test asserted prediction
*variation*), **pre-existing** (lived in the FeatureAssembly score path, NOT in the phase-2 Operate work).

## ✅ Resolution (what shipped)

Both fixes landed in `FeatureAssemblyExecutor.assemble()` ([feature-assembly-executor.ts](../packages/AI/PredictiveStudio/Engine/src/feature-assembly/feature-assembly-executor.ts)) — the single code path, so train / materialize / on-demand all benefit:

1. **Symmetric re-read (`hydrateMissingFeatureColumns`)** — after building the column plan, any required raw
   feature column **absent** from the resolved rows is re-read from the **same entity view the training path
   reads** (`dataAccess.fetchRows`, keyed by primary key), then merged in. Columns already present are left
   untouched, so a complete record set (training, a full `entity_object` load, unit fixtures) pays **no** second
   read and **no** blob tax — only the on-demand narrow-projection case re-reads, and only the dropped columns.
   Train and score can no longer diverge on what they feed the model.
2. **Hard-fail guardrail (`assertRequiredColumnsPresent`)** — if a required feature column is **still** absent
   after hydration, assembly **throws** with a precise message. `MLModelInferenceProcessor`'s existing per-record
   `try/catch` turns that into a `Failed` run detail that bubbles to the run history + the Production-tab UI.
   No more silent "Succeeded" with garbage. This also guards **training** — a pipeline declaring a column the
   view doesn't expose now fails loudly up front instead of producing a no-signal model.

**Proof:**
- Unit (`src/__tests__/feature-assembly.test.ts`, +3): hydrate-fills-virtual-column, guardrail-throws-on-absent,
  and a **train/serve parity** test (same rows inline-vs-hydrated → byte-identical matrix). Full engine: **290 pass**.
- Integration (`ps-inproc-operate-flow.ts`, +1 assertion): a fresh `Status` model trained on the virtual
  `MembershipType` feature, scored on-demand via `RecordProcessExecutor.RunByID` →
  **`Distinct prediction scores across 15 rows: 4` (was 1)** — the regression guard whose absence let this hide.

The historical analysis that led to the fix is preserved below for context.

---

**Original status (pre-fix):** documented for a deliberate, reviewed fix — deliberately not blind-patched overnight
in the anti-skew backbone (regression risk to working models). The phase-2 Operate feature itself is verified
working end-to-end; it merely *surfaced* this.

## What I observed
Operated the published model **`ps-live-renewal-lifecycle (safe to delete)` v1** (logistic regression,
target `Status`) via the UI: Run now, scope = Everyone (2,137 AssociationDemo Memberships), generic output.

- The run **completed** and persisted 2,137 `MJ: Process Run Details`.
- **Every single prediction was identical: `0.7883168565540383`, class `Active`** — `COUNT(DISTINCT score) = 1`,
  `min == max`, `COUNT(DISTINCT class) = 1` across all 2,137 rows.

## Why that's a bug, not a weak model
The model **did** learn the features — its `FeatureImportance` is non-zero and category-specific:
```
MembershipType=Early Career Professional : 0.998
MembershipType=Individual Professional   : 0.978
MembershipType=Retired Professional      : 0.275
MembershipType=Corporate                 : 0.070
...
```
Pipeline `FeatureSteps`: `select [AutoRenew, MembershipType]` → `onehot MembershipType`. Holdout
`{accuracy 0.805, auc 0.513, ...}` (near-chance — but that's a separate "weak model" story).

Crucially, **`MembershipType` varies in the data** — it's a **virtual (computed) entity field**
(`IsVirtual=1`, denormalized from `MembershipTypeID`), present on the entity view `AssociationDemo.vwMemberships`
but **not** on the base table `AssociationDemo.Membership`. The view returns it varied:
```
Individual Professional 1218 · Student 634 · Corporate 235 · Early Career Professional 46 · Retired Professional 4
```
So: the model weights `MembershipType` (≠ 0 importance, learned at train time) **and** the data varies — yet
score-time predictions are constant. ⇒ **the `MembershipType` feature is constant/missing at score time** while
it was present at train time. That is a **train/serve skew** — precisely what the "one code path × three
contexts, fit-once/apply-everywhere" design exists to prevent.

## Root-cause hypothesis (where to look)
Train and score share `FeatureAssemblyExecutor`, but differ in **how rows are sourced**:
- **Train context** reads sources via `RunViewDataAccess` (`feature-assembly/data-access.ts`) — `RunView` over
  the entity **view** (`Fields:['AutoRenew','MembershipType']`, `ResultType:'simple'`) → the **virtual**
  `MembershipType` column **is** returned (it's a view column) → train sees it varied.
- **On-demand score context** (RecordProcess `WorkType='ML Model'`) gets its records from the **RecordProcess
  scope source**, which the `MLModelInferenceProcessor` turns into rows via `recordToPlain(record)` →
  `record.GetAll()`. If the scope read the records **without** the virtual field (e.g. base-table / narrowed
  read, or a `GetAll()` that omits unpopulated virtual fields), the assembler receives `MembershipType = null`
  for every row → `onehot` encodes a constant (all-zeros) → only the intercept drives the score → **constant**.

So the likely divergence is **score-time records lacking the virtual field that train-time data-access fetched**.

## Repro
1. Train (or use) a model whose pipeline uses a **virtual/denormalized** entity field as a feature
   (here `MembershipType` on `Memberships`).
2. Production tab → select the model → **Operate** → **Run now** (any scope).
3. Inspect the run drill-in (or `MJ: Process Run Details.ResultPayload`): all `score`/`class` are identical.

DB to inspect (MJ_5_43_0): model = published `ps-live-renewal-lifecycle (safe to delete)` v1 (target `Status`);
the run I created: `ProcessRunID = F74F9CA1-CC60-4357-8E3F-0971BBF98F49` (2,137 details, 1 distinct score).

## Suggested fix direction (needs verification, not blind)
1. **Instrument** the on-demand assembled feature matrix (`FeatureAssemblyExecutor` score context) for ~5 records
   and confirm `MembershipType` is null/constant there while train-context shows it varied. That pinpoints it.
2. If confirmed: make the **score-time source include virtual/computed fields** — either have the inference
   path **re-read via `RunViewDataAccess`** (same reader train uses, so it provably can't skew), or ensure the
   RecordProcess scope reads the records with the virtual fields populated (entity_object / a `GetAll()` that
   includes computed fields, or don't narrow `Fields` such that virtual columns drop).
3. **Add a regression test**: an integration assertion that a model with a varying feature produces
   **`COUNT(DISTINCT score) > 1`** across a scored set (the existing `ps-live-*` tests assert scores *exist*,
   never that they *vary* — which is why this stayed latent). The new `ps-inproc-operate-flow.ts` is the natural
   home for it.
4. Re-run the full PS integration suite + an Operate E2E; verify the working high-AUC models still score, and
   the previously-constant one now varies.

## Scope note
- This is in `packages/AI/PredictiveStudio/Engine/src/feature-assembly/**` + the on-demand score path
  (`scoring/ml-model-inference-processor.ts`) + how the RecordProcess scope sources rows — **pre-existing**,
  not the phase-2 Operate work.
- The **Operate feature, Production tab, CreateScoringProcess Remote Op, run drill-in, and the full MJServer
  integration suite are all verified working** — the flow correctly created the process, ran it, persisted the
  details, and surfaced them. It just faithfully surfaced wrong predictions coming from the assembler.
