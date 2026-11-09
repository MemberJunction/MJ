# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-10-02
**Research Period**: 2026-09-28 → 2026-10-02
**Base Branch**: `release/v6.2-edge2-prep`
**Research Branch**: `claude/ai-model-research-2026-10-02`

> **Off-cycle run.** This report was run by hand for the v6.2.0-edge.2 release (`DEPLOYMENT.md`
> Step 2), because the last scheduled report (2026-09-28) already shipped in v6.2.0-edge.1. It
> targets the release prep branch rather than `next` and reaches `next` through the post-publish
> back-merge. The four-day window is shorter than usual.

---

## Executive Summary

Two frontier models shipped in the window: **Claude Sonnet 5.5** (2026-09-28) and **GPT-6.1 Sol**
(2026-09-29), both at $2/$10 per 1M. Three open items from last week are now closed with primary
sources: Opus 5.5 on Bedrock, GPT-6 Sol and Luna on Azure, and the GLM 5.3 OpenRouter output cap.
Seven vendor routes that were already shut down still read `Active`, and this run retires them.

## Current Inventory Snapshot

- **211 models** in `.ai-models.json` (209 before this run), **182 active**, plus 4 Cohere rerankers
  in `.cohere-reranker-models.json`.
- **36 vendors** in `.ai-vendors.json`, unchanged.

## New Models Available

| Model | Vendor routes added | API ID | Price (in/out per 1M) | Limits | Status |
|---|---|---|---|---|---|
| **Claude Sonnet 5.5** | Anthropic, Amazon Bedrock, OpenRouter | `claude-sonnet-5-5` | $2/$10, cache read $0.20, 5m write $2.50 | 1M ctx / 128K out | **[Applied]** |
| **GPT-6.1 Sol** | OpenAI, Azure, Amazon Bedrock, OpenRouter | `gpt-6.1-sol` | $2/$10, cache read $0.10, write $2.50 | 922K in / 128K out | **[Applied]** (no Azure cost row) |
| Cohere Embed 5 Pro / Fast | — | `embed-v5.0-pro`, `embed-v5.0-fast` | No official per-token price; Model Vault hosting only | 128K ctx | [Flagged] |
| FLUX 3 Image (Black Forest Labs) | — | unverified on the native API | Per image: $0.041 (768) to $0.607 (4K) | — | [Flagged] (image cost schema, item 14) |
| Ling 3.1 Flash (inclusionAI) | — | `inclusionai/ling-3.1-flash` (OpenRouter) | Free until 2026-10-13 | 262K ctx / 32K out | [Flagged] (aggregator sources only) |

- **Claude Sonnet 5.5** is the named replacement for `claude-sonnet-4-5-20250929`. It keeps Sonnet
  5's price, defaults effort to `high`, and rejects non-default sampling parameters and forced tool
  use. `PriorVersionID` → Claude Sonnet 5. Ranks: Power 23, Speed 7, Cost 5.
- **GPT-6.1 Sol** keeps GPT-6 Sol's headline rate but halves cached input to $0.10. The >272K
  long-context tier ($4/$15) is not modelled, as with GPT-6 Sol. `PriorVersionID` → GPT-6 Sol.
  Ranks: Power 26, Speed 8, Cost 5. The Bedrock row has no cache prices because the AWS model card
  says Bedrock does not expose explicit prompt caching for it. GPT-6.1 Sol Pro is not modelled.

## Pricing Changes Detected

| Model | Vendor | Previous (In/Out) | Current (In/Out) | Change | Status |
|---|---|---|---|---|---|
| GPT-OSS-120B | Groq | $0.15/$0.75 | $0.15/$0.60 | output −20% | [Applied] |
| GPT-OSS-20B | Groq | $0.10/$0.50 | $0.075/$0.30 | −25% / −40% | [Applied] |
| GPT-OSS-120B | Cerebras | $0.25/$0.69 | $0.35/$0.75 | +40% / +9% | [Applied] |
| GLM 5.1 | Z.AI | $0.95/$3.15 | $1.40/$4.40 (cache $0.26) | +47% / +40% | [Applied] |
| Kimi K2.6 | Moonshot AI | $0.60/$2.50 | $0.95/$4.00 per official page | — | [Flagged] (a third party quotes $0.55/$2.65) |
| DeepSeek V4 Pro | DeepSeek | $0.66/$1.98 | unchanged off-peak; peak $1.32/$3.96 | — | [Flagged] |

None of the applied vendors publishes when its price changed. Each superseded row is expired on
2026-10-02, the observation date, and the new row starts that day.

Also recorded, not price changes:
- **Claude Opus 5.5 / Bedrock**: global $4/$20, cache read $0.20, 5m write $5. **[Applied]**
- **GPT-6 Sol / Azure**: $2/$10, cache $0.20, write $2.50. **[Applied]**
- **GPT-6 Luna / Azure**: $0.10/$0.50, cache $0.01, write $0.125. **[Applied]** Both Azure rates
  come from the Azure Retail Prices API (Global Standard).
- **GLM 5.3 / OpenRouter**: $1.40/$4.40, cache read $0.14. The route had no cost row. **[Applied]**

