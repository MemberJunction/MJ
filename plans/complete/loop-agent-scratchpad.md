# Loop Agent Scratchpad

## Overview

Give loop agents a private **scratchpad** — ephemeral internal working memory for organizing thoughts and tracking work during complex workflows. Unlike payload (which represents working data shared through downstream paths), the scratchpad is purely internal: a place for the agent to think, plan, and track progress.

The scratchpad has two sections:
1. **Notes** — free-form text for reasoning, intermediate conclusions, reminders
2. **Task List** — structured tracking of work items with status

## Key Design Decision: Response Field, Not Actions

### Why Not Actions?

The initial idea was built-in actions (upsert, delete, get), but actions have a **turn-consumption problem**:

When the LLM returns `"type": "Actions"`, the loop agent executes them, formats results as a message, and calls the LLM *again*. Scratchpad management via actions means:
- Turn 1: LLM decides to update its scratchpad → executes "Update Scratchpad" action
- Turn 2: LLM sees "scratchpad updated successfully" → now does its actual work

That's an entire LLM round-trip wasted on bookkeeping. Multiply by every status change across a complex workflow and it adds up in tokens and latency.

### Recommended: First-Class Response Field

Add `scratchpad` alongside `payloadChangeRequest` on `LoopAgentResponse` — processed *inline*, zero turn cost. This follows the same pattern as `payloadChangeRequest` which works great.

**Benefits:**
- **Zero turn cost** — scratchpad changes processed inline, same turn as real work
- **Composable** — agent can update scratchpad AND execute actions AND update payload in one response
- **Consistent** — follows the `payloadChangeRequest` pattern
- **Token efficient** — no action execution feedback messages

## Type Definitions

### AgentTask

```typescript
interface AgentTask {
    id: string;              // Simple sequential ID (e.g., "t1", "t2", "t3")
    title: string;           // Brief description of the work item
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    notes?: string;          // Context, blockers, results
}
```

**Design decisions:**
- **Simple IDs**: `t1`, `t2`, `t3` — not UUIDs. The full task list is injected every turn, so the LLM always sees what exists. Sequential IDs are easy to reference and unlikely to collide.
- **No `priority` field**: The LLM can manage ordering by list position and notes. Fewer fields = less JSON to get wrong.
- **No `parentId` field**: Hierarchical task trees are fragile for LLMs to maintain across turns. A flat list with notes is sufficient and far more robust.

### AgentScratchpad

```typescript
interface AgentScratchpad {
    /** Free-form text — reasoning notes, intermediate conclusions,
        reminders for future turns. No hard limit; agent is prompted
        to be mindful of token cost since this is injected every turn. */
    notes?: string;

    /** Structured task tracking. Max 50 tasks (configurable). */
    taskList?: {
        /** Add new tasks or update existing ones (matched by id) */
        upsert?: AgentTask[];
        /** Remove tasks by ID */
        remove?: string[];
    };
}
```

### LoopAgentResponse Addition

```typescript
interface LoopAgentResponse {
    // ... existing fields ...

    /** Private working memory — not shared with parent or sub-agents */
    scratchpad?: AgentScratchpad;
}
```

## Storage and Lifecycle

- **In-memory**, alongside payload — not persisted to DB
- **Ephemeral per run** — starts empty, disappears when the run ends
- **Injected into prompt** each turn (like payload):

```markdown
## Scratchpad
Your private working memory. Not shared with other agents. Manage via `scratchpad` in your response.

### Notes
{{ _SCRATCHPAD_NOTES }}

### Task List
{{ _SCRATCHPAD_TASKS }}
```

- **Never shared with parent or sub-agents** — purely internal organizational state. If a parent needs to communicate work items to a sub-agent, that's what the message and payload downstream paths are for. If a sub-agent completes work, the parent infers completion from the sub-agent's return value and updates its own scratchpad accordingly.

### Step-Level Persistence (Audit & Training Data)

Although the scratchpad is ephemeral in-memory during a run, a **snapshot** is persisted in each `MJ: AI Agent Run Steps` record in **both** `InputData` and `OutputData` JSON blobs:

```json
{
  "inputData": {
    "scratchpad": {
      "notes": "User wants YoY comparison. Sales DB has data back to 2019.",
      "tasks": [
        { "id": "t1", "title": "Analyze sales data", "status": "in_progress" },
        { "id": "t2", "title": "Analyze marketing data", "status": "pending" },
        { "id": "t3", "title": "Cross-reference findings", "status": "pending" }
      ]
    }
  }
}
```

