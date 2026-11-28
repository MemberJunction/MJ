---
"@memberjunction/ng-base-application": patch
"@memberjunction/graphql-dataprovider": patch
---

Save workspace layouts with `SkipOldValuesCheck`, so a layout row changed elsewhere (another tab or device, or a save whose response was lost to a dropped connection) no longer refuses every later layout save until a page reload, each refusal writing an `MJ: Error Logs` row. The last layout saved wins, as before MJ 6.2. `GraphQLDataProvider.Save` now reports a field-level concurrency refusal on `LatestResult.ConcurrencyConflict`, as server-side saves do.
