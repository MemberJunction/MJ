# Agent In-Flight Memory Writes

## Technical Architecture Document

**Version**: 1.1 — amended per PR #2761 review discussion (`Status='Provisional'` lifecycle, recency-wins precedence)
**Date**: June 2026
**Status**: Approved design — in implementation
**Owner**: AI Agents / Memory subsystem

---

## Executive Summary

MemberJunction agents today can **read** durable long-term memory (agent notes/examples are injected at run start via `BaseAgent.InjectContextMemory()`) and can **jot** ephemeral working memory (the `scratchpad` field, which dies when the run ends). What they **cannot** do is **commit a durable, cross-run memory in the moment** — e.g. the user says "I don't like blue charts" and the agent wants that fact to persist for next time.

Durable memory writes happen **only** in the scheduled `MemoryManagerAgent` (a ~15-minute batch that extracts notes from rated conversations and agent runs). So the path from "user states a preference" to "durable, injectable memory" is **indirect and delayed** — and only happens if the batch later decides the run was worth extracting from.

This is the single most notable gap relative to the broader agent-memory field. **Letta/MemGPT** and **mem0/LangMem** all support agent- or hot-path-authored durable writes; MJ does not. This document specifies a **built-in `RecordMemory` tool** that lets an agent write a durable memory **in flight**, landing with **`Status='Provisional'`** — a new lifecycle status that is **immediately injectable** — with the existing `MemoryManagerAgent` later **hardening** it (`Status → 'Active'`: consolidation, contradiction resolution, pruning) asynchronously.

### The three-tier memory model

| Tier | What | Substrate | Lifetime | Owner |
|---|---|---|---|---|
| **Short-term** | Run reasoning, task tracking | `scratchpad` (in-context) | Single run | Agent (in-loop) |
| **Intermediate** *(new)* | Agent-authored facts/preferences | `AIAgentNote`, `Status='Provisional'` | Until hardened or TTL-expired | Agent (in-loop) writes; framework guards |
| **Long-term** | Vetted, scoped, consolidated knowledge | `AIAgentNote`, `Status='Active'` | Decay-managed | `MemoryManagerAgent` (async) |

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
| Memory read/injection | `base-agent.ts` → `InjectContextMemory` (~L1645), `_injectedMemory` (~L1581) | Provisional notes injected immediately, labeled |
| Injection formatting + `<memory_policy>` | `packages/AI/Agents/src/agent-context-injector.ts` → `FormatNotesForInjection` (~L722) | Provisional labeling + recency-wins precedence |
| Tool-manager pattern | `packages/AI/Agents/src/ArtifactToolManager.ts` | Template for `MemoryWriteManager` |
| Note persistence + auto-embed | `packages/MJCoreEntitiesServer/src/custom/MJAIAgentNoteEntityServer.server.ts` | Reused as-is — Save() embeds + syncs vector service |
| In-memory vector search | `packages/AI/Engine/src/AIEngine.ts` → `FindSimilarAgentNotes` | Reused for write-time near-dup guard |
| Async hardening | `packages/AI/Agents/src/memory-manager-agent.ts` | New hardening pass over provisional notes |

---

## Schema Changes (`AIAgentNote`)

One widened constraint + one new column. **Provenance, lifecycle status, and decay-resistance are kept as three orthogonal dimensions** — do *not* overload `ProtectionTier='Ephemeral'` to mean "unvetted" (Ephemeral means "decays fast," which is unrelated to trust).

```sql
-- Widen the existing Status CHECK constraint (CK_AIAgentNote_Status)
-- from ('Active','Pending','Revoked','Archived') to include 'Provisional'
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote
    ADD CONSTRAINT CK_AIAgentNote_Status
    CHECK (Status IN ('Active','Pending','Revoked','Archived','Provisional'));

ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD
    AuthoredBy NVARCHAR(20) NOT NULL DEFAULT 'MemoryManager'
    CONSTRAINT CK_AIAgentNote_AuthoredBy CHECK (AuthoredBy IN ('Agent','MemoryManager','User'));
```

