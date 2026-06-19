---
"@memberjunction/integration-engine": minor
"@memberjunction/integration-engine-base": minor
"@memberjunction/integration-schema-builder": minor
"@memberjunction/integration-connectors": minor
"@memberjunction/server": minor
"@memberjunction/codegen-lib": patch
---

feat(integration): v2 integration framework + unified connector set (GrowthZone, OpenWater, ORCID, PropFuel, Path LMS)

Consolidated integration-v2 work — framework hardening + five connectors — proven end-to-end via the
GraphQL stand-up path (clean DB, CreateConnection → ApplyAll → StartSync) on SQL Server.

**Integration core (`integration-engine`, `integration-engine-base`, `integration-schema-builder`):**
- Deterministic §4 content-hash identity stamp for keyless rows (stable storage key + idempotent re-sync).
- Door-before-child dependency ordering derived from soft-FK `parentObjectName`/`ReferencedType` — children
  land in one pass (no ZERO_PARENTS, no second-sync self-heal).
- Adaptive rate-limit hooks (`RateLimitAcquire`/`Report`/`MaxConcurrency`) on `FetchContext`.
- Shared `auth-helpers` (`OAuth2TokenManager`); `KeySerialization`/`RecordFlatten` committed (were
  imported-but-untracked — fresh clones could not build); `IntegrationEngineBase.SeedForTesting` for
  offline replay harnesses.

**Schema correctness + sizing (`integration-engine`, `integration-schema-builder`):**
- `json`/`text`/`array`/`object` and unsized strings map to `NVARCHAR(MAX)`/unbounded text instead of
  being collapsed to `nvarchar(255)` — a nested-array JSON or long field routinely exceeds 255 and was
  dropped at sync time (OpenWater `Program.rounds` went from **0** rows to all of them). Bounded scalar
  strings keep a small, space-efficient size (255 floor; declared length + headroom when the source
  reports one; PK strings capped at the dialect index-key limit). Soft-PK columns are emitted nullable.
- String-overflow is **skip-and-surface** (`STRING_OVERFLOW_SKIPPED` SyncWarning via the new
  `StringOverflowError`), not truncate or fail-the-batch.
- **Active-only materialization (phantom-skip):** `buildSourceSchemaFromPersistedRows` materializes only
  `Status='Active'` objects/fields — no empty phantom tables, no wasted per-entity CodeGen/advancedGen cost.

**StartSync honesty (`server`):**
- `IntegrationStartSync` no longer returns optimistic `{Success:true, RunID:null}` for fast/no-op syncs;
  it resolves the run by recency over a bounded poll (real `RunID`), and returns `Success:false` with a
  message when no run record appears.

**Soft-PK config cache (`codegen-lib`):**
- `RunInProcess` invalidates `ManageMetadataBase`'s soft-PK/FK config cache per in-process run — the
  path-keyed cache went stale in the long-lived MJAPI RSU CodeGen path ("No primary key found" → entity
  never created → 0 rows synced until restart). Deterministic; the CLI `Run()` path is unchanged.

**Unified connector set (`integration-connectors`):**
- **GrowthZone** — OAuth2, 38 objects, idempotency + probe-amended pagination metadata.
- **OpenWater** — 25 objects, OpenAPI-complete.
- **ORCID** — 12 per-record objects, public-API live-verified.
- **PropFuel** — file-feed slice (rich REST API documented out-of-scope).
- **Path LMS (Blue Sky eLearn)** — GraphQL Reporting API, pull-only; GraphQL over `/graphql`, two-step
  app-credential → bearer auth; credential-free discovery from the public SpectaQL schema (84 record
  types / 1175 fields); per-object `AccessPath` walks the 16 GraphQL query doors to leaf records;
  content-hash idempotency.
- All five validated under the v2 architecture (RealityProbe / completeness-diff / T12 idempotency).

**Migration + metadata (additive schema → minor):** ships forward migration(s) + integration metadata
seeds; additive only — no column drops, narrowing, renames, or new required params — backward-compatible
**minor** per the publish-then-no-breaking-changes policy.
