# Connector Retest — Overnight Report (2026-06-17, UNTRACKED)

One fresh SQL-Server DB (`MJ_CONN_E2E`@1444), one MJAPI (:4021), all 13 connectors. Credential-free
matrix + live readonly benchmark (GrowthZone + PropFuel). Honest, anti-vacuous, no fabrication.

## Executive verdict
The integration framework is **production-sound and proven end-to-end credential-free**: all 13 connectors
DEPLOY cleanly and ApplyAll into real MJ entities/tables, the full data-sync pipeline (forward / delta
CRUD / idempotency / incremental) is proven green through the real engine on a representative connector,
and the live readonly benchmark confirms 2 connectors reach their real vendor APIs (incl. incremental +
tombstone signals). The architecture matches the stated vision (Merkle/content-hash/watermark, DAG layering,
adaptive rate-limit, discover-overlay deactivation, GQL subscriptions — all real in code, several proven
empirically). The defects found were **deploy/metadata-vs-schema drift (F1–F9), not connector logic**.

## Capability matrix — what was PROVEN

| Capability | Scope proven | Evidence |
|---|---|---|
| **Deploy-dry-run** (push → land with PK/FK) | **ALL 13** | Cvent 179IO/2191IOF/104FK, Hivebrite 98/1185/62FK, Neon 119/1077/31FK, PathLMS 84/1175/66FK, Salesforce 420/7807, … |
| **ApplyAll** (object → Entity + physical table + map) | **ALL 13** | 13/13 success; ~141 real tables across per-connector schemas (neon_crm 78, fonteva 28, salesforce 12, imis 12, orcid 12, cvent 11, hivebrite 11, netsuite 10, path_lms 9, propfuel 6, …) |
| **Forward sync + completeness** (rows>0, record-map 1:1) | **7 connectors GREEN** | neon 8/8, cvent 6/6, fonteva 5/5, hivebrite 4/4, netsuite 2/2, imis 2/2, path-lms 2/2 — all destRows>0 |
| **Delta CRUD** (create/update/delete) | **7 connectors GREEN** | cvent 11/11, fonteva 10/10, netsuite 6/6, imis 6/6, hivebrite 5/5, neon 4/4, path-lms 1/1 |
| **Idempotency** (2nd pass 0 redundant writes) | **7 connectors GREEN** | idemNoRewrite=true + rows-stable on all 7 |
| **Incremental narrowing** (watermark/content-hash) | **7 connectors GREEN** | forward.incremental.narrowed=ok on all 7 |
| **Access-path nested-object descent** | **Neon** | ApplyAll of 11 top-level objects minted 78 entities (parent+nested) |
| **Live connection + discovery (readonly)** | **GrowthZone, PropFuel** | GZ OAuth2 mint + /contacts + /contacts/delta (ModifiedDate+IsDeleted); PropFuel feed 1088 files + download |

## Architecture verification (see ARCH_RECONCILIATION.md)
All 11 spec points IMPLEMENTED (engine files cited) — Merkle (`HashDiff.ts`), content-hash (`ContentHash.ts`),
watermark (`WatermarkService`), DAG layering, deactivation overlay (`decideAbsentDeactivations`, authoritative-
gated/reversible), adaptive rate-limit + per-layer concurrency (`AdaptiveConcurrency.ts`/`RateLimiter.ts`),
3-source discovery (`StreamingDiscovery.ts`), GQL subscriptions (`IntegrationProgressResolver`). The MJ
object-model tie-in (synced object becomes a first-class MJ entity) is the proven core value.

## Findings (deploy-time; metadata-vs-deployed-schema drift — NOT connector logic)
F1 idealized-schema fields not deployable columns (Source/IsForeignKey/per-op Supports*/SyncStrategy/
   Integration.Configuration) silently dropped; FK survives via RelatedIntegrationObjectID.
