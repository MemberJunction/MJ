# Agent Conversation Compaction & Recursive Context Access

**Status:** Design / implementation plan (pre-build)
**Date:** 2026-06-01
**Owner:** Amith Nagarajan
**Scope:** `packages/AI/Agents`, `packages/AI/CorePlus`, `packages/MJCoreEntities` (ConversationEngine + entities), `packages/MJServer` (resolvers), one migration in `migrations/v5/`.

---

## 0. TL;DR

MemberJunction already has **in-turn** context compaction inside `BaseAgent` (the
`pruneAndCompactExpiredMessages` machinery, `AgentChatMessageMetadata` with
`expirationMode`/`compactMode`/`originalContent`/`canExpand`, message-expansion via the
`messageIndex` Retry path, media stripping, and a 5-tier emergency context-recovery
escalation). It also already has per-agent config for this:
`AIAgent.ContextCompressionMessageThreshold`, `.ContextCompressionPromptID`,
`.ContextCompressionMessageRetentionCount`.

This plan adds the **missing durable, cross-turn layer**: a persistent conversation
**summary baseline** that rides on the existing, currently-unused
`ConversationDetail.SummaryOfEarlierConversation` field, plus **RLM-style addressable
retrieval tooling** so agents can page back into exact pre-summary history on demand.

We are **not** building a greenfield system. We are promoting the in-memory model to a
durable, sequence-addressable, multi-agent-aware layer and wiring it into the existing
config surface.

Design influences, triangulated:
- **MJ's existing in-turn compaction** (the foundation we extend).
- **Industry convergence** (Anthropic compaction API + context-editing + memory tool,
  OpenAI Responses compaction, MemGPT/Letta recursive summary + tiered paging, LangGraph
  `RunningSummary`): trigger on tokens before the window fills, keep user messages
  high-fidelity, recursive summaries (prior summary + delta), structured > prose, pair
  compaction with just-in-time retrieval.
- **Recursive Language Models** (Zhang, Kraska, Khattab — MIT CSAIL, arXiv:2512.24601v3):
  keeping full content in an external, addressable environment and letting the model
  *programmatically examine/slice/recursively sub-summarize* it beats lossy compaction on
  tasks that need dense recall. Our summary is the "constant-size metadata/handle"; the
  sequence-addressable history is the "external environment"; the retrieval +
  `summarizeRange` tools are the REPL/sub-call.

---

## 1. Core mechanism

### 1.1 The baseline rides on an existing field

`ConversationDetail.SummaryOfEarlierConversation` already exists (and is documented as
"summary of the conversation leading up to this record, for long-running performance").
We populate it. **A summary stored on the row at sequence N covers everything with
`Sequence < N`** (i.e., everything *below* it in the thread). No new detail type, no
`Compaction` table.

### 1.2 Context-window assembly (the load algorithm)

```
GetAgentContextWindow(conversationId):
    details = ConversationEngine cache for this conversation (in-memory; one query on cold miss)
    boundary = the detail with the HIGHEST Sequence whose SummaryOfEarlierConversation IS NOT NULL
    if boundary exists:
        return [ asSummaryMessage(boundary.SummaryOfEarlierConversation) ]
             + details where Sequence >= boundary.Sequence        # boundary row + tail, raw
    else:
        return all details                                        # no compaction yet
    # system prompt is added by the existing prompt-assembly path, on top of this.
```

The summary on the boundary row covers `< boundary.Sequence`; the boundary row itself and
everything after are included raw. No gap, no overlap.

### 1.3 Recursive (compounding) summarization

When we compact again later at sequence M, the summary prompt's **input is the previous
summary + only the raw delta (`boundary..M-1`)** — never a re-read of the full raw
history. Output is written to the row at M. The older summary at the previous boundary
simply stops being selected (it is not the most recent non-null summary). This bounds
compaction cost as conversations grow indefinitely (MemGPT/LangGraph `RunningSummary`
pattern).

