---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/server": patch
---

Optimize MJServer per-request context initialization, cross-instance cache invalidation, O(1) user auth lookups, and long-lived server memory retention:

- **Zero-allocation lazy per-request `ProviderInfo` + synchronous global metadata config (`@memberjunction/core`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/server`)**: Avoid eager per-request `SQLServerDataProvider` construction and `Promise.all` async metadata configuration on warm GraphQL requests via `ConfigureFromGlobalSync`, pool-level resolved view column order sharing, and automatic `DetachInvalidationListeners()` cleanup on HTTP response close.
- **Origin session stamping & cross-instance entity invalidation (`@memberjunction/server`)**: Propagate `sessionId` via `AsyncLocalStorage` + `WeakMap` provider stamping (`ResolveOriginSessionId`) so browser self-echo suppression works for mutations executed outside `ResolverBase`, suppress read-only `Action: 'set'` cache-populate browser storms, and broadcast entity save/delete events across horizontal MJServer instances over `'entity-cache-invalidation'`.
- **O(1) `UserCache` email/ID indexes (`@memberjunction/generic-database-provider`, `@memberjunction/server`)**: Index users by normalized email and UUID with deterministic duplicate-email ordering and blank-email diagnostics so every authenticated request resolves its `UserInfo` in `O(1)`.
- **Eliminate `GetDataResolver` & `ResolverBase` memory leaks (`@memberjunction/server`)**: Store lightweight query summary stats (capped at 100 entries per token) instead of retaining multi-MB SQL result sets in `GetDataResolver` token history, and consolidate ~455 per-subclass `MJGlobal` entity event subscriptions into a single shared process-wide listener with TTL cleanup.
