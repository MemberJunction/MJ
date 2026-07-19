---
"@memberjunction/codegen-lib": patch
---

FK auto-indexing is now ON by default. `autoIndexForeignKeys()` previously returned `false`
when the `auto_index_foreign_keys` setting was absent, so any deployment that never set it
explicitly — including distribution installs, where the setting shipped commented out —
generated no `IDX_AUTO_MJ_FKEY_*` indexes at all.

**Notable behavior change:** after upgrading, a CodeGen run on a deployment that never set the
setting will begin emitting FK index DDL for new/modified entities where it previously emitted
none. The generated DDL is idempotent (`IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`), so
re-runs are no-ops. On large existing tables the initial index creation takes a lock and should
be scheduled accordingly. To keep the old behavior, set
`{ name: 'auto_index_foreign_keys', value: false }` explicitly in your config.

Rationale: neither SQL Server nor PostgreSQL auto-indexes FK columns, and MJ leans on them
heavily — generated base views join FK relationships, `RunView` filters on them, and CodeGen
emits cascade-delete logic that walks children by FK. A missing FK index degrades silently and
is hard to diagnose; a surplus index is cheap and trivially reversible.

`distribution.config.cjs` now ships the setting explicitly enabled so downstream installs are
immune to future default drift.