### 1.4 Relationship to the in-turn compaction

The two tiers stack cleanly:
- **Tier A — cross-turn (new):** `GetAgentContextWindow` hands BaseAgent a pre-windowed
  message array (summary + tail) instead of the full raw history.
- **Tier B — in-turn (existing, unchanged):** `pruneAndCompactExpiredMessages` and the
  context-recovery escalation continue to manage pressure *within* a single run, now
  starting from a smaller set.

Tier A feeds Tier B. No changes to Tier B in this plan.

---

## 2. Where the work lives (architecture)

### 2.1 `ExecuteAgentParams` gains `conversationId` (preferred input)

Today BaseAgent receives `conversationMessages` assembled by the caller
(`RunAIAgentResolver` parses them from client JSON). We add an optional, **preferred**
`conversationId` param.

- **We do NOT always have a conversation id.** Programmatic runs, internal sub-agent
  invocations, and tests may have none. All compaction/windowing features are **gated on
  the presence of `conversationId`**.
- **Precedence when `conversationId` is present:** the assembly layer
  (`ConversationEngine.GetAgentContextWindow`) is authoritative and builds the windowed
  message array from cache; an explicitly passed `conversationMessages` is treated as an
  override/escape hatch (used by callers that deliberately supply their own context).
- **When `conversationId` is absent:** behave exactly as today — caller supplies
  `conversationMessages`, no persistent summary, Tier B only.

BaseAgent stays transport/DB-agnostic: it never queries the DB. The resolver (or any
server-side caller) resolves `conversationId` → windowed messages via `ConversationEngine`
before calling `Execute`.

### 2.2 Reuse `ConversationEngine` — do not add an engine

`ConversationEngine` already has the cache we want:
`_detailCache: Map<convId, ConversationDetailCache>`, lazily populated by a single
`GetConversationComplete` query and served from memory thereafter. It is **per-conversation
and on-demand** — it never bulk-loads all conversations, so the "engines are bad for big
tables" concern does not apply.

New method:
```typescript
// ConversationEngine
public async GetAgentContextWindow(
    conversationId: string,
    contextUser: UserInfo
): Promise<AgentChatMessage[]>   // summary-as-message + tail, or all details
```
First touch of a conversation pays one query (~tens of ms, once); every subsequent run is
a warm in-memory slice. No per-run DB query.

### 2.3 Cross-instance cache note (future)

`_detailCache` is per-process. In multi-instance MJAPI, run N+1 may hit a cold instance
(one query to warm — acceptable for v1). **Future option:** elevate this cache to the
Redis-backed `CacheManager` for cross-instance sharing. Flagged, not built.

---

## 3. Data model changes

### 3.1 `ConversationDetail`

| Column | Type | Notes |
|---|---|---|
| `Sequence` | `INT NOT NULL` | Stable, monotonic-per-conversation ordinal. The **symbolic handle** for retrieval tools and summary markers. Must be persisted (an in-memory index would renumber on cache reload and break markers). |
| `SummaryPromptRunID` | `UNIQUEIDENTIFIER NULL` | FK → `MJ: AI Prompt Runs`. Links a populated `SummaryOfEarlierConversation` to the prompt run that produced it (model/tokens/cost/version audit for free). |

- **Reuse `SummaryOfEarlierConversation`** (exists) for the summary text. No new field.
- **No `SummaryCoversThroughSequence`** — coverage is always "`< this row's Sequence`",
  so it is redundant (`= Sequence - 1`).
- **Edits:** reuse the existing `OriginalMessageChanged` boolean to flag a row edited after
  it was folded into a summary; Record Changes already captures the diff. No downstream
  regeneration required (see §6).

#### Sequence assignment (insert-time)

