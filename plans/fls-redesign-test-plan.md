# FLS Redesign — verification plan

> What must be proven before this PR goes up, and how. Companion to
> [`fls-redesign-progress.md`](./fls-redesign-progress.md).
>
> Target database: `mj_test` on `sqlserver.local,1433`. **Note the host** — the repo `.env` says
> `localhost`, which does not resolve to the SQL Server; use `sqlserver.local`.

## Why a clean rebuild is required

The current `mj_test` has the FLS schema, but `TrackRecordChanges` on `MJ: Entity Field
Permissions` is **1** where the migration now sets it to **0**. That statement was appended to
the migration after this database was migrated, and Flyway does not re-run a migration whose
checksum changed. So the database cannot validate the migration in its current form, and a
from-scratch build is the only way to prove it applies end to end.

That is also the backstop `migrations/CLAUDE.md` calls for: a migration whose correctness
depends on local state fails only on fresh installs — CI, new developers, releases.

## Tier 1 — Migration and CodeGen, from scratch

| # | Test | Pass condition |
|---|---|---|
| 1.1 | Wipe + `mj migrate` from baseline | Applies clean, no out-of-order or checksum errors |
| 1.2 | `EntityFieldPermission` shape | Three trinary columns; CHECK constraints on each; `UQ_..._Field_Role` on (EntityFieldID, RoleID); no `Type`/`CanRead`/`CanUpdate`/`CanCreate` |
| 1.3 | Read-required CHECK | `INSERT` with `ReadAccess='No Access'`, `UpdateAccess='Allow'` is **rejected** by the database |
| 1.4 | `Entity.EnableFieldLevelSecurity` | Column exists, `BIT NOT NULL DEFAULT 0`, every row 0 |
| 1.5 | `TrackRecordChanges` | **0** on `MJ: Entity Field Permissions` — the post-CodeGen UPDATE ran |
| 1.6 | Value lists | `EntityFieldValue` rows for Allow/Deny/No Access on all three columns, from the CHECK constraints |
| 1.7 | `mj codegen` on the clean DB | Completes; generated union types match `'Allow' \| 'Deny' \| 'No Access'` |

## Tier 2 — Lifecycle (the adapters unit tests cannot reach)

| # | Test | Pass condition |
|---|---|---|
| 2.1 | **Flag flip snapshot.** Set `EnableFieldLevelSecurity = 1` on a test entity through `BaseEntity.Save()` | Rows appear for every (restrictable field × role holding entity read); PKs and `__mj_` columns get none |
| 2.2 | Snapshot defaults mirror entity permissions | A role with entity read+update+create gets `Allow/Allow/Allow`; read-only role gets `Allow/No Access/No Access` |
| 2.3 | **Enabling changes no behavior** | A user's visible column set is identical before and after the flip |
| 2.4 | Flag flip is atomic | Flag and rows land together; a forced failure mid-write leaves neither |
| 2.5 | **Disable keeps rows** | Set flag to 0 → row count unchanged; enforcement stops |
| 2.6 | **Re-enable does not clobber** | Tighten a field, disable, re-enable → the tightening survives |
| 2.7 | **CodeGen reconciliation, new column** | Add a column to an enabled entity, run `mj codegen` → rows created for it |
| 2.8 | **CodeGen reconciliation, orphans** | Drop a role's entity permission, run codegen → its field rows removed |
| 2.9 | **Entity-permission adapter** | Grant a role entity read on an enabled entity → its field rows appear without a codegen run |
| 2.10 | Reconciliation is idempotent | Second codegen run writes nothing |

## Tier 3 — Enforcement as a restricted user (via MJAPI)

Requires: a custom role, a user assigned to it, and an entity with FLS enabled and one column
denied to that role.

| # | Test | Pass condition |
|---|---|---|
| 3.1 | **RunView omits the denied column** | Denied field absent from every result row |
| 3.2 | Unrestricted user unaffected | Same query returns the column |
| 3.3 | **Cache cannot leak across users** | Unrestricted user warms the cache, restricted user queries → still absent |
| 3.4 | `ExtraFilter` on a denied field | **Rejected**, with the ambiguous message |
| 3.5 | `OrderBy` on a denied field | Rejected |
| 3.6 | `Aggregates` on a denied field (`MIN(Salary)`) | Rejected — the value-reconstruction hole |
| 3.7 | `UserSearchString` | Not rejected; denied field excluded from the search |
| 3.8 | Single-record GraphQL load | Denied field absent from the payload |
| 3.9 | **Update to a denied field** | Save rejected server-side |
| 3.10 | **Round-trip safety** | Restricted user edits an unrelated field and saves → denied column's stored value **unchanged** |
| 3.11 | **Create suppression** | Restricted user creates a record supplying a create-denied field → save **succeeds**, column takes its default |
| 3.12 | Denial message | Exactly the ambiguous wording; never names the reason |

## Tier 4 — Aggregation semantics against real data

