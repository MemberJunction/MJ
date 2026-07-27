# Branchable, Replayable, and Shareable AI Agent Runs

**Status:** Proposed
**Date:** 2026-07-27
**Owner:** Arie Glazier
**Scope:** `packages/MJCoreEntities` (generated entities via CodeGen), `packages/AI/CorePlus` (types), `packages/AI/Agents` (replay engine), `packages/MJServer` (resolver args + share resolution), `packages/Angular/Explorer/core-entity-forms` (run form extensions), one migration in `migrations/v5/` (plus the `migrations-pg/v5/` sibling).

---

## 0. Attribution

The branch/replay/share model in this plan is **inspired by [pi.dev](https://github.com/earendil-works/pi)** (`earendil-works/pi`), Mario Zechner's MIT-licensed Pi coding agent. Pi stores every agent session as an append-only tree of entries (each entry carries `id` and `parentId`), which makes rewinding to any prior point, branching from it, and exporting a rendered replay nearly free. We are **not** vendoring, forking, or depending on Pi. We are porting a small number of *concepts* (run lineage as a tree, rewind-and-branch, the rendered replay artifact) onto MemberJunction's existing structured run persistence, and crediting the source in this doc.

> "Pi" is the original project's brand. We do not use that name in any package, identifier, or UI. We credit it as the conceptual source in this document, which is the canonical attribution record.

Pi components referenced below and the MJ analog we build:

| Pi component | What it does | Our action |
|---|---|---|
| `id`/`parentId` entry tree + active leaf pointer (`session-manager.ts`) | Append-only tree; `branch()` just moves a pointer, so rewind is O(1) | **Adapt the concept**: branch lineage becomes two columns on `AIAgentRun` (Section 4); runs stay immutable rows |
| `/tree` selection (rewind, edit, resubmit) | In-place branching from any prior entry | **Adapt**: a branch-from-step composer on the existing run form (Section 7) |
| `/fork` and `/clone` (new session file, `parentSession` header) | Lineage across session files | **Already have**: MJ runs are already separate records, so fork collapses into branch; clone is branching at the final step |
| Branch summaries (`branchWithSummary`) | LLM summary of the abandoned path, preserved as a tree node | **Out of scope / rejected**: MJ branches are full-fidelity sibling runs; nothing is abandoned or lossy, so there is nothing to summarize |
| `model_change` / `thinking_level_change` entries | Config changes are first-class tree nodes | **Already have**: `AIAgentRun.OverrideModelID`/`EffortLevel` plus per-`AIPromptRun` model params record this today |
| `/export` HTML (`core/export-html/`: embeds the full tree, client-side branch navigation, inlined theme vars) | Self-contained portable replay artifact | **Adapt as reference** for the phase 6 export artifact, with MJ access control and scrubbing layered on (Section 8.4) |
| `/share` (secret gist + viewer URL) | Zero-auth sharing | **Reject the transport**: secret-gist obscurity has no access control, no expiry, no revocation, no scrubbing; MJ uses `MJ: Public Links` + scoped RLS instead (Section 8.2) |

---

## 1. TL;DR

MemberJunction already persists what Pi has to reconstruct at render time. Every agent run is an `AIAgentRun` row plus an ordered set of `AIAgentRunStep` rows, and each step carries `PayloadAtStart`/`PayloadAtEnd` JSON snapshots and a `TargetLogID` link to the full execution record of what it did: `AIPromptRun` (fully rendered `Messages`, model, `Temperature`, `Seed`, cost) for prompt steps, `ActionExecutionLog` (exact `Params` and `Message`) for action steps, and a child `AIAgentRun` for sub-agent steps. Pi can only re-render recorded text; MJ can **re-execute from any step with one variable changed and diff the outcomes**.

This plan adds a deliberately small delta:

- **Two lineage columns** on `AIAgentRun` (`BranchedFromRunID`, `BranchedFromStepID`) plus one `Action.ReplayPolicy` column and a widened `PublicLink.ResourceType` CHECK. One migration.
- **A branch mode on the existing run machinery**: branching reuses the same "spawn a new run seeded from a prior run" path that HITL resume (`lastRunId` + `autoPopulateLastRunPayload`) already uses, except it seeds from a mid-run step snapshot instead of `FinalPayload`.
- **A compare view** built on the existing `DeepDiffer` engine and `mj-deep-diff` component (no new diff engine).
- **A Branches tab and branch composer** extending the existing `MJAIAgentRunFormComponentExtended` run form (no parallel UI).
- **Sharing** built on the existing `ResourcePermission` domain, the shipped-but-unwired `PublicLink` table, and the Magic Link scoped-RLS pattern, with projection-time scrubbing defined here because none exists today.

We are **not** building a greenfield system, a lineage table, a new execution engine, or a third execution-tree UI component. Section 3 inventories what exists; every net-new surface is justified inline where it appears.

Design influences, triangulated:

- **Pi's tree mechanics** (Section 2): what makes rewind-and-branch cheap, and which of its semantics survive translation.
- **MJ's own prompt-level replay precedent**: `AIPromptRun.RerunFromPromptRunID` + `AIPromptParams.rerunFromPromptRunID` + `systemPromptOverride` (written at `packages/AI/Prompts/src/AIPromptRunner.ts:2894`), surfaced in the AI Test Harness `executeRerun()` UI. This plan lifts that exact pattern from prompt runs to agent runs.
- **MJ's HITL resume path** (`MJAIAgentRequestEntityServer.resumeAgent`): the proof that "continue a prior run by spawning a new linked run" is already the house idiom; branching is the same idiom with a different seed point.

---

## 2. Pi analysis (the design reference)

### 2.1 Tree mechanics: why rewind-and-branch is cheap in Pi

Pi sessions are JSONL files in `~/.pi/agent/sessions/`. The first line is a `SessionHeader` (session id, cwd, and an optional `parentSession` path recording fork/clone provenance). Every subsequent entry extends a common base: `{ type, id (8-char hex), parentId (null for the root), timestamp }`. Entry types: `message` (wrapping the `AgentMessage` union of user/assistant/toolResult/bashExecution/custom messages), `model_change`, `thinking_level_change`, `compaction`, `branch_summary`, `custom`, `custom_message`, `label`, and `session_info`.

Three properties make branching free:

1. **Entries are append-only and immutable.** `SessionManager._appendEntry` pushes the entry, updates an in-memory index, and appends one line to the file. Nothing is ever rewritten.
2. **Position is a single leaf pointer.** `branch(branchFromId)` is literally `this.leafId = branchFromId`. The next appended entry becomes a child of that entry, creating a new path. No copying.
3. **The tree is derived, not stored.** `getTree()` rebuilds parent/child structure from the flat `id`/`parentId` pairs; `buildContextEntries()` walks leaf to root to produce the active context, honoring `compaction` entries along the path (a compaction is itself a tree node, and newer compactions carry a `retainedTail` making them self-contained checkpoints, so branches on either side of a compaction still resolve).

Two more mechanics matter for us. `branchWithSummary(branchFromId, summary)` moves the leaf **and** appends a `branch_summary` entry capturing an LLM summary of the abandoned path, because Pi's context window loses that branch when the pointer moves. And `createBranchedSession(leafId)` extracts one root-to-leaf path into a new file with re-chained `parentId`s and a `parentSession` back-reference.

### 2.2 `/tree` vs `/fork` vs `/clone`, and the MJ mapping

| | `/tree` | `/fork` | `/clone` |
|---|---|---|---|
| Output | Same session file | New session file | New session file |
| Selection | Any entry in the full tree | A prior user message | The current active branch |
| Semantics | Move leaf; selecting a user message also puts its text in the editor for edit-and-resubmit | Start a fresh session from an earlier prompt | Duplicate current work before continuing |
| Branch summary | Optional | None | None |

The MJ mapping collapses all three. MJ runs are already separate database rows, not paths inside one file, so there is no in-place/new-file distinction to preserve: **every branch is a new `AIAgentRun` row pointing at its source run and step**. `/tree`'s edit-and-resubmit gesture maps to the branch composer prefilled with the branch-point step's recorded state (Section 7.1). `/fork` is the same operation selected from a different UI angle. `/clone` is the degenerate case of branching at the final step, which the existing `LastRunID` continuation chain already covers.

### 2.3 What Pi cannot do that MJ can, and what MJ consciously replicates or rejects

Pi's model cannot do:

- **Deterministic re-execution.** A Pi "replay" is a render of recorded text. It cannot re-run from a node with the model, prompt, or state changed and produce a comparable second outcome.
- **Structured payload diffing.** Pi state is chat messages; there is no typed payload to diff. MJ's per-step `PayloadAtStart`/`PayloadAtEnd` snapshots make step-granular structural diffs a query away.
- **Cost and step-path comparison.** Pi records per-message `Usage` but has no compare surface. MJ has denormalized token/cost columns per run and per prompt run.
- **Access control on shares.** `/share` runs `gh gist create --public=false` and wraps the gist id in a viewer URL. Anyone with the URL sees everything, forever, unscrubbed.

What Pi does that MJ must consciously replicate or reject:

- **Branch summaries: rejected.** They exist because Pi's context window loses the abandoned branch. MJ branches are complete sibling runs; nothing is lost, and a replay viewer can open either branch at full fidelity.
- **Model-change-as-tree-node: already covered.** MJ records the effective model on `AIAgentRun.OverrideModelID` and on every `AIPromptRun`; a branch's config delta is first-class data, not an inferred event.
- **Single-file portability: adapted.** Pi's `/export` HTML is the reference for what a good replay artifact contains (the full tree, client-side branch navigation, inlined styling, per-entry detail). MJ's version is generated server-side so RLS and scrubbing apply (Section 8.4), and is deferred to the final phase.

---

## 3. What MemberJunction already has (inventory)

This section is the reuse ledger. Everything below exists on `next` today and was verified against source; the design in Sections 4 through 9 extends these instead of adding parallels.

### 3.1 Run persistence

`MJAIAgentRunEntity` (`MJ: AI Agent Runs`, `packages/MJCoreEntities/src/generated/entity_subclasses.ts:40971`) already carries:

- **`ParentRunID`** (self-FK): "Reference to the parent agent run if this is a sub-agent execution. NULL for root-level agent runs. Enables hierarchical execution tracking." This is **sub-agent nesting**, stamped from `params.parentRun?.ID` in `initializeAgentRun` (`packages/AI/Agents/src/base-agent.ts:7885`). Per Amith's review note we verified this first: it exists, it means sub-agent parentage, and this plan does **not** overload it.
- **`LastRunID`** (self-FK): "Links to the previous run in a chain. Different from ParentRunID which is for sub-agent hierarchy." This is the **continuation chain** used by HITL resume. Nothing enforces uniqueness on it, so the schema already tolerates a branching DAG, but its semantics (and `autoPopulateLastRunPayload`, which restores `FinalPayload`) are "continue after the end", not "re-execute from the middle". This plan does not overload it either; Section 11 item 1 records the tradeoff for review.
- **`StartingPayload`** ("Can be populated from the FinalPayload of the LastRun"), **`FinalPayload`**, **`Result`** (same JSON as `FinalPayload`, written at `base-agent.ts:13183`), **`Data`** (the template/prompt data passed to the agent and all sub-agents: the input fingerprint for diffing).
- **`ConfigurationID`, `OverrideModelID`, `OverrideVendorID`, `EffortLevel`, `PlanMode`, `Verbose`**: the determinism controls a branch either holds constant or deliberately changes.
- **Token/cost columns**: `TotalTokensUsed`, `TotalPromptTokensUsed`, `TotalCompletionTokensUsed`, `TotalCacheReadTokensUsed`, `TotalCacheWriteTokensUsed`, `TotalCost`, plus descendant-inclusive `*Rollup` columns, plus the `CalculateAIAgentRunCost` templated query used by `AIAgentRunCostService`.
- **`RunName` and `Comments`**: present on both run and step, currently unused by the engine. `RunName` becomes the branch label for free (we considered and rejected a new `BranchName` column).
- **`AgentState`**: documented for pause/resume but **never written anywhere in the repo**; dead schema. This plan does not adopt it (Section 12).
- Computed **`RootParentRunID`** and **`RootLastRunID`** columns in `vwAIAgentRuns`: existing precedent for a family grouping key.

`MJAIAgentRunStepEntity` (`MJ: AI Agent Runs Steps` sibling, class at `entity_subclasses.ts:40437`) already carries: `StepNumber`, `StepType` (twelve values: `Actions`, `Chat`, `Compaction`, `Decision`, `ForEach`, `Plan`, `Prompt`, `Skill`, `Sub-Agent`, `Tool`, `Validation`, `While`), `StepName`, `TargetID` (the definition executed), **`TargetLogID`** (polymorphic link: `AIPromptRun.ID` for prompt steps, `ActionExecutionLog.ID` for action steps, child `AIAgentRun.ID` for sub-agent steps; typed loading via `MJAIAgentRunStepEntityExtended.LoadRelatedData`), `InputData`/`OutputData` (JSON with an engine context envelope), **`PayloadAtStart`/`PayloadAtEnd`** (JSON snapshots written by the `protected` and explicitly overridable `serializePayloadAtStart`/`serializePayloadAtEnd` at `base-agent.ts:5107`/`5119`), and `ParentID` (self-FK for loop-container nesting).

### 3.2 Execution engine and the existing "new run from old run" idiom

- `BaseAgent.Execute` (`base-agent.ts:1339`) leads to `initializeAgentRun` (`:7835`), the single place run rows are created and stamped. **`autoPopulateLastRunPayload`** (`:7838`) is the only existing restore-from-run mechanism: `JSON.parse(lastRun.FinalPayload)` used as the payload if and only if the caller did not pass one. Branching generalizes this precedence rule.
- **HITL is already "resume = new run".** `executeChatStep` creates an `MJ: AI Agent Requests` row (`OriginatingAgentRunID`, `OriginatingAgentRunStepID`, `ResponseSchema`); `MJAIAgentRequestEntityServer.Save` detects the response transition and `resumeAgent` (`packages/AI/Agents/src/MJAIAgentRequestEntityServer.ts:61`) spawns a **new** run with `lastRunId` + `autoPopulateLastRunPayload: true`, then stamps `ResumingAgentRunID`. `Status='Paused'` is never written; suspension is a finalized `AwaitingFeedback` run. Branching does not conflict with any of this (Section 5.6).
- `validateRunChain` (`base-agent.ts:3234`) walks `LastRunID` ancestry with a cycle guard; the branch validation in Section 5.2 mirrors it.
- `AgentRunWatchdog` (`packages/AI/Agents/src/agent-run-watchdog.ts`) force-fails stale `Running` rows; branched runs are ordinary `Running` runs, so no watchdog changes are needed.
- **The replay precedent**: `AIPromptRun.RerunFromPromptRunID` (+ computed `RootRerunFromPromptRunID`), driven by `AIPromptParams.rerunFromPromptRunID` and `systemPromptOverride` (`packages/AI/CorePlus/src/prompt.types.ts:452`), written at `AIPromptRunner.ts:2894`, with the AI Test Harness `executeRerun()` as the shipped UX. An exhaustive search confirms **no agent-run-level rerun/replay machinery exists**; this plan is that missing level, named and shaped after the prompt-level precedent.

### 3.3 Diffing machinery

- **`DeepDiffer`** (with `DeepDiffResult`, `DiffChange`) lives in `@memberjunction/global`: framework-agnostic, browser-safe. The Angular wrapper is **`mj-deep-diff`** / `mj-deep-diff-dialog` (`packages/Angular/Generic/deep-diff/`), already used by the step detail panel to diff `PayloadAtStart` vs `PayloadAtEnd` within one step. No run-vs-run comparison UI exists anywhere; Section 6 builds it from these parts.
- **`PayloadChangeAnalyzer`** (`packages/AI/Agents/src/PayloadChangeAnalyzer.ts`) already classifies payload changes (content reduction, suspicious truncations) and its summary is stored in step `OutputData.payloadChangeResult` with a `diffSummary {added, removed, modified, totalChanges}`.
- **`PayloadManager`** (`packages/AI/Agents/src/PayloadManager.ts`) defines the scope semantics (`PayloadDownstreamPaths`, `PayloadUpstreamPaths`, `PayloadScope`, `applyPayloadScope`/`reversePayloadScope`) that a payload mutation in the branch composer must respect.

### 3.4 Explorer run visualization (the UI we extend)

All in `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/`:

- Host form **`MJAIAgentRunFormComponentExtended`** (`mj-ai-agent-run-form`), a Pattern-2 override registered via `@RegisterClass(BaseFormComponent, 'MJ: AI Agent Runs')`, with a lazy tab bar: `timeline`, `visualization`, `analytics`, `details`.
- **Timeline tab**: `AIAgentRunTimelineComponent` builds a `TimelineItem` tree (loop containers via step `ParentID`, lazy sub-agent expansion via `AIAgentRunDataHelper.loadSubAgentData(TargetLogID)` with an LRU/TTL cache); `AIAgentRunStepDetailComponent` is the right-hand inspector (`as-split`), with sub-tabs including the `mj-deep-diff` payload diff.
- **Visualization tab**: `AIAgentRunFlowComponent` cockpit over four interchangeable renderers (`SubwayLinesComponent` default, `ConstellationComponent`, `FlowchartComponent`, `FlameCascadeComponent`) sharing one imperative contract (`Render(p, ts)`, `SetSelected`, `Model`, `nodeSelected`) fed by the pure `buildFlowModel()` adapter in `agent-run-flow.model.ts`, with playback transport, pan/zoom, and a narration rail. Node click routes to the same step-detail inspector.
- **Data access**: `AIAgentRunDataHelper.loadStepsAndSubRuns()` uses `RunView`/`RunViews` only (steps by `AgentRunID`, sub-runs by `ParentRunID`, `MJ: Action Execution Logs` and `MJ: AI Prompt Runs` by collected `TargetLogID`s). Live updates ride the `MJGlobal` `BaseEntity` event stream while `Status === 'Running'`.
- One consolidation note: `mj-agent-execution-monitor` in `packages/Angular/Generic/ai-test-harness/` is a second, independent execution tree. This plan adds **no third one** (Section 12).

### 3.5 Sharing, security, and scrubbing primitives

- **RLS today**: three seeded filters scope the UI role to its own runs (`UI: Own AI Agent Runs` `E1AF0001-0000-4000-B000-000000000001` with `UserID = '{{UserID}}'`, plus the matching Steps `E1AF0002...` and Prompt Runs `E1AF0003...` filters); Developer and Integration roles carry NULL `ReadRLSFilterID` and see everything. Sharp edge: `EntityInfo.UserExemptFromRowLevelSecurity` (`packages/MJCore/src/generic/entityInfo.ts:2231`) exempts a user if **any** of their roles has a NULL filter, i.e. RLS composes fail-open across roles.
- **`MJ: Resource Permissions`** (`__mj.ResourcePermission`): polymorphic per-user/per-role grants with `StartSharingAt`/`EndSharingAt`, `PermissionLevel`, `SharedByUserID`, served by `ResourcePermissionEngine` and the reusable `mj-resource-share-dialog` + `ResourceShareAdapter` contract (`packages/Angular/Generic/resource-permissions/`). Agent runs are not yet a `MJ: Resource Types` row.
- **`MJ: Public Links`** (`__mj.PublicLink`): `ResourceType` CHECK (`'Artifact','Collection','Conversation'`), polymorphic `ResourceID`, unique `Token`, `PasswordHash`, `ExpiresAt`, `MaxViews`/`CurrentViews`, `IsActive`. **Shipped but unwired**: no server-side minting, resolution, view counting, or password verification exists. This is the highest-leverage unused asset in the repo for this feature.
- **Magic Link scoped RLS**: `UserInfo.MagicLinkScope` feeds `{{ScopeResourceID}}`/`{{ScopeResourceType}}` into RLS filter text (`RowLevelSecurityFilterInfo.MarkupFilterText`, `packages/MJCore/src/generic/securityInfo.ts:463`), fail-closed when the scope is absent. The Widget Guest role is the shipped precedent for a restricted role whose entire visibility is one scoped resource.
- **Scrubbing**: no scrubbing of persisted run data exists anywhere. The only redaction subsystem is GraphQL request logging (`packages/MJServer/src/logging/secretRedactor.ts`, driven by `EntityInfo.EncryptedFields` and `@NoLog`). The archiving `StripFields` driver config registered against `AIAgentRun` (strips `Result`, `FinalPayload`, `StartingPayload`, `Data`, `Message`, `ErrorMessage`, `AgentState`) is MJ's own catalog of which run fields are sensitive/bulky, and Section 8.3 reuses that list.
- **Telemetry**: `MJ: Audit Logs` + hierarchical `MJ: Audit Log Types`, registered declaratively under `metadata/audit-log-types/` (the `.list-sharing-audit-types.json` file is the exact template for a sharing feature), written via the `ListSharing.emitAuditLog` pattern (`packages/Lists/server/src/ListSharing.ts:558`).

---

## 4. Data model changes

One migration in `migrations/v5/` (next available `v5.50.x`/`v5.51.x` timestamp), plus the PostgreSQL sibling in `migrations-pg/v5/` generated through the `pg-migrate-v2` pipeline.

### 4.1 `AIAgentRun`: two branch-lineage columns

| Column | Type | Notes |
|---|---|---|
| `BranchedFromRunID` | `UNIQUEIDENTIFIER NULL`, FK to `AIAgentRun(ID)` | The source run this run was branched from. NULL for normal runs. |
| `BranchedFromStepID` | `UNIQUEIDENTIFIER NULL`, FK to `AIAgentRunStep(ID)` | The branch point: the step whose `PayloadAtStart` seeds this run. NULL for normal runs. |

Why new columns instead of reuse:

- **Not `ParentRunID`.** Verified meaning: sub-agent nesting (Section 3.1). A branched run is a root-level run, and the visualization, cost rollups, and the `ParentRunID='<id>'` sub-run queries all assume that meaning. Overloading it would corrupt every existing consumer.
- **Not `LastRunID`.** It is DAG-capable in the schema, but its semantics are "continuation after the end": `autoPopulateLastRunPayload` restores `FinalPayload`, HITL resume writes it, and `RootLastRunID` groups conversation-turn chains. A branch restores **mid-run** state and must record **which step**, which `LastRunID` has no slot for. Keeping them separate also lets a branched run later be resumed normally (both fields populated, no ambiguity).
- **Not a `Branch`/lineage table.** Two nullable columns express the full tree (`id`/`parentId`, exactly Pi's shape); Record Changes provides history for free; a table would be a second place to join for zero additional expressiveness.

Naming follows the shipped precedent `AIPromptRun.RerunFromPromptRunID` in spirit; Section 11 item 2 offers Amith the literal `RerunFrom*` alternative. Branch labels reuse the existing unused `AIAgentRun.RunName`. No backfill is needed (new nullable columns; existing rows are correctly "not branches").

### 4.2 `Action`: replay policy

| Column | Type | Notes |
|---|---|---|
| `ReplayPolicy` | `NVARCHAR(20) NULL`, `CHECK (ReplayPolicy IN ('Re-Execute', 'Reuse Recorded', 'Block'))` | How this action behaves when executed inside a branched (replay) run. NULL means `Re-Execute`. |

Per `migrations/CLAUDE.md`, the CHECK is written without an `OR ... IS NULL` clause. This is a justified net-new column: we searched for an existing side-effect/idempotency marker on `Action` and none exists. Semantics are defined in Section 5.5.

### 4.3 `PublicLink`: widen the resource-type CHECK

Drop `CK_PublicLink_ResourceType` and re-add it with `'Agent Run'` included, in the same migration (value lists and the generated TS union derive from the CHECK constraint; `EntityFieldValue` rows are never touched by hand).

### 4.4 Migration checklist (single file, `migrations/v5/`)

- Single consolidated `ALTER TABLE ${flyway:defaultSchema}.AIAgentRun ADD BranchedFromRunID ..., BranchedFromStepID ...` with named inline FK constraints.
- `ALTER TABLE ${flyway:defaultSchema}.Action ADD ReplayPolicy ...` with the CHECK.
- Drop + re-add `CK_PublicLink_ResourceType`.
- `sp_addextendedproperty` for every new column, grouped at the bottom of the file.
- Do **not** add `__mj_CreatedAt`/`__mj_UpdatedAt` or FK indexes (CodeGen owns those). No other indexes unless requested.
- Hand off to CodeGen (Section 10, phase 2); append the CodeGen output to the same migration file per the separator convention; produce the `.pg.sql` sibling via `pg-migrate-v2`.

### 4.5 Metadata changes (not in the migration, per `metadata/CLAUDE.md`)

- New `AI Agent Runs` row in `metadata/resource-types/.resource-types.json` (enables the `ResourcePermission` sharing stack, Section 8.1).
- Widened RLS FilterTexts for the three `UI: Own AI Agent *` filters (Section 8.1).
- New `metadata/audit-log-types/.agent-run-branching-audit-types.json` (Section 9).
- A `Replay Guest` role + scoped entity permissions for phase 6 (Section 8.2).

---

## 5. Replay engine

### 5.1 Parameters (`packages/AI/CorePlus/src/agent-types.ts`)

`ExecuteAgentParams` (currently at `agent-types.ts:913`) gains exactly two fields:

- `branchFromRunId?: string`
- `branchFromStepId?: string`

Every "changed variable" rides **existing** params rather than new ones:

| Variable to change | Existing mechanism |
|---|---|
| Payload mutation | `params.payload`: an explicitly passed payload wins over the seeded snapshot, mirroring the `autoPopulateLastRunPayload` precedence rule verbatim |
| Model / vendor | The existing override params that feed `OverrideModelID`/`OverrideVendorID` |
| Effort | The existing effort param feeding `EffortLevel` |
| Configuration | `configurationId` |
| Prompt text (branch point is a `Prompt` step) | `AIPromptParams.rerunFromPromptRunID` + `systemPromptOverride`, the shipped prompt-rerun mechanism, applied to the first prompt execution of the branched run |

### 5.2 Initialization (`BaseAgent.initializeAgentRun`)

When `branchFromRunId` is present:

1. Load the source run and the branch-point step; validate the step belongs to the run, and that the source run is **settled** (`Completed`, `Failed`, `Cancelled`, or `AwaitingFeedback`). Branching from a `Running` run is refused: its step rows are still landing through the fire-and-forget `AgentRunStepSaveQueue` and the `AgentRunWatchdog` may still reclassify it.
2. Guard lineage sanity the way `validateRunChain` guards `LastRunID` chains (cycle set, bounded depth).
3. Seed the payload: `JSON.parse(step.PayloadAtStart)` unless `params.payload` was passed (the mutation case).
4. Stamp `BranchedFromRunID`, `BranchedFromStepID`, `StartingPayload`, and any overrides onto the new run row. Everything downstream is the normal engine: normal steps, normal `TargetLogID` wiring, normal finalization, normal token stats.

### 5.3 Context reconstruction at the branch point

The payload is not the whole state; the conversation context matters for prompt behavior. The branch seeds its message context from the **recorded** `AIPromptRun.Messages` of the nearest `Prompt` step at or upstream of the branch point (that column stores the fully rendered message array actually sent to the model, so the branch sees exactly what the original saw), falling back to the existing `ConversationEngine` assembly path when the source run has a `ConversationID` and no upstream prompt step exists. This is deliberate reuse: no new snapshot format, no adoption of the dead `AgentState` column.

Upstream steps are **fixtures**: they are never re-executed. Their recorded outputs influence the branch only through the payload snapshot and the recorded messages. This is what makes the branch point well-defined.

### 5.4 What determinism means here (and where it breaks)

**Definition: upstream-fixed, downstream-live.** Everything before the branch point is byte-identical to the source run by construction, because it is *read*, not re-run. Everything from the branch point forward executes live with exactly the variables the user changed. Two sibling branches therefore differ upstream by nothing and downstream by (changed variables + model stochasticity + world state).

Where it breaks, honestly stated:

- **LLM stochasticity.** Same model + same input does not guarantee same output. `AIPromptRun` records `Seed` where the provider supports it, and the diff view (Section 6) treats prompt outputs as expected divergence, not noise to hide.
- **Non-idempotent actions.** A branch that reaches a "send email" or "write record" action re-executes it for real. This is the one place replay needs a guardrail; see 5.5.
- **External world state.** An action or query re-executed later can legitimately return different data. Recorded, visible in the diff, not prevented.
- **Time-dependent prompts.** Templates that interpolate current time/data diverge by nature; the `Data` column captures what was interpolated.

### 5.5 Action replay policy

Enforced in `executeActionsStep` only when the current run has `BranchedFromRunID` set (normal runs are untouched):

- **`Re-Execute`** (default, `NULL`): run the action normally. Correct for reads and idempotent operations.
- **`Reuse Recorded`**: look up the source run's `ActionExecutionLog` for the same `ActionID` by ordinal occurrence (first call to action X in the branch maps to first recorded call to action X at-or-after the branch point, and so on) and return its recorded `Message`/`ResultCode` as the action result without executing. When no recorded match exists (the branch diverged into new action calls), degrade to `Block` for that call: silent live execution of an action the author marked as replay-unsafe is worse than a loud stop.
- **`Block`**: fail the step with an explicit "blocked by ReplayPolicy during replay" error.

The branch composer (Section 7.1) lists the side-effectful actions downstream of the chosen branch point with their policies before launch, so nobody discovers a `Block` mid-run.

### 5.6 Coexistence with HITL and the watchdog

- A branched run **never** stamps `AIAgentRequest.ResumingAgentRunID`; branching from a run that has an open `MJ: AI Agent Requests` row leaves that request untouched and answerable on the original chain.
- A branched run may itself later pause (`AwaitingFeedback`) and be resumed: `LastRunID` and `BranchedFromRunID` coexist without ambiguity.
- No new run `Status` values, no adoption of `'Paused'`, no watchdog changes.

### 5.7 Entry points

`AgentRunner` passes the two new params through; `RunAIAgentResolver` (`packages/MJServer/src/resolvers/RunAIAgentResolver.ts`) gains the matching mutation args. No new resolver.

---

## 6. Outcome diffing

No new server surface and no new diff engine: comparison is client-side over data the form already loads, using `DeepDiffer` from `@memberjunction/global`.

- **Payload diff**: `DeepDiffer` on `FinalPayload` vs `FinalPayload` for the run-level verdict, and `PayloadAtStart`/`PayloadAtEnd` pairs for step-level drill-in, rendered with `mj-deep-diff`. A shared exclusion list keeps the diff semantic: `ID`, `StartedAt`/`CompletedAt`, `__mj_*`, `LastHeartbeatAt`, the step `OutputData.context.durationMs` envelope field, and `AIPromptRun` timing fields (`RunAt`, `CompletedAt`, `ExecutionTimeMS`, `FirstTokenTime`, `QueueTime`, `PromptTime`, `CompletionTime`). One known caveat is documented in the view: only depth-0 runs resolve `${media:...}` placeholders at finalization, so payloads are compared at matching nesting depth.
- **Cost/token diff**: the six per-run columns plus the `*Rollup` columns (rollups are DB-side; the view verifies freshness before trusting them) and the `CalculateAIAgentRunCost` `RunQuery` for nested totals. Token deltas and cost deltas are shown side by side because cache-read discounting lets them move in opposite directions.
- **Step-path diff**: an aligned walk over each run's ordered steps (ordered by `StepNumber, StartedAt`; `StepNumber` is not gap-free under parallel actions) comparing `(StepType, StepName, TargetID)` tuples, rendering shared prefix, divergence point, and added/removed/reordered steps per branch.
- **Semantic classification**: `PayloadChangeAnalyzer` output (already persisted in step `OutputData.payloadChangeResult`) is surfaced alongside the raw diff.

---

## 7. Explorer UX

Everything extends the existing run form; nothing new is routed. Host: `MJAIAgentRunFormComponentExtended` in `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/`.

### 7.1 Branch composer (rewind-and-branch)

- Entry points: a "Branch from this step" action (the `mjButton` directive) in the `AIAgentRunStepDetailComponent` header, and the same action in the flow visualization's node inspector (both already route to the same step-detail surface, so one implementation serves both, matching Pi's "select any node, then act" gesture).
- The action opens an `MjSlidePanelComponent` (`Mode='slide'`, `Resizable`) containing:
  - Model/vendor picker and effort input (`mj-numeric-input`), defaulting to the source run's values.
  - Payload editor: `mj-code-editor` (JSON, CodeMirror) prefilled with the step's `PayloadAtStart`; edits become the `params.payload` mutation.
  - Prompt override textarea, shown only when the branch point is a `Prompt` step (feeds `systemPromptOverride`).
  - `RunName` input for the branch label.
  - A downstream-actions summary listing `Reuse Recorded`/`Block` policies and side-effectful `Re-Execute` actions past the branch point.
- `MJConfirmService` confirmation when downstream actions will `Block` or re-execute side effects; primary button on the LEFT per the MJ dialog convention; on launch, `SharedService.Instance.OpenEntityRecord` navigates to the new run.

### 7.2 Branches tab

A fifth lazy tab `branches` on the existing hand-rolled tab bar (`timeline | visualization | analytics | details | branches`), loaded with the same boolean-gate pattern as `visualizationLoaded`/`analyticsLoaded`. Layout mirrors the timeline tab: branch tree left, compare pane right, `as-split` divider.

- **Branch tree**: the run family, collected by walking `BranchedFromRunID` ancestry to the root and descendants down (the bounded BFS in `packages/TestingFramework/integration-test-suite/src/checks/_it-live-agent-harness.ts:204` is the shape to reuse). Rendered in the timeline's visual language (status icons, indentation levels); nodes show `RunName`, `Status` badge, model, tokens, cost. Data access stays `RunView`-only through `AIAgentRunDataHelper`.
- Selecting one node offers "Open run"; selecting two enables "Compare".

### 7.3 Compare pane

- `mj-stat-badge` strip for cost/token/duration deltas.
- `mj-deep-diff` for the payload diff (Section 6 exclusions applied), inside `mj-accordion-panel` sections (payload, step path, prompts/actions detail).
- The step-path diff list with per-step links into each run's timeline.
- `mj-empty-state` when fewer than two branches are selected.

### 7.4 Conventions followed (reviewable against MattC-BC's system)

The visualization work is Amith's (imperative SVG + RAF); the design system is MattC-BC's `@memberjunction/ng-ui-components` (catalog: `packages/Angular/Generic/ui-components/README.md`). New surfaces here use MattC-BC's shell primitives around the existing data/adapter layer, specifically:

- Components/directives: `mj-slide-panel`, `mj-tab-nav` (if the tab bar is migrated; otherwise the local tab markup is matched), `mj-accordion-panel` (+ `mjAccordionTitle`/`mjAccordionActions`/`mjAccordionBody`), `mj-empty-state`, `mj-alert`, `mj-stat-badge`, `mj-confirm-dialog` via `MJConfirmService`, `mjButton` variants.
- Code style: `standalone: true` with inline `imports` for new components, `ChangeDetectionStrategy.OnPush`, `MJ`-prefixed PascalCase class names, `mj-` kebab selectors, PascalCase `@Input`/`@Output` with setter-based change detection, modern `@if`/`@for` control flow, TSDoc with an `@example` block.
- Styling: `--mj-*` design tokens only (`packages/Angular/Generic/shared/src/lib/_tokens.scss`; the CI hex gate enforces this), no `.mj-btn` overrides (button gate), `color-mix()` for translucency, BEM-ish `.mj-x--modifier` classes, flex-first layout (`flex: 1; min-height: 0`).
- The run form predates the `mj-page-*` chrome trio and hand-rolls its header/tabs; we match its local structure for tab plumbing (consistent with MattC-BC's own practice of migrating such surfaces in dedicated sweeps, e.g. his `mj-empty-state`/accordion/`MJConfirmService` migration commits on this very directory) while using his primitives for all new interior surfaces.

Rejected alternatives: a standalone dashboard (`scaffold-mj-dashboard`) would duplicate the run form's data layer; a new tree/graph component would be the third execution-tree renderer in the repo (`mj-agent-execution-monitor` already duplicates one).

---

## 8. Shareable replay

Phased: authenticated in-app sharing first (pure reuse), tokenized external links second (the one justified net-new server surface), static HTML export last.

### 8.1 Phase A: in-app sharing (authenticated viewers)

- Add the `AI Agent Runs` resource type (metadata) and an `AgentRunShareAdapter` implementing the existing `ResourceShareAdapter` contract; drop `mj-resource-share-dialog` into the run form header actions. Grants land in `MJ: Resource Permissions` (time-bounded sharing and `SharedByUserID` attribution come free, as does Record Changes history).
- **RLS integration (required)**: per-record grants do not punch through the injected RLS WHERE clause, so the three seeded FilterTexts are widened (metadata change) from `UserID = '{{UserID}}'` to also admit runs shared to the user through `ResourcePermission` (and the Steps/Prompt Runs filters follow through `AgentRunID`). This keeps enforcement in the one place it already lives instead of adding a parallel permission check.
- The fail-open sharp edge is documented for reviewers: any role with a NULL `ReadRLSFilterID` on these entities (Developer, Integration) bypasses all filters by design (`entityInfo.ts:2231`). Sharing changes nothing for such users; it only widens what UI-role users can see.

### 8.2 Phase B: external replay links

- Mint `MJ: Public Links` rows (the token, password hash, expiry, and view-cap columns finally get used) from a share dialog option on the run form.
- Net-new and justified (nothing exists): a `MJServer` resolution path that validates `Token`/`PasswordHash`/`ExpiresAt`/`MaxViews`, increments `CurrentViews`, and establishes a **Magic Link scoped session**: a new `Replay Guest` role (Widget Guest precedent) whose `MJ: AI Agent Runs` filter is `ID = '{{ScopeResourceID}}'` and whose Steps/Prompt Runs filters scope through `AgentRunID`, fail-closed when the scope is absent.
- The viewer renders the existing run form surfaces in a read-only shell; no separate replay renderer.

### 8.3 Scrubbing rules (defined here because none exist)

Scrubbing happens at **projection time** (a redacted view-model built server-side for share rendering); persisted data is never modified. The sharer picks the level:

- **`Structure`** (default): steps, step types/names, timings, token/cost figures, status outcomes, and payload diffs. Withheld: `AIPromptRun.Messages` and `Result` (the fully rendered prompt is the single biggest leak surface: it embeds the system prompt and every tool result), `ActionExecutionLog.Params` and `Message` (cleartext action inputs/outputs), `ErrorMessage` bodies.
- **`Full`**: adds prompt and action I/O. Intended for trusted in-app viewers; Section 11 item 6 asks whether `Full` should be allowed on external links at all.
- Always, at both levels: fields flagged by `EntityInfo.EncryptedFields` are redacted (same source of truth the request-log redactor uses), and the `StripFields` archive catalog (`Result`, `FinalPayload`, `StartingPayload`, `Data`, `Message`, `ErrorMessage`, `AgentState`) is treated as the sensitive-field checklist the projection must explicitly decide about rather than pass through by default.
- Stated plainly: **no automatic PII detection in v1.** The levels control exposure surface; they do not inspect content.

### 8.4 Static HTML export (last phase)

Pi's `/export` artifact is the content reference: self-contained HTML, the full branch tree embedded as data, client-side navigation between branches, per-step detail, inlined styling. `MJExportEngine` supports only `excel`/`csv`/`json` today, so an HTML replay exporter is net-new; it is deferred to the final phase and generated server-side from the **scrubbed projection** (never from raw rows), so an exported file is no more revealing than the share level that produced it.

---

## 9. Telemetry

- New `metadata/audit-log-types/.agent-run-branching-audit-types.json` (modeled on `.list-sharing-audit-types.json`: hardcoded `uuidgen` UUIDs, no `sync` block, descriptions naming the emitting method): `Run Branched`, `Run Share Granted`, `Run Share Revoked`, `Replay Link Created`, `Replay Link Viewed`.
- Written through the `ListSharing.emitAuditLog` pattern (`AuditLogTypeEngine.Instance.ByName`, failures logged and swallowed so audit never breaks the operation), with `EntityID` = `MJ: AI Agent Runs` and `RecordID` = the run ID for free per-record correlation.
- Branch adoption is measurable from the data model itself (`BranchedFromRunID IS NOT NULL` counts, grouped by agent); replay cost is already captured by the ordinary run/prompt-run cost columns of the branched runs; `ResourcePermission` mutations get Record Changes history automatically.

---

## 10. Phasing

| Phase | Deliverable | Gating |
|---|---|---|
| **P1** | The migration (Section 4): lineage columns, `Action.ReplayPolicy`, `PublicLink` CHECK widen, extended properties | Review of this plan |
| **P2** | Apply migration + run CodeGen locally; append CodeGen output to the same migration per the separator convention; commit generated entities (`MJAIAgentRunEntity.BranchedFromRunID`/`BranchedFromStepID`, `MJActionEntity.ReplayPolicy`, widened `MJPublicLinkEntity.ResourceType` union); produce the `.pg.sql` sibling via `pg-migrate-v2` | P1 |
| **P3** | Replay engine: `ExecuteAgentParams` fields, `initializeAgentRun` branch seeding + validation, context reconstruction, `ReplayPolicy` enforcement in `executeActionsStep`, `AgentRunner`/`RunAIAgentResolver` passthrough. Vitest coverage in `@memberjunction/ai-agents` + a deterministic integration bundle (branch from a fixture run, assert seeded payload, lineage stamps, policy enforcement) | P2 |
| **P4** | Explorer: branch composer, Branches tab, compare pane (Sections 7.1 to 7.3). DOM specs per the existing `*.dom.test.ts` pattern in the directory | P2 (P3 for live launch) |
| **P5** | In-app sharing: resource-type metadata, `AgentRunShareAdapter`, share dialog wiring, widened RLS FilterTexts, audit types | P2 |
| **P6** | External links + HTML export: `PublicLink` minting/resolution, `Replay Guest` scoped role, scrubbed projection, HTML exporter | P3, P5 |

Each phase lands with both test tiers green per the Definition of Done (package unit tests plus the deterministic integration suite), run after migrations + CodeGen are applied.

### 10.1 Handoff: CodeGen must run before any code is written

Phase 2 is the hard gate, identical to the compaction plan's: the migration must be applied to a local database and CodeGen run (regenerating `entity_subclasses.ts`, resolvers, and forms) **before** any P3+ TypeScript references the new fields. Never reference the new columns via `.Get()`/`.Set()` or before the typed properties exist.

---

## 11. Open items to confirm with Amith

1. **ParentRunID verdict.** Confirmed present and documented for sub-agent nesting ("Reference to the parent agent run if this is a sub-agent execution"); there is also `LastRunID` ("Links to the previous run in a chain. Different from ParentRunID"). Recommendation: touch neither; add `BranchedFromRunID` + `BranchedFromStepID`. The considered-and-rejected alternative (overloading `LastRunID`, which is schema-DAG-capable) is written up in Section 4.1. Confirm the three-field separation.
2. **Naming.** `BranchedFromRunID`/`BranchedFromStepID` vs `RerunFromRunID`/`RerunFromStepID` (the literal precedent is `AIPromptRun.RerunFromPromptRunID` + `RootRerunFromPromptRunID`).
3. **Root column.** Should `vwAIAgentRuns` gain `RootBranchedFromRunID` alongside `RootParentRunID`/`RootLastRunID` as the branch-family grouping key, and are those root columns CodeGen-maintained or hand-maintained in the view?
4. **`Action.ReplayPolicy`** as a persisted column (proposed) vs a runtime-only parameter on the branch request. The column makes the guarantee author-owned and uniform; the param would be per-branch ad hoc.
5. **Share enforcement**: widening the three `UI: Own AI Agent *` RLS FilterTexts (proposed, keeps one enforcement point) vs standing up a dedicated agent-run permission domain/provider.
6. **Redaction defaults**: `Structure` as the default share level, and whether `Full` (raw `AIPromptRun.Messages`) should ever be permitted on external `PublicLink` shares.
7. **FYI**: `AIPromptRun.AgentRunID` exists in SQL but not in the generated entity on `next` (removed by `V202607241645__v5.50.x__Break_CodeGen_Cycle_Remove_PromptRun_AgentRunID.sql`); this design intentionally depends only on `AIAgentRunStep.TargetLogID` for step-to-prompt-run linkage.
8. **HTML export scope**: keep phase 6's static HTML exporter in this effort, or split it into a follow-up plan once in-app sharing proves out.

---

## 12. What we explicitly are NOT doing

- **Mid-run steering or interrupts.** Covered by existing HITL and `MJ: AI Agent Requests`; branching only ever starts from settled runs.
- **Agent self-extension.** Covered by ActionSmith.
- **Slash commands.** Covered by AI Agent Skills.
- **Any new hook/plugin system on `BaseAgent`.** House pattern is subclassing with granular overridable methods; `serializePayloadAtStart`/`serializePayloadAtEnd` are the sanctioned override points this plan touches.
- **Cross-provider context serialization.** Separate future plan.
- **Pi-style branch summaries.** MJ branches lose nothing, so there is nothing to summarize.
- **A `Branch`/lineage table.** Two columns on `AIAgentRun` express the tree.
- **Adopting `AIAgentRun.AgentState`.** Dead schema (never written); branch seeding uses recorded step snapshots and prompt-run messages instead.
- **Mutating or deleting existing runs.** Branches are new immutable rows; source runs are never rewritten (Pi's append-only discipline, kept).
- **A third execution-tree UI component**, a new dashboard, or any parallel run-viewing surface.
