# Jumpstart: `mj sync push` is not all-or-nothing

You are investigating a correctness bug in MetadataSync (`packages/MetadataSync`). The goal of
this session is to confirm the scope of the problem, find the root cause, and propose a fix that
keeps the deadlock fix it came from. Do not change code until the owner has agreed on the
approach. Never commit unless asked. This is a pnpm workspace.

## The problem, as measured on 2026-09-17

`mj sync push` tells the user it is atomic, but a failed push leaves earlier work committed.

**What the tool promises.**
- Before it starts, `PushService` prints "All operations will occur within a transaction and can
  be rolled back on error" (`packages/MetadataSync/src/services/PushService.ts`, around line
  1887).
- On failure it prints "Database transaction rolled back successfully".
- The README says a failed deferred record rolls back "the entire push transaction", and its
  `?allowDefer` flowchart ends in "Fatal error - rollback transaction".

**What happened** (SQL Server, database `mj_test_2`):
1. **Two files in one entity folder.** File A updated one AI Model's Description; file B set
   another model's Name to null. The push failed with "Name cannot be null" and reported the
   rollback. File A's change was still in the database, and the JSON files were restored from
   backup, so the files and the database disagreed.
2. **Two entity folders** (`directoryOrder: [a-vendors, b-models]`,
   `push.autoCreateMissingRecords: true`). Folder A created one AI Vendor and updated another;
   folder B had the null-Name model. The push failed and reported the rollback. Folder A's new row
   and its update were both still in the database.
3. **A record error that does not throw.** A record without auto-create returns
   `status: 'error'` ("Record not found") instead of throwing. The same folder's update was still
   committed, and the push went on to the next folder.
4. **Deletes: not measured.** They run in Phase 2, only after every create and update succeeded,
   inside the host transaction. So a failed delete should roll back the earlier deletes. The test
   could not show this, because the delete built to fail (a vendor referenced by 30 AI Model
   Vendor rows) always ran first.

## Where to look

- **`PushService.push()`.** `TransactionManager.beginTransaction()` opens a host transaction. The
  comment above it says so directly: "Host TX wraps Phase 2 deletions and Phase 2.5 deferred
  records. Phase 1 graph writes go to independent instances". It commits only when
  `totalErrors === 0`, and rolls back only when something throws.
- **`PushService.processEntityDirectory()`** (around lines 760–950). One `GraphProviderPool` per
  file, with records grouped by JSON root graph and dependency level. Each graph gets
  `CreateIndependentInstance()`, its own connection. `BaseEntity.Save()` commits its own entity
  transaction on that connection.
- **`GraphProviderPool.drainBatch()` / `releaseGraphs()`**
  (`packages/MetadataSync/src/lib/graph-provider-pool.ts`). A graph whose last level is done is
  committed, or rolled back if the file already failed, and then released.
  - Rollback only happens while `TransactionDepth > 0`.
  - A normal `Save()` has already committed (depth 0), so `markFailed()` cannot undo it.
  - `markFailed()` is per file, so graphs from earlier files are never affected.
- **History.** `4456222c8f` and `5cb97f08c8` (2026-09-07, PRs #4290 / #4293, branch
  `an-dev-sync-graph-provider`). They fixed a real deadlock: a nested Action Param's foreign-key
  check waited for an Action row that was uncommitted on a different connection. Read those
  commit messages in full. The README section on parallel push (search for "JSON-root graphs")
  describes the per-graph design.
- **`TransactionManager`** (`packages/MetadataSync/src/lib/transaction-manager.ts`). It uses the
  provider's raw `BeginTransaction`, and its doc comment covers the PostgreSQL single-connection
  history.
- **Tests.** `graph-provider-pool.test.ts`, `TransactionManager.test.ts` and the other suites in
  `packages/MetadataSync/src/__tests__/`.

## Questions to answer

