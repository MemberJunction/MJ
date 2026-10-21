---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

Weekly AI model/vendor metadata refresh (2026-10-12) — two new models and two first-party price corrections in `metadata/ai-models/.ai-models.json`.

- **Claude Haiku 5.5 added** (`claude-haiku-5-5`, released 2026-10-07). 1M context, 128K max output, first Haiku-class model with an adjustable effort setting. Routes for Anthropic (Model Developer + Inference Provider) and Amazon Bedrock (`anthropic.claude-haiku-5-5`). Cost rows record the base tier, $0.10/$0.50 per 1M tokens with cache reads $0.01; the over-100K-prompt tier at $0.50/$2.50 is documented in `Comments` but not modelled, because MJ stores one price pair per route.
- **Mistral Large 4 added** (`mistral-large-4`, public preview 2026-10-06). 1.05T-parameter MoE with 52B active, 1M context. Cost row records Mistral's launch promotion ($0.68/$2.09, cached input $0.07) and names the standard post-promotion rate ($1.36/$4.18) so the row can be expired when the two-week discount lapses around 2026-10-20.
- **Claude Sonnet 5.5 cache-read price corrected** on the Anthropic route, $0.20 → $0.10 per 1M. Anthropic prices cache hits and refreshes on Sonnet 5.5 at 0.05x the base input price rather than the standard 0.1x. The Bedrock and OpenRouter rows keep $0.20, which came from those vendors' own price lists.
- **Claude Opus 5 cache-write price filled** on the Anthropic route ($6.25 per 1M, 5-minute writes), previously null. Base rates unchanged.

No vendor rows were deprecated and no existing cost row was expired this week. Verification sweeps against the vendors' own rate cards found MJ's GPT-6 family, Gemini 3.x family, Grok 4.x family and GLM 5.x family already matching current published prices.
