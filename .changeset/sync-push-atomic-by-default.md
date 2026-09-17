---
"@memberjunction/metadata-sync": patch
"@memberjunction/core": patch
"@memberjunction/postgresql-dataprovider": patch
---

`mj sync push` is all-or-nothing again (#4550).

- **Atomic by default.** Every create, update and delete runs in one database transaction, one JSON-root graph at a time. A failure anywhere rolls back everything the push wrote and restores the metadata files. This also removes the push deadlocking against itself when an entity view reads other rows during the insert read-back (#4550).
- **`--no-atomic`** (or `push.atomic: false` in the root `.mj-sync.json`) keeps the 6.1.0 behavior: graphs run in parallel on independent provider instances (`--parallel-batch-size`, default 10), and each create and update commits as it is saved. `--parallel-batch-size` is ignored, with a warning, in an atomic push.
- **Every record error stops the push**, including a record that fails without throwing (`status: 'error'`) and a deferred record that fails in Phase 2.5. The push transaction is never left open.
- **Messages are true.** "rolled back successfully" is printed only when nothing was committed. A failed non-atomic push lists the files and records that stayed in the database and keeps those files as written. The deletion banner matches the mode. A rejected COMMIT says so, and on PostgreSQL explains that deferred foreign keys are checked at commit. Deferred-record failures appear in the JSON `errors[]`.
- **Incremental state** is saved only after the push commits.
- The interactive "commit the successful changes?" prompt is removed: a failed push has already rolled back.
