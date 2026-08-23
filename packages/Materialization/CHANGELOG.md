# @memberjunction/materialization

## 6.1.0-edge.3

### Minor Changes

- 7300953: Query & Entity Materialization — snapshot a stored Query's result (or an entity's base view) into a physical table that IS its own read-only entity, refreshed on a schedule with an atomic wrapper-view swap. Base-view (entity) materialization is cross-engine (SQL Server + PostgreSQL); query materialization runs on SQL Server today and becomes cross-engine once the pre-existing `spCreateVirtualEntity` support proc is ported to PostgreSQL (tracked with the broader PG parity effort). The refresh SQL and read path are cross-engine on both.
  - **New `@memberjunction/materialization`** package: the refresh engine (`MaterializationRefresher`) — full-rebuild (shadow table + atomic view swap), `DirtyGroupRecompute` and MERGE-upsert `Incremental` strategies for keyed aggregations, combined-key `SHA2_256` surrogate hashing, and the advisory `MaterializationFreshness` mixed-freshness inspector.
  - **CodeGen** (`codegen-lib`): materializes flagged stored Queries + entity base views (cross-engine DDL, wrapper view, read-only Virtual Entity minting, migration-reuse detection); parameterization (row-filter → materialize-broad + read-time predicate); aggregation-key auto-detection; RLS-downgrade gate; and `DriftHold` flag-and-hold drift detection.
  - **Read path**: `RunViewParams.DataSource: 'Live' | 'Materialized'` (`core`) routed by `GenericDatabaseProvider.GetEffectiveBaseView`, plumbed through the GraphQL layer (`server`, `graphql-dataprovider`).
  - **Scheduling** (`scheduling-engine`): `MaterializationRefreshScheduledJobDriver` sweeps due materializations (skips `Disabled`/`DriftHold`).
  - **`core-entities` / `ng-core-entity-forms`**: generated `MJ: Materialized Results` + `MJ: Materialized Result Queries` (join) entities + `Query.IsMaterialized` + forms. The MR↔Query link lives in the `MaterializedResultQuery` join table — there is no `MaterializedResult.SourceQueryID` / `Query.MaterializedResultID` FK — avoiding the circular dependency of the direct-FK design.

  See `plans/query-entity-materialization.md` for the full design.

### Patch Changes

- be0bdb2: Follow-up hardening for Query & Entity Materialization (#3735). Each item below fails toward doing the
  wrong thing rather than doing nothing, so none of them surface as an error in normal operation.

  **Row-restriction gates read both fence layers.** MJ enforces row restrictions in two AND-composed
  layers — role RLS and API-key row filters — and the mint, drift and runtime Leak-1 gates each re-derived
  a role-only predicate inline. An entity fenced _only_ by an API-key row filter therefore read as
  unrestricted; because the mint gives the materialized entity a NEW EntityID, the key's EntityID-keyed
  binding stops matching it, and the principal is served a full unscoped snapshot of rows it cannot read
  live. All gates now compose both layers, and an unproven layer counts as restricted.

  **Lost provenance is now drift.** Deleting a source query cascade-deletes the `MaterializedResultQuery`
  join row while the snapshot, the minted entity and its read grants all survive — which silently disarmed
  both the RLS re-check and the read-grant re-narrow, leaving the unscoped snapshot serving indefinitely.
  It now revokes read and holds.

  **A zero-row external query no longer destroys the snapshot.** Columns are derived from the returned
  rows, so an empty result built a surrogate-only shadow, dropped the canonical table and renamed that
  shell into its place — every subsequent read failing on a missing column while the refresh reported
  success. An empty result now refuses the rebuild and leaves the existing snapshot serving.

  **The refresher snapshots the statement the read path executes.** Reads resolve SQL through
  `GetPlatformSQL(PlatformKey)`; the refresher snapshotted the base `SQL`, so a query carrying a
  per-platform variant was materialized from a different statement than live serves.

  **`XACT_ABORT` no longer escapes onto the pooled connection.** The swap, recompute and dirty-group
  batches each set it ON and never restored it. SET options persist for the session, so unrelated requests
  handed the same physical connection inherited it — turning their recoverable statement-level errors into
  full transaction aborts, far from anything to do with materialization.

  **The DDL identifier guard no longer opens on its own failure.** `assertSafeObjectNames` throws on a
  tampered `SchemaName`, but the failure path then passed that same rejected name to the best-effort shadow
  cleanup, which interpolated it raw into `DROP TABLE`/`OBJECT_ID`. The cleanup now re-checks and declines.

  **Two analyzers that produced silently wrong rows.** A `UNION`/`EXCEPT`/`INTERSECT` parses to a single
  `select` root whose `groupby` and `columns` describe only the first branch, so a set operation yielded an
  aggregation key covering one branch and the incremental MERGE collided both branches on the same hash.
  And a row-filter predicate was bound to an output column by bare name, which cannot tell `o.Status` from
  `c.Status` across a join, nor an alias from the column it rebinds.

  **Missing manifest registrations.** Neither new `@RegisterClass` class was in the pre-built manifests, so
  a bundled MJAPI tree-shook both away: the refresh driver never resolved, nothing was ever refreshed, and
  `Status` stayed `Active` while the read paths served mint-time data forever.

  **Read-routing distinguishes a failed lookup from "not materialized".** Only three roles hold `CanRead`
  on `MJ: Materialized Results`, so a restricted user silently got live data for every materialized request
  while an admin got the snapshot. The live fallback is correct and unchanged; the silence was the defect.

  **Note on coverage.** The predicate-binding proof and the join-qualifier requirement are deliberately
  conservative and will refuse shapes that previously qualified: a row-filter query whose predicate or
  projection is unqualified across a join now stays live-only, and an aggregation over a join with an
  unqualified `GROUP BY` loses its incremental key and falls back to `FullRebuild`. Both refusals are
  logged with the specific reason. Falling back to live is always correct — but a query that silently gets
  slower is easier to diagnose knowing this changed.

- Updated dependencies [834f8d7]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [1fdd5d0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/sql-parser@6.1.0-edge.3
  - @memberjunction/sql-dialect@6.1.0-edge.3
