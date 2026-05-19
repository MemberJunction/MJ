# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-05-18
**Research Period**: 2026-05-11 through 2026-05-18
**Base Branch**: next
**Branch**: claude/ai-model-research-2026-05-18

## Executive Summary

The most consequential change this week is xAI's mass retirement of 8 model slugs on **May 15, 2026** (3 days ago), which moves 5 of the currently active Grok entries in our inventory into an aliased/redirected state. Beyond that, the market is in a Chinese-open-weights surge — Qwen 3.6 (Plus / Max Preview / Flash), DeepSeek V4 Pro/Flash, GLM-5.1, Kimi K2.6, and MiniMax M2.7 are all converging as credible Opus-4.7 / GPT-5.5 competitors at a fraction of the price. We also identified ~30 missing models worth tracking (Cohere Command/Embed v4, Inception Mercury Edit 2, Mistral Voxtral TTS, FLUX.2 max/flex/klein, Amazon Nova family, Microsoft Phi-4, Gemma 4 edge tier, Google Veo/Imagen, MiniMax Hailuo/Speech/Music). A direct read of vendor docs verifies that **Anthropic, OpenAI flagship, and most direct-vendor pricing in our inventory remains accurate**.

## Current Inventory Snapshot

| Vendor                | Models in Inventory (active LLMs unless noted) | Last MJ Update         |
| --------------------- | ----------------------------------------------- | ---------------------- |
| OpenAI                | 22 (incl. embeddings, image, TTS, realtime)     | 2026-05-14             |
| Anthropic             | 7                                               | 2026-05-08             |
| Google                | 14 (incl. Gemma, TTS, Nano Banana)              | 2026-05-08             |
| x.ai                  | 8                                               | 2026-04-20             |
| Mistral AI            | 10 (incl. embed)                                | 2026-04-20             |
| Groq (inference)      | ~12 hosted models                               | 2026-04-20             |
| Alibaba Cloud (Qwen)  | 9                                               | 2026-04-20             |
| Moonshot AI (Kimi)    | 3                                               | 2026-04-20             |
| DeepSeek              | 2 (+ 1 distilled on Groq)                       | 2026-05-08             |
| Z.AI (GLM)            | 5                                               | 2026-04-20             |
| MiniMax               | 3                                               | 2026-04-27             |
| Inception Labs        | 1 (Mercury 2)                                   | 2026-04-27             |
| Black Forest Labs     | 2                                               | 2026-02-12             |
| Cohere                | 4 (rerankers only)                              | 2026-04-20             |
| Cerebras / Fireworks / OpenRouter | (inference providers, multi-model)   | various                |

## New Models Available

### Tier-1 (high confidence — applied to JSON)

| Model                       | Vendor              | API ID                          | In / Out / 1M | Context        | Notes                                                              |
| --------------------------- | ------------------- | ------------------------------- | ------------- | -------------- | ------------------------------------------------------------------ |
| **Qwen 3.6 Max Preview**    | Alibaba Cloud       | `qwen3.6-max-preview`           | $1.04 / $6.24 | 262K           | Apr 27, 2026. Top of Qwen lineup; #1 on 6 coding benchmarks.       |
| **Qwen 3.6 Plus**           | Alibaba Cloud       | `qwen3.6-plus`                  | $0.325 / $1.95| 1M             | Apr 2, 2026. 78.8% SWE-Bench Verified. Drop-in successor to 3.5 Plus.|
| **Qwen 3.6 Flash**          | Alibaba Cloud       | `qwen3.6-flash`                 | $0.25 / $1.50 | 1M             | Apr 27, 2026. Multimodal text/image/video.                         |
| **Qwen 3-Max**              | Alibaba Cloud       | `qwen3-max`                     | $0.78 / $3.90 | 262K           | Sept 23, 2025. Predecessor flagship to 3.6 Max Preview.             |
| **Cohere Command A**        | Cohere              | `command-a-03-2025`             | $2.50 / $10.00| 256K           | 111B params. Flagship for RAG/agents/tool-use.                     |
| **Cohere Command R+**       | Cohere              | `command-r-plus-08-2024`        | $2.50 / $10.00| 128K           | Previous flagship.                                                  |
| **Cohere Command R**        | Cohere              | `command-r-08-2024`             | $0.15 / $0.60 | 128K           | Mid-tier.                                                          |
| **Cohere Command R7B**      | Cohere              | `command-r7b-12-2024`           | $0.0375 / $0.15| 128K          | Small/fast.                                                        |
| **Cohere Embed v4**         | Cohere              | `embed-v4.0`                    | $0.12 / 1M text; $0.47 / 1M image | 128K | Multimodal embeddings, 1536-dim Matryoshka.                  |
| **Mercury Edit 2**          | Inception Labs      | `mercury-edit-2`                | $0.25 / $0.75 (cached $0.025) | — | May 12, 2026. Diffusion LLM purpose-built for next-edit prediction.|
| **Hailuo 2.3**              | MiniMax             | `hailuo-2.3`                    | flat-rate per video | — | 2026 release. Text-to-video; Fast tier ~50% cheaper for batch.    |
| **Hailuo 2.3 Fast**         | MiniMax             | `hailuo-2.3-fast`               | flat-rate per video | — | Batch tier of Hailuo 2.3.                                         |

