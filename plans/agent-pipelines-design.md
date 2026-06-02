# Design: Agent Pipelines (PowerShell-style server-side dataflow)

**Status:** design proposal, supersedes the string-stream model in `tool-pipelines.md`.

## The reframe

The first cut treated this as "slice a big tool output so it doesn't blow context." That's the
*entry* use case, not the primitive. The real primitive is:

> An agent authors a small **dataflow program** over MJ's capabilities (actions, tools) and data;
> the server executes it; only the final value returns to the LLM. Intermediates never enter the
> context window.

This moves the agent from **interpreter** (one op per turn, context tax on every intermediate) to
**compiler** (emit a dataflow, get the answer). That is the thing that makes MJ agents a step-change
more powerful — batch work, multi-action orchestration, and structured data wrangling all become a
single zero-intermediate-context turn.

**Unix vs PowerShell:** Unix pipes are byte streams — every stage re-parses text. PowerShell pipes
pass **structured objects** — downstream binds to *properties*. Every friction we hit (escaped-newline
grep no-ops, "stringify then JSONPath to re-extract") is the cost of the byte model. Agents chain
**capabilities that already return structured results** (RunView → records, API → objects), so the
object model is correct. We adopt PowerShell's hybrid: objects are primary; text ops coerce at the
boundary when text is genuinely the point.

## Core model

### Value contract
The pipe carries a **JSON value** (`null | boolean | number | string | object | array`) — not a
string. Nothing is stringified until (a) the final result returns to the LLM, or (b) an action param
needs text. This is the single change that dissolves the byte-model friction.

(Future: a `Ref` value type — a server-held handle to a large/binary blob — so a 50MB document can
flow between stages without materializing in the value. Not v1; v1 holds values in memory.)

### Stage regularity (the LLM-facing surface)
A pipeline is a flat `steps[]`. **Every stage is an object with exactly one verb key** + its args —
jq/PowerShell-regular, so the LLM picks one verb per stage and never has to learn a bespoke shape:

```json
{ "pipeline": { "steps": [
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
] } }
```

Only the final value (here: the array of send-results, or we'd `count` it) returns to the LLM. The
500-row RunView dump, the filtered set, the per-row email bodies — none touch context.

### One field-path grammar everywhere (safe, no eval)
A single path grammar — `Status`, `Customer.Email`, `Results[0].Name`, `Items[*].SKU` — is reused by
**`where` predicates, `select`, `sort` keys, and `{{...}}` templating**. It is parsed by us (the
eval-free evaluator we already built), never `eval`'d. This is the security spine: LLM-authored
predicates/paths can never execute arbitrary code.

## Stage catalog

### Capabilities — `tool`
Invoke any Action or artifact tool the agent has.
- `with`: the tool's input params (literals, or `{{path}}` templates resolved against upstream/bindings).
- `pipeInto`: name of the param that receives the **whole upstream value** (stdin-style). Omit → the
  stage ignores upstream (a pure *source*, e.g. the first stage).
- Emits the tool's result as a **structured value** (RunView → `{Records:[...],TotalCount}`; serialization
  stops stringifying).
- This is the general **action-chaining** mechanism: `action A → action B(pipeInto)` with intermediates
  off-context.

### Operators (pure, object-aware — PowerShell cmdlets)
| Verb | Meaning | PowerShell |
|---|---|---|
| `where` | filter array elements by a predicate over the field grammar | `Where-Object` |
| `select` | project field(s); single field → array of scalars, many → array of objects | `Select-Object` |
| `sort` | sort array by field(s); `-Field` = descending | `Sort-Object` |
| `first` / `last` | take first/last N of an array | `Select -First/-Last` |
| `count` | length of an array / size of a value | `Measure-Object` |
| `distinct` | dedupe array (optionally by field) | `Sort -Unique` |
| `flatten` | flatten nested arrays one level | — |
| `jsonpath` | deep extract via the path grammar (escape hatch for nested shapes) | — |

### Text operators (coerce-to-text — PowerShell's `Select-String`/`Out-String`)
For genuinely textual values (web pages, documents, logs):
| Verb | Meaning |
|---|---|
| `lines` | split a string value into an array of lines (so object ops apply) |
| `grep` | keep lines matching a regex (on a string, or array of strings) |
| `head` / `tail` | first/last N lines of a string (alias of first/last for text) |

### The multiplier — `map`
`{ "map": { "as": "<name>", "do": [ ...sub-stages... ] } }` runs the sub-pipeline **once per element**
of the upstream array, with the element bound to `<name>` (referenceable as `{{name.field}}` in the
sub-stages), and collects the per-element final values into an array.

This is the single biggest power-up: **batch operations with zero per-element context.** "For each of
300 overdue customers, generate a statement and email it" becomes one turn. Without it, that's 300
context-blowing turns or impossible.

Guards (see Safety): element cap, bounded concurrency, and a fail-policy.

