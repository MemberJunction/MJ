---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-deepinfra": minor
"@memberjunction/ai-siliconflow": minor
"@memberjunction/ai-provider-bundle": minor
---

AI model & vendor metadata refresh (weekly research run, 2026-09-28). The busiest launch week of the quarter: four frontier models shipped inside 36 hours.

- Adds **Claude Opus 5.5** (`claude-opus-5-5`, released 2026-09-22) on Anthropic, Amazon Bedrock and OpenRouter, with cost rows at $4/$20 per 1M and a $0.20 cache read. Anthropic's new recommended default: 20% below the $5/$25 Opus tier, 1M context, 128K output, default effort `medium`. The 0.05x cache-read multiplier is new to this file — Anthropic now publishes three different ratios. No Bedrock cost row: sources conflict between $4/$20 parity and $2.20/$11.
- Adds **Grok 4.7** (`grok-4.7`, released 2026-09-21) on x.ai and OpenRouter at $2/$6 per 1M with $0.50 cache read — unchanged from Grok 4.6. Built on a new, larger base model: AA Coding Agent Index 56 vs 47, Terminal-Bench 4.0 33% vs 18%, hallucination rate 29% vs 34%. Ends a five-week run of slipped release dates. `MaxOutputTokens` is deliberately held at 128,000: xAI publishes no cap and the 450,000 figure on third-party cards is unofficial.
- Adds **GPT-6 Sol** (`gpt-6-sol`) and **GPT-6 Luna** (`gpt-6-luna`), both released 2026-09-22, on OpenAI, Azure, Amazon Bedrock and OpenRouter. Sol at $2/$10 and Luna at $0.10/$0.50 — each exactly half its GPT-5.6 predecessor. Sol's benchmarks are mixed rather than uniformly better (it regresses against GPT-5.6 Sol on DeepSWE and OSWorld 2.0), which its PowerRank of 25 reflects. Neither carries an Azure cost row; Microsoft's rate card for the tier could not be confirmed.
- Adds the **Xiaomi** vendor plus **MiMo V2.6 Pro** and **MiMo V2.6 Flash** (released 2026-09-22, MIT-licensed, omnimodal), reached through OpenRouter at $0.435/$0.87 and $0.14/$0.28 per 1M. Model Developer attribution only — no Xiaomi driver class exists, so no first-party route is wired.
- Records the **GLM-5.3-FlashX** OpenRouter rate at $0.37/$1.25 with a $0.09 cache read, closing the follow-up the 2026-09-21 run left open, and replaces the now-false comment on its Z.AI row.

- Adds **GLM-5.3-Flash** on three more hosts: a Fireworks.ai cost row ($0.15/$0.50, $0.03 cache) for the route that previously had none, with its context corrected to 1,048,576; and two new inference vendors, **DeepInfra** ($0.075/$0.25, a 50% promo off its $0.15/$0.50 list rate) and **SiliconFlow** ($0.15/$0.50, $0.03 cache). Each vendor gets its own OpenAI-compatible driver (`DeepInfraLLM` in `@memberjunction/ai-deepinfra`, `SiliconFlowLLM` in `@memberjunction/ai-siliconflow`). Each driver also sends the output cap as `max_tokens`, the only cap parameter those two providers document.

No cost row was expired and no vendor route was deprecated — every price movement this week arrived as a new model rather than a re-rate. Anthropic's relabelling of Opus 5 and the 4.x tier as "legacy (still available)" is explicitly **not** treated as a deprecation. `gpt-6-luna-pro` is deliberately not a separate record: it is `gpt-6-luna` with `reasoning.mode=pro`, the same request-parameter-vs-model-id problem as Claude fast mode.
