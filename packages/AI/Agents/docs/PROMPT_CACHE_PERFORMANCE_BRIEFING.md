# Prompt-Cache Layout: Performance and Cost Briefing

**Scope**: PR #4508 (`cache-trailing-state`), September 2026. Companion to [`guides/AGENT_PROMPT_CACHING_GUIDE.md`](../../../../guides/AGENT_PROMPT_CACHING_GUIDE.md), which explains the mechanism. This document memorialises what was measured, how, and what it cost before and after.

## Executive summary

- The Loop agent's system prompt used to end with the current date/time, the Scratchpad and the Payload. Because those change every iteration, every provider's prefix cache broke before it reached the conversation history, and the whole history was re-read on every step. Anthropic and OpenAI caches sat at **0%** on later iterations.
- Moving that state into a trailing user message, and choosing per provider whether to replace or append it, took the cached share of prompt tokens on iterations 3 and later to **66–96%** on every model measured, and cut prompt cost per million tokens by **37–80%** depending on provider. Multi-agent runs saved **36–68%** of total run cost on the frontier models.
- Wall time moved little either way: prefill was never the bottleneck at these sizes. Where it improved (Opus 5.5 1.35–1.42×, Cerebras 2.14× on Query Builder) it came from fewer uncached tokens on long histories.
- The benchmarking exposed a separate defect: a failed action was reported to the model as a success, so agents retried unconfigured tools until the two-hour timeout. The circuit breaker that fixed it turned two-hour cancelled runs into completions of 34 seconds to 22 minutes (section 4).
- One caveat on the numbers: the specialization-relocation path was inert during these studies because of a template lookup bug fixed afterwards (commit 5e1946b). Agents with volatile child prompts (six in the shipped catalog) should be re-measured; every other row stands.

## 1. Method

Two arms, same tasks, same models, same repeats. **Arm A** = state in the system-prompt tail (the `next` baseline). **Arm B** = this PR: trailing `<mj-runtime-state>` message, Anthropic breakpoint on the last real history message, append-only retention on OpenAI and xAI, replace-in-place elsewhere. In every Arm B run the system prompt was byte-identical across all iterations.

Runs were headless (`AgentRunner.RunAgent` with per-model AI Configurations) so that OpenAI and Cerebras usage was recorded; their streaming paths drop usage. Cached share is `CacheReadTokens / PromptTokens` on iterations 3 and later, where the history is large enough to matter. Costs come from MJ's cache-aware cost calculation (`CacheReadPricePerUnit`, 10% of the input price for Gemini and OpenAI). Cerebras had no cache-read price configured at the time, so its cost savings in Arm B are understated.

Topologies: **Sage** (single Loop agent, 10–57 iterations), **Query Builder** (orchestrator + Query Strategist), **Demo Loop Agent** (short direct loop), **Research Agent** (hierarchical: Web Research sub-agent + Report Writer).

## 2. Results

### 2.1 Sage — cached share and prompt cost on iterations 3+

| Model | Provider | Arm A cached | Arm B cached | Cost / 1M prompt tokens | Prompt cost savings |
|---|---|---|---|---|---|
| Claude Sonnet 4.6 | Anthropic | 0.0% | **89.9%** | $4.05 → $0.81 | **−80.1%** |
| Claude Opus 5.5 | Anthropic | 0.0% | **78.9%** | $1.94 → $0.69 | **−64.5%** |
| Claude Opus 5 | Anthropic | 0.0% | **77.6%** | $5.47 → $2.03 | **−62.9%** |
| Grok 4.7 | xAI | 21.4% | **90.5%** | $3.65 → $1.68 | **−53.9%** |
| GPT 5.6-terra | OpenAI | 0.0% | **78.4%** | $2.12 → $0.73 | **−65.4%** |
| GPT-OSS-120B | Cerebras | 64.7% | **95.7%** | $0.14 → $0.09 | −37.3% |
| Gemini 2.5 Flash | Google | 37.4% | **74.8%** | $0.23 → $0.13 | −43.5% |
| Gemini 3.8 Flash | Google | 30.3% | **66.4%** | $0.57 → $0.33 | −42.0% |

