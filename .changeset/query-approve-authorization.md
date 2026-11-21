---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-dashboards": minor
---

Approving a query now needs the new `Queries: Approve` authorization, granted to the Developer and Integration roles. Any user can save a query as a draft (Pending): the UI role gets Create on `MJ: Queries` and `MJ: Query Categories`. The server refuses a save that would approve a query when the user doesn't hold the authorization. The Save Query dialog saves a draft for those users and offers "approve now" to holders, and the Query Browser no longer offers the Approved status to users who can't approve. New helpers: `UserCanApproveQueries`, `APPROVE_QUERIES_AUTHORIZATION`, and an optional `ApproverRule` on `ApplyApprovalRulesAsync`.
