---
"@memberjunction/sqlserver-dataprovider": patch
---

`TransactionGroup` submits its items in one round trip instead of one per item.

`HandleSubmit` opened one transaction and then sent its items one at a time, awaiting each — atomicity without batching. N items cost N round trips, and on a high-latency link the round trip IS the write ceiling: SQL execution measures in single-digit milliseconds while the trip costs tens.

The statements were already built for this. `RenderSaveCallBinding` emits every save as `DECLARE @Field_<uuid8>; SET …; EXEC spCreateX @Field=@Field_<uuid8>`, and its own doc says the uuid suffix exists "to keep batched saves (`SQLServerTransactionGroup`) collision-free". The submit simply never concatenated them.

Nothing about the SQL changes: the same generated CRUD procedures run, the same Record Changes rows are written, the same save events fire. Only the number of trips changes — which is what separates this from writing rows directly, where the speed comes from *not* calling the procedures and the cost is every one of those side effects (including the cache-invalidation events that `TrustLocalCacheCompletely` is justified on).

Measured against SQL Server 2022 with the entity procedure and its Record Change writes running per row, at a modelled 25ms RTT: **211 rows/min** sent per statement, **131,713 rows/min** at 100 items per trip. DB cost per row stayed flat as the group grew (2.79 → 2.52 ms), so the compile-bound wall that punishes very large literal batches is not reached at these sizes.

Two details that batching gets wrong if written casually, both handled:

- **Parameters are renumbered across items** into one `@p<n>` sequence. One request carries one parameter namespace, so two items that each rendered `@p0` would otherwise bind each other's values.
- **Results are split by per-item sentinels, never zipped positionally.** An item can return no result set at all — verified against the driver, where a three-item batch whose middle item matched no rows came back as five result sets, not six — so positional mapping would hand one item another's rows.

Behaviour change worth stating: serially, the client stopped *sending* after the first failure. Batched, the statements travel together and the server may reach some of them before the error. The guarantee that matters is unchanged — the transaction rolls back, nothing commits, and every item reports failure.

The `Variables` path, where items genuinely depend on each other's results, stays serial by construction.

PostgreSQL keeps its serial submit for now: its extended protocol permits only one statement per parameterized query, so the equivalent needs a grouped single-statement form rather than concatenation. Tracked as the follow-up.
