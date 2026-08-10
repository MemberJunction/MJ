# Entity transactions do not appear to be atomic across nested `BaseEntity` saves

> **Status: OPEN, unassigned. Not FLS-specific** — field-level security is where it surfaced,
> but the mechanism is general and would affect any server-side code that writes several records
> inside `RunInEntityTransaction`.
>
> Observed 2026-08-09 against `mj_test` on `sqlserver.local,1433`, on branch
> `JF_Entity_Field_Security`.

## What was observed

`MJEntityEntityServer.Save()` wraps two writes in a single `RunInEntityTransaction`:

```typescript
return RunInEntityTransaction(this.ProviderToUse, async () => {
    if (!(await super.Save(options))) return false;   // writes Entity.EnableFieldLevelSecurity = 1
    await this.snapshotFieldPermissions(provider);    // writes N EntityFieldPermission rows
    return true;
});
```

`snapshotFieldPermissions` throws partway through (it hit a validation guard on row ~29).

**Expected:** both writes roll back — flag stays 0, no permission rows.

**Actual:** the flag rolled back to 0, but **28 permission rows persisted.**

```
EFP rows now = 28
flag = 0
```

Half the unit of work committed; the other half rolled back.

## What has been ruled out

- **Not a missing transaction.** The provider was probed directly:
  `SupportsEntityTransactions = true`, and `BeginEntityTransaction` is a function. So
  `RunInEntityTransaction` took its transactional branch rather than the pass-through fallback.
- **Not a swallowed error.** The throw propagated all the way out of `Save()` and killed the
  script, so the rollback path definitely ran.
- **Not the inner scope alone.** `ReconcileFieldPermissions` opens its own nested
  `RunInEntityTransaction`, which should join the outer as a savepoint. Even if the savepoint
  rollback misbehaved, the *outer* rollback should still have removed the rows — and it
  demonstrably removed the flag written by the same outer scope.

## Leading hypothesis

**The ambient transaction and the row writes are on different pooled connections.**

The outer `Entity` save and the transaction scope run on the connection the scope acquired. Each
`EntityFieldPermission` row is written by `provider.GetEntityObject(...)` → `BaseEntity.Save()` →
`spCreateEntityFieldPermission`, which acquires a connection from the pool at execution time. If
that is not the scope's connection, those inserts are outside the transaction entirely — they
commit immediately and no rollback can reach them.

That would explain the asymmetry exactly: the flag (written on the scope's own connection) rolls
back; the rows (written on other connections) do not.

## Why it matters beyond FLS

Any server-side code following the documented pattern from
[`guides/TRANSACTIONS_AND_BATCHING_GUIDE.md`](../guides/TRANSACTIONS_AND_BATCHING_GUIDE.md) —

```typescript
await RunInEntityTransaction(this.ProviderToUse, async () => {
    await header.Save();
    for (const line of lines) await line.Save();
});
```

— is relying on exactly the guarantee that appears not to hold. The guide states "Atomic ✅" for
provider transactions and "read-your-writes ✅". If the hypothesis is right, a failure partway
through a parent/children cascade leaves children committed and the parent rolled back, silently.

Entity graphs (`DeclareRelatedRecords` + `entity.Save()`) route through the same executor, so they
may be affected too.

## How to confirm

1. Instrument `EntityTransactionScope` and `BaseEntity.Save()`'s SQL execution to log the
   connection identity (`@@SPID`) each uses. If the SPIDs differ inside one scope, that is the bug.
2. Minimal repro without FLS: in a server-side script, open `RunInEntityTransaction`, save two
   unrelated records, throw, and check whether either persisted.
3. Check whether `DatabaseProviderBase` threads the scope's `sql.Transaction` into the request
   used by `ExecuteSQL`, or whether it builds a fresh request off the pool.

## Interaction with FLS

The FLS flag flip is the code that exposed this, and it is also the code most harmed by it: a
partially applied flip leaves an entity whose flag and permission rows disagree, and on an enabled
entity **a field with no rows denies** — so the failure mode is a silent lockout rather than a
visible error.

The planned system-user rework (letting the snapshot write rows for the standard roles instead of
excluding them) makes each flip write *more* rows, widening the window. Worth fixing this first.

## Related

- [`guides/TRANSACTIONS_AND_BATCHING_GUIDE.md`](../guides/TRANSACTIONS_AND_BATCHING_GUIDE.md) —
  states the guarantee under test
- [`packages/MJCore/src/generic/entityTransactionScope.ts`](../packages/MJCore/src/generic/entityTransactionScope.ts) —
  scope contract and the 6.2 torn-write history that removed `BeginISATransaction`
- [`plans/fls-redesign-test-plan.md`](./fls-redesign-test-plan.md) — the run that found it
