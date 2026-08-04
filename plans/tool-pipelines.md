# Agent Pipelines

**Status:** implemented. This is the as-built plan for the `pipeline` primitive shipped in this PR.

> **History.** The PR opened with a Unix-pipe / string-stream design — tools chained as byte streams,
> sliced by `Tail`/`Head`/`Grep`/`JSONPath`/`Slice`. During implementation we reversed that call in
> favour of a **PowerShell-style object/value model**: stages pass structured JSON and bind to
> *properties* instead of re-parsing text. The reasons and the final shape are below; the old
> string-stream framing is gone. The LLM-facing tool is still named `pipeline`.

## The primitive

> An agent authors a small **dataflow program** over MJ's capabilities (Actions, artifact tools) and
> data; the server executes it; only the final value returns to the LLM. Intermediate values never
> enter the context window.

This moves the agent from **interpreter** (one op per turn, a context tax on every intermediate) to
**compiler** (emit a dataflow, get the answer). Batch work, multi-action orchestration, and
structured-data wrangling collapse into a single zero-intermediate-context turn.

**Why objects, not bytes.** Unix pipes are byte streams — every stage re-parses text, so you hit
escaped-newline grep no-ops and "stringify then JSONPath to re-extract." Agents chain capabilities
that *already* return structured results (RunView → records, API → objects), so the object model is
the natural fit. We adopt PowerShell's hybrid: objects are primary; text operators coerce at the
boundary when text is genuinely the point.

## Core model

### Value contract
The pipe carries a **JSON value** — `PipeValue = null | boolean | number | string | array | object`,
defined in [`pipeline.types.ts`](../packages/AI/Agents/src/pipeline/pipeline.types.ts). Nothing is
stringified until (a) the final result returns to the LLM, or (b) an action param needs text. That
single decision dissolves the byte-model friction.

(Future: a `Ref` value type — a server-held handle to a large/binary blob — so a 50MB document can
flow between stages without materializing. Not built; v1 holds values in memory.)

### Stage regularity (the LLM-facing surface)
A pipeline is a flat `steps[]`. **Every stage is an object with exactly one verb key** + its args —
jq/PowerShell-regular, so the LLM picks one verb per stage and never learns a bespoke shape. The
agent requests a pipeline as a `nextStep.type: "Pipeline"` with `nextStep.pipeline`
([`AgentPipelineRequest`](../packages/AI/CorePlus/src/agent-types.ts)) — dispatched through the same
singular `nextStep.type` as `Actions`/`Sub-Agent`/`ForEach`/etc., so it's structurally mutually
exclusive with them (the LLM cannot emit a pipeline *and* another step and have one silently dropped):

```json
{ "nextStep": { "type": "Pipeline", "pipeline": { "steps": [
  { "tool":  "Run View", "with": { "EntityName": "Invoices", "ExtraFilter": "Status='Open'" } },
  { "where": "Balance > 0 and DueDate < today" },
  { "select": ["ID", "CustomerEmail", "Balance"] },
  { "sort":  "-Balance" },
  { "first": 10 },
  { "map": { "as": "row", "do": [
      { "tool": "Send Email",
        "with": { "To": "{{row.CustomerEmail}}", "Subject": "Overdue invoice" },
        "pipeInto": "Body" }
  ]}}
] } } }
```

Like client tools, a pipeline is a yield/await step: it pre-empts `taskComplete` (runs inline, injects
its final value, forces one more turn so the LLM can use the result). The response validator accepts
`"Pipeline"` as a step type; gated by the `includePipelineDocs` / `includeResponseTypeDefinition.pipeline`
prompt params (default **true**) — both off ⇒ the type and its docs are never injected.

Only the final value returns to the LLM. The 500-row RunView dump, the filtered set, the per-row
email bodies — none touch context.

### One field-path grammar everywhere (safe, no eval)
A single path grammar — `Status`, `Customer.Email`, `Results[0].Name`, `Items[*].SKU` — is reused by
**`where` predicates, `select`, `sort` keys, and `{{...}}` templating**
([`path.ts`](../packages/AI/Agents/src/pipeline/path.ts) over the eval-free JSONPath subset in
[`jsonpath-eval.ts`](../packages/AI/Agents/src/pipeline/jsonpath-eval.ts)). Paths are parsed, never
`eval`'d. JSONPath filter/script expressions (`[?(...)]`) are explicitly rejected. This is the
security spine: LLM-authored paths/predicates can never execute arbitrary code.

## Stage catalog

