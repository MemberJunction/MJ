---
"@memberjunction/cli": patch
---

Defer the DB-provider import in the MJCLI `postrun` hook so light commands no longer eagerly load the sqlserver-dataprovider/metadata-sync/core stack (~2.7s warm, far more cold). The import is now gated on `app:*` commands (the only ones that open a connection pool), fixing the deterministic `claude-pack` subprocess test spawn-timeout that was failing the unit-test CI gate on every PR.
