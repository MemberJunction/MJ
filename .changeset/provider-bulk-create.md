---
"@memberjunction/core": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/integration-engine": minor
---

`BulkCreate` — a provider capability for set-based entity inserts, and the integration engine's opt-in that uses it. The base implementation on `DatabaseProviderBase` is a straight loop over `Save()` (identical semantics: validation, stored procedures, Record Changes, cache events), so every provider supports the method from day one. SQL Server overrides with a TDS bulk insert; PostgreSQL with multi-row parameterized INSERTs chunked under the 65,535-bind-parameter wire limit — both all-or-nothing in one transaction, both refusing (falling back to the base loop) when the set is ineligible: mixed entity types, an already-saved entity, or a missing client-side primary key. What a set-based path deliberately does not do — no sproc side effects, no Record Changes rows, no per-entity save events — is why it is never used implicitly.

The integration engine's sync gains `Configuration.writeMode: 'bulk'` (per connection, default off — nothing changes for existing tenants): NEW records whose mapped fields carry the full primary key are built through the same per-record machinery as ever (field coercion, value-fit enforcement, standard integration fields, pre-write validation) and inserted as one `BulkCreate` per batch; updates, deletes, skips, server-assigned-PK creates, and — on any bulk failure — the whole set continue down the unchanged per-record path, where failure isolation lives. A PK collision is therefore not a special case: the bulk write fails whole and the per-record upsert resolves each record correctly. Record maps ride the same batched flush; the watermark still advances only after the whole batch is applied. On a high-latency link this is the difference between hundreds and tens of thousands of created rows per minute — the write-side counterpart of the fetch-side fixes.
