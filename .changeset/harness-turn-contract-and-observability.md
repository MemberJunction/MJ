---
"@memberjunction/ai-agent-harness": patch
---

Harness turns: supply the real response contract, and record inputs/outputs

Three defects found by running the Demo Harness Agent against Claude Code and asking it "what can you do?" — a one-turn question that took **6 iterations and 152 seconds**.

**The harness was never shown the response schema.** `HarnessAgentBase` bypasses `AIPromptRunner`, so the agent-type template's `_OUTPUT_EXAMPLE` was never rendered and the harness had to guess. It emitted well-formed JSON with invented step names (`complete`, `respond`, `result`, `undefined`), and `BaseAgent`'s retry feedback taught it the vocabulary one rejection at a time. A model inventing plausible values for a schema it was never shown reads as a sloppy model; it is actually a missing prompt. The turn-end contract now states the real shape explicitly — `taskComplete` for completion, and `nextStep.TYPE` (not `step`) with the actual `Actions | Sub-Agent | Chat | Retry | …` vocabulary — carried directly rather than depending on template rendering.

**Prompt-step inputs and outputs were blank in the UI.** The synthesized `AIPromptRun` reproduced the accounting fields and dropped the observability ones: `Messages` and `Result` were never set, so every harness prompt step rendered empty while its tokens and cost were correct.

**Runs reported zero tokens.** `calculateTokenStats` sums the `*Rollup` columns, which were left NULL while only `TokensUsed` was set — a confusing half-truth that looks like a free run rather than an unaccounted one.

Also corrects `ClaudeCodeCliAdapter.StructuredOutput` to **false**: `--output-format stream-json` structures the transport, not the model's content. Claiming true told the runtime it need not compensate.

Result on the same prompt: **1 iteration, 9.7s, $0.001056** — down from 6 iterations, 152.8s, $0.029266.
