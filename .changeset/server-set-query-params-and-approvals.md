---
"@memberjunction/core": patch
"@memberjunction/query-processor": patch
"@memberjunction/core-entities": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/integration-test-suite": patch
---

Server-set query parameters, `Context` in query templates, and fingerprint-bound approvals (#4789 A17). All opt-in: a query with no server-set parameter and no `Context`, run without `RequireApproved`, renders and runs exactly as before.

- **Server-set parameters.** `QueryParameterInfo.IsServerSet` mirrors the new column. `RunQueryParams.ServerParameters` carries values only server code sets; a caller value (`Parameters`) for a server-set parameter, for a name that reaches a composed query's server-set parameter, or for `Context` is refused with an error naming it, and logged. A required server-set parameter with no server value refuses the run. Server values are left out of `AppliedParameters`, bound in materialized reads, and never read from a GraphQL request. `SERVER_ONLY_RUN_QUERY_PARAMS` / `StripServerOnlyRunQueryParams` name `TimeZone` and `ServerParameters`.
- **`Context` in templates.** `{{ Context.UserID }}`, `UserEmail`, `UserName`, `Now`, `Today`, `StartOfWeek/Month/Quarter/Year`, worked out on the server from the context user, the clock and the run's `TimeZone` (UTC when unset), and only when the template reads them. Query extraction keeps no parameter row for `Context`.
- **Approvals.** Queries (`Status`), user views, dashboards and components (`ApprovalStatus`): a save that moves the status to Approved records the context user, the time and a fingerprint of the definition as stored (`ComputeQueryFingerprintAsync` and siblings in `@memberjunction/core-entities`); client values for those columns are ignored. `Get*ApprovalStateAsync` reports `Current`, `Stale` or `NotApproved`. New `MJDashboardEntityServer`. `RunQueryParams.RequireApproved` refuses a run unless the query, and each query it composes, has a current approval.
- **Caches.** The RunQuery result-cache fingerprint (the `CacheLocal` layer and the external-source cache) now covers `ServerParameters` and the `Context` values a query reads; a result that reads `Context.Now`, and a `RequireApproved` run, are never cached.
- Integration bundle `query-approvals` (IT120).
