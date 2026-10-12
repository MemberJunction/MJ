---
"@memberjunction/ai": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
---

AI model & vendor metadata refresh (weekly research run, 2026-10-05).

Most vendor documentation sites are unreachable from this session, but three first-party sources are:
`platform.claude.com`, AWS's machine-readable Price List API, and the documentation repositories
several vendors publish their docs sites from. Everything below is verified against one of those, or
is a self-contained consistency repair needing no vendor data. No new model and no new vendor is
included. The full candidate list — including three live mispricings on hosts that could not be
reached, and four MJ routes that retire within 15 days — is in
`reports/ai-model-research/2026-10-05-weekly-report.md`.

- **Fixes two Cohere reranker API ids that would 404 on every call.** Cohere spells its v4 rerankers
  `rerank-v4.0-pro` and `rerank-v4.0-fast`; MJ had the `.0` missing on both. The record *names* are
  deliberately unchanged, because `metadata/prompts/.default-rerank-prompt.json` resolves these
  models by name — renaming them would break `mj sync push`. Also sets the published 4,096-token
  context length on `rerank-v3.5` and `rerank-multilingual-v3.0`.
- **Corrects Claude Sonnet 4.5's output cap from 8,192 to 64,000** on all three routes — Anthropic
  publishes 64K, so the recorded figure was wrong by nearly 8× and would have truncated long
  generations. Marks the Anthropic route `Deprecated` (announced 2026-09-30, retires 2026-11-30,
  replaced by Claude Sonnet 5.5) while leaving the cost row `Active`, since it serves until then.
- **Corrects Claude Sonnet 4.6's context window to 1,000,000 and its output cap to 128,000** on all
  three routes (recorded as 200,000 / 64,000).
- **Corrects three prices**, expiring the superseded row in each case: `mistral-large-latest`
  $4/$12 → **$0.50/$1.50** (the alias now resolves to Mistral Large 3; an 8× overstatement on
  input), `mistral-medium-latest` $2.75/$8.10 → **$1.50/$7.50**, and Amazon Bedrock GPT-OSS-20B
  output $0.20 → **$0.30**. Also corrects the Mistral Medium 3.5 id to `mistral-medium-3-5`.
- **Fills the published prompt-cache rates** on eight cost rows that had none — Anthropic's own rows
  for Opus 4.8, Sonnet 5 and Fable 5, and Amazon Bedrock's for Opus 4.8, Sonnet 5, Fable 5 and
  Fable 5.1. Base rates are unchanged, so the rows are amended rather than superseded.
- **Retires the Magistral 1.2 pair on their Mistral-direct route**, which Mistral shut down
  2026-07-31: vendor row `Inactive`, cost row `Expired` with `EndedAt`. The Amazon Bedrock and
  OpenRouter routes are untouched — AWS still sells the Bedrock edition.
- **Expires nine never-closed duplicate cost rows**, cutting concurrent-`Active` rows on the same
  model + vendor + processing type from 13 pairs to 2. Claude Sonnet 5 on three vendors (the launch
  row recorded introductory pricing through 2026-08-31 and a second row was added when that became
  standard; Anthropic now confirms the increase to $3/$15 will not occur); Claude 4 Opus, Claude 4
  Sonnet, Llama 4 Maverick and Llama 4 Scout (exact duplicates from the January 2026 seed import);
  and GPT 5.6-terra and GPT 5.6-luna (older rows the 2026-07-30 rows already superseded). Every row
  is expired, never deleted, so the pricing history stays intact.
- **Sets `IsActive: false` on five models whose every inference route was already dropped** —
  Llama 2 70B / Groq, Gemini 1.5 Flash, Gemini 1.5 Pro, Gemini 2.5 Pro Preview and Gemini 2.5 Flash
  Preview. They were advertising themselves as active while being unreachable on every route.
