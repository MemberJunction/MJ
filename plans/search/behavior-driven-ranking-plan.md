# User-Behavior-Driven Search Ranking — Design & Implementation Plan

> **Status:** Design complete, ready to implement.
> **Branch:** `claude/user-behavior-search-ranking-ejCXd`
> **Builds on:** [`search-plan.md`](./search-plan.md) (Phase 1 — search infrastructure shipped) and [`search-phase2-plan.md`](./search-phase2-plan.md) (Phase 2 — CodeGen FTS intelligence in flight).
> **Companion to:** the autotagging pipeline in `@memberjunction/content-autotagging` and the Entity Document vectorization pipeline in `@memberjunction/ai-vectors-sync`.

---

## 1. Executive Summary

Today's `SearchEngine` (Phase 1) fuses Vector + FTS + Entity-LIKE + Storage results via unweighted Reciprocal Rank Fusion (`packages/SearchEngine/src/generic/SearchFusion.ts`, `ReciprocalRankFusion.ts`). It is **completely impersonal** — two users with very different jobs get the same ranking for the same query.

This plan adds **user-behavior-aware ranking** on top of RRF without rebuilding it, by:

1. **Reusing the existing Entity Document → template render → vectorize pipeline** to maintain a per-user behavior vector (the user gets their own row in the same vector index that holds all other content).
2. **Reusing `MJ: Tagged Items`** with its existing `Weight` column to maintain a per-user tag-affinity bag (no new tables).
3. **Adding a thin post-RRF rerank step** in `SearchEngine.Search` that blends the user vector + tag overlap into the final score.
4. **Standardizing system-maintenance scheduled jobs** for both *Entity Document vectorization* and *Content Autotagging classification* the same way Geocoding Maintenance is standardized today.

We also clean up search hygiene at the same time: the global search bar currently surfaces a bunch of pure-metadata entities (e.g., `MJ: Record Changes`, `MJ: Tagged Items`, `MJ: Users`) that should not appear as user-facing results.

**Net new code surface is small** — one new Action (`Refresh User Behavior Profiles`), one optional Action (`Scheduled Entity Vectorization`), one new method on `SearchEngine` (the rerank step), and a handful of metadata files. **Zero new database tables.**

---

## 2. Goals

- **G1 — Personalize ranking, don't rebuild RRF.** RRF stays the deterministic backbone. Personalization is a bounded post-fusion blend (`λ` configurable, default conservative).
- **G2 — Zero new tables.** Reuse `TaggedItem` (with its existing `Weight` column, polymorphic `EntityID`+`RecordID`) and the existing `EntityDocument` / `EntityRecordDocument` / `VectorIndex` infrastructure.
- **G3 — Same vector space as content.** User vectors must use the **same `AIModelID`** and the **same `VectorIndexID`** as the content EntityDocuments, so cosine similarity between user and content is meaningful.
- **G4 — All work is scheduled, not inline.** No runtime read of `UserRecordLog` / `RecordChange` / `ConversationDetail` during search. The behavior profile is precomputed nightly.
- **G5 — Standardize maintenance jobs.** Vectorization refresh and Classifier refresh become standard system-maintenance scheduled jobs alongside Geocoding Maintenance, with the same shape (cron + Action + Configuration JSON).
- **G6 — Clean up search hygiene.** As part of this PR, audit `Entity.AllowUserSearchAPI` so audit/log/junction entities don't appear in user-facing search results.
- **G7 — Cold-start safe.** A user with no profile rows gets exactly today's behavior (no rerank applied).
- **G8 — Permission-safe.** No leakage of user records into other users' search results, no leakage of records into a user's profile that they cannot read.

---

## 3. Non-Goals (Explicitly Out of Scope for This PR)

- **No LLM reranker on search results.** A Layer-3 LLM rerank (similar to `RerankerService.rerankNotes` for agent memory) is a follow-up; not in this PR.
- **No new UI for managing Entity Documents or User Profiles.** Knowledge Hub does not yet have an EntityDocument CRUD view; we ship via metadata sync.
- **No new entities, no new database tables, no migrations beyond what is needed for the audit cleanup of `AllowUserSearchAPI`.**
- **No incremental delta vectorization mode.** Every scheduled run is a full re-vectorize for the Users entity (cardinality is small enough; deferred optimization).
- **No collaborative filtering / "users like you also viewed" UI surface.** The user vector enables this for free, but exposing it is a separate feature.
- **No client-side personalization.** All ranking happens server-side in `SearchEngine.Search` so MCP, A2A, and GraphQL clients all benefit equally.

---

## 4. Why This Shape (Key Design Decisions)

These were debated during design and locked in. Future agents: do not relitigate without explicit user sign-off.

### D1 — Reuse `TaggedItem` for user tag affinity, do not create a new table

`MJTaggedItemSchema` (`packages/MJCoreEntities/src/generated/entity_subclasses.ts:22347–22392`) already has:

| Field | Purpose for user affinity |
|---|---|
| `EntityID` + `RecordID` | Polymorphic — set `EntityID = Users` and `RecordID = userID` to mean "tag T applies to user U" |
| `Weight numeric(5,4)` | Already 0.0–1.0 with documented semantics (1.0 = strong/manual, lower = derived) |
| `__mj_UpdatedAt` | Free recency signal |
| Companion `TagAuditLog` | Free audit if we ever need provenance |
| Companion `TagCoOccurrence` | Free input for query expansion |

A separate `UserBehaviorAffinity` table would duplicate all of this. **Don't create one.**

### D2 — Use Entity Documents to maintain the user vector, not a custom worker

`EntityDocument` (`entity_subclasses.ts:14617`) already binds Entity + Template + AIModel + VectorDatabase + VectorIndex + JSON config. The pipeline (`@memberjunction/ai-vectors-sync` → `entityVectorSync.ts`) already:

- Renders the template per record using Nunjucks (`TemplateEngineServer.RenderTemplate`).
- Loads related-entity data per batch via `Entity`-typed `TemplateParams` with `LinkedParameterField` joins (`entityVectorSync.ts:872 GetRelatedTemplateDataForBatch`).
- Embeds + upserts to the vector DB with deterministic `SHA-1(EntityDocumentID + CompositeKey)` IDs (`entityVectorSync.ts:392`) — reruns overwrite in place, no orphan vectors.
- Stores the rendered text and embedding back into `EntityRecordDocument` so we can fetch the user's vector from SQL without a vector DB roundtrip at search time.

We just configure the User entity into this pipeline. **Do not write a custom user-vectorization worker.**

### D3 — Same VectorIndex as content, distinguished by metadata

User vectors and content vectors live in the **same `VectorIndex`** (same Pinecone/pgvector/Qdrant index). Multi-entity coexistence is supported because metadata always includes `Entity: "EntityName"` and `VectorSearchProvider.queryOneIndex` already filters by `EntityNames` (`packages/SearchEngine/src/generic/VectorSearchProvider.ts:369`).

**Why not a separate index?** Splitting prevents direct vector math between user and content vectors and forces two queries. We can split later via metadata changes; we cannot easily un-split once production data exists.

### D4 — Embedding-model consistency is a hard contract

The User EntityDocument **must** reference the same `AIModelID` as the content EntityDocuments. Different embedding models = different vector spaces = cosines are noise. We will:

- Document this as a hard rule in the EntityDocument metadata.
- Add a startup lint in `SearchEngine.Config` that fails loud if the User EntityDocument's `AIModelID` doesn't match the index's `EmbeddingModelID`.

### D5 — Tag affinity is derived from `TaggedItem` on records, not from raw activity

The Tag Affinity Job does **not** invent tags. It reads activity (`UserRecordLog`, `RecordChange`, `ConversationDetail`) → for each touched record, it looks up that record's existing `TaggedItem` rows → aggregates tag IDs with event-weighted, time-decayed scores → upserts `TaggedItem` rows targeting the user.

This means the autotagging pipeline (which populates `TaggedItem` and `ContentItemTag` on records) is the *semantic backbone*. Richer record-level autotagging → richer user profiles for free.

### D6 — Post-RRF blend, not a 5th RRF stream

Earlier draft considered injecting a "UserAffinity" rank list into RRF. Final decision: **blend after RRF, not into it.**

Reasons:
- RRF is unweighted by design; injecting a personalized stream would make it asymmetrically personal.
- A bounded post-RRF blend (`final = rrf + λ·personal`) is easier to tune, easier to disable, easier to A/B test.
- The personal score has natural [0,1] range from cosine; RRF score has a different scale — keeping them separate but blendable with a single λ knob is the cleanest API.

### D7 — Make scheduled vectorization & classification standard system-maintenance jobs

Today only Geocoding Maintenance ships as a "system maintenance scheduled job" (`metadata/scheduled-jobs/.geocoding-maintenance-job.json` + `metadata/actions/.geocoding-maintenance.json` + `packages/Actions/CoreActions/src/custom/geo/scheduled-geocoding.action.ts`).

Vectorization and autotagging are conceptually identical maintenance work — they keep derived state in sync with source data. We standardize them the same way:

