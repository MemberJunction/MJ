# PostgreSQL Migrations — Reviewer Guide

This directory holds the v5.30 PG baseline. The PR shipping this work spans runtime fixes, converter improvements, the baseline itself, and supporting tooling.

If you're reviewing the PR, **start here.** This page indexes everything in recommended reading order.

---

## Recommended reading order

### 1. Orientation (5 min)

- **[PR_DESCRIPTION_pg_tooling.md](../PR_DESCRIPTION_pg_tooling.md)** *(at repo root)*
  Top-level overview of what's in this PR, the two-paths framing (baseline vs. historical migrations), known limitations, and a test plan.

### 2. Install + usage (5–10 min)

- **[plans/pg-migration-architecture/DEV_ON_PG_GUIDE.md](../plans/pg-migration-architecture/DEV_ON_PG_GUIDE.md)**
  End-to-end developer guide for running MemberJunction against PostgreSQL. Setup → migrations → CodeGen → MJAPI → Explorer. Includes the **required post-install step** for fresh PG installs (`mj sync push --dir metadata`).

- **[V5_30_NOTES.md](V5_30_NOTES.md)**
  Quick reference for what landed in v5.30 PG and what's deferred to v5.30.1. Top-of-file ⚠️ callout for the post-install metadata sync requirement.

### 3. Verification + testing (10–15 min — the rigor)

- **[TESTING_GUIDE.md](TESTING_GUIDE.md)**
  Comprehensive reference for every test, audit, and verification gating this PR. Documents:
  - The **two-PR paths** (baseline vs. historical migrations)
  - Unit tests across SQLConverter (856), CodeGenLib (477), PostgreSQLDataProvider (90), monorepo (321 packages)
  - Database-level verification: per-migration completeness audit, schema dump diff, snapshot scripts, autoQuoter coverage
  - The full chain showing how the baseline was built and validated
  - CI workflows (test.yml, pg-migrations.yml, changes.yml)
  - Helper scripts (regenerate, audit, snapshot)
  - Known v5.30.1 deferrals
  - End-to-end pre-merge verification table

### 4. Deeper context (skim if needed)

- **[plans/pg-migration-architecture/ARCHITECTURE_PLAN.md](../plans/pg-migration-architecture/ARCHITECTURE_PLAN.md)**
  Multi-phase architecture plan that frames this PR's work within the larger PG migration strategy.

- **[plans/pg-migration-architecture/PG_MANUAL_FIXES_CATALOG.md](../plans/pg-migration-architecture/PG_MANUAL_FIXES_CATALOG.md)**
  Every manual fix, workaround, and configuration change applied to get a PG install end-to-end working. Categorized by what should be automated vs. baked into the baseline vs. left to developers.

- **[scripts/README-migration-equivalence.md](../scripts/README-migration-equivalence.md)**
  Workflow for verifying SS↔PG schema parity per migration via the snapshot scripts.

### 5. Historical reference (skip on first read)

- **[PG_MIGRATION_REPORT.md](PG_MIGRATION_REPORT.md)**
  Point-in-time conversion report from March 2026. Pre-dates the v5.30 baseline approach. Kept for historical record.

- **[../PG_WORK_SUMMARY.md](../PG_WORK_SUMMARY.md)** *(at repo root)*
  Earlier work summary with broader context.

---

## TL;DR for the impatient reviewer

- **What the PR does:** brings MJ to a state where it runs end-to-end on PostgreSQL — including managed PG (RDS, Aurora, Cloud SQL, Azure) — on dev machines and self-hosted environments.
- **The big change in this directory:** `B202604301800__v5.30__PG_Baseline.pg.sql` is a single 41 MB file that contains every v5.0–v5.30 schema change. A fresh PG install applies this baseline + runs `mj codegen` + runs `mj sync push --dir metadata` and is at v5.30 state.
- **Two paths to choose:** This PR ships the baseline path. The companion `pg-migration-files` worktree branch ships the alternative — full historical migration content matching SS history. **Reviewer picks one.**
- **Verification:** Per-migration audit confirms 0/5,721 declared objects are missing across 107 migrations. Schema dump diff and snapshot scripts both show byte-identical state between the baseline-applied DB and a DB built by applying every migration directly. (See [TESTING_GUIDE.md](TESTING_GUIDE.md).)
- **Known gaps deferred to v5.30.1:** v5.30 metadata sync (workaround documented), RDS dry-run (high confidence from local PG 18 testing, not yet observed on actual RDS).

---

## Files in this directory

| File | What it is |
|---|---|
| `README.md` | This file. |
| `V5_30_NOTES.md` | v5.30 release notes. |
| `TESTING_GUIDE.md` | Comprehensive testing/verification reference. |
| `PG_MIGRATION_REPORT.md` | Historical March 2026 report. |
| `v5/B202604301800__v5.30__PG_Baseline.pg.sql` | The v5.30 baseline (41 MB). |