- **`Status='Provisional'`** — the core signal, as a first-class lifecycle state rather than a separate timestamp column. `Provisional` = written in-flight by an agent, **immediately injectable**, not yet vetted. The `MemoryManagerAgent` *hardens* it (`Status → 'Active'`) or prunes it (`Archived`/`Revoked`). The injectable-status set becomes `('Active','Provisional')` — every read-path filter that previously tested `Status='Active'` widens accordingly (vector-service sync, embeddings refresh, fallback cache, SQL scoping query, TTL pruning).
- **`AuthoredBy`** (`'Agent' | 'MemoryManager' | 'User'`) — explicit provenance. Necessary because `SourceAgentRunID` alone can't distinguish *written-in-flight-by-agent* from *extracted-from-a-run-by-MM* (both carry a run ID). Default `'MemoryManager'` preserves existing-row semantics.

Existing fields reused unchanged: `Type` (constrained at write — see safety), `ImportanceScore`, `ProtectionTier` (defaults `Standard`), `ExpiresAt` (TTL safety net), `EmbeddingVector`/`EmbeddingModelID` (auto-filled on Save), scope fields (`PrimaryScopeRecordID`, `SecondaryScopes`, user/company), `SourceConversationID`/`SourceConversationDetailID`/`SourceAgentRunID` (provenance), `DerivedFromNoteIDs`/`ConsolidatedIntoNoteID` (hardening lineage).

> **Workflow note:** per project rules, write the migration → run migration + CodeGen → *then* write TypeScript that references `AuthoredBy`/`AllowMemoryWrite`/the widened `Status` union via the strongly-typed generated properties. No `.Get()`/`.Set()`.

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
 * Processed inline on the same turn (zero turn cost). Lands with
 * Status='Provisional' — immediately injectable into future runs; the
 * Memory Manager hardens (Status → 'Active') or prunes it later.
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
4. **Near-dup guard** — one in-memory vector check via `AIEngine.FindSimilarAgentNotes` against injectable notes in the same scope. Two outcomes:
   - Hit on a note **written earlier in this same run** → **supersede-own**: update that provisional note's text in place (last-write-wins within a run — "I love blue charts!" then "actually, red charts!" yields one red-charts note, no stale row).
   - Hit on a **pre-existing** note → bump `AccessCount`/`LastAccessedAt` on it instead of inserting. This kills trivial duplicate storms; *real* cross-run conflict resolution stays deferred to MM (plus recency-wins precedence at injection time in the interim).
5. **Provenance + flags** — `Status='Provisional'`, `AuthoredBy='Agent'`, `ProtectionTier='Standard'`, `SourceAgentRunID`/`SourceConversationID(/DetailID)` stamped, default `ExpiresAt = now + 7 days` (TTL safety net).
6. **Per-run cap + within-run idempotency** — a run-scoped `MemoryWriteManager` (mirroring `ArtifactToolManager`'s run state) holds a hash set of memories written this run (dedup repeated emissions across turns) and enforces a small cap (a handful, not the MM's 1000) so a runaway loop cannot spam the store.
7. **Trace** — each write recorded as an agent run step (success/skip/reason), same as artifact tool calls.

---

## Injection Trust (provisional vs. hardened)

This is where the `Provisional` status earns its keep at **runtime**, not just bookkeeping.

- **Higher precedence — recency wins.** `FormatNotesForInjection` renders provisional notes in their own block, **first**, labeled `(provisional)`, and the `<memory_policy>` block instructs the consuming LLM: when a provisional note and an established note conflict on the same topic, **follow the provisional one** — it is the newest signal ("I just told you I now love blue charts" must beat a months-old "prefers red charts"). Established-note precedence (user > company > global, then recency) is unchanged below that.
- **Trust-posture tradeoff, stated explicitly:** recency-wins means an unvetted note briefly outranks vetted ones. The blast radius is contained by the layers below — this inversion is deliberate (a freshly-stated user preference *should* win) and was agreed in PR #2761 review discussion.
- **Descriptive-only at the source.** Because injected notes carry quasi-instruction precedence (above defaults), a planted memory is a persistent steering vector into every future run. Constraining in-flight writes to `Preference`/`Context` (step 2 above) keeps the blast radius to low-risk descriptive facts; behavioral instructions can only enter the store through MM/human promotion. Combined with the scope clamp (never global), the per-run cap, and the TTL, a prompt-injected "memory" is a short-lived, narrowly-scoped, non-behavioral note that MM reviews within one cycle.
- **Self-cleaning.** The default `ExpiresAt` TTL means provisional noise that MM never promotes auto-decays out via existing machinery — even if MM falls behind or never runs. Hardening sets `ExpiresAt = NULL`, handing lifetime to the standard decay machinery.

