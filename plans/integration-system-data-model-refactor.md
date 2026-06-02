# Integration System-Data Model Refactor

Status: **design / discussion** (no code yet — superseded scope from the Phase 0 PR)
Branch context: `feat/integration-framework-expansion`
Companion: the connector-builder **agent** architecture on the other branch consumes the
same central artifact (the object dependency DAG) that the runtime engine here executes.

---

## 0. Framing

Integrations let a company pull unified external data into MJ. The hard part is **not**
transport (docs + curl + pagination are tractable). The hard part is that MJ does
*metadata-driven modeling* of an external system, so we must store provable metadata about
**tables and columns** — and external systems rarely state PK/FK/constraints explicitly.

Two guiding invariants throughout:

1. **Provable-only.** No constraint (PK, FK, NOT NULL, type narrowing, watermark) is recorded
   unless an authoritative source proves it. A source's *silence* is never evidence. (This is
   the rule the HubSpot PK-wipe bug violated: `undefined` from discovery was treated as `false`
   and overwrote declared PKs. Now fixed at the shared overlay site + pinned by unit test.)
2. **Completeness per instance.** When a company connects, we must discover *everything*
   provably gettable for THAT instance — overlay onto declared, add discovered/custom — with no
   silent gaps.

---

## 1. The current model (exact)

### Definition layer — what the external system *is*

| Entity | Role | Notable columns |
|---|---|---|
| `Integration` | Connector **type** | `ClassName`, `CredentialTypeID`, `BatchMaxRequestCount`, `BatchRequestWaitTime` (all already exist) |
| `CompanyIntegration` | Installed **instance** | `CredentialID`, schedule fields, lock fields (`IsLocked`/`LockedByInstance`/`LockExpiresAt`), `IsExternalSystemReadOnly` |
| `IntegrationSourceType` | SaaS-API / DB / FileFeed | `DriverClass` |
| `CredentialType`/`Credential`/`CredentialCategory` | Encrypted creds w/ JSON-schema field defs | `FieldSchema`, `Values` |
| `IntegrationURLFormat` | Deep-link templates | `URLFormat`, `EntityID` |
| `IntegrationObject` | A **table** in the external system | `APIPath`, `PaginationType`, full CRUD path/method/bodyshape set, `IncrementalWatermarkField`, `IsCustom`, `MetadataSource` |
| `IntegrationObjectField` | A **column** | type/len/prec/scale, `IsPrimaryKey/IsUniqueKey/IsRequired/AllowsNull`, `RelatedIntegrationObjectID`+`RelatedIntegrationObjectFieldName` (the FK), `IsCustom`, `MetadataSource` |

### Runtime / record-linking layer — how a record *flows*

| Entity | Role | Notable columns |
|---|---|---|
| `CompanyIntegrationRun`/`RunDetail` | Sync run log | per-record `Action`, `IsSuccess` |
| `CompanyIntegrationEntityMap` | External object → MJ entity | `SyncDirection`, `MatchStrategy`(JSON), `ConflictResolution`, `DeleteBehavior`, `Priority` |
| `CompanyIntegrationFieldMap` | Field → field | `Direction`, `TransformPipeline`, `IsKeyField` |
| `CompanyIntegrationRecordMap` | **External ID ↔ MJ ID** | ONLY: `CompanyIntegrationID`, `ExternalSystemRecordID`, `EntityID`, `EntityRecordID` |
| `CompanyIntegrationSyncWatermark` | Resume cursor per (EntityMap, Direction) | `WatermarkType`(Timestamp/Cursor/ChangeToken/Version), `WatermarkValue` |
| `RecordChange` | Built-in change tracking | `Source`(External/Internal/Restore), `IntegrationID`, `Type`, `ChangesJSON` |

### Structural reality: schema *intent* vs code *behavior*

The schema anticipated bidirectional/conflict/delete handling; the engine ignores almost all of it.

