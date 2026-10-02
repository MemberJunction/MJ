# Fix: `next` CI red after the Rubrics merge (CodeGen drift + CD3)

**Status:** plan — to be implemented by a local agent on this same branch, then reviewed.
**Branch:** `claude/jolly-mendel-0wn5wl` (cut from `next` at `4b1704874`).
**Scope:** generated artifacts + ONE new migration. No hand-written TypeScript, no edits to merged migrations.

---

## 1. What is broken

The **Integration Tier** workflow (`.github/workflows/integration.yml`) has been red on every push
to `next` since #4937 (Rubrics) merged:

| Commit | PR | Integration Tier |
|---|---|---|
| `5c6440dc8` | #4800 | ✅ |
| `85659a246` | #4937 Rubrics | ❌ |
| `4b1704874` | #4979 Rubrics docs (HEAD) | ❌ |

Run on HEAD: https://github.com/MemberJunction/MJ/actions/runs/37020660881. `Test migrations` is
green. The two jobs below are both red.

### 1a. `Integration (SQL Server, deterministic)` → `codegen-determinism.CD3`

```
✗ codegen-determinism.CD3: 22 schema↔metadata field mismatches:
  'MJ: Rubric Criterion Levels'.ScaleLevel: live field missing from generated schema
  'MJ: Rubric Evaluation Scores'.ScaleLevel
  'MJ: Rubric Evaluation Scores'.CriterionKey / CriterionNodeType / CriterionParentID
  'MJ: Rubric Evaluation Scores'.EvaluationStatus / EvaluatorType / EvaluatorUserID
  'MJ: Rubric Evaluation Scores'.SubjectEntityID / SubjectRecordID / ContextEntityID / ContextRecordID
  'MJ: Rubric Evaluation Scores'.RubricID / RubricMajorVersion
  'MJ: Rubric Evaluation Scores'.CriterionCohortCount / …MeanScore / …MinScore / …MaxScore / …ScoreStdDev / …HumanMeanScore
  … +2 more
```

**Cause:** `V202609302343__v6.2.x__Rubrics_Generated_Inner_Views.sql` and
`V202609302344__v6.2.x__Rubrics_Consensus_Views.sql` insert these `EntityField` rows (e.g. `ScaleLevel`
at 2343:570, `CriterionKey` at 2344:1593), but the committed
`packages/MJCoreEntities/src/generated/entities/__mj.ts` was generated *before* those migrations'
CodeGen ran. `MJRubricEvaluationScoreSchema` today has only the base-table fields + `Criterion`;
`MJRubricCriterionLevelSchema` lacks `ScaleLevel`. The DB is right; the TypeScript is stale.

### 1b. `CodeGen drift gate` → warm-twice idempotency

```
[idempotency-check] ❌ run2.patch is NOT byte-identical to run1.patch! CodeGen produced new diffs on run 2.
+++ b/packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/MJRubricCategory/mjrubriccategory.form.component.html
+  FieldName="RootParentID" / "ParentIDDepth" / "ParentIDPath" / "ParentIDIsLeaf" …
```

(The run-2 patch is 1,155 lines; CI only printed the head, so only the Rubric Categories form is
confirmed. Expect Rubric Criteria too.)

**Cause:** #4937 added two hierarchy opt-ins to
`metadata/entities/.entity-field-hierarchy-configurations.json` —
**`MJ: Rubric Categories.ParentID`** and **`MJ: Rubric Criteria.ParentID`** (`IsHierarchy: true`) —
but shipped no hierarchy SQL. The `vwRubricCategories` / `vwRubricCriteria` in
`V202609302342__v6.2.x__Rubrics.sql` (lines ~15285 / ~15540) have no `hier_ParentID` join and there
are no `fnRubricCategoryParentID_*` / `fnRubricCriterionParentID_*` functions. In CI:

