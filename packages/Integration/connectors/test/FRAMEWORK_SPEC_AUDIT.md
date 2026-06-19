# Integration Framework — 20-Point Spec Audit (READ-ONLY)

Exact-match verification of the MemberJunction integration FRAMEWORK against the 20-point
architecture spec. Verdicts: MATCH / PARTIAL / MISSING / DEVIATES / UNVERIFIED. Every verdict
cites `file:line`. No code was changed.

Paths are relative to repo root. Engine = `packages/Integration/engine/src/`,
Resolver = `packages/MJServer/src/resolvers/`, Server-integration = `packages/MJServer/src/integration/`.

---

## 1. Static metadata: standard tables w/ soft PKs, soft FKs, type + nullability — MATCH
The `SourceSchemaInfo` / `ExternalObjectSchema` / `ExternalFieldSchema` types carry exactly these:
`IsPrimaryKey` (407), `IsUniqueKey` (414), `IsForeignKey` (422) + `ForeignKeyTarget` (424),
`IsRequired` (391) distinct from `AllowsNull` (397), `MaxLength` (399) — Engine/types.ts:325-424.
Curated static metadata files instantiate these (e.g. `metadata/integrations/orcid/.orcid.integration.json:185-221`
shows `Type`, `IsRequired`, `IsPrimaryKey`, `AllowsNull` per IOF). PKs/FKs are SOFT (never hard DB
constraints) — `decideBooleanOverlay` overlays declared vs discovered; FK targets resolve by sibling
name at persist (`resolveFK`, Engine/IntegrationSchemaSync.ts:594). MATCH.

## 2. CompanyIntegration creates at runtime — MATCH
`IntegrationCreateConnection` mutation creates the Credential + CompanyIntegration row at runtime
(Resolver/IntegrationDiscoveryResolver.ts:2489-2516), with rollback on failure (:2326). MATCH.

## 3. Discover objects = OVERLAY (additive; fall-back-to-static; authoritative-gated reversible deactivation) — MATCH
- Overlay/additive + fall-back-to-static: `PersistDiscoveredSchema` is additive — declared objects
  preserved, runtime-only objects added as Discovered; `DiscoverObjects` failure is surfaced, never
  fatal, so declared static remains (Engine/IntegrationConnectorCreationPipeline.ts:253-346).
- Authoritative gate: deactivation runs only when `opts.DeactivateAbsent && SourceSchema.IsAuthoritative`
  (Engine/IntegrationSchemaSync.ts:376); pure decision in `decideAbsentDeactivations` returns empty
  unless BOTH flags set (:144-145). Absence-when-authoritative ⇒ `Status='Disabled'` (deactivate, never
  delete) (:405, :414). Reversible: REACTIVATE-on-rediscover flips Disabled→Active in the upserts
  (:491-493, :611-612). Non-authoritative discovery (cache-driven `IntrospectSchema` default
  `IsAuthoritative:false`, Engine/BaseRESTIntegrationConnector.ts:280) deactivates nothing. MATCH.

## 4. Discover columns from 3 sources (discovery endpoint, data header, AND streaming) — PARTIAL
Only TWO field-discovery sources exist: (a) a describe/cached-metadata endpoint via `DiscoverFields`
(Engine/BaseRESTIntegrationConnector.ts:254-263 — reads cached IO fields; a live-describe connector
overrides), and (b) STREAMING the data via `DiscoverFieldsViaStream` (Engine/BaseIntegrationConnector.ts:530)
/ `DiscoverFieldsViaFetch` (:620, falls back to single-sample `DiscoverFields` at :682). There is NO
distinct THIRD "data header" source (no response-header / column-header inspection path) — grep for a
header-based column source returns nothing. The "single-sample DiscoverFields" is best read as a
degenerate streaming case, not a separate header source. PARTIAL — 2 of 3 sources; "data header"
source is absent.

## 5. Stream-n-rows for fields ALWAYS + stats/LLM ideation infers columns + types → added to metadata — PARTIAL
- Stream-always so entities aren't dropped when PKs aren't returned: `DiscoverFieldsViaStream` streams
  the read path, never fabricates a key, falls back to a SOFT best-available key so a PK-less object
  stays syncable rather than being dropped (Engine/BaseIntegrationConnector.ts:541-602; soft fallback
  rationale :549-561). Columns + types accumulated in one pass (Engine/StreamingDiscovery.ts:95-138).
