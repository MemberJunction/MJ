# PG Migration Glossary

The language of MemberJunction's dual-platform (SQL Server → PostgreSQL) migration release process: how schema and metadata reach deployed databases, and what can go missing on the way.

## Language

**Curated metadata**:
Release-shipped data rows (AI models, skills, API scopes, templates…) whose source of truth is the declarative JSON under `/metadata/`, applied to databases via metadata-sync migrations.
_Avoid_: seed data, reference data, system metadata (that's CodeGen's Entity/EntityField rows)

**Metadata-sync migration**:
A versioned migration captured from an `mj sync push` SQL logging session (`*_Metadata_Sync.sql`), carrying one release's curated-metadata DML as stored-procedure calls.
_Avoid_: data migration, seed script

**PG ledger**:
The committed, deployed history under `migrations-pg/v5/` — immutable once shipped; errors are corrected by forward migrations, never by rewriting entries.

**Marker file**:
A comment-only `.pg.sql` counterpart standing in where real converted DML belongs — the failure artifact of converting a metadata-sync migration with the wrong converter.
_Avoid_: stub (the content gate uses "stub" for header-only DDL outputs; a marker additionally claims the omission is intentional)

**Migrate-only deployment**:
A PostgreSQL database whose entire state came from `mj migrate` — it never ran `mj sync push`, so it owns only what the ledger delivered.

**Gapped**:
Missing v5.45's curated metadata — true of both migrate-through deployments (they executed the marker) and fresh installs from the v5.46 baseline (it was dumped from a gapped database).

**Baseline**:
A `B*.pg.sql` snapshot (schema + data) that a fresh install starts from instead of replaying earlier versioned migrations; inherits whatever gaps the database it was dumped from had.

**Reseed migration**:
A forward-dated, idempotent migration that re-applies curated metadata a past release failed to deliver, converging every deployment regardless of how it became gapped.
_Avoid_: backfill (used in this repo for hand-written DML migrations), hotfix

**Superseded update**:
A v5.45 update whose target row a later release's metadata-sync re-updated (full-row); replaying it would revert the newer state, so the reseed must exclude it.

## Relationships

- A **Baseline** plus subsequent versioned migrations produce a **Migrate-only deployment**'s state
- A **Marker file** in the **PG ledger** makes every deployment that executes it **Gapped**
- A **Reseed migration** converges **Gapped** deployments forward; it never rewrites the **PG ledger**
- A **Superseded update** is excluded from a **Reseed migration**; unsuperseded creates/updates/deletes are replayed idempotently

## Example dialogue

> **Dev:** "The v5.45 PG file is broken — can we just fix `V202607071019__v5.45.x__Metadata_Sync.pg.sql`?"
> **Release engineer:** "No — that entry is in the **PG ledger**; deployed databases have its checksum. We ship a **reseed migration** that re-applies the missed **curated metadata** idempotently."
> **Dev:** "Then fresh installs are fine, right? They start from the v5.46 **baseline**."
> **Release engineer:** "They're **gapped** too — that baseline was dumped from a database that executed the **marker file**. The reseed runs after the baseline, so it heals both populations."

## Flagged ambiguities

- "stub" vs "marker": the content gate (`check-pg-migration-content.mjs`) classifies header-only outputs as stubs; the v5.45 artifact is a *marker* — it affirmatively (and wrongly) claims there was nothing to translate. Resolved: use **marker file** for comment-only counterparts claiming intentional omission.
- "reseed" previously implied "run `mj sync push` again" (the marker's own suggestion). Resolved: a **reseed migration** lives in the ledger and needs no out-of-band CLI step.
