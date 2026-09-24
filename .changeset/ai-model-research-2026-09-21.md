---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

AI model & vendor metadata refresh (weekly research run, 2026-09-21).

- Adds **GLM-5.3-FlashX** (`glm-5.3-flashx`, `z-ai/glm-5.3-flashx`), Z.AI's 200 tokens/s serving variant of GLM-5.3-Flash released 2026-09-18, with a Z.AI cost row at $0.37/$1.25 per 1M and $0.075 cache read. Same weights and PowerRank as GLM-5.3-Flash; only CostRank moves. No OpenRouter cost row yet — the gateway rate could not be confirmed independently.
- Marks the **Claude Opus 5 Fast** Anthropic route `Deprecated`: Anthropic retired the dedicated `claude-opus-5-fast` model id on 2026-09-01 in favour of `speed: "fast"` on `claude-opus-5`. The id still serves, so the cost row stays `Active` and the model stays `IsActive`. The description now records the replacement invocation.
- Adds a **Grok 4.6** route on **Microsoft Foundry (Azure)** at `Status: "Preview"` (public preview from 2026-08-26), with a cost row at $2/$6 per 1M and $0.50 cache read. Foundry caps the context window at 200K, so no long-context tier applies on this route.

No cost row was expired and no vendor was added. DeepSeek V4 Pro is deliberately untouched: its announced 2026-09-14 retirement was reversed within 45 hours and the model still serves at unchanged prices.
