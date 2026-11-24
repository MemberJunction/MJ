---
"@memberjunction/core": minor
---

AI model metadata refresh (weekly research run, 2026-11-24)

Records Anthropic's 2026-11-23 deprecation of **Claude Opus 4.5** (`claude-opus-4-5-20251101`,
retiring 2027-01-22, replacement `claude-opus-5-5`) in `metadata/ai-models/.ai-models.json`:

- The Anthropic Inference Provider route is now `Deprecated`.
- The Anthropic cost row gets `EndedAt: 2027-01-22`, so its $5/$25 price stops being selected on that
  date without another edit. `Status` stays `Active` until then. The row's `Comments`, which
  described Gemini 3 Pro by mistake, have been corrected.
- The Bedrock and OpenRouter routes are not changed, because partner platforms set their own
  retirement dates.

GPT-6.2 Astra, GPT-6.2 Sol and Qwen4 Max were researched but are not added here, because the open
PR #6854 already adds them. Full findings are in
`reports/ai-model-research/2026-11-24-weekly-report.md`.