The OpenRouter model-level price moved on 15 routes MJ records, including Qwen 3 Coder 480B,
GLM 4.6/4.7, the MiniMax M2.5/M2.7/M3 family, the Qwen 3.5–3.7 family and GLM 5.2. OpenRouter's
headline price is its cheapest live provider and moves without notice, so these were **not**
re-rated. **[Flagged]** Decide whether OpenRouter cost rows should track that figure at all.

## Model Updates & New Versions

- **GLM 5.3 / OpenRouter** `MaxOutputTokens` 128,000 → **131,072**
  (`top_provider.max_completion_tokens`). The 1,048,576 figure was the context length. **[Applied]**
  Closes the item open since 2026-09-21.
- **DeepSeek**: `deepseek-v4-flash` was retired as a name on 2026-09-10 and now routes to
  `deepseek-flash` (V4.1 Flash). The MJ route still reads Active and still resolves, so it is left
  alone. **[Flagged]**
- **x.ai**: `grok-code-fast-1` is now an alias of `grok-build-0.1` and bills at $1/$2. MJ records
  $0.20/$1.50. The alias change has no published date. **[Flagged]**
- **OpenAI**: `gpt-5.6` is an alias of `gpt-5.6-sol`. **gpt-5.6-sol** is $4/$20 (promotional
  through 2026-11-21, post-promo rate unpublished), 1.05M context, 128K out. Still not added.
  **[Flagged]**

## Deprecated / Sunset Models

**Applied: routes already shut down but still recorded as Active.** These use the §0.2 recipe:
the vendor row goes Inactive, and the paired cost row goes Expired with `EndedAt`.

| Model | Route | Shut down | Cost row expired |
|---|---|---|---|
| Gemma 4 31B Instruct | Cerebras `gemma-4-31b` | 2026-09-03 | yes |
| GLM 5.2 | Fireworks `glm-5p2` | 2026-09-26 | yes |
| Nano Banana Pro | Google `gemini-3-pro-image-preview` | 2026-06-25 | yes |
| Gemini 2.0 Flash | Google `gemini-2.0-flash` | 2026-06-01 | no Google cost row |
| Gemini 2.0 Flash-Lite | Google `gemini-2.0-flash-lite` | 2026-06-01 | no Google cost row |
| Llama 3.1 70b | Cerebras `llama3.1-8b` | 2026-05-27 | no cost row |
| Groq Compound | Groq `compound-beta` | 2026-09-21 | no cost row; model `IsActive: false` (Groq was its only vendor) |

- **Vertex AI** rows for Gemini 2.0 Flash / Flash-Lite were not verified and are untouched.
- **Cerebras `llama3.1-8b`** sits on the *Llama 3.1 70b* record. That is a data error predating this
  run. **[Flagged]**
- **Groq `compound-beta`**: Groq's notice names `groq/compound` and `compound-mini`.
  `compound-beta` is the pre-GA name of `groq/compound`, so it is retired with them. Re-check if
  anyone relies on it.

**Announced, not yet effective: left Active.** Apply on or after the date.

| Date | Vendor | IDs | Replacement |
|---|---|---|---|
| 2026-10-09 | OpenRouter | `qwen/qwen3.6-max-preview`, `qwen/qwen3-235b-a22b-thinking-2507` | — |
| 2026-10-14 | Azure | `gpt-4.1-nano` (2025-04-14) | — |
| 2026-10-15 | Azure | `gpt-4o-mini-tts` (2025-03-20) | — |
| 2026-10-20 | OpenRouter | `google/gemini-2.5-flash`, `-flash-lite`, `-pro` | — |
| 2026-10-23 | OpenAI | `gpt-4.1-nano`, `o1`, `o1-pro`, `o3-mini`, `o4-mini`, `gpt-image-1`, `gpt-4o-2024-05-13` (snapshot only) | gpt-5.6-sol / -terra / -luna, gpt-image-2.5-* |
| 2026-10-23 | Azure | `gpt-image-1` | — |
| 2026-11-19 | Azure | `o1`, `o1-pro`, `o3`, `o3-mini`, `o4-mini` | — |
| 2026-11-30 | Anthropic | `claude-sonnet-4-5-20250929` | `claude-sonnet-5-5` |
| 2027-01-06 | OpenAI | `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts-*` | `gpt-realtime-2.1-mini` |
| 2027-04-01 | OpenAI | `gpt-5.3-codex`, `gpt-5.1`, `gpt-5.4-nano` | gpt-6-sol / gpt-6-luna |

The OpenAI 2026-10-23 tranche resolves last week's item 11. The `gpt-4o` alias is **not** in it;
only the 2024-05-13 snapshot is. `o3` is not in the OpenAI tranche, but Azure retires it 2026-11-19.

