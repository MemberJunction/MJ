---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

Weekly AI model & vendor intelligence report (2026-08-31) + four metadata edits.

- **New model** `GLM-5.3-Flash` (Z.AI, released 2026-08-26). Z.AI as Model Developer + Inference Provider, plus OpenRouter and Fireworks.ai as Inference Providers. Cost rows for Z.AI direct ($0.15/$0.50 per 1M) and OpenRouter ($0.05/$0.1667 reflecting a 50% Z.AI promo through 2026-09-09; a follow-up row should be added when the promo expires so the historical rate is preserved).
- **New model** `Qwen3.8-Flash` (Alibaba Cloud, released 2026-08-26). Alibaba Cloud as Model Developer + Inference Provider, plus OpenRouter and Fireworks.ai as Inference Providers. Cost rows for Alibaba direct and OpenRouter at $0.15/$0.47 per 1M.
- **New inference provider** on `Grok 4.6`: Amazon Bedrock vendor row (`xai.grok-4-6-v1:0`) and matching cost record (2026-08-25 start, $2/$6 sub-200K tier at vendor parity with x.ai direct).
- **Deprecation** `Kimi K2.5` on Moonshot AI direct — the Moonshot Inference Provider vendor row and cost record are now `Status: "Inactive"` per Moonshot's 2026-08-31 sunset of `moonshotai/Kimi-K2.5` and the `moonshot-v1-*` series. Fireworks.ai and OpenRouter vendor rows remain Active (weights are MIT-licensed and both providers may continue to serve the model).
- Full report at `reports/ai-model-research/2026-08-31-weekly-report.md`, including 5 items flagged for human review (DeepSeek V4 Flash Vision Experimental, OpenAI Daybreak Red/Blue on Bedrock, OpenAI Astra, Azure OpenAI cache-write charges on GPT-5.6 family, plus prior-week open items).