```json
{
  "outputData": {
    "scratchpad": {
      "notes": "User wants YoY comparison. Sales DB has data back to 2019. Marketing DB only goes to 2021 — will need to note this limitation.",
      "tasks": [
        { "id": "t1", "title": "Analyze sales data", "status": "completed", "notes": "Done, 2019-2025" },
        { "id": "t2", "title": "Analyze marketing data", "status": "in_progress" },
        { "id": "t3", "title": "Cross-reference findings", "status": "pending" }
      ]
    }
  }
}
```

**Why both InputData and OutputData:** Storing the scratchpad in both directions makes each step self-contained for diff computation. The UI can show what changed at each step without needing to look up the previous step's OutputData. This is the same pattern used for `PayloadAtStart` / `PayloadAtEnd` on the step record.

**Why this matters:**
- **Training data** — the scratchpad captures *how* the agent organized its thinking at each step, not just what it produced. The input→output delta shows the agent's reasoning evolution. Valuable for fine-tuning and few-shot examples.
- **Debugging** — when a run goes wrong, the scratchpad diff at each step shows exactly what changed in the agent's understanding.
- **Audit trail** — readable record of internal planning for compliance or customer review.

**Implementation:** `ScratchpadManager.toJSON()` returns the snapshot; `base-agent.ts` includes it in the step's InputData (before processing the LLM response) and OutputData (after processing scratchpad changes) when writing the `MJ: AI Agent Run Steps` record. No schema migration needed — both fields are already JSON blobs.

### Size Management

- **Notes and task notes**: **No hard limits.** The LLM is instructed via prompt guidance to keep scratchpad content concise and mindful of token cost. Silent truncation is worse than no limit — it destroys context without the agent knowing. If degenerate behavior is observed in practice, hard limits can be added later with real data on what's reasonable.
- **Task List**: Hard cap at **50 tasks** (configurable via `AgentTypePromptParams`). If the limit is reached, auto-prune `completed` tasks (oldest first). If still over limit, reject new additions and inject a warning into the prompt. This is a structural limit — a 50+ item task list is unwieldy regardless of how good the LLM is.
- **Prompt guidance** (injected in the scratchpad documentation section):
  > *Your scratchpad is injected into every turn — keep it lean. Use notes for key reasoning and decisions, not verbose logs. Task notes should be succinct. Everything here costs tokens on every subsequent turn.*

## Configuration: Metadata (AgentTypePromptParams)

Use the existing `AgentTypePromptParams` schema — consistent with how ForEach, While, commands, and response forms are controlled:

```typescript
// In LoopAgentTypePromptParams
{
    includeScratchpadDocs: true,       // Show scratchpad documentation in prompt
    scratchpadMaxTasks: 50,            // Max task list entries (default: 50)
    includeResponseTypeDefinition: {
        scratchpad: true,              // Include scratchpad field in response interface
        // ... existing: payload, forEach, while, commands, responseForms
    }
}
```

**Why this is better than a new DB column:**
- Defaults set at the **agent type** level (all Loop agents get it by default)
- Individual agents override via `AIAgent.AgentTypePromptParams` JSON field
- Auto-alignment already works (if `includeScratchpadDocs=false`, the response field auto-disables)
- No migration needed — just a schema default change
- Consistent with every other conditional feature in the system

**No runtime override for v1.** The metadata-level control is sufficient. If someone later needs to force-enable/disable the scratchpad at call time via `ExecuteAgentParams`, it's a trivial addition — one field on the params type and a three-line check in `gatherAgentContextData()`. Build that plumbing when there's demand.

## Prompt Documentation

The template would get a new conditional section showing the scratchpad schema and a brief usage example:

```json
{
  "taskComplete": false,
  "message": "Starting analysis of 5 data sources",
  "scratchpad": {
    "notes": "User wants year-over-year comparison. Sales DB has data back to 2019. Marketing DB only goes to 2021 — will need to note this limitation.",
    "taskList": {
      "upsert": [
        { "id": "t1", "title": "Analyze sales data", "status": "in_progress" },
        { "id": "t2", "title": "Analyze marketing data", "status": "pending" },
        { "id": "t3", "title": "Cross-reference findings", "status": "pending" }
      ]
    }
  },
  "nextStep": { "type": "Actions", "actions": [{ "name": "Query Sales DB", "params": {} }] }
}
```