Concurrency risk is low (two simultaneous inserts in the *same* conversation is rare).
**Recommended: a DB trigger** on `ConversationDetail` that assigns
`Sequence = ISNULL(MAX(Sequence),0)+1` scoped to the row's `ConversationID`, because it
covers **all** insert paths uniformly (agent flow, metadata sync, manual). Use an
`UPDLOCK, HOLDLOCK` on the per-conversation max read to make the increment safe under the
rare concurrent case. *Alternative:* assign app-side in `ConversationEngine` when creating
a detail (it already holds the in-memory max). Trigger chosen as primary for uniform
coverage; either is acceptable per the low-risk assessment.

#### Backfill (REQUIRED in the migration)

Backfill existing rows:
```sql
WITH numbered AS (
    SELECT ID,
           ROW_NUMBER() OVER (PARTITION BY ConversationID
                              ORDER BY __mj_CreatedAt ASC, ID ASC) AS rn
    FROM ${flyway:defaultSchema}.ConversationDetail
)
UPDATE cd SET cd.Sequence = numbered.rn
FROM ${flyway:defaultSchema}.ConversationDetail cd
JOIN numbered ON numbered.ID = cd.ID;
```
(Backfill runs before the column is switched to `NOT NULL` / before the trigger is relied
upon. Order the DDL accordingly.)

### 3.2 Agent context-control metadata (designer knobs)

The headline knob: **the effective context-window budget**. Making it bigger/smaller is
how an agent designer dials how much raw long-context to include vs. how much to lean on
RLM-style tooling. Defined at **`AIAgentType` (defaults)**, overridable at **`AIAgent`
(per-agent / per-sub-agent)**.

**`AIAgent` already has** `ContextCompressionMessageThreshold`,
`ContextCompressionPromptID`, `ContextCompressionMessageRetentionCount`. **`AIAgentType`
has none.** So part of this work is:

1. **Add the existing trio to `AIAgentType`** as type-level defaults (same names).
2. **Add new token-based fields to BOTH `AIAgentType` and `AIAgent`:**

| Column (both entities) | Type | Meaning |
|---|---|---|
| `ContextWindowMaxTokens` | `INT NULL` | Effective working-context budget. `NULL` ⇒ use the selected model's `MaxInputTokens`. |
| `CompactionTriggerPercent` | `INT NULL` | % of effective budget at which cross-turn compaction fires. Default ~75. |
| `CompactionTargetPercent` | `INT NULL` | Target % of budget after compaction. Default ~30. |
| `ConversationSummaryPromptID` | `UNIQUEIDENTIFIER NULL` | FK → `MJ: AI Prompts`. The **cross-turn** summary prompt (distinct from the in-turn `ContextCompressionPromptID`). |

**Resolution order:** `AIAgent` value ?? `AIAgentType` value ?? system default.

**Model validation (per run, against the model about to run):**
- Resolve effective budget. If it exceeds the selected model's `MaxInputTokens`, **clamp to
  the smaller value** and **log a warning** to (a) the console and (b) the agent run log
  (e.g., a warning on the `AIAgentRun` / step). Never silently exceed the model.

### 3.3 `AIAgentRunStep` — record the compaction as a step

Cross-turn compaction is part of the agent run lifecycle and must be observable. Add a new
`StepType` value **`'Compaction'`** (current values: `Actions`, `Chat`, `Decision`,
`ForEach`, `Prompt`, `Sub-Agent`, `Tool`, `Validation`, `While`). The compaction step links
to the `AIPromptRun` of the summary prompt; that same `AIPromptRun.ID` is stored on
`ConversationDetail.SummaryPromptRunID`.

Lineage chain:
```
AIAgentRun → AIAgentRunStep (StepType='Compaction') → AIPromptRun (summary prompt)
                                                          ▲
                              ConversationDetail.SummaryPromptRunID ┘
```
The `summarizeRange` retrieval tool (§5.3) likewise records an `AIAgentRunStep` +
`AIPromptRun` for its sub-call.

