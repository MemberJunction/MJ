---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

AI model & vendor metadata refresh (weekly research run, 2026-10-05).

This session's network policy blocked every vendor documentation host except Anthropic's, so no new
model, no new vendor and no re-rated price is included. What is included is Anthropic data verified
against `platform.claude.com` directly, plus a set of internal-consistency repairs that needed no
vendor access. The full candidate list — including three live mispricings and four MJ routes that
retire within 15 days — is in `reports/ai-model-research/2026-10-05-weekly-report.md`.

- **Corrects Claude Sonnet 4.5's output cap from 8,192 to 64,000** on all three routes. Anthropic
  publishes 64K; the recorded figure was wrong by nearly 8× and would have truncated long
  generations. Also marks the Anthropic route `Deprecated` (announced 2026-09-30, retires
  2026-11-30, replaced by Claude Sonnet 5.5) while leaving the cost row `Active`, since it still
  serves until then.
- **Corrects Claude Sonnet 4.6's context window to 1,000,000 and its output cap to 128,000** on all
  three routes (recorded as 200,000 / 64,000).
- **Fills the published prompt-cache rates** on the first-party Anthropic cost rows that had none:
  Claude Opus 4.8 ($0.50 read / $6.25 5-minute write), Claude Sonnet 5 ($0.20 / $2.50) and Claude
  Fable 5 ($1.00 / $12.50). Base rates are unchanged, so the rows are amended rather than
  superseded. Not applied to the Bedrock or OpenRouter rows on those models — those platforms price
  independently and the AWS rate card was unreachable.
- **Expires nine never-closed duplicate cost rows**, cutting concurrent-`Active` rows on the same
  model + vendor + processing type from 13 pairs to 2. Claude Sonnet 5 on Anthropic, Bedrock and
  OpenRouter (the launch row recorded introductory pricing through 2026-08-31 and a second row was
  added when that became standard; Anthropic now confirms the increase to $3/$15 will not occur);
  Claude 4 Opus, Claude 4 Sonnet, Llama 4 Maverick and Llama 4 Scout (exact duplicates from the
  January 2026 seed import); and GPT 5.6-terra and GPT 5.6-luna (older rows the 2026-07-30 rows
  already superseded). Every row is expired, never deleted, so the pricing history stays intact.
- **Sets `IsActive: false` on five models whose every inference route was already dropped** —
  Llama 2 70B / Groq, Gemini 1.5 Flash, Gemini 1.5 Pro, Gemini 2.5 Pro Preview and Gemini 2.5 Flash
  Preview. They were advertising themselves as active while being unreachable on every route.

No vendor was added and no model record was created.