The type file (`agent-scratchpad.ts`) would be auto-generated for prompt inclusion by the same post-build script already wired up in `packages/AI/CorePlus/scripts/generate-prompt-types.mjs`.

## Implementation Steps

### 1. New Type File ✅
- Created `packages/AI/CorePlus/src/agent-scratchpad.ts` with `AgentTask`, `AgentTaskStatus`, `TaskListChanges`, `AgentScratchpad`, and `ScratchpadSnapshot` types
- Exported from `index.ts`
- Added to `generate-prompt-types.mjs` FILE_CONFIGS array (generates `agent-scratchpad.ts.generated-for-prompt.md`)

### 2. Update LoopAgentResponse ✅
- Added `scratchpad?: AgentScratchpad` field to `LoopAgentResponse` in `loop-agent-response-type.ts`
- Added `scratchpad?: AgentScratchpad` field to `BaseAgentNextStep` in `agent-types.ts` (CorePlus) for pipeline flow
- Added `scratchpad: response.scratchpad` mapping in all three `DetermineNextStep` code paths in `loop-agent-type.ts`

### 3. Update LoopAgentTypePromptParams ✅
- Added `includeScratchpadDocs: boolean` (default: `true`)
- Added `scratchpadMaxTasks: number` (default: `50`)
- Added `includeResponseTypeDefinition.scratchpad: boolean` (default: `true`)
- Wired auto-alignment mapping in `base-agent.ts`

### 4. ScratchpadManager ✅
- Created `packages/AI/Agents/src/ScratchpadManager.ts` (~260 lines)
- Implements SetNotes, GetNotes, UpsertTasks, RemoveTasks, GetTasks, GetTasksByStatus, GetTaskCounts, ApplyScratchpadChanges, EnforceTaskLimit, ToJSON, ToPromptString, GetTaskSummary, HasContent, Clear
- Exported from `packages/AI/Agents/src/index.ts`

### 5. Wire Into Loop Agent Execution ✅
- In `base-agent.ts`:
  - Added `_scratchpadManager` member variable, cleared at start of `Execute()`
  - Injected `_SCRATCHPAD_NOTES`, `_SCRATCHPAD_TASKS`, `_SCRATCHPAD_TASK_SUMMARY` template vars in `preparePromptParams()`
  - Captured scratchpad snapshot in InputData before LLM response
  - Applied scratchpad changes from `initialNextStep.scratchpad` after payload processing
  - Enforced 50-task limit with `EnforceTaskLimit()`
  - Captured scratchpad snapshot in OutputData after changes applied

### 6. Template Updates ✅
- Added conditional `scratchpad?: AgentScratchpad` field in response interface
- Added `{@include}` for generated scratchpad type reference
- Added Scratchpad documentation section with example JSON and token guidance
- Added Scratchpad State section with notes/tasks/summary variable injection

### 7. Post-Build Script ✅
- Added `agent-scratchpad.ts` to FILE_CONFIGS with supplementary context
- Verified generation: `agent-scratchpad.ts.generated-for-prompt.md` (31 lines)

### 8. Step Detail UI — Scratchpad Tab ✅

Add a **Scratchpad** tab to the `AIAgentRunStepDetailComponent` (the side panel that opens when a step is selected in the agent run timeline). This sits alongside the existing "Payload Changes" and "Full JSON" tabs.

**Location:** `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run-step-detail.component.*`

**Tab structure:** The scratchpad tab has three internal sub-tabs for toggling between views:

```
[Payload Changes] [Scratchpad] [Full JSON]
                       │
              ┌────────┼────────┐
           [Input]  [Output]  [Diff]
```

#### Sub-tab: Input
Shows the scratchpad state at the **start** of the step (from `InputData.scratchpad`). Rendered as formatted markdown/HTML:
- **Notes** section with the free-text content
- **Task List** as a table or styled list with status badges (pending=gray, in_progress=blue, completed=green, blocked=orange)

#### Sub-tab: Output
Same layout as Input, but shows the scratchpad state at the **end** of the step (from `OutputData.scratchpad`).

