# Plan: Smart Artifact Naming from Agent Responses

**Status:** Proposed  
**Author:** Claude (with Amith)  
**Date:** 2026-04-02  
**Affects:** `@memberjunction/ai-agents`, `@memberjunction/ai-core-plus`, system prompt template, `TaskOrchestrator`

---

## Problem

When an agent creates a payload that becomes an artifact, the name defaults to:  
`"Query Builder Payload - 4/2/2026, 3:45:30 PM"`

This is unhelpful. We already know the date/time and which agent generated it. The user gets no indication of *what* the artifact actually contains (e.g., "Q3 Revenue by Region" or "Customer Churn Dashboard").

## Current Flow

```
LLM generates LoopAgentResponse
  → LoopAgentType.DetermineNextStep() → BaseAgentNextStep
    → BaseAgent processes steps in loop
      → finalizeAgentRun() → ExecuteAgentResult
        → AgentRunner.ProcessAgentArtifacts() creates artifact
```

**Where the bland name is set:**  
- `AgentRunner.ts:634` — `artifact.Name = \`${agentName} Payload - ${new Date().toLocaleString()}\``  
- `TaskOrchestrator.ts:706` — `artifact.Name = \`${agent.Name} - ${taskName} - ${new Date().toLocaleString()}\``

**Existing smart-name fallback (partially working):**  
- `MJArtifactVersionEntityServer.Save()` runs ArtifactType extract rules and can set a `name` standard property  
- `AgentRunner.ts:680-701` checks `version.Attributes` for a `name` standard property after save  
- **But:** the base JSON artifact type (`AE674C7E-...`) has **no extract rules**, so nothing gets extracted for most agents

## Design Constraints

1. **No extra LLM call** — the agent is already generating a response; piggyback on that
2. **Multi-artifact awareness** — don't bake in a single-artifact-per-run assumption on `ExecuteAgentResult`
3. **Other active workstreams** touch `BaseAgentNextStep`, `ExecuteAgentResult`, and the prompt template — coordinate carefully
4. **Backward compatible** — agents that don't set the name should still work (fall back to current behavior)

## Proposed Design

### Core Idea

Add an optional `artifactName` field to `LoopAgentResponse`. The LLM already knows what it's building — asking it to name the artifact costs ~5-20 extra tokens per completion, zero extra API calls.

### Where `artifactName` Should NOT Live

**Not on `ExecuteAgentResult`** — This is the wrong place because:
- It couples the result type to a single-artifact assumption
- `ExecuteAgentResult` is a public API consumed by many callers (conversation service, task orchestrator, tests)
- If we ever support multiple artifacts per run, we'd have to break this API

### Where `artifactName` SHOULD Live

**Option A (Recommended): Dedicated field on `LoopAgentResponse` → threaded to `ProcessAgentArtifacts` via the agent run**

The name flows through the existing step chain but is consumed internally by the artifact creation code — it never becomes part of the public `ExecuteAgentResult` contract.

```
LoopAgentResponse.artifactName
  → BaseAgentNextStep.artifactName
    → stored on MJAIAgentRunEntityExtended (transient property or persisted field)
      → read by ProcessAgentArtifacts() when creating the artifact
```

**Option B: Extract rules on the base JSON artifact type**

Add extract rules to the JSON artifact type that look for a well-known key (`_artifactName`) in the payload content. The agent would set this via `payloadChangeRequest` rather than a dedicated response field.

Pros: No type changes needed. Works with existing extract rule infrastructure.  
Cons: Pollutes the payload with metadata. The `_artifactName` field would be serialized into the artifact content. Agents need to remember to set it in the payload, not in the response.

**Option C: Hybrid — response field + extract rules as fallback**

Use Option A as primary, with Option B as a fallback for agents that put naming hints in their payload structure.

### Recommended: Option A

The cleanest separation. The artifact name is metadata *about* the artifact, not part of the artifact's content. It belongs in the control plane (response fields) not the data plane (payload).

## Implementation Steps

### Step 1: Add `artifactName` to `LoopAgentResponse`

**File:** `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts`

```typescript
export interface LoopAgentResponse<P = any> {
    // ... existing fields ...

    /**
     * Human-readable name for the artifact generated from this agent's payload.
     * Set this on the final turn (taskComplete=true) to give the artifact a
     * descriptive name instead of the default "AgentName Payload - timestamp".
     * Example: "Q3 Revenue Analysis" or "Customer Churn Dashboard"
     * @since X.Y.0
     */
    artifactName?: string;
}
```

### Step 2: Add `artifactName` to `BaseAgentNextStep`

**File:** `packages/AI/CorePlus/src/agent-types.ts`

