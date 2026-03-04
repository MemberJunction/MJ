---
"@memberjunction/cli": patch
---

Add configurable migration request timeout via `dbRequestTimeout` in mj.config.cjs and `MJ_MIGRATION_REQUEST_TIMEOUT` environment variable. Passes `RequestTimeout` through to Skyway-Core's database connection options, allowing long-running migrations (e.g., large index builds) to complete without hitting the default 5-minute timeout.