#### Sub-tab: Diff
Uses the existing `<mj-deep-diff>` component to show what changed between InputData.scratchpad and OutputData.scratchpad:
```html
<mj-deep-diff
  [oldValue]="stepScratchpadInput"
  [newValue]="stepScratchpadOutput"
  [title]="''"
  [showSummary]="true"
  [showUnchanged]="false"
  [expandAll]="false"
  [maxDepth]="4"
  [maxStringLength]="300"
  [treatNullAsUndefined]="true">
</mj-deep-diff>
```

#### Conditional visibility
- The Scratchpad tab only appears when `InputData.scratchpad` or `OutputData.scratchpad` exists on the step
- If the step has no scratchpad data (e.g., non-loop agent steps, or scratchpad was disabled), the tab is hidden

#### Component changes
- Add `scratchpadSubTab: 'input' | 'output' | 'diff'` property (default: `'diff'`)
- Add `stepScratchpadInput` and `stepScratchpadOutput` computed properties that parse the scratchpad from InputData/OutputData
- Add `showScratchpadTab` computed property
- Extend the existing `detailPaneTab` type to include `'scratchpad'`

### 9. Unit Tests ✅
- Created `packages/AI/Agents/src/__tests__/scratchpad-manager.test.ts` (56 tests)
- Coverage: Notes management, task upsert/remove, composite changes, task limit enforcement, serialization (ToJSON, ToPromptString, GetTaskSummary), state queries, Clear/reset, defensive copies, edge cases (null/undefined/empty), multi-turn workflow simulation
- All 56 tests passing

### 10. Build Verification ✅
- `@memberjunction/ai-core-plus` — builds cleanly
- `@memberjunction/ai-agents` — builds cleanly
- `@memberjunction/ng-core-entity-forms` — builds cleanly (Angular ngc)

### No Migration Needed
- Scratchpad config uses existing `AgentTypePromptParams` JSON field
- No new DB columns required
- Schema defaults can be updated via metadata push

## Future Considerations

### Scratchpad Persistence Across Runs (Optional, Later)
If agents need to resume scratchpads across separate runs:
- Store in a `MJ: AI Agent Run Scratchpads` entity
- Load on run start if previous run had incomplete tasks
- Opt-in per agent configuration
- Not needed for v1 — ephemeral is the right default

### Task Dependencies (Optional, Later)
- `dependsOn?: string[]` field for task ordering constraints
- Agent runtime could validate that blocked tasks aren't started before dependencies complete
- Useful for sophisticated workflow planning
- Not needed for v1 — agents can manage ordering via list position + notes

### Additional Scratchpad Sections (Optional, Later)
The scratchpad abstraction is designed to grow. Possible future additions:
- **Decisions log** — structured record of choices made and why
- **Key findings** — extracted facts the agent wants to reference later
- These would be new fields on `AgentScratchpad` with corresponding prompt sections
- The `ScratchpadManager` architecture supports this naturally

### Runtime Override (Optional, Later)
If callers need to force-enable/disable the scratchpad at execution time:
- Add `enableScratchpad?: boolean` to `ExecuteAgentParams`
- Check in `gatherAgentContextData()` after merging `__agentTypePromptParams`
- Trivial to add when demand arises

## Architecture Notes

### Current Relevant Architecture
- **Payload** lives in conversation message context (in-memory), not DB
- **PayloadManager** (`packages/AI/Agents/src/PayloadManager.ts`) handles payload change processing — primary pattern to follow for ScratchpadManager
- **AgentTypePromptParams** schema controls conditional prompt features
- **Auto-alignment** in `base-agent.ts` (lines 3748-3791) syncs doc flags with response type flags
- **Template variables** injected via `AgentContextData` in `gatherAgentContextData()` (line 3631)
- **ActionChange** system provides precedent for runtime-injected capabilities with scope control

### Key Files
| File | Relevance |
|------|-----------|
| `packages/AI/Agents/src/base-agent.ts` | Loop iteration handler, payload processing, template data injection |
| `packages/AI/Agents/src/PayloadManager.ts` | Pattern to follow for ScratchpadManager |
| `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts` | LoopAgentResponse type definition |
| `packages/AI/Agents/src/agent-types/loop-agent-prompt-params.ts` | LoopAgentTypePromptParams schema |
| `packages/AI/CorePlus/src/agent-types.ts` | AgentContextData, ActionChange |
| `packages/AI/CorePlus/scripts/generate-prompt-types.mjs` | Post-build type generation |
| `metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md` | Prompt template |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run-step-detail.component.*` | Step detail panel — add Scratchpad tab here |
