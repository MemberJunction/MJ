# TransactionGroup Server-Side Concurrency & Multi-Process Verification

**Status:** Proposed
**Date:** 2026-11-09
**Assignee / Owner:** Jordan Fanapour (`@jordanfanapour`)
**Scope:** `@memberjunction/core`, `@memberjunction/generic-database-provider`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/postgresql-dataprovider`, `@memberjunction/graphql-dataprovider`, `@memberjunction/server`, `@memberjunction/testing-integration`
**Related:** PR [#6474](https://github.com/MemberJunction/MJ/pull/6474) (`plans/orm-improvements-ef-comparison.md`), PR [#6489](https://github.com/MemberJunction/MJ/pull/6489) (`plans/record-changes-post-save-snapshot.md`), [#6468](https://github.com/MemberJunction/MJ/issues/6468), [#4339](https://github.com/MemberJunction/MJ/issues/4339), [PR #6474 review comment](https://github.com/MemberJunction/MJ/pull/6474#issuecomment-6744739815), [#6468 review conditions](https://github.com/MemberJunction/MJ/issues/6468#issuecomment-6728103040)

---

## Why this plan exists

PR [#6474](https://github.com/MemberJunction/MJ/pull/6474) shipped two major server-side persistence improvements:

1. **Delta-only `spUpdate*` / `fn_update*` execution (`DeltaUpdates = true` by default):** Entity updates against CodeGen-generated routines bind only dirty columns plus primary keys, resolving cross-process lost updates on disjoint columns ([#4339](https://github.com/MemberJunction/MJ/issues/4339), [#6468](https://github.com/MemberJunction/MJ/issues/6468)).
2. **Atomic server-side field-level concurrency checking (`CheckUpdateConcurrency`):** Under `ConcurrencyCheck: 'log' | 'enforce'` (and automatically `'enforce'` on GraphQL `UpdateRecord` mutations carrying `OldValues___`), `DatabaseProviderBase.Save()` opens or joins an `EntityTransactionScope`, reads dirty columns with `WITH (UPDLOCK, ROWLOCK)` (SQL Server) / `FOR UPDATE` (PostgreSQL), and runs `DetectFieldConcurrencyConflicts` before `spUpdate*` executes.

Two intentional follow-ups were carved out of PR #6474 so they can be executed cleanly with focused review:

1. **`TransactionGroup` concurrency checking:** Queued `TransactionGroup` saves already benefit from **delta-only `spUpdate*` parameter binding** (because `DatabaseProviderBase.Save` calls `GenerateSaveSQL` when queuing each `TransactionItem`), so disjoint-column edits inside a `TransactionGroup` already avoid overwriting concurrent updates. However, `DatabaseProviderBase.Save` currently skips `CheckUpdateConcurrency` when `entity.TransactionGroup` is set and logs a warning when `ConcurrencyBaseline` or `ConcurrencyCheck === 'enforce'` is supplied (`packages/MJCore/src/generic/databaseProviderBase.ts`, ~lines 2361–2369).
2. **True multi-process (2-MJAPI + Redis) reproduction & CI/harness verification:** Validating the full cross-process credential-rotation / concurrent-entity-save workload from [#4339](https://github.com/MemberJunction/MJ/issues/4339) and [#6468](https://github.com/MemberJunction/MJ/issues/6468) across separate Node.js OS processes sharing SQL Server / PostgreSQL + Redis pub/sub cache invalidation.

---

## What is true today

| Path | Delta-only `spUpdate*`? | Atomic locked-row overlap check (`UPDLOCK` / `FOR UPDATE`)? | Current gap |
|---|---|---|---|
| Direct `entity.Save()` on server | Yes (`DeltaUpdates = true`) | Yes when `ConcurrencyCheck` is `'log'` or `'enforce'` | Complete in PR #6474 |
| GraphQL single-record `UpdateRecord` | Yes | Yes (`ResolverBase` sets `ConcurrencyCheck = 'enforce'` + `ConcurrencyBaseline` from `OldValues___`) | Complete in PR #6474 |
| Composite entity graph (`RelatedRecordCollection` / `SaveEntityGraph`) | Yes | Yes (each node calls `entity.Save()` inside one `EntityTransactionScope`) | Complete in PR #6474 |
| IS-A Table-Per-Type chains | Yes | Yes (per-level locked check + full chain DB & `UnitOfWork` rollback) | Complete in PR #6474 |
| **`TransactionGroup` (server-side & GraphQL `ExecuteTransactionGroup`)** | **Yes** | **Bypassed with `LogWarning`** | **Target of WS1 & WS2 below** |

### Relevant files in `next` (post-#6474)

- `packages/MJCore/src/generic/transactionGroup.ts` — `TransactionGroupBase`, `TransactionItem`, `TransactionVariable`
- `packages/MJCore/src/generic/databaseProviderBase.ts` (~lines 2359–2469) — `if (entity.TransactionGroup && !bReplay)` queuing branch
- `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` (~lines 1132–1293) — `CheckUpdateConcurrency`, `getDirtyConcurrencyFields`, `RenderLockedRowReadSQL`
- `packages/GenericDatabaseProvider/src/concurrency/fieldConflictDetector.ts` — `DetectFieldConcurrencyConflicts`
- `packages/SQLServerDataProvider/src/SQLServerTransactionGroup.ts` — `HandleSubmit()` physical `mssql.Transaction` execution loop
- `packages/PostgreSQLDataProvider/src/PostgreSQLTransactionGroup.ts` — `HandleSubmit()` physical `pg.PoolClient` `BEGIN`/`COMMIT`/`ROLLBACK` execution loop
- `packages/GraphQLDataProvider/src/graphQLTransactionGroup.ts` & `packages/MJServer/src/resolvers/TransactionGroupResolver.ts` — wire serialization and server-side deserialization of `TransactionGroup` items

---

## WS1 — Carry concurrency metadata on `TransactionItem` & across the GraphQL wire

### Design

1. **Extend `TransactionItem` (or strongly-typed `ConcurrencySpec` on `TransactionItem`):**
   When `DatabaseProviderBase.Save()` queues an `Update` item into `entity.TransactionGroup`, attach an optional strongly-typed concurrency descriptor instead of dropping `options.ConcurrencyCheck` / `options.ConcurrencyBaseline` and logging a warning:
   ```typescript
   export interface TransactionItemConcurrencySpec {
       Mode: ConcurrencyCheckMode; // resolved via getEffectiveConcurrencyCheckMode(options)
       Baseline?: Record<string, unknown>;
       SkipOldValuesCheck?: boolean;
   }
   ```
   - When `effectiveMode === 'off'` or `options?.SkipOldValuesCheck === true`, `ConcurrencySpec` is `undefined` and `HandleSubmit()` incurs **zero overhead** (matching direct `Save()` default behavior).
   - Remove the temporary bypass `LogWarning` in `DatabaseProviderBase.Save` (~lines 2361–2369) once `HandleSubmit()` executes the check.

2. **Wire transport (`GraphQLTransactionGroup` -> `TransactionGroupResolver`):**
   - Inspect how `GraphQLTransactionGroup` serializes `Update` items (`EntityObjectJSON`, `OldValues___` if present).
   - When a browser client queues dirty entities into a `GraphQLTransactionGroup` without `SkipOldValuesCheck: true`, capture each dirty field's pre-edit `OldValue` on the wire item (mirroring `GraphQLDataProvider.Save`'s `OldValues___`), and in `TransactionGroupResolver` hydrate the server entity and populate `ConcurrencyBaseline` + `ConcurrencyCheck: 'enforce'` before queuing onto the server `TransactionGroup`.

---

## WS2 — Execute locked-row concurrency checks inside `HandleSubmit()`

### Execution model inside the physical transaction

Both `SQLServerTransactionGroup.HandleSubmit()` and `PostgreSQLTransactionGroup.HandleSubmit()` already open a single physical database transaction (`BEGIN TRANSACTION` / `BEGIN`) and execute items **sequentially** on that pinned connection so `TransactionVariable` (`Define` -> `Use`) works between steps.

For each `TransactionItem` with `OperationType === 'Update'` and a non-`'off'` `ConcurrencySpec`:

1. **Apply any resolved `TransactionVariable` (`Use`) values first** so any FK/field populated by an earlier `Define` item in the same group has its final target value before checking or executing.
2. **Intra-group awareness (same row updated twice in one group):**
   - Track a `Set<string>` of `(EntityID, NormalizedPK)` keys already written earlier in the *same* `HandleSubmit()` transaction.
   - For the **first** touch of `(EntityID, PK)` in the group: execute `provider.RenderLockedRowReadSQL(entityInfo, dirtyFields, pk)` **on the group's active transaction connection** (`new mssql.Request(transaction)` on SQL Server; `client.query(...)` on PostgreSQL). Because this runs inside the open transaction, `UPDLOCK, ROWLOCK` / `FOR UPDATE` locks the row until the entire `TransactionGroup` commits or rolls back!
   - Run `PostProcessRows` + `DetectFieldConcurrencyConflicts` against `ConcurrencySpec.Baseline ?? field.OldValue`.
   - If a second `TransactionItem` in the *same* `TransactionGroup` updates the *same* `(EntityID, PK)`, skip baseline comparison for fields modified by the earlier item in the same transaction (since the row lock is already held by our own transaction and the DB row now reflects our own step 1 write).
3. **Conflict handling (`'log'` vs `'enforce'`):**
   - `'log'`: emit the same structured `LogErrorEx` warning (`category: 'GenericDatabaseProvider.CheckUpdateConcurrency'`) and proceed with the update SQL.
   - `'enforce'`:
     1. Populate a `BaseEntityResult` on `item.BaseEntity` with `Success = false`, descriptive `Message`, and `ConcurrencyConflict: { ConflictingFields }`.
     2. Roll back the entire physical transaction (`await transaction.rollback()` / `await client.query('ROLLBACK')`).
     3. Emit failure through `TransactionNotifications$` so `BaseEntity._innerSave`'s subscription records failure cleanly on sibling entities without leaving dangling uncommitted state.
     4. On `TransactionGroupResolver`, surface `CONCURRENT_MODIFICATION_CONFLICT` extensions (and `SAVE_INCONSISTENCY` error-log entry) matching `ResolverBase.UpdateRecord`.

### Deadlock prevention note for multi-row locks

Because a `TransactionGroup` can lock multiple rows across one transaction, two concurrent `TransactionGroup`s touching the same pair of rows in opposite order (`[Row1, Row2]` vs `[Row2, Row1]`) could deadlock in SQL. Document this in `guides/TRANSACTIONS_AND_BATCHING_GUIDE.md` (callers batching multi-row updates should order items deterministically by `(EntityName, PK)` when concurrent contention is expected; we should **not** silently reorder `TransactionGroup` items automatically because `TransactionVariable` dependencies and FK creation order are positional).

---

## WS3 — Multi-process (2-MJAPI + Redis) Concurrent Save Verification

Jordan built a 3-process reproduction harness during [#6468](https://github.com/MemberJunction/MJ/issues/6468) / [#4339](https://github.com/MemberJunction/MJ/issues/4339) (two MJAPI instances + Redis pub/sub cache invalidation + concurrent credential key rotation + `LastUsedAt` / usage updates, which reproduced lost updates in 13 of 20 trials on MJ 6.2.1).

1. **Run the 3-process reproduction harness against `next` (with PR #6474 merged):**
   - Scenario A: Process 1 rotates an encrypted credential field while Process 2 concurrently updates a metadata/timestamp field on the same credential record across 50+ trials -> **0 reverted keys** (`DeltaUpdates = true`, `ConcurrencyCheck = 'off'`).
   - Scenario B: Two clients / processes edit the **same** field from the same baseline with `ConcurrencyCheck = 'enforce'` -> exactly one wins, the loser receives `ConcurrencyConflict` (`ConflictingFields`), and Redis cache invalidation converges both processes onto the winning value.
   - Scenario C: Repeat Scenario A & B through `TransactionGroup` once WS1 + WS2 land.
2. **Check in a deterministic multi-pool / multi-provider check bundle** in `packages/TestingFramework/integration-test-suite/src/checks/` (e.g. expanding `transaction-groups.checks.ts` and `concurrency-conflict-client.checks.ts`) so CI continuously guards both direct `Save()` and `TransactionGroup` concurrency semantics on SQL Server and PostgreSQL.

---

## Acceptance Criteria

- [ ] `DatabaseProviderBase.Save` no longer logs a bypass warning when queuing an entity with `ConcurrencyBaseline` or `ConcurrencyCheck: 'enforce'` into a `TransactionGroup`.
- [ ] `SQLServerTransactionGroup` and `PostgreSQLTransactionGroup` perform `UPDLOCK, ROWLOCK` / `FOR UPDATE` reads inside the group transaction when `ConcurrencyCheck` is `'log'` or `'enforce'`, and incur zero extra queries when `'off'`.
- [ ] A conflict on item $k$ of $N$ in `'enforce'` mode rolls back items $1 \dots k-1$ in SQL, populates `ConcurrencyConflict` on item $k$'s `BaseEntity.LatestResult`, and returns `false` from `tg.Submit()`.
- [ ] GraphQL `ExecuteTransactionGroup` mutations honor client `OldValues` conflict detection end-to-end.
- [ ] Unit tests in `@memberjunction/core`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/postgresql-dataprovider`, and `@memberjunction/server` pass, plus live SQL Server & PostgreSQL integration checks pass.
- [ ] Multi-process (2-MJAPI + Redis) credential rotation reproduction passes 50/50 trials with zero reverted fields.
