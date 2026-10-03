---
"@memberjunction/integration-engine": patch
---

The discovery run deadline — the outermost bound, and the only one that can fail a whole run — is configurable per connection and defaults to 12 hours. Resolution order is the explicit `RunDeadlineMs` argument, then the connection's `Configuration.runDeadlineMs`, then `MJ_INTEGRATION_RUN_DEADLINE_MS`, then the default; `0` disables the ceiling, and a negative, non-numeric or malformed value falls through rather than disabling it. The default was 45 minutes, which failed large catalogs mid-introspection and discarded everything gathered; the ceiling exists to release a run that has hung, not to bound one that is merely big.
