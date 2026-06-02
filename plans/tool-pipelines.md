> **⚠️ SUPERSEDED.** This was the original string-stream (Unix-pipe) design. It has been
> replaced by the PowerShell-style **object/value** model in
> [`agent-pipelines-design.md`](agent-pipelines-design.md) — values flow as structured JSON,
> stages are object-aware operators (`where`/`select`/`sort`/…), capabilities chain via `pipeInto`,
> and `map`/`let` add batch + binding power. Kept for history. The implementation in
> `packages/AI/Agents/src/pipeline/` follows the new design.

# Plan: Tool Pipelines (`|`)

**Goal:** let the agent chain tool invocations server-side so intermediate transforms (slice / filter / shape) never enter the context window. Only the pipeline's final output is returned to the model.

**Motivation (Caeleb):** Tools that produce large payloads (artifact reads, RunView dumps, query results) blow context even when the agent only wants the last 50 lines or a single field. Today the agent has to (a) eat the full payload, then (b) emit a second tool call to slice it. With pipelines, both happen server-side in one turn.

## The core decision: a uniform invocable-tool contract

The agent can already invoke two *kinds* of things, and today they live in two completely separate dispatch paths in `base-agent.ts` with nothing in common at the type level:

| | Artifact-tool world | Action world |
|---|---|---|
| Call shape | `ArtifactToolCall { artifactId, tool, input }` | action name + `Params[]` |
| Dispatch | `ArtifactToolManager.ExecuteSingleToolCall()` | `ExecuteSingleAction()` |
| Result | `StoredToolResult { result: { success, data, errorMessage } }` | `ActionResult { Success, Result, Message, Params, LogEntry }` |
| Logging | in-memory `StoredToolResult[]` + run snapshot | `ActionExecutionLog` (DB) |

This divergence is the real architectural debt, and a pipeline is exactly what exposes it. The wrong move is to pick one side (Action-only — amputates artifact reads) or to bridge them with adapters smeared through the executor + a discriminated-union step schema (the smell of a missing abstraction made permanent). The right move is to **introduce the missing abstraction and compose the pipeline over it.**

### `PipelineInvocable`

Within a pipeline, everything is a string stream — the bash model. This is lossy *by design*: structure-preserving calls simply don't get pipelined, they're called normally. The contract:

```ts
interface PipelineInvocable {
  invoke(pipedInput: string | null, params: Record<string, unknown>): Promise<PipelineStepResult>;
}

interface PipelineStepResult {
  output: string;          // becomes the next step's pipedInput
  success: boolean;
  error?: string;
  logRef: PipelineStepLogRef; // polymorphic pointer to the underlying log row
}
```

### Three providers (one boundary adapter each — never in the executor)

- **ActionProvider** — wraps any catalog Action. Serializes its `ActionResult` output to a string. Logs to `ActionExecutionLog`; `logRef` carries that row's ID.
- **ArtifactToolProvider** — wraps an artifact-tool call. Reads `params.artifactId` so the call shape normalizes to `{ tool, params }`. Serializes `ArtifactToolResult.data` to a string. Logs to the artifact-tool result store; `logRef` carries that reference.
- **TransformProvider** — built-in pure operators (Tail / Head / Grep / JSONPath / Slice). **Not Actions** — they are side-effect-free utilities, and MJ's own Actions philosophy says Actions are integration boundaries, not utilities. They surface *only* inside the pipeline tool's schema, never in the top-level tool list (you would never call `grep` standalone with no input).

The **executor is substrate-agnostic**: resolve each step name against a unified registry → `invoke()` with the prior step's output → thread → return the final step's output. It knows only the contract. No union schema, no per-substrate branching in the executor.

## LLM surface: one `pipeline` tool, one uniform step shape

Don't teach existing tool-call JSON about pipes (LLMs are inconsistent at that). One new tool, flat `steps[]`, and **every step is `{ tool, params }`** regardless of which provider owns the tool — a unified registry resolves it. The LLM never has to know whether `get_full` is an artifact tool or `Run View` is an Action.

```json
{
  "tool": "pipeline",
  "args": {
    "steps": [
      { "tool": "Run View",  "params": { "EntityName": "Tax Returns", "ExtraFilter": "..." } },
      { "tool": "JSONPath",  "params": { "Path": "$.Results[*].Status" } },
      { "tool": "Grep",      "params": { "Pattern": "Rejected" } }
    ]
  }
}
```

- The prior step's `output` is threaded into the next step's `invoke(pipedInput, ...)` — stdin-style.
- Only the final step's `output` is returned to the agent. (See "Intermediate sharing" for why this is always the v1 rule and what the escape hatch is.)
- First step must be a **source** (a step that does not require piped input — i.e. an Action or artifact tool, not a transform). Steps 2..N may be any invocable. Validated at runtime with a clear error so the agent self-corrects on retry.

### Transforms (built-in operators)

- **Tail** — last N lines
- **Head** — first N lines/bytes
- **Grep** — regex filter (line mode)
- **JSONPath** — extract subtree via JSONPath
- **Slice** — array slice

Punt: Map, Reduce, Sort — not needed for the motivating cases.

## Answers to the open questions from the PR thread

