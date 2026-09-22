---
"@memberjunction/cli": patch
---

`mj migrate` now recognizes a primary-key collision (SQL Server error 2627) caused by `mj sync push` planting a row before the migration that creates it has run, and prints the blocking table, the row's GUID, and a ready-to-paste `mj migrate repair --id <guid> --entity <schema>.<table>` command instead of a raw SQL error. The new `mj migrate repair` command deletes exactly that row after showing a preview of its columns and confirming (or non-interactively with `--yes`), so a stuck upgrade can be cleared and re-run without hand-editing the database (#4503).
