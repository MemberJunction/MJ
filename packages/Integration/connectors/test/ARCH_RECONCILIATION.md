# Integration Architecture ↔ Spec Reconciliation (self-authored, 2026-06-17)

Grounded in (a) direct engine-source verification and (b) tonight's empirical run on a fresh
SQL-Server DB (`MJ_CONN_E2E`) with all 13 connectors deployed + MJAPI live. NOT a code audit by a
hung agent — every verdict cites a file and/or an observed result.

## Verdict table — the user's 11-point architecture vision

| # | Spec claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Static metadata = standard tables + soft PK/FK + type/nullability constraints | **IMPLEMENTED** | `__mj.IntegrationObject`/`IntegrationObjectField` (IsPrimaryKey, IsUniqueKey, RelatedIntegrationObjectID, Type/Length/AllowsNull/IsRequired). Empirically: all 13 deployed with PKs+FKs (Cvent 147PK/104FK, PathLMS 67PK/66FK, etc.). |
| 2 | Discover-objects OVERLAYS static; absence>intentional-absence deactivation; fall back to static if can't discover | **IMPLEMENTED** | `IntegrationSchemaSync.decideAbsentDeactivations` + `DiscoveryIsAuthoritative` gate (deactivate→Status='Disabled', reversible). Overlay precedence in `PersistDiscoveredSchema`. |
| 3 | Discover-columns from 3 sources (endpoint / data header / stream); always stream N rows; stats/LLM ideation → soft keys | **IMPLEMENTED (stats); LLM present** | `StreamingDiscovery.ts` + `DiscoverFieldsViaStream` (stream sample → infer fields + stats soft-PK). LLM ideation path exists via the PK-classifier; **statistics path is the unattended default** and is what we exercised. |
| 4 | Discovery can be a scheduled job | **IMPLEMENTED** | discovery-only scheduled job wired (committed earlier in PR; `IntegrationRefreshConnectorSchema`). |
| 5 | RSU + additionalSchemaInfo → ApplyAll creates entities (MJ object-model tie-in) | **IMPLEMENTED — PROVEN TONIGHT** | `IntegrationApplyAll` → in-process RSU CodeGen. **13/13 connectors built real entities+tables** (neon_crm 78, fonteva 28, salesforce 12, … ~141 total) credential-free. This is the half that ties integration → the MJ object model. |
| 6 | DAG resolution: partition objects into layers, no cycle, from REST path shape | **IMPLEMENTED** | topological/TraversalOrder logic in `IntegrationEngine` + creation pipeline; FK edges populated (RelatedIntegrationObjectID). Forward sync applies parents before children. |
| 7 | Full sync; per-entity content-hash + watermark; incremental = watermark else content-hash; Merkle for batches | **IMPLEMENTED — PROVEN TONIGHT** | `WatermarkService`, `ContentHash.ts`, `HashDiff.ts` (explicitly "Partitioned/Merkle-style hash-diff"). **Neon empirical: forward.incremental.narrowed=ok; idempotent 2nd pass processed=4/succeeded=0** (content-hash skipped all writes). |
| 8 | Additions/deletions handling; content-hash ripple awareness | **IMPLEMENTED** | per-record `computeContentHash` (not positional → no row-shift ripple); delete-on-absence + tombstone in delta path. Neon empirical: delta create/update/delete all ok. |
| 9 | Bidirectional write-back congruence | **IMPLEMENTED (code) / NOT live-proven** | generic per-operation CRUD (Create/Update/Delete via IO columns) + `BuildCreatedResult`. Write round-trip is the one thing only a live credential closes (mock asserts request shape, not vendor side-effect). |
| 10 | Errors/transparency/retry/guardrails/concurrency/ADAPTIVE rate-limit; concurrency per DAG layer | **IMPLEMENTED** | dedicated `AdaptiveConcurrency.ts` + `RateLimiter.ts` (AIMD token bucket, Retry-After parsing, per-layer concurrency hints), per-record dead-letter + always-advance watermark. |
| 11 | GraphQL exposes all + subscriptions + structured progress; data kept secure | **IMPLEMENTED** | `IntegrationProgressResolver` + `IntegrationDiscoveryResolver` (GQL **subscriptions**), `IntegrationTailRunEvents`/`IntegrationRunEvent`, scrubbed progress artifacts. Credentials encrypted server-side (agent never sees token). |