- A new "Scheduled Entity Vectorization" Action that walks all `EntityDocument` rows with a "RefreshOnSchedule" flag set and triggers each via the existing `EntityVectorSyncer` service class.
- A new "Scheduled Content Autotagging" Action that walks all `ContentSource` records with a "RefreshOnSchedule" flag and triggers the autotagging pipeline.
- Both shipped with `metadata/scheduled-jobs/*.json` records of type `ActionScheduledJobDriver`, mirroring the geocoding pattern exactly.

The User Behavior Profile is just one of the EntityDocuments these jobs maintain — no special-casing.

---

## 5. Architecture Overview

```
                                ┌─────────────────────────────────────┐
                                │   ScheduledJobEngine (existing)     │
                                │   polls MJ: Scheduled Jobs          │
                                └───────────┬─────────────────────────┘
                                            │ cron
                       ┌────────────────────┼────────────────────┐
                       │                    │                    │
            ┌──────────▼────────┐  ┌────────▼─────────┐  ┌──────▼──────────────┐
            │ Refresh User      │  │ Scheduled Entity │  │ Scheduled Content   │
            │ Behavior Profiles │  │ Vectorization    │  │ Autotagging         │
            │ (NEW Action)      │  │ (NEW Action)     │  │ (NEW Action)        │
            └──────────┬────────┘  └────────┬─────────┘  └──────┬──────────────┘
                       │                    │                    │
                       │ writes             │ calls              │ calls
                       ▼                    ▼                    ▼
            ┌──────────────────┐  ┌───────────────────┐  ┌────────────────────┐
            │ TaggedItem rows  │  │ EntityVectorSyncer│  │ Autotag* providers │
            │  EntityID=Users  │  │  per EntityDocument│  │  per ContentSource │
            │  Weight + decay  │  │  (incl. Users ED)  │  │                    │
            └────────┬─────────┘  └─────────┬─────────┘  └─────────┬──────────┘
                     │                      │                      │
                     │                      │                      │
                     │           ┌──────────▼────────┐             │
                     │           │ Template render   │             │
                     │           │  + Embed + Upsert │             │
                     │           │  → VectorIndex    │             │
                     │           │  → EntityRecord   │             │
                     │           │     Document      │             │
                     │           └──────────┬────────┘             │
                     │                      │                      │
                     └──────────────────────┴──────────────────────┘
                                            │
                                            ▼
                          ┌────────────────────────────────────┐
                          │ Per-user precomputed signals       │
                          │ • TaggedItem rows (tag bag)        │
                          │ • EntityRecordDocument.VectorJSON  │
                          │   for Users entity (user vector)   │
                          └────────────────┬───────────────────┘
                                           │
                                           │ at search time, cheaply read by:
                                           ▼
        ┌─────────────────────────────────────────────────────────────────────┐
        │ SearchEngine.Search (existing)                                      │
        │   Providers ─► RRF ─► Dedup ─► [NEW: BehaviorRerank] ─► Permissions │
        │                                                                     │
        │   BehaviorRerank:                                                   │
        │     personal = α·cos(userVec, candVec) + β·tagOverlap(user,cand)    │
        │     final    = rrf + λ·personal                                     │
        │   Adds 'User' to SearchScoreBreakdown for explainability.           │
        └─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Decisions Locked Before Implementation

| # | Decision | Rationale |
|---|---|---|
| L1 | One **shared** `VectorIndex` for content + users | Enables direct cosine math; multi-entity already supported via metadata `Entity` filter |
| L2 | User EntityDocument's `AIModelID` **must equal** the content `AIModelID` | Vector-space coherence; enforced by startup lint |
| L3 | Tag bag = `TaggedItem` rows where `EntityID = Users.ID` and `RecordID = userID` | Reuse existing schema, no new tables |
| L4 | Activity windows in template = last **30 days**, top **N=50** per related entity | Bounds template-render memory; tunable in EntityDocument config |
| L5 | Default rerank coefficients: `α=0.6` (cosine), `β=0.4` (tag overlap), `λ=0.2` (blend) | Conservative — RRF still dominates; tuned via `InstanceConfiguration` |
| L6 | Tag affinity decay: half-life **30 days**, EWMA on each job run | Standard EWMA, cheap to compute |
| L7 | Cap of **top-50** affinity tags per user; weight floor `0.05` | Prevents unbounded `TaggedItem` growth on Users |
| L8 | Vectorization & classification jobs **off by default** in metadata; on for new installs once stable | Existing deployments opt-in by flipping `Status` to `Active` |
| L9 | `Users` entity excluded from search results via `AllowUserSearchAPI=false` | User vectors are personalization signal, not searchable content |
| L10 | Search hygiene audit happens **in this PR**, not deferred | They show up in search today and are noise; cheap to fix here |

---

## 7. Workstream 1 — Search Result Hygiene Audit

**Goal:** Stop surfacing pure-system / audit / junction entities in user-facing search results. They're noise and they leak metadata.

### 7.1 Audit pass — entities to flip `AllowUserSearchAPI=false`

Run this query against the live metadata to confirm current state, then flip the offenders:

```sql
SELECT Name, AllowUserSearchAPI, AutoUpdateAllowUserSearchAPI
FROM ${flyway:defaultSchema}.Entity
WHERE AllowUserSearchAPI = 1
ORDER BY Name;
```

**Confirmed candidates to flip to `false`** (their records should not appear in global search):

| Entity | Reason |
|---|---|
| `Users` | Personalization signal source; not searchable content |
| `MJ: User Record Logs` | Activity log — pure metadata |
| `MJ: User View Runs` | Execution log |
| `MJ: Record Changes` | Audit trail |
| `MJ: Audit Logs` | Audit trail |
| `MJ: Tag Audit Log` | Audit trail |
| `MJ: Tag Co-Occurrence` | Statistical aggregate |
| `MJ: Tagged Items` | Junction (the *target* records are searchable; the link rows aren't) |
| `MJ: Content Item Tags` | Junction |
| `MJ: AI Agent Runs` | Execution log |
| `MJ: AI Agent Run Steps` | Execution log |
| `MJ: AI Agent Run Medias` | Execution log |
| `MJ: AI Prompt Runs` | Execution log |
| `MJ: API Key Usage Logs` | Audit |
| `MJ: Communication Logs` | Audit |
| `MJ: Communication Runs` | Execution log |
| `MJ: Error Logs` | Diagnostics |
| `MJ: Scheduled Job Runs` | Execution log |
| `MJ: Company Integration Runs` | Execution log |
| `MJ: Company Integration Run API Logs` | Audit |
| `MJ: Duplicate Run Details` | Execution log |
| `MJ: Entity Document Runs` | Execution log |
| `MJ: Content Process Runs` | Execution log |
| `MJ: Test Runs`, `MJ: Test Suite Runs` | Execution log |
| `MJ: Workflow Runs` | Execution log |
| `MJ: Record Merge Logs` | Audit |
| `MJ: Queue Tasks` | Transient |
| `MJ: Action Execution Logs` | Execution log |
| `MJ: Entity Record Documents` | Internal vector-pipeline join |
| `MJ: Vector Indexes`, `MJ: Vector Databases` | Infrastructure config |
| `MJ: Search Providers` | Infrastructure config |
| `EntityField`, `EntityRelationship`, `EntityFieldValue`, `EntityPermission` | Schema metadata |
| `MJ: AI Agent Notes` | Agent memory — not user-facing search content |
| `MJ: Conversation Detail Ratings` | Telemetry |
| `MJ: Conversation Detail Artifacts`, `Attachments` | Internal join |

**Always-keep-true** (genuinely user-facing):
- `MJ: Conversations`, `MJ: Conversation Details` (chat UX)
- `MJ: Conversation Artifacts` (artifacts users actually open)
- `MJ: Templates`, `MJ: Reports`, `MJ: Dashboards`, `MJ: Queries`, `MJ: Lists`
- Any business-domain entity (Accounts, Contacts, Deals, etc.)

### 7.2 Implementation tasks

1. **Write a one-off audit query** (committed under `migrations/v5/` as a `__research_*.sql` file or as a standalone script under `scripts/`) that lists every entity currently `AllowUserSearchAPI = 1` so reviewers can see the diff.
2. **Create a metadata sync update** under `metadata/entities/` (or a dedicated `metadata/search-hygiene/` subdir) that flips `AllowUserSearchAPI` to `false` for each entity in the table above. Use `mj sync push --include="entities"` to apply.
3. **Set `AutoUpdateAllowUserSearchAPI = false`** on each flipped entity so the Phase 2 CodeGen LLM (per `search-phase2-plan.md` Priority 1) does **not** flip them back. This is the override-bit pattern already documented in `search-phase2-plan.md`.
4. **Verify**: after `mj sync push`, run `SearchKnowledge` against a few sample queries that previously surfaced these entities and confirm they no longer appear.
5. **Confirm vector exclusion**: even with `AllowUserSearchAPI=false`, vectorized records can still appear via `VectorSearchProvider`. Add an explicit filter step in `VectorSearchProvider.queryOneIndex` that drops candidates whose `Entity` metadata maps to an entity with `AllowUserSearchAPI=false`. **This is the new safety net** — entity-level and vector-level exclusion must agree.
   - File: `packages/SearchEngine/src/generic/VectorSearchProvider.ts`, near the existing `EntityNames` filter (~line 369).
   - Method: add `filterByAllowUserSearchAPI(matches: VectorMatch[]): VectorMatch[]` reading from cached `EntityInfo`.
6. **Tests** (Vitest, in `packages/SearchEngine/src/__tests__/`):
   - `VectorSearchProvider.test.ts`: new test "drops vectors for entities with AllowUserSearchAPI=false even if present in index".
   - `SearchEngine.test.ts`: new test "Users entity vectors do not appear in cross-entity search".

### 7.3 Acceptance criteria

- A search for a username (e.g., "Smith") does **not** return a `Users` row.
- A search for a phrase that appears in `RecordChange.NewValue` does **not** return a `Record Changes` row.
- A search for a tag name does **not** return `TaggedItem` rows (it may return the *target* records the tag is on).
- All existing search-result behavior for legitimate business entities is unchanged.

---

## 8. Workstream 2 — User Behavior Profile via Entity Document

**Goal:** Each user gets a continually-refreshed vector in the same `VectorIndex` as content, derived from their recent activity. No new tables, no custom worker — just a Template, an EntityDocument, and the existing vectorization pipeline.

### 8.1 Template — `User Behavior Profile`

**Location:** `metadata/templates/user-behavior-profile/` (template file + metadata).

**Files to create:**
- `metadata/templates/user-behavior-profile/.user-behavior-profile-template.json` — Template + TemplateContent + TemplateParam records.
- `metadata/templates/user-behavior-profile/user-behavior-profile.template.njk` — the Nunjucks template body (referenced via `@file:`).

**Template body (Nunjucks):**

```nunjucks
User: {{ FirstName }} {{ LastName }}
{% if Title %}Title: {{ Title }}{% endif %}
{% if Email %}Email: {{ Email }}{% endif %}