- **Applies to actions *and* tools? (AN-BC Q1)** Yes — both, via the `PipelineInvocable` contract. Neither is amputated; neither is special-cased in the executor.
- **Complexity cap? (AN-BC Q2)** 1–5 steps for v1. A 1-step pipeline is permitted (harmless; just runs the source) rather than rejected — rejecting it wastes a turn forcing a retry. >5 is a validation error. Sequential only; no branching/fan-out.
- **How much intermediate goes to the LLM? (AN-BC Q3)** Only the final output, always, in v1 — that is the entire point of the feature. The escape hatch is intrinsic: when the agent genuinely needs to *see* an intermediate, it calls that tool normally (outside a pipeline) instead. Every intermediate is still fully inspectable by a human via the pipeline-run log. Revisit per-step "surface this one" opt-in only if agent evals show a real need.
- **Flat vs. recursive? (Caeleb/MS-BC)** Flat `steps[]`. Settled.
- **Where does pipe-ability live? (MS-BC)** Nowhere on the `Action` schema. No `Action.Kind` column, no `AcceptsPipedInput` flag. Whether a tool can start a pipeline vs. accept piped input is a property of its *provider*, not catalog metadata. This is why there is no Action-schema migration at all.

## Logging: a first-class pipeline run

Two new entities (`MJ:` prefix), **not** nullable columns bolted onto `ActionExecutionLog` (which couldn't represent artifact-tool steps anyway):

- **`MJ: Pipeline Runs`** — one row per pipeline invocation. Holds the originating agent run, total steps, total bytes streamed, total duration, success, and "context bytes saved" (sum of intermediate output sizes that never hit the LLM).
- **`MJ: Pipeline Run Steps`** — one row per step: index, provider kind (`Action` / `ArtifactTool` / `Transform`), tool name, input size, output size, duration, success, and a polymorphic `logRef` (e.g. nullable `ActionExecutionLogID` for action steps; inline preview for transform/artifact steps).

This gives AN-BC's grouped, cross-substrate debug view in MJ Explorer from one correlation record.

## Scope boundary (a quality decision, not an effort one)

v1 builds the pipeline on the `PipelineInvocable` contract and ships the three providers. It does **not** also rewrite the existing non-pipeline dispatch paths in `base-agent.ts` to route through the contract. Reason: that is a separate change with its own review surface and risk profile; conflating "introduce pipelines" with "rewrite all tool dispatch" makes both un-reviewable. The contract is designed so that migration is a clean additive follow-up, not a rewrite.

## Implementation sketch

### Files

- **New package/dir:** `packages/AI/Agents/src/pipeline/` (the executor lives where both action execution and `ArtifactToolManager` are already reachable):
  - `pipeline-invocable.ts` — the `PipelineInvocable` / `PipelineStepResult` contract + a `PipelineToolRegistry`.
  - `pipeline-executor.ts` — substrate-agnostic step threading.
  - `providers/{action-provider,artifact-tool-provider,transform-provider}.ts`.
  - `transforms/{tail,head,grep,jsonpath,slice}.ts` — pure functions (`(input: string, params) => string`), trivially unit-testable.
- **Modify:** `packages/AI/Agents/src/base-agent.ts` — recognize a `pipeline` step in the agent response, hand it to the executor, return only the final output to the LLM; write the pipeline-run + step rows.
- **Modify:** agent prompt assembly — register `pipeline` as a tool only when at least one transform is available (always true once shipped), with a one-paragraph usage hint + the single example above and the unified pipeline-tool list.
- **Migration:** create `MJ: Pipeline Runs` + `MJ: Pipeline Run Steps` tables + CodeGen. No change to `Action` or `ActionExecutionLog` schema.

### Type passing

`pipedInput` is always a string. Transforms that operate on JSON parse it themselves and surface parse errors. Keeps the contract dumb and predictable; matches the bash mental model the agent already has.

### Errors

Pipeline fails fast. Return to the agent (never the piped input itself — that defeats the purpose; the full preview is in the pipeline-run log for a human to inspect):

```
Pipeline failed at step 2 (JSONPath).
Piped input size: 142KB
Error: <step error message>
```

## Out of scope (call out)

- Branching / fan-out.
- Reusing prior tool outputs across turns (this is a single-turn primitive).
- Streaming between steps (sequential, fully-materialized for v1 — revisit if a step ever exceeds memory).
- Migrating the existing non-pipeline tool dispatch onto `PipelineInvocable` (clean additive follow-up).

## Test plan

- **Unit:** each transform (line mode, byte mode, JSON mode, empty input, malformed JSON).
- **Unit:** each provider's serialize-to-string + pipedInput-injection adapter in isolation.
- **Unit:** executor with 3 steps where step 2 fails; transform-as-step-1 (reject); >5 steps (reject); 1-step (allowed).
- **Integration:** real `Run View` → `JSONPath` → `Grep` and real artifact read → `Tail` → `Grep`, asserting only the final output returns and one `MJ: Pipeline Runs` row + N `MJ: Pipeline Run Steps` rows exist with correct sizes.
- **Agent eval:** one scenario where a large payload would have blown context; assert context stays under budget and the answer is correct.

## Risk / review notes

- The `PipelineInvocable` contract is the load-bearing abstraction — get its shape right before building providers. It must stay string-in/string-out so the executor never learns about substrates.
- Unified registry namespacing: action names, artifact tool names, and transform names share one namespace inside `pipeline`. Collisions must be detected at registration with a clear error.
- Don't re-implement what tools already do — if a source action takes a `MaxRows` param, the agent should still use it. Pipeline is for cases where the data shape isn't knowable up front.
- LLM might try a transform as step 1 or a degenerate single step. Validate with clear errors so the agent self-corrects on retry.
