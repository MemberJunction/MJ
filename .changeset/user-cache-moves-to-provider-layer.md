---
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/cli": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/core-actions": patch
"@memberjunction/actions": patch
"@memberjunction/action-runtime": patch
"@memberjunction/a2aserver": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/messaging-adapters": patch
"@memberjunction/notifications": patch
"@memberjunction/query-gen": patch
"@memberjunction/react-test-harness": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/testing-integration": patch
"@memberjunction/testing-cli": patch
---

**BREAKING — `UserCache` moved packages. Update the import, not just the call.**

`UserCache` now lives in `@memberjunction/generic-database-provider`. It is no longer exported
from `@memberjunction/sqlserver-dataprovider`, and there is deliberately **no re-export shim**,
so every import of the symbol must be repointed or it will fail to resolve:

```diff
- import { UserCache } from '@memberjunction/sqlserver-dataprovider';
+ import { UserCache } from '@memberjunction/generic-database-provider';
```

`Refresh` is now dialect-neutral and takes the configured provider rather than an
`mssql.ConnectionPool`:

```diff
- await UserCache.Instance.Refresh(pool, intervalMs);
+ await UserCache.Instance.Refresh(provider, intervalMs);
```

**These are two separate breaks, and the first is much wider than the second.** The import path
affects *every* consumer of the symbol — reads included. The signature affects only the handful
of callers of `Refresh`. Anything that imports `UserCache` merely to call `Users`,
`GetSystemUser()` or `UserByName()` still has to change its import, so a consumer who reads only
"the signature changed" will treat this as a no-op and fail to build. In this repo the split was
56 files versus 9 call sites.

Packages that import `UserCache` must also declare `@memberjunction/generic-database-provider`
as a dependency — pnpm resolves strictly, so an undeclared import fails rather than falling
through to a hoisted copy.

**Unchanged:** the read surface (`Users`, `GetSystemUser`, `UserByName`, `SYSTEM_USER_ID`), and
the class name. The name is load-bearing — `BaseSingleton` keys its global store on the
constructor name, so keeping it `UserCache` preserves singleton identity across the move.

**Also fixed:** `_users` now initializes to `[]`. It previously stayed `undefined` after a
`Refresh` that never ran or that failed (failures are swallowed into `LogError`), so
`GetSystemUser()` threw a `TypeError` off `.find()` instead of returning `undefined` as its
callers already assume.

**Why:** the cache was dialect-neutral except for that one `mssql` type, which left PostgreSQL
with no user cache at all and produced four separate hand-rolled "read `vwUsers` + `vwUserRoles`,
build `UserInfo[]`" implementations — one of which reached into the singleton's private field
through a cast from another package. Those are all removed, and a PostgreSQL process that never
goes through the server bootstrap now has a system user.
