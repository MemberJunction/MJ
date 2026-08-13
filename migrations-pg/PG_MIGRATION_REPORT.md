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
| SS↔PG schema parity (layer 2) | ✅ PASS — **after fixing a defect it caught**: tables 376 = 376, FKs 792 = 792 |
| View equivalence (layer 3) | ✅ PASS — 44 differences, all in two documented-benign buckets |
| CRUD oracle (layer 4) | ✅ PASS — 369 pass / 4 fail, all 4 pre-existing (v5.46–v5.49) |

The deploy gate is necessary but was **not** sufficient. Layer 2 caught a defect that applies
cleanly and is therefore invisible to the deploy gate — see "The defect layer 2 caught" below.
With all four layers run, every one of the eight new migrations applies cleanly to a **fresh**
PostgreSQL 16.14 database, in order, with no errors, and the resulting schema matches SQL Server.

## The defect layer 2 caught — 11 silently dropped `DROP TABLE` statements

The Phase0 retirement migration drops 11 retired tables. The converter **kept the section
comments and dropped every statement under them**, so the PG counterpart announced the retirement
and then did nothing. Table counts: SQL Server 376, PostgreSQL 387.

This is the important class of defect, because **nothing upstream of layer 2 can see it**:

- the deploy gate passes — a migration that drops nothing applies perfectly cleanly;
- content/delete parity passes — it compares counterpart *existence* and delete statements, and
  the file did contain the surrounding DDL;
- size-diffing vs source passes — the file is not suspiciously small, since only 11 lines are gone.

Only a direct SQL Server ↔ PostgreSQL object-count comparison surfaces it. All 11 `DROP TABLE …
CASCADE` statements were restored and the counts now agree exactly (376 = 376, FKs 792 = 792).

**Process consequence:** the deploy gate alone is not a sufficient release gate for a PG
conversion. Layers 2–4 are not optional polish — layer 2 is the only thing standing between a
converter that silently omits statements and a PostgreSQL install whose schema has quietly
diverged from SQL Server.

## Layers 3 and 4 detail

**Layer 3 — view equivalence.** 44 views differ between the two dialects. Every one falls into a
bucket already documented as benign:

| Bucket | Count | Why benign |
|---|---|---|
| Self-referencing FK join aliases | 37 | The converter names self-join aliases differently; the join graph and output columns are identical |
| Alias letter-casing | 7 | PG folds unquoted identifiers to lowercase; the projected column set is the same |

**Layer 4 — CRUD oracle.** 369 pass, 4 fail. All four failures reproduce against migrations from
**v5.46–v5.49** and are unrelated to this release's eight migrations — they are pre-existing, not
regressions introduced here.

## Files converted

| Migration | SS lines | PG lines | Route |
|---|---|---|---|
| `V202608052200__AI_Agent_Harness_Foundation` | 8,105 | 8,398 | legacy converter |
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
3. **`RecentAccessService: Failed to create log entry`** — logged three times per record open in the
   browser smoke. The magic-link `UI` role lacks create permission on the recent-access entity, so
   this is a permission-surface question, not a migration defect (nothing else in the session
   failed). Worth confirming the intended grant for restricted roles.

## Verification performed

- ✅ Fresh-PG deploy gate — `mj migrate` exit 0; all 8 versions `success = t` in
  `flyway_schema_history`; database dropped and recreated for every attempt
- ✅ PG content + delete parity — `scripts/check-pg-migration-content.mjs`: 218 counterparts,
  0 suspect, 0 delete mismatches
- ✅ Size-diff vs source (DEPLOYMENT.md §8) — no counterpart suspiciously small
- ✅ Metadata-sync statement parity — create/update/delete counts equal on both sides
- ✅ Rule 1 — committed ledger unmodified
- ✅ Layer 2 — SS↔PG schema parity: tables 376 = 376, FKs 792 = 792 (**caught the 11 missing
  `DROP TABLE` statements**; the counts agree only after that fix)
- ✅ Layer 3 — view equivalence: 44 differences, all in the two documented-benign buckets
- ✅ Layer 4 — CRUD oracle: 369 pass / 4 fail, all four pre-existing (v5.46–v5.49)
- ✅ **Full-stack browser smoke (DEPLOYMENT.md §8)** — Playwright + Chromium against MJExplorer
  served from its production build, talking to MJAPI on the converted PostgreSQL database:
  - **Login** via the real magic-link journey (browser → `/magic-link/redeem` interstitial → 302 to
    Explorer with the minted JWT). Asserted **positively** on `<mj-shell>` plus a loaded workspace
    and non-zero API traffic — never on absence of error text. No password field (off-IdP).
  - **Provisioning wrote through the converted schema** — redeeming created the `User`, `UserRole`
    (UI) and `MagicLinkRedemption` rows, and the new user then appeared in Explorer's own user list.
  - **Entity grid** reached by *in-app clicks only* (typing in the entity-browser search, clicking
    the result row): `MJ: AI Models` rendered **26 `.ag-row`s**, zero console errors.
  - **Deep CRUD round-trip** on `MJ: Dashboard Categories`: read the existing Description, entered
    edit mode, replaced it via the real textarea, clicked **Save Changes** — and the new value was
    then **verified directly in PostgreSQL** with a fresh `__mj_UpdatedAt`. The UI toast was not
    treated as proof; the table was. A matching `RecordChange` row (`Update` / `Complete`, with the
    before→after description) confirms Record Changes fires correctly on PostgreSQL. The original
    value was restored afterwards.
  - **The permission gate held**: an earlier attempt targeted `MJ: AI Models`, where the `UI` role
    has `CanUpdate = false` — the save was correctly refused and nothing was written.
- ✅ Migration ordering — `AI_Agent_Harness_Foundation` retimestamped `202608050724` →
  `202608052200` so it sorts **after** the edge.0 ceiling (`202608052115`). `outOfOrder` defaults
  to `false`, so under the original timestamp Flyway would silently skip it on every database
  upgrading from edge.0 — fresh installs would get the harness schema and upgraders would not.
  The SS and PG filenames were renamed together (the pairing is required).