- Type inference: PURELY STATISTICAL — `inferColumnTypeFromSamples` narrows bool/number/datetime only
  when every sample supports it, else generous string (Engine/CustomColumnPromotion.ts:133-161). The
  LLM is used ONLY as a last-resort PK TIEBREAKER (SoftPKClassifier via `LLMInference`,
  Engine/IntegrationConnectorCreationPipeline.ts:35-36, :441; `AmbiguousForLLM`,
  Engine/StreamingDiscovery.ts:189-264), NOT for column-or-type IDEATION. PARTIAL — stats infer
  columns+types; "LLM ideation infers columns + types" is not implemented (LLM = PK tiebreaker only).

## 6. All of the above resolves into soft keys — MATCH
Discovery-emitted PK is explicitly SOFT (rides additionalSchemaInfo / DDL, never a hard DB key — so a
wrong inference can't reject a row; engine dedupes via the record-map)
(Engine/BaseIntegrationConnector.ts:519-521). FK targets persist as soft `RelatedIntegrationObjectID`
(name→UUID at persist; unresolvable ⇒ FK-less, no fabricated constraint)
(Engine/IntegrationSchemaSync.ts:594-611). MATCH.

## 7. Discovery can run as a scheduled job — MATCH
`IntegrationCreateSchedule` selects the `discovery` driver (`IntegrationDiscoveryScheduledJobDriver`)
for cron schema-only refresh (Resolver/IntegrationDiscoveryResolver.ts:3974, :3986-3989), persisting an
`MJ: Scheduled Jobs` row with CronExpression/NextRunAt (:4008-4022). MATCH.

## 8. RSU + additionalSchemaInfo → ApplyAll creates the entities — MATCH
`IntegrationApplyAll` / `IntegrationApplyAllBatch` (Resolver:3181, :4781) run SchemaBuilder with
`AdditionalSchemaInfoPath` (:1502, :3068, :3723), then the RSU pipeline (migration → CodeGen → compile →
restart) via `RuntimeSchemaManager.Instance` (:3151, :3326, :4398). The soft PKs feed
`SchemaBuilder.SoftPrimaryKeys` (:1646). MATCH.

## 9. DAG resolution: partition into L layers, no cycle — MATCH (inference source differs, see #10)
`buildEntityMapDependencyLayers` does Kahn topological layering; a cycle/unresolved node degrades by
placing the remainder in the current layer + emitting `DEPENDENCY_LAYERING_DEGRADED`
(Engine/IntegrationEngine.ts:1015-1042). MATCH on layer-partition + no-cycle.

## 10. DAG inferred from REST `/.../` path relationships — DEVIATES
The layer graph is built by `computeSelectedDependencyGraph` from the PERSISTED FK metadata
(`IntegrationObjectField.RelatedIntegrationObjectID`) — Engine/IntegrationEngine.ts:1064-1071 — NOT by
parsing REST `/parent/{id}/child` paths at sync time. The path-relationship inference
(`ResolveParentChain` / `TraversalOrder`) is a CONNECTOR/extractor-side concern and is absent from the
engine (0 hits in IntegrationEngine.ts). The engine consumes the already-resolved FK graph.
DEVIATES — correct topological layering, but the runtime path-inference described in the spec happens
upstream (metadata extraction), not in the engine's DAG resolution.

## 11. Merkle / partition hash-diff for fast batch resolution (skip unchanged batch w/o per-record fetch) — MATCH
`HashDiff` defines `partitionRecords` / `partitionRollupHash` (order-independent) / `diffPartitions`
(Engine/HashDiff.ts:55-130). WIRED in `applyViaPartitionReconcile`: builds rollups (IntegrationEngine.ts:2728),
loads prior snapshot (:2738), diffs (:2739), and SKIPS unchanged partitions without per-record fetch
(:2746-2756: `if (!toApply.has(partition)) { skippedRecords += recs.length; ...; continue; }`).
GATED behind opt-in `Configuration.partitionReconcile === true` (:2685-2686, default OFF) — reachable,
not dead code. MATCH (opt-in).

## 12. Scheduled sync — MATCH
`IntegrationCreateSchedule` (non-discovery JobKind) wires `IntegrationSyncScheduledJobDriver`
(Resolver:3986-3989); the driver lives in `packages/Scheduling/engine/src/drivers/IntegrationSyncScheduledJobDriver.ts`
and calls the engine's `RunSync`. The engine exposes a `Scheduled` trigger + `ScheduledJobRunID`
threading (IntegrationEngine.ts:659, :506). MATCH.

## 13. Additions + deletions incl. delete-on-absence / tombstoning; content-hash row-shift reasoning — MATCH
Orphan detection runs on `(fullSync || partitionReconcile) && fetchedExternalIDs.size > 0 &&
fetchCompletedCleanly` → `DeleteOrphanedRecords` (IntegrationEngine.ts:1929-1936). `DeleteRecord`:
`DoNothing` (:3498); SOFT tombstone sets `__mj_integration_SyncStatus='Archived'` +
`__mj_integration_IsTombstoned=true` + `__mj_integration_DeletedDetectedAt` (:3514-3527); HardDelete calls
`entity.Delete()` (:3530); tombstone cleared on re-sync (:3784). Row-shift handled: identity is per-record
ExternalID/`MatchedMJRecordID`, partition rollups order-independent (HashDiff.ts:77-86), so deletes don't
shift other records' hashes. MATCH.

## 14. Bidirectional write-back with congruence between systems — MATCH
`ProcessPushSync` (IntegrationEngine.ts:1975) reverse-maps via `DestToSource`/`Both` field maps (:2036),
filters echo-loops (:1972). 3-way conflict merge `computePushCombine` uses
`__mj_integration_LastSyncedSnapshot` as ancestor, classifies mj/ext changes per field (:2401-2459),
policy from `entityMap.ConflictResolution` (default DestWins, :2431). `ConflictRecency.mostRecentWinner`
imported (:51) + used in `resolveMostRecentWinner` comparing `__mj_UpdatedAt` vs `ext.ModifiedAt`
(:2499-2500); `Manual` quarantines (:2477). MATCH.

## 15. Error handling: transparency, transient retries, guardrails, per-record dead-letter — MATCH
`WithRetry` (RetryRunner, import :38) wraps fetch (:1614) + per-record save (:2892-2902), retrying only
`IsRetryableError`. Per-record DEAD-LETTER: a failed record is captured (`RecordsErrored++` + classified
`SyncRecordError` pushed to `result.Errors` + `logger.emit('sync.record.error',...)`) and the sync
continues — `applyRecordsIndividually` (:3035-3068) + concurrent path (:2903-2917). `SchemaNotGeneratedError`
is the one fail-stop (:2904/:3039). Transparency via SyncLogger (durable, GraphQL-queryable). MATCH.

## 16. Concurrency per-DAG-layer (advance only once dependencies complete) — MATCH
Layer loop `for (const layer of layers) { ... await RunAdaptive(layer,...) }` — the `await` per layer
is the gate: a layer fully drains before the next begins (IntegrationEngine.ts:986-1002). Within a layer,
maps run concurrently up to the adaptive cap. (Opt-in `runPipelinedDAG` cross-layer pipeline exists,
default OFF.) MATCH.

## 17. Adaptive rate-limiting (AIMD; settle at sustainable rate; honor Retry-After) — MATCH
`RateLimiter` is a per-key (IntegrationID) AIMD token bucket: `ReportThrottle` multiplicatively cuts the
effective rate (×0.5, floored at MinTokensPerSec) and FREEZES refills for `retryAfterMs` honoring
Retry-After (Engine/RateLimiter.ts:134-142); `ReportSuccess` additively ramps back toward the ceiling
(:148-152); `Acquire` waits for a token (:114-127). `AdaptiveConcurrencyController` adds AIMD on the
in-flight CAP (+1 success / ÷2 throttle, Engine/AdaptiveConcurrency.ts:63-69). MATCH.

## 18. GraphQL exposes all the above + customization + subscriptions + structured progress; data secure — MATCH
- Lifecycle mutations: CreateConnection (Resolver:2489), RefreshConnectorSchema (:1261), ApplyAll (:3181)
  / ApplyAllBatch (:4781), StartSync (:3747), WriteRecord (:3894).
- Subscription: `@Subscription IntegrationProgress` filterable by runID/CI/topic
  (IntegrationProgressResolver.ts:203-214); event shape RunID/Kind/EventType/Seq/Message/Stage/Level/DataJSON
  (:71-112). Pull counterpart `IntegrationTailRunEvents` reads `progress.jsonl` (Resolver:4655-4694).
- Customization: CreateEntityMaps/UpdateEntityMaps/DeleteEntityMaps (:2894/:4285/:4328) incl. field maps;
  per-tenant `IntegrationSetSyncConfig` (concurrency/rateLimit/partitionReconcile/deactivateAbsent JSON,
  :2681-2706); per-run entityMapIDs + syncDirection + fullSync (:3752).
- Secure: credentials are write-only `@InputType CreateConnectionInput.CredentialValues` (:530-536);
  output returns only `CredentialID` FK, never secret values (:553-559); every op calls
  `getAuthenticatedUser` + per-CompanyIntegration RLS (`userCanReadCompanyIntegration`, :2055-2077). MATCH.

  Caveat (not a spec failure): no `@RequireSystemUser`/role gate is applied (it is imported at :56 but
  unused) — authorization is user-auth + per-CI RLS only; destructive ops elevate internally
  (`getSystemUser`, :2034-2039).

## 19. MJ object-model tie-in: synced objects become first-class MJ entities — MATCH
ApplyAll runs SchemaBuilder → RSU → CodeGen (Resolver:3175-3176, :3151), which generates real MJ
EntityField/Entity + sproc/view layer for each materialized table; CodeGen-generated entities get
RunView/CRUD/permissions automatically and Record-Changes via the framework's built-in versioning (an
automatic MJ feature for all entities). The custom-column promoter even runs `provider.Refresh()` after
ADD COLUMN so new columns enter the metadata-driven framework (Server-integration/CustomColumnPromoter.ts:154).
MATCH.