### (Tier 2) Bindings — `let`
`{ "let": { "name": "customers", "value": [ ...sub-stages... ] } }` captures an intermediate into a
named binding, referenceable later as `{{customers}}`. Enables joins/reuse (fetch set A, fetch set B,
correlate). Deferred to keep v1's surface small; the field-path/templating machinery is the same.

## LLM ergonomics (what makes a powerful primitive actually usable)

Power without LLM-usability is useless. Deliberate design for the model:
1. **Regular schema** — one verb per stage, one path grammar everywhere. Few orthogonal concepts.
2. **Field-listing errors** — `where references field "Statuss"; available fields: ID, Status, Email,
   Balance`. Errors are written for *self-correction*: the agent fixes it next turn from the message
   alone (the data isn't in context, so the error must carry the shape).
3. **Shape-on-demand** — a stage `{ "describe": true }` (or an automatic shape hint on the final value)
   returns the structure (keys + types + sample) cheaply so the agent can author the next stage
   without dumping the data.
4. **Worked examples** in the system prompt — 2–3 canonical pipelines (filter+select, action-chain,
   map-batch). The prompt teaches the model the shape; this is where adoption is won or lost.
5. **No silent truncation** — if the final value is capped for return, say so.

## Execution & safety

- **Fail-fast** with a clear, input-free error (never echo the piped value). Report which stage,
  byte/element size, and (for field errors) the available fields.
- **Caps**: max stages, max `map` elements (e.g. 1000), max value size; `map` bounded concurrency.
- **Side-effect batches**: `map` over an effectful action (Send Email × 300) is intentional power but
  dangerous. Mitigations: element cap, thorough per-element logging, and (Tier 2) a `dryRun` that
  executes pure stages + simulates effectful ones, returning what *would* happen for the agent/user
  to confirm.
- **Determinism**: pure operators are deterministic; tool stages log to `ActionExecutionLog` as today.
- **Observability**: `MJ: Pipeline Runs` + `MJ: Pipeline Run Steps` (already built) extended — each
  stage (incl. each `map` iteration) is a native child run-step in the run tree; per-stage value
  size, type tag, duration, and `ContextBytesSaved` (sum of intermediate value sizes).
- **Final-output coercion**: structured → compact pretty-JSON (truncated with a note if huge); string
  → raw. The agent is encouraged to end with `count`/`first`/`select` to keep the return small.

## What changes vs. the string implementation already built

The string core is real and tested; this pivots it. Concretely:
- `PipelineInvocable`: `invoke(input: string|null) → {output: string}` becomes
  `invoke(input: PipeValue) → {output: PipeValue}` (`PipeValue` = JSON value).
- The 5 string transforms → the operator catalog above (object-aware), with `grep`/`lines`/`head`/
  `tail` retained as the text-coercion ops.
- `ActionProvider`: stop stringifying — emit the structured `ActionResult` output value; honor
  `pipeInto`/templating.
- `serialize.ts`: shrinks to "coerce a value to text at the final edge / for a text param."
- Executor: recurse for `map`; resolve `{{path}}` templates; enforce caps/concurrency.
- New: the field-path grammar + predicate parser (reuses the eval-free path evaluator).
- Entities: `PipelineRunStep` gains a value-type tag; sizes become serialized-value sizes. (Additive
  migration; the table already exists.)
- The plan doc + PR comment that sold the "deliberate string stream (bash model)" decision get
  rewritten — we are consciously reversing that call, with the reasons above.

## Build order (by dependency, not calendar)

1. **Value contract + field-path/predicate grammar** (pure, fully unit-tested) — the spine.
2. **Operator catalog** (`where/select/sort/first/last/count/distinct/flatten/jsonpath` + text ops).
3. **Executor** over values; `tool` stage with `pipeInto` + `{{path}}` templating; providers emit
   structured values.
4. **`map`** (recursion, caps, concurrency, fail-policy) — the multiplier.
5. **Agent-loop integration** (already mostly done: carry `pipeline`, force-continue, child run-steps,
   persistence) — adapt to values + map iterations.
6. **Prompt**: verbs, path grammar, worked examples, field-listing errors.
7. **Tier 2**: `let` bindings, `dryRun`, `describe`, `Ref` for large/binary.

## Open decisions to lock before building

1. **Verb naming** — PowerShell-ish (`where/select/sort/first/last`) vs terser (`filter/pick/...`).
   Recommend the PowerShell-ish set above: familiar, regular, reads well.
2. **`map` in v1?** Recommend **yes** — it's the single biggest power-up and the reason this is
   transformative rather than convenient.
3. **`let` bindings in v1?** Recommend **defer** to Tier 2 — joins are powerful but add a variable
   model; ship the linear+map core first.
4. **Rename** the primitive to **Agent Pipelines** (the LLM tool can stay `pipeline`)? It's no longer
   just "tool" slicing.
5. **`dryRun` for effectful `map`** — v1 guard (caps + logging) vs build the simulate-effects preview
   now. Recommend caps+logging in v1, `dryRun` in Tier 2.