| Capability | Schema | Code actually does |
|---|---|---|
| Conflict resolution | `EntityMap.ConflictResolution` (4 modes) | only `Manual` handled; others → blind `Update` (last-write-wins) |
| Soft delete | `DeleteBehavior` (3 modes) | SoftDelete == HardDelete (both `entity.Delete()`) |
| Delete detection | — | orphan diff runs **only on full sync**; incremental never sees external deletes |
| Per-record version | watermark `Version` type exists | watermark is per-EntityMap, **not per-record** — nowhere to store a record's version |
| Push conflict pre-check | — | none; `UpdateRecord` overwrites unconditionally |

**The one true schema hole:** `CompanyIntegrationRecordMap` stores only the ID pair. No version,
hash, last-reconciled, last-writer, or tombstone. Everything else above is "designed but not
wired"; the record map is "not even designed for it."

---

## 2. Refactor decisions

### 2.1 The "GL / ledger" facade entity (NEW CodeGen primitive, core MJ — not integration-specific)

A logical entity (`deals`) that is a **facade over per-company-integration member tables**, each
syncing on its own schedule, presenting the illusion of unity.

- **Independent schedules do NOT require this** — sync state is already per-CompanyIntegration;
  a shared table scoped by `CompanyIntegrationID` already supports independent cadence.
- **The real justification is per-tenant schema divergence**: company A's custom field
  `deal_score` shouldn't widen company B's schema or couple their `ALTER TABLE`s.
- **Open decision (gates the primitive):**
  - **Shared table + `CompanyIntegrationID` discriminator** — preserves 1-entity-1-table; bad for divergent custom fields.
  - **Per-company member tables + facade view** (the GL model) — clean divergence + instant teardown; **fractures** the 1-entity-1-table invariant and needs dynamic regen+migrate on each new CompanyIntegration.
  - **Native SQL partitioning by `CompanyIntegrationID`** — isolation + `SWITCH OUT` purge, stays 1-entity-1-table; does NOT solve custom-field divergence.
  - **→ Decide based on: is per-company custom-field divergence large enough to forbid a shared schema?** If yes, facade wins and is worth the primitive. (Lives in core CodeGen; Integration is first consumer.)

### 2.2 The object dependency DAG = the shared artifact (engine ⇄ agent)

The sync taxonomy is a **topological ordering of the object dependency DAG**: layer-1 independent
roots, layer-2 = functions over subsets of layer-1, etc. Edge = "I need parent IDs to fetch this."

- **Required path-nesting = PROVABLE FK.** If fetching B requires looping A's IDs (A's ID is a
  required path param in B's endpoint), then B→A is a *confirmed* FK — derived, never guessed.
  This is the principled answer to "we can never guess FKs": resolving the traversal DAG *emits*
  the FK graph as a byproduct.
- Current REST base class resolves **one parent level**; this needs arbitrary-depth, multi-parent
  (subset) traversal.
- **Bridge to the agent framework:** the agent *builds* the DAG from docs (its layered research
  mirrors these layers); the engine *executes* it for sync ordering. One graph, two consumers.

### 2.3 Per-CompanyIntegration metadata-refresh endpoint (NEW GQL)

For a connected instance: discover all objects → for each, gather all provably-gettable metadata
(some only available with creds) → **overlay** onto declared, **insert** discovered/custom →
per-field same → run soft-PK detection (LLM/statistics-backed when no key) → emit soft-PK to
`additionalSchemaInfo.json`.

- **Upsert keyed on natural identity, never append.** Objects keyed `(IntegrationID, lower(Name))`,
  fields `(IntegrationObjectID, lower(Name))`. Re-running *converges* (no dup). Soft-PK output is
  replace-by-key per object, not accumulate.
- **Obeys provable-only + no-fabrication overlay** (or it re-wipes declared PKs every refresh).

### 2.4 `SyncStrategy` per IntegrationObject (NEW)

"No watermark" is not a failure state — it's a *route*. Each object declares a strategy the agent
determines from docs:

- `WatermarkIncremental` — has a change field; cheap incremental.
- `AppendOnlyCursor` — immutable + newest-first orderable (logs/transactions); page until last-seen ID. Valid ONLY if records never edit/delete.
- `FullPullHashDiff` — mutable, no watermark; must full-pull, but APPLY is incremental via per-record content hash.
- `DeletionFeed` — API exposes a tombstone/deletions feed.
- `SnapshotReplace` — no usable identity; read-only full-replace, not FK-referenceable.