## 20. Consumer-facing docs exist — MATCH
`packages/Integration/engine/README.md` (Quick Start :24, Creating a Custom Connector :37, Transform
Types :70, API Reference :104, Env Vars :161, Discovery :174); `packages/Integration/README.md` (Quick
Start, Data Model, Integration Actions); `packages/Integration/docs/README.md` (TOC, Package Map, Quick
Start, Build a new connector :77, Design Principles). MATCH.

---

## DEVIATION LIST (PARTIAL / MISSING / DEVIATES / UNVERIFIED)

- **4. PARTIAL** — Only 2 of 3 column-discovery sources exist: a describe/cached endpoint
  (`DiscoverFields`, BaseRESTIntegrationConnector.ts:254) and streaming the data
  (`DiscoverFieldsViaStream`/`ViaFetch`, BaseIntegrationConnector.ts:530/620). There is NO distinct
  "data header" source (no response-header / header-row column inference path). The single-sample
  `DiscoverFields` fallback is a degenerate streaming case, not a separate header source.

- **5. PARTIAL** — Stream-always + stats-based column/type inference is fully implemented
  (`inferColumnTypeFromSamples`, CustomColumnPromotion.ts:133-161; soft-key fallback so PK-less entities
  aren't dropped, BaseIntegrationConnector.ts:549-561). But "LLM ideation infers columns + types" is NOT
  implemented — the LLM is used ONLY as a last-resort PK tiebreaker (`SoftPKClassifier` / `AmbiguousForLLM`,
  StreamingDiscovery.ts:189-264; IntegrationConnectorCreationPipeline.ts:35-36,441), never to ideate
  columns or types.

- **10. DEVIATES** — DAG dependency is inferred from PERSISTED FK metadata
  (`IntegrationObjectField.RelatedIntegrationObjectID` via `computeSelectedDependencyGraph`,
  IntegrationEngine.ts:1064-1071), NOT from runtime REST `/parent/{id}/child` path parsing.
  `ResolveParentChain`/`TraversalOrder` are connector/extractor-side (metadata authoring time) and are
  absent from the engine. Topological layering itself (point 9) is correct; only the *inference source*
  differs from the spec's "inferred from REST path relationships" at sync time.
