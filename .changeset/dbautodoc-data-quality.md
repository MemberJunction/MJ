---
"@memberjunction/db-auto-doc": minor
---

Add a data quality phase (`analysis.dataQuality`, on by default). It reports orphaned and untrusted
foreign keys, always-NULL and constant columns, near-unique and undeclared-unique columns, placeholder
and future dates, values that fill the declared length, negative quantities, blank and untrimmed
strings, case and whitespace spelling variants, and numbers or dates stored as text. Most checks read
the statistics a run already collects; the rest come from one consolidated probe statement per table
and one anti-join per relationship the database does not already guarantee. Every check can be
switched off in `analysis.dataQuality.checks`, `probes: false` keeps only the checks that need no
extra SQL, and `analyze --skip-data-quality` skips the phase for one run.

Findings are written to `state.json`, `data-quality.md` and `data-quality.json`, and to a per-table
list in `summary.md`. The table-analysis prompt shows each column's findings, FK pruning sees measured
orphan rates, value lists fold spellings that differ only by case or surrounding spaces, and
`rowCount` becomes the exact count.

Also fixed: the discovery statistics merge no longer overwrites the sampled ranges and value
distribution or writes the null percentage as a fraction; drivers report an empty table as 0 rows
instead of 1; the table-analysis prompt now shows the table and schema names and the dependency
level; declared foreign key columns now show their target in the prompt; and declared foreign keys
carry whether the database trusts them (SQL Server `is_not_trusted`/`is_disabled`, PostgreSQL
`convalidated`).
