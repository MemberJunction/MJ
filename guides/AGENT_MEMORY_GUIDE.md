# Agent Memory Guide

How MemberJunction agents remember things — the complete architecture for durable agent memory: what gets stored, how it gets written, how it reaches the model at run time, and how the platform keeps the memory pool accurate and bounded over time.

**Audience**: developers building or configuring agents, and anyone debugging "why does (or doesn't) my agent remember X?"

---

## 1. The mental model

MJ agent memory is a three-tier system. Each tier has a different substrate, lifetime, and owner:

| Tier | What | Substrate | Lifetime | Who writes it |
|---|---|---|---|---|
| **Short-term** | Run reasoning, task tracking | `scratchpad` (in-context, per-run) | Single run — dies with it | The agent, in-loop |
| **Intermediate** | Facts/preferences captured the moment they're stated | `AIAgentNote` with `Status='Provisional'` | Until hardened or TTL-expired (default 7 days) | The agent, in-flight (`memoryWrites`) |
| **Long-term** | Vetted, consolidated knowledge | `AIAgentNote` with `Status='Active'` (+ `AIAgentExample` rows) | Decay-managed | The Memory Manager (scheduled) |

The note lifecycle:

```
                    agent memoryWrites                 MemoryManagerAgent (scheduled)
 user states fact ──────────────────────► Provisional ───────────────────────────► Active
                                              │            harden (every cycle)       │
                                              │                                       │ consolidation /
                    MM extraction             │ TTL expiry / dedupe-archive           │ contradiction /
 rated conversations ───────────► Active      ▼                                       ▼ Ebbinghaus decay
                                          Archived ◄──────────────────────── Archived / Revoked
```

Key invariant: **only `Active` and `Provisional` notes are injectable** (and vectorized). This is the single source of truth `INJECTABLE_NOTE_STATUSES` in `@memberjunction/core-entities` (`packages/MJCoreEntities/src/custom/AIAgentNoteStatus.ts`), and every read-path filter derives from it — the in-memory vector service sync, embeddings refresh, fallback cache, SQL scoping queries, and TTL pruning. `Pending`, `Revoked`, and `Archived` notes are invisible to agents.

The scratchpad is **never** a memory mechanism: it is per-run, in-memory, and not shared across runs or conversations. If an agent "remembers" something in a new conversation, the only possible source is an injected note (or example).

---

## 2. Reading memory: injection at run start

`BaseAgent.InjectContextMemory()` runs at the start of every agent run and prepends a system message containing the agent's relevant notes (and optionally examples), via `AgentContextInjector` (`packages/AI/Agents/src/agent-context-injector.ts`).

### Retrieval strategies (`AIAgent.NoteInjectionStrategy`)

| Strategy | How it retrieves |
|---|---|
| `Relevant` (default) | Semantic search via the in-memory vector service (`AIEngine.FindSimilarAgentNotes`) against the current input, optionally followed by a reranker pass |
| `Recent` | SQL query ordered by creation date |
| `All` | SQL query, no relevance filter |

`MaxNotesToInject` (default 5) caps the count. With a reranker configured, `Relevant` first over-fetches (`maxNotes × retrievalMultiplier`) then reranks down.

### What the model actually sees

Notes render in two blocks — provisional first — with per-note recorded dates and a precedence policy:

```
<memory_policy>
Precedence (highest to lowest):
1) The current user message overrides all stored memory
2) Provisional notes (marked "(provisional)") are the newest signal — when a
   provisional note and an established note conflict on the same topic, follow
   the provisional one (recency wins)
3) User-specific notes override company-level
4) Company notes override global defaults
5) Within the same scope and status, prefer the most recent by recorded date (shown on each note)
...
</memory_policy>

📝 RECENT NOTES (1 provisional — newest signal)

[Preference, 2026-06-12] (provisional) User strongly prefers gauge charts for tracking KPIs.
  Scope: Agent + User specific

📝 AGENT NOTES (3)

[Preference, 2026-06-10] User prefers summaries presented as bullet points.
  Scope: Agent + User specific
```

Design notes:
- **Recency wins** is deliberate: a preference the user just stated must beat a months-old vetted one. The trust tradeoff is contained by the write-path guards (section 3).
- **Dates are absolute** (`YYYY-MM-DD`, not "2 days ago") so the injected message stays byte-stable between note-set changes; the system prompt's Current Date/Time block gives the model what it needs for recency arithmetic.

### Scoping: who sees which notes

Every note carries three nullable scope FKs — `AgentID`, `UserID`, `CompanyID` — plus optional multi-tenant dimensions (`PrimaryScopeEntityID`/`PrimaryScopeRecordID`, `SecondaryScopes` JSON). Retrieval matches an 8-level priority lattice (most-specific to global); a run for agent A + user U naturally pulls A+U-specific notes *and* all broader notes it inherits (user-wide, agent-wide, company-wide, global).

