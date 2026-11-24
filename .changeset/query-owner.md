---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/server": minor
"@memberjunction/integration-test-suite": minor
---

Every query now has an owner: `MJ: Queries` gets a required `OwnerUserID` that references `MJ: Users`. The migration fills it from the Create row in Record Changes, or the system user when none was recorded. The server sets the owner of a new query to the user saving it (a holder of `Queries: Approve` may name another owner), and only a holder may change an existing query's owner. The UI role gets Update and Delete on `MJ: Queries`, and a new row-level-security filter, "UI: Own Queries", limits its Create, Update and Delete to queries the user owns, so a user can now fix or delete their own drafts. A change to an Approved query's definition (its SQL, template flag or external source) by a user who doesn't hold `Queries: Approve` saves the query as Pending. The Query Browser shows edit buttons only on queries the user may edit, and the bulk refreshes only to users whose Update no row filter narrows. New helpers: `QUERY_DEFINITION_FIELD_NAMES` and `QUERY_OWNER_REFUSAL`.
