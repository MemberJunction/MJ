---
"@memberjunction/core": minor
"@memberjunction/lists-base": minor
"@memberjunction/lists": minor
"@memberjunction/core-actions": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-list-management": minor
"@memberjunction/testing-integration": minor
"@memberjunction/integration-test-suite": minor
---

Lists made in a conversation now keep themselves current.

- `ListOperations.MaterializeFromQuery` creates a list from a saved query's rows, linked to the query with its parameters, key column, refresh mode and current fingerprint; `CreateListFromRecords` creates a list with no source.
- `ListFromQuery` (shared by the action and the mutation) links a list to a saved query, or saves SQL written in a conversation as a Pending query in the user's own "User Lists" query category and links the list to it. When the user can't save queries, the list is still made and says why it won't refresh. `UserListQueries` does the saving.
- New action **Create List From Query**, added to the Lists & Audiences skill with instructions on when to offer a list and what to ask. SQL gets the same checks as Run Ad-hoc Query; those checks now live in a shared `CheckAdhocSQL`.
- New GraphQL mutation `CreateListFromQuery` (client: `GraphQLListsClient.CreateListFromQuery`), with the ExecuteAdhocQuery checks for SQL.
- The Data artifact has a **Save as List** button, offered when the result's rows are records.
- The list form's source badge reads "Definition unchanged" (it said "Matches approved version", which read as the query's own approval when the query is Pending).
- New "User Lists" query category in core metadata.
- Integration bundle IT176 (`list-from-query`).
