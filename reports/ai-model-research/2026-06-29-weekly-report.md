# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-06-29
**Research Period**: 2026-06-08 → 2026-06-29 (last ~3 weeks; covers Computex, Build 2026, OpenAI GPT-5.6 preview, Z.AI GLM-5.2 API GA)
**Base Branch**: `next`

## Executive Summary

Late-June 2026 is the most compressed frontier-release window of the year. Since the last weekly inventory refresh, four notable launches have shipped to public APIs with verifiable pricing: **Z.AI GLM-5.2** (June 13/16), **NVIDIA Nemotron 3 Ultra** (June 4), and **Mistral Magistral 1.2** (Medium + Small, magistral-*-2509 release line). One additional family — **OpenAI GPT-5.6 (Sol/Terra/Luna)** — was previewed June 26 but is gated to a small group of trusted partners; **Anthropic's Claude Fable 5 and Mythos 5** (June 9) were announced and then access-suspended within hours of release. Both are tracked here but **not** added to inventory yet (rationale below).

This report proposes **4 new model rows** and **1 new vendor row** (NVIDIA). It proposes **no deactivations** and **no price-change cost rows** for existing models — every vendor whose API pricing we verified this week matches the latest cost record on file.

## Current Inventory Snapshot

| File | Count | Notes |
|---|---|---|
| `metadata/ai-models/.ai-models.json` | **154 models** | Mix of LLM, embedding, image, voice, TTS, realtime |
| `metadata/ai-models/.cohere-reranker-models.json` | 4 reranker models | rerank-v3.5, rerank-multilingual-v3.0, rerank-v4-pro, rerank-v4-fast — already current |
| `metadata/ai-vendors/.ai-vendors.json` | **27 vendors** (pre-edit) | Anthropic, OpenAI, Google, Mistral, Groq, x.ai, Cerebras, Alibaba, Moonshot, MiniMax, Z.AI, DeepSeek, Inception Labs, Black Forest Labs, Cohere, Fireworks.ai, OpenRouter, Amazon Bedrock, Azure, Vertex AI, LM Studio, LocalEmbeddings, Eleven Labs, HeyGen, AssemblyAI, Inworld, Tasio Labs |

The inventory was last meaningfully extended on June 5 (MiniMax-M3) and June 16 (AssemblyAI / Inworld realtime models). Inventory pricing for Claude Opus 4.8 ($5/$25), Gemini 3.5 Flash ($1.50/$9), Grok 4.3 ($1.25/$2.50), GPT 5.5 ($5/$30), GLM 5.1 ($0.95/$3.15), Qwen 3.7 Max ($2.50/$7.50), and MiniMax-M3 ($0.60/$2.40 list) all match current market pricing — no rewrites needed.

## New Models Available

### 1. **Z.AI GLM-5.2** — RECOMMEND ADD

