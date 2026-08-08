# PostgreSQL Migration Report — v6.1.0-edge.1

**Generated**: 2026-08-08
**Branch**: `release/v6.1-prep`
**Container branch**: `pg-migrate-v2/release/v6.1-prep`
**Base SHA**: `b42abd08b5`

## Summary

| Item | Result |
|---|---|
| New SS migrations needing counterparts | **8** |
| Counterparts produced | **8** (0 missing) |
| `.needs-hand` files remaining | **0** |
| **Fresh-PG deploy gate (`mj migrate`)** | ✅ **PASS** — exit 0, all 8 recorded `success = t` |
| `mj sync push` (metadata reseed on PG) | ❌ blocked — PG context-user permission, see Open Issues |
| PG content + delete-parity gate | ✅ PASS — 218 counterparts, **0 suspect**, 0 delete mismatches |
| Committed ledger immutability (Rule 1) | ✅ byte-for-byte intact — only new files added |

The deploy gate is the load-bearing proof: every one of the eight new migrations applies
cleanly to a **fresh** PostgreSQL 16.14 database, in order, with no errors.

## Files converted

| Migration | SS lines | PG lines | Route |
|---|---|---|---|
| `V202608050724__AI_Agent_Harness_Foundation` | 8,105 | 8,398 | legacy converter |
| `V202608061704__Phase0_Legacy_Workflow_Report_ScheduledAction_Retirement` | 2,014 | 1,696 | legacy + 5 hand fixes |
| `V202608061930__Phase1_Task_Payload_And_Claim_Columns` | 4,054 | 4,395 | legacy + 4 hand fixes |
| `V202608071100__EntityRelationship_RelatedRecordCollection` | 979 | 948 | legacy converter |
| `V202608072030__Phase4_Task_Dependency_Conditions` | 542 | 548 | legacy converter |
| `V202608080100__Drop_EntityAction_Uniqueness` | 70 | 27 | **hand-authored** |
| `V202608080201__AIAgentRun_ContinuationDepth_and_ScheduledJob_MissedRunPolicy` | 5,877 | 6,119 | legacy converter |
| `V202608080752__Metadata_Sync` | 10,534 | 7,211 | legacy converter |

## The `--split` path was not usable for this set

`/pg-migrate-v2` prescribes `mj migrate convert --split`. Run as prescribed it reported a
clean structural result — **"needs hand-authoring: 0"** — while producing counterparts that
could not deploy. Two independent reasons, both of which the "0 gaps" summary is blind to:

1. **Bulk INSERTs emitted `1`/`0` into PG `boolean` columns.** Deploy died on
   `column "IncludeInAPI" is of type boolean but expression is of type integer`. The committed
   ledger documents this exact hazard: *"As of v5.30 all bulk INSERTs are emitted with native
   TRUE/FALSE values"* — a fix that lives in the **legacy** converter and has not been carried
   into `--split`. Pre-v5.30 this was papered over with a `pg_catalog` cast hack that managed PG
   (RDS/Aurora/Cloud SQL/Azure) refuses, which is why it was removed.
2. **CodeGen objects were simply absent.** `--split` defers views/sprocs/triggers/grants to a
   later `mj codegen`, so its output was a fraction of the source (e.g. AI_Agent_Harness
   1,540 lines vs 8,398 from the legacy converter, which bakes them inline).