### 2.5 `CompanyIntegrationRecordMap` → per-record **sync ledger** (the keystone)

Add per-record:
```
ExternalVersion / ExternalETag    -- OCC conflict token
ContentHash                       -- FullPullHashDiff incremental-apply + change detect
LastSeenModifiedValue             -- per-record watermark where available
LastReconciledAt
LastWriterDirection               -- pull vs push
IsTombstoned / DeletedDetectedAt  -- real soft-delete vs hard-delete
```
Without these, conflict detection, reliable deletes, and watermark-less incremental are
*physically impossible* regardless of engine code quality. Highest-leverage change in the refactor.

### 2.6 Bidirectional = pull + push + **conflict detect + resolve** (OCC)

- Safe order: **pull-first** (learn external truth + detect conflicts), resolve, then push survivors.
- Per record about to push: compare external version to stored `ExternalVersion`.
  - match → push, store new version.
  - differ → conflict → apply `EntityMap.ConflictResolution` (SourceWins / DestWins / MostRecent / Manual→quarantine).
- `If-Match: <etag>` conditional writes let the server enforce this (HTTP 412) — no pre-pull.
- Concurrent pull/push serialized by existing `CompanyIntegration` lock fields (code must *use* them).

---

## 3. Engine behavior changes (downstream of the ledger)

- Dispatch sync by `SyncStrategy` per object.
- Inserts/deletes detected by **set membership on identity** vs the record map — NOT watermark.
  (See `incremental-sync-mechanics` discussion.)
- Honor `DeleteBehavior` (real soft-delete ≠ hard-delete).
- Honor `ConflictResolution` (stop defaulting everything to last-write-wins).
- Use `If-Match`/version OCC on push.

---

## 4. Open questions to resolve (in order)

1. **Facade vs partition vs discriminator** (§2.1) — gates the CodeGen primitive. Driver = custom-field divergence magnitude.
2. **Record-map-as-ledger column set** (§2.5) — everything downstream depends on it.
3. Multi-level DAG traversal extension to the REST base class (§2.2).
4. Where `SyncStrategy` classification is authored (agent research vs refresh-time inference).

---

## 5. Agent-architecture notes (to carry forward, not built here)

- Agent research resolves the object DAG from docs → yields traversal order AND provable FKs.
- Provable-only is the agent's floor; gaps return `type: [..., null]`, never invented.
- Required-ordering-in-API-path = strong FK confirmation signal.
- Universal PK naming conventions (e.g. HubSpot `hs_object_id` always the PK per docs) are a
  provable shortcut that avoids soft-PK inference — capture per connector.
- For custom/discovered objects, PK may come from a naming convention even when not in the data
  (likely for PK; unlikely for FK).
- Structured handoffs between sub-agents; write-to-file not return-tokens for large IO/IOF payloads.

---

## 6. The Provability Ladder — the decision framework (VERIFIED)

The rule that makes "build optimal connectors without guessing" mechanical instead of a judgment
call. **For each attribute, take the highest rung you can PROVE. Hard constraints only from
provable rungs. Below the line → soft key or acknowledged limitation. A guess is NEVER promoted to
a hard constraint.**

### Verified foundations (from code, not assumption)

1. **Identity = `CompanyIntegrationRecordMap.ExternalSystemRecordID`, sourced from the connector's
   `ExternalRecord.ExternalID` — NOT a hard DB PK.** As long as the connector emits a *stable
   ExternalID per record*, re-syncs match correctly (`MatchEngine` falls back to the record map;
   `IntegrationEngine.ts:1746` copies ExternalID → ExternalSystemRecordID). The MJ entity's own PK
   is an internal UUID and never has to equal the external key.
2. **Soft keys create ZERO hard DB constraints.** `manage-metadata.ts applySoftPKFKConfig` only does
   `UPDATE EntityField SET IsPrimaryKey=1, IsSoftPrimaryKey=1` (PK) / `RelatedEntityID + IsSoftForeignKey=1`
   (FK). No `ALTER TABLE ADD CONSTRAINT`. CodeGen will create an entity with **no hard PK** as long
   as a soft PK is declared (`manage-metadata.ts:4043`).