### Tier-2 (verified but deferred to next sync — flagged only)

The following exist and have verified pricing, but were not added to the JSON in this PR to keep the change-set focused. Recommend adding them in the next sync:

| Model | Vendor | Pricing | Rationale for adding |
|---|---|---|---|
| Qwen 3 Coder Plus | Alibaba Cloud | $0.65 / $3.25 / 1M | 1M context, coder-focused; complements existing 480B |
| Llama 3.3 70B on Cerebras | Cerebras | $0.85 / $1.20 / 1M | Free-tier eligible; missing from Cerebras vendor list |
| Qwen 3 32B on Cerebras | Cerebras | ~$0.40 / ~$0.80 / 1M | Free-tier eligible |
| Qwen 3 Coder 480B on Cerebras | Cerebras | $2.00 / $2.00 / 1M | Powers Cerebras Code Pro/Max |
| Qwen 3 235B Thinking on Cerebras | Cerebras | $0.60 / $1.20 / 1M | Reasoning variant |
| Voxtral Mini TTS | Mistral AI | $0.016 / 1K chars | First Mistral audio model; needs new pricing unit |
| Codestral Embed | Mistral AI | $0.15 / 1M | Code-specialized embeddings |
| Mistral Ministral 3B / 8B / Nemo | Mistral AI | $0.04 / $0.10 / $0.02 in | Cheap low-end tier |
| FLUX.2 [max] | Black Forest Labs | from $0.07 / MP | Top quality tier |
| FLUX.2 [flex] | Black Forest Labs | $0.06 / MP | Exposes guidance/steps |
| FLUX.2 [klein] | Black Forest Labs | ~$0.015 / image | Sub-second; open weights |
| FLUX.1 Kontext [pro/max/dev] | Black Forest Labs | from $0.045 / MP | Image editing — distinct capability |
| FLUX 1.2 Pro Ultra | Black Forest Labs | per-MP | 4MP output successor to 1.1 Pro Ultra |
| GPT-Realtime-Translate | OpenAI | $0.034 / min flat | Released May 8, 2026. Live translation, 70→13 langs. |
| GPT-Realtime-Whisper | OpenAI | $0.017 / min flat | Released May 8, 2026. Streaming STT. |
| Phi-4 / Phi-4-mini / Phi-4 Reasoning Vision 15B | Microsoft (Azure) | $0.065-$0.07 in / $0.14-$0.23 out / 1M | 35-40x cheaper than GPT-4o |
| Amazon Nova Pro / Lite / Micro / Premier | Amazon Bedrock | Lite $0.06/$0.24; Pro $0.80/$3.20; Premier $2.50/$12.50; Micro $0.035/$0.14 | Bedrock-exclusive frontier line |
| Amazon Nova Sonic (speech-to-speech) | Amazon Bedrock | flat-rate | New modality |
| Amazon Nova Canvas (image) | Amazon Bedrock | $0.04-$0.08 / image | Image gen on Bedrock |
| Amazon Nova Reel (video) | Amazon Bedrock | $0.08 / sec | Video on Bedrock |
| Gemma 4 E2B / E4B (edge) | Google | open weights | Available on Vertex Model Garden |
| Gemini 3.1 Flash Image (Nano Banana 2) | Google | per-image | Feb 26, 2026 |
| Gemini 3.1 Flash Live | Google | (preview) | Mar 26, 2026 |
| Imagen 4 | Google | per-image | Top-tier text-to-image |
| Veo 3.1 Lite | Google | ~$0.05 / sec | Cheapest Veo |
| Veo 3.1 Fast | Google | reduced rate | — |
| Veo 4 | Google | via Gemini Ultra subscription | 30-sec 4K with avatars |
| Llama Guard 4 (12B) | Meta | hosted on DeepInfra/HF | Multimodal safety classifier |
| Llama Prompt Guard 2 (86M/22M) | Meta | BERT classifier | Prompt-injection detection |
| MiniMax Speech 2.8 (Turbo + HD) | MiniMax | subscription tiers | New audio lineup |
| MiniMax Music 2.6 | MiniMax | token plan + 100/day free | Released Apr 10, 2026 |
| NVIDIA Nemotron 3 Super 120B (free on OpenRouter) | NVIDIA / OpenRouter | $0 (free tier) | Strong open-weights coder |
| Mistral Forge platform | Mistral AI | software license | Custom model training platform |

