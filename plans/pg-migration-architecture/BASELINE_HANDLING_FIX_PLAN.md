# pg-migrate Skill — Baseline (v5.37.x) Handling: Diagnosis & Fix Plan

> Status: **Diagnosis + plan only.** No implementation until reviewed/approved.

## Context

The `/pg-migrate` skill (`.claude/commands/pg-migrate.md`) converts SQL Server migrations to
PostgreSQL, validates them, and produces a parity report. It handled the normal `V*.sql`
incremental migrations correctly, but on the **baseline** (`B202605241137__v5.37.x__Baseline.sql`,
~52 MB) it (a) did **not fully apply the conversion rules**, and (b) **never determined whether the
rules actually worked**. This document diagnoses why and proposes the fix.

## How baselines actually work (established by investigation)

- **Baseline files** (`B*__Baseline.sql`) are huge consolidated full-schema dumps; normal `V*.sql`
  files are small incremental changes. Flyway/Skyway only runs a `B*` baseline on a fresh DB.
- **SQL Server baselines present:** v5.0, v5.34.x, v5.37.x, **v5.38.x**.
  **PG baselines present:** v5.0, v5.34.x, v5.37.x — **no v5.38.x PG baseline exists.**
- The v5.37.x PG baseline header says *"Converted from SQL Server using TypeScript conversion
  pipeline"* and contains **8 `-- SKIPPED:` comments** (4 `EntityBehavior*` sprocs whose return
  views aren't in the baseline = the documented **F1** converter gap; 4 `GRANT CONNECT` for SS
  logins with no PG equivalent). So the rule-based converter **did** produce it, but skipped 8
  statements.
- The repo has a full baseline build/validate toolchain the skill never invokes:
  `mj baseline roundtrip` (`packages/MJCLI/src/commands/baseline/roundtrip.ts`),
  `scripts/regenerate-pg-baseline.sh` (pg_dump of a canonical PG DB),
  `scripts/audit-baseline-completeness.mjs`, `scripts/pg-diff-regenerated.mjs`.

### What `mj baseline roundtrip` is

A CLI command (`roundtrip.ts`) whose job is to **prove a baseline is correct**:
1. Introspect a "gold" source DB that already has the full V-stack applied; dump all rows.
2. Emit a baseline `.sql` from that snapshot.
3. **(PG only) convert that baseline to Postgres** — shells out to `mj migrate convert`, which its
   own comments call *"a stub; user must run /pg-migrate manually for richer conversion"* (flag doc:
   *"PG path runs the converter via /pg-migrate first"*).
4. Apply the baseline to a fresh target DB (`psql -v ON_ERROR_STOP=1`).
5. Re-introspect target and compare vs. gold → `ROUNDTRIP CLEAN ✓` or lists diffs (non-zero exit).

It is *the* existing "determine if it worked" harness — but its PG conversion step is the stub that
points back at the skill, while the skill never converts the baseline. That is the circular gap.
(Its step 2 *builds* a new baseline from a gold DB; that part is out of scope here — we convert the
existing T-SQL baseline file instead. Its apply+compare logic, steps 4-5, is reusable.)

## Root causes (why the skill mishandles the baseline)

1. **No baseline-specific phase in the skill.** Phase 2 converts files one-by-one from a "missing"
   list with `mj sql-convert`. It treats a 52 MB introspection baseline exactly like a small `V*`
   file. There is no separate "convert + validate the baseline" workflow.

2. **The quality gate only flags `-- TODO:`, never `-- SKIPPED:`.** The only SQL quality gate in the
   skill (lines ~176, ~255-259, ~976-997) greps `-- TODO:`. The 8 `-- SKIPPED:` lines — statements
   the converter deliberately dropped — pass the gate **silently**. ("SKIP" appears in the skill
   only for Phase 4 Playwright test statuses, never for SQL output.)

3. **No baseline correctness validation ("determine if the rules worked").** Phase 3 builds the SS
   DB from the *SS* baseline and the PG DB from the *PG* baseline, then compares object counts. If
   both baselines share the same gap, the parity check sees them as "matching" and never catches it.
   The skill never round-trips the baseline (convert → apply → diff against the V-stack canonical
   schema) even though the roundtrip + audit/diff scripts exist for exactly this.

4. **A circular hand-off gap.** `mj baseline roundtrip`'s PG path (roundtrip.ts:127-143) explicitly
   defers baseline conversion to the skill; the skill has **no** baseline conversion step and treats
   existing baselines as immutable. Each side assumes the other handles the baseline; neither does.

5. **Rule 6 (never re-convert existing `.pg.sql`) wrongly applied to baselines.** That immutability
   rule is correct for deployed `V*` migrations, but a baseline is a *regenerable* consolidation
   artifact. Treating it as immutable means rule fixes never reach it and there is no signal it has
   drifted from what the current rules / canonical schema would produce.