### 3.4 Migration checklist (single file, `migrations/v5/`)

- `ALTER TABLE ConversationDetail ADD Sequence INT NULL, SummaryPromptRunID UNIQUEIDENTIFIER NULL` (single consolidated ALTER).
- Backfill `Sequence` (§3.1).
- Set `Sequence NOT NULL` after backfill.
- Create the Sequence-assignment trigger.
- `ALTER TABLE AIAgentType ADD` the trio + new token fields + `ConversationSummaryPromptID`.
- `ALTER TABLE AIAgent ADD` the new token fields + `ConversationSummaryPromptID`.
- Extend the `AIAgentRunStep.StepType` check constraint to include `'Compaction'`.
- `sp_addextendedproperty` for every new column (CodeGen descriptions).
- **Do NOT** add `__mj_CreatedAt/__mj_UpdatedAt` or FK indexes (CodeGen handles those).
- Hand off to CodeGen for entity classes / views / SPs. Write dependent TypeScript only
  **after** CodeGen generates the typed properties.

---

## 4. Cross-turn compaction (a prompt, not an agent)

- A single versioned MJ prompt (`ConversationSummaryPromptID`). One LLM call: **input =
  prior summary + raw delta**, **output = new summary**. No tools, no loop. Invoke via
  `AIPromptRunner.ExecutePrompt` so an `AIPromptRun` is recorded automatically.
- **Trigger:** model-relative — fire when estimated tokens cross `CompactionTriggerPercent`
  of the effective budget (resolved + validated per §3.2), reserving output headroom so the
  triggering turn never truncates. Use the existing `getModelContextLimit()` /
  `estimateTokens()` helpers.
- **When:** prefer **post-turn** (after the agent response is delivered) to hide latency;
  run **pre-turn** only if already over budget before assembling the prompt.
- **Recorded** as an `AIAgentRunStep` (StepType `'Compaction'`) on the current run.

### 4.1 Summary content: a lean **map**, plus a short prose gist

Per the RLM lesson, the summary is primarily an **addressable map**, not an exhaustive
recap:
- A brief **200–400 token prose gist** of the conversation (orientation only).
- **Sequence-numbered timeline markers** for decisions / key events / artifacts / actions
  (`decision X — seq 42`, `artifact Y introduced — seq 64`).
- **User messages kept high-fidelity** (verbatim or near-verbatim) to prevent task drift.
- **Per-agent ownership / handoffs** preserved (multi-agent, §7).
- Open tasks / unresolved questions.
- An explicit instruction block telling the consuming agent: **the markers + retrieval
  tools are the source of truth; the prose gist is lossy — do NOT rely on it for exact
  wording, IDs, or decisions; page in via tools instead.**
- Never invent; never treat in-progress/error turns as completed outcomes.

---

## 5. RLM-style retrieval tooling (first-class, not a fast-follow)

These are the "external environment + REPL + recursion" half — elevated, per the RLM
paper, because biasing the agent toward paging in exact slices beats trusting a lossy
summary. All tools default to the current conversation, are served from the
`ConversationEngine` cache (no per-call DB hit when warm), and are logged.

### 5.1 `getMessageBySequence(seq)` / `getMessagesByRange(start, end)`
Exact paging by symbolic handle. Range enforces a sane max to avoid context blow-up.

### 5.2 `searchConversation(query | regex, filters?)`
Grep/keyword/regex over pre-summary history, filterable by role / agent / sequence range.
Returns `{sequence, role, agent, snippet, matchType}` so the agent can then page the hit.

### 5.3 `summarizeRange(start, end, lens)` — the recursive sub-call
Spins a **sub-LM over a slice** of history and returns a focused summary through a
task-specific `lens`. This is the RLM recursion: the agent is not limited to the one
baseline summary's framing — it can re-summarize any window however the current task needs.
- **Model:** a small/cheap model (e.g. Gemini 3.1 Flash Lite tier), mirroring the paper's
  "cheap sub-call model, strong root model" split.
