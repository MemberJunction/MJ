---
"@memberjunction/core": minor
"@memberjunction/cli": patch
---

Azure-safe principal creation in baseline emitter, plus a freshly-generated v5.38.x baseline (`B202605291452__v5.38.x__Baseline.sql`).

- `emitPrincipals` now wraps cross-database `master.*` lookups inside `sp_executesql N'...'` string literals so Azure SQL's submission-time parser can't reject the batch. The `SERVERPROPERTY('EngineEdition') = 5` check sets `@associate = 1` on Azure, so the `master.dbo.syslogins` path never executes there — but only the dynamic-SQL wrapper prevents the parser from rejecting the batch before the IF can short-circuit it.
- New emitter test (`keeps cross-DB references inside string literals (Azure-safe)`) strips quoted literals from the emitted SQL and asserts zero `master.*` references survive outside string literals — regressions surface immediately.
- New v5.38.x baseline ships with the fix: 0 `master.*` refs outside string literals, 4 `sp_executesql` wrappers (one per SQL user), byte-equivalent to a V-stack-built source DB (0 object/row diffs across 46,432 rows). Previously published v5.34.x and v5.37.x baselines are intentionally untouched — Skyway auto-picks the latest baseline for fresh installs.
