# Prompt-eval corpus

Golden files for the envelope baseline and the native tool-calling comparison.

**This content is never part of stock MJ.** It lives under `metadata-optional/` — the same
never-shipped, opt-in-push location as the integration-test fixtures — and is pushed only into
local and CI test databases. No customer environment receives any of it.

## Why golden files rather than rows

A case's expectation *is* the yardstick. Changing it changes every number the harness reports, so
it has to show up in a code review — not in a metadata push. Files are diffable; rows are not.

## The one rule that makes the whole thing work

**A case states what the agent should DECIDE, never how the wire encodes it.** There is no
"envelope case" and no "native case"; there is one case, scored through a normalizer that reads
`nextStep.actions[]` and `ChatToolCall[]` into the same shape. That is what lets a baseline run and
a native run be compared on identical inputs, with only the model's behavior differing between
them.

Concretely: never write an expectation that mentions `nextStep`, `toolCalls`, or JSON at all.

## Format

See [`cases/`](cases/) for worked examples and
[`packages/TestingFramework/Engine/src/eval/corpus.ts`](../../packages/TestingFramework/Engine/src/eval/corpus.ts)
for the loader, which **validates at load time** — an unknown matcher, a bad regex, a missing
pattern all throw and name the case. A matcher that silently never matches would be
indistinguishable from a model failure in the results, which is the one failure mode this corpus
cannot afford.

```jsonc
{
  "id": "unique-kebab-id",
  "agent": "Database Research Agent",     // whose prompt this exercises
  "description": "one line: the state, and what a correct decision is",
  "tags": ["mid-loop-action", "param-fidelity"],
  "input": {
    "payload": { },                        // reaches the template as _CURRENT_PAYLOAD
    "conversationMessages": [ ]            // prior turns, incl. action-result annotations
  },
  "expect": { "kind": "action", "actions": [ { "name": "…", "params": { } } ] }
}
```

### Expectation kinds

`action` · `subAgent` · `chat` · `taskComplete` · `payloadChange` · `anyOf`

### Param matchers

| matcher | use for |
|---|---|
| `exact` | enums, ids, booleans — where one value is correct |
| `oneOf` | value-list params |
| `regex` | LLM-authored text with required structure (SQL shape, URL form) |
| `contains` | free text that must mention something |
| `nonEmpty` | the weakest useful check — "it filled this in" |
| `numericTolerance` | numbers where near enough is right |
| `typeOf` | shape without content |
| `absent` | asserting a default was left alone |

Add `"optional": true` to accept an absent parameter while still checking a present one.

### Choosing a matcher

Prefer the **weakest matcher that still distinguishes right from wrong**. A corpus that fails
because a model wrote `SELECT COUNT(*) AS n` instead of `SELECT COUNT(*)` is measuring phrasing,
and every rate it produces is noise around a real signal you can no longer see.