### Capabilities — `tool`
Invoke any Action or artifact tool the agent has. ([`providers/`](../packages/AI/Agents/src/pipeline/providers/))
- `with`: the tool's input params (literals, or `{{path}}` templates resolved against upstream/bindings).
- `pipeInto`: name of the param that receives the **whole upstream value** (stdin-style). Omit → the
  stage ignores upstream (a pure *source*, e.g. the first stage).
- Emits the tool's result as a **structured value** — `serialize.ts` does NOT stringify: it unwraps a
  single output param to its value, multiple to an object keyed by name, and an artifact `get_full`
  envelope to its content. String coercion is conservative: a string is parsed as JSON only when it
  *unambiguously* opens and closes as a container (`{…}`/`[…]`) and parses to an object/array —
  prose like `[Note: …]` or a bare scalar (`"42"`) is left as a string.

### Operators (pure, object-aware — PowerShell cmdlets)
Code-defined verbs in [`operators.ts`](../packages/AI/Agents/src/pipeline/operators.ts) (not registry
tools — applied directly by the executor):

| Verb | Meaning |
|---|---|
| `where` | filter array elements by a predicate over the field grammar |
| `select` | project field(s); one field → array of scalars, many → array of objects |
| `sort` | sort array by field(s); `-Field` = descending |
| `first` / `last` | take first/last N of an array |
| `count` | size of the value (array length / object keys / string length) |
| `distinct` | dedupe array (optionally by a field) |
| `flatten` | flatten a nested array one level |
| `jsonpath` | deep extract via the path grammar (escape hatch for nested shapes) |

### Text operators (coerce-to-text)
For genuinely textual values (web pages, documents, logs):

| Verb | Meaning |
|---|---|
| `lines` | split a string into an array of lines (so object operators apply) |
| `grep` | keep matching lines (string) or elements (array) by regex; `{pattern, ignoreCase?, invert?}` or a bare pattern |
| `head` / `tail` | first/last N **lines of a string** (text only — reject arrays; use `first`/`last` for array elements) |

### The `where` predicate language
[`predicate.ts`](../packages/AI/Agents/src/pipeline/predicate.ts) — a hand-written recursive-descent
parser (never `eval`). Operators: `== != < > <= >= contains startsWith endsWith matches in`, combined
with `and` / `or` / `not` and parentheses. Values: strings, numbers, `true`/`false`/`null`, `[lists]`
for `in`, and the literals `today` / `now`. `matches` compiles a user regex behind a **ReDoS guard**
(`safe-regex` star-height check + a 200-char pattern cap; an unsafe pattern like `(a+)+$` is rejected
with a clear, agent-facing message rather than hanging the event loop); the rest are plain comparisons.

### The multiplier — `map`
`{ "map": { "as": "row", "do": [ ...sub-stages... ] } }` runs the sub-pipeline **once per element** of
the upstream array, binds the element to `row` (`{{row.field}}` in sub-stages), and collects the
per-element final values into an array. This is the single biggest power-up: **batch operations with
zero per-element context** — "for each of 300 overdue customers, generate and email a statement"
becomes one turn. Guards: element cap, bounded concurrency, and a `continueOnError` fail-policy (see
Safety).

### Bindings — `let`
`{ "let": { "name": "customers", "value": [ ...sub-stages... ] } }` runs a sub-pipeline, binds its
result to a name for later `{{customers}}` use, and passes the main stream through unchanged. Enables
joins / correlation (fetch set A, fetch set B, relate them). **Shipped** (the original plan deferred
this to a later tier; it came in with the core because the field-path/templating machinery is shared).

## LLM ergonomics

Power without usability is useless. The deliberate choices for the model:
1. **Regular schema** — one verb per stage, one path grammar everywhere.
2. **Self-correction errors** — when a stage filters a non-empty array down to empty (usually a wrong
   field name or value casing), the executor attaches a diagnostic listing the *field values actually
   present* (`describeEmptyMatch` in [`coerce.ts`](../packages/AI/Agents/src/pipeline/coerce.ts)) so the
   agent can fix the next turn from the message alone — the data isn't in its context.
3. **Automatic shape hint** — the final value is prefixed with a one-line shape tag
   (`[array: 50 item(s), fields: ID, Name, Status]`) so the agent knows what it got without the full
   payload. (A standalone `describe` stage was considered and dropped in favour of this.)
4. **Worked examples** in the system prompt — `BuildPipelineToolDocs`
   ([`pipeline-docs.ts`](../packages/AI/Agents/src/pipeline/pipeline-docs.ts)) injects the value model,
   the verb catalog, the path grammar, the live source list, and two canonical pipelines
   (filter+select, map-batch) into `_PIPELINE_TOOLS`.