3. **Therefore**: a wrong *hard* key → rejected inserts / corrupted sync (ERROR). A wrong *soft*
   key → a bad navigation hint (LIMITATION). "Errors worse than limitations" becomes enforceable:
   uncertain → soft, never hard.
4. **The API's own shape is provable evidence even when prose docs are silent**: the detail
   endpoint proves the PK; a list filter/sort param proves the watermark; required path nesting
   proves the FK.

### PK ladder
| Rung | Source | Constraint kind |
|---|---|---|
| 1 | Explicit doc statement | hard |
| 2 | Universal convention asserted in docs (e.g. HubSpot `hs_object_id`) | hard (applies to custom objects too) |
| 3 | **Detail-endpoint path param** (`GET /x/{id}` ⟹ `id` is identity) | hard |
| 4 | Statistical / LLM uniqueness (lightweight DBAutoDoc) | **soft** (additionalSchemaInfo) |
| 5 | Nothing | `SnapshotReplace`, read-only, acknowledged |

### Watermark ladder
| Rung | Source | Result |
|---|---|---|
| 1 | Explicit `modified_since` doc | `WatermarkIncremental` |
| 2 | **Documented list filter/sort on a timestamp field** | `WatermarkIncremental` |
| 3 | Nothing | `FullPullHashDiff` or `AppendOnlyCursor` — acknowledged, no incremental |

### FK ladder
| Rung | Source | Constraint kind |
|---|---|---|
| 1 | **Required path nesting** (`/companies/{id}/deals` ⟹ deals→companies) | hard (confirmed by construction) |
| 2 | Explicit reference type (SF `referenceTo`) / Association API | hard |
| 3 | Naming (`customer_id` → customers) | **soft** only |
| 4 | Nothing | leave blank |

---

## 7. Phase 0 concrete plan (code, no agent work)

Goal: give the framework as many *needs* as possible so connectors are optimal without guessing.

1. **Record-map → per-record ledger** (§2.5). New columns: `ExternalVersion`/`ExternalETag`,
   `ContentHash`, `LastSeenModifiedValue`, `LastReconciledAt`, `LastWriterDirection`,
   `IsTombstoned`/`DeletedDetectedAt`. Migration + CodeGen. *Keystone — everything depends on it.*
2. **`SyncStrategy` column on `IntegrationObject`** (§2.4): enum
   {WatermarkIncremental, AppendOnlyCursor, FullPullHashDiff, DeletionFeed, SnapshotReplace}.
   Drives engine dispatch. Provable-only default = SnapshotReplace if nothing better proven.
3. **Engine: honor what the schema already declares.** Implement the unwired intent —
   `ConflictResolution` (stop defaulting to last-write-wins), `DeleteBehavior` (real soft-delete ≠
   hard-delete), incremental-delete via `DeletionFeed`/set-diff, OCC version check on push.
4. **FullPullHashDiff apply path**: hash each incoming record, compare to ledger `ContentHash`,
   only write on change; set-diff against the record map for inserts/deletes. No watermark needed.
5. **Bidirectional OCC** (§2.6): pull-first → detect conflict via `ExternalVersion` → resolve →
   push survivors; `If-Match` conditional write where the API supports it; use existing
   CompanyIntegration lock fields for pull/push mutual exclusion.
6. **Multi-level DAG traversal** in `BaseRESTIntegrationConnector` (§2.2): arbitrary-depth,
   multi-parent template resolution (current code does single-parent only).
7. **Per-CompanyIntegration metadata-refresh GQL endpoint** (§2.3): discover → overlay
   (no-fabrication) → upsert-by-key → lightweight soft-PK detection → emit additionalSchemaInfo.
8. **Lightweight DBAutoDoc** scoped to a fresh IntegrationObject set: reuse statistical PK/FK
   detection (deterministic, no LLM), optional top-N LLM validation, emit additionalSchemaInfo soft
   keys + entity-description SQL. ~1–3 min / <$2 vs full DBAutoDoc's 40–130 min. Soft-only output.
9. **The facade/partition primitive** (§2.1) — gated on the divergence decision; may be deferred to
   its own PR since it's a core-CodeGen change.

## 8. Connector adaptation (all existing connectors subscribe)

The Provability Ladder applied retroactively. Per the audit:

- **iMIS, Aptify, NimbleAMS, NetForum** — already 100% provable PK (rung 3 detail-path) + watermark
  (rung 2 server filter). Action: set `SyncStrategy='WatermarkIncremental'` explicitly; verify
  `IncrementalWatermarkField` matches the proven filter field (NetForum has a known watermark-name
  bug — uses generic `LastModifiedDate`, real fields are object-prefixed `_last_updated_dt`).
- **WildApricot** — 4/24 objects watermarked. Action: objects without a proven server filter →
  `FullPullHashDiff`; do NOT invent watermarks for the other 20.
- **YourMembership** — parent-scoped, ~10% watermark, 103/123 objects no declared PK. Action: derive
  identity from the parent-scoped path structure (composite ExternalID = parentID+detailID); objects
  with no provable watermark → `FullPullHashDiff`; never guess a hard PK.
- **Reach360 (LMS)** — no server-side filter (API limit). Action: `AppendOnlyCursor` for
  ActivityReport (immutable events), `FullPullHashDiff` for mutable objects. Acknowledged, not errored.
- **HubSpot / Salesforce** — already fixed (overlay no-fabrication + explicit PK stamp). Set
  `SyncStrategy` and confirm watermark fields.
- **Cross-cutting**: every connector's `DiscoverFields` must stamp `IsPrimaryKey` on the field the
  detail-endpoint path addresses (rung 3), so new/custom objects get identity without the soft tier.

## 9. Phase 1 agent derivation rules (carry into agent design)

The agent maximizes *derivation* (provable) and refuses *guessing-as-hard*:

- **Resolve the object dependency DAG from docs first** — its byproduct is the provable FK graph
  (required path nesting) and the traversal order. One research artifact, three payoffs (order, FKs,
  identity).
- **Derive PK from API addressing**: find the single-record detail endpoint; its path param names
  the identity field (rung 3) — no need for docs to say "primary key."
- **Derive watermark from query capability**: scan list-endpoint params for a timestamp filter/sort;
  its existence is the proof (rung 2).
- **Universal conventions are gold**: when docs assert a system-wide identity field (HubSpot
  `hs_object_id`, SF `Id`), capture it once — covers custom objects without per-object inference.
- **Everything below the provable line → soft key**, emitted to additionalSchemaInfo, never a hard
  constraint. Genuinely unknowable identity → declare the object `SnapshotReplace`.
- **Output uses `type: [..., null]`** so a missing fact is explicit, never silently defaulted.
- **Classify each object's `SyncStrategy`** during research from the watermark ladder result.

---

## 10. Open questions (updated)

1. **Facade vs partition vs discriminator** (§2.1) — gates the CodeGen primitive; likely its own PR.
2. **Ledger column set final shape** (§2.5) — the keystone; lock first.
3. Where `SyncStrategy` is authored — agent research vs refresh-time inference (probably both: agent
   for declared objects, refresh-time for discovered/custom).
4. Multi-level DAG traversal API shape on the REST base class.

---

## 11. The two pillars (re-framing — these are co-equal, not "step 5")

Everything in §7 hangs on **two structural pillars**. The rest is engine code that uses them.

### Pillar A — Per-record sync ledger (§2.5)
Makes a *single record* sync correctly: identity, version (conflict), hash (change/delete),
tombstone. Without it, conflict/delete/watermark-less-incremental are physically impossible.

### Pillar B — Template / dependency-DAG traversal (§2.2)
Makes the *whole graph of records* reachable. "Template" = `IntegrationObject.APIPath` with `{var}`
placeholders = your layered `f(x1)…f(xn)` taxonomy = the object dependency DAG. **Same concept, three
names.** Worked example:

```
LAYER 1 (roots, no parent):   /members            /events
LAYER 2 (one layer-1 parent): /members/{memberId}/subscriptions   /events/{eventId}/sessions
LAYER 3 (a layer-2 parent):   /events/{eventId}/sessions/{sessionId}/attendees
```
- Walking the layers in dependency order = topological sort of the DAG = the sync plan.
- **A required path `{var}` is a PROVABLE FK** (`sessions` needs `{eventId}` ⟹ sessions→events).
  Resolving the template *is* deriving the FK graph — one artifact, both payoffs.
