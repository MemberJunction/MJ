# Loop Agent Ephemeral Task List

## Overview

Give loop agents the ability to manage their own ephemeral task lists — internal organizational state for tracking work items during complex workflows. Unlike payload (which represents working data), task lists are purely internal bookkeeping that helps agents decompose and track multi-step processes.

## Key Design Decision: Response Field, Not Actions

### Why Not Actions?

The initial idea was built-in actions (upsert, delete, get), but actions have a **turn-consumption problem**:

When the LLM returns `"type": "Actions"`, the loop agent executes them, formats results as a message, and calls the LLM *again*. Task management via actions means:
- Turn 1: LLM decides to update its task list → executes "Upsert Task" action
- Turn 2: LLM sees "task added successfully" → now does its actual work

That's an entire LLM round-trip wasted on bookkeeping. Multiply by every task status change across a complex workflow and it adds up in tokens and latency.

### Recommended: First-Class Response Field

Add `taskList` alongside `payloadChangeRequest` on `LoopAgentResponse` — processed *inline*, zero turn cost. This follows the same pattern as `payloadChangeRequest` which works great.

**Benefits:**
- **Zero turn cost** — task changes processed inline, same turn as real work
- **Composable** — agent can update tasks AND execute actions AND update payload in one response
- **Consistent** — follows the `payloadChangeRequest` pattern
- **Token efficient** — no action execution feedback messages

## Type Definitions

### AgentTask

```typescript
interface AgentTask {
    id: string;              // Agent-assigned identifier
    title: string;           // Brief description
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    priority?: number;       // Lower = higher priority
    notes?: string;          // Context, blockers, results
    parentId?: string;       // Hierarchical task support
}
```

### LoopAgentResponse Addition

```typescript
interface LoopAgentResponse {
    // ... existing fields ...

    /** Manage internal task list for tracking work progress */
    taskList?: {
        /** Add new tasks or update existing ones (matched by id) */
        upsert?: AgentTask[];
        /** Remove tasks by ID */
        remove?: string[];
    };
}
```

## Storage and Lifecycle

- **In-memory**, alongside payload — not persisted to DB
- **Ephemeral per run** — starts empty, disappears when the run ends
- **Injected into prompt** each turn (like payload):

```markdown
## Task List
Your internal task tracker. Manage via `taskList` in your response.
```json
{{ _TASK_LIST | dump | safe }}
```
```

- **Not visible to sub-agents** — purely internal organizational state. If a parent needs to communicate work items to a sub-agent, that's what the message and payload downstream paths are for.

## Configuration: Two-Layer Control

### Layer 1: Metadata (AgentTypePromptParams)

Use the existing `AgentTypePromptParams` schema — consistent with how ForEach, While, commands, and response forms are controlled:

```typescript
// In LoopAgentTypePromptParams
{
    includeTaskListDocs: true,        // Show task list documentation in prompt
    includeResponseTypeDefinition: {
        taskList: true,               // Include taskList field in response interface
        // ... existing: payload, forEach, while, commands, responseForms
    }
}
```

**Why this is better than a new DB column:**
- Defaults set at the **agent type** level (all Loop agents get it by default)
- Individual agents override via `AIAgent.AgentTypePromptParams` JSON field
- Auto-alignment already works (if `includeTaskListDocs=false`, the response field auto-disables)
- No migration needed — just a schema default change
- Consistent with every other conditional feature in the system

### Layer 2: Runtime Override (ExecuteAgentParams)

Add a runtime override on `ExecuteAgentParams` so that callers can enable or disable the task list at execution time, regardless of what the metadata says. This follows the existing pattern where `ExecuteAgentParams.data.__agentTypePromptParams` can override metadata-level settings, but makes it explicit and discoverable:

```typescript
interface ExecuteAgentParams {
    // ... existing fields ...

    /**
     * Runtime override for task list availability.
     * - true: force-enable task list even if metadata has it disabled
     * - false: force-disable task list even if metadata has it enabled
     * - undefined: use metadata setting (default)
     */
    enableTaskList?: boolean;
}
```

**Why this matters:**
- A parent agent or orchestrator may want to disable task lists for lightweight sub-agent invocations (reduce prompt size / token cost)
- Conversely, a caller may want to enable task lists for an agent that has them disabled by default in metadata (e.g., enabling it for a particularly complex request)
- Runtime overrides are already precedented by `ExecuteAgentParams.data.__agentTypePromptParams` (Layer 3 in the existing merge system), but `enableTaskList` is a clearer, typed API for this specific feature
- The merge precedence would be: **metadata defaults < agent-level params < runtime override** (highest priority)

**Implementation:** In `gatherAgentContextData()` (base-agent.ts), after merging the three-layer `__agentTypePromptParams`, check `params.enableTaskList` and override both `includeTaskListDocs` and `includeResponseTypeDefinition.taskList` if set.

