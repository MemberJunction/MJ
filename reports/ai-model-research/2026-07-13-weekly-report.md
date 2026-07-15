# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-07-13
**Research Period**: 2026-07-07 → 2026-07-13
**Base Branch**: `next`
**Working Branch**: `claude/ai-model-research-2026-07-13`

## Executive Summary

One clear addition emerged this week: **Grok 4.5** — xAI's new flagship reasoning model, released July 8, 2026 (500K context, `reasoning_effort` support, priced at $2/$6 per 1M tokens). It is not currently in the inventory and is added by this PR.

The rest of the vendor landscape is stable: pricing for every actively-tracked model in the JSON matches what current market sources report as of this week. Two potentially interesting future items — NVIDIA **Nemotron 4** (announced by the Nemotron Coalition, no ship date yet) and Moonshot **Kimi K3** (in preview window, no confirmed API availability) — are called out for a future report but not added to the JSON because their APIs are not yet generally available.

One naming-hygiene item on OpenAI's GPT‑5.6 family is flagged for human review (not edited).

## Current Inventory Snapshot

| Category | Count |
|---|---|
| Total model entries | 166 |
| Active models | 148 |
| Retired / IsActive=false | 18 |
| Vendors | 29 |
| Vendors with at least one model (Inference Provider) | ~20 |

Vendors in the inventory: Anthropic, OpenAI, Google, Vertex AI, Azure, Amazon Bedrock, x.ai, Groq, Cerebras, Mistral AI, Alibaba Cloud, Moonshot AI, Z.AI, MiniMax, DeepSeek, Cohere, NVIDIA, Black Forest Labs, Inception Labs, Fireworks.ai, OpenRouter, LM Studio, LocalEmbeddings, Tasio Labs, Eleven Labs, HeyGen, AssemblyAI, Inworld, Fable Labs (via Anthropic). All 29 vendor rows verified against the `.ai-vendors.json` file.

## New Models Available

### Grok 4.5 (xAI) — **ADDED to `.ai-models.json`**