```typescript
export type BaseAgentNextStep<P = any, TContext = any> = {
    // ... existing fields ...

    /**
     * Human-readable name for the artifact created from the agent's payload.
     * Populated from the agent type's response (e.g., LoopAgentResponse.artifactName).
     * Used by ProcessAgentArtifacts to set a meaningful artifact name.
     * @since X.Y.0
     */
    artifactName?: string;
}
```

### Step 3: Thread through `LoopAgentType.DetermineNextStep()`

**File:** `packages/AI/Agents/src/agent-types/loop-agent-type.ts`

Pass `artifactName` through in all code paths that create `BaseAgentNextStep` from `LoopAgentResponse`:

- `createSuccessStep()` call (~line 132): add `artifactName: response.artifactName`
- `retVal` object (~line 150): add `artifactName: response.artifactName`
- The `Chat` step (~line 113): add `artifactName: response.artifactName`

This is ~3 one-line additions.

### Step 4: Store on the agent run in `finalizeAgentRun()`

**File:** `packages/AI/Agents/src/base-agent.ts` (~line 8494)

Two sub-options:

**4a: Transient property on `MJAIAgentRunEntityExtended`**  
Add a non-persisted property that carries the name to `ProcessAgentArtifacts`:

```typescript
// In finalizeAgentRun, after setting other agentRun fields:
(this._agentRun as any)._artifactName = finalStep.artifactName;
```

Pros: No schema changes. Fast.  
Cons: Uses `as any`, not strongly typed.

**4b: New database column on `AIAgentRun`**  
Add `ArtifactName nvarchar(255) NULL` to the `AIAgentRun` table.

Pros: Persisted, queryable, strongly typed after CodeGen.  
Cons: Migration required, CodeGen dependency, heavier change.

**4c (Recommended): Add to `ExecuteAgentResult` as internal-use metadata**  
Actually, the simplest threading is to add it to `ExecuteAgentResult` but scoped properly. Rather than a top-level `artifactName`, use a structured metadata object that can grow:

```typescript
export type ExecuteAgentResult<P = any> = {
    // ... existing fields ...

    /**
     * Metadata hints for artifact creation. Consumed by ProcessAgentArtifacts,
     * not intended for external callers.
     * @since X.Y.0
     */
    artifactHints?: {
        /** Descriptive name for the primary artifact */
        name?: string;
        /** Optional description override */
        description?: string;
    };
}
```

This is extensible (can add more hints later without breaking the type), signals that it's for artifact creation (not general-purpose), and avoids the single-name-string concern because the `artifactHints` object can be extended to support multi-artifact scenarios later (e.g., `artifactHints?: { name?, description? } | Array<{ name?, description?, payloadPath? }>`).

Then in `finalizeAgentRun()`:

```typescript
return {
    success: ...,
    payload: resolvedPayload,
    agentRun: this._agentRun!,
    // ... existing fields ...
    artifactHints: finalStep.artifactName ? { name: finalStep.artifactName } : undefined,
};
```

### Step 5: Consume in `ProcessAgentArtifacts()`

**File:** `packages/AI/Agents/src/AgentRunner.ts` (~line 634)

```typescript
const agentName = agent?.Name || 'Agent';
// Use agent-provided name if available, fall back to default
artifact.Name = agentResult.artifactHints?.name 
    || `${agentName} Payload - ${new Date().toLocaleString()}`;
artifact.Description = agentResult.artifactHints?.description 
    || `Payload returned by ${agentName}`;
```

The extract-rules system (via `MJArtifactVersionEntityServer.Save()`) can still override this if the ArtifactType has more specific rules. The priority chain becomes:

1. **ArtifactType extract rules** (highest — type-specific, runs in `MJArtifactVersionEntityServer.Save()`)
2. **`artifactHints.name` from agent response** (new — agent-provided)
3. **Default timestamp name** (lowest — current fallback)

The existing code at lines 680-701 that reads `version.Attributes` after save already handles priority #1. We just need to make sure it overrides the agent-provided name (which it already will, since it runs after artifact creation).

### Step 6: Same change in `TaskOrchestrator`

**File:** `packages/MJServer/src/services/TaskOrchestrator.ts` (~line 706)

The `createArtifactFromOutput` method doesn't receive `ExecuteAgentResult` directly. It would need the agent result's `artifactHints` passed through. Check the call site to determine how to thread this.

### Step 7: Update system prompt template

**File:** `metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md`

Add `artifactName` to the `LoopAgentResponse` interface definition:

```typescript
interface LoopAgentResponse {
    // ... existing fields ...
    /** Short, descriptive name for the artifact you produce (set on final turn).
     *  Example: "Q3 Revenue by Region" instead of generic "Agent Payload - date" */
    artifactName?: string;
}
```

Add guidance in the Key Rules section:

```markdown
- `artifactName`: On your final turn (taskComplete=true), set this to a short, descriptive
  name for your output (e.g., "Q3 Revenue Analysis", "Top 10 Customers by LTV"). 
  Do NOT include the agent name, date, or generic words like "Payload" or "Report" — 
  focus on what the content actually is.
```

**Important:** After editing the template, run `npx mj sync push --dir=metadata --include="prompts"` to update the database.

### Step 8: Update generated-for-prompt file (if applicable)

If the `LoopAgentResponse` interface in the prompt template is auto-generated from the TypeScript type, the generation script needs to be re-run. If it's manually maintained in the template (as it appears to be), Step 7 covers it.

## Open Question: Multiple Output Artifacts Per Run

Today `ProcessAgentArtifacts` creates **one artifact per agent run** from the final payload. But several scenarios could produce multiple artifacts:

1. **Orchestrator/conductor agents** that run multiple sub-agents, each producing a distinct artifact (e.g., a research report + a dashboard)
2. **Task orchestrator** which already creates one artifact per task output via `createArtifactFromOutput()`
3. **Future composite agents** that intentionally produce a set of related artifacts (e.g., a SQL query + a visualization + a summary)

### How this plan interacts with multi-artifact

The `artifactName` field on `LoopAgentResponse` names the **primary artifact** — the one created from `agentResult.payload`. This covers the common case (single artifact) well.

For multi-artifact scenarios, the naming problem is different:
- **Sub-agent artifacts** — each sub-agent run already creates its own artifact. If the sub-agent sets `artifactName` in its own `LoopAgentResponse`, it names its own artifact independently. This **already works** with this plan since each sub-agent has its own execution cycle.
- **Task orchestrator artifacts** — `createArtifactFromOutput()` creates per-task artifacts. The task name is already part of the default name. Extending this to use `artifactHints` from the task's agent result would give each task artifact a good name.
- **Single agent, multiple artifacts** — this doesn't exist today and would require `ProcessAgentArtifacts` to be redesigned. Not in scope, but the `artifactHints` type should not block it.

### Recommended `artifactHints` shape (extensible for multi-artifact)

```typescript
// Phase 1 (this plan): single primary artifact
artifactHints?: {
    name?: string;
    description?: string;
}

// Phase 2 (future, if needed): per-artifact naming when a single run
// emits multiple artifacts (e.g., via a new multi-artifact creation path)
artifactHints?: {
    name?: string;           // Default/primary artifact name
    description?: string;
    additionalArtifacts?: Array<{
        payloadPath: string;   // JSONPath into payload for this artifact's content
        name: string;
        description?: string;
        artifactTypeId?: string;
    }>;
}
```

**Decision needed from team:** Do we anticipate single-agent-multi-artifact in the near term? If yes, we should design `artifactHints` as an array from day one. If no (sub-agents handle the multi-artifact case naturally), the simple `{ name, description }` object is cleaner and sufficient.

## Testing

1. **Unit test in AgentRunner**: Mock an `ExecuteAgentResult` with `artifactHints.name` set → verify artifact gets that name
2. **Unit test fallback**: `artifactHints` is undefined → verify default timestamp name is used  
3. **Unit test extract-rule override**: Even when `artifactHints.name` is set, if extract rules produce a name, verify the extract-rule name wins
4. **Integration**: Run an agent end-to-end, verify the artifact shows a descriptive name in the conversation UI

## Files Changed (Summary)

| File | Change |
|------|--------|
| `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts` | Add `artifactName?: string` |
| `packages/AI/CorePlus/src/agent-types.ts` | Add `artifactName?: string` to `BaseAgentNextStep`, add `artifactHints?` to `ExecuteAgentResult` |
| `packages/AI/Agents/src/agent-types/loop-agent-type.ts` | Thread `artifactName` in ~3 places |
| `packages/AI/Agents/src/base-agent.ts` | Map `finalStep.artifactName` → `artifactHints` in `finalizeAgentRun()` |
| `packages/AI/Agents/src/AgentRunner.ts` | Use `artifactHints.name` when creating artifact (~line 634) |
| `packages/MJServer/src/services/TaskOrchestrator.ts` | Same pattern for `createArtifactFromOutput()` |
| `metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md` | Document `artifactName` field and usage guidance |

## Coordination Notes

- **Active workstreams touching these files**: Check for in-flight PRs modifying `BaseAgentNextStep`, `ExecuteAgentResult`, or the system prompt template before starting
- **No migration required** if using Option 4c (transient `artifactHints` on result type)
- **Prompt sync required** after template changes: `npx mj sync push --dir=metadata --include="prompts"`
- **No CodeGen dependency** — all changes are in hand-written TypeScript and prompt templates

## Estimated Effort

Small change — ~50-80 lines of code across 7 files. The heaviest part is updating the system prompt template with clear guidance so agents actually use the field well.