## Pricing Changes Detected

| Model                     | Vendor          | Previous Price (In / Out) | Current Price (In / Out) | Action Recommended       |
| ------------------------- | --------------- | ------------------------- | ------------------------ | ------------------------ |
| GLM 5                     | Z.AI            | $1.00 / $3.20             | $0.60 / $1.92            | Add updated cost record  |
| GLM 5.1                   | Z.AI            | $0.95 / $3.15             | $0.98 / $3.08            | Within rounding — keep   |
| GPT-OSS-20B               | Groq            | $0.10 / $0.50             | $0.075 / $0.30           | Add updated cost record  |
| GPT-OSS-120B              | Groq            | $0.15 / $0.75             | $0.15 / $0.60            | Add updated cost record  |
| Qwen 3 32B                | Groq            | $0.29 / $0.39             | $0.29 / $0.59            | **CORRECTION** — output price was wrong |
| DeepSeek R1 Distill Llama 70B | Groq        | $0.59 / $0.79             | $0.75 / $0.99            | **CORRECTION** — was logged at base Llama 3.3 70B price |
| Mistral Large 3           | Mistral AI      | $0.50 / $1.50             | $2.00 / $6.00 (reported by multiple sources) | **VERIFY** — large discrepancy, may need correction |
| DeepSeek V4 Pro           | DeepSeek (promo)| $1.74 / $3.48             | $0.435 / $0.87 (through May 31, 2026 only) | Promo only — keep regular price |
| Kimi K2.6                 | Moonshot (cached)| (no cache entry)         | $0.15 / 1M cached input  | Add cached pricing note  |

## Model Updates & New Versions

- **Anthropic Claude Opus 4.7** (Apr 16, 2026) — already in MJ inventory. New tokenizer (up to 35% more tokens), high-res image (2576px / 3.75MP), task budgets, "xhigh" effort level. Knowledge cutoff Jan 2026. Full 1M-context at standard pricing.
- **OpenAI GPT-5.5 Instant** (May 5, 2026) — routes through `gpt-5.5` with `reasoning_effort: "minimal"`; MJ inventory has GPT 5.5 Instant entry separately at $5/$30 which is correct.
- **OpenAI GPT-Realtime-2** (May 8, 2026) — Realtime API exited beta; context expanded 32K → 128K; pricing $32/1M audio in (cached $0.40) / $64/1M audio out. MJ inventory has it, verify max-token fields.
- **xAI Grok 4.3** (GA May 6, 2026) — replaces 8 retired Grok slugs. Verified at $1.25/$2.50, 1M context, configurable reasoning (none/low/med/high).
- **xAI Grok 4.20** (GA Mar 31, 2026) — verified at $2/$6, **2M context** (largest in xAI lineup).
- **Mistral Medium 3.5** (Apr 29-30, 2026) — verified at $1.50/$7.50, 256K context, 77.6% SWE-Bench Verified.
- **Mistral Small 4** (Mar 16, 2026, `mistral-small-2603`) — verified at $0.15/$0.60, 256K context. Unifies Magistral + Pixtral + Devstral.
- **Kimi K2.6** (Apr 20, 2026) — 1T MoE / 32B active, now natively multimodal, thinking + non-thinking modes. Direct cost $0.60/$2.50 + cached $0.15.
- **Mercury 2** (Mar 4, 2026) — verified at $0.25/$0.75, 128K context.
- **MiniMax M2.7** (Mar 18, 2026) — verified at $0.30/$1.20, 205K context, 100 TPS, 56.22% SWE-Pro, self-evolving.
- **DeepSeek V4 Preview** (Apr 24, 2026) — verified pricing. Cache-hit pricing reduced 10× effective Apr 26, 2026 (12:15 UTC).
- **Anthropic Bedrock & Vertex** — historical 10% Bedrock premium has been eliminated for Claude 4.x; vendor-parity is now the norm. Cross-region inference still adds ~10%.