## Prompt Documentation

The template would get a new conditional section showing the task list schema and a brief usage example:

```json
{
  "taskComplete": false,
  "message": "Starting analysis of 5 data sources",
  "taskList": {
    "upsert": [
      { "id": "t1", "title": "Analyze sales data", "status": "in_progress", "priority": 1 },
      { "id": "t2", "title": "Analyze marketing data", "status": "pending", "priority": 2 },
      { "id": "t3", "title": "Cross-reference findings", "status": "pending", "priority": 3 }
    ]
  },
  "nextStep": { "type": "Actions", "actions": [{ "name": "Query Sales DB", "params": {} }] }
}
```

The type file (`agent-task.ts`) would be auto-generated for prompt inclusion by the same post-build script already wired up in `packages/AI/CorePlus/scripts/generate-prompt-types.mjs`.

## Implementation Steps

### 1. New Type File
- Create `packages/AI/CorePlus/src/agent-task.ts` (~30 lines)
- Define `AgentTask` interface and `TaskListChanges` type
- Export from `index.ts`
- Add to `generate-prompt-types.mjs` FILE_CONFIGS array

### 2. Update LoopAgentResponse
- Add optional `taskList?: TaskListChanges` field to the response type
- In `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts`

### 3. Update LoopAgentTypePromptParams
- Add `includeTaskListDocs: boolean` (default: `true`)
- Add `includeResponseTypeDefinition.taskList: boolean` (default: `true`)
- Update the JSON Schema defaults in the agent type record
- Wire up auto-alignment (same pattern as forEach/while)

### 4. Task List Manager
- Simple in-memory class alongside `PayloadManager`
- `upsert(tasks: AgentTask[])` — add or update by ID
- `remove(ids: string[])` — remove by ID
- `getAll(): AgentTask[]` — return current list
- `clear()` — reset
- Instantiated per agent run, garbage collected when run ends

### 5. Wire Into Loop Agent Execution
- In `base-agent.ts` loop iteration handler:
  - After parsing `LoopAgentResponse`, process `taskList` changes (like payload changes)
  - Inject current task list into template data as `_TASK_LIST`

### 6. Template Updates
- Add conditional `taskList` field in `LoopAgentResponse` interface block
- Add `{@include}` of generated task type reference
- Add conditional documentation section with example
- Add task list state injection (like payload section)

### 7. Post-Build Script
- Already wired up — just add `agent-task.ts` to the FILE_CONFIGS array
- Generated file will be `agent-task.ts.generated-for-prompt.md`

### No Migration Needed
- Task list config uses existing `AgentTypePromptParams` JSON field
- No new DB columns required
- Schema defaults can be updated via metadata push

## Future Considerations

### Cross-Agent Task Visibility (Optional, Later)
If a sub-agent ever needs to read the parent's task list, this could be added via:
- A `TaskListDownstreamPaths` concept (like `PayloadDownstreamPaths`)
- Or a dedicated action for explicit cross-agent task queries
- Not needed for v1 — payload downstream paths serve this purpose

### Task Persistence Across Runs (Optional, Later)
If agents need to resume task lists across separate runs:
- Store in a `MJ: AI Agent Run Tasks` entity
- Load on run start if previous run had incomplete tasks
- Opt-in per agent configuration
- Not needed for v1 — ephemeral is the right default

### Task Dependencies (Optional, Later)
- `dependsOn?: string[]` field for task ordering constraints
- Agent runtime could validate that blocked tasks aren't started before dependencies complete
- Useful for sophisticated workflow planning
- Not needed for v1 — agents can manage ordering via priority + notes

## Architecture Notes

### Current Relevant Architecture
- **Payload** lives in conversation message context (in-memory), not DB
- **PayloadManager** (`packages/AI/Agents/src/PayloadManager.ts`) handles payload change processing
- **AgentTypePromptParams** schema controls conditional prompt features
- **Auto-alignment** in `base-agent.ts` (lines 3748-3791) syncs doc flags with response type flags
- **Template variables** injected via `AgentContextData` in `gatherAgentContextData()` (line 3631)
- **ActionChange** system provides precedent for runtime-injected capabilities with scope control

### Key Files
| File | Relevance |
|------|-----------|
| `packages/AI/Agents/src/base-agent.ts` | Loop iteration handler, payload processing, template data injection |
| `packages/AI/Agents/src/PayloadManager.ts` | Pattern to follow for TaskListManager |
| `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts` | LoopAgentResponse type definition |
| `packages/AI/Agents/src/agent-types/loop-agent-prompt-params.ts` | LoopAgentTypePromptParams schema |
| `packages/AI/CorePlus/src/agent-types.ts` | AgentContextData, ActionChange |
| `packages/AI/CorePlus/scripts/generate-prompt-types.mjs` | Post-build type generation |
| `metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md` | Prompt template |
