---
"@memberjunction/cli": patch
---

`mj migrate` no longer skips migrations when upgrading a database from a release line. The remote fetch (`--tag` or the install-pinned version) now selects every versioned migration the database has not applied and that lies above its highest baseline row, instead of only files newer than the highest applied version. When core migrations are pending that are older than the database's newest applied migration, and `mj.config.cjs` does not set `outOfOrder`, `mj migrate` enables `outOfOrder` for that run and logs each such file. An explicit `outOfOrder` setting is honoured as written.
