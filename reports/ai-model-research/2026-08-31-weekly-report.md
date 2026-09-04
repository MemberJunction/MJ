# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-08-31
**Research Period**: 2026-08-25 → 2026-08-31
**Base Branch**: `next`
**Research Branch**: `claude/ai-model-research-2026-08-31`

---

## Executive Summary

Four moves this week. Two Chinese open-weights **Flash-tier launches on the same day (2026-08-26)** reset the low-cost frontier: **Z.AI's GLM-5.3-Flash** (MIT-licensed, 320B-A18B MoE, 1.3M context, ~$0.05/$0.17 per 1M on OpenRouter — 50% promo through Sept 9) and **Alibaba's Qwen3.8-Flash** (125B, 1M context, $0.15/$0.47 per 1M). Both are added in this PR. **xAI's Grok 4.6 landed on Amazon Bedrock** with cross-region inference at direct-API price parity — added as a Bedrock vendor row plus cost record. **Moonshot AI completes the full sunset of `moonshotai/Kimi-K2.5`** (and the `moonshot-v1-*` series) on 2026-08-31 — the Moonshot direct vendor row and cost record are flipped to `Inactive`; Fireworks.ai and OpenRouter passthrough rows are left Active pending confirmation, matching the prior week's GLM-4.7-on-Cerebras deactivation pattern. Nothing new from Anthropic, OpenAI, Google, Mistral, MiniMax, BFL, Cohere, Meta, NVIDIA, Thinking Machines, or Inception this week.

---

## Current Inventory Snapshot

- **Total models**: 189 (in `metadata/ai-models/.ai-models.json`) + 4 (in `.cohere-reranker-models.json`) = **193 model records**
- **Total vendors** (`metadata/ai-vendors/.ai-vendors.json`): 30

Coverage across major vendors (delta versus 2026-08-24 in **bold**):

| Vendor | Active Model Count (approx.) | Latest In-Inventory Model | Newest Cost Record |
|---|---:|---|---|
| Anthropic | 8 | Claude Opus 5 (Jul 24) | 2026-09-01 (Sonnet 5 permanent) |
| OpenAI | 20 | GPT 5.6 family (Jul 30 repricing) | 2026-07-30 |
| Google / Vertex AI | 12 | Gemini 3.7 Flash | 2026-08-13 |
| xAI | 8 | Grok 4.6 (Aug 12, **now on Bedrock**) | **2026-08-25** |
| Mistral AI | 8 | Mistral Medium 3.5, Magistral 1.2 | 2026 mid-year |
| DeepSeek | 2 | V4 Pro / V4 Flash | 2026-08-16 |
| Moonshot AI | 3 | Kimi K3 / K3 Fast; **K2.5 sunset on Moonshot direct** | 2026-07-27 |
| Alibaba Cloud (Qwen) | **13** | **Qwen3.8-Flash (Aug 26)** | **2026-08-26** |
| Z.AI (GLM) | **9** | **GLM-5.3-Flash (Aug 26)** | **2026-08-26** |
| MiniMax | 4 | MiniMax-M3 | 2026-06-01 |
| Thinking Machines Lab | 2 | Inkling / Inkling Small | 2026 mid-year |
| NVIDIA | 3 | Nemotron 3 Ultra / Super / Nano | 2026 mid-year |
| Groq (inference) | many via passthroughs | Kimi K2.5, Qwen 3 32B, GPT-OSS-* | — |
| Cerebras (inference) | 3 direct: GPT-OSS-120B, Gemma 4 31B; GLM-4.7 deprecated Aug 17 | — | — |
| Fireworks.ai (inference) | many via passthroughs (**+ GLM-5.3-Flash, + Qwen3.8-Flash**) | GLM 5.2, Kimi K3, etc. | — |
| OpenRouter (gateway) | most models mirrored (**+ GLM-5.3-Flash, + Qwen3.8-Flash**) | — | — |
| Cohere | 1 embedding + 4 rerankers (separate file) | rerank-v4-pro / rerank-v4-fast | Dec 2025 |
| Black Forest Labs | 2 image gen | FLUX.2 Pro, FLUX 1.1 Pro | 2025-10-01 |
| Inception Labs | 2 diffusion LLM | Mercury 2, Mercury Edit 2 | — |
| Amazon Bedrock (gateway) | Anthropic, GPT-OSS, Magistral, **+ Grok 4.6** | — | **2026-08-25** |

