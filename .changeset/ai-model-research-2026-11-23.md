---
"@memberjunction/core": minor
---

AI model metadata refresh (weekly research run, 2026-11-23)

Adds four models to `metadata/ai-models/.ai-models.json`, corrects one price error, fills one missing
token limit and closes three price windows ahead of a published retirement:

- **GPT-6.2 Astra** (`gpt-6.2-astra`, released 2026-11-17) — 1,050,000-token context (922K input,
  128K output), effort levels low/medium/high/xhigh. Priced at $8/$40 per 1M in/out, a 20% cut from
  GPT-6 Astra, with cached input at $0.40 and cache writes at $10. OpenAI and Azure (Microsoft
  Foundry, deployment version 2026-11-17) inference routes; the Azure route carries the usual
  vendor-level `SupportsNativeToolCalling: false` because `AzureLLM` cannot send tools.
- **GPT-6.2 Sol** (`gpt-6.2-sol`, released 2026-11-17) — same context and effort levels, priced at
  $2/$10 unchanged from GPT-6.1 Sol, cached input $0.10, cache writes $2.50. OpenAI and Azure routes.
- **Qwen4-Max** (`qwen4-max`, released 2026-11-16) — Alibaba's first Qwen 4 flagship, a 2.4T-parameter
  MoE with ~71B active parameters, 991,808-token input and 131,072-token output, text/image/video
  input. $1.50/$4.50 per 1M with cached input at $0.075 on the International deployment, a 25% cut
  from Qwen 3.8 Max. Alibaba Cloud and OpenRouter routes.
- **Muse Ember** (`meta/muse-ember`, released 2026-11-09) — Meta's cheapest Muse tier for high-volume
  agentic and routing work, 1M context, multimodal input. As with MJ's other Meta records there is no
  Meta first-party driver, so the only inference route is OpenRouter and the record carries no cost
  row; its $0.10/$0.50 rate card is recorded in the description.
- **Qwen 3.7 Plus** — the Alibaba Cloud cost row's output price is corrected from $1.16 to **$1.60**,
  a digit transposition of the Model Studio list price that had been overstating cost accuracy by
  ~38% on every output token since the record was created. Corrected in place, since the row was
  never right, with the correction documented in its `Comments`. The paired OpenRouter row is left
  alone.
- **Gemini 4 Carbon** — `MaxOutputTokens` is set to 65,536 on all three inference routes, from Google
  AI Studio's developer guide, matching the sibling Gemini 4 Neon and Gemini 4 Hydrogen records.
- **GPT 5, GPT 5-mini, GPT 5-nano** — each OpenAI cost row gains `EndedAt: 2026-12-11`, OpenAI's
  published retirement date for `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `o3` and `o3-pro`,
  so cost reporting stops selecting the retired prices on the shutdown date with no further edit. The
  vendor routes stay `Active` until the date passes, and the Azure and OpenRouter rows are deliberately
  untouched — those platforms set their own lifecycle dates.

Anthropic's full list-price table was re-verified against all 26 Claude models MJ carries and matches
on every one, cache multipliers included; no new Claude model shipped this week. No record was
deleted, and the only existing price touched is the Qwen 3.7 Plus error correction. Full findings,
sourcing and the items flagged for human review:
`reports/ai-model-research/2026-11-23-weekly-report.md`.