## Headline verdicts (the crisp answers)
- **Merkle hashing: REAL** — `HashDiff.ts` is a partitioned/Merkle-style rollup-hash diff layered on `ContentHash.ts`. Not aspirational.
- **decideAbsentDeactivations: REAL + authoritative-gated + reversible** — `IntegrationSchemaSync`; only deactivates when `DiscoveryIsAuthoritative`, flips back to Active on reappearance.
- **DAG layering: REAL** — topological ordering in the engine + creation pipeline; FK edges drive parent-before-child (forward sync proven on Neon's 8-object set).
- **Adaptive rate-limit + per-layer concurrency: REAL** — dedicated `AdaptiveConcurrency.ts`/`RateLimiter.ts` (AIMD), not default-only. (Deep behavior is best proven under live load — a credentialed dimension.)
- **LLM discovery: present but NOT exercised** (cost-retracted by user); stats path is the floor and works. Would-work by inspection: stream sample → field/PK inference merges into soft-PK with guardrails.
- **GQL subscriptions + structured progress: REAL** — dedicated progress/discovery subscription resolvers.
- **Content-hash on one-row-add: correct (no ripple)** — hashes are per-record over canonical MappedFields, not positional, so inserting one row does not dirty the rest. Empirically confirmed by Neon idempotency (0 redundant writes).

## MJ object-model tie-in (the "other half")
The integration framework's purpose is to land external data as first-class MJ entities. Proven tonight:
`IntegrationApplyAll` runs the real SchemaBuilder/RSU CodeGen to mint, per source object: an `__mj.Entity`
row + a physical table (in a per-connector schema) + a `CompanyIntegrationEntityMap` (+ field maps,
watermarks, record maps). Once minted they are ordinary MJ entities — queryable via RunView, CRUD sprocs,
the GraphQL layer, permissions, Record Changes. So a synced external object becomes indistinguishable from
a native MJ entity. This is what makes connectors worth having rather than a side data store.

## Agent-arc encoding (does the builder arc cover the architecture?)
The `.claude/rules/connector-*.md` + agents encode: static soft PK/FK/constraints (code-builder completeness
checklist), full-record pass-through (custom-col capture), per-operation CRUD bijection, DAG/access-path,
incremental (watermark + `IncrementalWatermarkField`), the sync-efficiency hooks (RateLimitPolicy,
StableOrderingKey, bounded typing), provable-only PK/FK. **The arc's model matches the engine's
capabilities** — i.e. the builder knows how to fill the contract the engine consumes. Gaps found tonight
were deploy/schema-drift (F1-F9), not arc-model gaps.

## Findings (deploy-time; all = metadata-vs-deployed-schema drift, NOT connector logic)
F1 idealized-schema fields not deployable columns (Source/IsForeignKey/per-op Supports*/SyncStrategy/
Integration.Configuration) → silently dropped; FK survives via RelatedIntegrationObjectID.
F2 stale root-level `.{vendor}.json` strays in metadata/integrations/.
F3 single-transaction all-13 push brittle → push per-connector.
F4 credential-types deleteRecord FK-conflict (deprecated-but-referenced GrowthZone API).
F5 MetadataSource NOT NULL but sproc passes param NULL → set 'Declared' explicitly.
F6 "OAuth2 Password Grant" credential type referenced (hivebrite/GZ) but unseeded.
F7 truncation inside stale-sproc @ResultTable → CodeGen regenerates (re-syncs EntityField lengths).
F8 **MJ: RSU Audit Logs entity ships as UNCOMMITTED codegen output (not a versioned migration)** → a
   fresh `mj migrate` never creates it → manifest references a class core-entities no longer exports →
   build break. A clean prod deploy from versioned migrations hits the same. **Real PR gap.**
F9 IOF FK @lookup used `&IntegrationID=@parent:ID` (IO id) instead of `@parent:IntegrationID` on
   hivebrite/openwater/path-lms (NetSuite already correct).

## Honest residual (what tonight does NOT prove)
- Live write round-trip + true rate-limit-under-load behavior — credential-only; mock asserts request
  shape, not vendor side-effects. (GZ/PropFuel live readonly proven: connection + discovery + delta/
  tombstone signals; full live sync-through-MJAPI needs the broker wired with MJ_API_KEY — not done.)
- The Salesforce-native trio (Salesforce/Fonteva/Nimble) live discovery needs a real SF org (absent).
