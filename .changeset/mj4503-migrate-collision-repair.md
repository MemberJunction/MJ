---
"@memberjunction/cli": patch
---

When a migration fails on a primary-key collision (SQL Server error 2627), `mj migrate` now adds — after the raw error — the table and GUID of the row already holding that key, and a ready-to-paste `mj migrate repair` command for it. The new `mj migrate repair` command deletes exactly that one row, after showing a preview of its identifying columns and confirming (`--yes` for non-interactive use); an optional `--migration <path>` makes it verify the row belongs to the migration that failed before deleting anything. Together these let an operator clear a row that a database already holds ahead of the migration chain and re-run the upgrade, without hand-editing the database (#4503).
