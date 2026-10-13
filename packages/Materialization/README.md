# @memberjunction/materialization

Runtime engine that refreshes **materialized** query and entity-base-view results in MemberJunction. A materialization is a physical, read-only snapshot of a stored Query's result (or an entity's base view), served through a stable wrapper view so reads can opt in with `DataSource: 'Materialized'` and fall back to `Live` on any uncertainty.

This package owns the **refresh** side of that lifecycle. Provisioning (minting the snapshot table, wrapper view, and metadata) is a CodeGen concern; reading (the `DataSource` redirect) lives in `@memberjunction/generic-database-provider`.

## What it does

- **`MaterializationRefresher`** — rebuilds a snapshot and swaps it into place atomically:
  - **Full rebuild** — builds a fresh *shadow* table from the source (the expensive read happens outside any transaction), then swaps it into the canonical name inside a single transaction (drop → rename → repoint the wrapper view → restore the surrogate index). SQL Server uses `SET XACT_ABORT ON` + `sp_rename` + `EXEC('CREATE OR ALTER VIEW …')`; PostgreSQL keeps the `CREATE OR REPLACE VIEW` repoint *inside* the transaction. Either way a reader sees the whole old snapshot or the whole new one — never a half-swapped view.
  - **Incremental / dirty-group merge** — for keyed/aggregation materializations, applies only the changed groups against a watermark, with a periodic forced full rebuild (`FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES`) to reconcile balanced-delete drift.
  - **External-source rebuild** — parameterized, bound-value inserts for materializations sourced from external data providers.
  - Persists `Status`/`RowCount`/`LastRefreshedAt`/`NextRefreshAt` via guarded conditional updates that never clobber a concurrent `DriftHold`/`Disabled`.
- **`MaterializationFreshness`** — helpers for reasoning about whether a snapshot is current.

All statement builders are **pure and unit-tested**; the identifiers they interpolate are validated as plain SQL identifiers before any DDL is built (a materialization's names come from the writable `MJ: Materialized Results` row, so this fails closed against a tampered row driving arbitrary DDL). Live-DB behavior is covered by the integration tier.

## Usage

The engine is normally driven by the scheduled-job refresh driver (`MaterializationRefreshScheduledJobDriver` in `@memberjunction/scheduling-engine`); a manual "refresh now" path can call it directly:

```typescript
import { MaterializationRefresher } from '@memberjunction/materialization';

const refresher = new MaterializationRefresher();
const result = await refresher.RefreshOne(materializedResult, contextUser, provider);
if (!result.Success) {
  // result.ErrorMessage carries the reason; the row is left in a safe state.
}
```

`RefreshOne` returns a structured result rather than throwing — errors are logged and reported, and a row held for review (`DriftHold`) or `Disabled` is refused rather than silently reactivated.

## Related

- `@memberjunction/generic-database-provider` — the `DataSource: 'Materialized'` read redirect and the materialized read-query builder.
- `@memberjunction/codegen-lib` — materialization provisioning (mint), parameterized-query classification, and drift detection.
- `@memberjunction/scheduling-engine` — the scheduled refresh driver.
