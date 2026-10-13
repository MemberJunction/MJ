---
"@memberjunction/metadata-sync": patch
"@memberjunction/core": patch
"@memberjunction/postgresql-dataprovider": patch
---

`mj sync push` is all-or-nothing again (#4550).

- **Atomic by default.** Every create, update and delete runs in one database transaction, one JSON-root graph at a time. A failure anywhere rolls back everything the push wrote and restores the metadata files. This also removes the push deadlocking against itself when an entity view reads other rows during the insert read-back (#4550).
- **Isolated transactions are opt-in, per entity.** `push.isolatedTransactions: true` in an entity's `.mj-sync.json` (or at the root as a default) keeps the 6.1.0 behavior for that directory: its graphs run in parallel on independent provider instances (`--parallel-batch-size`, default 10), and each create and update commits as it is saved. For an entity that manages its own transaction scopes and wants the parallelism. The CLI flags `--isolated-transactions` and `--no-isolated-transactions` override every file, in either direction, so one run can be forced without editing metadata. A push that mixes the two is all-or-nothing for its shared directories and best effort for its isolated ones, and says which is which.
- **Every record error stops the push**, including a record that fails without throwing (`status: 'error'`) and a deferred record that fails in Phase 2.5. The push transaction is never left open.
- **Messages are true.** "rolled back successfully" is printed only when nothing was committed. A failed non-atomic push lists the files and records that stayed in the database and keeps those files as written. The deletion banner matches the mode. A rejected COMMIT says so, and on PostgreSQL explains that deferred foreign keys are checked at commit. Deferred-record failures appear in the JSON `errors[]`.
- **Incremental state** is saved only after the push commits.
- The interactive "commit the successful changes?" prompt is removed: a failed push has already rolled back.
- A failed push still reports: the JSON result keeps its `data` block with the counts reached, the SQL log path, and how many records stayed committed.
- A file whose write was deferred (it contains deletions) is written after a failed push when its records were committed, so their primary keys are not lost and the next push does not duplicate them.
- A write is reported as committed the moment its save settles, so a graph rolling back leftover depth afterwards cannot hide a row that is in the database.
