---
"@memberjunction/core": minor
"@memberjunction/lists-base": minor
"@memberjunction/lists": minor
"@memberjunction/core-actions": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-list-management": minor
"@memberjunction/conversations-runtime": minor
"@memberjunction/testing-integration": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Lists made in a conversation now keep themselves current.

- `ListOperations.MaterializeFromQuery` creates a list from a saved query's rows, linked to the query with its parameters, key column, refresh mode and current fingerprint; `CreateListFromRecords` creates a list with no source.
- `ListFromQuery` (shared by the action and the mutation) links a list to a saved query, or saves SQL written in a conversation as a Pending query in the user's own "User Lists" query category and links the list to it. When the user can't save queries, the list is still made and says why it won't refresh. When no list comes of a query just saved, the query is deleted. `UserListQueries` does the saving, without embeddings.
- Saved-query discoverability follows status: Approved queries are canon, Pending ones are drafts that still run (so a list refreshes from one) but are not offered on shared surfaces. The Query Builder's `ALL_QUERIES` data source is now Approved only and no longer retrieves SQL, and `#query` mentions offer Approved queries only. This is a discovery boundary, not access control: every run is still bounded by the user's entity permissions and field-level security.
- New action **Create List From Query**, added to the Lists & Audiences skill with instructions on when to offer a list and what to ask. SQL gets the same checks as Run Ad-hoc Query; those checks now live in a shared `CheckAdhocSQL`.
- New GraphQL mutation `CreateListFromQuery` (client: `GraphQLListsClient.CreateListFromQuery`), with the ExecuteAdhocQuery checks for SQL.
- The Data artifact has a **Save as List** button, offered when the result's rows are records.
- The list form's source badge reads "Definition unchanged" (it said "Matches approved version", which read as the query's own approval when the query is Pending).
- New "User Lists" query category in core metadata.
- Integration bundle IT179 (`list-from-query`).
