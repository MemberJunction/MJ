---
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
---

Fix `ExecuteAdhocQuery` to honor `MaxRows` and `StartRow` end-to-end. Previously the client's `RunAdhocQuery` accepted `maxRows` as a function argument but silently dropped it from the GraphQL request payload, and the server's `AdhocQueryInput` schema didn't declare the field — so callers (including the data artifact viewer's live re-execution) had no way to cap the recordset and every ad-hoc query returned the full underlying result set. `AdhocQueryInput` now exposes `MaxRows` and `StartRow`; the resolver applies in-memory pagination after raw SQL execution and returns `RowCount = paginated.length` with `TotalRowCount = full recordset length`.