For the full multi-tenant scoping model — custom dimensions, inheritance modes, validation, and how scope context flows from `ExecuteAgentParams` to `AIAgentRun` to new notes — see **[Agent Memory Scoping](../packages/AI/Agents/docs/AGENT_MEMORY_SCOPING.md)**.

### Examples

`AIAgentExample` rows are the second memory kind: curated input/output demonstrations injected per `InjectExamples` / `MaxExamplesToInject` / `ExampleInjectionStrategy` (`Rated`/`Recent`/`Semantic`). Examples are always agent-specific and are managed by the Memory Manager (agents do not write examples in-flight — v1 decision).

---

## 3. Writing memory in-flight: `memoryWrites`

Agents capture durable facts **the moment they're stated** — without waiting for the scheduled Memory Manager — by including a `memoryWrites` array in their loop response (a sibling of `scratchpad` and `artifactToolCalls`, processed inline with zero turn cost):

```json
{
  "taskComplete": false,
  "memoryWrites": [
    { "note": "User prefers bar charts over pie charts.", "type": "Preference" }
  ],
  "nextStep": { ... }
}
```

### Gating: `AIAgent.AllowMemoryWrite`

**On by default** — consistent with the Memory Manager already extracting memories for every agent. Opt out (`AllowMemoryWrite = 0`) for restricted or experimental agents. The gate is enforced at three layers:

1. **Prompt visibility** — disabled agents never see the `memoryWrites` field or the Durable Memory docs in their system prompt (template-gated on `_MEMORY_WRITES_ENABLED`)
2. **Prompt-param injection** — `BaseAgent` only sets that template variable when the flag is on
3. **Execution** — if a disabled agent emits writes anyway (drift/injection), the turn loop records one observable skip step and tells the model nothing was saved