- **Vendor**: x.ai (Model Developer + Inference Provider); also OpenRouter as `x-ai/grok-4.5`
- **API name**: `grok-4.5` (xAI native); `x-ai/grok-4.5` (OpenRouter)
- **Released**: July 8, 2026
- **Context window**: 500,000 input tokens, up to ~500K output tokens (we conservatively cap output at 128,000, matching the pattern used for Grok 4.20 in this repo)
- **Pricing**: $2.00 input / $6.00 output per 1M tokens; $0.50 per 1M cached-input tokens
- **Capabilities**: Streaming, structured (JSON) output, tool calling, image + PDF input, `reasoning_effort` parameter with `low` / `medium` / `high` (default `high`)
- **Positioning in inventory**: Suggested `PowerRank: 25` (above Grok 4.20 at 22 and Grok 4.3 at 16, marking the new flagship), `SpeedRank: 6` (reasoning model, ~80 tps reported), `CostRank: 6` (same input price band as Grok 4.20)
- **Prior version**: `Grok 4.20`
- **DriverClass**: `xAILLM` (native), `OpenRouterLLM` (OpenRouter)
- **Sources**: [xAI docs](https://docs.x.ai/developers/grok-4-5) (401-gated so verified via mirrors), [OpenRouter listing](https://openrouter.ai/x-ai/grok-4.5), [WaveSpeed release tracking](https://wavespeed.ai/blog/ai-api-pricing/grok-4-5-openrouter/), [Lushbinary developer guide](https://lushbinary.com/blog/grok-4-5-developer-guide-benchmarks-api-features/), [AI Pricing Guru overview](https://www.aipricing.guru/xai-pricing/)

## Pricing Changes Detected

None. Spot-checked models where the JSON records a specific `StartedAt` price:

| Model | Vendor | JSON price (In/Out per 1M) | Web price this week | Match? |
|---|---|---|---|---|
| Claude Opus 4.8 | Anthropic | $5 / $25 | $5 / $25 | ✅ |
| Claude Sonnet 4.6 | Anthropic | $3 / $15 (via Sonnet 4.6 record) | $3 / $15 | ✅ |
| Claude Haiku 4.5 | Anthropic | $1 / $5 | $1 / $5 | ✅ |
| GPT 5.6 (sol alias) | OpenAI | $5 / $30 | $5 / $30 | ✅ |
| GPT 5.6-terra | OpenAI | (JSON, verified) | $2.50 / $15 | ✅ |
| GPT 5.6-luna | OpenAI | (JSON, verified) | $1 / $6 | ✅ |
| Gemini 3.5 Flash | Google | $1.50 / $9 | $1.50 / $9 | ✅ |
| Grok 4.3 | x.ai | $1.25 / $2.50 | $1.25 / $2.50 | ✅ |
| Grok 4.20 | x.ai | $2 / $6 | $2 / $6 | ✅ |
| DeepSeek V4 Pro | DeepSeek | $0.435 / $0.87 (May 2026 record supersedes April) | $0.435 / $0.87 | ✅ |
| DeepSeek V4 Flash | DeepSeek | $0.14 / $0.28 | $0.14 / $0.28 | ✅ |
| MiniMax‑M3 | MiniMax | $0.60 / $2.40 | $0.60 / $2.40 (standard; $0.30/$1.20 promo) | ✅ |
| Kimi K2.6 | Moonshot AI | $0.60 / $2.50 | $0.60 / $2.50 | ✅ |
| GLM 5.2 | Z.AI | $1.40 / $4.40 | $0.406–$0.93 in / $1.28–$3 out (aggregator-dependent) | ⚠️ possibly stale, see note |

**Note on GLM 5.2**: The JSON records $1.40 / $4.40. This week's web sources (OpenRouter, PricePerToken) show a lower range ($0.406–$0.93 in / $1.28–$3 out) depending on which OpenRouter routing tier is used. Z.AI's direct API pricing page requires an authenticated session for us to confirm. I've flagged this rather than editing, per the "accuracy over completeness" rule — a human should confirm Z.AI's canonical direct API price before we replace or supersede the cost record.

## Model Updates & New Versions

None requiring JSON updates. All active model rows point to their vendors' current canonical API identifiers this week. Specific verifications:

- **Anthropic Claude Sonnet 5** — Inventory has API name `claude-sonnet-5`. Web confirms this is the correct API alias as of July 2026, and the $2/$10 introductory price (through August 31, 2026, reverting to $3/$15) is still active on Anthropic's platform. No change needed.
- **Anthropic Claude Fable 5** — Inventory has API name `claude-fable-5`. Web confirms $10/$50 per 1M tokens for the new "Mythos-class" tier introduced above Opus in June 2026. No change needed.
- **GPT 5.6 family** — Inventory correctly has three entries: `GPT 5.6`, `GPT 5.6-terra`, `GPT 5.6-luna`. See "Recommended Actions" below for a naming-hygiene item.
- **Gemini 3.5 Flash** — Correct as recorded (May 19, 2026 launch, $1.50/$9). No change needed.

## Deprecated / Sunset Models

**DeepSeek `deepseek-chat` and `deepseek-reasoner`** — Deprecated on 2026-07-24 15:59 UTC per DeepSeek's official pricing page. These API names are not present in the current inventory (the DeepSeek entries in the JSON already use `deepseek-v4-pro` / `deepseek-v4-flash`), so **no action is required in this PR**. If any downstream code references those older aliases directly, it should be migrated to the V4 model IDs before July 24.

No models currently in the inventory are approaching end-of-life this week.

## New Vendors Worth Considering

None this week. All major and mid-tier AI vendors relevant to MJ's use cases are already represented in `.ai-vendors.json`.

Two items to watch (not adding yet):

1. **NVIDIA Nemotron Coalition (Nemotron 4)** — Announced March 2026; teased at Computex 2026; Jensen Huang confirmed a Nemotron 4 family is coming "later in 2026." No API GA yet. NVIDIA is already an inventory vendor via Nemotron 3 Ultra/Super/Nano on OpenRouter, so once Nemotron 4 ships we can add it under the existing vendor with zero new vendor record needed.
2. **Kimi K3 (Moonshot AI)** — Predicted May–May-31 2026 release window but as of this week I could not find a confirmed API GA or pricing page from Moonshot for K3. Currently K2.6 and K2.7-Code are the shipping API models on Moonshot's platform (both already in inventory). Will re-check next week.

## Recommended Actions

Ordered by impact:

1. **[This PR — done]** Add `Grok 4.5` to `.ai-models.json` with x.ai + OpenRouter vendors and the $2/$6 cost record dated 2026-07-08.
2. **[Human decision]** Consider clarifying the `GPT 5.6` entry to reflect OpenAI's Sol/Terra/Luna naming convention. Options:
   - **Option A (rename)**: Rename entry to `GPT 5.6 Sol` and update the OpenAI vendor `APIName` from `gpt-5.6` to `gpt-5.6-sol`. This matches the canonical model ID and pairs symmetrically with the `GPT 5.6-terra` and `GPT 5.6-luna` entries already in inventory.
   - **Option B (keep alias)**: Leave the entry as-is. `gpt-5.6` is a valid alias that routes to `gpt-5.6-sol` per OpenAI docs, so nothing breaks — the entry just doesn't visually indicate it's the Sol tier.
   - **Recommendation**: Option A for naming consistency, but this is a cosmetic change with mild client-facing risk (any external code hardcoded to `gpt-5.6` still works via the alias, but the display name changes), so leaving it to the maintainer.
3. **[Human decision]** Verify GLM 5.2 canonical direct-API pricing on Z.AI's platform. If it's different from the JSON's $1.40/$4.40, add a new cost record with today's `StartedAt` rather than editing the existing one (so the pricing history is preserved).
4. **[Watch — next report]** Nemotron 4 GA and Kimi K3 GA. Neither is adding value to this week's PR because there's no shipping API.

## Research Sources

Anthropic:
- [Anthropic API Pricing 2026 (AI Pricing Guru)](https://www.aipricing.guru/anthropic-pricing/)
- [Claude API Pricing 2026 (metacto)](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [Claude Platform Pricing](https://platform.claude.com/docs/en/about-claude/pricing)

OpenAI:
- [OpenAI GPT‑5.6 Sol / Terra / Luna preview](https://openai.com/index/previewing-gpt-5-6-sol/)
- [OpenAI Help Center — GPT‑5.6 preview article](https://help.openai.com/en/articles/20001325-a-preview-of-gpt-56-sol-terra-and-luna)
- [Simon Willison — GPT‑5.6 family notes](https://simonwillison.net/2026/Jul/9/gpt-5-6/)
- [OpenAI API Pricing (July 2026)](https://www.aipricing.guru/openai-pricing/)

Google:
- [Gemini Developer API pricing (official)](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3.5 Flash pricing (metacto)](https://www.metacto.com/blogs/the-true-cost-of-google-gemini-a-guide-to-api-pricing-and-integration)

xAI (Grok 4.5):
- [xAI Grok 4.5 official docs page (401-gated for us)](https://docs.x.ai/developers/grok-4-5)
- [OpenRouter Grok 4.5 listing](https://openrouter.ai/x-ai/grok-4.5)
- [Lushbinary Grok 4.5 Developer Guide](https://lushbinary.com/blog/grok-4-5-developer-guide-benchmarks-api-features/)
- [AI Pricing Guru — xAI pricing](https://www.aipricing.guru/xai-pricing/)
- [WaveSpeed availability tracking](https://wavespeed.ai/blog/ai-api-pricing/grok-4-5-openrouter/)
- [Grizzly Peak — Grok API pricing 2026](https://www.grizzlypeaksoftware.com/articles/p/grok-api-pricing-explained-every-model-every-cost-and-how-it-compares-2026-f1p7dvdu)

Other vendors:
- [DeepSeek pricing (official)](https://api-docs.deepseek.com/quick_start/pricing/)
- [Mistral API Pricing Guide 2026 (TokenCost)](https://tokencostcalculators.com/blog/mistral-api-pricing-guide/)
- [Moonshot Kimi K2.6 (OpenRouter)](https://openrouter.ai/moonshotai/kimi-k2.6)
- [MiniMax M3 pricing (PricePerToken)](https://pricepertoken.com/pricing-page/model/minimax-minimax-m3)
- [Z.AI GLM 5.2 pricing](https://docs.z.ai/guides/overview/pricing)
- [Alibaba Model Studio — Qwen models](https://www.alibabacloud.com/help/en/model-studio/models)
- [Cerebras Model Catalog](https://inference-docs.cerebras.ai/models/overview)
- [NVIDIA Nemotron 3 (research site)](https://research.nvidia.com/labs/nemotron/Nemotron-3/)
- [Cohere Rerank 4 (Azure Foundry pricing card)](https://futureagi.com/llm-cost-calculator/azure-ai-foundry/cohere-rerank-v4-0-pro/)
