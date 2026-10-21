---
"@memberjunction/core": patch
"@memberjunction/server": patch
---

Record-name lookups (`GetEntityRecordName` / `GetEntityRecordNames`) now bind primary-key values as SQL parameters, accept only the entity's primary-key fields as key names, and apply the acting user's read row filter (role RLS and API-key row filters). The GraphQL resolver no longer looks a name up without an acting user. The protected `DatabaseProviderBase.BuildEntityRecordNameSQL` now takes the acting user and returns the SQL together with its parameter values.
