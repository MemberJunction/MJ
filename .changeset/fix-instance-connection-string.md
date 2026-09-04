---
"@memberjunction/sqlserver-dataprovider": patch
---

Fix InstanceConnectionString reading the private mssql `_config` member, which is a method in mssql v11+. Every `_config?.x` access returned undefined, so the getter degenerated to `mssql://localhost:1433/` for every connection. Anything keyed by this identity — most critically the shared Redis result caches (RunView/RunQuery/dataset) — collided across processes connected to entirely different databases, letting one process serve another process's cached rows. The getter now reads the public `config` property, restoring distinct per-connection identities.
