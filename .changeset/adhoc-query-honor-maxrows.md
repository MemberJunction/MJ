---
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
---

Fix `ExecuteAdhocQuery` to honor `MaxRows` and `StartRow` end-to-end. Previously the client's `RunAdhocQuery` accepted `maxRows` as a function argument but silently dropped it from the GraphQL request payload, and the server's `AdhocQueryInput` schema didn't declare the field — so callers (including the data artifact viewer's live re-execution) had no way to cap the recordset and every ad-hoc query returned the full underlying result set. `AdhocQueryInput` now exposes `MaxRows` and `StartRow`. When provided and the SQL doesn't begin with a `WITH` clause, the resolver wraps the query as `SELECT TOP (startRow + maxRows) * FROM (<sql>) AS _adhoc_capped` so the SQL engine can short-circuit at the source instead of scanning the full result. In-memory pagination still applies as a fallback (CTE-headed SQL, page > 1 carve-out) and ensures `RowCount` / `TotalRowCount` reflect the returned page correctly.
