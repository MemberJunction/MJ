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
| _(finalization)_ | **RunView provider-typing fix** — `resolveSourceQueryId` now uses `RunView.FromMetadataProvider(provider)` (the sanctioned factory) instead of `new RunView(provider)`; the join-table code passed an `IMetadataProvider` where `RunView` wants `IRunViewProvider`, which failed `tsc`. Caught by the clean-clone build. |

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

## What's already validated (workbench)

- ✅ Migration applies cleanly → `MaterializedResult` 23 cols (no `SourceQueryID`), `MaterializedResultQuery` join table, `Query.IsMaterialized` present.
- ✅ **No circular-FK warning** from CodeGen (cycle eliminated).
- ✅ CodeGen creates both entities with the expected names (`MJ: Materialized Results`, `MJ: Materialized Result Queries`).
- ✅ AI-assisted CodeGen works when the Anthropic key is exposed as `AI_VENDOR_API_KEY__AnthropicLLM` (0 credential errors).

### Finalization pass (clean source-only clone of the branch)

- ✅ **Full build is clean** — `turbo build --filter=@memberjunction/cli` → 142 packages, 0 errors, **after** the RunView provider-typing fix above. (The first clean-clone build failed only on that one `tsc` error, which is now fixed.)
- ✅ **CodeGen completes cycle-free on a current-schema DB** (a full 385-entity DB + the materialization DDL): 387 entities processed, **0 circular/cycle warnings, 0 "not found in metadata" fatals**, both materialization entities created.
- ⚠️ **Pristine final artifacts (concatenated SQL emit + regenerated generated files) cannot be produced in the workbench** and are intentionally deferred to the merge-time CodeGen (steps 3–5 below). Reasons, all confirmed this pass:
  - **No workbench DB equals branch-HEAD.** The only current-schema DBs (e.g. `FABRIC_DEMO`, 385 entities) are hand/CodeGen-built and *diverge* from the branch (they lack a handful of the branch's newer entities — `MJAIAgentCredential`, `MJAIAgentHarness`, `MJAISkillSearchScope`, `MJContentItemChunk`…). CodeGen against them produces a **polluted** diff (deletes/alters those entities' forms + metadata) — not the branch's shippable output.
  - **`mj migrate` can't bootstrap a clean branch-HEAD DB** — it dies at load time with `MODULE_NOT_FOUND` on `MJCoreEntities/dist/custom/MJUserViewEntityExtended` because `src/index.ts` has **double-quoted, extensionless** relative exports (2 in `index.ts`, ~54 across `custom/*` in dist) that `tsc-alias` doesn't rewrite (it only fixes single-quoted, tsc-emitted specifiers), and the package is `"type":"module"` (strict-ESM `import()`). This is a **pre-existing branch/`next` quirk unrelated to materialization** — CodeGen's own loader tolerates it, which is why CodeGen runs but `migrate` doesn't. (Worth filing separately; do **not** fix it inside the materialization PR.)
  - **Raw-sqlcmd bootstrap of the migration stack is not faithful** to MJ's Flyway+CodeGen flow. Applying baseline + 38 V/R files by hand reproduces schema but the Metadata_Sync steps assume intervening CodeGen state and collide (e.g. `UQ_EntityField_EntityID_Sequence` on `EntityAction`/seq 100025 vs. the existing `ScopeEntity` virtual field). `R__RefreshMetadata`'s full scan would collide broadly. (For the record, sqlcmd bootstrap also needs: the `__mj.flyway_schema_history` table pre-created, `-I` / `QUOTED_IDENTIFIER ON` on every invocation, and `< /dev/null` on each sqlcmd so it doesn't eat the loop's stdin.)

**Conclusion:** the branch is proven sound (builds, cycle-free CodeGen, DDL correct). The emit concatenation **and** generated-file regen must come from a **single** CodeGen run against final-`next` (steps 3–5) so the two stay mutually consistent — producing them from a divergent workbench DB now would be throwaway and risk emit/generated-file skew. Until that run, the branch's committed generated files are knowingly stale: `MJMaterializedResultQueryEntity` is absent, and `MJMaterializedResultEntity.SourceQueryID` / `MJQueryEntity.MaterializedResultID` still reflect the dropped columns. (Harmless to the build — they're unused superset props — but they MUST be regenerated before merge.)

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

- **Baseline placeholder bug is NOT present** on this branch — a scan of every `${…}` across `migrations/v5` + `migrations/v6`
  found only `${flyway:defaultSchema}` (no `${dateFns.format(...)}` or other stray placeholders). The earlier note about
  `B…__Baseline.sql` failing on `${dateFns.format(...)}` is stale for this branch; disregard it.
- **`mj migrate` fails to load `MJCoreEntities` under strict ESM** (`MODULE_NOT_FOUND` on a double-quoted, extensionless
  `custom/*` export). Pre-existing branch/`next` quirk; CodeGen's loader tolerates it. See the finalization-pass notes above.
- **Raw-sqlcmd bootstrap isn't faithful** to the Flyway+CodeGen metadata flow (EntityField sequence collisions). Use the
  release/CI bootstrap for a clean branch-HEAD DB. If you must sqlcmd it: pre-create `__mj.flyway_schema_history`, pass `-I`
  (QUOTED_IDENTIFIER ON) on every call, and redirect each sqlcmd's stdin from `/dev/null`.
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