6. **Phase 1 discovery is inconsistent with the toolchain.** The skill's `comm`-based discovery
   includes `B*` baselines (so it flags the v5.38.x SS baseline, which has no PG counterpart, as
   "missing"), while `mj migrate convert`'s `discoverUnconverted` JSDoc *claims* to skip baselines
   but its code (convert.ts:187-189) does **not**. The two disagree on whether baselines are in
   scope. The `comm` also ignores `.pg-only.sql`, so a V-file covered only by a `.pg-only.sql` is
   falsely reported "missing".

## Chosen approach

- **Do NOT create new baselines** and **do NOT regenerate from canonical (pg_dump).**
- **Convert the existing T-SQL baseline file (`B*__Baseline.sql`) into the PG baseline using the
  exact same rule-based pipeline as every other migration** (`mj sql-convert` / `convertFile`).
- The fix must make that conversion **fully apply the rules** (no material `-- SKIPPED:` silently
  dropping content) and **prove it worked** (convert → apply to fresh PG → parity-compare).
- **Scope:** skill + converter rules + validation wiring.

## Recommended fix

### A. Skill — `.claude/commands/pg-migrate.md`

1. **Add a dedicated baseline phase ("Phase 2.5: Baseline Conversion & Validation").** When a T-SQL
   baseline (`migrations/v5/B*__Baseline.sql`) has no PG counterpart, convert it with the **same**
   command used for V-files — `mj sql-convert <baseline>.sql --from tsql --to postgres --output
   <baseline>.pg.sql --schema __mj` — then validate it (step A4).
2. **Extend the quality gate to flag `-- SKIPPED:` (not just `-- TODO:`).** Add a `grep "SKIPPED"`
   step; every skip must be triaged against an explicit allow-list (benign, e.g. `GRANT CONNECT`) —
   anything else blocks the run like a TODO.
3. **Fix Phase 1 discovery (lines ~148-157).** Make baseline handling deliberate, and make the
   `comm` also subtract `.pg-only.sql` basenames.
4. **Add baseline validation** (the "determine if the rules worked" step): apply the converted
   `B*.pg.sql` to a fresh PG DB with `psql -v ON_ERROR_STOP=1`; build a fresh SS DB from the same
   `B*.sql`; compare object/column/view/routine/FK counts + lists (reuse Phase 3 queries) and run
   `scripts/audit-baseline-completeness.mjs` + `scripts/pg-diff-regenerated.mjs`.
5. **Carve baselines out of Rule 6.** Keep `V*` immutability, but state baselines are regenerable:
   convert when the PG counterpart is missing.

### B. Converter rules — `packages/SQLConverter/src/rules/`

Eliminate or formally justify the 8 SKIPPED statements so the gate (A2) passes cleanly:
- **`GrantRule.ts`** — the 4 `GRANT CONNECT TO <login>` skips are correct (no PG equivalent). Emit
  them as an explicit *allow-listed* intentional skip the gate recognizes, not a generic SKIPPED.
- **F1 `EntityBehavior*` sprocs (4)** — sproc body returns a view not created in the baseline. Make
  the rule (`ProcedureToFunctionRule.ts` + `ViewRule.ts` ordering) baseline-aware: either resolve
  ordering, or emit a documented, gate-approved skip (these are orphaned sprocs for deprecated
  entities). Run `cd packages/SQLConverter && npm run test` after (CRITICAL Rule 6).

### C. Toolchain — MJCLI

- **`packages/MJCLI/src/commands/migrate/convert.ts` (187-189 + JSDoc 172-178)** — the doc claims
  baselines are skipped; the code does not. Reconcile to match the chosen behavior (baselines ARE
  converted).
- **`packages/MJCLI/src/commands/baseline/roundtrip.ts` (127-143)** — replace the PG "stub"
  `mj migrate convert` call (and its misleading comment) so the PG path runs the real rule-based
  conversion the skill uses, closing the circular hand-off.

## Verification

- In the Docker workbench: run the new baseline phase — `mj sql-convert` the SS baseline, apply to
  fresh PG with `ON_ERROR_STOP=1` → 0 apply errors.
- The `-- SKIPPED:` gate reports only allow-listed benign skips (the 4 `GRANT CONNECT`) and nothing
  else.
- `audit-baseline-completeness.mjs` against the PG DB built from the converted baseline → 0 missing.
- Phase 3 parity + `pg-diff-regenerated.mjs`: SS-from-baseline vs PG-from-baseline counts match
  (modulo documented intentional skips).
- `cd packages/SQLConverter && npm run test` → all pass.
- `mj baseline roundtrip --dialect postgres ...` end-to-end → `ROUNDTRIP CLEAN ✓`.

## Key files

- `.claude/commands/pg-migrate.md` (skill)
- `packages/SQLConverter/src/rules/GrantRule.ts`, `ProcedureToFunctionRule.ts`, `ViewRule.ts`
- `packages/MJCLI/src/commands/migrate/convert.ts`, `packages/MJCLI/src/commands/baseline/roundtrip.ts`
- Reuse: `scripts/audit-baseline-completeness.mjs`, `scripts/pg-diff-regenerated.mjs`
- Reference: `plans/pg-migration-architecture/PG_MANUAL_FIXES_CATALOG.md` (F1-F5 gaps)
