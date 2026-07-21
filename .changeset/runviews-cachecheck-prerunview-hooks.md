---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
---

Run registered PreRunView data hooks on the `RunViewsWithCacheCheck` path (engaged by `CacheLocal` RunViews and directly invokable by clients over GraphQL). It previously executed via `buildWhereClauseForCacheCheck` / `InternalRunView` without applying the hooks, silently skipping the scoping filters server middleware injects into `ExtraFilter` — so a deployment relying on a PreRunView hook had that scoping bypassed for cache-check reads (RLS, applied deeper, was unaffected). Hooks now run once per item, before the cache-currency WHERE clause and every execution leg, so the currency check and returned rows match the hooked non-cached path. `ProviderBase.RunPreRunViewHooks` is made `protected` (from `private`) for this sibling pipeline. `RunQueriesWithCacheCheck` is deliberately untouched — there is no `PreRunQuery` hook seam.
