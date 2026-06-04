# Agent In-Flight Memory Writes

## Technical Architecture Document

**Version**: 1.0
**Date**: June 2026
**Status**: Proposal — Phase 1 planning
**Owner**: AI Agents / Memory subsystem

---

## Executive Summary

MemberJunction agents today can **read** durable long-term memory (agent notes/examples are injected at run start via `BaseAgent.InjectContextMemory()`) and can **jot** ephemeral working memory (the `scratchpad` field, which dies when the run ends). What they **cannot** do is **commit a durable, cross-run memory in the moment** — e.g. the user says "I don't like blue charts" and the agent wants that fact to persist for next time.

Durable memory writes happen **only** in the scheduled `MemoryManagerAgent` (a ~15-minute batch that extracts notes from rated conversations and agent runs). So the path from "user states a preference" to "durable, injectable memory" is **indirect and delayed** — and only happens if the batch later decides the run was worth extracting from.

This is the single most notable gap relative to the broader agent-memory field. **Letta/MemGPT** and **mem0/LangMem** all support agent- or hot-path-authored durable writes; MJ does not. This document specifies a **built-in `RecordMemory` tool** that lets an agent write a durable memory **in flight**, landing `Active` (immediately injectable) but flagged **provisional/unhardened**, with the existing `MemoryManagerAgent` later **hardening** it (scope-widening, consolidation, contradiction resolution, pruning) asynchronously.

### The three-tier memory model

| Tier | What | Substrate | Lifetime | Owner |
|---|---|---|---|---|
| **Short-term** | Run reasoning, task tracking | `scratchpad` (in-context) | Single run | Agent (in-loop) |
| **Intermediate** *(new)* | Agent-authored facts/preferences | `AIAgentNote`, `Active` + `HardenedAt IS NULL` | Until hardened or TTL-expired | Agent (in-loop) writes; framework guards |
| **Long-term** | Vetted, scoped, consolidated knowledge | `AIAgentNote`, `Active` + `HardenedAt` set | Decay-managed | `MemoryManagerAgent` (async) |

This mirrors human memory consolidation (working → episodic → semantic) and is consistent with the cognitive-science framing already used by the Memory Manager (Ebbinghaus decay, importance scoring, protection tiers). It also independently converges on **mem0's 2026 "single-pass ADD-only, defer reconciliation" strategy** — a cheap immediate write, with the hard conflict resolution deferred to an async reconciler. MJ's `MemoryManagerAgent` is a materially stronger reconciler than the field ships, so the combination is a net advantage.

---

## Design Principle: Dumb agent, smart framework

The agent-facing surface is intentionally **trivial**: "remember this." All of the safety, scoping discipline, deduplication, and lifecycle live in the **framework** (inline handler in `BaseAgent`) and in the **`MemoryManagerAgent`** (async hardening). The agent should never have to reason about scope precedence, embeddings, decay, or contradiction — it just states a fact and the platform does the right thing.

---

## Why a built-in tool (not an Action, not the scratchpad)

We evaluated three existing in-flight mechanisms as the model for memory writes:

| Concern | **Action** | **Built-in tool** (artifact-tool pattern) | **Scratchpad** |
|---|---|---|---|
| Persistence | Durable | **Durable** | None (ephemeral) |
| Native run-context access (AgentID, scope, SourceRunID) | Marshalled across boundary | **In-scope, free** | In-scope |
| Invocation cost | Action-engine round-trip + execution-log rows | **Inline, cheap** | Inline, free |
| Gating | Per-agent metadata assignment (`AIAgentAction`) | **Single config flag** | Always on |
| Embedding/vector sync | Hand-wired | **Already the pattern** (`MJAIAgentNoteEntityServer`) | N/A |
| Traceability | Execution logs | **Run steps** | None |
| Semantic category | External integration boundary | **Durable run side-effect** | Working memory |

**Decision: build it on the artifact-tool pattern.** Memory is a *sibling of artifacts*, not of integrations — both are durable, embedded, scoped side-effects of a run that the framework persists. The `ArtifactToolManager` already solves every problem a memory-write tool has: inline processing (zero added round-trip), a dedicated response field, native run-context access for provenance, prompt-injected tool docs, and step-level tracing. `MJAIAgentNoteEntityServer.Save()` already auto-embeds and syncs the in-memory vector service — the same seam artifact persistence uses.