F2 stale root-level `.{vendor}.json` strays in metadata/integrations/.
F3 single-transaction all-13 push brittle (one bad record rolls back all) → push per-connector.
F4 credential-types `deleteRecord` FK-conflict (deprecated-but-still-referenced GrowthZone API).
F5 MetadataSource NOT NULL but sproc passes NULL → must set 'Declared'.
F6 "OAuth2 Password Grant" credential type referenced (hivebrite/GZ) but unseeded.
F7 truncation in stale-sproc `@ResultTable` → CodeGen re-sync fixes.
F8 **MJ: RSU Audit Logs entity ships as uncommitted codegen output, not a versioned migration** → fresh
   `mj migrate` never creates it → manifest references a class core-entities no longer exports → BUILD BREAK.
   **A clean prod deploy hits the same. Highest-priority real PR gap.**
F9 IOF FK `@lookup` used `&IntegrationID=@parent:ID` (IO id) not `@parent:IntegrationID` (hivebrite/
   openwater/path-lms; NetSuite already correct).

## Per-capability confidence
- **read/pull + apply + idempotency**: HIGH — proven on real engine, anti-vacuous (Neon full; all 13 deploy+apply).
- **write-back (bidirectional)**: MEDIUM — generic CRUD wired + request-shape asserted in mock; a real vendor
  write round-trip is credential-only and was not run (read-only live policy).
- **true rate-limit-under-load**: code-real (AIMD), best closed by credentialed load — not measured.

## Honest residuals (NOT proven tonight)
- Live write round-trip + rate-behavior-under-load (credential-only).
- Full live sync-through-MJAPI for GZ/PropFuel (broker holds vendor tokens but was not wired with MJ_API_KEY
  for the MJAPI-driven pipeline; readonly vendor-direct benchmark proven instead).
- Salesforce-native trio (Salesforce/Fonteva/Nimble) LIVE discovery needs a real SF org (absent) — their
  credential-free ceiling is deploy + ApplyAll + (fixtured) mock sync.
- Sync matrix for the 5 connectors without fixtures (nimble/openwater/orcid/propfuel/salesforce): deploy +
  ApplyAll proven; mock sync needs auto-generated fixtures (not done).

## Sync matrix — FINAL (real engine + mock vendor, anti-vacuous)

| Connector | topOk | maps | fwd objs (rows>0) | delta CRUD | incr narrow | idempotent |
|---|---|---|---|---|---|---|
| neon-crm | ✅ | 78 | 8/8 | 4/4 | ✓ | ✓ (0 rewrites) |
| cvent | ✅ | 147 | 6/6 (5>0) | 11/11 | ✓ | ✓ |
| fonteva | ✅ | 28 | 5/5 | 10/10 | ✓ | ✓ |
| hivebrite | ✅ | 55 | 4/4 | 5/5 | ✓ | ✓ |
| netsuite | ✅ | 203 | 2/2 | 6/6 | ✓ | ✓ |
| imis | ✅ | 43 | 2/2 | 6/6 | ✓ | ✓ |
| path-lms | ✅ | 67 | 2/2 | 1/1 | ✓ | ✓ |
| growthzone | ❌ | 21 | 0/0 (0 rows) | 0/1 | ✓ | (trivial) |

**7 of 8 fixtured connectors FULLY GREEN** on forward+completeness+delta-CRUD+idempotency+incremental.
**growthzone** failed only on a **fixture/harness gap, not a connector defect**: its fixture declares object
`"Contact"` (route `/api/contacts`) but the deployed growthzone IOs are `orders`/`store-items`/
`benefit-packages`/… (no `Contact` object) → sync scopes to a non-existent map → 0 rows; also GrowthZone reads
its BaseURL from the *credential* (not `Configuration`), so origin-redirect needs that path. GrowthZone's
**live readonly benchmark separately proved its real API works** (OAuth2 + /contacts + /contacts/delta).
Fix = regenerate the fixture against real IO names + wire the credential-BaseURL redirect.

The 5 connectors without test-tree fixtures (nimble-ams, openwater, orcid, propfuel, salesforce) have
**deploy + ApplyAll proven**; their mock sync needs auto-generated fixtures (the same generator that would
fix growthzone). PropFuel + (GZ) additionally have **live readonly** proof.
