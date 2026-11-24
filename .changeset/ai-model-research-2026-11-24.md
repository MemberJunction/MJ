---
"@memberjunction/core": minor
---

AI model metadata refresh (weekly research run, 2026-11-24)

Adds three models to `metadata/ai-models/.ai-models.json` and starts one retirement:

- **GPT-6.2 Astra** (`gpt-6.2-astra`, released 2026-11-17): OpenAI's flagship point release.
  1.05M context (922K input), 128K output. $8/$40 per 1M in/out (20% below GPT-6 Astra), cached
  input $0.40. Routes on OpenAI, Azure and OpenRouter.
- **GPT-6.2 Sol** (`gpt-6.2-sol`, released 2026-11-17): same limits. Price is unchanged from
  GPT-6.1 Sol at $2/$10, cached input $0.10. Routes on OpenAI, Azure and OpenRouter.
- **Qwen4 Max** (`qwen4-max`, GA on Alibaba Cloud Model Studio 2026-11-16): 1M context, 131K output.
  $1.50/$4.50 per 1M in/out, cached input $0.075. Routes on Alibaba Cloud and OpenRouter.
- **Claude Opus 4.5**: Anthropic deprecated `claude-opus-4-5-20251101` on 2026-11-23. It retires on
  2027-01-22. The Anthropic route is now `Deprecated`, and its cost row gets `EndedAt: 2027-01-22` so
  the price stops being selected on that date without another edit. The row's `Comments`, which
  described Gemini 3 Pro by mistake, have been corrected. The Bedrock and OpenRouter routes are not
  changed.

Nothing was deleted and no existing price was changed. The full findings, sources and items left
for human review are in `reports/ai-model-research/2026-11-24-weekly-report.md`.