---

## New Models Available

### 1. Z.AI — **GLM-5.3-Flash** *(NEW — added in this PR)*

- **Released**: 2026-08-26
- **Vendor / Developer**: Z.AI (Zhipu AI) — existing vendor
- **Positioning**: Cost-tier Flash companion to GLM-5.3. 320B total / 18B active parameters (MoE), MIT-licensed open weights, native multimodal (text/image/video/agentic), **1.3M-token input context, 131,072-token max output**.
- **Backstory**: Surfaced Aug 20 on OpenRouter as the "Ox Alpha" stealth preview (1M context, tool calling, text/image/video input) before being de-anonymised as GLM-5.3-Flash on Aug 26. Reportedly reached #1 on OpenRouter's usage leaderboard shortly after launch.
- **Pricing**: **Z.AI direct** $0.15 / $0.50 per 1M input / output (cache read ~$0.016/1M). **OpenRouter** $0.05 / $0.1667 per 1M reflecting a limited-time 50% Z.AI promo through **2026-09-09 16:00 UTC** — a follow-up cost row should be added when that promo expires so the historical rate is preserved.
- **Applied**: Model record with Z.AI as both Model Developer and Inference Provider, plus OpenRouter and Fireworks.ai inference rows and cost records for Z.AI direct + OpenRouter (Fireworks pricing not yet posted).
- **Ranks assigned**: PowerRank **17** (below the GLM-5.3 flagship at 23; above GLM 5.2's 22 does not apply — this is the Flash tier), SpeedRank **10**, CostRank **2**. Calibrated against Gemini 3.6 Flash (P22 S12 C3), Gemini 3.1 Flash-Lite (P16 S12 C2), and Qwen 3.7 Flash (S/C similar low-cost tier).
- **Sources**:
  - <https://openrouter.ai/z-ai/glm-5.3-flash>
  - <https://www.orcarouter.ai/blog/glm-5-3-flash-release>
  - <https://kie.ai/blog/what-is-glm-5-5>
  - <https://www.explainx.ai/blog/ox-alpha-what-we-know-mystery-ai-model-august-2026>

### 2. Alibaba Cloud — **Qwen3.8-Flash** *(NEW — added in this PR)*

- **Released**: 2026-08-26
- **Vendor / Developer**: Alibaba Cloud (Qwen) — existing vendor
- **Positioning**: Cost-tier Flash companion to Qwen 3.8 Max. 125B parameters, multimodal reasoning (text / image / video / agentic), **1,000,000-token input context, 131,072-token max output**.
- **Pricing**: **Alibaba Cloud Model Studio** $0.15 / $0.47 per 1M input / output (cache hits ~$0.016/1M). **OpenRouter** matches direct pricing.
- **Applied**: Model record with Alibaba Cloud as both Model Developer and Inference Provider, plus OpenRouter and Fireworks.ai inference rows and cost records for Alibaba direct + OpenRouter (Fireworks pricing not yet posted; the vendor row is added so the routing target exists).
- **Ranks assigned**: PowerRank **15**, SpeedRank **10**, CostRank **2**. Calibrated against Qwen 3.7 Flash (low-cost tier).
- **Adjacent (flagged, not added)**: **Qwen3.8-Flash-Next** surfaced as an **open-weight preview of the Qwen4 architecture** (6B active params, 262K native context) — see aireleasetracker. Deferred as a preview until Alibaba posts an API rate for it.
- **Sources**:
  - <https://www.bloomberg.com/news/articles/2026-08-26/alibaba-releases-smaller-cost-effective-qwen-ai-model>
  - <https://mpost.io/alibaba-prices-qwen3-8-flash-api-at-0-16-per-million-tokens-cutting-inference-costs-for-125b-parameter-model/>
  - <https://openrouter.ai/qwen/qwen3.8-flash>

### 3. xAI — **Grok 4.6 on Amazon Bedrock** *(NEW inference-provider vendor row — added in this PR)*

- **Availability announced**: week of 2026-08-25
- **Model**: existing `Grok 4.6` row — no new top-level model added.
- **Scope**: US Geo and Global cross-region inference; 500K context; reasoning-effort levels (low / medium / high / xhigh) exposed. Same headline $2/$6 per 1M sub-200K tier as the x.ai direct API; the tiered long-context rate above 200K is documented in the existing x.ai cost record's Comments field.
- **Applied**: added a **Bedrock Inference Provider vendor row** (`xai.grok-4-6-v1:0`, Priority 5) and a matching **Bedrock cost record** starting 2026-08-25 at vendor parity with x.ai direct.
- **Sources**:
  - <https://x.ai/news/grok-4-6-amazon-bedrock>
  - <https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-bedrock-grok-4-6/>

### 4. DeepSeek — **V4 Flash Vision Experimental** *(NEW — flagged, not applied)*

- **Released**: 2026-08-21 (DeepSeek API changelog); propagated to the LLM Gateway and OpenRouter this week (Aug 27).
- **Positioning**: DeepSeek V4 Flash with an experimental vision head; billed as a preview endpoint.
- **Why not applied**: No pricing has been published for the vision variant at the platform level; there is no obvious API identifier fixed by DeepSeek yet, and treating it as an update to `DeepSeek V4 Flash` would confuse two cost profiles. Preferred handling: watch for the pricing announcement and then decide between adding a separate model record or extending `DeepSeek V4 Flash` with an "-vision-preview" APIName vendor row.
- **Sources**:
  - <https://api-docs.deepseek.com/updates/>
  - <https://llmgateway.io/timeline>

### 5. OpenAI — **Daybreak Red and Daybreak Blue on Bedrock** *(NEW variants — flagged, not applied)*

- **Availability**: available to eligible AWS customers this week — Daybreak Red = "GPT-5.6 Cyber"; Daybreak Blue = GPT-5.6 Sol with defensive-cyber calibration.
- **Why not applied**: modelling ambiguity — these are either variant model records or vendor rows on the existing `GPT 5.6` (Sol) entry, and OpenAI hasn't published an ordinary-API-key rate for either variant. Recommend the human owner choose the modelling approach before adding rows.
- **Sources**:
  - <https://openai.com/index/daybreak-models-are-now-available-on-aws/>
  - <https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-bedrock-cross-region-openai-v2/>

### 6. OpenAI — **Astra** *(NEW — flagged, not applied)*

- **Named**: Aug 1 research post as "the next major model." No API identifier, no date, no price as of 2026-08-31.
- **Why not applied**: Guideline #1 (accuracy over completeness) — nothing to add until an API name and rate exist.

---

## Pricing Changes Detected

None new this week. Notable non-changes:

- **Claude Sonnet 5** — the previously-announced 2026-09-01 hike from $2/$10 to $3/$15 is officially **cancelled**; Anthropic reiterated on its pricing page ahead of the Aug 31 sunset that the $2/$10 introductory rate is now the permanent standard price. The inventory already carries the correct `$2/$10` cost records dated 2026-09-01 across Anthropic direct, Amazon Bedrock, and OpenRouter — these were added in an earlier week in anticipation of a revert and now correctly reflect the confirmed permanent rate. **No action needed.**
- **Azure OpenAI cache-write charges** effective 2026-08-21 — the first full billing week of the new charge. Applies to caching-heavy GPT-5.6 family architectures on Azure. Deferred: inventory schema stores a single `CacheWritePricePerUnit` per cost record, and Azure vendor rows on the GPT-5.6 family currently carry `null` there; updating requires the Azure per-model cache-write numbers, which the sources this week didn't surface line-item.
- **GPT-5.6 Sol** pricing conflict from the 2026-08-24 report — no new resolution this week.
- **DeepSeek V4 Pro** peak/off-peak pricing (2026-08-16 cost record) — still standing; no clarification from DeepSeek this week.

Sources:
- <https://platform.claude.com/docs/en/about-claude/pricing>
- <https://enterprisedna.co/resources/news/anthropic-claude-sonnet-5-pricing-permanent-reversal-august-2026/>
- <https://learn.microsoft.com/en-us/azure/foundry-classic/openai/whats-new>

---

## Model Updates & New Versions

### Grok 4.6 — Amazon Bedrock availability (applied above)

Same code path, wider reach. Bedrock vendor row + cost record added.

### Cerebras — CS-4 accelerator + GPT-5.6 Sol Ultrafast Mode

- CS-4 unveiled 2026-08-19; GPT-5.6 Sol "Ultrafast" (up to 750 output tok/s, up to 14× Standard) went to **waitlist** Aug 13. No inventory change — Ultrafast is not a distinct model, and Cerebras has not opened it to general availability yet.
- **Source**: <https://www.globenewswire.com/news-release/2026/08/13/3344804/0/en/cerebras-powers-ultrafast-mode-for-openai-s-gpt-5-6-sol.html>

### Groq — Series A + Groq 3 LPX to production

- Corporate news only ($350M Series A led by Disruptive, with NVIDIA participating; ~$3.5B valuation, Aug 17). Groq 3 LPX accelerator in full production Aug 24. No model catalog changes.
- **Source**: <https://groq.com/newsroom/groq-closes-usd350-million-series-a-building-the-world-s-leading-ai-inference-cloud>

### OpenRouter — Stripe acquisition still pending

- The Stripe / OpenRouter acquisition (>$7B, announced earlier in August) has not closed. No inventory impact.

---

## Deprecated / Sunset Models

### Moonshot AI — `moonshotai/Kimi-K2.5` sunset completes 2026-08-31

- Moonshot's platform docs confirm the full sunset of `moonshotai/Kimi-K2.5` and the `moonshot-v1-*` series on this date, paired with the Kimi K3 rollout that started in July. New signups have been blocked since the K3 launch.
- **Applied**: `Kimi K2.5` model's **Moonshot AI Inference Provider vendor row** (`Priority: 1`, APIName `moonshotai/Kimi-K2.5`) flipped to `Status: "Inactive"`, and the matching **Moonshot AI cost record** (StartedAt 2026-01-27) flipped to `Status: "Inactive"`. The Model Developer vendor row remains Active (attribution role, not a serving statement).
- **Not touched**: `Kimi K2.5` model's top-level `IsActive` stays `true`, and the Fireworks.ai and OpenRouter vendor rows and cost records stay Active — weights remain MIT-licensed and both providers may continue to serve the model. This mirrors the prior week's GLM-4.7-on-Cerebras pattern (only the deprecating vendor's row goes Inactive).
- **Source**: <https://platform.kimi.ai/docs/models>

### OpenAI — o3 in ChatGPT (Aug 26); DALL·E GPT in ChatGPT (Aug 30)

- ChatGPT product retirements — API endpoint access is unaffected. **No inventory action.** The `o3` and image-generation model rows serve API callers, who are not affected by the ChatGPT-side changes.
- **Source**: <https://help.openai.com/en/articles/9624314-model-release-notes>

---

## New Vendors Worth Considering

None identified this week.

**Watchlist** (unchanged from 2026-08-24):
- **Meta / Llama 5** — no dated release; Muse Spark 1.2 (Aug 5) and Muse Glimmer 30B (Aug 10) are the most recent Meta releases. Llama 4 Behemoth still in training.
- **Together AI** — still not present as a vendor; adding would primarily give an alternative Priority target on existing open-weight models.

---

## Recommended Actions

Ranked by confidence and impact:

1. **[Applied]** Add `GLM-5.3-Flash` — Z.AI as Model Developer + Inference Provider, OpenRouter and Fireworks.ai as Inference Providers, cost rows for Z.AI direct ($0.15/$0.50) and OpenRouter ($0.05/$0.1667 promo). Follow-up cost row will be needed on/after 2026-09-09 when the OpenRouter 50% promo expires.
2. **[Applied]** Add `Qwen3.8-Flash` — Alibaba Cloud as Model Developer + Inference Provider, OpenRouter and Fireworks.ai as Inference Providers, cost rows for Alibaba direct and OpenRouter (both at $0.15/$0.47).
3. **[Applied]** Add `Amazon Bedrock` Inference Provider vendor row and cost record to `Grok 4.6` at vendor parity with x.ai direct ($2/$6, sub-200K tier).
4. **[Applied]** Flip Moonshot AI Inference Provider vendor row and cost record on `Kimi K2.5` to `Status: "Inactive"` for the 2026-08-31 sunset; leave Fireworks.ai and OpenRouter Active pending confirmation.
5. **[Flagged, not applied]** Add `DeepSeek V4 Flash Vision Experimental` once DeepSeek posts a per-token rate — decide then between a new model record and an "-vision-preview" vendor row on the existing `DeepSeek V4 Flash`.
6. **[Flagged, not applied]** Decide the modelling for OpenAI **Daybreak Red / Daybreak Blue** on Bedrock — new model records vs. cyber-tuned vendor rows on `GPT 5.6`. Requires the human owner's call; no ordinary-API rate published yet.
7. **[Flagged, not applied — still open from prior weeks]** Reconcile `DeepSeek V4 Pro` cost record dated 2026-08-16 ($0.66/$1.98); resolve `GPT 5.6` (Sol) pricing conflict; consider a coordinated FLUX.2 family refresh (BFL had no news this week); update `DeepSeek V4 Pro` / `V4 Flash` descriptions with 0813 checkpoint / DSpark / effort-level notes.

---

## Research Sources

Anthropic / Claude:
- <https://platform.claude.com/docs/en/about-claude/pricing>
- <https://enterprisedna.co/resources/news/anthropic-claude-sonnet-5-pricing-permanent-reversal-august-2026/>

OpenAI:
- <https://help.openai.com/en/articles/9624314-model-release-notes>
- <https://deploymentsafety.openai.com/gpt-5-6-august-update>
- <https://openai.com/index/daybreak-models-are-now-available-on-aws/>

Google / Gemini:
- <https://ai.google.dev/gemini-api/docs/changelog>
- <https://www.axios.com/2026/08/13/google-gemini-37-flash>

Mistral:
- <https://releasebot.io/updates/mistral>
- <https://aireleasetracker.com/company/mistral>

xAI / Grok:
- <https://x.ai/news/grok-4-6-amazon-bedrock>
- <https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-bedrock-grok-4-6/>

Groq:
- <https://groq.com/newsroom/groq-closes-usd350-million-series-a-building-the-world-s-leading-ai-inference-cloud>
- <https://siliconangle.com/2026/08/24/nvidias-dedicated-inference-accelerator-groq-3-lpx-enters-full-production-to-supercharge-ai-agents/>

Amazon Bedrock:
- <https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-bedrock-cross-region-openai-v2/>

Azure OpenAI:
- <https://learn.microsoft.com/en-us/azure/foundry-classic/openai/whats-new>
- <https://www.cloudzero.com/blog/azure-openai-pricing/>

Cerebras:
- <https://www.globenewswire.com/news-release/2026/08/13/3344804/0/en/cerebras-powers-ultrafast-mode-for-openai-s-gpt-5-6-sol.html>
- <https://www.explainx.ai/blog/cerebras-cs-4-wafer-scale-ai-accelerator-august-2026>

Alibaba / Qwen:
- <https://www.bloomberg.com/news/articles/2026-08-26/alibaba-releases-smaller-cost-effective-qwen-ai-model>
- <https://mpost.io/alibaba-prices-qwen3-8-flash-api-at-0-16-per-million-tokens-cutting-inference-costs-for-125b-parameter-model/>
- <https://openrouter.ai/qwen/qwen3.8-flash>

Moonshot / Kimi:
- <https://platform.kimi.ai/docs/models>

Fireworks.ai:
- <https://pricepertoken.com/pricing-page/provider/fireworks>
- <https://fireworks.ai/>

OpenRouter:
- <https://openrouter.ai/z-ai/glm-5.3-flash>
- <https://openrouter.ai/qwen/qwen3.8-flash>
- <https://www.explainx.ai/blog/ox-alpha-what-we-know-mystery-ai-model-august-2026>

Zhipu / GLM:
- <https://openrouter.ai/z-ai/glm-5.3-flash>
- <https://www.orcarouter.ai/blog/glm-5-3-flash-release>
- <https://kie.ai/blog/what-is-glm-5-5>

DeepSeek:
- <https://api-docs.deepseek.com/updates/>
- <https://llmgateway.io/timeline>
- <https://tech.yahoo.com/ai/articles/deepseek-officially-launches-v4-pro-181255468.html>

NVIDIA / Nemotron:
- <https://blogs.nvidia.com/blog/nemotron-lightning-switchyard-rtx-dgx/>

Thinking Machines Lab:
- <https://www.bloomberg.com/news/articles/2026-07-15/murati-s-thinking-machines-releases-first-ai-model-for-broad-use>

Inception Labs:
- <https://www.inceptionlabs.ai/models>
- <https://thenewstack.io/inception-labs-mercury-2-diffusion/>

Meta / Llama:
- <https://ai.meta.com/blog/llama-4-multimodal-intelligence/>

MiniMax:
- <https://releasebot.io/updates/minimax>

Black Forest Labs:
- <https://bfl.ai/blog/flux-3>
- <https://docs.bfl.ml/release-notes>

Cohere:
- <https://docs.cohere.com/v2/changelog>
