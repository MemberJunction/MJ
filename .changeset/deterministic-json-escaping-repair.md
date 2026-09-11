---
"@memberjunction/global": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-core-plus": patch
---

Recover LLM responses broken by a single unescaped character, and stop misreporting why they broke.

Models embed rich markdown in JSON string fields — mermaid diagrams, HTML mockups, code samples — and reliably escape most of it. One missed quote inside a 25KB response invalidates the whole document. Three defects meant that was unrecoverable and misdiagnosed.

**`CleanJSON` discarded the response over an interior fence.** Once the top-level parse failed for any reason, fence extraction ran unconditionally. That regex has no idea it is looking inside a string value, so a ` ```mermaid ` fence embedded in a markdown field matched, its contents were extracted, the JSON envelope was thrown away, and `CleanJSON` recursed into the fragment. A 28KB agent response with one unescaped quote at offset 23011 was reported as ``Unexpected token 'm', "mermaid\ns"...``. Fence extraction now skips input already shaped like a JSON envelope — a genuinely fence-wrapped response starts with the fence and a prose-buried one starts with prose, so neither is affected. The throw also carries the untouched parse error as `cause`.

**The repair chain reasoned from the wrong error.** `attemptJSONRepair` received whatever escaped `JSON.parse(CleanJSON(rawOutput))`, which may describe one of `CleanJSON`'s intermediate transforms rather than the model's actual output. That message was handed to the AI repair prompt as `ERROR_MESSAGE`, recorded on the prompt run, and re-thrown — so a model was asked to fix an unexpected `'m'` in a mermaid fragment when the real defect was one quote at a known offset, in text it was never shown. `resolveTrueParseError` now derives the error from the raw output directly.

**Nothing could repair an unescaped quote.** JSON5's leniency covers trailing commas, comments and unquoted keys, but an unescaped `"` terminates a string in JSON5 exactly as in JSON, leaving only an LLM round-trip on the full payload. New `RepairJSONEscaping()` in `@memberjunction/global` is error-driven and deterministic: read the failure offset, walk back to the character that ended the string early, escape it, re-parse, repeat. Every pass is validated by a real parse, so it cannot pattern-match its way to a wrong answer the way a global regex rewrite would, and it gives up rather than guessing when it cannot make progress. It runs in `attemptJSONRepair` between the JSON5 and AI stages — microseconds against an LLM round-trip, and it cannot invent content. `_jsonRepairInfo` gains a `LexicalEscaping` method and records the offsets escaped, because that repair infers intent and should never be invisible.

Replayed against 16 real failing production payloads: 16/16 recovered, 180 characters escaped, 12ms total. Each repair verified escapes-only — removing the inserted backslashes reconstructs the original byte-for-byte — with a valid response shape. Against 34 already-valid payloads, 20 containing markdown fences: zero false positives. The production failure that motivated this had burned all ten agent retries, roughly four minutes and 79K completion tokens, before terminating; it now recovers in 0.61ms with the AI stage never reached.