---

## Memory Manager: the Hardening Pass

A new pass in `MemoryManagerAgent` (runs **first** in its existing maintenance cycle, so newly-hardened notes participate in importance/consolidation/contradiction/decay in the same cycle) over `Status='Provisional' AND AuthoredBy='Agent'`:

1. **Consolidate/dedup** against existing hardened notes (reuses current similarity + LLM dedup pipeline). Duplicate → `Archived` with `ConsolidatedIntoNoteID` lineage.
2. **Contradiction resolution** — reuse existing contradiction detection; provisional contradicting an older Active note → recency wins, the old note is `Revoked` (Immutable/Protected tiers preserved); a provisional note the LLM judges wrong/low-confidence → `Archived`.
3. **Scope adjustment** — v1 keeps scope unchanged (writes are already clamped ≤ Agent+User); scope *widening* remains the existing consolidation phase's job once the note is Active. Broad scope is exclusively MM's judgment.
4. **Importance scoring** — runs right after hardening in the same maintenance cycle; hardened notes get the 7-signal score then.
5. **Harden survivors** — set `Status = 'Active'`, `ExpiresAt = NULL` (lifetime handed to the standard decay machinery, same as MM-extracted notes).

Net: the agent writes "user dislikes blue charts" at Agent+User scope, instantly usable next run; MM later decides whether to keep it, broaden it, merge it, or drop it — using all of its existing features.

---

## Phasing

- **Phase 1 — Write path.** Migration (widen `Status` CHECK with `Provisional`, add `AuthoredBy`, add `AllowMemoryWrite`) + CodeGen; injectable-status read-path widening; `memoryWrites` field + system-prompt docs; `MemoryWriteManager` + `executeMemoryWritesAsSteps` with gate/type-guard/scope-clamp/near-dup(supersede-own)/provenance/cap; unit tests.
- **Phase 2 — Injection trust.** Provisional labeling + recency-wins precedence in `FormatNotesForInjection`; TTL defaults; tests for prompt-injection containment.
- **Phase 3 — Hardening pass.** New `MemoryManagerAgent` pass (first in maintenance cycle); dedup/contradiction integration; tests.
- **Phase 4 (optional) — Thin Action wrapper.** Expose memory-write to Flows/low-code via an Action delegating to the shared service.

---

## Resolved Design Decisions (from PR #2761 review discussion)

1. **`Status='Provisional'` over `HardenedAt`** — lifecycle state, not a timestamp column. Cleaner semantics; the hardening audit trail lives in Record Changes.
2. **Higher precedence for provisional notes** — recency wins at injection time; an in-the-moment correction must beat stale vetted memory. The Memory Manager treats provisional notes as *suggestions* to reconcile, not ground truth.
3. **Same-run conflicts: supersede-own** — a near-dup hit on a note written earlier in the same run updates that note in place (last-write-wins within a run). Cross-run conflicts defer to MM.
4. **`ExpiresAt` on hardening: cleared to NULL** — hardened notes are decay-managed like every other Active note.
5. **`AuthoredBy` default `'MemoryManager'`** — correct for all legacy rows.
6. **Sub-agent writes** — each agent reads its **own** `AllowMemoryWrite` flag; no inheritance (scope/identity differ).
7. **Notes only for v1** — no in-flight `AIAgentExample` writes.
8. **Near-dup threshold** — 0.85 at write time (tighter than MM's 0.60 clustering), constructor-configurable on `MemoryWriteManager`.

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