- **Today:** single-parent only (`FetchWithTemplateVars` resolves one level). **Needed:**
  arbitrary depth + multiple parents per object (any tree or DAG) — "support different traversal
  structures." This is the §7-Step that was mislabeled a footnote; it is a pillar.

---

## 12. Agent-architecture adjustments (driven by the bijection)

The agent framework ([integration-agentic-local.md](integration-agentic-local.md); agents on the
`connector-improvement` branch) rests on a **bijection**: every Phase 0 slot ↔ exactly one agent
producer + one locked primitive + one floor-check entry (§0a there). The refactor adds/changes
slots, so the bijection updates in lockstep — the framework change *generates* the agent change.

### New slots → new agent emissions
| New Phase 0 slot | Agent producer | Locked primitive | Floor-check |
|---|---|---|---|
| `IntegrationObject.SyncStrategy` | **ioiof-extractor** (from watermark-ladder result) | **NEW** `classify-sync-strategy` | every object has non-null SyncStrategy |
| IO **version-field** metadata (OCC source: which response field / ETag header carries the record version) | **code-builder** + **ioiof-extractor** | extend `extract-iiof-pipeline` | objects that are WatermarkIncremental/bidirectional have a version source or are explicitly flagged no-OCC |

### Sharpened slots (same column, stronger locked contract)
- **`IsPrimaryKey`** — `extract-iiof-pipeline` applies the **PK ladder**: rung 3 (detail-endpoint
  path param ⟹ identity) becomes a *primary provable source*, tried BEFORE deferring to the runtime
  SoftPKClassifier. `verify-claim` asserts the detail endpoint exists.
- **`RelatedIntegrationObjectID/FieldName` (FK)** — `extract-iiof-pipeline` emits the **full
  multi-level dependency DAG**, not single-parent. Required path nesting at any depth = provable FK.
  Emission includes, per object, each APIPath `{var}` → its resolving parent object.
- **`IncrementalWatermarkField`** — **watermark ladder**: rung 2 (documented list filter/sort on a
  timestamp) is the provable source; `verify-claim` asserts the filter param is documented.

### New rule (`.claude/rules/`, `connector-improvement` branch)
- **`connector-provability-ladder`** — the PK/watermark/FK ladders (§6) as a locked contract:
  provable → hard; derivable-from-API-shape → hard; uncertain → soft key; nothing → acknowledged
  (`SnapshotReplace` / no-incremental). Encodes "no source's silence is ever evidence."

### Floor-check additions (the runtime gate that rejects a connector PR)
- Every object: `SyncStrategy` non-null.
- **DAG reachability**: every object is fetchable — a root, or every `{var}` in its APIPath resolves
  to a parent object present in the DAG. No orphan object.
- **Identity-source present**: every object has either a provable hard PK OR a declared stable
  ExternalID extraction path (so the record map can populate). No object syncs without identity.

### Conflict/delete defaults (recommendation, not a hard contract)
- ioiof-extractor recommends per-object `ConflictResolution` + `DeleteBehavior` defaults derived from
  SyncStrategy (append-only ⟹ conflict impossible; mutable ⟹ SourceWins default; etc.). Stored in
  `Configuration` as a recommendation; user/runtime confirms. Never auto-hardened.

### Where each edit lands
- **This branch (`feat/integration-framework-expansion`)** — all framework code/schema (§7 Steps 1–8)
  + both plan docs (this doc + agent slot-table/floor-check/primitive updates in
  integration-agentic-local.md).
- **`connector-improvement` branch (when checked out)** — `.claude/agents/ioiof-extractor` +
  `code-builder` prompts; new `.claude/rules/connector-provability-ladder`; `build-connector` skill
  primitive wiring; `workshop/primitives/classify-sync-strategy.workflow.js`; floor-check slot-table
  regen. (These are spec'd here; applied on that branch — they can't be edited from this tree.)

---

## 13. Execution sequence (what gets built, in order)

1. **Migration** — ledger columns on CompanyIntegrationRecordMap (Pillar A) + `SyncStrategy` on
   IntegrationObject, one file, consolidated ALTERs + extended properties → run → CodeGen.
