---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/integration-test-suite": minor
---

Approving a query now needs the new `Queries: Approve` authorization, granted to the Developer and Integration roles. Any user can save a query as a draft (Pending): the UI role gets Create on `MJ: Queries` and `MJ: Query Categories`. The server refuses a save that would approve a query when the user doesn't hold the authorization. The Save Query dialog saves a draft for those users and offers "approve now" to holders, and the Query Browser offers the Approved status only to users who can approve, or for a query that was Approved when the drawer opened.

A draft (any status but Approved) run by a user who doesn't hold `Queries: Approve` must now pass the same statement screen as ad-hoc SQL, on its rendered SQL: one read statement, reading only entity base views that user reads unscoped (no row or API-key filter, no denied field, not confined by RunView's server hooks). Base tables, system catalogs, other relations and SQL the screen can't account for are refused. Approved queries, queries with `MJ: Query Permissions` rows, and holders of the authorization are not screened, unless the holder's session carries an API-key row filter. A cache check now uses a query's `CacheValidationSQL` only when the query is Approved; a draft gets fresh rows from its screened run (`no_validation`). Saving `CacheValidationSQL` needs `Queries: Approve`. A query saved by a user who can't update queries no longer logs an error when its fingerprint can't be stamped. New helpers: `UserCanApproveQueries`, `APPROVE_QUERIES_AUTHORIZATION`, `QUERY_APPROVAL_REFUSAL`, `QUERY_VALIDATION_SQL_REFUSAL`, and an optional `ApproverRule` on `ApplyApprovalRulesAsync`.
