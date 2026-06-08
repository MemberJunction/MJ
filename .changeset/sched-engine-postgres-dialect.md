---
"@memberjunction/scheduling-engine": minor
---

Make the scheduling engine's lock/stats sproc calls dialect-aware so scheduled jobs fire on PostgreSQL. The three atomic lock sprocs (acquire → stats-update → release) previously emitted hardcoded T-SQL `EXEC`, which PostgreSQL rejects with a syntax error on the first dispatch tick — meaning no scheduled job ever fired on PG. Calls now route through `provider.Dialect.ProcedureCallSyntax` (`EXEC` on SQL Server, `SELECT * FROM fn(...)` on PostgreSQL) via a new `buildLockSprocCall` helper, the lock-sproc permission probe skips cleanly on non-SQL-Server platforms, and a PG-only migration ports the three routines to plpgsql functions. SQL Server output is byte-identical to before — no behavioral change on the default platform.
