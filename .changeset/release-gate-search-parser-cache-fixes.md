---
"@memberjunction/server": patch
"@memberjunction/sql-parser": patch
"@memberjunction/core": patch
"@memberjunction/unit-testing": patch
---

fix: three defects found by the 6.2.0-edge.0 integration gate.

- `SearchEntities` over GraphQL returned empty results on any server without a read-only database login: the resolver asked for the read-only provider with no fallback and got `null`.
- Query SQL that wraps a template value in quotes (`= '{{ X }}'`, `LIKE '%{{ X }}%'`) lost its deterministic field extraction: placeholder substitution added a second pair of quotes, so the SQL no longer parsed.
- A record saved inside a transaction that rolled back stayed in `BaseEngine` caches. Immediate cache mutations now follow the saving transaction: applied on commit, dropped on rollback.
- `registerTestLLM` now returns a `restore()` for long-lived processes that cannot reset singletons.