- **Recorded** as its own `AIAgentRunStep` + `AIPromptRun`.

(Existing artifact tools and action-result retrieval remain the way to inspect artifact
contents and historical action results; the summary references them by id, never inlines
them.)

---

## 6. Edits, deletion, staleness

- **Deletion:** current UX only allows deleting a message *and everything after it* — which
  can never invalidate an earlier summary's coverage. Non-issue.
- **Edits (if/when allowed):** flag the row via the existing `OriginalMessageChanged`
  boolean; the diff is already captured by **Record Changes** (so the UI can surface
  "edited after summarization" cheaply). We **store the edit and the flag** rather than
  forcing downstream regeneration — the summary is explicitly lossy and the agent is
  instructed to page in exact rows anyway. Optional future: lazily regenerate the affected
  summary on next run.
- **Locking (considered, not v1):** hard-locking summarized rows was considered; given the
  deletion-only UX it is unnecessary for v1. Noted for future.

---

## 7. Multi-agent

- v1: **one shared baseline** on the shared thread with **explicit per-agent sections** in
  the summary map (it is a shared conversation; all participants legitimately see the shared
  summary). Preserve `AgentID` and handoff/mention events in the markers.
- Sub-agent runs keep their own isolated contexts as they do today (context isolation =
  "compaction by architecture").
- Agent-specific overlay summaries: future, not v1.

---

## 8. Telemetry

- Compaction cost/tokens/model: free via the summary `AIPromptRun` + the `'Compaction'`
  run step.
- Counters: tokens-before/after compaction, effective-budget clamp warnings,
  retrieval-tool calls by type, `summarizeRange` sub-call count.
- Surface the per-run effective budget + which model bounded it.

---

## 9. Phasing

1. **Migration** — `Sequence` (+ backfill + trigger), `SummaryPromptRunID`, agent
   context-control fields on `AIAgentType`/`AIAgent`, `StepType='Compaction'`. CodeGen.
2. **Assembly layer** — `ConversationEngine.GetAgentContextWindow`; add `conversationId`
   to `ExecuteAgentParams`; route `RunAIAgentResolver` through it. Behavior-neutral until
   summaries exist.
3. **Cross-turn compaction** — summary prompt + post-turn trigger + model validation +
   `'Compaction'` run step + `SummaryPromptRunID` write.
4. **Retrieval tools** — `getMessageBySequence` / `getMessagesByRange` /
   `searchConversation`.
5. **Recursive tool** — `summarizeRange` (cheap sub-call model, own run step).
6. **Edit handling** — `OriginalMessageChanged` flagging + Record Changes surfacing.

Each phase: build the affected package (`npm run build` in the package dir), run/​update
that package's Vitest suite, report results.

---

## 10. Open items to confirm during build

- Exact default values for `CompactionTriggerPercent` (~75) / `CompactionTargetPercent`
  (~30) and whether they belong as system constants or config.
- Whether the in-turn `ContextCompressionPromptID` and the new cross-turn
  `ConversationSummaryPromptID` should ship with distinct seeded prompts (recommended) or
  share one.
- Trigger-assignment final call (DB trigger vs. app-layer) once the dominant
  ConversationDetail insert paths are confirmed.
- Cross-instance cache: keep per-process for v1; revisit `CacheManager`/Redis if warm-miss
  latency matters in production.

---

## 11. What we explicitly are NOT doing

- No new `DetailType`/`ConversationDetailType` field.
- No separate `ConversationCompaction` metadata table (the `AIPromptRun` +
  `SummaryPromptRunID` cover audit).
- No deletion of original history (ever).
- No change to the existing in-turn compaction (Tier B) behavior.
- No bulk-load engine over `ConversationDetail` (reuse `ConversationEngine`'s lazy
  per-conversation cache).