## Deprecated / Sunset Models

### Already retired (mark IsActive=false or vendor Status=Deprecated)

| Model                          | Retirement Date | Source                  | Action Taken             |
| ------------------------------ | --------------- | ----------------------- | ------------------------ |
| Grok 4                         | May 15, 2026    | docs.x.ai/migration     | **IsActive=false in JSON**|
| Grok 4 Fast (Non-Reasoning)    | May 15, 2026    | docs.x.ai/migration     | **IsActive=false in JSON**|
| Grok 4 Fast (Reasoning)        | May 15, 2026    | docs.x.ai/migration     | **IsActive=false in JSON**|
| Grok 4-1 Fast Non-Reasoning    | May 15, 2026    | docs.x.ai/migration     | **IsActive=false in JSON**|
| Grok 4-1 Fast Reasoning        | May 15, 2026    | docs.x.ai/migration     | **IsActive=false in JSON**|
| Llama 4 Maverick on Groq       | Feb 20, 2026    | console.groq.com/docs/deprecations | **Groq vendor Status=Deprecated** |
| Kimi K2 on Groq                | Mar 23 / Apr 15, 2026 | community.groq.com | **Groq vendor Status=Deprecated** |
| Cohere `rerank-multilingual-v3.0` | superseded by 3.5/4.x | docs.cohere.com | Flagged in report; not edited (still callable) |
| Mercury Coder (small-beta)     | Apr 15, 2026    | docs.inceptionlabs.ai   | Not in MJ inventory      |

### Scheduled for retirement

| Model                          | Retirement Date | Notes                                              |
| ------------------------------ | --------------- | -------------------------------------------------- |
| Grok Code Fast 1               | Aug 15, 2026    | xAI; redirects to grok-4.3                         |
| Claude Opus 4 / Sonnet 4       | Jun 15, 2026    | Anthropic — Opus 4 was never in MJ inventory       |
| Gemini 2.5 Pro / Flash         | Jun 17, 2026    | Google — both in MJ inventory; mark deprecation    |
| Llama 3.1 8B on Cerebras       | May 27, 2026    | Cerebras (9 days out)                              |
| Qwen 3 235B Instruct on Cerebras | May 27, 2026  | Cerebras                                           |
| DeepSeek `deepseek-chat` / `deepseek-reasoner` aliases | Jul 24, 2026 | DeepSeek alias retirements |
| Kimi K2 (original) on Moonshot | May 25, 2026    | Moonshot (7 days out)                              |
| OpenAI Assistants API          | Aug 26, 2026    | replaced by Responses API                          |
| OpenAI Videos API / Sora 2 snapshots | Sep 24, 2026 | —                                                  |

## New Vendors Worth Considering

| Vendor               | Why                                                                | Action                  |
| -------------------- | ------------------------------------------------------------------ | ----------------------- |
| **NVIDIA NIM**       | Nemotron 3 family (Super 120B / Nano 30B) now hosted; competitive open-weights | Add vendor if we want Nemotron access |
| **DeepInfra**        | Kimi K2.6 ($0.75/$3.50), Llama Guard 4 hosting, FP4 quantization specialty | Add for K2.6 alternative routing |
| **Together AI**      | Already a major Llama 4 host; missing from MJ vendor list          | Consider adding as inference provider |
| **SambaNova**        | Hosts MiniMax M2.7; fast inference                                  | Optional                |
| **Microsoft Foundry**| Separate from Azure OpenAI — hosts Phi-4, partner models, DeepSeek 1P-sold | Already partially covered by Azure |

