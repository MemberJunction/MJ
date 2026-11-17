---
"@memberjunction/open-app-engine": patch
---

An Open App's migrations now run with a 30-minute per-request timeout when none is configured, the same default as `mj migrate`. Before, the install used Skyway's 5-minute default, which a large data migration can exceed. `MJ_MIGRATION_REQUEST_TIMEOUT` (milliseconds) or `dbRequestTimeout` in mj.config.cjs still sets it.
