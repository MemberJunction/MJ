---
"@memberjunction/core": minor
"@memberjunction/api-keys": minor
"@memberjunction/server": minor
"@memberjunction/ng-explorer-core": minor
---

Add built-in, dual-key, read-only-by-default Generic User Impersonation ("View As User...") across MJServer, MJCore, APIKeys, and MJ Explorer.

- **Server control plane & 6-layer fail-closed isolation (`@memberjunction/server`)**: Added `UserImpersonationResolver` (`MJCanImpersonateUsers`, `MJListImpersonatableUsers`, `MJStartUserImpersonation`, `MJEndUserImpersonation`), `impersonationGuard` (Apollo plugin, `graphql-ws` `onSubscribe`/`execute`/`subscribe` guards, default-deny Express HTTP guard, `PreRunView`/`PostRunView`/`PreSave`/`PreDelete` DataHooks, request-scoped `AsyncLocalStorage`, reserved `MJ-Impersonation:` API key field protection), `@RefuseImpersonationSessions()` decorator guards on side-effecting resolvers, saved-query composition inspection, and `userImpersonation` configuration units (strictly off by default everywhere).
- **Single-lookup API key validation & audit attribution (`@memberjunction/api-keys`, `@memberjunction/core`)**: Extended `APIKeyValidationResult` to return the validated `MJAPIKeyEntity` so `MJServer` avoids a redundant DB lookup, added actor attribution on `MJ: Record Changes` and `MJ: Audit Logs` during `ActAs` writes, and added `UserInfo.CloneForSession()` to prevent mutating shared cached user objects.
- **Explorer UI & adapter extension point (`@memberjunction/ng-explorer-core`)**: Added `MJUserImpersonationService`, `"View As User..."` avatar menu action, pinned impersonation banner, target picker dialog, `MJImpersonationAppAdapter` extensibility, `LocalCacheManager.ClearAll()` cache clearing on session transitions, and read-only `UserInfoEngine` write suppression.
