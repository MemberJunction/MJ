---
"@memberjunction/integration-engine": patch
---

Fix (MJ#3047): quote the primary-key identifier in the content-hash prefetch filter so an integration object whose PK column name is a SQL reserved word (e.g. Zendesk `custom_objects.key`) no longer silently loses idempotency.

`IntegrationEngine.PrefetchContentHashes` built its bulk stored-hash lookup as `WHERE key IN (…)` with the PK identifier unquoted. For a reserved-word PK the database rejects the query; because the prefetch is best-effort it swallows the error and returns nothing, so the content-hash idempotent-skip fast path can never engage — every unchanged record is re-written on each sync (inflated `RecordsUpdated`, redundant writes). The filter now quotes the PK identifier(s) **and** value literals through the provider's dialect (`DatabaseProviderBase.Dialect` → `[key]` on SQL Server, `"key"` on PostgreSQL), so it is valid on both targets without reintroducing the SS-brackets-break-Postgres problem the previous unquoted form was guarding against. Filter construction is extracted to a pure `buildContentHashPrefetchFilter` helper with unit tests covering reserved-word single + composite PKs on both dialects.
