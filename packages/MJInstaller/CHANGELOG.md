# @memberjunction/installer

## 5.40.2

## 5.40.1

## 5.40.0

## 5.39.0

### Patch Changes

- cd4f6e7: Remote distribution fetch for `mj install`, plus a new `mj bundle` command.
  - `mj install` (distribution mode) now blobless-sparse-checks-out the source at the resolved tag and assembles the distribution layout on demand, replacing the committed bootstrap zip.
  - New `mj bundle` builds a self-contained distribution zip for offline/air-gapped installs. `--with-migrations` ships both the SQL Server (`migrations/`) and PostgreSQL (`migrations-pg/`) trees by default; `--db-platform sqlserver|postgresql` narrows to one.
  - `mj migrate` fetches only the migration slice it needs. It first reads the database's current version from the Skyway history table and chooses accordingly: a **fresh** database gets `baseline + tail`, while an **existing** database is upgraded with the versioned migrations _after_ its current version (no baseline) — fixing a gap where upgrading a database that sits below a newer baseline silently skipped the intermediate migrations. The detected version is shown in the CLI output.
  - `mj migrate` also runs a TLS-aware connection preflight (also available standalone via `--check-connection`) that surfaces an actionable hint — e.g. set `DB_TRUST_SERVER_CERTIFICATE=1` for a self-signed cert — instead of a cryptic mid-migration error.
  - The installer-generated MJExplorer environment files are emitted `as const` so union fields keep their literal types.

## 5.38.0

## 5.37.0

## 5.36.0

## 5.35.0

## 5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.

## 5.33.0

## 5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes

## 5.30.1

## 5.30.0

## 5.29.0

## 5.28.0

## 5.27.1

## 5.27.0

## 5.26.0

## 5.25.0

### Patch Changes

- f322a53: Add dual-mode installer supporting both distribution and monorepo installation methods.

## 5.24.0

## 5.23.0

### Patch Changes

- b589bef: Switch installer from distribution bootstrap ZIP to full monorepo source download. The installer now downloads the complete MemberJunction repository via GitHub's codeload CDN (not rate-limited) instead of the smaller bootstrap distribution ZIP.

## 5.22.0

## 5.21.0

## 5.20.0

## 5.19.0

## 5.18.0

## 5.17.0

## 5.16.0

## 5.15.0

## 5.14.0

## 5.13.0

## 5.12.0

### Patch Changes

- 714e42d: Add diagnostic report generation to `mj doctor` command. `--report` generates a basic diagnostic report (`mj-diagnostic-report.md`) with environment info, install state, and check results. `--report_extended` adds sanitized configuration file snapshots and service startup log capture (`mj-diagnostic-report-extended.md`). Passwords and secrets are automatically redacted. Also fixes process cleanup after service log capture and corrects key file detection for distribution installs.

## 5.11.0

## 5.10.1

## 5.10.0

## 5.9.0

## 5.8.0

## 5.7.0

## 5.6.0

## 5.5.0

### Patch Changes

- 1d3dec4: Add new headless, event-driven installer engine for MemberJunction. Features 9-phase install pipeline (preflight, scaffold, configure, database, platform compat, dependencies, migrate, codegen, smoke test), checkpoint/resume via state file, non-interactive CI/Docker mode (`--yes` + `--config`), `mj doctor` diagnostics, `--fast` optimistic mode, known-issue patching system, stdout-based service readiness detection, cross-platform Windows compatibility fixes, and 425 unit tests across 20 Vitest test files.
