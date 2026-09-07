---
"@memberjunction/codegen-lib": minor
---

CodeGen: the SQL log is replayable again when default constraints are rewritten (#4187).

The drop-default-constraint block CodeGen runs when a `__mj_CreatedAt` / `__mj_UpdatedAt` default does not match `GETUTCDATE()` opens with `DECLARE @constraintName`. CodeGen executes each block as its own query, so nothing fails at CodeGen time — but the SQL log writes the blocks back to back with no `GO`, and a migration built from that log (the documented `cat CodeGen_Run_*.sql >>` step) fails on a clean database with "The variable name '@constraintName' has already been declared". Reported against v6.1.0-edge.4 and edge.5, where `IdentityClaim` and `IdentityClaimType` ship `SYSUTCDATETIME()` defaults and trip the rewrite on every run.

- `dropExistingDefaultConstraint` now emits the provider's batch separator after the block, matching the add-column path.
- `SQLLogging.appendToSQLLogFile` forces a separator after any logged unit that opens with a top-level T-SQL `DECLARE @…`, so a future caller that forgets cannot reintroduce the bug. An empty separator (PostgreSQL) no longer produces a stray blank line.
- New migration `V202609071727__v6.1.x__IdentityClaim_UTC_Default_Normalization.sql` rewrites the four `IdentityClaim` / `IdentityClaimType` defaults to `GETUTCDATE()` so CodeGen stops churning them. Idempotent on databases where CodeGen already did so.