Turn by turn on Sonnet 4.6, Arm B reached 97.6% cached by turn 2 and stayed at 73–98% through turn 10; on Opus 5 it reached 93% by turn 2 and was serving 90K cached tokens by turn 6. Cerebras's own block cache already did well on the baseline, so its gain is smaller.

### 2.2 Query Builder (orchestrator + Query Strategist)

| Model | Arm A cached | Arm B cached | Total run cost | Savings | Wall time |
|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 18.9% | **76.7%** | $1.19 → $0.49 | **−59.0%** | 141s → 152s |
| Claude Opus 5.5 | 0.0% | **72.9%** | $2.77 → $0.99 | **−64.2%** | 117s → 82s (**1.42×**) |
| Claude Opus 5 | 0.0% | **79.6%** | $1.72 → $0.81 | **−52.7%** | 89s → 109s |
| Grok 4.7 | 30.9% | **51.1%** | $0.49 → $0.31 | **−35.9%** | 45s → 47s |
| GPT 5.6-terra | 6.5% | **89.9%** | $1.01 → $0.33 | **−67.5%** | 122s → 153s |
| GPT-OSS-120B | 73.7% | 70.4% | $0.097 → $0.046 | −52.3% | 36s → 17s (**2.14×**) |
| Gemini 2.5 Flash | 31.6% | 40.2% | $0.107 → $0.089 | −16.7% | 69s → 73s |
| Gemini 3.8 Flash | 46.8% | **71.0%** | $0.161 → $0.117 | −27.4% | 69s → 56s |

### 2.3 Demo Loop Agent (short loop)

Claude Opus 5.5 0.0% → 47.6% cached (−39.7% cost); Claude Opus 5 23.8% → 71.7% (−46.9%); GPT 5.6-terra 24.2% → 72.6% (−52.1%). Sonnet 4.6, Grok 4.7, Cerebras and both Gemini models were flat within ±4%: runs this short have little history to cache, so there is little to recover.

### 2.4 Research Agent (hierarchical)

| Model | Arm A cached | Arm B cached | Total run cost | Savings | Wall time |
|---|---|---|---|---|---|
| Claude Opus 5.5 | 0.0% | **62.5%** | $8.04 → $3.25 | **−59.5%** | 523s → 388s (**1.35×**) |
| Claude Opus 5 † | 0.0% | **67.3%** | $7.61 → $3.44 | **−54.9%** | 713s → 587s (**1.21×**) |
| Grok 4.7 | 23.7% | **71.7%** | $1.55 → $0.87 | **−43.8%** | 520s → 375s (**1.39×**) |
| Claude Sonnet 4.6 † | 0.0% | **52.6%** | $2.58 → $0.75 | **−71.0%** | 668s → 741s |
| GPT 5.6-terra | 0.0% | **70.0%** | $1.45 → $0.53 | **−63.7%** | 256s → 207s (**1.24×**) |
| Gemini 3.8 Flash | 42.6% | **67.5%** | $0.34 → $0.25 | −26.8% | 141s → 135s |
| Gemini 2.5 Flash | 26.7% | **66.7%** | $0.16 → $0.35 | +118% | 182s → 447s |
| GPT-OSS-120B | 66.2% | 45.3% | $0.04 → $0.10 | +142% | 19s → 68s |

† from the pre-fix pass (Phase B6). Gemini 2.5 Flash and Cerebras cost more in Arm B on this topology because those runs did substantially more work (Gemini 2.5 ran 35 turns of sub-agent research); the cached share still rose for Gemini 2.5 and fell for Cerebras. Those two rows are the only regressions across the studies.

## 3. Why the two retention modes

Probed directly against the OpenAI SDK: an identical request replayed is 100% cached; request N plus one appended message caches 100% of N; the same prefix with only the final message swapped falls back to the system messages (21,052 tokens) and caches nothing of the history. OpenAI's automatic cache reuses a prior request only when that request's **entire** prompt is a byte prefix of the new one. Replacing the fragment each iteration therefore caps OpenAI at the system prompt; retaining prior fragments and appending the new one keeps every request a prefix extension of the last, at a cost of a few hundred stale (cached) tokens per iteration. Gemini and Cerebras match block or segment boundaries and are better served by the compact replace-in-place layout. Anthropic needs its explicit breakpoint moved off the fragment. Which mode a serving path gets is now the `PromptCacheStrategy` field in the model catalog, not code.

