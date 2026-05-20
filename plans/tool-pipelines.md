# Plan: Tool Pipelines (`|`)

**Goal:** let the agent chain tools so intermediate transforms (slice / filter / shape) never enter the context window. Only the pipeline's final output is returned to the model.

**Motivation (Caeleb):** Tools that produce large payloads (artifact reads, RunView dumps, query results) blow context even when the agent only wants the last 50 lines or a single field. Today the agent has to (a) eat the full payload, then (b) emit a second tool call to slice it. With pipelines, both happen server-side in one turn.

## Surface area

### 1. LLM-side: new `pipeline` tool primitive

Don't try to teach existing tool-call JSON about pipes (LLMs are inconsistent at that). Introduce one new tool:

```json
{
  "tool": "pipeline",
  "args": {
    "steps": [
      { "tool": "Get Artifact Content", "params": { "ArtifactID": "..." } },
      { "tool": "Tail", "params": { "Lines": 50 } },
      { "tool": "Grep", "params": { "Pattern": "ERROR" } }
    ]
  }
}
```

- Each step's output is passed as `_pipedInput` into the next step's params (stdin-style).
- Only the final step's output is returned to the agent.
- Intermediate outputs are persisted to `ActionExecutionLog` (with size, duration, truncated preview) so we keep cost/debug visibility — but they do not go back through the LLM.

### 2. Action contract: two kinds

Two action subkinds, on `Action` entity (or `Category` — bikeshed):

| Kind      | Input                  | Output      | Examples                                         |
|-----------|------------------------|-------------|--------------------------------------------------|
| Source    | params only            | string/JSON | Get Artifact Content, Run View, existing actions |
| Transform | params + `_pipedInput` | string/JSON | Tail, Head, Grep, JSONPath, Slice, Extract       |

- Sources work in pipelines as the first step.
- Transforms can appear at any non-first step (validation error otherwise).
- Existing tools are Sources by default — no migration churn.

### 3. New transform actions

Built-ins, in package `@memberjunction/core-actions`:

- **Tail** — last N lines
- **Head** — first N lines/bytes
- **Grep** — regex filter (line mode)
- **JSONPath** — extract subtree via JSONPath
- **Slice** — array slice

Punt: Map, Reduce, Sort — not needed for Caeleb's case.

## Implementation

### Files

- **New:** `packages/Actions/CoreActions/src/custom/pipeline.action.ts` — the meta-tool. Iterates steps, accumulates `ActionExecutionLog` rows under one parent `PipelineRunID`.
- **New:** `packages/Actions/CoreActions/src/custom/transforms/{tail,head,grep,jsonpath,slice}.action.ts`
- **Modify:** `packages/Actions/Engine/src/BaseAction.ts` — add optional `PipedInput` field to `RunActionParams`. Default `undefined`. Transforms read it; sources ignore it.
- **Modify:** Action entity — add `Kind` column (`'Source' | 'Transform'`), default `'Source'`. Migration + CodeGen.
- **Modify:** agent prompt assembly (`packages/AI/Agents/...`) — register `pipeline` as a tool when any Transform-kind actions are available; include a one-paragraph usage hint with one example.

### ActionExecutionLog

Add nullable `PipelineRunID UNIQUEIDENTIFIER` + `PipelineStepIndex INT`. Lets us:

- Group intermediate logs in the UI
- Compute "context tokens saved" (sum of intermediate sizes that never hit the LLM)
- Keep individual step previews for debugging

### Errors

Pipeline fails fast. Return to the agent:

```
Pipeline failed at step 2 (Tail).
Piped input size: 142KB
Error: <step error message>
```

Don't return the piped input itself (defeats the purpose). Step preview is in `ActionExecutionLog` for the user to inspect in MJ Explorer.

### Type passing

`_pipedInput` is always string. Transforms that operate on JSON parse it themselves (and surface parse errors). Keeps the contract dumb and predictable; matches the bash mental model the agent already has.

## Out of scope (call out)

- Branching / fan-out
- Reusing prior tool outputs across turns (this is a single-turn primitive)
- Streaming between steps (sequential, fully-materialized for v1 — revisit if a step ever exceeds memory)

## Test plan

- **Unit:** each transform (line mode, byte mode, JSON mode, empty input, malformed JSON).
- **Unit:** pipeline with 3 steps where step 2 fails; pipeline with a transform as step 1 (should reject).
- **Integration:** real `Get Artifact Content` → `Tail` → `Grep` against a fixture artifact, assert only final output is returned and intermediate logs exist with shared `PipelineRunID`.
- **Agent eval:** one scenario where a large artifact would have blown context; assert context stays under budget and answer is correct.

## Risk / review notes

- `PipedInput` on `RunActionParams` is a cutting change — every action subclass inherits it, but sources ignore it. Should be invisible to existing actions.
- `Action.Kind` migration is Publish-Then-No-Breaking-Changes compliant.
- LLM might try `pipeline` with one step (degenerate) or wrap a transform as step 1. Validate both at runtime with a clear error so the agent self-corrects on retry.
- Don't re-implement what tools already do — if a Source action takes a `MaxRows` param, the agent should still use it. Pipeline is for cases where the data shape isn't knowable up front.