> Caveat: a gate-off agent may still *verbally* claim it saved something (the model being agreeable) — tracked in [#2833](https://github.com/MemberJunction/MJ/issues/2833).

### The guard pipeline — "dumb agent, smart framework"

The agent-facing surface is just "remember this." `MemoryWriteManager` (`packages/AI/Agents/src/MemoryWriteManager.ts`) enforces everything else, per write, in order:

| Guard | Behavior |
|---|---|
| **Type restriction** | Only descriptive `Preference`/`Context` types in-flight. Behavioral/`Constraint` memories require Memory Manager or human promotion — the prompt-injection defense: a planted "memory" can never be an instruction |
| **Within-run idempotency** | Exact repeats this run → `skipped-duplicate` |
| **Per-run cap** | Default 5 persisted writes per run → `skipped-cap`; remaining facts fall to MM extraction |
| **Scope clamp** | Writes land ≤ Agent + User (+ Company from context). A `scopeHint` can narrow but never broaden; in-flight writes never land global. Scope-widening is exclusively MM's judgment |
| **Near-dup guard** | Vector shortlist (0.85), then: a hit on a note written **earlier this run** → superseded in place (last write wins); a **pre-existing** note is reinforced (`deduped`) **only on exact normalized restatement** — any textual difference writes a new note so corrections are never silently absorbed (ADD-only-strict). Fails open if the vector service is down |
| **Provenance + TTL** | `Status='Provisional'`, `AuthorType='Agent'`, source run/conversation stamped, `ExpiresAt = now + 7 days` (self-cleaning safety net) |

Every executed write is recorded as a `Tool` run step (`Memory Write`) with full disposition output, and outcomes are reported back to the agent in an expiring conversation message on the next turn — which is why the prompt instructs agents **not to claim a memory was saved until they see its result message**.

Writes execute **sequentially** by design: each save embeds the note and syncs the in-memory vector store that the next write's dedupe check reads.

### `AuthorType`: note provenance

Each note records the *type* of author that created it (not a user reference): `Agent` (written in-flight), `MemoryManager` (extracted/consolidated by the scheduled pipeline), or `User` (manually created). The hardening pass selects on `AuthorType='Agent'`.

---

## 4. The Memory Manager: the asynchronous reconciler

`MemoryManagerAgent` (`packages/AI/Agents/src/memory-manager-agent.ts`) runs on a schedule (~15 min) and owns everything agents are deliberately too "dumb" to decide:

1. **Extraction** — mines rated conversations and high-value agent runs for new notes/examples (confidence-thresholded, LLM-deduped)
2. **Hardening pass** — runs **unconditionally every cycle**, first: each `Provisional` agent-authored note is LLM-deduped against hardened notes (true duplicates → `Archived` with `ConsolidatedIntoNoteID` lineage, target reinforced); survivors are promoted to `Active` with `ExpiresAt=NULL`, handing lifetime to the decay machinery. Because processing is sequential and each save syncs the vector cache, paraphrase duplicates *within one batch* consolidate correctly
3. **Maintenance phases** (gated by the consolidation trigger — typically daily): importance scoring (7-signal composite), consolidation (clustering at 0.60 similarity, LLM synthesis, provenance via `DerivedFromNoteIDs`), contradiction detection/resolution, stale-reference pruning, Ebbinghaus decay archival
4. **Protection tiers** — `Immutable` / `Protected` / `Standard` / `Ephemeral` modulate what consolidation and decay may touch; high-uniqueness notes auto-promote to `Protected`

Timing nuance worth knowing: hardening runs every cycle but contradiction resolution waits for the consolidation trigger — so **contradictory `Active` notes can briefly coexist**. The injected dates + recency policy (section 2) are the read-time mitigation; MM resolves the pair at the next maintenance cycle.

For the full consolidation design (threshold rationale, decay curves, contradiction taxonomy), see [`specs/001-memory-consolidation/`](../specs/001-memory-consolidation/spec.md).

---

## 5. Configuration reference

| Field | Entity | Default | Effect |
|---|---|---|---|
| `InjectNotes` | AIAgent | `1` | Inject notes at run start |
| `MaxNotesToInject` | AIAgent | `5` | Cap injected notes |
| `NoteInjectionStrategy` | AIAgent | `Relevant` | `All` / `Recent` / `Relevant` |
| `InjectExamples` | AIAgent | `0` | Inject curated examples |
| `MaxExamplesToInject` | AIAgent | `3` | Cap injected examples |
| `ExampleInjectionStrategy` | AIAgent | `Semantic` | `Rated` / `Recent` / `Semantic` |
| `AllowMemoryWrite` | AIAgent | `1` | In-flight `memoryWrites` capability (opt out per agent) |
| `Status` | AIAgentNote | `Active` | Lifecycle: `Pending` / `Active` / `Provisional` / `Revoked` / `Archived` |
| `AuthorType` | AIAgentNote | `MemoryManager` | Provenance: `Agent` / `MemoryManager` / `User` |
| `Type` | AIAgentNote | `Preference` | `Preference` / `Constraint` / `Context` / `Example` / `Issue` (in-flight writes restricted to first + third) |
| `ProtectionTier` | AIAgentNote | `Standard` | `Immutable` / `Protected` / `Standard` / `Ephemeral` |
| `ExpiresAt` | AIAgentNote | `NULL` (7d for in-flight) | TTL; cleared on hardening |

`MemoryWriteManager` constructor config (code-level): `maxWritesPerRun` (5), `nearDupSimilarity` (0.85), `defaultTTLDays` (7), `maxNoteLength` (2000).

---

## 6. Operational guidance & troubleshooting

**"Why does my agent remember X?"** — Find the note:
```sql
SELECT Note, Status, AuthorType, AgentID, UserID, __mj_CreatedAt
FROM __mj.vwAIAgentNotes
WHERE Note LIKE '%<topic>%' ORDER BY __mj_CreatedAt DESC;
```
Then confirm injection by inspecting the run's persisted payload (`AIPromptRun.Messages` contains the rendered `RECENT NOTES` / `AGENT NOTES` blocks verbatim).

**"Why doesn't it remember?"** — In order: is the note `Active`/`Provisional`? In scope for the (agent, user, company) triplet? Within `MaxNotesToInject` under the strategy? Was the writing run's `Memory Write` step disposition actually `written` (check `AIAgentRunStep.OutputData`)?

**Vector-store staleness**: the in-memory vector service mirrors injectable notes via the entity-server save path. Direct SQL writes to `AIAgentNote` bypass that sync — after manual SQL changes, restart MJAPI (the store rebuilds at boot from persisted embeddings).

**Observability**: every in-flight write, the hardening pass, and each maintenance phase emit `AIAgentRunStep` rows with structured input/output; the smoke harness (`packages/AI/Agents/scripts/memory-write-smoke.ts`) exercises the full pipeline end-to-end against a live database.

---

## 7. Pointers

| Topic | Where |
|---|---|
| In-flight writes design & decisions | [`plans/agent-inflight-memory-writes.md`](../plans/agent-inflight-memory-writes.md) |
| Multi-tenant memory scoping | [`packages/AI/Agents/docs/AGENT_MEMORY_SCOPING.md`](../packages/AI/Agents/docs/AGENT_MEMORY_SCOPING.md) |
| Consolidation/decay/contradiction spec | [`specs/001-memory-consolidation/spec.md`](../specs/001-memory-consolidation/spec.md) |
| Write path implementation | `packages/AI/Agents/src/MemoryWriteManager.ts` |
| Injection implementation | `packages/AI/Agents/src/agent-context-injector.ts` |
| Memory Manager implementation | `packages/AI/Agents/src/memory-manager-agent.ts` |
| E2E smoke harness | `packages/AI/Agents/scripts/memory-write-smoke.ts` |
| Package overview | [`packages/AI/Agents/README.md`](../packages/AI/Agents/readme.md) |
