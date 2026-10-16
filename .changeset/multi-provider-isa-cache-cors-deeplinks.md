---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/core-entities": patch
"@memberjunction/server-extensions-core": patch
"@memberjunction/server": patch
"@memberjunction/ng-notifications": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-explorer-core": patch
---

Five fixes found while building and testing the BizApps Voting Open App:

- **IS-A lookups and other Info-class lookups now use the entity's own provider.** Info objects keep the provider that built them (`BaseInfo.OwningProvider`). `EntityInfo.ChildEntities` / `ParentEntityInfo`, RLS filter lookups, `QueryInfo` sibling getters and `AuthorizationInfo.Roles` resolve through that provider and fall back to the global one only when there is none. `EnsureISAChild` no longer throws "not a declared IsA child entity" in a process with several providers and no global provider. The constructors take an optional provider, so existing callers still compile.
- **Server-side writes clear the client's RunView dedup-linger cache.** There is a new `ProviderBase.InvalidateRunViewDedupCache(entityNames?)`. `RouteOperation` calls it after every Remote Operation, and the GraphQL client calls it after every mutation (Actions, agent runs and saves included). Both run on failure too. An identical RunView no longer returns pre-operation rows for up to 5 s.
- **Server extensions can own CORS.** A new `OwnsCORS` option on a server extension config makes global CORS skip that extension's `RootPath`, so the extension's own origin policy and `OPTIONS` handler apply. `X-Powered-By` is now disabled app-wide.
- **Explorer deep links beat the saved workspace on a full load.** When the URL carries query params for an open tab, they replace that tab's saved params. Workspace changes are also written to localStorage synchronously and flushed on `pagehide` / `visibilitychange`, so a quick refresh no longer comes back one step behind.
- **Magic-link sessions no longer get an uncaught `PermissionConstrainedError` at boot.** `UserInfoEngine` adds `UserNotificationsIfPermitted`, and `GetSetting` returns "not set" for a user who can't read settings. It logs once per property. Notifications and `ApplicationManager` use the safe paths.