2. **Engine** — SyncStrategy dispatch + FullPullHashDiff; honor ConflictResolution / DeleteBehavior /
   OCC-on-push (Steps 3–4).
3. **Pillar B** — multi-level DAG traversal in BaseRESTIntegrationConnector (Step 5).
4. **Lightweight DBAutoDoc** (Step 6) → **metadata-refresh GQL endpoint** (Step 7).
5. **Connector adaptation** — all 25, Provability Ladder applied; NetForum watermark-name fix (Step 8).
6. **Plan-doc sync** — update integration-agentic-local.md slot table + floor-check + primitive list.
7. **Deferred PRs** — facade/partition primitive (§2.1); then agent-file edits on connector-improvement.

---

## 14. Sync optimization strategy (recovered from the audit — ready to implement)

Source: the optimization-audit workflow's Audit phase completed (26 connectors + engine model);
the synthesis agent hung on the oversized combined prompt, so this is synthesized from the
captured audit data. Implement as its OWN build-test cycle — NOT bundled with the per-record
sync-state work — because it is cross-cutting and every connector flagged breakage risks.

### Engine reality (confirmed by the audit)
- Entity-maps run **sequentially** (`ExecuteEntityMaps`, IntegrationEngine.ts:507-579 — `for … await`).
- DAG topo-sort **exists but is NOT wired**: `IntegrationEngineBase.GetObjectsInDependencyOrder`
  (engine-base IntegrationEngineBase.ts:234) builds adjacency from `RelatedIntegrationObjectID` + Kahn's.
- Rate-limit knobs **defined but unused at runtime**: `Integration.BatchMaxRequestCount` /
  `BatchRequestWaitTime` exist on the entity but nothing reads them during sync.
- Only **HubSpot + Salesforce** expose vendor batch APIs. Pagination spread: Offset/Cursor/PageNumber/None/mixed.

### Order of implementation (rate-limiter MUST precede parallelism)
1. **Rate-limiter (pure-protective, lands first).** Wire `BatchRequestWaitTime` as a minimum
   inter-request spacing + `BatchMaxRequestCount` as a token-bucket ceiling, plus adaptive 429
   backoff (reuse `RetryRunner`). Caveat: `MakeHTTPRequest` is **abstract** — the base class calls
   it at 6 sites (CRUD 291/322/351/376, fetch 681/725); gate those with a `protected await
   this.applyRateLimit()` so the metadata-driven paths are covered. Connectors with bespoke fetch
   loops need the same call. Adding delay can't break correctness — safe to land alone.
2. **Parallelism — the one proven-safe seam.** Per the audit's `safeParallelizationSeams`:
   independent entity-maps (no FK dependency between their objects, non-overlapping destination
   entities) within a dependency layer — derived from `GetObjectsInDependencyOrder` — run on a
   **bounded pool** (conservative default cap), every request gated by the rate-limiter. Dependent
   maps wait for parents. `ProcessSingleEntityMap` already owns its own watermark/RunDetail/fetch
   state, so in-memory `result` aggregation is the only shared mutable (safe under single-threaded
   async if increments stay atomic). Default cap small; raise per-integration via Configuration.
3. **Batching — connector-level, HubSpot/SF only.** Their `FetchChanges`/CRUD use the vendor batch
   endpoints; not an engine-wide change. Other 24 connectors: no batch API → no change.

### Agent optimization-duty (for new connectors — add to the agent branch)
The connector-building agent must extract, provably: pagination type; whether the vendor offers a
batch API (+ evidence); documented rate limits → populate `BatchMaxRequestCount`/`BatchRequestWaitTime`;
which objects are independent roots (parallelizable) vs dependent (FK/path-nested). Leave unknown
when not provable — never invent a rate limit or batch capability.

### Non-breaking guarantees
- Parallelism only across PROVABLY-independent maps; dependent maps stay ordered.
- All concurrent requests pass through the rate-limiter → never exceeds the vendor limit.
- Connectors flagged with stateful cursors/auth: rate-limiter serializes their token refresh;
  if a connector's audit flagged a hard concurrency risk, exclude it from the pool (cap=1).
- Conservative default concurrency; opt-in escalation per integration.
