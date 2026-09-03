# Entity transactions and nested `BaseEntity` saves — investigated, NOT a platform bug

> **Status: CLOSED — could not reproduce; the guarantee holds.** Investigated 2026-08-10 against
> `mj_test` on `sqlserver.local,1433`, branch `JF_Entity_Field_Security`.
>
> The original report is kept below because the *observation* was real. What it was not is a
> torn transaction — see [What it actually was](#what-it-actually-was).

## Original observation (2026-08-09)

`MJEntityEntityServer.Save()` wraps two writes in a single `RunInEntityTransaction`:

```typescript
return RunInEntityTransaction(this.ProviderToUse, async () => {
    if (!(await super.Save(options))) return false;   // writes Entity.EnableFieldLevelSecurity = 1
    await this.snapshotFieldPermissions(provider);    // writes N EntityFieldPermission rows
    return true;
});
```

`snapshotFieldPermissions` threw partway through (it hit the system-user-role guard). The
database was then found holding **28 permission rows with the flag at 0** — apparently half the
unit of work committed and half rolled back.

The leading hypothesis was that the ambient transaction and the row writes sat on different
pooled connections, putting the inserts outside the transaction entirely.

## What was actually tested

Five reproductions, all against a live `mj_test`, all through the real provider and the real
`BaseEntity.Save()` path. Scripts under `packages/MJServer/scratch/` (deleted after the run).

| # | Shape | Result |
|---|---|---|
| 1 | Flat `RunInEntityTransaction`: `Entity` flag write + 3 `EntityFieldPermission` rows, then a synthetic `throw` | **Atomic.** Nothing persisted |
| 2 | Nested scope (outer = flag write, inner = reconciler), 27 rows then a `Validate()` failure on row 28 | **Atomic.** Nothing persisted |
| 3 | Nested scope, 14 rows then a **unique-constraint violation** (batch-aborting SQL error, the doomed-transaction hazard) | **Atomic.** Nothing persisted |
| 4 | The real `MJEntityEntityServer.Save()` with an invisible pre-seeded row forcing a collision mid-snapshot (test 2.4) | **Atomic.** Flag back to 0, only the pre-seeded row left |
| 5 | **The original failure, byte-faithful**: pre-`55f933132f` delta (system-user roles included) tripping the `Role 'Developer' is held by the MJ system user` guard mid-write | **Atomic.** `EFP rows = 0, flag = false` |

Connection identity was checked directly rather than inferred: `SELECT @@SPID, @@TRANCOUNT,
XACT_STATE()` returned the **same SPID** outside the scope, inside the scope, after the flag
write and after the row writes, with `TRANCOUNT = 1` throughout. A second, independent
connection reading `EntityFieldPermission` mid-transaction hit **lock timeout (msg 1222)`** —
i.e. the rows were genuinely holding uncommitted write locks inside the transaction.

The hypothesis is therefore disproved on both counts: one connection, and the rows were inside
the transaction.

## What it actually was

`MJEntityPermissionEntityServer.reconcileFieldPermissions`
([`packages/MJServer/src/entitySubclasses/MJEntityPermissionEntityServer.server.ts:155`](../packages/MJServer/src/entitySubclasses/MJEntityPermissionEntityServer.server.ts#L155))
runs reconciliation **once per `EntityPermission` row saved**, after that row's own save has
committed, through `ReconcileFieldPermissionsQuietly` — which swallows failures by design.

So granting entity access to several roles on an FLS-enabled entity is **N independent units of
work**, not one. Each is individually atomic; a failure in the third leaves the first two
committed. With 14 restrictable fields, two roles succeeding and the third (a system-user role,
pre-fix) failing produces exactly **28 rows** — the observed number.

That is not a broken transaction. It is N transactions, which is what the adapter is designed to
do: it reconciles as a side effect of a save that has already succeeded, so it cannot roll that
save back and deliberately does not try.

## What this does NOT clear

The per-row adapter's behaviour is correct but worth knowing about: a partial failure across a
multi-role permission grant leaves a partially reconciled entity, logged and not surfaced. On an
enabled entity a field with no row denies, so the failure mode is a visible loss of access
rather than a silent loss of protection — which is the trade the `Quietly` variant documents.
No change proposed; recorded so the next person reading "28 rows" reaches for the adapter rather
than the transaction layer.

## Recommendation

Pin the guarantee with an integration test rather than leaving it resting on this one-off
investigation — reproductions 2 and 3 (nested scope, validation failure and SQL error) are the
two shapes worth keeping, since they cover the savepoint join and the doomed-transaction path
that `SQLServerDataProvider.RollbackTransaction` handles. **Not yet written** — see
[`fls-redesign-progress.md`](./fls-redesign-progress.md).

## Related

- [`guides/TRANSACTIONS_AND_BATCHING_GUIDE.md`](../guides/TRANSACTIONS_AND_BATCHING_GUIDE.md) —
  states the guarantee that was under test; it holds as written
- [`packages/MJCore/src/generic/entityTransactionScope.ts`](../packages/MJCore/src/generic/entityTransactionScope.ts) —
  scope contract and the 6.2 torn-write history that removed `BeginISATransaction`
- [`plans/fls-redesign-test-plan.md`](./fls-redesign-test-plan.md) — the run that raised it
