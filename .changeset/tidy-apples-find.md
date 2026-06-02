---
"@memberjunction/cli": patch
"@memberjunction/installer": patch
---

Remote distribution fetch for `mj install`, plus a new `mj bundle` command.

- `mj install` (distribution mode) now blobless-sparse-checks-out the source at the resolved tag and assembles the distribution layout on demand, replacing the committed bootstrap zip.
- New `mj bundle` builds a self-contained distribution zip for offline/air-gapped installs. `--with-migrations` ships both the SQL Server (`migrations/`) and PostgreSQL (`migrations-pg/`) trees by default; `--db-platform sqlserver|postgresql` narrows to one.
- `mj migrate` fetches only the migration slice it needs. It first reads the database's current version from the Skyway history table and chooses accordingly: a **fresh** database gets `baseline + tail`, while an **existing** database is upgraded with the versioned migrations *after* its current version (no baseline) — fixing a gap where upgrading a database that sits below a newer baseline silently skipped the intermediate migrations. The detected version is shown in the CLI output.
- `mj migrate` also runs a TLS-aware connection preflight (also available standalone via `--check-connection`) that surfaces an actionable hint — e.g. set `DB_TRUST_SERVER_CERTIFICATE=1` for a self-signed cert — instead of a cryptic mid-migration error.
- The installer-generated MJExplorer environment files are emitted `as const` so union fields keep their literal types.
