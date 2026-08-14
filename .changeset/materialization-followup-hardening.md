---
"@memberjunction/codegen-lib": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/materialization": patch
"@memberjunction/global": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/ng-core-entity-forms": patch
---

Follow-up hardening for Query & Entity Materialization (#3735). Each item below fails toward doing the
wrong thing rather than doing nothing, so none of them surface as an error in normal operation.

**Row-restriction gates read both fence layers.** MJ enforces row restrictions in two AND-composed
layers — role RLS and API-key row filters — and the mint, drift and runtime Leak-1 gates each re-derived
a role-only predicate inline. An entity fenced *only* by an API-key row filter therefore read as
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