| # | Test | Pass condition |
|---|---|---|
| 4.1 | Deny beats Allow across roles | User in both an allowing and a denying role → denied |
| 4.2 | `No Access` is neutral | User in a `No Access` role and an `Allow` role → allowed |
| 4.3 | **Read-required clamp across roles** | Role A `Read+Update=Allow`, role B `Read=Deny` → user has neither read NOR update |
| 4.4 | Missing row on an enabled entity | Denied (fail closed) |
| 4.5 | **System user is NOT exempt — its access is data** | The aggregation has no identity branch; the system user reads every column of a restricted entity because snapshot initialization wrote `Allow` rows for the standard roles it holds, not because it is bypassed |
| 4.6 | Unrestrictable targets | Rows targeting a PK are rejected at save |
| 4.7 | Config guards, all four vectors | Each is refused: a `Deny` on a system-user role; the **last** edit turning its roles to `No Access`; the **last** delete of its `Allow` rows; assigning it a role that already denies a field. A non-system role stays freely restrictable |
| 4.8 | Startup sweep | A lockout introduced by direct SQL is reported at startup; a clean database reports nothing; cost is negligible with no entity enabled |

## Tier 5 — DB tier and propagation

| # | Test | Pass condition |
|---|---|---|
| 5.1 | Column DENY emitted | `ReadAccess='Deny'` on an enabled entity + custom role with `SQLName` → `DENY SELECT` in the permissions file |
| 5.2 | No DENY from `No Access` | Neutral rows produce nothing |
| 5.3 | No DENY when the flag is off | Disable → DENY revoked on next codegen |
| 5.4 | Service-login backstop | Role containing a protected login → skipped with a warning |
| 5.5 | Direct connection blocked | A direct SQL user in the denied role errors on `SELECT` of the column |
| 5.6 | Metadata refresh propagation | Permission change on one session → a second session picks it up (debounced) |

## Tier 6 — Regression

| # | Test | Pass condition |
|---|---|---|
| 6.1 | `pnpm run test:integration` | Deterministic tier passes; **RVM4 watched as the canary** for the system-user/RLS interaction |
| 6.2 | Non-FLS entities unaffected | Existing suites show no change in behavior or timing |
| 6.3 | Unit tests | All packages green (baseline in the progress file) |

## Execution order

1. Tier 1 on a wiped database — nothing else is meaningful if the migration does not apply.
2. Tier 6.1 immediately after, as the pre-change baseline.
3. Tiers 2 and 4 via SQL + a script against the built packages.
4. Tier 3 and 5.6 against a running MJAPI with real users and roles.
5. Tier 5.1–5.5 via a codegen run plus a direct SQL login.
6. Tier 6.1 again at the end.

## Standing rules for this run

- **One database per agent.** `mj_test` is mine for the duration; nothing else should migrate or
  codegen against it.
- `mj sync push` **before** `mj codegen`, always. Revert the `metadata/**/*.json` write-back
  before committing.
- Report results exactly as they happen — a test-count drop matters as much as a failure.

---

# Results — first live run (2026-08-09)

Database rebuilt from scratch: reset script → `mj migrate` (41 applied) → `mj sync push` →
`mj codegen` (375 entities).

## Tier 1 — PASSED in full

| # | Result |
|---|---|
| 1.1 | ✅ 41 migrations applied clean from an empty database |
| 1.2 | ✅ Three trinary columns; no `Type`/`CanRead`/`CanUpdate`/`CanCreate`; all four CHECKs; `UQ_..._Field_Role` present |
| 1.3 | ✅ Read-required CHECK rejects `No Access`+`Allow` **and** `Deny`+`Allow`; bad enum rejected; valid row accepted; duplicate (field,role) rejected |
| 1.4 | ✅ `EnableFieldLevelSecurity` BIT NOT NULL DEFAULT 0, zero rows enabled |
| 1.5 | ✅ `TrackRecordChanges = 0` — the post-CodeGen UPDATE ran (the stale DB could not validate this) |
| 1.6 | ✅ Value lists derived from the CHECKs, `ValueListType = List` |
| 1.7 | ✅ CodeGen produced **zero diff** under `packages/**/generated/**` — committed output matches a from-scratch build exactly |

## Tier 2 — TWO REAL BUGS FOUND

### 🔴 BUG 1 (FIXED) — snapshot could not create rows for standard roles

Enabling field security on `MJ: Employees` failed immediately:

> Role 'Developer' is held by the MJ system user, so it cannot carry field-level permissions.

Two of the feature's own guards collided. Snapshot init creates rows for every role holding
entity read — which includes UI / Developer / Integration — and
`MJEntityFieldPermissionEntityServer` refuses any row aimed at a role the system user holds.
Since the standard roles have entity permissions on essentially everything, **field security
could not be enabled on any entity at all.**

Unit tests could not have caught this: they build metadata fixtures with test roles only, and
never involve the real system user or the real user cache.

**Fix applied:** `ComputeFieldPermissionDelta` takes `ExcludedRoleIDs`; the reconciler passes the
system user's roles. Same reasoning that already excludes unrestrictable fields — the system user
is exempt in the aggregation, so rows for its roles are inert clutter.

