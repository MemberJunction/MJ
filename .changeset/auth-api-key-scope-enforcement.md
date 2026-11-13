---
"@memberjunction/server": patch
"@memberjunction/api-keys": patch
"@memberjunction/api-keys-base": patch
"@memberjunction/core": patch
"@memberjunction/integration-test-suite": patch
---

API-key scope checks fail closed and follow out-of-process changes. `CheckAPIKeyScopeAndLog` now enforces the application-active ceiling (shared decision path with `CheckAPIKeyScope`); `RESTEndpointHandler` normalizes its include/exclude lists to lowercase; `APIKeysEngineBase` re-reads its cached tables from the database every `scopeCacheTTLMs` (set by `APIKeyEngine`), so a scope removed or an application deactivated by another process stops granting within one TTL. `BaseEngine` expiry timers no longer keep a Node process alive.
