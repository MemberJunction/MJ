---
"@memberjunction/core": minor
---

AI model metadata refresh (weekly research run, 2026-11-16)

Adds three models to `metadata/ai-models/.ai-models.json` and closes one price window:

- **Claude Fable 5.2** (`claude-fable-5-2`, released 2026-11-09) — 1M context, 128K output, adaptive
  thinking with default effort `high`. Priced at $8/$40 per 1M in/out, a 20% cut from Fable 5.1, with
  cache reads at $0.20/1M (0.025x base input). Anthropic and Amazon Bedrock inference routes; the
  Bedrock route uses the global inference profile ID `global.anthropic.claude-fable-5-2`.
- **Claude Mythos 5.2** (`claude-mythos-5-2`) — same specifications and rate card as Fable 5.2,
  without Fable's safety-classifier routing layer. Limited-availability, so the Inference Provider
  route is seeded at `Preview` and nothing routes to it automatically.
- **Gemini 4 Carbon** (`gemini-4-carbon`, GA on the paid Gemini API 2026-11-10) — ~1M shared context,
  low/medium/high thinking levels. Google, Vertex AI and OpenRouter routes, with the introductory
  $2/$10 rate window-closed at 2026-12-01 and $4/$20 successor rows that take over automatically.
- **Claude Sonnet 4.5** — the Anthropic cost row gains `EndedAt: 2026-11-30`, Anthropic's published
  retirement date for `claude-sonnet-4-5-20250929`, so cost reporting stops selecting the retired
  price on 2026-12-01 with no further edit. The vendor route (already `Deprecated`) and the Bedrock
  and OpenRouter routes are deliberately untouched; partner platforms set their own schedules.

Anthropic's full list-price table was re-verified against all 26 Claude models MJ carries and matches
on every one, cache multipliers included. No existing record was deleted and no existing price was
rewritten. Full findings, sourcing and the items flagged for human review:
`reports/ai-model-research/2026-11-16-weekly-report.md`.
