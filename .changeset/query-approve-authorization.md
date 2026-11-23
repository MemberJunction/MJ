---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/integration-test-suite": minor
---

Approving a query now needs the new `Queries: Approve` authorization, granted to the Developer and Integration roles. Any user can save a query as a draft (Pending): the UI role gets Create on `MJ: Queries` and `MJ: Query Categories`. The server refuses a save that would approve a query when the user doesn't hold the authorization. The Save Query dialog saves a draft for those users and offers "approve now" to holders, and the Query Browser offers the Approved status only to users who can approve, or for a query that was Approved when the drawer opened.

A draft (any status but Approved) is now refused at run when an entity it reads is row-filtered for the running user (a role or API-key row filter, or an entity confined by RunView's server hooks), the same rule ad-hoc SQL follows. A query with `MJ: Query Permissions` rows, and an Approved query, run as before. New helpers: `UserCanApproveQueries`, `APPROVE_QUERIES_AUTHORIZATION`, `QUERY_APPROVAL_REFUSAL`, `RenderedSQLCheckResult.rowFilteredEntities`, and an optional `ApproverRule` on `ApplyApprovalRulesAsync`.