5. **No silent truncation** — the final value is capped at 8000 chars for return; if truncated, the
   message says so and tells the agent to narrow with `select`/`first`/`count`.

## Execution & safety

[`pipeline-executor.ts`](../packages/AI/Agents/src/pipeline/pipeline-executor.ts):
- **Fail-fast** with a clear, input-free error (never echoes the piped value): which stage, the
  upstream value size, and the underlying error.
- **Caps**: `MAX_PIPELINE_STAGES = 20`, `MAX_MAP_ELEMENTS = 1000`, `MAP_CONCURRENCY = 8` (map runs in
  bounded-concurrency batches), `FINAL_OUTPUT_LIMIT = 8000` chars on return.
- **Wall-clock budget**: `DEFAULT_PIPELINE_DEADLINE_MS = 120_000`, plus an optional `AbortSignal`
  (`PipelineExecutorOptions`). Both are checked between every stage and before each `map` batch, so a
  long map or a chain of slow Actions can't run unbounded — a breach becomes a clean failed result
  (never an uncaught throw). NOTE: this bounds wall-clock *between* stage invocations; interrupting a
  single in-flight Action mid-call needs Action-level cancellation (a follow-up once the Action layer
  accepts a signal).
- **map fail-policy**: per-element failures collect into a summary; `continueOnError: false` makes the
  whole map fail-fast on the first bad element.
- **map memory**: per-element final values are buffered into one array before returning (known
  limitation at `MAX_MAP_ELEMENTS` × large outputs — keep each element's last stage small; a
  streaming/chunked map is a v2 candidate).
- **Determinism**: pure operators are deterministic; `tool` stages log to `ActionExecutionLog` as today.
- **`ContextBytesSaved`**: bytes produced *anywhere* in the tree (top-level + every map/let sub-stage)
  minus the single final value returned — i.e. what the LLM never had to read.
- **dryRun for effectful `map`** (simulate effects, return what *would* happen) — not built; v1 relies
  on the element cap + per-step logging.

### Resolution & namespacing
A per-execution [`PipelineToolRegistry`](../packages/AI/Agents/src/pipeline/pipeline-registry.ts) maps
tool names (case-insensitive) to a `PipelineInvocable`. Built fresh each run by `buildPipelineRegistry`
in `base-agent.ts` from the agent's effective Actions + the run's artifact tools. Operators are
code verbs, not registry entries, so their names are reserved; a capability whose name collides with
another is **skipped for pipeline use and logged** (still callable normally) rather than aborting the
run.

## Observability — AgentRunStep OutputData (no dedicated entities)

A pipeline run produces **no dedicated entities and no extra SQL I/O**. It surfaces as a single native
`Tool` run-step (`Pipeline: N step(s)`) in the agent run tree, and everything a debug UI needs lives in
that step's **`OutputData`**:

- `success`, `toolChain` (the stage chain, e.g. `get_rows → where → count`), `contextBytesSaved`,
  `totalBytesStreamed`, `totalDurationMs`, `failedStepIndex`, and
- `steps[]` — the per-stage breakdown: `index`, `toolName`, `providerKind` (`Action` / `ArtifactTool` /
  `Transform`), `inputSize`, `outputSize`, `durationMs`, `success`, `error`, and a `logRef`
  (`ActionExecutionLogID` for Action steps, an inline `preview` for everything else).

Action stages still log to `ActionExecutionLog` as usual. `map`/`let` sub-stages are summarized into the
step (e.g. `map(300)`), not emitted as individual rows. (Earlier drafts created `MJ: Pipeline Run(s)`
entities; per review these were dropped — the run-step `OutputData` already carries the full picture
without the write amplification or a new overloaded "Pipeline" entity name.)

## Agent-loop integration (`base-agent.ts`)

- `buildPipelineRegistry(params)` — unifies Actions + artifact tools into one namespace.
- `executePipelineAsStep(pipeline, params)` — runs the executor as one `Tool` step and finalizes it
  with the full per-stage breakdown + totals in its `OutputData` (no separate entities).
- `injectPipelineResultMessage(...)` — pushes only the final output (or the failure message) into the
  conversation for the next turn, mirroring the artifact-tool "inject once, then expire" pattern
  (3-turn compacting expiry). Then forces one more turn.
- Prompt assembly injects `_PIPELINE_TOOLS` only when `includePipelineDocs !== false` on the agent
  type **and** at least one source exists (a pipeline's first stage must be a capability, so with no
  sources `BuildPipelineToolDocs` returns `''` and the block stays empty).

## Module layout — `packages/AI/Agents/src/pipeline/`

