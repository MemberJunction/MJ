---
"@memberjunction/ai": patch
---

Sync MJ's OpenRouter routes against a live read of `openrouter.ai/api/v1/models` (2026-10-20).

- Retires 11 OpenRouter routes whose ids are no longer listed (vendor row `Inactive`; the four with cost rows go `Expired` with `EndedAt`). Six models with no other live inference route drop to `IsActive: false`: Llama 3 70b, Llama 3.1 405b, o1-mini, Claude 3.5 Sonnet, Mixtral 8x7B and Deepseek R1 Distill Llama 3.3 70B.
- Repoints two renamed routes: Mistral Medium 3.5 → `mistralai/mistral-medium-3-5`, Qwen 3.8 Max → `qwen/qwen3.8-max-0902`.
- Adds Muse Spark 1.1, Muse Spark 1.2 and Muse Wonder (OpenRouter), and sets Muse Spark Open's `MaxOutputTokens` to 943,718.