{% if RecentRecordOpens and RecentRecordOpens.length %}
Recently Viewed Records:
{% for log in RecentRecordOpens %}
- {{ log.Entity }} · {{ log.Record }} · viewed {{ log.TotalCount }}× (last: {{ log.LatestAt }})
{% endfor %}
{% endif %}

{% if RecentEdits and RecentEdits.length %}
Recently Edited Records:
{% for chg in RecentEdits %}
- {{ chg.Entity }} · {{ chg.RecordID }} · {{ chg.ChangeType }} on {{ chg.__mj_CreatedAt }}
{% endfor %}
{% endif %}

{% if RecentConversations and RecentConversations.length %}
Recent Conversation Topics:
{% for c in RecentConversations %}
- {{ c.ConversationName }} ({{ c.ConversationStartedAt }})
{% endfor %}
{% endif %}

{% if RecentConversationMessages and RecentConversationMessages.length %}
Recent Conversation Excerpts:
{% for m in RecentConversationMessages %}
- {{ m.Role }}: {{ m.Message | truncate(280) }}
{% endfor %}
{% endif %}

{% if AffinityTags and AffinityTags.length %}
Tag Affinities:
{% for t in AffinityTags %}
- {{ t.Tag }} (weight {{ t.Weight }})
{% endfor %}
{% endif %}
```

**Why every block is wrapped in `{% if … %}`:** template render errors cause the record to be skipped entirely (`entityVectorSync.ts:268`). Cold-start users with no activity must still produce a valid (sparse) document so they get a vector.

### 8.2 TemplateParams (declared on the Template record)

| ParamName | Type | LinkedParameterField | ExtraFilter (Nunjucks-rendered SQL) | OrderBy | TopN |
|---|---|---|---|---|---|
| *(implicit)* | `Record` | — | (the User row itself) | — | — |
| `RecentRecordOpens` | `Entity` (target: `MJ: User Record Logs`) | `UserID` | `LatestAt > DATEADD(day, -30, GETUTCDATE())` | `LatestAt DESC, TotalCount DESC` | 50 |
| `RecentEdits` | `Entity` (target: `MJ: Record Changes`) | `UserID` | `__mj_CreatedAt > DATEADD(day, -30, GETUTCDATE())` | `__mj_CreatedAt DESC` | 50 |
| `RecentConversations` | `Entity` (target: `MJ: Conversations`) | `UserID` | `__mj_UpdatedAt > DATEADD(day, -30, GETUTCDATE())` | `__mj_UpdatedAt DESC` | 20 |
| `RecentConversationMessages` | `Entity` (target: `MJ: Conversation Details`) | *(via Conversations.UserID — see note)* | `__mj_CreatedAt > DATEADD(day, -30, GETUTCDATE())` AND join filter | `__mj_CreatedAt DESC` | 30 |
| `AffinityTags` | `Entity` (target: `MJ: Tagged Items`) | `RecordID` | `EntityID = '<Users entity ID>' AND Weight >= 0.05` | `Weight DESC, __mj_UpdatedAt DESC` | 50 |

**Note on `RecentConversationMessages`:** `ConversationDetail` doesn't have a direct `UserID` FK — it links via `ConversationID → Conversation.UserID`. Two options:
- **Option A (simpler, recommended):** add a denormalized `UserID` query field to `ConversationDetail` view (CodeGen-managed) and use it as `LinkedParameterField`. Cheap, indexable.
- **Option B:** define the param via a custom RunView that joins through Conversation. Requires extending `GetRelatedTemplateDataForBatch` to support joined queries. Defer.

**Decision:** go with Option A — add `UserID` as a computed/joined field to the `vwConversationDetails` view via CodeGen + an extended property. Document this as a sub-task.

### 8.3 EntityDocument — `User Behavior Profile`

**Location:** `metadata/entity-documents/.user-behavior-profile.json`.

**Required field values:**

| Field | Value | Source |
|---|---|---|
| `Name` | `User Behavior Profile` | — |
| `EntityID` | `@lookup:Entities.Name=Users` | — |
| `TypeID` | `@lookup:MJ: Entity Document Types.Name=Record Duplicate` (or a new type — see 8.4) | — |
| `TemplateID` | `@lookup:Templates.Name=User Behavior Profile` | from §8.1 |
| `AIModelID` | **must equal** content `AIModelID` (see D4) | `@lookup:AI Models.Name=text-embedding-3-small` (or whatever your install standardized on) |
| `VectorDatabaseID` | shared production vector DB | `@lookup:Vector Databases.Name=…` |
| `VectorIndexID` | shared production index | `@lookup:Vector Indexes.Name=…` |
| `Status` | `Active` | — |
| `Configuration` | see below | — |

**Configuration JSON:**

```json
{
  "metadata": {
    "fieldStrategy": "include",
    "fields": {
      "FirstName": { "included": true },
      "LastName":  { "included": true },
      "Title":     { "included": true },
      "Email":     { "included": false }
    },
    "includeEntityIcon": true,
    "includeUpdatedAt": true,
    "defaultTruncationLimit": 500
  },
  "pipeline": {
    "fetchBatchSize": 25,
    "vectorizeBatchSize": 25,
    "upsertBatchSize": 25,
    "maxConcurrentEmbeddings": 2,
    "delayBetweenCallsMs": 250
  },
  "behaviorProfile": {
    "version": 1,
    "purpose": "personalization-only",
    "excludeFromGlobalSearch": true
  }
}
```

`behaviorProfile.excludeFromGlobalSearch: true` is a custom hint we read in W1's filter step in `VectorSearchProvider` so user vectors are double-protected (entity flag + vector metadata flag).

### 8.4 New `EntityDocumentType`?

Existing types are `Record Duplicate` and similar. We **could** add a new type `Behavior Profile` for clarity, but it isn't structurally needed.

**Decision:** add a new `MJ: Entity Document Types` row `Behavior Profile` via metadata. Pure documentation/UX value; zero behavioral coupling.

- File: `metadata/entity-document-types/.behavior-profile-type.json`.

### 8.5 Implementation tasks (W2)

1. **Confirm `vwConversationDetails` exposes `UserID`.** If not, add via CodeGen-controlled view extension. (Verify with `SELECT TOP 1 UserID FROM vwConversationDetails` post-CodeGen.)
2. **Create the new EntityDocumentType row** (`metadata/entity-document-types/.behavior-profile-type.json`).
3. **Create the Template + TemplateContent + TemplateParam records** under `metadata/templates/user-behavior-profile/`.
4. **Create the EntityDocument row** under `metadata/entity-documents/.user-behavior-profile.json` with `Status='Active'` (or `Pending` if you want to gate per-install — see L8).
5. **Run `mj sync push --include="templates,entity-document-types,entity-documents"`** to seed.
6. **Manually invoke** the existing `VectorizeEntity` GraphQL mutation against this EntityDocumentID with a tiny user set (use `listID` to scope to a List of test users) and verify:
   - A row appears in `EntityRecordDocument` per user with non-empty `DocumentText` and `VectorJSON`.
   - The same `VectorID` appears in the configured `VectorIndex` (via vector DB inspection — Pinecone console or `SELECT * FROM vector_index WHERE id = '…'` for pgvector).
   - The vector metadata includes `Entity: "Users"` and the configured display fields.
7. **Then** scale up by removing the `listID` scope and re-running for all users.
8. **Add a startup lint** in `SearchEngine.Config` (or `EntityVectorSyncer.Config`) that loads the User EntityDocument and asserts its `AIModelID` equals the `EmbeddingModelID` of any `VectorIndex` shared with content EntityDocuments. **Fail loud** if mismatched — log error, do not silently use mismatched vectors.

### 8.6 Acceptance criteria (W2)

- After running the EntityDocument vectorization, every active user has exactly one `EntityRecordDocument` row.
- The vector ID in the vector DB equals `SHA-1(EntityDocumentID + UserID)` (deterministic, upserts on rerun).
- A vector-similarity query in the same index from a content vector to the user index successfully returns user matches (proves shared vector space).
- A user with zero activity in the last 30 days still gets a sparse-but-valid document and a vector (no skipped records).
- Re-running the vectorization is idempotent (same vector IDs, no orphans).

---

## 9. Workstream 3 — Tag Affinity Job (`Refresh User Behavior Profiles` Action)

**Goal:** Maintain per-user tag affinities as `TaggedItem` rows where the tagged target is the User. This populates the `AffinityTags` template param consumed by W2's Template, so tag affinities are baked into both the user vector *and* are queryable directly at search time for the rerank step.

### 9.1 Action — `Refresh User Behavior Profiles`

**Pattern:** mirrors `ScheduledGeocodingAction` (`packages/Actions/CoreActions/src/custom/geo/scheduled-geocoding.action.ts`) exactly. Action wraps a service class; service class holds the logic.

**Action class:** `packages/Actions/CoreActions/src/custom/behavior/refresh-user-behavior-profiles.action.ts`

```typescript
@RegisterClass(BaseAction, 'Refresh User Behavior Profiles')
export class RefreshUserBehaviorProfilesAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser) {
            return { Success: false, ResultCode: 'MISSING_USER',
                     Message: 'RefreshUserBehaviorProfilesAction requires a context user' };
        }

        const lookbackDays = this.getNumericParam(params, 'LookbackDays', 30);
        const halfLifeDays = this.getNumericParam(params, 'HalfLifeDays', 30);
        const topNTags     = this.getNumericParam(params, 'TopNTagsPerUser', 50);
        const weightFloor  = this.getNumericParam(params, 'WeightFloor', 0.05);
        const userBatch    = this.getNumericParam(params, 'UserBatchSize', 100);
        const maxUsers     = this.getNullableNumericParam(params, 'MaxUsers');

        const service = new UserBehaviorProfileRefresher();
        const stats   = await service.RefreshAll(
            { lookbackDays, halfLifeDays, topNTags, weightFloor, userBatch, maxUsers },
            contextUser
        );

        return { Success: true, ResultCode: 'SUCCESS', Message: JSON.stringify(stats) };
    }
}
```

**Service class:** `packages/AI/UserBehaviorProfile/src/UserBehaviorProfileRefresher.ts` (new package — see 9.5).

The service does the actual logic; the Action is a thin shell. Per `packages/Actions/CLAUDE.md`, **Actions are boundaries, not internal APIs.**

### 9.2 Service algorithm — `UserBehaviorProfileRefresher.RefreshAll`

For each batch of users (size `userBatch`):

1. **Load activity deltas in three batched RunViews** (use plural `RunViews` per CLAUDE.md performance rules):
   - `MJ: User Record Logs` where `LatestAt > now - lookbackDays AND UserID IN (…batch…)`. Returns `{UserID, EntityID, RecordID, LatestAt, TotalCount}`.
   - `MJ: Record Changes` where `__mj_CreatedAt > now - lookbackDays AND UserID IN (…batch…)`. Returns `{UserID, EntityID, RecordID, ChangeType, __mj_CreatedAt}`.
   - `MJ: Conversation Details` where `Conversation.UserID IN (…batch…) AND __mj_CreatedAt > now - lookbackDays`. Returns `{UserID via join, ConversationID, Message, __mj_CreatedAt}`.

2. **Collect all touched (EntityID, RecordID) pairs** across the activity batch into a `Set`.

3. **One RunView for `MJ: Tagged Items`** filtered by `(EntityID, RecordID) IN (…touched…)` to fetch the tags on those records. Returns `{TagID, EntityID, RecordID, Weight}`.

4. **Aggregate per (UserID, TagID)**:
   - Score per event = `eventCoefficient × decay(eventAgeDays, halfLifeDays) × tagOriginalWeight`
   - Event coefficients (see L5 calibration starting point):
     - `RecordChange (edit)` → **5.0**
     - `RecordChange (create)` → **4.0**
     - `UserRecordLog (open/view)` → **2.0** × `min(TotalCount, 10)/10`
     - `ConversationDetail.Role='User'` mention of related entity → **1.0** (if you can correlate; otherwise skip in v1)
   - `decay(d, h) = 0.5 ^ (d / h)` — standard exponential half-life.

5. **For each user, take top `topNTags`** by aggregated score (drop the rest), filter `score >= weightFloor`, and **upsert** `TaggedItem` rows where `EntityID = Users` and `RecordID = userID`:
   - **Match key:** `TagID + EntityID + RecordID`.
   - If row exists → update `Weight` to new score and let `__mj_UpdatedAt` auto-update.
   - If row does not exist → create with the new score.
   - **Delete** rows for tags no longer in this user's top-N (so the bag stays bounded; otherwise stale tags accumulate forever).

6. **Stats returned per run**:
   ```ts
   { UsersProcessed: number,
     UsersWithChanges: number,
     TaggedItemsUpserted: number,
     TaggedItemsDeleted: number,
     ActivityRowsScanned: number,
     DurationMs: number }
   ```

### 9.3 Action params (declared on the Action metadata)

| Name | Type | Default | Notes |
|---|---|---|---|
| `LookbackDays` | Input scalar | 30 | Activity window |
| `HalfLifeDays` | Input scalar | 30 | EWMA half-life |
| `TopNTagsPerUser` | Input scalar | 50 | Bag cap (L7) |
| `WeightFloor` | Input scalar | 0.05 | Drop sub-floor tags |
| `UserBatchSize` | Input scalar | 100 | Process this many users per inner loop |
| `MaxUsers` | Input scalar | null | Optional cap per run |

### 9.4 Action metadata file

`metadata/actions/.refresh-user-behavior-profiles.json` — same shape as `metadata/actions/.geocoding-maintenance.json`, with the params above declared as `relatedEntities["MJ: Action Params"]`.

### 9.5 New package — `@memberjunction/user-behavior-profile`

Create `packages/AI/UserBehaviorProfile/`:
- `src/UserBehaviorProfileRefresher.ts` — main service (per §9.2).
- `src/types.ts` — `RefreshOptions`, `RefreshStats`, `EventCoefficients`.
- `src/decay.ts` — pure functions for `decay()`, `aggregateScores()`. Easy to unit-test.
- `package.json`, `tsconfig.json`, `vitest.config.ts` — scaffold via `node scripts/scaffold-tests.mjs`.
- `src/__tests__/decay.test.ts` — covers half-life math, edge cases (age 0, age = h, negative weights = invariant).
- `src/__tests__/UserBehaviorProfileRefresher.test.ts` — mocks `RunView` / `RunViews` and `BaseEntity.Save`/`Delete`, asserts upsert/delete logic.

The Action package depends on this new package; `CoreActions/package.json` adds `@memberjunction/user-behavior-profile`.

### 9.6 Order matters: tag affinity runs **before** vectorization

Because the User Behavior Profile template renders `AffinityTags`, the tag affinity job must complete before the user vectorization job for that day's run, otherwise the vector reflects yesterday's tags.

**Implementation:** the `Refresh User Behavior Profiles` ScheduledJob is scheduled to run earlier in the cron window (e.g., 02:00 UTC) and the `Scheduled Entity Vectorization` job runs later (e.g., 03:00 UTC). No hard dependency mechanism in `ScheduledJobEngine`; we order by clock.

Document this clearly in the metadata `Description` fields and in the README of the new package.

### 9.7 Acceptance criteria (W3)

- After one run, every active user with activity in the last 30 days has between 1 and 50 `TaggedItem` rows where `EntityID = Users` and `RecordID = their userID`.
- Re-running with no new activity results in `Weight` decay (newer rerun, same tags, lower weights — half-life behavior verified).
- Tags whose decayed weight falls below `weightFloor` are deleted from the bag.
- A user with no activity ends with zero affinity rows (clean slate; no orphans).
- Stats JSON returned by the action matches actual DB row counts.

---

## 10. Workstream 4 — Standardize System-Maintenance Scheduled Jobs

**Goal:** Make scheduled vectorization-refresh and classifier-refresh **first-class system-maintenance jobs** alongside Geocoding Maintenance, with the same metadata shape, the same install footprint, and the same on/off control.

This is the user-requested "make this standard like geocoding" piece. It's broader than just the User Behavior Profile — these jobs maintain *every* EntityDocument and *every* ContentSource in the system on a schedule.

### 10.1 New Action — `Scheduled Entity Vectorization`

**File:** `packages/Actions/CoreActions/src/custom/vectorization/scheduled-entity-vectorization.action.ts`

**Behavior:**
1. Load all `MJ: Entity Documents` rows where `Status = 'Active'` and a new boolean field `RefreshOnSchedule = 1` (see §10.3 for the schema add).
2. For each EntityDocument, call `EntityVectorSyncer.VectorizeEntity({ entityDocumentID, entityID, ... })` from `@memberjunction/ai-vector-sync`.
3. Aggregate per-document stats: `{ EntityDocumentName, RecordsProcessed, RecordsSuccessful, RecordsFailed, DurationMs, ErrorMessage? }`.
4. Sequential by default (avoid hammering the embedding model API); concurrency configurable.

**Action params:**
| Name | Type | Default | Notes |
|---|---|---|---|
| `MaxConcurrentDocuments` | Input scalar | 1 | EntityDocuments processed in parallel |
| `EntityDocumentNames` | Input scalar | null (all) | Optional comma-separated filter for ad-hoc runs |
| `MaxRecordsPerDocument` | Input scalar | null (unlimited) | Per-document hard cap |

### 10.2 New Action — `Scheduled Content Autotagging`

**File:** `packages/Actions/CoreActions/src/custom/autotagging/scheduled-content-autotagging.action.ts`

**Behavior:**
1. Load all `MJ: Content Sources` rows where `Status = 'Active'` and `RefreshOnSchedule = 1` (same schema add).
2. For each ContentSource, dispatch to the appropriate `Autotag*` provider via the existing `@memberjunction/content-autotagging` engine. Each provider (e.g., `AutotagWebsite`, `AutotagRSSFeed`, `AutotagAzureBlob`, `AutotagLocalFileSystem`, `AutotagEntity`) is already registered via `@RegisterClass(AutotagBase, …)`.
3. Honor the existing per-source `IContentSourceConfiguration` (TagTaxonomyMode, TagMatchThreshold, EnableVectorization, etc.).
4. Stats per source returned same as vectorization.

**Action params:**
| Name | Type | Default | Notes |
|---|---|---|---|
| `MaxConcurrentSources` | Input scalar | 1 | |
| `ContentSourceNames` | Input scalar | null (all) | Filter for ad-hoc |
| `MaxItemsPerSource` | Input scalar | null | Per-source cap |

### 10.3 Schema additions — minimal migration

Add a single boolean to **two** tables:

```sql
-- migrations/v5/V202604xxxx__v2.x__Add_RefreshOnSchedule_To_EntityDocument_ContentSource.sql