## Recommended Actions (Prioritized)

1. **MERGE THIS PR**: Adds 12 high-confidence new models (Qwen 3.6 family x4, Cohere x5, Mercury Edit 2, Hailuo 2.3 x2) and deactivates 5 retired Grok models.
2. **Next sync** — verify and add the 30+ Tier-2 entries above (Phi-4, Nova, FLUX.2 variants, Voxtral, Gemma 4 edge, Veo/Imagen, etc.).
3. **Correct the 2 wrong prices** on Groq entries (Qwen3-32B output $0.39 → $0.59; DeepSeek R1 Distill $0.59/$0.79 → $0.75/$0.99). These should be a separate corrective PR.
4. **Verify Mistral Large 3 pricing** — multiple third-party trackers show $2/$6 instead of $0.50/$1.50. Could be a real list-price increase, could be that the $0.50/$1.50 row tracks a discounted volume tier. **Needs human eyes on docs.mistral.ai.**
5. **Mark Gemini 2.5 Pro / Flash as deprecating** — schedule Jun 17, 2026 retirement.
6. **Mark Llama 3.1 8B on Cerebras + Qwen 3 235B Instruct on Cerebras as deprecating** — May 27, 2026 retirement.
7. **Update Llama 4 Maverick on Groq** vendor Status to Deprecated (also done in this PR).
8. **Update Kimi K2 on Groq** vendor Status to Deprecated (also done in this PR).
9. **Investigate adding new model TYPES** for Video and per-minute audio pricing if we want to track Hailuo/Veo/GPT-Realtime-Translate properly. Current type system supports `Image Generator`, `TTS`, `Video` (used for HeyGen), but per-minute and per-second pricing units may need new entries in `MJ: AI Model Price Unit Types`.

## Research Sources