**Unverified removals: [Flagged].** Fireworks model pages show "Serverless Not supported" for nine
MJ routes, including qwen3-235b-a22b, gpt-oss-20b, glm-4p6/4p7 and kimi-k2p5. `qwen3p8-flash`
returns 404. It is not clear whether existing callers still work, so these were left alone. Also
flagged:
- Groq moved `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` to Enterprise-only on 2026-08-16.
- OpenRouter no longer lists `anthropic/claude-opus-5-fast` and `mistralai/magistral-*-2509`.
- Two OpenRouter IDs were renamed: `qwen/qwen3.8-max` → `-0902` and
  `mistralai/mistral-medium-3.5` → `mistral-medium-3-5`.

## New Vendors Worth Considering

- **inclusionAI (Ant Group)**: Ling 3.1 Flash, reachable through OpenRouter. No first-party docs
  found. Revisit after the free promo ends on 2026-10-13.

## Recommended Actions

1. **[Applied]** Add **Claude Sonnet 5.5** and **GPT-6.1 Sol**: 9 vendor rows, 6 cost rows.
2. **[Applied]** Add the missing cost rows for **Opus 5.5 / Bedrock**, **GPT-6 Sol / Azure** and
   **GPT-6 Luna / Azure**. **Closes items 4 and 5.**
3. **[Applied]** **GLM 5.3 / OpenRouter**: output cap 131,072, plus a cost row. **Closes the GLM 5.3
   half of item 17.**
4. **[Applied]** Re-rate four routes from vendors' own pricing pages: Groq GPT-OSS-120B/20B,
   Cerebras GPT-OSS-120B and Z.AI GLM 5.1.
5. **[Applied]** Retire seven shut-down routes (table above).
6. **[Flagged — calendar]** Apply the announced retirements on their dates, starting 2026-10-09.
   OpenAI's 2026-10-23 list is now confirmed. **Closes the scoping question in item 11.**
7. **[Flagged — new]** Re-check the Fireworks "Serverless Not supported" routes, the Groq
   Enterprise-only Llama routes and the renamed OpenRouter IDs.
8. **[Flagged — new]** Decide whether OpenRouter cost rows track OpenRouter's moving lowest-provider
   price (15 routes differ today).
9. **[Flagged — carried, now resolvable]** **DeepSeek V4 Pro** (item 17): the $0.66/$1.98 row is
   the off-peak tier. The $1.74/$3.48 and $0.435/$0.87 rows match no current tier, and no row
   carries the peak tier ($1.32/$3.96). The fix belongs in item 13's concurrent-Active-row pass.
10. **[Flagged — carried]** **Grok 4.7 `MaxOutputTokens`** (item 7): still unpublished by xAI.
    Leave at 128,000.
11. **[Flagged — carried]** **gpt-5.6-sol** (item 9): now fully specified (see above), but its
    $4/$20 is promotional with no post-promo rate. Add once that is published.
12. **[Flagged — new]** **Kimi K2.6** price conflict, **`grok-code-fast-1`** alias billing, and
    **`kimi-k2.7-code-highspeed`** ($1.90/$8, missing).
13. **[Flagged — new]** **Cohere Embed 5** needs an official per-token price; **FLUX 3 Image** joins
    item 14.
14. **[Flagged — carried, unchanged]** Items 3, 6, 8, 10, 12, 13, 14, 15 and 16 from the 2026-09-28
    report. This run did not touch them.

## Research Sources

- Anthropic: https://platform.claude.com/docs/en/models/sonnet-5-5/overview ;
  https://platform.claude.com/docs/en/about-claude/pricing ;
  https://platform.claude.com/docs/en/about-claude/model-deprecations
- OpenAI: https://developers.openai.com/api/docs/changelog ;
  https://developers.openai.com/api/docs/models/gpt-6.1-sol ;
  https://developers.openai.com/api/docs/models/gpt-5.6-sol ;
  https://developers.openai.com/api/docs/pricing ; https://developers.openai.com/api/docs/deprecations
- AWS: https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/us-east-1/index.json ;
  https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-1-sol.html ;
  https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html
- Azure: https://prices.azure.com/api/retail/prices ;
  https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule
- Google: https://ai.google.dev/gemini-api/docs/deprecations ; https://ai.google.dev/gemini-api/docs/changelog
- OpenRouter: https://openrouter.ai/api/v1/models ; https://openrouter.ai/api/v1/models/z-ai/glm-5.3/endpoints
- Groq: https://console.groq.com/docs/models ; https://console.groq.com/docs/deprecations
- Cerebras: https://inference-docs.cerebras.ai/models/openai-oss.md ;
  https://inference-docs.cerebras.ai/support/deprecation
- Fireworks: https://docs.fireworks.ai/updates/changelog ; https://docs.fireworks.ai/serverless/pricing.md
- Z.AI: https://docs.z.ai/guides/overview/pricing ; Moonshot: https://platform.kimi.ai/docs/pricing/chat
- DeepSeek: https://api-docs.deepseek.com/quick_start/pricing ; https://api-docs.deepseek.com/updates
- x.ai: https://docs.x.ai/docs/models/grok-4.7 ; https://docs.x.ai/docs/release-notes
- Mistral: https://docs.mistral.ai/getting-started/changelog/
- Cohere: https://docs.cohere.com/changelog/embed-v5
- Black Forest Labs: https://docs.bfl.ai/release-notes ; https://docs.bfl.ai/quick_start/pricing
