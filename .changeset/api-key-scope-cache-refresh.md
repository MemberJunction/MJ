---
"@memberjunction/api-keys": patch
"@memberjunction/api-keys-base": patch
"@memberjunction/core": patch
"@memberjunction/integration-test-suite": patch
---

API-key scope, application and key-binding rows are re-read from the database every `scopeCacheTTLMs` (default 60 s), so a scope removed or an application deactivated by another process stops granting within one TTL instead of at restart. A `BaseEngine` expiry tick now reads the database instead of the server cache, a failed tick re-arms the timer instead of ending the refresh, a failed first load still starts it, setting the interval to 0 stops it, and expiry timers no longer keep a Node process alive.
