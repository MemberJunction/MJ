---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
---

Record names now respect field-level security on every server-side lookup, and servers no longer keep a record-name cache shared across users (#4298).

- **Server lookups apply field-level security.** `DatabaseProviderBase.InternalGetEntityRecordName(s)` withholds a record's name, without querying, when any field the name is built from is read-denied to the acting user. With no acting user, names on an entity with field-level security on are withheld. Before, only the `GetEntityRecordName` GraphQL resolver checked, and it checked only one name field, so search-result names (`SearchEnricher`) showed a denied name to a restricted user.
- **`ProviderBase` no longer caches record names.** On a server that cache was shared by every user in the process, so a name one user was allowed to see could be served from memory to a user who was not. `GetEntityRecordName(s)` now always looks up, `GetCachedRecordNameOnlyIfCached` and `HasCachedRecordName` answer "not cached", and `SetCachedRecordName` is ignored.
- **`GraphQLDataProvider` keeps the cache**, through the new `EntityRecordNameCache` class, so Explorer's tab titles, breadcrumbs and navigation labels behave as before. A GraphQL connection is answered as one user, so its cache cannot cross users.
- **`EntityRecordNameResolver`** relies on the provider's check instead of its own, and reports a withheld name with the same status as a missing record.

Server code that relied on `GetCachedRecordNameOnlyIfCached` returning a name will now get `undefined`; no MJ server code does.
