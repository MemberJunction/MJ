# TransactionGroup Server-Side Concurrency & Multi-Process Verification

**Status:** Implemented (WS1, WS2, WS3) on this branch
**Date:** 2026-11-09 (proposed), 2026-11-11 (implemented)
**Assignee / Owner:** Jordan Fanapour (`@jordanfanapour`)
**Scope:** `@memberjunction/core`, `@memberjunction/generic-database-provider`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/postgresql-dataprovider`, `@memberjunction/graphql-dataprovider`, `@memberjunction/server`, `@memberjunction/integration-test-suite`
**Related:** PR [#6474](https://github.com/MemberJunction/MJ/pull/6474), PR [#6489](https://github.com/MemberJunction/MJ/pull/6489), [#6468](https://github.com/MemberJunction/MJ/issues/6468), [#4339](https://github.com/MemberJunction/MJ/issues/4339)

---

## Why this plan exists

PR #6474 made server updates send only the changed columns, and added a field-level concurrency
check under a row lock (`ConcurrencyCheck` = `'off' | 'log' | 'enforce'`). `DatabaseProviderBase.Save`
skipped that check for any update queued into a `TransactionGroup`, and logged a warning only when
the caller passed `ConcurrencyBaseline` or `'enforce'` explicitly. A provider-wide `'log'` or
`'enforce'` setting was skipped for grouped saves without any warning.

## What the investigation found

- **No server-side caller of a `TransactionGroup` passes a concurrency option.** The Integration
  engine, OpenApp install, integration-discovery admin deletes and DataContext all save bare.
  MetadataSync push and agent runs use provider transactions, not groups.
- **The browser path is where it mattered.** A form save normally goes through the single-record
  `UpdateRecord` mutation, which sends `OldValues___` and runs in `'enforce'` mode. As soon as the
  form has pending child records (`BaseFormComponent.InternalSaveRecord`: Action, AI Agent,
  Templates, and the AI Prompt, Query and agent editors), it saves through a `GraphQLTransactionGroup`.
  On that path the client discarded the old values it had already built, the resolver reloaded the
  row immediately before saving (so a stale client could not be detected), and saved with no options.
  The same edit was protected without child changes and unprotected with them.
- **The flush changed after this plan was written.** Commit `64cc6f4127` (Wave 4.3a) sends a group
  without variables as one batched request on both databases. A locked read per item inside the
  execution loop, as first proposed, would have undone that batching.
- **Record Change snapshots through groups were already right.** Grouped saves, including groups
  with variables (whose SQL is regenerated at submit through `GetSaveSQL`), build `FullRecordJSON`
  from the stored row, as direct saves do since #6489. A live test now pins this on both databases.

## Design as built

### Provider (WS2)

- `TransactionItem.CheckBeforeSubmit?: () => Promise<boolean>`: an optional check that
  `TransactionGroupBase.Submit()` runs for every item inside the open group transaction, after
  `PrepareBeforeSubmit` and before `HandleSubmit()`. If any check returns `false`, the group rolls
  back without running a single statement, every item's callback fails, and `Submit()` returns
  `false`. All checks run even after one fails, so each conflicting item reports its own fields.
- `DatabaseProviderBase.PrepareQueuedUpdateConcurrencyCheck(entity, user, options, entityResult)`:
  a new hook (default `null`) called when an update is queued. It replaces the bypass warning.
- `GenericDatabaseProvider` implements it by splitting `CheckUpdateConcurrency` into two steps:
  collect each changed field's baseline and new value (now, at queue time) and run the locked read
  and comparison (later, at submit). It returns `null` when checking is off, so a group with checking
  off does no extra work. The read uses the existing `RenderLockedRowReadSQL` (`UPDLOCK, ROWLOCK` /
  `FOR UPDATE`) through the provider, which runs on the group's own transaction.
- Because every check runs before any of the group's writes, the plan's "same row twice in one
  group" special case does not arise, and batched submits stay one batch after the locked reads.

### Wire (WS1)

- `GraphQLDataProvider.Save` carries the `OldValues___` it already builds for an update onto the
  queued item (`ExtraData.oldValues`), unless the save used `SkipOldValuesCheck`.
- `GraphQLTransactionGroup` sends them as a new optional `OldValues: [KeyValuePairInput]` field on
  `TransactionItemInputType`, and copies the server's `ConcurrencyConflict` onto the entity's result
  when the group fails.
- `TransactionResolver.ApplyItemValues` handles an update that carries `OldValues` the way
  `ResolverBase.UpdateRecord` does: `TestAndSetClientOldValuesToDBValues` compares them with the row
  just loaded (a conflict refuses the item and the group is not submitted), and the save is queued
  with `ConcurrencyCheck: 'enforce'` plus the client's baseline, so the provider repeats the
  comparison under a lock at submit. A submit-time conflict writes the same `SAVE_INCONSISTENCY`
  error log the single-record path writes.

### Deadlocks

A group that checks several rows locks them in queue order. Two groups updating the same two rows
in opposite order can deadlock, as they already could through their writes. Items are not reordered,
because variable dependencies and foreign-key creation order are positional.

## WS3 — multi-process verification

- **2-MJAPI + Redis credential-rotation rig against `next` with #6474:** 0 of 50 rotations lost in
  the database with defaults; 14 of 20 lost with `deltaUpdates` off in the readers
  ([results](https://github.com/MemberJunction/MJ/pull/6490#issuecomment-6756104012)). The rig is
  not committed; it needs two MJAPIs, Redis and several reader processes.
- **Permanent, deterministic checks:**
  - IT170 (`transaction-group-concurrency-client`, client transport): two GraphQL sessions, one
    saving through a transaction group, against a real MJAPI.
  - Env-gated live Vitest tests on both databases
    (`transaction-group-concurrency-live-db.integration.test.ts`): two providers on separate
    connection pools stand in for two servers.

## Acceptance criteria

- [x] No bypass warning; grouped updates with `ConcurrencyCheck` `'log'` / `'enforce'` (per save or
      provider-wide) are checked.
- [x] Locked reads run inside the group transaction on both databases, and only when checking is on.
- [x] An `'enforce'` conflict rolls back the whole group, sets `ConcurrencyConflict` on the
      conflicting entity, and `Submit()` returns `false`.
- [x] `ExecuteTransactionGroup` honors client old values end to end.
- [x] Unit tests in every touched package; live tests on SQL Server and PostgreSQL; IT170.
