---
'@memberjunction/open-app-engine': patch
---

Fix: a failed Open App install now removes everything it wrote, not just its schema

With migrations applying per-migration, a set that fails partway leaves earlier files
committed — the database will not undo them, and it cannot: one transaction spanning a whole
app's migrations is not something SQL Server can always host. The install's all-or-nothing
guarantee therefore has to be a compensating action.

`CompensateSchemaOnFailure` previously did one of the three things `RemoveApp` does — it
dropped the app's schema. Rows the app's seed migrations wrote into the **shared** core schema
were left orphaned, because dropping the app's own schema cannot reach them.

It now runs the same three-step sequence `RemoveApp` uses, in the same order:

1. `RemoveAppEntityMetadata` — the app's entity metadata and the Application rows its
   migrations declared, in the core schema.
2. `HandleTeardown` — the app's declared `migrations.teardownDirectory` inverse DELETEs,
   which retire what its seed migrations wrote into the shared core schema.
3. `DropAppSchema` — the app's own schema, which takes its migration history table with it so
   a retry starts from a clean slate rather than resuming a half-applied set.

Unchanged: compensation still runs only for a schema **this run actually created**, never a
reused or adopted one. Because the run created it, no other installed app can legitimately
share it, so no co-tenant check is needed here.

Every step is best-effort and reported. One failing step does not skip the others (a teardown
failure must not leave the schema behind), and nothing here turns a failed install into a
successful one. An app that declares migrations but no `teardownDirectory` now emits an
explicit warning that rows in the shared core schema may remain, rather than letting a partial
rollback look complete.
