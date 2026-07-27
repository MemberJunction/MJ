---
"@memberjunction/generic-database-provider": patch
"@memberjunction/integration-engine": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/core": patch
---

perf(core): stop paying for a speculative `COUNT(*)` on reads nobody counts

`RunView` decided whether to run its `COUNT(*)` in two places. Up front, when the caller paginated or asked for `ResultType: 'count_only'`, the count was issued in the same parallel batch as the data query — one round trip. After the fact, if neither applied, it fired a **second, serial** `COUNT(*)` over the whole filtered view whenever the returned rows happened to fill the page:

```ts
const maxRowsUsed = params.MaxRows || entityInfo.UserViewMaxRows;
} else if (countSQL && maxRowsUsed && retData.length === maxRowsUsed) { … }
```

`maxRowsUsed` falls back to `UserViewMaxRows` (1000 by default), so that condition is met by every batch of any bulk read — and the resulting number was then discarded, because the callers that read `TotalRowCount` are pagination-aware and already took the first branch. It was a full extra scan, after the data had already returned, paid for on roughly every full page product-wide.

That fallback is removed. The count is now issued only when it is genuinely needed: OFFSET pagination, `ResultType: 'count_only'`, or the new explicit `RunViewParams.ReturnTotalRowCount` opt-in — which routes into the up-front branch and is therefore issued in parallel with the data query rather than after it. `ReturnTotalRowCount` also participates in the params fingerprint, so a cached result from a run that did not compute the total cannot satisfy one that asked for it.

**This narrows what `TotalRowCount` means.** It was previously the true total whenever a read came back exactly at its cap, and the row count otherwise; it is now the row count unless the caller paginates, uses `count_only`, or opts in. The idiom `TotalRowCount ?? Results.length` is therefore no longer a safe way to get a true total on a capped read. Two callers relying on the old behaviour are fixed here:

- **`IntegrationEngine.pruneOldRunHistory`** reads the `keep` most-recent runs and prunes when the total exceeds `keep`. A capped read returns exactly `keep` rows whenever a backlog exists, so without an opt-in the guard reads `keep <= keep`, returns early every time, and run/detail history grows forever while appearing bounded. It now passes `ReturnTotalRowCount: true`.
- **The Integration dashboard's destination record count** fetched primary-key rows and fell back to `Results.length`, capping the displayed count at `UserViewMaxRows`. It now uses `ResultType: 'count_only'`, which returns no rows at all — both correct and the cheapest form of the query.

`ReturnTotalRowCount` is deliberately not plumbed through GraphQL in this change; the server-side callers that need it construct `RunViewParams` directly, and widening the wire contract is a separable decision.
