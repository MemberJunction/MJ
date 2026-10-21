---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/core-entities": patch
"@memberjunction/server-extensions-core": patch
"@memberjunction/server": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-explorer-core": patch
---

Review follow-ups to the multi-provider / cache / CORS / deep-link fixes:

- `QueryFieldInfo.QueryInfo` matches the parent query by `QueryID` (it compared the field's own ID and always returned undefined). Query Info getters no longer throw when no provider is bound.
- The IS-A SubtypeSelector lookup memo is partitioned per provider, so one provider never receives a row (or a miss) recorded through another.
- Entity `Save()`/`Delete()` and transaction groups clear only their own entities' RunView dedup-linger entries (`ExecuteGQL` takes `{ AffectedEntityNames }`). Other mutations still clear everything. `IsGraphQLMutation` reads only top-level tokens, so a fragment field named `query` can no longer hide a mutation. A failed coalesced RunView no longer evicts a newer request's entry.
- A host `serverExtensions[]` entry may be a partial overlay: only `DriverClass` is required. An overlay without `Enabled` inherits the published value; a host-only entry without it is enabled.
- Explorer: a startup deep link waits for the app list before it is resolved. A permission-constrained magic-link session gets its scoped app (plus default apps when access can be judged) instead of "No Applications Available". Workspace saves run one at a time, and a save that lands after the page unloads no longer wins over newer journaled changes. A brand-new user's first boot also runs the deep-link hook.
- `UserInfoEngine.UserFavorites`, `NotificationPreferences` and `NotificationTypes` read empty for a session that cannot read them.
