# Agent Prompt Caching Guide

How the Loop agent lays out each request so that provider prompt caches survive from one iteration to the next, how that layout adapts per provider, and the run-scoped action circuit breaker that the same work exposed and fixed.

**Audience**: developers changing `BaseAgent`, the Loop system prompt template, a provider driver, or the model catalog; anyone reading a prompt-run cost report and wondering why the cached share is what it is.

**Ships with**: `@memberjunction/ai-agents`, `@memberjunction/ai`, `@memberjunction/ai-core-plus`, `@memberjunction/ai-prompts`, `@memberjunction/ai-anthropic` (PR #4508). Before-and-after numbers: [`packages/AI/Agents/docs/PROMPT_CACHE_PERFORMANCE_BRIEFING.md`](../packages/AI/Agents/docs/PROMPT_CACHE_PERFORMANCE_BRIEFING.md).

---

## 1. The problem

Every provider's prompt cache is a **prefix** match over `tools → system → messages`. Anything that changes inside the system prompt therefore invalidates everything after it, including the entire (and growing) conversation history.

Until 6.2 the Loop agent's system prompt template rendered three blocks at its tail on every iteration: the current date/time (changes per minute), the Scratchpad (changes per turn) and the Payload (changes per turn). Measured on Sage on 2026-09-14: cache reads plateaued at ~21.5K tokens (the static part of the system prompt) while uncached input grew to 73K per call. Anthropic and OpenAI showed **0%** cached on later iterations, because their caches need the prefix to match from token 0.

## 2. The layout

The template no longer renders those blocks. `BaseAgent.preparePromptParams` builds the same content into a fragment and appends it as the **final `user` message** of each request:

```
<mj-runtime-state>
## Current Date/Time
- **Date**: 2026-09-27 (Sunday)
- **Time**: 4:37 PM CDT

## Scratchpad State
...

## Current State
**Payload:** ...
```json
{...}
```
</mj-runtime-state>
```

The system prompt keeps a static `## Runtime State` pointer telling the model where the state lives. The system prompt is therefore byte-identical across iterations, and the history becomes an incrementally cacheable prefix.

Rules the layout keeps:

- **State only, never rules.** Instructions stay in the system prompt. The fragment is authoritative framework state and the pointer says so.
- **Never persisted.** The fragment is appended to a *copy* of the history for one request (`assembleOutgoingMessages`). The stored history stays byte-stable. The one exception is append-only mode, below, where prior fragments are deliberately retained because the provider needs them.
- **Tag literals are escaped at send time.** `<mj-runtime-state>` and `<mj-agent-specialization>` in any non-system history message (user turns, action results, sub-agent results, tool-call arguments) are rewritten to `&lt;...&gt;` in the outgoing copy, so nothing can pose as framework state. Escaping is deterministic, so it does not disturb the cached prefix.
- **Delivery gate.** The fragment is only sent when the system prompt template carries the pointer. A template that still embeds the old blocks (a database whose `metadata/prompts` has not synced) gets no fragment, so the model never sees the state twice. A template with neither (Flow agents, custom prompts) gets none either. The markers that identify the old layout live in `VOLATILE_TEMPLATE_MARKERS` (`constants.ts`) and are overridable through `BaseAgent.volatileTemplateMarkers`.

All string literals involved (placeholder names, tag literals, block headings, markers) live in one place: [`packages/AI/Agents/src/constants.ts`](../packages/AI/Agents/src/constants.ts).

## 3. Replace-in-place vs append-only: `PrefixPromptCache`

Two kinds of cache exist:

| `PrefixPromptCache` | Providers | Behaviour of the cache | What the agent does with the previous iteration's fragment |
|---|---|---|---|
| absent / `false` (block cache) | Anthropic (explicit breakpoints), Gemini (implicit), Cerebras (sliding) | Matches on block or segment boundaries inside the prompt | **Replaces it.** Only the latest fragment is attached; history stays compact. |
| `true` (byte-prefix cache) | OpenAI automatic cache, xAI | Reuses a prior request only when that request's *entire* prompt is a byte prefix of the new one | **Retains it and appends the new one**, so each request is an exact prefix extension of the last. Costs a few hundred stale (cached) tokens per iteration. |

Replacing the fragment on a prefix cache breaks the prefix right after the system prompt and caps the cached share there (measured: GPT 5.6 flat at 21K cached every iteration). Appending recovers the history (~93% cached).

**Which provider is which is metadata, not code.** `PrefixPromptCache` is a boolean in `LLMConfigurationSettings` in the model catalog's `ModelConfiguration` cascade, which since 6.2 has a vendor layer. AI Vendors carries its own `Configuration` bag (`IAIVendorConfiguration`), and its `ModelDefaults` key is a model-configuration bag that forms the default for every model the vendor serves:

```
MJ: AI Model Types . ModelConfiguration      (type-wide default)
  < MJ: AI Models . ModelConfiguration       (per model)
    < MJ: AI Vendors . Configuration.ModelDefaults   (host-wide default for every model this vendor serves)
      < MJ: AI Model Vendors . ModelConfiguration   (the inference provider's row — the tie-breaker, wins)
```

The vendor default sits above the model's own bag on purpose: a host's statement about how it serves models beats the model's generic description, and the model-vendor row is where a host diverges for one model. The merge is per key, so a vendor default only touches the keys it actually sets.

`BaseAgent.resolvePrefixPromptCache(model, vendor)` finds the vendor's *inference-provider* model-vendor row and reads the effective configuration through `AIEngine.GetEffectiveModelConfiguration`, which folds in the `ModelDefaults` of the vendor named by that model-vendor row. `true` ships under `Configuration.ModelDefaults` on the OpenAI and x.ai vendor rows in `metadata/ai-vendors`, so every model they serve inherits it and a new OpenAI model needs no seed of its own. A host that caches differently for one model sets the flag on that model-vendor row in `metadata/ai-models`. Nothing in code knows a provider's name.

The mode is decided **once per run**: from a runtime model override, else from the first iteration's model selection, then frozen so a failover cannot flip the layout mid-run. On turn 1, before any selection is known, the layout is replace-in-place; if turn 2 resolves to append-only, turn 1's fragment is restored at the turn-1 boundary. The prompt's bound models are deliberately not consulted, because prompts bind several vendors for failover.

Per-agent override, on the Loop type's prompt params (`trailingStateMode`): `auto` (default), `appendOnly` (a serving path whose rows carry no strategy yet), `replace` (context growth matters more than cache hits).

## 4. Anthropic's breakpoint

Anthropic caches only up to an explicit `cache_control` breakpoint and read-hits require the new request to match a cached prefix *at* a breakpoint. If the breakpoint sat on the last message, it would sit on the fragment and miss every iteration.

`BaseLLM` owns the framework-generic half: `isVolatileStateMessage` (the `volatileState` metadata flag the agent layer sets on the fragment), `trailingVolatileStateIndex` and `splitTrailingVolatileState`. `AnthropicLLM` uses the split to place its breakpoint on the **last real history message** and sends the fragment uncached, inserting an `OK` assistant turn when two user turns would otherwise touch. Any other provider that needs a pre-fragment breakpoint reuses the same seam.

## 5. Specialization placement

The OS prompt cannot control what an agent designer puts in a child prompt. A child template that references a volatile placeholder (`_CURRENT_DATE*`, `_CURRENT_TIME*`, `_CURRENT_PAYLOAD`, `_SCRATCHPAD_*`) mutates the system prompt every iteration from a position *ahead* of the catalogs and the history, so relocating the runtime-state tail recovers nothing for it. Six active Loop agents in the shipped catalog do this (Agent Manager, Data Scout, Database Designer, Experiment Designer, Goal Analyst, Model Development Agent).

`specializationPlacement` on the Loop prompt params: `auto` (default) relocates the rendered child prompt into the fragment, inside `<mj-agent-specialization>`, only when its **unrendered** template text references a volatile placeholder; `systemPrompt` never; `trailingMessage` always. Decided once per run from the template text, read by `TemplateID` through the template engine, and it fails closed (no text → stays in the system prompt). When relocated, the runner receives the already-rendered child through `AIPromptParams.PreRenderedChildTemplates` so the child is not rendered twice.

## 6. The action-failure circuit breaker

Benchmarking the layout on the Research Agent exposed a pre-existing bug: `executeActionsStep` reported a failed action (`ActionResult.Success === false`) as `success: true`, so the model never learned the tool had failed and retried it until the two-hour benchmark timeout. The step result now carries the real outcome, and a run-scoped breaker in `BaseAgent.ExecuteSingleAction` bounds retries with three rules, checked fatal → identical-arguments → budget:

| Rule | Trigger | Effect | Directive the model sees |
|---|---|---|---|
| Fatal lockout | One failure whose message is a credential or service-configuration error (`isFatalActionError`: API key missing/invalid, `credentials not found`, `authentication failed`, `<service> not configured`). Parameter-level "not configured" messages are deliberately non-fatal. | Action disabled for the rest of the run, any arguments. | `[CRITICAL/ACTION_UNAVAILABLE]` |
| Identical arguments | `IDENTICAL_FAILURE_THRESHOLD` (2) failures with the same normalized arguments | Further calls *with those arguments* blocked; different arguments still dispatch. | `[CRITICAL/REPEATED_IDENTICAL_CALL]` |
| Attempt budget | `ACTION_FAILURE_BUDGET` (5) consecutive failures across any arguments | Action disabled for the run. | `[CRITICAL/ATTEMPTS_EXHAUSTED]` |

A success clears both counters. A blocked call returns a `CircuitBreakerActionResult` (a failed `ActionResult` carrying the `Reason`) in ~0 ms and never reaches `ActionEngine.RunAction`, so it writes no execution-log row. Other failures get `[WARNING/ACTION_FAILURE]` with an "attempt N of 5" counter. Directives are appended to the history as a `user` message, never injected into the system prompt, so the cacheable prefix stays intact.

Argument identity is `normalizeActionParams`: keys sorted at every depth, arrays kept in order, three protected layers (`normalizeActionParams` → `normalizeActionParamEntry` → `normalizeActionParamValue`) so a subclass can ignore a key or canonicalize values.

**Exemption.** Callers that do their own per-element failure accounting and have no model in their loop pass `{ skipCircuitBreaker: true }`: the pipeline registry, and the ForEach and While operators. Those calls bypass all three rules and leave the breaker's history untouched in both directions.

Known gaps: the thresholds are constants rather than metadata; a blocked call does not write an `ActionExecutionLog` row (the run step is still created and marked failed).

## 7. Verifying it

- **Unit**: `base-agent-volatile-state.test.ts`, `base-agent-action-failure.test.ts`, `runtime-state-fragment.test.ts`, `volatile-child-prompt.test.ts`, `loop-agent-system-prompt-snapshot.test.ts` (Agents); `baseLLM.test.ts`, `modelConfiguration.test.ts` (Core); `anthropic.test.ts`.
- **Integration, deterministic tier**: **IT95 – Trailing Runtime State** (synced template, live placeholders, catalog-driven mode, by-ID child template resolution, copy-on-assemble, Anthropic breakpoint), **IT46** ALS7–ALS11 (breaker permutations against the real action engine), **IT39** AP6 (the structured-failure contract the breaker consumes).
- **Live**: a prompt run's `CacheReadTokens` / `PromptTokens` on iteration 3 and later. On a prefix-cache provider expect the cached figure to grow with the history; flat at the system-prompt size means the mode resolved to replace.

## 8. Checklist when you touch this

- Changing the Loop template? Keep the `## Runtime State` pointer and do not reintroduce `_CURRENT_DATE`, `_CURRENT_PAYLOAD` or the three block headings; `loop-agent-system-prompt-snapshot.test.ts` pins this.
- Adding a provider? Decide whether its cache is a byte-prefix match and, if so, set `PrefixPromptCache: true` under the vendor row's `Configuration.ModelDefaults`; every model it serves inherits it. Override per model-vendor row only where a host diverges. Nothing in code needs to know its name.
- Adding a placeholder that changes per iteration? Add it to `constants.ts` so `IsVolatileChildPrompt` and the template markers see it.
- Writing a child prompt? Referencing the date or payload is fine; `auto` placement relocates it. Prefer not to, since relocation costs ~3K uncached tokens per call.
- Adding an action that fails per resource (one URL, one record)? Make the failure message not look like a credential error, or the breaker's fatal rule will lock the whole tool out. `IT39` AP6 shows the contract.
