# PostgreSQL Migrations — Reviewer Guide

This directory holds the PG-specific docs and (post-merge) the PG migration files. The actual migration content for this release ships in the companion **`pg-migration-files`** PR; this PR (the runtime/converter/tooling PR) ships everything else needed to run MJ end-to-end on PostgreSQL.

If you're reviewing the PR, **start here.** This page indexes the docs in recommended reading order.

---

## Recommended reading order

### 1. Orientation (5 min)

- **[../PR_DESCRIPTION_pg_tooling.md](../PR_DESCRIPTION_pg_tooling.md)**
  Top-level overview of what's in this PR, known limitations, and a test plan. Note that the migration content lives in the companion `pg-migration-files` PR — both must merge together.

### 2. Install + usage (5–10 min)

- **[../plans/pg-migration-architecture/DEV_ON_PG_GUIDE.md](../plans/pg-migration-architecture/DEV_ON_PG_GUIDE.md)**
  End-to-end developer guide for running MemberJunction against PostgreSQL. Setup → migrations → CodeGen → MJAPI → Explorer.

- **[V5_30_NOTES.md](V5_30_NOTES.md)**
  Quick reference for what landed in v5.30 PG and what's deferred to v5.30.1.

### 3. Verification + testing (10–15 min — the rigor)

- **[V5_30_PR_REVIEW_GUIDE.md](V5_30_PR_REVIEW_GUIDE.md)**
  Step-by-step reviewer walkthrough specifically for this PR. Take a fresh PostgreSQL database from zero to a running MemberJunction instance: create DB → apply migrations → CodeGen → MJAPI bootup. Use this when you're actively reviewing the PR.

- **[../plans/pg-migration-architecture/PG_MIGRATION_TESTING_GUIDE.md](../plans/pg-migration-architecture/PG_MIGRATION_TESTING_GUIDE.md)**
  Comprehensive reference for every test, audit, and verification run during this PR's development:
  - Unit tests across SQLConverter (856), CodeGenLib (477), PostgreSQLDataProvider (90), monorepo (321 packages)
  - Database-level verification: per-migration completeness audit, schema dump diff, snapshot scripts, autoQuoter coverage
  - CI workflows (test.yml, pg-migrations.yml, changes.yml)
  - Helper scripts (audit, snapshot, etc.)
  - Known v5.30.1 deferrals
  - End-to-end pre-merge verification table

### 4. Deeper context (skim if needed)

- **[../plans/pg-migration-architecture/ARCHITECTURE_PLAN.md](../plans/pg-migration-architecture/ARCHITECTURE_PLAN.md)**
  Multi-phase architecture plan that frames this PR's work within the larger PG migration strategy.

- **[../plans/pg-migration-architecture/PG_MANUAL_FIXES_CATALOG.md](../plans/pg-migration-architecture/PG_MANUAL_FIXES_CATALOG.md)**
  Every manual fix, workaround, and configuration change applied to get a PG install end-to-end working. Categorized by what should be automated vs. baked into a baseline vs. left to developers.

- **[../scripts/README-migration-equivalence.md](../scripts/README-migration-equivalence.md)**
  Workflow for verifying SS↔PG schema parity per migration via the snapshot scripts.

### 5. Historical reference (skip on first read)

- **[PG_MIGRATION_REPORT.md](PG_MIGRATION_REPORT.md)**
  Point-in-time conversion report from March 2026.

- **[../PG_WORK_SUMMARY.md](../PG_WORK_SUMMARY.md)**
  Earlier work summary with broader context.

---

## TL;DR for the impatient reviewer

- **What this PR does:** brings MJ to a state where it runs end-to-end on PostgreSQL — including managed PG (RDS, Aurora, Cloud SQL, Azure) — on dev machines and self-hosted environments. Runtime fixes (autoQuoter), converter fixes (case-insensitive AS, sequence dedup, regression test gating), CodeGen fixes (PG output path), Skyway 0.6.0 integration, helper scripts, comprehensive docs.
- **Migration content:** lives in the companion `pg-migration-files` PR — full v5.0–v5.30 PG migration history, all rewritten to be managed-PG safe. Both PRs merge together.
- **Verification done during this PR's development:** per-migration audit (0/5,721 declared objects missing across 107 migrations on the canonical state), schema dump diffs, snapshot scripts, autoQuoter coverage (19/19 GraphQL queries pass on PG). See [PG_MIGRATION_TESTING_GUIDE.md](../plans/pg-migration-architecture/PG_MIGRATION_TESTING_GUIDE.md).
- **Known gaps deferred to v5.30.1:** v5.30 metadata sync (workaround: `mj sync push --dir metadata`), RDS dry-run (high confidence from local PG 18 testing, not yet observed on actual RDS).
