# Heal PG ledger gaps with forward-dated idempotent reseed migrations

v5.45's `Metadata_Sync.pg.sql` shipped as a 126-byte marker (issue #3253), so every PostgreSQL
deployment that migrated through v5.45 — and every fresh install from the v5.46 baseline, which
was dumped from such a database — is missing that release's 161 curated-metadata rows. We fix
this with a forward-dated, idempotent reseed migration (`*_Reseed_v545_Metadata.pg-only.sql`)
rather than repairing history, because shipped migrations and baselines are an immutable ledger:
deployed databases hold their Flyway checksums, and any edit breaks validation for everyone who
already ran them.

## Considered Options

- **Rewrite the v5.45 marker in place** — rejected: breaks Flyway checksum validation on every
  deployment that already executed it, and does nothing for databases already past v5.45.
- **Regenerate the gapped v5.46 baseline** — rejected: same checksum problem for every install
  created from it, and does nothing for migrate-through deployments. (Future baselines self-heal:
  any database they are dumped from will have run the reseed.)
- **Fresh delta via `mj sync push` against a gapped database** — rejected: the push would emit
  current-JSON state, entangling unreleased v5.50-era metadata with the fix, and is not
  reproducible from the repo alone.
- **Replay the v5.45 source through the (fixed) legacy converter, post-processed** — chosen: the
  committed generator (`scripts/generate-v545-metadata-reseed.mjs`) guards each create with an
  `IF NOT EXISTS` on its primary key, excludes updates superseded by later releases' full-row
  re-updates (computed from the ledger, with a field-superset assertion), and guards the delete —
  so the file converges gapped databases and no-ops on whole ones.

## Consequences

- The reseed runs on every database, including whole ones (fresh baseline installs execute it
  too) — idempotency guards are therefore load-bearing, not defensive polish.
- The v5.45 marker and the gapped v5.46 baseline remain in the ledger permanently; the content
  gate grandfathers the marker and DEPLOYMENT.md documents why.
- Any future ledger gap of this class should be healed the same way: forward-dated, idempotent,
  derivation committed alongside the artifact.