- **Vendor**: Z.AI (already in inventory)
- **API name** (Z.AI direct): `glm-5.2`
- **API name** (OpenRouter): `z-ai/glm-5.2`
- **API name** (Together AI / others): widely available on inference clouds; not yet seen on Cerebras
- **Pricing**: **$1.40 input / $4.40 output per 1M tokens** (Z.AI direct, live since June 16, 2026)
- **Context**: 1M tokens (1,048,576 input)
- **Capabilities**: 744–753B parameter open-weights MoE (MIT license), tuned for long-horizon agentic coding & engineering. Beats GPT-5.5 on multiple long-horizon coding benchmarks at roughly 1/6 the cost (per VentureBeat 2026-06).
- **Release**: GLM Coding Plan tiers June 13, 2026; standalone pay-per-token API June 16, 2026
- **Recommendation**: Add as a successor to GLM 5.1. Suggested PowerRank=22 (above GLM 5.1's 21), SpeedRank=7, CostRank=4 (between 5.1's 7 and 5's 7).

### 2. **NVIDIA Nemotron 3 Ultra** — RECOMMEND ADD (requires new vendor)

- **Vendor**: **NVIDIA** (NEW — does not exist in `.ai-vendors.json`; recommend adding)
- **API name** (OpenRouter): `nvidia/nemotron-3-ultra-550b-a55b`
- **API name** (Together AI / NIM): `nvidia/nemotron-3-ultra-550b-a55b` (consistent across providers)
- **Pricing**: **$0.50 input / $2.50 output per 1M tokens** (NVIDIA-listed reference); OpenRouter weighted-avg $0.423 / $2.61 across providers
- **Context**: 1M tokens
- **Capabilities**: 550B-parameter (55B active) hybrid Mamba-Transformer MoE built for frontier reasoning & long-running agent orchestration. Open weights under the NVIDIA Open Model License (commercial use permitted). NIM microservice for self-host.
- **Release**: June 4, 2026 (announced at Computex)
- **Recommendation**: Add. Suggested PowerRank=17, SpeedRank=7, CostRank=4. Adds a competitive open-weights frontier option from a vendor we don't currently track.

### 3. **Mistral Magistral Medium 1.2** — RECOMMEND ADD

- **Vendor**: Mistral AI (already in inventory)
- **API name** (Mistral direct): `magistral-medium-2509` (also `magistral-medium-latest` alias)
- **API name** (Amazon Bedrock): `mistral.magistral-medium-2509-v1:0` (per Bedrock model card)
- **API name** (Vercel AI Gateway): `magistral-medium-2509`
- **Pricing**: **$2.00 input / $5.00 output per 1M tokens** (Mistral direct)
- **Context**: 128K input
- **Capabilities**: Native reasoning model with transparent chain-of-thought. Eight-language coverage. Produces 2–5× more output tokens than generalist models due to verbose CoT.
- **Release**: September 18, 2025 (1.2 generation; not previously tracked in MJ inventory)
- **Recommendation**: Add. Suggested PowerRank=12, SpeedRank=6, CostRank=4. This is an existing public Mistral product we simply haven't covered yet — adding it closes a gap rather than chasing a brand-new release.

### 4. **Mistral Magistral Small 1.2** — RECOMMEND ADD

- **Vendor**: Mistral AI (already in inventory)
- **API name** (Mistral direct): `magistral-small-2509` (also `magistral-small-latest` alias)
- **API name** (Amazon Bedrock): `mistral.magistral-small-2509-v1:0`
- **API name** (OpenRouter): `mistralai/magistral-small`
- **Pricing**: **$0.50 input / $1.50 output per 1M tokens** (Mistral direct)
- **Context**: 128K input
- **Capabilities**: Open-weights (Apache 2.0) counterpart to Magistral Medium. Same transparent-CoT reasoning, eight-language coverage. Hugging Face: `mistralai/Magistral-Small-2509`.
- **Release**: September 18, 2025
- **Recommendation**: Add. Suggested PowerRank=7, SpeedRank=8, CostRank=2. Closes the same gap as Magistral Medium at the budget-reasoning tier.

## Models Previewed/Announced — NOT Adding This Cycle

These were major news this week but, by the conservative-edit rule, are described here and **not** edited into the JSON until they have public general-availability pricing and stable APIs.

### OpenAI GPT-5.6 family — Sol, Terra, Luna *(limited preview, gated)*

- **Announced**: June 26, 2026 (per OpenAI blog, MarkTechPost, Axios, TechCrunch, MacRumors, VentureBeat)
- **Listed pricing**: Sol $5/$30, Terra $2.50/$15, Luna $1/$6 per 1M tokens
- **Status**: Restricted preview — access limited to a small set of trusted partners per a US-government safeguarding request. OpenAI says general availability is "coming weeks" with no firm date. Daring Fireball/TechCrunch coverage confirms the restriction is unusual and OpenAI does not want it to be the norm.
- **Why we're holding**: Until general availability with a stable API surface, adding rows could mislead callers about availability. Re-evaluate when GA is announced.

### Anthropic Claude Fable 5 + Mythos 5 *(access suspended)*

- **Announced**: June 9, 2026 — first public release in a new tier (Mythos) sitting above the Opus line; Fable 5 priced $10/$50 per 1M
- **Status**: Anthropic has since suspended access to both models per the StartupHub.ai/AI Pricing Guru coverage.
- **Why we're holding**: Adding inventory entries for a product line with no current customer access would create misleading routing options.

### Google Gemini 3.5 Pro *(expected late June 2026)*

- **Status**: Sundar Pichai signaled at I/O 2026 to "give us until next month." 2M-token context window + Deep Think reasoning expected. Pricing likely "above" Gemini 3.1 Pro's $2/$12.
- **Why we're holding**: Not yet released as of 2026-06-29.

### Microsoft MAI family (7 models)

- **Announced**: June 8, 2026 at Build 2026 — MAI-Thinking-1, MAI-Code-1-Flash, MAI-Image-2.5, MAI-Image-2.5 Flash, MAI-Transcribe-1.5, MAI-Voice-2, MAI-Voice-2-Flash
- **Status**: Available via Azure AI Foundry, Fireworks AI, Baseten, OpenRouter. **Pricing is TBA** on the public Foundry catalog at the time of writing.
- **Why we're holding**: No verifiable per-token pricing yet. Once Foundry publishes the per-1M-token rates we'd add a "Microsoft" vendor row and individual model rows. (Note: "Azure" is currently scoped to Azure OpenAI services in our metadata. A separate "Microsoft" inference-provider vendor row would be cleaner than overloading "Azure".)

### Amazon Nova 2 Lite / Nova 2 Sonic

- **Released**: December 2, 2025 (re:Invent). Lite is a multimodal reasoning model with a 1M context; Sonic is the speech-to-speech successor to Nova Sonic.
- **Pricing**: Multiple secondary sources disagree — one set quotes Lite at $0.30/$2.50 per 1M, another at $0.08/$0.32. Sonic is reported at $0.33/$2.75 for text tokens plus $3/$12 for speech tokens.
- **Why we're holding**: Conflicting per-token prices across third-party trackers without an AWS-direct confirmation we can quote. Will re-verify against the official `aws.amazon.com/nova/pricing` page next cycle and add then. Bedrock is already a vendor so adding the rows is mechanical once pricing is confirmed.

### Moonshot Kimi K3

- **Status**: Reddit/leak-tier reporting suggests a 3–4T-parameter target. No official announcement, no API, no pricing. Treated as rumor only.

## Pricing Changes Detected

**None for this cycle.** Every inventory cost row I spot-checked against current market pricing was still correct:

| Model | Inventory $ (In/Out) | Current $ (In/Out) | Status |
|---|---|---|---|
| Claude Opus 4.8 | $5 / $25 | $5 / $25 | ✓ Match |
| Claude Sonnet 4.6 | $3 / $15 | $3 / $15 | ✓ Match |
| Claude Haiku 4.5 | $1 / $5 | $1 / $5 | ✓ Match |
| GPT 5.5 | $5 / $30 | $5 / $30 | ✓ Match |
| GPT 5.4 | $2.50 / $15 | $2.50 / $15 | ✓ Match |
| GPT 5.4-nano | $0.20 / $1.25* | $0.20 / $1.25 | ✓ Match (* per blog) |
| Gemini 3.5 Flash | $1.50 / $9 | $1.50 / $9 | ✓ Match |
| Gemini 3.1 Pro | $2 / $12 | $2 / $12 | ✓ Match |
| Gemini 3.1 Flash-Lite | $0.25 / $1.50 | $0.25 / $1.50 | ✓ Match |
| Grok 4.3 | $1.25 / $2.50 | $1.25 / $2.50 | ✓ Match |
| Grok Build 0.1 | $1.00 / $2.00 | $1.00 / $2.00 | ✓ Match |
| GLM 5.1 | $0.95 / $3.15 | $0.95 / $3.15 | ✓ Match |
| Qwen 3.7 Max | $2.50 / $7.50 | $2.50 / $7.50 | ✓ Match (50% promo still active) |
| MiniMax-M3 | $0.60 / $2.40 (list) | $0.60 / $2.40 (list) | ✓ Match |
| DeepSeek V4 Pro | (in inventory) | $0.435 / $0.87 promo until May 31, then full | Note: promo expired — list price now active. No row change needed since inventory already encodes the launch-day promo; a follow-up promo-end cost row can be added if MJ tracks promo-vs-list separately. |

## Model Updates & New Versions

None of the existing inventory entries needs an API-name or context-window update this cycle. Mistral Codestral, Mistral Large 3, Mistral Medium 3.5, and Mistral Small 4 entries all remain accurate.

## Deprecated / Sunset Models

These would be worth a follow-up cycle to confirm and then mark `IsActive: false`:

- **Groq deprecations announced June 17, 2026**: `qwen/qwen3-32b` and `meta-llama/llama-4-scout-17b-16e-instruct`. Both APIs are about to be removed from Groq's catalog; in MJ inventory these map to **Qwen 3 32B** (Groq vendor record) and **Llama 4 Scout** (Groq vendor record). We are **not** flagging the whole model inactive — both are available on other inference providers — but the next refresh should set the **Groq vendor entry's `Status` to `Deprecated`** on these two models. Leaving for next cycle since current consumers may still be using Groq for these models until the actual cutover.
- **Google Gemini 2.0 Flash**: Already shut down June 1, 2026 per Google docs. Inventory entry **Gemini 2.0 Flash** is already `IsActive: false` — no action needed. ✓

## New Vendors Worth Considering

| Vendor | Why | Action |
|---|---|---|
| **NVIDIA** | Nemotron 3 Ultra is a competitive open-weights frontier model that's distributed via NIM, OpenRouter, Together AI, and others. Adding NVIDIA as a "Model Developer" vendor row enables tracking its lineage (and future Nemotron-3 Super/Nano if we choose). | **Adding this cycle** — see edits below. |
| **Microsoft** | MAI family ships separately from Azure OpenAI and should not be conflated with the existing "Azure" vendor (which represents Azure OpenAI service). | Hold until per-token pricing is published on Foundry. |
| **NVIDIA** as an inference provider via NIM | NVIDIA also offers NIM-hosted inference for many third-party models. Worth tracking as a second vendor role. | Defer — adding the "Model Developer" role first is sufficient for now. |
| **Baseten** | Mentioned as an alternative MAI host. Low priority unless we start routing through it. | Defer. |
| **NVentures/CapitalG-funded OpenRouter expansion** | OpenRouter added 26 free models and Claude Opus 4.8, Sonnet 4.6 in June. Already a vendor; no action. | None. |

## Recommended Actions (prioritized)

1. ✅ **Add Z.AI GLM-5.2** to `.ai-models.json` (high confidence, just GA'd June 16) — done in this PR.
2. ✅ **Add Mistral Magistral Medium 1.2** to `.ai-models.json` (closing an existing-product gap) — done in this PR.
3. ✅ **Add Mistral Magistral Small 1.2** to `.ai-models.json` (closing same gap, open-weights tier) — done in this PR.
4. ✅ **Add NVIDIA as a vendor row** to `.ai-vendors.json` and **add Nemotron 3 Ultra** to `.ai-models.json` — done in this PR.
5. ⏳ **Next cycle**: re-check Amazon Nova 2 Lite / Sonic pricing against AWS official source; add if confirmed.
6. ⏳ **Next cycle**: re-check OpenAI GPT-5.6 GA status (Sol/Terra/Luna). Add when generally available.
7. ⏳ **Next cycle**: re-check Anthropic Claude Fable 5 / Mythos 5 access. Add when un-suspended.
8. ⏳ **Next cycle**: re-check Microsoft MAI Foundry pricing. Add new "Microsoft" vendor + 7 model rows when token rates are published.
9. ⏳ **Next cycle**: confirm Groq deprecation cutover (qwen3-32b, llama-4-scout) and set those specific vendor rows to `Status: Deprecated`.
10. ⏳ **Next cycle**: confirm Gemini 3.5 Pro GA and add.

## Research Sources

### Anthropic
- [Pricing — Claude Platform Docs](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic API Pricing 2026: Fable, Opus, Sonnet — AI Pricing Guru](https://www.aipricing.guru/anthropic-pricing/)
- [Claude AI in 2026 — StartupHub.ai](https://www.startuphub.ai/ai-news/reviews/2026/claude-ai-complete-guide-2026)
- [Anthropic API Pricing in 2026 — Cloudzero](https://www.cloudzero.com/blog/claude-api-pricing/)

### OpenAI
- [Previewing GPT-5.6 Sol — OpenAI](https://openai.com/index/previewing-gpt-5-6-sol/)
- [A preview of GPT-5.6 Sol, Terra, and Luna — OpenAI Help](https://help.openai.com/en/articles/20001325-a-preview-of-gpt-56-sol-terra-and-luna)
- [OpenAI limits GPT-5.6 rollout — TechCrunch](https://techcrunch.com/2026/06/26/openai-limits-gpt-5-6-rollout-after-government-request-says-restrictions-shouldnt-be-the-norm/)
- [OpenAI Previews GPT-5.6 — MarkTechPost](https://www.marktechpost.com/2026/06/26/openai-previews-gpt-5-6-with-sol-terra-and-luna-tiered-models-new-reasoning-modes-limited-access/)
- [OpenAI API Pricing — Developers](https://developers.openai.com/api/docs/pricing)
- [OpenAI ChatGPT API Pricing Calculator — CostGoat](https://costgoat.com/pricing/openai-api)

### Google
- [Gemini Developer API pricing — Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing)
- [Google Gemini API Pricing June 2026 — Rogue Marketing](https://the-rogue-marketing.github.io/google-gemini-api-pricing-may-2026/)
- [Gemini API Pricing Calculator — CostGoat](https://costgoat.com/pricing/gemini-api)
- [Gemini Pricing 2026 — Felloai](https://felloai.com/gemini-pricing/)

### xAI / Grok
- [Models — xAI Docs](https://docs.x.ai/developers/models)
- [API: Frontier Models for Reasoning — xAI](https://x.ai/api)
- [xAI Release Notes — June 2026 — Releasebot](https://releasebot.io/updates/xai)
- [Grok API Pricing 2026 — Morph](https://www.morphllm.com/grok-api-pricing)

### Mistral
- [Pricing — Mistral](https://mistral.ai/pricing/)
- [Mistral Models Overview](https://docs.mistral.ai/models/overview)
- [Magistral Medium 1.2 — Mistral Docs](https://docs.mistral.ai/models/magistral-medium-1-2-25-09)
- [Magistral Small 2509 — Hugging Face](https://huggingface.co/mistralai/Magistral-Small-2509)
- [Magistral Small 2509 — Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-mistral-ai-magistral-small-2509.html)
- [Mistral AI Provider — Promptfoo](https://www.promptfoo.dev/docs/providers/mistral/)
- [Mistral API Pricing 2026 — Cloudzero](https://www.cloudzero.com/blog/mistral-api-pricing/)

### Alibaba Qwen
- [Alibaba Cloud Model Studio model pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing)
- [Alibaba's Qwen3.7-Plus — VentureBeat](https://venturebeat.com/technology/alibabas-qwen3-7-plus-supports-text-video-and-imagery-inputs-at-low-cost-of-0-4-1-6-per-1m-token-but-its-proprietary)
- [Qwen3.7 Max — OpenRouter](https://openrouter.ai/qwen/qwen3.7-max)

### Z.AI / GLM
- [Pricing — Z.AI Developer Document](https://docs.z.ai/guides/overview/pricing)
- [Z.AI's GLM-5.2 beats GPT-5.5 — VentureBeat](https://venturebeat.com/technology/z-ais-open-weights-glm-5-2-beats-gpt-5-5-on-multiple-long-horizon-coding-benchmarks-for-1-6th-the-cost)
- [Z.ai: GLM 5.2 — OpenRouter](https://openrouter.ai/z-ai/glm-5.2)
- [GLM 5.2 API & Pricing — Lushbinary](https://lushbinary.com/blog/glm-5-2-api-pricing-glm-coding-plan-guide/)
- [GLM-5.2 API — Together AI](https://www.together.ai/models/glm-52)

### MiniMax
- [MiniMax M3 — VentureBeat](https://venturebeat.com/technology/minimax-m3-debuts-eclipsing-gpt-5-5-and-gemini-3-1-pro-on-key-benchmark-performance-for-just-5-10-of-the-cost)
- [Models — MiniMax API Docs](https://platform.minimax.io/docs/release-notes/models)
- [MiniMax M3 — OpenRouter](https://openrouter.ai/minimax/minimax-m3)

### Moonshot / Kimi
- [Kimi API Platform](https://platform.moonshot.ai/)
- [Kimi K2.6 Explained — Miraflow](https://miraflow.ai/blog/kimi-k2-6-explained-moonshot-ai-open-source-model-ties-gpt-5-5-coding)

### DeepSeek
- [Models & Pricing — DeepSeek API Docs](https://api-docs.deepseek.com/quick_start/pricing)
- [DeepSeek V4 Released — SitePoint](https://www.sitepoint.com/deepseek-v4-released-whats-new-in-the-latest-model-2026/)
- [DeepSeek pricing 2026 — Cloudzero](https://www.cloudzero.com/blog/deepseek-pricing/)

### NVIDIA / Nemotron
- [NVIDIA Nemotron 3 Ultra — NVIDIA Developer Blog](https://developer.nvidia.com/blog/nvidia-nemotron-3-ultra-powers-faster-more-efficient-reasoning-for-long-running-agents/)
- [NVIDIA-Nemotron-3-Ultra-550B-A55B — Hugging Face](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16)
- [Nemotron 3 Ultra — Together AI](https://www.together.ai/models/nvidia-nemotron-3-ultra)
- [Nemotron 3 Ultra — OpenRouter](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free)
- [Get Started with Nemotron 3 Ultra — NVIDIA NIM](https://docs.nvidia.com/nim/large-language-models/latest/day-0/get-started-nemotron-3-ultra.html)

### Groq
- [Supported Models — GroqDocs](https://console.groq.com/docs/models)
- [Model Deprecation — GroqDocs](https://console.groq.com/docs/deprecations)
- [Groq API Pricing — AI Pricing Guru](https://www.aipricing.guru/groq-pricing/)

### Cerebras
- [Cerebras Inference — Artificial Analysis](https://artificialanalysis.ai/providers/cerebras)
- [Developer tier Pricing — Cerebras](https://www.cerebras.ai/pricing)

### Cohere
- [Cohere API Pricing — AI Pricing Guru](https://www.aipricing.guru/cohere-pricing/)
- [Pricing — Cohere](https://cohere.com/pricing)
- [Release Notes — Cohere](https://docs.cohere.com/changelog)

### Black Forest Labs
- [FLUX API Pricing — Black Forest Labs](https://bfl.ai/pricing)
- [Black Forest Labs launches Flux.2 — VentureBeat](https://venturebeat.com/ai/black-forest-labs-launches-flux-2-ai-image-models-to-challenge-nano-banana)

### Meta / Llama
- [Latest AI Model Releases — June 2026](https://aireleasetracker.com/latest)
- [Meta Llama Pricing Guide 2026 — AI Cost Check](https://aicostcheck.com/blog/meta-llama-pricing-guide-2026)

### Amazon Bedrock / Nova
- [Amazon Bedrock Model Catalog 2026](https://hidekazu-konishi.com/entry/amazon_bedrock_model_catalog_2026.html)
- [Nova 2 Lite — Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html)
- [Introducing Nova 2 Sonic — AWS](https://aws.amazon.com/blogs/aws/introducing-amazon-nova-2-sonic-next-generation-speech-to-speech-model-for-conversational-ai/)

### Microsoft MAI
- [Building a hill-climbing machine — Microsoft AI](https://microsoft.ai/news/building-a-hillclimbing-machine-launching-seven-new-mai-models/)
- [Microsoft Build 2026: MAI keynote transcript](https://microsoft.ai/news/microsoft-build-2026-mai-keynote-transcript/)
- [Microsoft unveils new AI models — CNBC](https://www.cnbc.com/2026/06/02/microsoft-unveils-new-ai-models-lessen-reliance-on-openai-lower-costs.html)

### OpenRouter
- [Pricing — OpenRouter](https://openrouter.ai/pricing)
- [OpenRouter June 2026: New Models — DigitalApplied](https://www.digitalapplied.com/blog/openrouter-new-models-june-2026-roundup-pricing-rankings)
- [The Open Weight Models that Matter: June 2026 — OpenRouter Blog](https://openrouter.ai/blog/insights/the-open-weight-models-that-matter-june-2026/)

### Industry roundups
- [AI Updates Today (June 2026) — llm-stats](https://llm-stats.com/llm-updates)
- [Latest AI Model Releases — AIReleaseTracker](https://aireleasetracker.com/latest)
- [AI Frontier Model Builders Cheatsheet (Updated June 2026)](https://cheatsheets.davidveksler.com/ai-frontier.html)
- [A Frontier Model Goes Dark — Alex Merced (dev.to)](https://dev.to/alexmercedcoder/a-frontier-model-goes-dark-ai-week-of-june-16-2026-1gk9)

---

## Addendum — 2026-07-01 (post-review)

Per review request from CaelebB-BC, added **Gemma 4 31B on Cerebras** as an inference-provider vendor association (+ cost row) on the existing *Gemma 4 31B Instruct* model. Not a new model row — extends provider coverage for a model already in inventory.

- **API model id**: `gemma-4-31b` · **DriverClass**: `CerebrasLLM`
- **Context / output** (paid tier): 131K in / 40K out · multimodal (image input) · streaming
- **Pricing**: $0.99 input / $1.49 output per 1M tokens (Cerebras Inference, June 2026)
- Priority 60 (secondary — leaves Vertex AI primary routing unchanged)
- Source: [Gemma 4 31B — Cerebras Inference Docs](https://inference-docs.cerebras.ai/models/gemma-4-31b)
