# FLS Workstream B — manual verification checklist (real SQL Server)

> Required by `plans/field-level-security-implementation.md` §B-tests: the DB-tier emission
> (column DENYs + catalog reconciliation) must be verified against a real SQL Server with real
> direct connections before PR 2 merges. Unit tests cover the emission logic with mocked
> catalog rows; this checklist covers what mocks cannot — actual DENY semantics, ownership
> chaining, and the reconciliation round-trip.

## Setup (once, on a disposable instance DB)

1. Create a custom SQL role + a direct-connection SQL user in it:
   ```sql
   CREATE ROLE cdp_fls_verify;
   CREATE LOGIN fls_verify_login WITH PASSWORD = '<strong password>';
   CREATE USER fls_verify_user FOR LOGIN fls_verify_login;
   ALTER ROLE cdp_fls_verify ADD MEMBER fls_verify_user;
   ```
2. Create the MJ role bound to it: insert an `MJ: Roles` row with `SQLName = 'cdp_fls_verify'`,
   plus an `EntityPermission` row granting it CanRead on a low-risk entity (e.g. `MJ: Reports`).
3. Insert an `EntityFieldPermission` row: `Type='Deny'`, `CanRead=1`, targeting a **nullable**
   column of that entity (e.g. `Reports.Description`) for the new role.
4. Run codegen (`mjdev setup <instance> codegen`, AI disabled).

## Checks

| # | Check | Expected |
|---|---|---|
| 1 | Inspect the entity's `*.permissions.generated.sql` | `REVOKE` preamble (if any live managed grants), `GRANT SELECT ... TO [cdp_fls_verify]`, then `DENY SELECT ([Description]) ON [<schema>].[vwReports] TO [cdp_fls_verify]` — grant before deny, never a column-level GRANT |
| 2 | As `fls_verify_login` (direct connection): `SELECT * FROM vwReports` | **Hard error** (Msg 230) — not a narrowed result set |
| 3 | As `fls_verify_login`: named-column SELECT including `Description` | Hard error; excluding it → rows return |
| 4 | As `MJ_Connect` (service login): `SELECT *` on the same view | Full rows, all columns — service login unaffected |
| 5 | MJAPI still serves the entity normally to API users | No behavior change (app tier is authoritative; API runs as the service login) |
| 6 | DENY-removal round-trip: delete the `EntityFieldPermission` row, re-run codegen (no schema change) | The next run's file REVOKEs the column DENY and does not re-assert it; direct SELECT works again |
| 7 | Entity-grant drift (gap 5): delete the `EntityPermission` row, re-run codegen | The role's `GRANT SELECT` on the view is REVOKEd and not re-asserted — `fls_verify_login` loses the view entirely |
| 8 | Manual drift self-heal: hand-`GRANT SELECT` on the view to the custom role with no metadata backing, re-run codegen | The stray grant is REVOKEd (it is inside the managed scope) |
| 9 | Out-of-scope grants untouched: hand-`GRANT SELECT` on the view to a NON-managed principal (e.g. a DBA role with no `MJ: Roles` row), re-run codegen | The grant survives — reconciliation never touches principals outside the managed scope |
| 10 | Service-login backstop: `ALTER ROLE cdp_fls_verify ADD MEMBER MJ_Connect`, re-run codegen | The DENY is **skipped** with the prominent warning; `MJ_Connect` keeps full column access |
| 11 | SELECT-only BI persona: confirm the custom role has **no** `GRANT EXECUTE` on the entity's CRUD procs unless `EntityPermission` grants write ops | A SELECT-only role cannot call `spUpdate...` to read full rows through proc output (the ownership-chaining bypass) |
| 12 | Blank-`SQLName` visibility (B3): run codegen with a role that has no `SQLName` | One INFO line per such role: `app-tier-only (no SQLName); no DB grants emitted` |

## Teardown

Delete the `EntityFieldPermission` / `EntityPermission` / `MJ: Roles` rows, re-run codegen
(reconciliation clears the DB-tier grants), then `DROP USER fls_verify_user; DROP LOGIN
fls_verify_login; DROP ROLE cdp_fls_verify;`.
