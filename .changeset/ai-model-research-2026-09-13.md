---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

Weekly AI model & vendor intelligence report (2026-09-13) + three metadata edits.

- **Promo expiry** `GLM-5.3-Flash` on OpenRouter. Z.AI's 50% launch promo ended 2026-09-09 16:00 UTC (24:00 Singapore), the instant last week's report predicted. The promo cost row is now `Status: "Expired"` with `EndedAt`, and a new row records the list rate ($0.15/$0.50 per 1M) from that same instant — so the historical rate is preserved rather than overwritten, which is what the 2026-08-31 changeset asked a later run to do. The Z.AI direct row already carried list pricing and is unchanged. One discrepancy is recorded rather than smoothed over: our promo row was captured at $0.05/$0.1667 while Z.AI's later materials describe the promo as $0.075/$0.25; the original figure is left as evidence of what we were quoted, and the divergence is noted in the row's `Comments`.
- **New inference provider** on `GPT-6 Astra`: Amazon Bedrock vendor row (`openai.gpt-6-astra`, GA 2026-09-08) and cost record at $10/$50 per 1M with $1 cache read and $12.50 cache write. That is the GLOBAL cross-Region Standard rate at the short-context tier (≤272K input) — the same convention the existing OpenAI-direct and Azure rows use. Above 272K the whole request rebills at $20/$75, and in-Region / US-geographic routes run 10% higher. Closes an item open since Astra's launch.
- **New model** `DeepSeek V4.1 Flash` (released 2026-09-10, supersedes `DeepSeek V4 Flash`). 552B MoE with native vision, 1,048,576-token context, 384K output. DeepSeek as Model Developer + Inference Provider (`deepseek-flash`) plus an OpenRouter inference row. Cost record carries the **off-peak** tier ($0.15/$0.60, $0.003 cached input); peak is exactly double during Mon–Fri 01:00–04:00 and 06:00–10:00 UTC. Recording a real tier rather than a blend is deliberate — the 2026-08-16 `DeepSeek V4 Pro` row was written at a figure matching neither tier and has been an open reconciliation item ever since. **No OpenRouter cost row was written**: the route exists but its rate was not confirmed, and an invented price is worse than an absent one.

Not applied, flagged in the report: Grok 4.7 (a third missed date — still in supplemental training with no model card or rate card), GPT Image 2.5 Flare/Sunburst and the FLUX family (both blocked on one image-model cost-schema decision), Sakana AI / Fugu Max (new vendor plus a missing driver class), and the carried-forward Claude 4 cost-row cleanup, `GLM 5.3` OpenRouter context-window discrepancy, and `DeepSeek V4 Pro` reconciliation.

The §0.3 pure-JSON pre-flight passes (`OK`) and every `@lookup:MJ: AI Vendors.Name=…` resolves.