ALTER TABLE ${flyway:defaultSchema}.EntityDocument ADD
    RefreshOnSchedule BIT NOT NULL DEFAULT 0;
GO

ALTER TABLE ${flyway:defaultSchema}.ContentSource ADD
    RefreshOnSchedule BIT NOT NULL DEFAULT 0;
GO

EXEC sp_addextendedproperty
    @name  = N'MS_Description',
    @value = N'When 1, the Scheduled Entity Vectorization job will pick up this EntityDocument on its scheduled run. Default 0 to preserve existing behavior; flip to 1 to enroll a document in scheduled refresh.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityDocument',
    @level2type = N'COLUMN', @level2name = N'RefreshOnSchedule';
GO

EXEC sp_addextendedproperty
    @name  = N'MS_Description',
    @value = N'When 1, the Scheduled Content Autotagging job will pick up this ContentSource on its scheduled run. Default 0 to preserve existing behavior; flip to 1 to enroll a source in scheduled refresh.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ContentSource',
    @level2type = N'COLUMN', @level2name = N'RefreshOnSchedule';
GO
```

**Why a boolean and not just `Status='Active'`?** A document/source can be `Active` (usable by manual mutation calls) without being enrolled in scheduled bulk refresh. They're orthogonal concerns — same way an Entity can be `AllowUserSearchAPI=true` without being in the FTS catalog.

**After the migration runs, CodeGen generates the typed property.** Per CLAUDE.md rule 2b, **do not write code that references `RefreshOnSchedule` until CodeGen has produced the typed accessor.** Order: migration → CodeGen → action code.

### 10.4 Three new ScheduledJob metadata records

Following exactly the shape of `metadata/scheduled-jobs/.geocoding-maintenance-job.json`:

**`metadata/scheduled-jobs/.refresh-user-behavior-profiles-job.json`**
```json
[{
  "fields": {
    "Name": "Refresh User Behavior Profiles",
    "Description": "Recomputes per-user tag affinity bags (TaggedItem rows targeting Users) from the last 30 days of activity. Runs before Scheduled Entity Vectorization so the User Behavior Profile EntityDocument captures fresh tags.",
    "JobTypeID": "@lookup:MJ: Scheduled Job Types.DriverClass=ActionScheduledJobDriver",
    "CronExpression": "0 0 2 * * *",
    "Timezone": "UTC",
    "Status": "Pending",
    "Configuration": {
      "ActionID": "@lookup:MJ: Actions.DriverClass=Refresh User Behavior Profiles",
      "Params": [
        { "ActionParamID": "@lookup:MJ: Action Params.Name=LookbackDays&Action=Refresh User Behavior Profiles", "ValueType": "Static", "Value": "30" },
        { "ActionParamID": "@lookup:MJ: Action Params.Name=HalfLifeDays&Action=Refresh User Behavior Profiles", "ValueType": "Static", "Value": "30" },
        { "ActionParamID": "@lookup:MJ: Action Params.Name=TopNTagsPerUser&Action=Refresh User Behavior Profiles", "ValueType": "Static", "Value": "50" }
      ]
    }
  }
}]
```

**`metadata/scheduled-jobs/.scheduled-entity-vectorization-job.json`**
```json
[{
  "fields": {
    "Name": "Scheduled Entity Vectorization",
    "Description": "Refreshes vectors for every EntityDocument with RefreshOnSchedule=1. Runs after Refresh User Behavior Profiles so user-vector renders include fresh tag affinities.",
    "JobTypeID": "@lookup:MJ: Scheduled Job Types.DriverClass=ActionScheduledJobDriver",
    "CronExpression": "0 0 3 * * *",
    "Timezone": "UTC",
    "Status": "Pending",
    "Configuration": {
      "ActionID": "@lookup:MJ: Actions.DriverClass=Scheduled Entity Vectorization",
      "Params": [
        { "ActionParamID": "@lookup:MJ: Action Params.Name=MaxConcurrentDocuments&Action=Scheduled Entity Vectorization", "ValueType": "Static", "Value": "1" }
      ]
    }
  }
}]
```

**`metadata/scheduled-jobs/.scheduled-content-autotagging-job.json`**
```json
[{
  "fields": {
    "Name": "Scheduled Content Autotagging",
    "Description": "Runs the autotagging classifier for every ContentSource with RefreshOnSchedule=1.",
    "JobTypeID": "@lookup:MJ: Scheduled Job Types.DriverClass=ActionScheduledJobDriver",
    "CronExpression": "0 0 4 * * *",
    "Timezone": "UTC",
    "Status": "Pending",
    "Configuration": {
      "ActionID": "@lookup:MJ: Actions.DriverClass=Scheduled Content Autotagging",
      "Params": [
        { "ActionParamID": "@lookup:MJ: Action Params.Name=MaxConcurrentSources&Action=Scheduled Content Autotagging", "ValueType": "Static", "Value": "1" }
      ]
    }
  }
}]
```

**Why `Status: 'Pending'` (not `Active`)?** Per L8, existing deployments opt in by flipping to `Active`. Geocoding shipped Active because it's safe for any install; vectorization touches paid embedding APIs and we don't want to surprise-charge customers. New installs can enable post-setup as part of provisioning.

### 10.5 Implementation tasks (W4)

1. **Write the migration** (`V202604xxxx__v2.x__Add_RefreshOnSchedule_…sql`) with both `ALTER TABLE` consolidated per CLAUDE.md migration rules.
2. **Run migration locally → run CodeGen** to regenerate `entity_subclasses.ts`.
3. **Verify** `MJEntityDocumentEntity.RefreshOnSchedule` and `MJContentSourceEntity.RefreshOnSchedule` exist as typed boolean properties.
4. **Implement `ScheduledEntityVectorizationAction`** under `packages/Actions/CoreActions/src/custom/vectorization/`. Service class lives in `@memberjunction/ai-vector-sync` (extend `EntityVectorSyncer` with a `VectorizeAllScheduled()` helper, or add a sibling `EntityVectorScheduler` class).
5. **Implement `ScheduledContentAutotaggingAction`** under `packages/Actions/CoreActions/src/custom/autotagging/`. Service helper added to `@memberjunction/content-autotagging`.
6. **Wire registrations** — both Actions need `@RegisterClass(BaseAction, '…')` decorators and `package.json` entries to be picked up by manifest generation. Run `npm run mj:manifest:api` after building.
7. **Create the three metadata files** in §10.4.
8. **Push metadata:** `npx mj sync push --dir=metadata --include="actions,scheduled-jobs,entity-documents,entity-document-types,templates"`.
9. **Flip `RefreshOnSchedule = 1`** on the new `User Behavior Profile` EntityDocument as part of its metadata record so it's enrolled by default.
10. **Manually invoke** each new Action via the Actions UI / GraphQL to validate before enabling the cron.

### 10.6 Acceptance criteria (W4)

- Three new rows visible under **Scheduled Jobs** in MJ Explorer, all `Status='Pending'`, all using `ActionScheduledJobDriver`.
- Flipping any of them to `Active` causes the next cron tick to invoke the corresponding Action; results land in `MJ: Scheduled Job Runs` with stats JSON in the `Result` field.
- Manually flipping a content EntityDocument's `RefreshOnSchedule = 1` enrolls it without code changes.
- The User Behavior Profile EntityDocument is enrolled out-of-the-box (its metadata sets `RefreshOnSchedule = 1`).
- Geocoding Maintenance behavior is unchanged.

---

## 11. Workstream 5 — Post-RRF Behavior Rerank in `SearchEngine`

**Goal:** Blend the precomputed user signals (vector + tag bag) into final search ranking. Bounded, configurable, off by default until tuned.

### 11.1 Where it slots in

`SearchEngine.Search` today (`packages/SearchEngine/src/generic/SearchEngine.ts:157–216`):

```
executeProviders → Fuse (RRF) → Deduplicate → ExcludeEntitySourcedContentItems → filterByPermissions → MinScore → Enrich
```

**New step inserted between Deduplicate and ExcludeEntitySourcedContentItems:**

```
… → Deduplicate → BehaviorRerank(contextUser) → ExcludeEntitySourcedContentItems → …
```

Behavior rerank runs **before** permissions because (a) loading the user's profile is a fixed-cost operation independent of result count, and (b) we don't want personalization to amplify or dampen permission decisions.

### 11.2 Algorithm

For each surviving candidate `c`:

```
personal(c) = α · cos(userVec, candVec)        // cosine in [-1, 1], normalize to [0, 1]
            + β · tagOverlap(userTags, candTags)  // see below