Every file was therefore produced with the **legacy converter**, which is also what DEPLOYMENT.md
§8 already mandates for `*_Metadata_Sync.sql`. Size-diffing output against source (§8's check)
is what surfaced both problems.

### The metadata-sync near-miss

`--split` emitted `V202608080752__Metadata_Sync.pg.sql` as a **2-line marker**
(*"no DDL to translate"*). That is precisely the v5.45 defect (issue #3253), where 12,041 lines
of metadata DML vanished behind a comment and PostgreSQL installs silently received none of the
release's curated metadata. Empty SQL applies cleanly, so no automated gate would have caught it.

Reconverted via the legacy path: **7,211 lines**, verified against the source —
`spCreate` 43/43, `spUpdate` 53/53, `spDelete` 0/0 — and confirmed to carry this release's model
refresh (`qwen3.8-max` ×4, Claude Opus 4.1 deactivation ×1).

## Hand-authored fixes

All against **new, uncommitted** files. No committed `.pg.sql` was edited.

| # | Migration | Problem | Fix |
|---|---|---|---|
| 1 | Drop_EntityAction_Uniqueness | Whole migration was header + gap comment; the constraint drop never converted (T-SQL `sys.key_constraints` guard) | Authored `DROP CONSTRAINT IF EXISTS`; name verified against the PG ledger |
| 2 | Phase0 retirement | `DROP INDEX … ON <table>` (T-SQL only) | PG drops by schema-qualified name; no `ON` clause |
| 3 | Phase0 retirement | `IF COL_LENGTH(...)` column guards passed through raw | `DROP COLUMN IF EXISTS` / `ADD COLUMN IF NOT EXISTS` + guarded `DO` block for the FK |
| 4 | Phase0 retirement | Converter hoists CodeGen above raw DDL, so an index referenced `ScheduledJobID` before it existed | Relocated column DDL to run first, restoring source dependency order |
| 5 | Phase0 retirement | `DROP COLUMN` blocked by dependent view | `CASCADE`; the view is recreated later in the same migration |
| 6 | Phase0 retirement | `DECLARE @DoomedEntityIDs TABLE` (no PG table variables) | `CREATE TEMP TABLE … ON COMMIT DROP` |
| 7 | Phase0 retirement | `ALTER PROC spDeleteEntityWithCoreDependencies` body emitted at top level with 25 bare `@EntityID` refs | Wrapped as `CREATE OR REPLACE FUNCTION`, `RETURNS SETOF record` to match the v5.46 baseline contract |
| 8 | Phase1 Task | `"ESCAPE"` / `"NULLIF"` quoted as identifiers | Unquoted to keywords |
| 9 | Phase1 Task | Unguarded `DROP CONSTRAINT` | `IF EXISTS` |
| 10 | Phase1 Task | `CHAR(10)` used as a **function** — in PG that is the *type* `character(10)` | `chr(10)`; reverted 14 genuine type declarations the sweep over-matched |
| 11 | Phase1 Task | `JSON_QUERY(x,'$.k')` — absent in PG 16 | `(x::jsonb -> 'k')::text` |
| 12 | Phase1 Task | `UPDATE … FROM` with unqualified columns present on both sides | Table-qualified the `ELSE` branches |

## Open issues

1. **`mj sync push` on PG fails a permission check** —
   `You do not have permission to edit this dashboard` on `MJ: Dashboards[1]`, transaction rolled
   back. The fresh PG database seeds only `not.set@nowhere.com` (Owner) and
   `anonymous@magic-link.local`, and the resolved context user is rejected by the dashboard
   permission gate. This is a **context-user/permission** problem, not a migration defect — the
   schema half of the gate passed completely. Related in kind to the documented PG gap that
   `UserCache.Refresh` is mssql-only. **Needs a decision before PG metadata reseed can be proven.**
2. **`--split` boolean regression** — worth fixing in `mj migrate convert --split` so it emits
   native `TRUE`/`FALSE` like the legacy path, otherwise the next build hits this again.
3. **Phases 4 / 4b not run** — full-stack browser smoke and deep CRUD are delegated to Claude Code
   inside `claude-dev`, which is **not authenticated** (`Not logged in · Please run /login`).
   Run `docker exec -it claude-dev claude`, complete OAuth, then those phases can execute.

## Verification performed

- ✅ Fresh-PG deploy gate — `mj migrate` exit 0; all 8 versions `success = t` in
  `flyway_schema_history`; database dropped and recreated for every attempt
- ✅ PG content + delete parity — `scripts/check-pg-migration-content.mjs`: 218 counterparts,
  0 suspect, 0 delete mismatches
- ✅ Size-diff vs source (DEPLOYMENT.md §8) — no counterpart suspiciously small
- ✅ Metadata-sync statement parity — create/update/delete counts equal on both sides
- ✅ Rule 1 — committed ledger unmodified
- ⏸️ Schema parity vs SQL Server, view equivalence, CRUD oracle — not run (time); the deploy gate
  and content parity are the blocking gates and both pass
- ⏸️ Phases 4 / 4b — blocked on container auth (above)
