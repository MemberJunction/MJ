---
"@memberjunction/integration-test-suite": patch
---

Adds a schema-mutating test rig (`rigs/schema-mutating/`). It creates a private database, runs `mj migrate`, `mj sync push --dir=metadata` and `mj codegen --skipfiles` on it, runs field-level security reconciliation scenarios that add columns, a foreign key and view columns, narrow a custom view, and run CodeGen after each, and drops the database. A nightly CI job runs it.
