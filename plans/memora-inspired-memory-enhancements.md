# Memora-Inspired Memory Enhancements

## Technical Architecture Document

**Version**: 1.0 — initial proposal
**Date**: July 2026
**Status**: Proposed design — for review
**Owner**: AI Agents / Memory subsystem
**Source study**: [Memora: A harmonic memory representation balancing abstraction and specificity](https://www.microsoft.com/en-us/research/blog/memora-a-harmonic-memory-representation-balancing-abstraction-and-specificity/) (Microsoft Research, ICML 2026)

---

## Executive Summary

Microsoft Research's **Memora** framework attacks the abstraction–specificity tradeoff in agent memory: content-fragmentation systems (RAG-style) preserve detail but splinter narrative coherence, while coarse-abstraction systems compress efficiently but strip constraints and nuance. Memora's "harmonic" answer is to **decouple storage from indexing** — each memory keeps its full rich value, but only a short (6–8 word) **abstraction** is embedded for similarity search, with **cue anchors** (context-derived tags) providing alternative retrieval entry points, and a **policy-guided retriever** performing iterative, multi-hop recall instead of one-shot top-k. Results: SOTA on LoCoMo (86.3%) and LongMemEval (87.4%), roughly half the stored entries of Mem0, and the largest gains on multi-hop questions.

A structured comparison against MJ's memory system (see §2) shows the two are **complementary, not competing**:

- **MJ is ahead on governance.** Memora's own "future directions" — deferred memory construction, group memory with provenance and access boundaries — are things MJ already ships (the Provisional→hardening lifecycle; the 8-level scope lattice + `AuthorType` provenance + lineage FKs). Memora has no write-path security model, no decay/forgetting story, and no operational observability. MJ has all three, in depth.
- **Memora is ahead on representation and retrieval.** MJ notes are a flat text blob whose **full body** is embedded (`MJAIAgentNoteEntityServer` → `GenerateEmbeddingByFieldName("Note", "EmbeddingVector", ...)`), giving long notes a diluted semantic centroid and exactly **one** retrieval path per note. MJ retrieval is a single-shot vector top-k at run start; multi-hop recall is structurally impossible.

This plan adopts Memora's three transferable ideas into MJ's existing architecture — **without disturbing the "dumb agent, smart framework" guard philosophy** — in three independently shippable phases:

| Phase | Idea | MJ change | Risk |
|---|---|---|---|
| **1** | Abstraction-only embedding | New `AIAgentNote.Abstraction` column; embed it instead of `Note` when present | Low |
| **2** | Cue anchors | New `AIAgentNote.CueAnchors` JSON column; extra vector entries → same note | Low-Medium |
| **3** | Retrieval as reasoning | In-loop `searchMemory` capability (sibling of `memoryWrites`) | Medium |

Each phase is valuable alone; later phases compound on earlier ones (Phase 3's mid-run search benefits from Phase 1/2's sharper index).

---

## 1. Background: the two systems

### 1.1 Memora in brief

- **Memory unit**: {abstraction (6–8 words, the only embedded text)} + {full rich value, never compressed} + {cue anchors: context-aware tags extracted from content, no predefined ontology}.
- **Anti-fragmentation is structural**: because only abstractions are embedded, later detail attaches to the same abstraction instead of splintering into near-duplicate entries (~344 entries/conversation vs. Mem0's 651).
- **Retrieval is active reasoning**: iterative query refinement, anchor-hop expansion to related-but-not-semantically-similar memories, explicit stop decision. Policy is hand-prompted on a strong LLM or RL-distilled into a small model.
- **Not addressed**: adversarial writes, scoping/access control, decay, contradiction resolution, observability.

### 1.2 MJ in brief (see [`guides/AGENT_MEMORY_GUIDE.md`](../guides/AGENT_MEMORY_GUIDE.md))

- **Memory unit**: `AIAgentNote` — flat `Note` text + `Type` + 3 scope FKs + multi-tenant scope dimensions + lifecycle `Status` + `AuthorType` provenance + `ProtectionTier`.
- **Index**: full `Note` body embedded into `EmbeddingVector` on save; mirrored into the in-process vector service (`AIEngine._noteVectorService`).
- **Retrieval**: `AgentContextInjector` runs **once at run start** — `FindSimilarAgentNotes(currentInput)` top-k (default 5), optional reranker over-fetch, rendered into `RECENT NOTES` / `AGENT NOTES` blocks with a precedence policy.
- **Write path**: in-flight `memoryWrites` through the `MemoryWriteManager` guard pipeline (type restriction, per-run cap, scope clamp, ADD-only-strict near-dup guard, Provisional+TTL provenance).
- **Reconciler**: scheduled `MemoryManagerAgent` — hardening, importance scoring, clustering consolidation (0.60), contradiction resolution, Ebbinghaus decay.

### 1.3 The comparison, distilled

| Dimension | Memora | MJ today | Winner |
|---|---|---|---|
| Memory representation | 3-layer harmonic (abstraction + value + anchors) | Flat note text | Memora |
| What's embedded | Short abstraction only | Full note body | Memora |
| Retrieval paths per memory | Many (abstraction + N anchors) | One | Memora |
| Retrieval process | Iterative, multi-hop, policy-guided | One-shot top-k + optional rerank, run start only | Memora |
| Write governance / injection defense | — | Guard pipeline; `Constraint` type barred in-flight | MJ |
| Deferred construction | Future research ("Deferred Memory") | Shipped (Provisional → hardening) | MJ |
| Group/shared memory + provenance | Future research ("Group Memory") | Shipped (scope lattice, `AuthorType`, lineage FKs) | MJ |
| Forgetting | — | Ebbinghaus decay + protection tiers | MJ |
| Contradiction handling | — | Detection/resolution + read-time recency policy | MJ |
| Observability | — | `AIAgentRunStep` per write/phase; smoke harness | MJ |

**Thesis**: adopt Memora's representation/retrieval strengths; keep MJ's governance stack untouched.

---

## 2. Phase 1 — Abstraction-only embeddings

### 2.1 Goal

Embed a short, LLM-generated abstraction of each note instead of the full note body, so that (a) long/detailed notes retrieve as precisely as short ones, and (b) the near-dup and consolidation guards — which compare embeddings — operate on cleaner signal.

### 2.2 Schema

One migration (single `ALTER TABLE`, consolidated per migration rules):

```sql
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD
    Abstraction NVARCHAR(200) NULL;
```

- `Abstraction` — the 6–8-word (≤200 char) essence, e.g. *"User prefers gauge charts for KPI tracking"*. Nullable: legacy notes and fresh in-flight writes may not have one yet.
- `sp_addextendedproperty` description required (CodeGen consumes it).
- **CodeGen must run before any TypeScript references the new field** (per the no-`.Get()`/`.Set()` rule).

### 2.3 Embedding source selection

`MJAIAgentNoteEntityServer.Save()` currently calls `GenerateEmbeddingByFieldName("Note", "EmbeddingVector", "EmbeddingModelID")`. Change to a **prefer-abstraction fallback**:

- If `Abstraction` is non-empty → embed `Abstraction`.
- Else → embed `Note` (today's behavior, unchanged for legacy rows).
- Regenerate when *either* source field is dirty (today: only `Note` dirtiness triggers).

This makes the rollout inherently backward-compatible: nothing breaks while the pool is mixed; retrieval quality improves monotonically as abstractions backfill.

### 2.4 Who writes the abstraction

Consistent with "dumb agent, smart framework", **agents do not author abstractions**:

1. **Hardening pass** (`MemoryManagerAgent`) — the natural home. When promoting `Provisional → Active`, the MM already runs an LLM dedup step; extend that same call to also emit an abstraction (one prompt, two outputs — no added LLM round-trip). Also generate for MM-extracted notes at creation.
2. **Backfill** — a one-time maintenance phase in the MM (batched, resumable via keyset pagination per the deep-pagination rule) that fills `Abstraction` for existing `Active` notes and re-saves (which re-embeds).
3. **In-flight writes** stay abstraction-less (Provisional notes are short by nature — `maxNoteLength` 2000, typically one sentence — so full-body embedding is fine for their ≤7-day pre-hardening life).

### 2.5 Injection rendering

**No change.** The model continues to see the full `Note` text — this is exactly Memora's point: the abstraction is index-only; specificity is preserved at read time.

### 2.6 Touch points

| Area | Change |
|---|---|
| `migrations/v5/` | Add `Abstraction` column + extended property |
| CodeGen | Regenerate entities/views/procs |
| `MJAIAgentNoteEntityServer.server.ts` | Prefer-abstraction embedding source; dual dirty-check |
| `memory-manager-agent.ts` | Abstraction generation in hardening + extraction; backfill phase |
| Guide | Update `AGENT_MEMORY_GUIDE.md` §3/§4 + config table |
| Tests | Unit: embedding-source selection matrix. Integration: hardening produces abstraction; retrieval hits via abstraction |

---

## 3. Phase 2 — Cue anchors

### 3.1 Goal

Give each note **multiple retrieval entry points** so differently-phrased queries route to the same memory — Memora's anchor mechanism — without any ontology and without touching persisted-embedding schema beyond one JSON column.

### 3.2 Schema

```sql
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD
    CueAnchors NVARCHAR(MAX) NULL;
```

- JSON array of short strings, e.g. `["Dave Project Orion update", "Project Orion prototype schedule"]`. Cap: 5 anchors/note (MM-enforced).
- CHECK `ISJSON` constraint; extended property; CodeGen run. Typed accessor via the generated entity (JSON-typed interface per `metadata/CLAUDE.md` conventions if we add one).

### 3.3 Vector-service integration

The in-process `_noteVectorService` currently holds one entry per note (keyed by `NoteID`). Extend to hold **1 + N entries per note** — the primary (abstraction/note) embedding plus one per anchor — all resolving to the same `NoteID`:

- **Key scheme**: `NoteID` for the primary entry; `NoteID#anchor-<i>` for anchors. `FindSimilarAgentNotes` deduplicates by `NoteID` before applying `topK` (a note reachable via 3 anchors is still one result, at its best-scoring path).
- **Sync invariant preserved**: `AddOrUpdateSingleNoteEmbedding` / `RemoveSingleNoteEmbedding` add/remove the whole entry family, so the existing revocation invariant (revoked notes vanish from retrieval without restart) holds unchanged.
- **Persistence**: anchor embeddings are **not** persisted as columns — they're recomputed at boot during the vector-store rebuild (same path that loads persisted note embeddings today) and on save. Anchors are short strings; the embed cost is negligible against boot-time note volume. *(Open question §6.1: persist if boot-time profiling says otherwise.)*

### 3.4 Who writes anchors

Same authority model as abstractions: **Memory Manager only** (hardening + extraction + the Phase 1 backfill pass extends to anchors). The same single LLM call emits `{abstraction, anchors[]}`.

### 3.5 Guard-pipeline interaction

The `MemoryWriteManager` near-dup guard (0.85 shortlist) now benefits: a new in-flight write is compared against primary *and* anchor entries, catching "same fact, different phrasing" earlier. **ADD-only-strict semantics unchanged** — anchors only widen the shortlist; the exact-restatement rule still governs reinforcement vs. new-note.

### 3.6 Touch points

| Area | Change |
|---|---|
| `migrations/v5/` | `CueAnchors` column + ISJSON CHECK + extended property |
| `AIEngine.ts` / vector service | Entry-family model; NoteID dedup in `FindSimilarAgentNotes`; boot rebuild embeds anchors |
| `MJAIAgentNoteEntityServer.server.ts` | Sync entry family on save/delete/status change |
| `memory-manager-agent.ts` | Anchor generation (shared LLM call with abstraction) |
| Tests | Unit: dedup-by-NoteID; family add/remove. Integration: query phrased like an anchor retrieves the note |

---

## 4. Phase 3 — Retrieval as reasoning: in-loop `searchMemory`

### 4.1 Goal

Today memory reaches the model exactly once, at run start, keyed off the initial input. Memora's biggest benchmark wins are on **multi-hop** recall — impossible under one-shot injection. Give agents an in-loop capability to query memory mid-run with refined queries, while the **framework** keeps enforcing scope, status, and count limits.

### 4.2 Surface: a `memoryReads` sibling of `memoryWrites`

Follow the established artifact-tool/memory-write pattern (per the Actions-doctrine analysis in [`plans/agent-inflight-memory-writes.md`](agent-inflight-memory-writes.md) — this is core agent-platform plumbing, not an Action):

```json
{
  "taskComplete": false,
  "memoryReads": [
    { "query": "vendor mentioned in the Orion contract discussions", "maxResults": 3 }
  ],
  "nextStep": { ... }
}
```

- Processed inline by a new `MemoryReadManager` (mirror of `MemoryWriteManager`); results returned as an **expiring conversation message** on the next turn (same delivery mechanism as memory-write dispositions).
- Result rendering reuses the injector's note-block format (type, date, provisional marker, scope) so the precedence policy in `<memory_policy>` applies uniformly to injected *and* searched notes.

### 4.3 Framework guards (non-negotiable)

| Guard | Behavior |
|---|---|
| **Gating** | New `AIAgent.AllowMemorySearch` flag (default **on**, matching `AllowMemoryWrite`); three-layer enforcement identical to `memoryWrites` (template visibility, prompt-param, execution skip-step) |
| **Scope clamp** | Queries always filtered to the run's (agent, user, company) lattice — an agent can never search outside its injection scope. Reuses `FindSimilarAgentNotes`' existing scope filters verbatim |
| **Status filter** | `INJECTABLE_NOTE_STATUSES` only — searched retrieval sees exactly what injection sees |
| **Per-run cap** | Default 3 searches/run → `skipped-cap` (prevents retrieval loops burning turns) |
| **Result cap** | `maxResults` clamped to `MaxNotesToInject` |
| **Observability** | Each search = a `Tool` run step (`Memory Search`) with query + result NoteIDs in `OutputData` |

### 4.4 What we are NOT building (v1)

- **No RL-distilled retrieval policy.** The agent's own loop *is* the policy — it refines queries and decides when to stop, bounded by the cap. Memora's distillation is an optimization we can revisit if search-turn costs matter.
- **No anchor-graph traversal API.** Phase 2 anchors already give multi-path entry; explicit hop-expansion ("also fetch notes sharing an anchor with result #2") is deferred (§6.3).
- **No agent-visible embeddings/scores** — notes only, same rendering as injection.

### 4.5 Touch points

| Area | Change |
|---|---|
| `migrations/v5/` | `AIAgent.AllowMemorySearch BIT NOT NULL DEFAULT 1` + extended property |
| `packages/AI/Agents` | `MemoryReadManager`; loop-response schema + prompt-template docs (gated on a `_MEMORY_SEARCH_ENABLED` param); `BaseAgent` wiring |
| Guide | New §"Reading memory mid-run" in `AGENT_MEMORY_GUIDE.md` |
| Tests | Unit: guard matrix (gating/caps/scope clamp). Integration: multi-hop scenario — fact reachable only via a refined second query |

---

## 5. Rollout & sequencing

1. **Phase 1** ships first — one migration + CodeGen + two focused code changes; benefits every existing retrieval/dedup path immediately as backfill proceeds. **No behavior change** until abstractions exist.
2. **Phase 2** rides on Phase 1's MM prompt (same LLM call). Vector-service change is the only delicate part; land behind the entry-family refactor with the revocation-invariant test extended.
3. **Phase 3** is independent of 1–2 in code but sequenced last so mid-run search launches against the sharper index.
4. Each phase: migration → CodeGen → typed implementation → unit tests → deterministic integration suite additions (`packages/MJServer/integration-test-scripts/`, self-cleaning fixtures) → guide update. Per repo policy, **no phase is "done" until `npm run test:integration` passes**.

## 6. Open questions

1. **Persist anchor embeddings?** (§3.3) Boot-time re-embedding of ≤5 short strings per note is likely cheap; profile the vector-store rebuild on a large note pool before deciding on a persisted `CueAnchorEmbeddings` companion.
2. **Abstraction staleness on note edit.** If a user hand-edits `Note` in Explorer, the abstraction may drift. Proposal: `Note` dirty + `Abstraction` not explicitly changed → null the abstraction (falls back to full-body embedding) and let the MM regenerate next cycle. Mirrors the self-healing default elsewhere in the pipeline.
3. **Anchor-hop expansion (Memora's full multi-hop).** A v2 `memoryReads` option `expandAnchors: true` that unions notes sharing anchors with the top hits — deferred until Phase 3 telemetry shows refined-query search alone leaves recall on the table.
4. **Examples.** `AIAgentExample` retrieval (`Semantic` strategy) has the same flat-embedding limitation. Out of scope here; revisit after note-side results.

## 7. References

| Topic | Where |
|---|---|
| Memora blog post | microsoft.com/en-us/research/blog/memora-a-harmonic-memory-representation-balancing-abstraction-and-specificity/ |
| MJ memory architecture | [`guides/AGENT_MEMORY_GUIDE.md`](../guides/AGENT_MEMORY_GUIDE.md) |
| In-flight writes design (pattern precedent for Phase 3) | [`plans/agent-inflight-memory-writes.md`](agent-inflight-memory-writes.md) |
| Consolidation/decay spec | [`specs/001-memory-consolidation/spec.md`](../specs/001-memory-consolidation/spec.md) |
| Scoping model | `packages/AI/Agents/docs/AGENT_MEMORY_SCOPING.md` |
| Embedding save path | `packages/MJCoreEntitiesServer/src/custom/MJAIAgentNoteEntityServer.server.ts` |
| Vector service / retrieval | `packages/AI/Engine/src/AIEngine.ts` (`FindSimilarAgentNotes`) |
| Injection | `packages/AI/Agents/src/agent-context-injector.ts` |
| Write guards | `packages/AI/Agents/src/MemoryWriteManager.ts` |