| File | Role |
|---|---|
| `pipeline.types.ts` | `PipeValue`, `PipelineInvocable`, `PipelineOperator`, step/result records. |
| `path.ts` + `jsonpath-eval.ts` | The shared field-path grammar over an eval-free JSONPath subset. |
| `predicate.ts` | Safe recursive-descent predicate language for `where`. |
| `template.ts` | `{{path}}` resolution for `tool` params (raw value when whole-string, else interpolated). |
| `coerce.ts` | Value↔text at the edges; final-output formatting; shape tag; empty-match diagnostic. |
| `operators.ts` | The object + text operator catalog. |
| `pipeline-registry.ts` | Per-run name→invocable resolution with collision detection. |
| `pipeline-executor.ts` | Stage dispatch, `map`/`let` recursion, caps, fail-fast, bytes-saved. |
| `pipeline-docs.ts` | System-prompt doc generator. |
| `providers/{action,artifact-tool}-provider.ts` + `serialize.ts` | Capability adapters → structured values. |

## Out of scope (v1)

- Branching / fan-out (sequential + `map` only).
- Reusing prior turns' tool outputs (single-turn primitive).
- Streaming between stages (sequential, fully materialized; revisit if a stage exceeds memory).
- `Ref` values for large/binary blobs.
- `dryRun` simulation for effectful `map`.

---

# Test Plan

Covers the executor, providers, agent-loop wiring, persistence, and the LLM-facing prompt. Automated
coverage first; the manual matrix is what to exercise in Explorer/API before merge.

## 1. Automated tests

Run: `cd packages/AI/Agents && npx vitest run src/pipeline/__tests__/`

| File | What it locks |
|---|---|
| `jsonpath-eval.test.ts` | The eval-free JSONPath subset: member/index/wildcard/recursive-descent; rejects filter/script expressions and unsupported selectors. |
| `path.test.ts` | Relative↔absolute path normalization; `getValue`/`getValues`; field-name extraction. |
| `predicate.test.ts` | The `where` grammar: comparison + word operators, `and/or/not`, parens, `in [list]`, `today`/`now`, malformed-input errors. |
| `operators.test.ts` | Each operator (`where/select/sort/first/last/count/distinct/flatten/jsonpath` + `lines/grep/head/tail`): array + text modes, wrong-type errors, and `head`/`tail` rejecting arrays (→ `first`/`last`). |
| `template.test.ts` | `{{path}}` resolution: whole-string → raw value, embedded → interpolated text, unknown-binding error. |
| `serialize.test.ts` | `structureActionResult` (single/multi/none output params), `structureArtifactData` (`get_full` envelope), and conservative JSON-string coercion (container parses; prose / bare scalars stay strings). |
| `pipeline-executor.test.ts` | Threading value→value; only-final-returned; bytes-saved; `map`/`let`; caps (>20 stages, >1000 map elements); abort-signal + past-deadline → clean failure; fail-fast without echoing input; empty-match diagnostic. |
| `loop-agent-type.test.ts` | `DetermineNextStep` accepts `nextStep.type: 'Pipeline'` (non-terminal Retry carrying the pipeline), infers it from a bare `nextStep.pipeline`, and Retries on empty steps. |
| `pipeline-docs.test.ts` | Docs generator: empty when no sources; lists operators + sources + worked examples. |

Full package regression: `cd packages/AI/Agents && npx vitest run`.

## 2. Environment (manual)

Start MJAPI + MJExplorer against a fresh DB. Prereqs:
- `mj sync push --dir=metadata --include="prompts"` so the loop-agent template change (the
  `_PIPELINE_TOOLS` block + the `nextStep.type: 'Pipeline'` response field) is live. **Without it the
  LLM is never told about pipelines** and the scenarios below won't fire. (This is also the failure
  mode if the server runs stale code: new prompt teaching `type: 'Pipeline'` but old dispatch/validator
  that doesn't accept it → the step is bounced and never executes.)
- An agent with at least one Action that returns a large payload (e.g. **Run View**) so there's a
  source worth slicing.

## 3. Functional scenarios (agent-driven)

| # | Scenario | Expected |
|---|---|---|
| F1 | **Source → object ops.** `Run View` → `where Status == 'Rejected'` → `select [ID, Email]` → `first 10`. | Agent emits one `nextStep.type: 'Pipeline'`. Only the final filtered array appears next turn. The full RunView dump never enters any LLM message. |
| F2 | **Single-stage pipeline.** Agent wraps one source. | Allowed; final = source value. |
| F3 | **Text source → text ops.** Large text source → `lines` → `grep` → `tail 50`. | Only the last 50 matching lines returned. |
| F4 | **Artifact-tool source.** Input artifact; `get_full` (with `artifactId`) → `where`/`grep`. | Content read + filtered server-side; only matches returned. |
| F5 | **map batch.** Source → `where` → `map { as: row, do: [ { tool, with: {... {{row.x}} } } ] }` → `count`. | Per-element work runs server-side; only the count returns. `ContextBytesSaved > 0`. |
| F6 | **let correlation.** `let` captures set A as `{{A}}`; later stage references it. | Binding resolves; main stream unaffected. |