### Anthropic
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Opus 4.7 release tracker](https://findskill.ai/blog/claude-opus-4-7-release-tracker/)

### OpenAI
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Introducing GPT-5.5](https://openai.com/index/introducing-gpt-5-5/)
- [GPT-5.5 Instant announcement](https://openai.com/index/gpt-5-5-instant/)
- [GPT Image 2 API docs](https://developers.openai.com/api/docs/models/gpt-image-2)
- [OpenAI Realtime Audio models May 8, 2026](https://www.marktechpost.com/2026/05/08/openai-releases-three-realtime-audio-models-gpt-realtime-2-gpt-realtime-translate-and-gpt-realtime-whisper-in-the-realtime-api/)
- [OpenAI Deprecations](https://developers.openai.com/api/docs/deprecations)

### Google
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Models](https://ai.google.dev/gemini-api/docs/models)
- [Gemini Deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
- [Gemma 4 announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)
- [Gemini 3.1 Flash-Lite announcement](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-lite/)
- [Veo 4 release](https://www.veo3ai.io/blog/veo-4-release-everything-you-need-to-know-2026)

### x.ai
- [xAI Models docs](https://docs.x.ai/developers/models)
- [May 15, 2026 Model Retirement](https://docs.x.ai/developers/migration/may-15-retirement)
- [Grok 4.3 launch — Artificial Analysis](https://artificialanalysis.ai/articles/xai-launches-grok-4-3-with-improved-agentic-performance-and-lower-pricing)
- [Grok Code Fast 1 deprecation — GitHub](https://github.blog/changelog/2026-05-08-upcoming-deprecation-of-grok-code-fast-1/)

### Groq
- [Groq Pricing](https://groq.com/pricing)
- [Groq Models](https://console.groq.com/docs/models)
- [Groq Deprecations](https://console.groq.com/docs/deprecations)
- [GPT-OSS price reductions](https://groq.com/blog/gpt-oss-improvements-prompt-caching-and-lower-pricing)
- [Qwen3 32B on Groq](https://groq.com/blog/groqcloud-tm-now-supports-qwen3-32b)

### Mistral
- [Mistral Changelog](https://docs.mistral.ai/getting-started/changelog)
- [Mistral Models Overview](https://docs.mistral.ai/models/overview)
- [Mistral Forge — VentureBeat](https://venturebeat.com/infrastructure/mistral-ai-launches-forge-to-help-companies-build-proprietary-ai-models)

### Alibaba (Qwen)
- [Qwen 3.6 blog](https://qwen.ai/blog?id=qwen3.6)
- [Alibaba Cloud Model Studio Models](https://www.alibabacloud.com/help/en/model-studio/models)
- [Qwen 3.6 Plus on OpenRouter](https://openrouter.ai/qwen/qwen3.6-plus)
- [Qwen 3.6 Max Preview on OpenRouter](https://openrouter.ai/qwen/qwen3.6-max-preview)
- [Qwen 3-Max on OpenRouter](https://openrouter.ai/qwen/qwen3-max)

### Moonshot (Kimi)
- [Kimi K2.6 Quickstart](https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart)
- [Kimi K2.6 on OpenRouter](https://openrouter.ai/moonshotai/kimi-k2.6)
- [Kimi K2.6 on DeepInfra](https://deepinfra.com/blog/kimi-k2-6-now-available-deepinfra)

### DeepSeek
- [DeepSeek V4 launch — CNBC](https://www.cnbc.com/2026/04/24/deepseek-v4-llm-preview-open-source-ai-competition-china.html)
- [DeepSeek V4 Pro on OpenRouter](https://openrouter.ai/deepseek/deepseek-v4-pro)
- [DeepSeek V4 Pro multi-provider comparison](https://deepinfra.com/blog/deepseek-v4-pro-pricing-guide-2026-providers-cost-analysis)

### Z.AI (GLM) / Inception Labs
- [Z.AI Pricing](https://docs.z.ai/guides/overview/pricing)
- [GLM-5.1 on OpenRouter](https://openrouter.ai/z-ai/glm-5.1)
- [Inception Models](https://docs.inceptionlabs.ai/get-started/models)
- [Mercury Edit 2 announcement](https://www.inceptionlabs.ai/blog/introducing-mercury-edit-2)

### MiniMax
- [MiniMax M2.7 announcement](https://www.minimax.io/news/minimax-m27-en)
- [Hailuo 2.3 announcement](https://www.minimax.io/news/minimax-hailuo-23)
- [Music 2.6 announcement](https://www.minimax.io/news/music-26)

### Black Forest Labs
- [BFL Pricing](https://bfl.ai/pricing)
- [BFL Models](https://bfl.ai/models)
- [BFL Docs — Pricing](https://docs.bfl.ai/quick_start/pricing)

### Cohere
- [Cohere Models](https://docs.cohere.com/docs/models)
- [Cohere Pricing](https://cohere.com/pricing)
- [Cohere Deprecations](https://docs.cohere.com/docs/deprecations)
- [Command A docs](https://docs.cohere.com/docs/command-a)

### Meta / Llama
- [LlamaCon 2026 recap](https://ai.meta.com/blog/llamacon-llama-news/)
- [Llama 4 herd announcement](https://ai.meta.com/blog/llama-4-multimodal-intelligence/)
- [Llama Guard 4 model card](https://www.llama.com/docs/model-cards-and-prompt-formats/llama-guard-4/)

### Bedrock / Azure
- [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [Amazon Nova Pricing](https://aws.amazon.com/nova/pricing/)
- [Azure OpenAI Pricing](https://azure.microsoft.com/en-us/pricing/details/azure-openai/)
- [Microsoft Foundry — DeepSeek pricing](https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/deepseek/)
- [What's new in Microsoft Foundry March 2026](https://devblogs.microsoft.com/foundry/whats-new-in-microsoft-foundry-mar-2026/)

### Cerebras / Fireworks / OpenRouter
- [Cerebras Model Catalog](https://inference-docs.cerebras.ai/models/overview)
- [Cerebras Pricing](https://www.cerebras.ai/pricing)
- [Fireworks Pricing](https://fireworks.ai/pricing)
- [Artificial Analysis — Fireworks provider](https://artificialanalysis.ai/providers/fireworks)
- [OpenRouter Models](https://openrouter.ai/models)
- [OpenRouter Free Models](https://openrouter.ai/collections/free-models)