1. **Was this ever atomic?** Did pushes before `4456222c8f` / the parallel-push change (see
   CHANGELOG entry `8d880cc`: "Parallel push default 10 uses `CreateIndependentInstance()`")
   actually run every save inside the host transaction? Check with `--parallel-batch-size=1`, and
   check what happens when `CreateIndependentInstance` is unavailable. The pool then uses the host
   for every graph in the file.
2. **Measure the delete case.** Does a failed delete in Phase 2 roll back earlier deletes? Does
   Phase 2.5 (deferred records) roll back cleanly? Build a case where a deletable record is
   deleted before one that fails. Deletion order comes from the deletion audit; read
   `processDeletionsFromAudit`.
3. **Is `status: 'error'` handled consistently?** Should a non-throwing record error stop the push
   immediately, as thrown errors do? Today it only counts, so the next folders still run.
4. **Which fix?** Options to weigh, keeping the deadlock fixed and parallelism where possible:
   - one connection-level transaction per graph that is held open, not committed, until the whole
     push succeeds, then committed or rolled back together (watch connection-pool limits and lock
     duration);
   - everything on the host transaction, with graph ordering that makes the foreign-key waits
     impossible (serial);
   - two phases: validate everything first, then write;
   - at minimum, make the messages true: no "rolled back successfully" when committed graphs
     remain, and report which files or records were committed.
5. **PostgreSQL.** Check it too. The private container `mj-pg-cachearch` (port 5441, database
   `MJ_6_1_0_PG_cachearch`, user `mj_cachearch`) may still exist. Runs need `NODE_ENV=development`
   and `DB_PLATFORM=postgresql`.

## How to reproduce

Use a scratch folder outside the repo, never `metadata/` itself.

```
<scratch>/.mj-sync.json
  { "version": "1.0.0", "push": { "autoCreateMissingRecords": true }, "directoryOrder": ["a-vendors", "b-models"] }
<scratch>/a-vendors/.mj-sync.json   { "entity": "MJ: AI Vendors", "filePattern": "**/.*.json" }
<scratch>/a-vendors/.vendors.json   [ update of an existing vendor's Description, create of a new vendor with a uuidgen ID ]
<scratch>/b-models/.mj-sync.json    { "entity": "MJ: AI Models", "filePattern": "**/.*.json" }
<scratch>/b-models/.bad.json        { "fields": { "Name": null }, "primaryKey": { "ID": "<an existing AI Model ID>" } }
```

Run from the repo root:
`MJ_SKIP_SHARED_CACHE_CLEAR=1 node packages/MJCLI/bin/run.js sync push --dir=<scratch> --ci`.
Then query the rows directly: a small `mssql` script run from `packages/SQLServerDataProvider`,
which has the dependency, works. Put everything back afterwards with a clean push, deleting
created rows with `"deleteRecord": { "delete": true }`.

## Environment

- **Database.** Confirm which one you are allowed to use; one database per agent. The session
  that found this used `mj_test_2` on localhost:1433 with user `MJ_CodeGen` (ask the owner for the
  password; do not store it).
  - Do not read the dotenv file.
  - Do not use Redis on 6379 or port 4000; they belong to other work.
- **Cache clearing.** Set `MJ_SKIP_SHARED_CACHE_CLEAR=1` on every CLI run unless you are testing
  the shared-cache clear.
- **Related branch.** `engine-cache-architecture` (uncommitted, in the same clone). It changes the
  MJCLI `mj sync push` shim to clear the shared Redis cache after any push, including a failed
  one, precisely because of this bug. See `plans/engine-cache-architecture-plan.md` §14. Do not
  undo that work; if you need a clean base, use a git worktree.

## Deliverable

A short write-up for a GitHub issue covering:
- the reproduction;
- which phases are and are not atomic, on SQL Server and PostgreSQL;
- the root cause, with file and line;
- the recommended fix, its trade-offs (deadlock, parallelism, lock duration);
- the tests that would pin it.

Then wait for the owner before implementing.