final(c)    = c.RRFScore + λ · personal(c)
```

- `α` = 0.6 (default, configurable)
- `β` = 0.4
- `λ` = 0.2 — **conservative bounded blend**; RRF still dominates ranking
- `tagOverlap(userTags, candTags)` = `Σ_t (userTagWeight(t) · candTagWeight(t)) / max(1, |union|)` — Jaccard-weighted dot product, range [0, 1]

If `userVec` is missing (cold-start) → `α` term contributes 0.
If `userTags` is empty → `β` term contributes 0.
If both → `personal = 0` → exact RRF behavior preserved.

### 11.3 Profile loading at search time

**New method:** `SearchEngine.loadUserProfile(contextUser): Promise<UserBehaviorProfile | null>`.

Returns `null` when the user has no profile (cold-start) — caller then short-circuits the rerank.

```typescript
interface UserBehaviorProfile {
    userVector: number[] | null;        // from EntityRecordDocument.VectorJSON
    tagBag: Map<string, number>;        // tagID → weight, from TaggedItem
    profileEntityDocumentID: string;    // stash for cache key
    loadedAt: number;
}
```

**Two RunViews, in parallel** (per CLAUDE.md performance rules):

1. `MJ: Entity Record Documents` filter `EntityID = '<Users entity ID>' AND RecordID = '<contextUser.ID>' AND EntityDocumentID = '<User Behavior Profile EntityDocument ID>'`. `ResultType: 'simple'`, `Fields: ['VectorJSON']`. Returns at most one row.
2. `MJ: Tagged Items` filter `EntityID = '<Users entity ID>' AND RecordID = '<contextUser.ID>'`. `ResultType: 'simple'`, `Fields: ['TagID', 'Weight']`.

**Cache:** `Map<string, { profile, expiresAt }>` keyed by `contextUser.ID`, TTL 5 minutes (mirrors the existing embedding cache pattern in `VectorSearchProvider`). Cache invalidation only on TTL — search doesn't need to be more than 5-min fresh on profile changes.

The `UserBehaviorProfile` EntityDocument ID is read once at `SearchEngine.Config` time (looked up by Name) and stashed.

### 11.4 Candidate vector loading

For RRF candidates, the vector source depends on which provider produced them:

- **Vector candidates** — already have a vector available in the per-provider result `Metadata.vectorJSON` if we stash it during `VectorSearchProvider.queryOneIndex`. **Do this** — extend `VectorMatch` to carry `vector?: number[]` and propagate it through the SearchResultItem `Metadata` field. Cost: a few KB per result, acceptable.
- **FTS / Entity / Storage candidates** — no vector available, so the `α` term is 0 for them; only the `β` (tag overlap) term contributes. This is acceptable — these candidates lose half the personalization signal but gain it from tags. (We could fetch their `EntityRecordDocument.VectorJSON` on-demand, but that's a per-result query cost; defer to a later optimization once measured.)

For tag overlap on candidates: load `MJ: Tagged Items` rows for the candidate `(EntityID, RecordID)` pairs in **one batched RunView** at the top of the rerank step, build a per-candidate tag map. Bounded by `topK × avgTagsPerRecord`, typically ≤ 500 rows per query.

### 11.5 Configuration via `InstanceConfiguration`

The whole rerank is gated by an `InstanceConfiguration` row so per-deployment tuning doesn't require a code change. Use the `Category = 'Search'` namespace.

| FeatureKey | ValueType | DefaultValue | Purpose |
|---|---|---|---|
| `Search.BehaviorRerank.Enabled` | boolean | `false` | Master on/off |
| `Search.BehaviorRerank.Lambda` | number | `0.2` | Blend weight `λ` |
| `Search.BehaviorRerank.Alpha` | number | `0.6` | Cosine weight `α` |
| `Search.BehaviorRerank.Beta` | number | `0.4` | Tag-overlap weight `β` |
| `Search.BehaviorRerank.UserBehaviorProfileEntityDocumentName` | string | `User Behavior Profile` | Lookup key for profile EntityDocument |

Values seeded via `metadata/instance-configurations/.search-behavior-rerank.json`. Defaults are `Enabled=false` so this PR can ship without changing any user-visible behavior; a follow-up PR (or per-install knob flip) turns it on.

### 11.6 Score breakdown — explainability

Extend `SearchScoreBreakdown` (`packages/SearchEngine/src/generic/search.types.ts:34–43`):

```ts
export interface SearchScoreBreakdown {
    Vector?: number;
    FullText?: number;
    Entity?: number;
    Storage?: number;
    User?: number;        // NEW — the personal(c) value
    UserCosine?: number;  // NEW — α · cos term, for debugging
    UserTagOverlap?: number; // NEW — β · overlap term, for debugging
}
```

This lets the search results UI show "boosted by your activity" badges when `User > 0`. Cheap, no extra computation — already computed in the rerank step.

### 11.7 Implementation tasks (W5)

1. **Extend `SearchScoreBreakdown`** with the new optional fields.
2. **Extend `VectorMatch` / per-result `Metadata`** to carry the raw vector for vector-sourced candidates.
3. **Add `loadUserProfile()`** method to `SearchEngine` with the 5-min TTL cache.
4. **Add `behaviorRerank()`** private method that does the blend per §11.2.
5. **Wire the new step** into `SearchEngine.Search` between `Deduplicate` and `ExcludeEntitySourcedContentItems`. Skip entirely when `InstanceConfig.Search.BehaviorRerank.Enabled === false` or `loadUserProfile()` returned null.
6. **Add helper functions** in a new file `packages/SearchEngine/src/generic/behavior-rerank.ts`:
   - `cosineSimilarity(a: number[], b: number[]): number`
   - `tagOverlap(userTags: Map<string,number>, candTags: Map<string,number>): number`
   - `blend({rrf, personal, lambda}): number`
   - All pure, easily unit-testable.
7. **Seed `InstanceConfiguration` rows** via metadata sync.
8. **Tests** (`packages/SearchEngine/src/__tests__/`):
   - `behavior-rerank.test.ts` — pure-function correctness for cosine, tag overlap, blend.
   - `SearchEngine.behaviorRerank.test.ts` — integration test mocking `RunView` for profile load and asserting rerank applied / skipped under various configs.
   - Confirm `behaviorRerank` is bypassed when `Enabled=false`.
   - Confirm cold-start (no profile) leaves rankings identical to today.
9. **Manual smoke test** in MJ Explorer:
   - Run the Vectorization + Tag-Affinity jobs against a test user.
   - Flip `Enabled=true` on the InstanceConfiguration.
   - Run the same query as another (non-profiled) user → results should be identical to pre-PR.
   - Run as the profiled user → results should re-order based on their activity.

### 11.8 Acceptance criteria (W5)

- With `Enabled=false`, every search returns byte-identical results to today (regression test).
- With `Enabled=true` and a populated profile, `SearchScoreBreakdown.User > 0` for at least some results, and ordering shifts measurably for queries semantically aligned with the user's recent activity.
- With `Enabled=true` and an empty profile, `SearchScoreBreakdown.User` is absent or 0 and ordering is identical to `Enabled=false`.
- Profile load + rerank adds **< 50ms** p95 to the search pipeline (measured with `console.time` instrumentation in dev).

---

## 12. Workstream 6 — Permissions, Safety, and Observability

### 12.1 Permission contracts

| Concern | Mitigation |
|---|---|
| User vector leaking into another user's results | `Users` entity gets `AllowUserSearchAPI=false` in W1; `VectorSearchProvider` gains an explicit drop step for entities with that flag false; vector metadata also carries `behaviorProfile.excludeFromGlobalSearch=true` as a defense-in-depth check. |
| Tag affinity rows leaking via `TaggedItem` search | `MJ: Tagged Items` is set `AllowUserSearchAPI=false` in W1 anyway. Even if a non-admin can `RunView` `TaggedItem`, the row content (TagID + RecordID) doesn't expose the affinity meaning unless they understand the schema; this is acceptable. |
| Tag affinity job pulling activity for a user the running context can't read | The Action runs with a system context user (configured via the ScheduledJob). It reads activity for *all* users by design. The output (TaggedItem rows) is scoped per-user. No cross-user mixing. |
| User vector built from records the user can no longer read | The template renders activity log rows (which the user can read by definition since they generated the activity). The vector text references record IDs/names, not record content the user can't see. RecordChange `OldValue`/`NewValue` could in theory contain content the user has since lost access to — **mitigation: do not include OldValue/NewValue in the template**, only the FieldName + ChangeType. (Update §8.1 template body accordingly.) |
| Permission filter still drops candidates after rerank | Rerank runs **before** `filterByPermissions` (per §11.1) — final results are still permission-clean. Personalization can never elevate a forbidden record into the result set. |

**Action item:** revise §8.1 template to drop any rendering of `RecordChange.OldValue` / `NewValue`. Use only `Entity`, `RecordID`, `ChangeType`, `__mj_CreatedAt`.

### 12.2 PII / privacy considerations

- The user vector contains a summarized record of the user's recent work — treat it as user PII.
- Vector metadata stored alongside it should be **minimal** — only fields safe to display in any search-result snippet (Name, Title). **Do not include Email** (set `Configuration.metadata.fields.Email.included = false` per §8.3).
- The rendered `DocumentText` field on `EntityRecordDocument` is full-fidelity. Confirm with the data-protection owner that storing a per-user activity summary in this column is acceptable for the deployment. Document this in the EntityDocument's `Description`.

### 12.3 Embedding-model coherence — startup lint

In `SearchEngine.Config` (or a sibling `validateConfiguration()` called at startup):

```typescript
// Pseudocode
const userED = await rv.RunView<MJEntityDocumentEntity>({
    EntityName: 'MJ: Entity Documents',
    ExtraFilter: `Name = 'User Behavior Profile' AND Status = 'Active'`,
    ResultType: 'simple',
    Fields: ['ID', 'AIModelID', 'VectorIndexID']
});
if (userED.Success && userED.Results.length === 1) {
    const ed = userED.Results[0];
    const idx = await this.loadVectorIndex(ed.VectorIndexID);
    if (idx.EmbeddingModelID !== ed.AIModelID) {
        LogError(`User Behavior Profile EntityDocument AIModelID (${ed.AIModelID}) does not match VectorIndex EmbeddingModelID (${idx.EmbeddingModelID}). User-vector cosine similarity with content vectors will be meaningless. Behavior rerank disabled.`);
        this._behaviorRerankDisabledByLint = true;
    }
}
```

If the lint disables rerank, `loadUserProfile` returns null and the search pipeline behaves exactly like today. Loud log once at startup; not on every search.

### 12.4 Observability

Add structured log lines (LogStatus, not console.log) on:
- `RefreshUserBehaviorProfilesAction` — start, per-batch progress every 500 users, completion with stats.
- `ScheduledEntityVectorizationAction` — start, per-EntityDocument start/complete, total stats.
- `ScheduledContentAutotaggingAction` — same shape.
- `SearchEngine.behaviorRerank` — debug-level only, gated by an env flag, sampling 1% of requests; logs the candidate list before/after with score breakdown for offline analysis.

Existing `MJ: Scheduled Job Runs` rows capture per-run outcome via the Action result `Message` (JSON stats).

### 12.5 Implementation tasks (W6)

1. Update §8.1 template to remove `OldValue` / `NewValue` references.
2. Add the startup lint described in §12.3 to `SearchEngine.Config`.
3. Add LogStatus calls to the three new Actions.
4. Add the optional debug logging hook in `behaviorRerank` (env var `MJ_SEARCH_RERANK_DEBUG`).
5. Document the PII consideration in the EntityDocument metadata `Description` and in the README of `@memberjunction/user-behavior-profile`.

### 12.6 Acceptance criteria (W6)

- Restarting MJAPI with a misconfigured User EntityDocument (wrong AIModelID) logs a loud error and disables behavior rerank — search still works.
- A non-admin user search never returns a `Users` or `TaggedItem` row.
- The User Behavior Profile template never references `OldValue`/`NewValue`.

---

## 13. Step-by-Step Implementation Order

Future agent: execute these in order. Each numbered step is a discrete commit (or small group of commits if a step naturally splits).

### Phase A — Foundation (no behavior change yet)

1. **Search hygiene migration prep** — write the audit query script and the metadata sync files to flip `AllowUserSearchAPI=false` on the entities listed in §7.1 (do **not** push yet; review the diff first).
2. **Schema migration** for `RefreshOnSchedule` on `EntityDocument` and `ContentSource` (§10.3). Run migration locally.
3. **Run CodeGen** to regenerate `entity_subclasses.ts`. Commit the generated files.
4. **Push search-hygiene metadata** (`mj sync push --include="entities"`). Confirm no entities you care about lost search capability.
5. **Add the `VectorSearchProvider` filter step** for `AllowUserSearchAPI=false` (§7.2 task 5). Build + unit-test.
6. **Build and run all `SearchEngine` tests** to confirm no regressions.

### Phase B — Maintenance Job Standardization (no behavior change yet)

7. **Implement `ScheduledEntityVectorizationAction`** + its service helper in `@memberjunction/ai-vector-sync` (§10.1, §10.5 tasks 4).
8. **Implement `ScheduledContentAutotaggingAction`** + its service helper in `@memberjunction/content-autotagging` (§10.2, §10.5 task 5).
9. **Run manifest regen** (`npm run mj:manifest:api`).
10. **Create Action metadata files** for the two new Actions; push (`mj sync push --include="actions"`).
11. **Create the three new ScheduledJob metadata records** (§10.4) all `Status: 'Pending'`. Push.
12. **Manually trigger** each new Action via the Actions UI on a test environment to verify wiring; do **not** activate the cron yet.

### Phase C — Tag Affinity Job

13. **Scaffold new package** `@memberjunction/user-behavior-profile` (`scripts/scaffold-tests.mjs packages/AI/UserBehaviorProfile`).
14. **Implement pure helpers** (`decay.ts`, types) with full unit tests.
15. **Implement `UserBehaviorProfileRefresher`** with mocked-RunView unit tests.
16. **Implement `RefreshUserBehaviorProfilesAction`** + Action metadata file.
17. **Manifest regen** + push metadata.
18. **Manual smoke test** — invoke the Action on a small user set, verify `TaggedItem` rows appear/decay/prune correctly.

### Phase D — User Behavior Profile EntityDocument

19. **Verify `vwConversationDetails.UserID`** (§8.2 Option A); add via CodeGen extended properties if missing.
20. **Create `MJ: Entity Document Types` row** `Behavior Profile` (metadata).
21. **Create the Template + TemplateContent + TemplateParam metadata** (§8.1, §8.2). Push.
22. **Create the User Behavior Profile EntityDocument metadata** (§8.3) with `RefreshOnSchedule = 1`. Push.
23. **Manually invoke `VectorizeEntity`** mutation on a single test user (use `listID`) — confirm `EntityRecordDocument` row + vector DB upsert.
24. **Scale up** to all users; verify `EntityRecordDocument` row count == active user count.
25. **Add the embedding-model-coherence startup lint** in `SearchEngine.Config` (§12.3).

### Phase E — Behavior Rerank in `SearchEngine`

26. **Extend `SearchScoreBreakdown`** with `User`, `UserCosine`, `UserTagOverlap` fields.
27. **Extend `VectorMatch` / per-result `Metadata`** to carry the raw vector for vector-sourced candidates.
28. **Implement `behavior-rerank.ts`** pure helpers (cosine, tag overlap, blend) with unit tests.
29. **Implement `SearchEngine.loadUserProfile()`** with 5-min TTL cache.
30. **Implement `SearchEngine.behaviorRerank()`** and wire into `Search()` between `Deduplicate` and `ExcludeEntitySourcedContentItems`.
31. **Seed `InstanceConfiguration` rows** with `Search.BehaviorRerank.Enabled = false` default. Push.
32. **Run all `SearchEngine` tests** — must remain green with `Enabled=false`.
33. **Flip `Enabled=true`** on a dev environment; manually validate ordering changes for the test user.

### Phase F — Activate scheduled jobs

34. **Flip `Status='Active'`** on `Refresh User Behavior Profiles` ScheduledJob in dev. Wait for one cron cycle. Verify `MJ: Scheduled Job Runs` row + populated `TaggedItem` rows.
35. **Flip `Status='Active'`** on `Scheduled Entity Vectorization` in dev. Wait + verify.
36. **Flip `Status='Active'`** on `Scheduled Content Autotagging` (optional for this PR if no ContentSources are enrolled).
37. **Document operations runbook** — how to enroll an EntityDocument / ContentSource (`RefreshOnSchedule = 1`), how to flip the cron jobs Active in production, how to disable behavior rerank if it misbehaves.

---

## 14. Testing Strategy

### Unit tests (Vitest, per package)

| Package | New / Updated Tests |
|---|---|
| `@memberjunction/user-behavior-profile` | `decay.test.ts` (half-life math), `UserBehaviorProfileRefresher.test.ts` (mocked RunView, asserts upsert/delete/decay) |
| `@memberjunction/search-engine` | `behavior-rerank.test.ts` (pure cosine/overlap/blend), `SearchEngine.behaviorRerank.test.ts` (integration with mocked profile load), `VectorSearchProvider.test.ts` (extended: drops AllowUserSearchAPI=false entities) |
| `@memberjunction/ai-vector-sync` | new `EntityVectorScheduler.test.ts` (mocks `VectorizeEntity` calls; asserts iteration over EntityDocuments with `RefreshOnSchedule=1`) |
| `@memberjunction/content-autotagging` | new test for the scheduled-iterator helper |
| Actions packages | smoke tests asserting Action wiring (param extraction, service delegation, result shape) |

### Integration tests

- Stand up local SQL Server + pgvector (or test against the workbench Docker) per `docker/CLAUDE.md`.
- Seed a known set of `UserRecordLog` / `RecordChange` / `TaggedItem` rows for a test user.
- Run `RefreshUserBehaviorProfilesAction` → assert expected `TaggedItem` rows.
- Run `VectorizeEntity` on the User EntityDocument → assert `EntityRecordDocument` row + vector exists.
- Run `SearchEngine.Search` as the test user with `Enabled=true` → assert ordering shifts.
- Run `SearchEngine.Search` as a different user → assert their results unaffected.

### Regression tests

- All existing `SearchEngine` tests must pass with `Search.BehaviorRerank.Enabled=false` (the default).
- Existing search results for queries that don't engage with personalization should be byte-identical.

### Performance budget

- Profile load (`loadUserProfile`): p95 < 20ms (cached) / < 100ms (cold).
- `behaviorRerank` step: p95 < 30ms for 50 candidates.
- Total added latency budget: **< 50ms p95** to the existing search pipeline.

---

## 15. Open Questions / Decisions to Make During Implementation

1. **Should the User Behavior Profile EntityDocument ship `RefreshOnSchedule=1` by default in metadata?** Recommended yes (per L8 reasoning); documented here so reviewers can explicitly approve.
2. **Initial λ value once we enable rerank in production.** Plan defaults to 0.2; consider running A/B with 0.1, 0.2, 0.3 once the pipeline is live.
3. **Should we add a "Find users similar to me" surface as a follow-up?** The user vector enables this trivially, but no UI consumer exists today. Defer to a separate plan.
4. **Should we surface a "Why this result?" tooltip** in the search-results UI showing the new `User` score breakdown? Cheap to add (data is already there) but UI polish; defer unless trivially in-scope.
5. **Cohere/LLM rerank Layer 3.** Mirrors `RerankerService.rerankNotes` for agent memory. Out of scope for this PR; document as the natural next step in a follow-up plan file.

---

## 16. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Embedding-model mismatch between User EntityDocument and content index produces meaningless cosines | Startup lint (§12.3); fail loud, disable rerank, never silently corrupt scores |
| Tag affinity job runs unbounded on a system with many users | `MaxUsers` Action param; `UserBatchSize` controls memory; per L7 caps prevent unbounded `TaggedItem` growth |
| User template hits memory issues with very active users | Per-param `ExtraFilter` + `TopN` caps in §8.2 (50 logs, 50 changes, 30 messages, 50 tags) |
| Re-vectorization burns embedding-API budget | `Status: 'Pending'` default on the scheduled job (L8); explicit opt-in per install; per-document `MaxRecordsPerDocument` cap |
| Rerank introduces a regression for a non-personalized user cohort | Default `Enabled=false`; even when enabled, cold-start users see exactly today's behavior |
| Search hygiene cleanup hides entities someone actually wanted in search | `AutoUpdateAllowUserSearchAPI=false` on each flipped entity prevents Phase 2 LLM from re-flipping; reviewers should call out any entity in §7.1 they disagree with before merge |
| `RecordChange.OldValue/NewValue` content leaks via the user vector text | Template explicitly excludes those fields per §12.1 action item |
| Vector DB cost balloons (more vectors = more storage) | One vector per active user is small relative to content vectors; deterministic SHA-1 ID means no orphans on rerun |

---

## 17. Files Touched (Summary)

**New files:**
- `migrations/v5/V202604xxxx__v2.x__Add_RefreshOnSchedule_To_EntityDocument_ContentSource.sql`
- `packages/AI/UserBehaviorProfile/` (new package)
- `packages/Actions/CoreActions/src/custom/behavior/refresh-user-behavior-profiles.action.ts`
- `packages/Actions/CoreActions/src/custom/vectorization/scheduled-entity-vectorization.action.ts`
- `packages/Actions/CoreActions/src/custom/autotagging/scheduled-content-autotagging.action.ts`
- `packages/SearchEngine/src/generic/behavior-rerank.ts`
- `metadata/templates/user-behavior-profile/.user-behavior-profile-template.json`
- `metadata/templates/user-behavior-profile/user-behavior-profile.template.njk`
- `metadata/entity-document-types/.behavior-profile-type.json`
- `metadata/entity-documents/.user-behavior-profile.json`
- `metadata/actions/.refresh-user-behavior-profiles.json`
- `metadata/actions/.scheduled-entity-vectorization.json`
- `metadata/actions/.scheduled-content-autotagging.json`
- `metadata/scheduled-jobs/.refresh-user-behavior-profiles-job.json`
- `metadata/scheduled-jobs/.scheduled-entity-vectorization-job.json`
- `metadata/scheduled-jobs/.scheduled-content-autotagging-job.json`
- `metadata/instance-configurations/.search-behavior-rerank.json`
- `metadata/entities/<batch update>` for AllowUserSearchAPI flips (paths depend on existing layout)

**Modified files:**
- `packages/SearchEngine/src/generic/SearchEngine.ts` — add `loadUserProfile`, `behaviorRerank`, wire into `Search`, add startup lint
- `packages/SearchEngine/src/generic/SearchFusion.ts` — minor: stash vector on RRF candidates
- `packages/SearchEngine/src/generic/VectorSearchProvider.ts` — drop step for `AllowUserSearchAPI=false` entities; carry raw vector in metadata
- `packages/SearchEngine/src/generic/search.types.ts` — extend `SearchScoreBreakdown`
- `packages/AI/Vectors/Sync/src/models/entityVectorSync.ts` — add `VectorizeAllScheduled()` (or sibling scheduler class)
- `packages/ContentAutotagging/<engine>` — add scheduled-iterator helper
- `packages/MJCoreEntities/src/generated/entity_subclasses.ts` — regenerated post-migration (do not hand-edit)

**Generated (do not hand-edit):**
- `migrations/v5/CodeGen_Run_*.sql` — created by post-migration CodeGen run
- `packages/MJCoreEntities/src/generated/*` — regenerated
- `packages/MJServer/src/generated/generated.ts` — regenerated

---

## 18. References

- **Existing search architecture:** `plans/search/search-plan.md`, `plans/search/search-phase2-plan.md`
- **Search engine code:** `packages/SearchEngine/src/generic/{SearchEngine,SearchFusion,VectorSearchProvider,EntitySearchProvider,FullTextSearchProvider,ReciprocalRankFusion}.ts`
- **Entity Document pipeline:** `packages/AI/Vectors/Sync/src/models/entityVectorSync.ts`
- **Template engine:** `packages/Templates/engine/src/TemplateEngine.ts`
- **Reranker pattern (for follow-up Layer 3):** `packages/AI/Reranker/src/{RerankerService,LLMReranker}.ts`, `packages/AI/Providers/Cohere/src/models/CohereReranker.ts`
- **Scheduled-job exemplar (geocoding):** `packages/Actions/CoreActions/src/custom/geo/scheduled-geocoding.action.ts`, `metadata/scheduled-jobs/.geocoding-maintenance-job.json`, `metadata/actions/.geocoding-maintenance.json`
- **Schema ground truth:** `packages/MJCoreEntities/src/generated/entity_subclasses.ts`
- **Migration & metadata conventions:** `migrations/CLAUDE.md`, `metadata/CLAUDE.md`, root `CLAUDE.md`
- **Actions design philosophy (Actions vs services):** `packages/Actions/CLAUDE.md`

