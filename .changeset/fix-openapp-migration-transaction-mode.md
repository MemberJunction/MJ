---
'@memberjunction/open-app-engine': patch
---

Open App migrations run per-migration by default, and the mode is now selectable

`RunAppMigrations` built its Skyway config without ever setting `TransactionMode`, and the
option was declared only on the module's internal Skyway config shape — never on the public
`MigrationRunOptions`. No caller could select a mode, so Open App installs always fell
through to Skyway's `per-run` default: one transaction wrapping the entire pending set.

Two changes:

- `MigrationRunOptions` accepts `TransactionMode?: 'per-run' | 'per-migration'`, threaded onto
  the config handed to Skyway.
- The default is now **`per-migration`** — each migration file runs and commits in its own
  transaction. `per-run` remains available opt-in.

This aligns app installs with `mj migrate`, which MJCLI already defaults to `per-migration`;
the two paths previously had silently different transaction semantics.

The reason the default matters: `per-run` cannot host every valid migration set. SQL Server
cannot create a table type and instantiate a variable of that type in the same transaction —
the `CREATE TYPE` holds a schema-modification lock while TVP instantiation, which runs in a
nested system transaction that does not share the session's lock ownership, requests
schema-stability on the same type, so the session deadlocks against itself (error 1205).
Minimal reproduction, no MemberJunction involved:

```sql
BEGIN TRAN;
    CREATE TYPE dbo.IDList AS TABLE (ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY);
GO
    DECLARE @ids dbo.IDList;   -- Msg 1205
GO
COMMIT;
```

On a from-zero install every migration is pending, so under `per-run` the whole app is one
transaction and no arrangement of migration files avoids this — making a table type, a
standard T-SQL construct, impossible to ship. It surfaces only on a clean install, never on an
incremental development database where the type was committed by an earlier run.

Note on failure semantics: under `per-migration`, a set that fails partway leaves earlier
migrations committed and recorded in the app's history table. Undoing a failed install is
therefore the orchestrator's responsibility rather than the database's.