**Why not an Action.** Per the project's Actions doctrine (`CLAUDE.md` §"Actions Design Philosophy"), Actions are **boundaries to external/workflow/low-code systems, not internal agent-platform plumbing**. A memory write is a core agent primitive that needs intrinsic run identity and scope — which an Action only gets by marshalling stamped context through a generic param bag (the exact context-loss the doctrine warns about), plus an action-engine round-trip and an execution-log row per memory, and it scatters memory semantics into CoreActions away from the framework that owns scoping/decay/injection. Wrong altitude.

**Why not the scratchpad.** Right ergonomics, wrong substrate: no persistence, embedding, or scoping. (Note the artifact-tool pattern *is* "scratchpad ergonomics + durable effect" — that's precisely the sweet spot we want.)

**Future:** if non-agent surfaces (Flows, the low-code workflow builder, deterministic steps) ever need to write memory, add a *thin* Action that delegates to the **same** memory-write service the built-in tool uses (per the "keep Actions thin, delegate to a service" rule). One service, two surfaces, no duplication. Out of scope for v1.

---

## Current-State Reference (files this builds on)

| Concern | File | Notes |
|---|---|---|
| Loop response shape (sibling fields `scratchpad`, `artifactToolCalls`) | `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts` | New `memoryWrites?` field added here |
| Loop system prompt (tool docs) | `metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md` | New tool documentation block |
| Inline tool execution model | `packages/AI/Agents/src/base-agent.ts` → `executeArtifactToolCallsAsSteps` (~L3990) | Template for `executeMemoryWritesAsSteps` |
| Memory read/injection | `base-agent.ts` → `InjectContextMemory` (~L1645), `_injectedMemory` (~L1581) | Provisional notes get lower-trust injection |
| Injection formatting + `<memory_policy>` | `packages/AI/Agents/src/agent-context-injector.ts` → `FormatNotesForInjection` (~L722) | Add provisional labeling + precedence |
| Tool-manager pattern | `packages/AI/Agents/src/ArtifactToolManager.ts` | Template for `MemoryWriteManager` |
| Note persistence + auto-embed | `packages/MJCoreEntitiesServer/src/custom/MJAIAgentNoteEntityServer.server.ts` | Reused as-is — Save() embeds + syncs vector service |
| In-memory vector search | `packages/AI/Engine/src/AIEngine.ts` → `FindSimilarAgentNotes` | Reused for write-time near-dup guard |
| Async hardening | `packages/AI/Agents/src/memory-manager-agent.ts` | New hardening pass over provisional notes |

---

## Schema Changes (`AIAgentNote`)

Two new columns. **Provenance, lifecycle status, and decay-resistance are kept as three orthogonal dimensions** — do *not* overload `ProtectionTier='Ephemeral'` to mean "unvetted" (Ephemeral means "decays fast," which is unrelated to trust).

```sql
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD
    HardenedAt DATETIMEOFFSET NULL,
    AuthoredBy NVARCHAR(20) NOT NULL DEFAULT 'MemoryManager';
```

- **`HardenedAt`** (`DATETIMEOFFSET NULL`) — the core signal. `NULL` = provisional/in-flight (written by an agent, not yet vetted). Set by `MemoryManagerAgent` when it consolidates/vets. Gives both the boolean ("is it hardened?") **and** an audit timestamp in one column.
- **`AuthoredBy`** (`'Agent' | 'MemoryManager' | 'User'`) — explicit provenance. Necessary because `SourceAgentRunID` alone can't distinguish *written-in-flight-by-agent* from *extracted-from-a-run-by-MM* (both carry a run ID). Default `'MemoryManager'` preserves existing-row semantics.

Existing fields reused unchanged: `Status` (lands `Active`), `Type` (constrained at write — see safety), `ImportanceScore`, `ProtectionTier` (defaults `Standard`), `ExpiresAt` (TTL safety net), `EmbeddingVector`/`EmbeddingModelID` (auto-filled on Save), scope fields (`PrimaryScopeRecordID`, `SecondaryScopes`, user/company), `SourceConversationID`/`SourceConversationDetailID`/`SourceAgentRunID` (provenance), `DerivedFromNoteIDs`/`ConsolidatedIntoNoteID` (hardening lineage).

> **Workflow note:** per project rules, write the migration → run migration + CodeGen → *then* write TypeScript that references `HardenedAt`/`AuthoredBy` via the strongly-typed generated properties. No `.Get()`/`.Set()`.

### Agent config flag

Gate the capability like `InjectNotes`. Proposed field on `AIAgent`:

```sql
ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    AllowMemoryWrite BIT NOT NULL DEFAULT 0;
```

Off by default — opt-in per agent. Restricted/system agents and user-facing assistants can be enabled selectively.

---

## Agent-Facing Tool

New sibling field on the loop response (alongside `scratchpad` and `artifactToolCalls`), processed **inline on the same turn (zero added round-trip)**:

```typescript
// loop-agent-response-type.ts
/**
 * Durable memory writes — record a fact/preference to remember across runs.
 * Processed inline on the same turn (zero turn cost). Lands Active immediately
 * but provisional; the Memory Manager hardens/consolidates later.
 * Only honored when the agent has AllowMemoryWrite=true.
 */
memoryWrites?: MemoryWriteRequest[];

export interface MemoryWriteRequest {
    /** The fact to remember, e.g. "User prefers bar charts over pie charts." */
    note: string;
    /** Descriptive category only. Behavioral/Constraint types are rejected in-flight. */
    type: 'Preference' | 'Context';
    /** Optional scope hint; framework CLAMPS to <= Agent+User regardless. */
    scopeHint?: 'user' | 'agent';
}
```

Tool documentation added to the loop system prompt template, in the same style as the artifact-tools and scratchpad sections. Guidance to the model: record durable user facts/preferences the moment they're stated; keep each memory atomic and declarative; do not record transient task state (use the scratchpad for that).

---

## Framework Handler (`BaseAgent`)

`executeMemoryWritesAsSteps()` — modeled directly on `executeArtifactToolCallsAsSteps()`. For each `MemoryWriteRequest`, the framework (not the agent) enforces all of the following, then persists via `md.GetEntityObject('MJ: AI Agent Notes')` → `Save()` (which auto-embeds and syncs the vector service):

1. **Capability gate** — no-op (with a logged step) if `AllowMemoryWrite=false`.
2. **Type guard** — reject anything outside `Preference`/`Context`. Instruction-like/`Constraint` memories require MM or human promotion (prompt-injection defense — see below).
3. **Scope clamp** — force scope to **≤ Agent + User** (+ Company if present in context). A `scopeHint` may *narrow* but never *broaden*. In-flight writes **never** land global/company-wide. Scope-widening is exclusively MM's judgment.
4. **Near-dup guard** — one in-memory vector check via `AIEngine.FindSimilarAgentNotes` against `Active` notes in the same scope. Near-duplicate (≥ configured threshold) → bump `AccessCount`/`LastAccessedAt` on the existing note instead of inserting. This kills trivial duplicate storms; *real* conflict resolution stays deferred to MM.
5. **Provenance + flags** — `Status='Active'`, `HardenedAt=NULL`, `AuthoredBy='Agent'`, `ProtectionTier='Standard'`, `SourceAgentRunID`/`SourceConversationID(/DetailID)` stamped, default `ExpiresAt = now + 7 days` (TTL safety net).
6. **Per-run cap + within-run idempotency** — a run-scoped `MemoryWriteManager` (mirroring `ArtifactToolManager`'s run state) holds a hash set of memories written this run (dedup repeated emissions across turns) and enforces a small cap (a handful, not the MM's 1000) so a runaway loop cannot spam the store.
7. **Trace** — each write recorded as an agent run step (success/skip/reason), same as artifact tool calls.

---

## Injection Trust (provisional vs. hardened)

This is where the `HardenedAt` flag earns its keep at **runtime**, not just bookkeeping — and it is the primary prompt-injection mitigation.

- **Lower precedence.** `FormatNotesForInjection` labels unhardened notes `(provisional, in-session)` and places them **below** hardened notes in the `<memory_policy>` precedence block, so the consuming LLM weights them lower until vetted.
- **Descriptive-only at the source.** Because injected notes carry quasi-instruction precedence (above defaults), a planted memory is a persistent steering vector into every future run. Constraining in-flight writes to `Preference`/`Context` (step 2 above) keeps the blast radius to low-risk descriptive facts; behavioral instructions can only enter the store through MM/human promotion.
- **Self-cleaning.** The default `ExpiresAt` TTL means provisional noise that MM never promotes auto-decays out via existing machinery — even if MM falls behind or never runs. Hardening clears/extends `ExpiresAt`.

---

## Memory Manager: the Hardening Pass

A new pass in `MemoryManagerAgent` (runs in its existing scheduled cycle) over `Status='Active' AND HardenedAt IS NULL AND AuthoredBy='Agent'`:

1. **Consolidate/dedup** against existing hardened notes (reuses current similarity + LLM dedup pipeline).
2. **Scope adjustment** — promote scope only when warranted (e.g. a preference seen across many users → company/global), demote/split if mis-scoped. This is the *only* path to broad scope.
3. **Contradiction resolution** — reuse existing contradiction detection; `Revoke` superseded provisional notes; preserve high-importance.
4. **Importance scoring** — run the 7-signal score; provisional notes inherit it on hardening.
5. **Harden** — set `HardenedAt = now`, recompute `ExpiresAt` from decay policy, record lineage in `DerivedFromNoteIDs`/`ConsolidatedIntoNoteID` if merged.
6. **Prune** — provisional notes that fail confidence/utility thresholds are `Archived` (or left to TTL expiry).

Net: the agent writes "user dislikes blue charts" at Agent+User scope, instantly usable next run; MM later decides whether to keep it, broaden it, merge it, or drop it — using all of its existing features.

---

## Phasing

- **Phase 1 — Write path.** Migration (`HardenedAt`, `AuthoredBy`, `AllowMemoryWrite`) + CodeGen; `memoryWrites` field + system-prompt docs; `MemoryWriteManager` + `executeMemoryWritesAsSteps` with gate/type-guard/scope-clamp/near-dup/provenance/cap; unit tests.
- **Phase 2 — Injection trust.** Provisional labeling + precedence in `FormatNotesForInjection`; TTL defaults; tests for prompt-injection containment.
- **Phase 3 — Hardening pass.** New `MemoryManagerAgent` pass; consolidation/scope-promotion/contradiction integration; tests.
- **Phase 4 (optional) — Thin Action wrapper.** Expose memory-write to Flows/low-code via an Action delegating to the shared service.

---

## Open Questions

1. **`AuthoredBy` default** — `'MemoryManager'` for back-compat vs. a nullable/`'Unknown'` for honesty on legacy rows. Leaning `'MemoryManager'`.
2. **Near-dup threshold** — reuse MM's 0.85 dedup similarity, or a distinct (tighter?) write-time threshold.
3. **Default TTL** — 7 days proposed; should it scale with the agent's MM cadence so a memory always survives at least one hardening cycle?
4. **Sub-agent writes** — do sub-agents inherit `AllowMemoryWrite` from the parent, or require their own flag? (Leaning: own flag, since scope/identity differ.)
5. **Examples** — should agents also write provisional `AIAgentExample`s in-flight, or notes only for v1? (Leaning: notes only for v1.)

---

## Competitive Context

| System | In-flight durable write | Async reconciler | Notes |
|---|---|---|---|
| **Letta/MemGPT** | ✅ Self-edit via tool calls | ✗ (agent-driven) | Closest analog to this proposal |
| **mem0 (2026)** | ✅ Hot-path ADD-only | Deferred/async | This proposal mirrors the strategy |
| **LangMem** | ✅ Hot-path + background | Background formation | Similar split |
| **MJ (today)** | ✗ | ✅ `MemoryManagerAgent` (strong) | Has the reconciler, lacks the write |
| **MJ (proposed)** | ✅ `RecordMemory` tool | ✅ + hardening pass | Best-of-both |

This proposal closes the one capability MJ lacks while keeping its differentiators (rigorous decay/forgetting, enterprise multi-dimensional scoping, examples-as-memory, platform-native governance).