### ⚪ BUG 2 (CLOSED 2026-08-10 — not a bug) — flag flip *is* atomic

After the failure above, the database was left with **28 permission rows and
`EnableFieldLevelSecurity = 0`** — half the unit of work committed, half rolled back.

`MJEntityEntityServer.Save` wraps the flag write and the snapshot in
`RunInEntityTransaction`, and the provider reports `SupportsEntityTransactions = true`, so a
real transaction *was* opened. The flag write rolled back correctly; the row inserts did not.

Leading hypothesis, not yet confirmed: the ambient transaction is held on one pooled connection
while `spCreateEntityFieldPermission` executes on another, putting the inserts outside the
transaction entirely. Worth checking whether `RunInEntityTransaction`'s scope and
`BaseEntity.Save()`'s SQL execution resolve to the same connection.

**Investigated on 2026-08-10 and closed: the transaction layer is correct.** Five live
reproductions — flat scope, nested scope with a validation failure, nested scope with a
batch-aborting SQL error, the real `MJEntityEntityServer.Save()` with a forced mid-snapshot
collision, and a byte-faithful replay of the original pre-fix failure — **all rolled back
completely**. `@@SPID` was identical across the scope and every write, `TRANCOUNT` stayed at 1
throughout, and a second connection reading the rows mid-transaction hit lock timeout 1222,
proving they were inside it.

The 28 rows came from `MJEntityPermissionEntityServer`, which reconciles **once per
`EntityPermission` row saved** via `ReconcileFieldPermissionsQuietly` — N independent,
individually-atomic units of work, of which two succeeded (14 fields × 2 roles = 28) and the
third hit the pre-fix system-user-role guard. Full evidence in
[`entity-transaction-atomicity-gap.md`](./entity-transaction-atomicity-gap.md).

## Not yet run

Tiers 3, 4, 5, 6.

---

# Results — second run (2026-08-10)

## Tier 2 — PASSED, 15/15

Run through the real `MJEntityEntityServer.Save()` against `MJ: Employees` (14 restrictable
fields × 3 non-system roles = 42 rows).

| # | Result |
|---|---|
| 2.1 | ✅ 42 rows written; none target primary keys or `__mj_` columns; none target system-user roles |
| 2.2 | ✅ `FLS Payroll` (read+update+create) → `Allow/Allow/Allow`; `FLS Intern` and `Widget Guest` (read-only) → `Allow/No Access/No Access` |
| 2.4 | ✅ A forced mid-snapshot failure left the flag at 0 and wrote no rows |
| 2.5 | ✅ Disable kept all 42 rows |
| 2.6 | ✅ Tighten → disable → re-enable: no rows added, the `Deny` survived |
| 2.10 | ✅ Re-saving with the flag already on (not dirty) wrote nothing |

Not covered here: 2.3 (visible column set unchanged — belongs with Tier 3, which has the
restricted users), and 2.7–2.9 (CodeGen reconciliation and the entity-permission adapter).

## Tier 4.5 / 4.7 / 4.8 — system-user access, PASSED 11/11

Run after the system-user rework removed the runtime exemption. The account's access is now
ordinary data, so these verify that nothing can quietly take it away.

| # | Result |
|---|---|
| 4.5 | ✅ System user denied no field on the restricted entity — from `Allow` rows, with no identity branch anywhere in the aggregation |
| 4.7a | ✅ Turning every system-user role to `No Access` one at a time: the **last** edit is refused, access retained |
| 4.7b | ✅ Deleting every system-user `Allow` row one at a time: the **last** delete is refused, access retained |
| 4.7c | ✅ A `Deny` on a system-user role is refused outright |
| 4.7d | ✅ A non-system role remains freely restrictable — `Deny` and delete both permitted, no false refusals |
| 4.8a | ✅ Clean database: zero violations reported |
| 4.8b | ✅ A lockout written by **direct SQL** — which no entity-layer guard sees — is caught by the startup sweep |
| 4.8c | ✅ Cost: **0.09 ms** across 375 entities with none enabled; 0.3 ms with one enabled |

**The `No Access` hole this found.** The first version of the guard refused only a rule containing
a `Deny`, reasoning that `No Access` is the aggregation's identity element and so cannot take away
what another role granted. True of one rule, false of a *change*: setting every one of the system
user's roles to `No Access` in turn writes no `Deny` anywhere and still ends with the field denied.
Proven live before the fix — every save permitted, `email` denied to the system user.

The second version read the projected rules from **metadata** and was still defeated, because
metadata lags recent writes: each save saw its siblings' stale `Allow` and passed. The guard now
loads the field's rules from the database (`BypassCache`) on the update and delete paths, gated
behind a role check so it costs nothing for ordinary permission administration.

## Environment note

The repo `.env` says `DB_HOST='localhost'`, which does not resolve. The SQL Server is
`sqlserver.local,1433`. Every command in this run used `DB_HOST=sqlserver.local`.
