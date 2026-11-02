---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

Weekly AI model research refresh (2026-11-01) for `metadata/ai-models/.ai-models.json`:

- **GPT-6.1 Terra** (OpenAI, `gpt-6.1-terra`, 2026-10-26): added on OpenAI (`OpenAILLM`), Amazon Bedrock (`BedrockLLM`, `openai.gpt-6.1-terra`) and OpenRouter (`OpenRouterLLM`). $1/$5 per 1M tokens, cached input $0.05, cache write $1.25. Chained to GPT 5.6-terra via `PriorVersionID`.
- **Muse Wonder** (Meta, 2026-10-12): added with an OpenRouter route (`meta/muse-wonder`, `OpenRouterLLM`). No Meta driver exists, and OpenRouter prices are not tracked, so it has no cost row.
- **MiniMax-M3.1-Flash**: added its OpenRouter route (`minimax/minimax-m3.1-flash`).
- **Mistral Large 4**: price cut on 2026-10-29 to $0.70/$2.10 per 1M tokens (cached $0.07). The $1.36/$4.18 row is expired at that date and a new row added.

Full findings and the items flagged for review are in `reports/ai-model-research/2026-11-01-weekly-report.md`.
