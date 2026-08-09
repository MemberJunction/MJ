# Query & Entity Materialization — Rework Finalization

Turnkey steps to finish the rework on branch **`claude/materialization-rework`** and get it merge-ready.
Tracking issue: **#3626**. This branch is the clean re-implementation after the feature was reverted from
`next` (by #3617 / #3623) for a circular-FK + wasteful-migration rework.

---

## What's already done on this branch (committed, not pushed)

| Commit | What |
|---|---|
| `dc882ca8` | Re-introduce Phase 1 code (cherry-pick of reverted `4c14b3f`) |
| `d2bc5ad2` | Re-introduce Phase 2 read-time-injection code (cherry-pick of reverted `469862f`) |
| `01d7ab9f` | **Join-table code redesign** — resolve MR↔Query link via `MaterializedResultQuery` |
| `13966a82` | **One unified `v6.1.x` migration** (DDL only) + drop the old per-step v6.2.x files |

The re-introduced code already contains the **four review findings** fixed (they were squashed into
`4c14b3f`/`469862f`): PG swap atomicity, RunQuery cache `DataSource`, first-mint permission re-scoping,
and mint-time DDL identifier escaping (dialect-level `QuoteIdentifier`/`QuoteSchema`/`QuoteColumnAlias`).

## The design (Amith's call, confirmed in #3626)

- **No circular FK.** `MaterializedResult.SourceQueryID` and `Query.MaterializedResultID` are **dropped**.
  The link lives in a dedicated join table **`__mj.MaterializedResultQuery`**
  (`ID` PK, `MaterializedResultID`→MR, `QueryID`→Query, + `__mj` system cols, both FKs outward, 1:1 via two
  `UNIQUE` keys). Entity name CodeGen assigns: **`MJ: Materialized Result Queries`** (verified).
- **One consolidated `v6.1.x` migration** with a correct final `CREATE TABLE` (all columns up front, no
  create→alter→codegen chain), CodeGen emit concatenated into the same file.
- Code resolves the link through the join at three sites: `GenericDatabaseProvider.tryBuildMaterializedQueryPlan`
  (read-redirect), `manage-metadata` provisioning + drift scan (aliases `mrq.QueryID AS SourceQueryID`), and
  `MaterializationRefresher.resolveSourceQueryId` (used by `resolveSourceQuery`/`resolveSourceSelect`).

## What's already validated (workbench, against `MJ_*` DB with the migration applied)

- ✅ Migration applies cleanly → `MaterializedResult` 23 cols (no `SourceQueryID`), `MaterializedResultQuery` join table, `Query.IsMaterialized` present.
- ✅ **No circular-FK warning** from CodeGen (cycle eliminated).
- ✅ CodeGen creates both entities with the expected names (`MJ: Materialized Results`, `MJ: Materialized Result Queries`).
- ✅ AI-assisted CodeGen works when the Anthropic key is exposed as `AI_VENDOR_API_KEY__AnthropicLLM` (0 credential errors).

---

## Finalization steps (run in a CLEAN environment — CI/release, or a fresh clone; NOT the rotted workbench)

> Why clean env: the shippable emit + all generated files + the migration timestamp must be regenerated
> against **final `next`** anyway (next moves constantly). Do it once, consistently, at merge time.

1. **Rebase/merge onto final `next`.** Resolve any conflicts (materialization files are new, so conflicts
   should be limited to generated files + the migration timestamp ordering).

2. **Re-stamp the migration timestamp** in `migrations/v6/V202608082000__v6.1.x__Query_Entity_Materialization.sql`
   to a value **after** `next`'s newest migration at that moment (keep the `v6.1.x` label — do **not** bump to v6.2.x;
   all v6 migrations in `next` are `v6.1.x` per the edge-release convention).

3. **Generate the CodeGen emit on a clean DB** (from the latest published release baseline, or `next`-minus-this-migration):
   ```
   # apply the migration DDL to a clean full-schema DB, then:
   DB_DATABASE=<clean_db> AI_VENDOR_API_KEY__AnthropicLLM="$ANTHROPIC_API_KEY" mj codegen
   ```
   Confirm the log shows the two entities created and **no cycle/circular warning**.

4. **Concatenate the CodeGen SQL emit into the migration file**, after **50+ blank lines** and a comment banner
   (MJ standard — one self-contained migration; do NOT ship a separate `CodeGen_Run` file). The emit covers:
   entity/field metadata for both new entities, the `Query.IsMaterialized` field, the base views, CRUD sprocs,
   and permissions.

5. **Commit the regenerated generated files** produced by the same CodeGen run:
   `packages/MJCoreEntities/src/generated/entity_subclasses.ts`, `packages/MJServer/src/generated/generated.ts`,
   the 4 bootstrap manifests (`ServerBootstrap`, `ServerBootstrapLite`, `Angular/Bootstrap`, `Angular/BootstrapLite`),
   and `core-entity-forms/.../generated-forms.module.ts`.

6. **PG counterpart:** generate `migrations-pg/v6/…Query_Entity_Materialization.pg.sql` via `/pg-migrate`
   (or leave it for the toolchain at the version upgrade — MJ CI's PG-parity check flags it either way; if included,
   it must be perfect). Note the known SQLConverter `spCreate` id-capture gap for reference.

7. **Verify:** `npm run build`, unit + integration tiers, then a **fresh SQL Server + PostgreSQL E2E** on the
   reassembled code (the #3626 definition-of-done), and one adversarial `max` review pass.

8. **Push + tag Robert (`rkihm-BC`)** for review.

---

## Workbench pitfalls learned (so finalization avoids them)

- **Baseline Flyway apply fails** on `B…__Baseline.sql` with `No value provided for placeholder: ${dateFns.format(...)}` —
  the baseline contains literal `${…}` seed data Flyway misreads as a placeholder. Bootstrapping a brand-new DB via the
  workbench `db-bootstrap` trips on this; applying the migration to an already-bootstrapped clean DB avoids it.
- **AI creds:** MJ CodeGen wants `AI_VENDOR_API_KEY__<DriverClass>`, not the bare `ANTHROPIC_API_KEY`. Bridge it:
  `AI_VENDOR_API_KEY__AnthropicLLM="$ANTHROPIC_API_KEY"`.
- **Global CLI is old (`5.30.1`)** — use the **workspace** CLI (`6.1.0-edge.x`): `node packages/MJCLI/bin/run.js codegen`
  (NOT `dist/index.js`, which is a no-op module entry). Delete a stale `packages/MJCLI/oclif.manifest.json` if command
  discovery fails with a version-mismatch warning.
- **A cold `pnpm install` (empty store) crashed Docker Desktop** — use a warm store / clean clone; keep heavy installs off a loaded daemon.
- **Stale `dist` rot** — a workbench that's switched branches has `dist/` referencing reverted packages; only a full,
  consistent `turbo build` fixes it. A fresh clone avoids the whole class of problem.

## Deferred follow-ups (agreed safe; file as issues, not blockers)

- Concurrent-refresh watermark/data ordering (freshness, bounded by forced full rebuild).
- PG `DROP TABLE … CASCADE` transitive-dependent drop on refresh.
- P1 under-linking RLS guard fails **open** on unparseable SQL (defense-in-depth; primary check still runs).