## 4. The action-failure circuit breaker: before and after

The first Arm B pass on the Research Agent (21–22 September) is the "before". Five of six models were **cancelled at the two-hour timeout**; the root run had done one iteration and its Web Research sub-agent was retrying an unconfigured search tool, which the framework was reporting to the model as a success.

| Model (Research Agent root run) | Before fix (21–22 Sep) | After fix (22–23 Sep) |
|---|---|---|
| Gemini 2.5 Flash | Cancelled at 7,215–7,280 s | Completed in 110–447 s |
| Gemini 3.8 Flash | Cancelled at 7,315–7,321 s | Completed in 104–192 s |
| Cerebras GPT-OSS-120B | Cancelled at 7,967 s (one completion at 3,533 s) | Completed in 8–46 s |
| GPT 5.6-terra | Cancelled at 7,211–7,994 s | Completed in 128–255 s |
| Claude Sonnet 4.6 | Cancelled at 8,162 s | Completed in 1,323 s |
| Claude Opus 5 / 5.5 | Completed pre-fix (Anthropic models pivoted on their own) | Completed in 387–722 s |

Source: `MJ: AI Agent Runs` on the study database, Research Agent root runs 2026-09-21 19:00 to 2026-09-23 18:00 UTC, grouped by the run's AI Configuration.

The breaker itself, observed in two live runs after the fix:

| Run | Agent | Rule that fired | Trigger | Blocked calls | Time per blocked call | Run outcome |
|---|---|---|---|---|---|---|
| 44678195… (child of Gemini 2.5 Flash root A09B6788…) | Web Research Agent | Attempt budget (5 consecutive failures) | `Summarize Content` — "Must provide either 'url' or 'content' parameter", repeated with varied arguments | 12 | 0–1 ms | Finished in 304 s, 26 iterations, 39 action steps |
| 9B6CF2F6… | Sage | Attempt budget | `Web Search` — "No available provider can produce a synthesized answer. Configure Tavily or Perplexity…" | 6 | 1–2 ms | Completed in 49 s, 7 iterations |

Each blocked step carries the rule's message (`…disabled for this run after 5 consecutive failures across parameter attempts…`), reached no engine call, and the model pivoted in the following iteration. Before the fix the same failures were labelled successes and the loop had no reason to stop.

The exemption for ForEach, While and pipeline callers (`skipCircuitBreaker`) is proven at the same seam by IT46 ALS11 and the unit tier rather than in a live run: those loops do their own per-element accounting, and counting their calls would have let five bad elements in a row block the rest of a batch.

## 5. What to re-measure, and when

- **Volatile child prompts.** Relocation (`specializationPlacement: auto`) was inert during every study above. For the six Loop agents whose child template references the date, payload or scratchpad, expect the multi-agent rows to improve further once relocation runs; measure one of them (Agent Manager or Data Scout) on Gemini 2.5 Flash, where an earlier spot check showed 19% → 70% cached with relocation.
- **Azure OpenAI.** The Azure model-vendor rows carry no `PromptCacheStrategy`, so GPT models served through Azure run replace-in-place. Seed `'prefix'` on those rows and re-run Sage on one Azure deployment to confirm the OpenAI numbers carry over.
- **Cerebras cost.** Configure `CacheReadPricePerUnit` on the Cerebras model row; the cached share is real but the cost saving in section 2 does not credit it.
- **Gemini 2.5 Flash on long tool calls.** 11 of 22 Research Agent iterations read zero from cache after a 190 s action; Gemini's implicit cache appears to expire during long tool calls. Not a layout problem, but worth knowing when reading its rows.

## 6. Where the raw data is

Cell-level CSV (phases A, A2, B, A3, B2): `~/tools/study-cells.csv` on the study machine; per-iteration rows in `study-iters-clean.csv`. Runner, analyzer and the OpenAI cache probe are in the study session's scratchpad (`bench-run.mjs`, `study-analyze.mjs`, `openai-probe.mjs`). Every run is also a `MJ: AI Agent Runs` row on the study database, tagged by its `Bench: <model>` AI Configuration.