1. `mj migrate` → views without hierarchy columns
2. `mj sync push` → turns `IsHierarchy` on
3. CodeGen run 1 → rebuilds the views WITH `RootParentID`, `ParentIDDepth`, `ParentIDPath`,
   `ParentIDIsLeaf`, `ParentIDChildCount` — but reads view columns before rebuilding, so it does not
   register them as fields (CodeGen's known one-pass lag)
4. CodeGen run 2 → registers them → forms/TS change → gate fails

Compare `vwTestSuites` in the same 2342 migration, which ships its hierarchy correctly (functions at
~17683, view with `hier_ParentID.*` at ~17940). That is the shape to reproduce.

**The "Diff committed generated artifacts" step was skipped** because the idempotency step failed
first, so there may be additional committed-vs-generated drift it would have reported. Step 4 below
surfaces it.

### Not in scope
- PR #4984 (open, Rubrics evaluators) touches neither generated files nor migrations — it does not fix this.
- No PostgreSQL work (`migrations-pg/**` is the build engineer's, per root `CLAUDE.md`).

---

## 2. Decision (already made — do not re-litigate unless step 3 proves it wrong)

**Ship the hierarchy, don't remove the opt-ins.** The Rubrics author intended Rubric Categories and
Rubric Criteria to be hierarchies (they're self-referencing trees). The fix is to ship the CodeGen
output those opt-ins produce in a **new** migration, plus regenerate the TypeScript/Angular/server
artifacts.

Fallback, only if the hierarchy output turns out to break something (e.g. a custom form or view
depending on the current column set): remove the two Rubric entries from
`.entity-field-hierarchy-configurations.json` instead, and still do the TS regen for §1a. Stop and
report before taking the fallback.

---

## 3. Ground rules for the implementing agent

- **Private database.** Use the `bootstrap-clean-db` skill (or a throwaway SQL Server container) on a
  name nobody else uses. Never the shared dev DB. One database per agent (root `CLAUDE.md`).
- **Never edit `V202609302342`–`V202609302345`.** They're merged to `next`. The fix is a new file.
- **Never hand-edit anything under `generated/`.** It all comes from `mj codegen`.
- **`EntityField` INSERTs must use the apply-time sequence** —
  `(SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '…')`
  — never a literal. CodeGen emits this form already; just don't "clean it up".
- **Revert `sync`-block write-back** after `mj sync push` (`node scripts/ci-restore-sync-only-metadata.mjs`)
  — a feature PR must not carry `lastModified`/`checksum` stamps.
- **Don't commit host artifacts** (`mj.config.cjs` edits, `packages/GeneratedEntities/**`,
  `packages/MJAPI/src/generated/**`, `packages/MJExplorer/src/app/generated/**`).
- **Don't commit** stray `migrations/**/CodeGen_Run_*.sql` scratch files or `codegen.output.log`.

---

## 4. Steps

### Step 1 — Clean DB at `next` HEAD, reproduce both failures

```bash
git fetch origin && git checkout claude/jolly-mendel-0wn5wl && git pull
pnpm install --frozen-lockfile
npx turbo build --filter=@memberjunction/cli --filter=@memberjunction/codegen-lib

# fresh, empty, private DB (DB_DATABASE in .env points at it)
node packages/MJCLI/bin/run.js migrate
node packages/MJCLI/bin/run.js sync push --dir=metadata --ci
node scripts/ci-restore-sync-only-metadata.mjs
```

Take a `BACKUP DATABASE` here (call it `bak-after-push`) — every later step can restart from it.

Reproduce exactly what CI ran:

```bash
node packages/MJCLI/bin/run.js codegen --no-ai --skip-commands
node scripts/codegen-idempotency-check.mjs --stage warm-twice --no-ai --skip-first-run   # expect ❌
```

Record the **full** run-2 diff (`git diff --stat` and the file list). Confirm it is the hierarchy
fields on Rubric Categories + Rubric Criteria and nothing unrelated. If anything else moves, list it
in the PR description — it's real drift CI would also flag.

### Step 2 — Generate the DB-side output (SQL), restore from the backup first

Restore `bak-after-push` and discard the working-tree changes from step 1's reproduction
(`git diff` to confirm they're all CodeGen output, then `git stash` / targeted revert — ask before
any destructive git op).

```bash
node packages/MJCLI/bin/run.js codegen --no-ai --skip-commands --skipfiles   # pass A
node packages/MJCLI/bin/run.js codegen --no-ai --skip-commands --skipfiles   # pass B — registers the hierarchy fields
node packages/MJCLI/bin/run.js codegen --no-ai --skip-commands --skipfiles   # pass C — must emit nothing new
```

Keep the `CodeGen_Run_*.sql` from passes A and B. Pass C's run file should be empty (or only no-op
`IF NOT EXISTS` blocks); if it is not, keep going until it is and record how many passes it took.

Verify per-entity parity on the live DB — every row must match:

```sql
SELECT e.Name,
  (SELECT COUNT(*) FROM __mj.EntityField f WHERE f.EntityID = e.ID) AS Fields,
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS c
     WHERE c.TABLE_SCHEMA = e.SchemaName AND c.TABLE_NAME = e.BaseView) AS ViewCols
FROM __mj.Entity e WHERE e.Name LIKE 'MJ: Rubric%';
```

### Step 3 — Author the new migration

```bash
date +"%Y%m%d%H%M"     # must sort AFTER V202609302345 and after anything else on next at merge time
```

Create `migrations/v6/V<ts>__v6.2.x__Rubrics_Hierarchy_CodeGen.sql`:

- **No hand-written DDL needed** — the whole file is CodeGen output. Still put the standard
  CodeGen banner (see `migrations/CLAUDE.md` § "Appending CodeGen Output to a Migration") at the top,
  stating: generated by MJ CodeGen; ships the hierarchy TVFs + rebuilt base views for
  `MJ: Rubric Categories` and `MJ: Rubric Criteria` (opted in by
  `.entity-field-hierarchy-configurations.json` in #4937) and the `EntityField` rows for their
  hierarchy columns; do not hand-edit — regenerate.
- Concatenate pass A then pass B output, in order.
- **Strip** anything unrelated to the two Rubric hierarchy entities that a fresh-DB CodeGen happened
  to regenerate (identical view/sproc re-creates for other entities, etc.), and say in the banner that
  you did. Keep only: `fnRubricCategoryParentID_*`, `fnRubricCriterionParentID_*`,
  `vwRubricCategories`, `vwRubricCriteria` (+ their GRANTs), any sprocs CodeGen regenerated *because*
  those views changed, and the `EntityField` INSERT/UPDATE blocks for those two entities.
- Delete the standalone `CodeGen_Run_*.sql` files.

Gates (no DB needed):

```bash
node .github/scripts/check-migration-entityfield-sequence.mjs
npm run check:codegen-tail
```

### Step 4 — Regenerate files

Still on the step-2 database (which now has full metadata):

```bash
node packages/MJCLI/bin/run.js codegen --no-ai --skip-commands --skipdb
```

Expected changes (verify each is present, nothing hand-edited):

- `packages/MJCoreEntities/src/generated/entities/__mj.ts` — the 22 CD3 fields on
  `MJRubricEvaluationScore` / `MJRubricCriterionLevel`, plus `RootParentID`, `ParentIDDepth`,
  `ParentIDPath`, `ParentIDIsLeaf`, `ParentIDChildCount` on `MJRubricCategory` and `MJRubricCriterion`
  (and any hierarchy traversal methods CodeGen emits for opted-in entities — compare `MJTestSuite`)
- MJServer generated GraphQL types/resolvers for the same entities
- Generated Angular forms under
  `packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/MJRubric*/`
- Possibly `mj-class-registrations.ts` in Bootstrap / BootstrapLite (only if CodeGen changes them)

Revert anything outside `packages/` + the new migration that CodeGen or sync touched, after
confirming with `git diff` that it's scratch.

### Step 5 — Prove it from zero, the way CI does

New empty private DB (not the one from steps 1–4). Then, byte-for-byte the CI job:

```bash
node packages/MJCLI/bin/run.js migrate                                   # includes the new migration
node packages/MJCLI/bin/run.js sync push --dir=metadata --ci
node scripts/ci-restore-sync-only-metadata.mjs
node packages/MJCLI/bin/run.js codegen --no-ai --skip-commands
node scripts/codegen-idempotency-check.mjs --stage warm-twice --no-ai --skip-first-run   # must be ✅
node scripts/codegen-idempotency-check.mjs --stage single-column --no-ai                 # must be ✅
rm -f codegen.output.log
git ls-files --others --exclude-standard -- migrations/ | grep -E '/CodeGen_Run_[^/]*\.sql$' | xargs -r rm -f
git status --porcelain -- packages/ metadata/ migrations/                                # must be EMPTY
```

If `git status` is not empty, the committed artifacts still differ from a clean-DB CodeGen — fix
before going further. Then the deterministic integration tier against that same DB:

```bash
pnpm run build            # or at least the packages whose generated files changed
pnpm run test:integration # CD3 must pass; report pass/fail/skip totals
```

Unit tests for packages whose generated output changed:

```bash
cd packages/MJCoreEntities && pnpm test
cd packages/Angular/Explorer/core-entity-forms && pnpm test
```

### Step 6 — Changeset, commit, push

- Changeset: **`minor`** (the branch adds a versioned migration — `.claude/rules/changesets.md`).
  Packages: whichever published packages had generated output change (at least
  `@memberjunction/core-entities`, `@memberjunction/server`, `@memberjunction/ng-core-entity-forms`).
  Summary line: "Ship the Rubric Categories/Criteria hierarchy CodeGen output and regenerate stale
  Rubric generated types (fixes Integration Tier on next)."
- Move this plan to `plans/complete/fix-rubrics-codegen-drift.md` in the same push.
- Verify tracking before pushing: `git branch -vv` must show `[origin/claude/jolly-mendel-0wn5wl]`.
- Push. Do **not** merge — it comes back for review.

---

## 5. What the implementing agent reports back (put it in the PR description)

1. Full file list + `--stat` of the run-2 diff from step 1 (the part CI truncated).
2. Number of `--skipfiles` passes until the run file went empty.
3. The per-entity parity query output for `MJ: Rubric%`.
4. What was stripped from the migration as unrelated, if anything.
5. Step 5 outputs verbatim: both idempotency stages, the `git status --porcelain` (empty), integration
   tier pass/fail/skip, unit-test pass/fail/skip.
6. Anything that made you consider the §2 fallback.

## 6. Review checklist (for the reviewer)

- [ ] No edits to `V202609302342`–`2345`; exactly one new migration, sorted last in `migrations/v6/`
- [ ] Migration contains only Rubric-hierarchy objects; banner present; no literal `Sequence`
- [ ] `fn…ParentID_*` / view shape matches the `vwTestSuites` precedent in 2342
- [ ] `__mj.ts` gains the 22 CD3 fields and the hierarchy fields; no unrelated entity churn
- [ ] No `sync` blocks in `metadata/**`; no host artifacts; no `CodeGen_Run_*.sql` left behind
- [ ] Changeset is `minor`
- [ ] PR CI: Integration Tier (deterministic + drift gate) green
