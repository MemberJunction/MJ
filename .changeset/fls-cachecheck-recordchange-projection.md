---
"@memberjunction/generic-database-provider": patch
---

Fix denied field values leaking in `ChangesJSON` / `FullRecordJSON` through the smart-cache-check transport.

`RunViewsWithCacheCheck` returns rows through legs — serve-from-cache, full query, differential — that never traverse `PostRunView`, so it has to redo `PostRunView`'s output projections itself. `PostRunView` runs **two**, as a pair (`providerBase.ts:3698-3699`), and every one of its four projection points calls both. This transport replicated only the first.

The omission was invisible to the existing coverage, and to column stripping generally. `ApplyFieldSecurityProjection` short-circuits on the RunView entity's own `EnableFieldLevelSecurity`, and `MJ: Record Changes` has that flag off by design — so on exactly the rows that matter it is a no-op. The denied values are *inside* the `ChangesJSON` and `FullRecordJSON` payload columns, which stripping a column list never reaches. `ApplyRecordChangeFieldSecurityProjection` is the sibling that projects those payloads against the entity each row is *about*, and it was never called on this path.

Reachable from a browser. The transport is selected when `params.some(p => p.CacheLocal)` — *some*, not every — so a Record Changes view batched alongside any cache-local view rides onto it. With `Salary` read-denied for a role, a user in that role could open a surface batching those two views and receive `ChangesJSON` containing `{"Salary":{"oldValue":100000,"newValue":120000}}` — the audit-trail leak `recordChangeFieldSecurity.ts` exists to close.

Both projections now run, in `PostRunView`'s order, on both the full-results leg and the differential `updatedRows` leg. New tests pin that both are invoked, in order, and that each one's return value is threaded into what the caller receives — "called but the result discarded" fails as silently as "never called".

Reported by @rkihm-BC in review of #3367.