## 4. Error / guardrail scenarios

| # | Scenario | Expected agent-facing result |
|---|---|---|
| E1 | Unknown tool name. | `Unknown pipeline tool "X". Available tools: …` |
| E2 | >20 stages. | `A pipeline may have at most 20 stages …` |
| E3 | Empty `steps`. | `A pipeline needs at least 1 stage.` |
| E4 | Operator on wrong type (`where` on a non-array). | `"where" expects an array but received …` |
| E5 | Stage fails mid-pipeline. | `Pipeline failed at stage N (…). Upstream value size: … bytes. Error: …` — **must NOT contain the piped value**. Remaining stages don't run. |
| E6 | `map` over a non-array, or >1000 elements. | `"map" expects an array …` / `"map" capped at 1000 elements …` |
| E7 | Empty match. | Pipeline succeeds; final message carries the empty-match diagnostic (field values present). |

## 5. Observability (AgentRunStep OutputData — no dedicated entities)

After F1–F6, inspect the `Pipeline: N step(s)` `Tool` step in the agent run tree (no `PipelineRun`
tables exist — observability lives entirely in the run-step's `OutputData`):

- [ ] The pipeline shows as one `Pipeline: N step(s)` `Tool` step under the agent run.
- [ ] Its `OutputData` has `success`, `toolChain`, `contextBytesSaved`, `totalBytesStreamed`,
      `totalDurationMs`, and a `steps[]` array with per-stage `index`/`toolName`/`providerKind`/
      `inputSize`/`outputSize`/`durationMs`/`success`.
- [ ] Action stages' `steps[].logRef.actionExecutionLogId` link to `ActionExecutionLog`;
      transform/artifact stages carry a `preview`.
- [ ] On failure (E5): step `success=false`, `failedStepIndex` set, error set, only the stages that
      ran present in `steps[]`.

```sql
-- The pipeline run-step lives in the standard agent run tree:
SELECT TOP 20 ID, StepName, Status, OutputData
FROM __mj.AIAgentRunStep
WHERE StepName LIKE 'Pipeline:%'
ORDER BY __mj_CreatedAt DESC;
```

## 6. Prompt / discovery

- [ ] With `includePipelineDocs` on and ≥1 source, the system prompt contains the `## Agent Pipelines`
      block (operators + source list + examples) and the `nextStep.type: 'Pipeline'` option.
- [ ] With no sources, the block is absent (pipelines impossible).
- [ ] `includePipelineDocs=false` (or `includeResponseTypeDefinition.pipeline=false`) on an agent type
      suppresses both the docs and the `'Pipeline'` step type.

## 7. Regression

- [ ] Agents with no pipeline usage behave identically (the `'Pipeline'` step type is optional).
- [ ] Artifact-tool calls and action steps work unchanged.
- [ ] `npm run build` clean; full Agents vitest green.

## 8. Known gaps / follow-ups

- No automated end-to-end agent-run test (needs a live MJAPI + seeded agent); F1–F6 cover it manually.
- A capability whose name collides with an operator is skipped for pipeline use and logged — verify
  the log line if such a collision exists in a target environment.
- **Action-level cancellation**: the wall-clock deadline / `AbortSignal` is honored *between* stages
  and map batches, not *during* a single in-flight Action — interrupting a hung Action mid-call needs
  the Action execution layer to accept a signal (follow-up).
- **Streaming `map`**: per-element final values are buffered into one array before returning; a
  streaming/chunked map (no full materialization) is a v2 candidate for very large fan-outs.
- **Model-aware capability gating**: the prompt-param flags are per-agent-type, not per-model; a
  policy layer that injects pipeline (and other) capabilities based on model strength is a future
  enhancement.

> **Post-review revision.** This PR was revised after review: the ReDoS guard was added; `pipeline`
> moved from a top-level response field to `nextStep.type: 'Pipeline'`; the injected result message
> gained a stage-chain identity; `head`/`tail` became text-only; JSON-string coercion was tightened;
> a wall-clock deadline/abort was added; and the dedicated `MJ: Pipeline Run(s)` entities were
> **dropped** in favour of capturing everything in the run-step `OutputData` (no extra SQL I/O).
