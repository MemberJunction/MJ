# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-06-01
**Research Period**: 2026-05-19 through 2026-06-01
**Base Branch**: next
**Branch**: claude/ai-model-research-2026-06-01

## Executive Summary

Two flagship launches dominate this cycle: **Anthropic Claude Opus 4.8** (May 28, 2026) shipped simultaneously across Anthropic API, Amazon Bedrock, Vertex AI, and Microsoft Foundry at the same $5/$25 per-1M pricing as Opus 4.7, and **MiniMax-M3** went GA today (June 1, 2026) with a new sparse-attention architecture (MSA) delivering 9.7× prefill / 15.6× decode speedups at 1M context. Three new agentic/coding-specialist models also landed — **Grok Build 0.1** (xAI, May 29, succeeds the retired Grok Code Fast 1), **Cohere Command A+** (May 20, first Cohere MoE flagship), and a confirmed **DeepSeek V4 Pro permanent 75% price cut** (May 23, making the prior promo the standard list price). Three model retirements take effect inside the window: **Gemini 2.0 Flash and Gemini 2.0 Flash-Lite** shut down today, and **Grok Code Fast 1** was already retired May 15 in the xAI mass cleanup. All four new models, three deprecations, and the DeepSeek pricing change are applied to the JSON in this PR; remaining items (Qwen 3.7 Plus Preview, Cohere FLUX VTO, GPT-Realtime-Translate/Whisper, Subquadratic SubQ, NVIDIA Nemotron 3) are flagged for next cycle.

## Current Inventory Snapshot

| Vendor                | Models in Inventory (active LLMs unless noted) | Last MJ Update         |
| --------------------- | ----------------------------------------------- | ---------------------- |
| OpenAI                | 22+ (incl. embeddings, image, TTS, realtime)    | 2026-05-14             |
| Anthropic             | 7 (8 after this PR)                             | 2026-05-08             |
| Google                | 15 (incl. Gemma, TTS, Nano Banana)              | 2026-05-21             |
| x.ai                  | 8 (9 after this PR; Grok Code Fast 1 → inactive)| 2026-04-20             |
| Mistral AI            | 10 (incl. embed)                                | 2026-04-20             |
| Groq (inference)      | ~12 hosted models                               | 2026-04-20             |
| Alibaba Cloud (Qwen)  | 10 (incl. Qwen 3.7 Max)                         | 2026-05-21             |
| Moonshot AI (Kimi)    | 3                                               | 2026-04-20             |
| DeepSeek              | 2 (+ 1 distilled on Groq)                       | 2026-05-08             |
| Z.AI (GLM)            | 5                                               | 2026-04-20             |
| MiniMax               | 3 (4 after this PR with M3)                     | 2026-04-27             |
| Inception Labs        | 2 (Mercury 2, Mercury Edit 2)                   | 2026-05-18             |
| Black Forest Labs     | 2                                               | 2026-02-12             |
| Cohere                | 4 rerankers + Command A + Embed v4 (Command A+ after this PR) | 2026-05-18 |

## New Models Available

### Tier-1 (high confidence — applied to JSON in this PR)

| Model              | Vendor    | API ID                    | In / Out / 1M    | Context      | Release    | Notes                                                                |
| ------------------ | --------- | ------------------------- | ---------------- | ------------ | ---------- | -------------------------------------------------------------------- |
| **Claude Opus 4.8**| Anthropic | `claude-opus-4-8`         | $5 / $25         | 1M / 128K    | 2026-05-28 | Same price as 4.7; "sharper judgement" capability gains; default `effort=high`; 300K output via batch beta. Available simultaneously on Bedrock (`anthropic.claude-opus-4-8-v1`), Vertex AI, and Microsoft Foundry. |
| **Grok Build 0.1** | x.ai      | `grok-build-0.1`          | $1 / $2 (cached $0.20) | 256K / 2M out | 2026-05-29 | Agentic-coding specialist; always-on reasoning; tool calling; structured outputs; multimodal text+image input. Replaces retired Grok Code Fast 1. |
| **Cohere Command A+** | Cohere | `command-a-plus-05-2026`  | $2.50 / $10      | 128K / 64K   | 2026-05-20 | First Cohere MoE (218B sparse); Apache 2.0; vision + text input; 48 languages. Successor to Command A. |
| **MiniMax-M3**     | MiniMax   | `MiniMax-M3`              | $0.60 / $2.40 list ($0.30 / $1.20 launch promo through ~Jun 7) | 1M / 128K | 2026-06-01 | New MSA sparse-attention architecture; 9.7× prefill / 15.6× decode vs M2.7 at 1M ctx; native multimodal text+image+video; computer-use agentic; open weights + tech report within ~10 days. **NOT** a replacement for M2.7 — positioned as long-context specialist. |

### Tier-2 (verified but deferred — flag only)

| Model | Vendor | Pricing | Rationale for deferring |
|---|---|---|---|
| **Qwen 3.7 Plus** (Preview) | Alibaba Cloud | TBD | Multimodal preview launched alongside 3.7 Max on May 20 — exact tiered pricing not yet published on DashScope. Add when pricing is final. |
| **GPT-Realtime-Translate** | OpenAI | $0.034 / min | Released May 7, 2026. MJ tracks per-minute audio in `MJ: AI Model Price Unit Types`? Verify unit type exists; if not, defer until new unit is added. |
| **GPT-Realtime-Whisper** | OpenAI | $0.017 / min | Same release wave; same unit-type question. |
| **GPT-5.5 pricing change** | OpenAI | claimed $5/$30 (from $2.50/$15) | Multiple third-party trackers report a price increase, but **openai.com/api/pricing was not directly verifiable** by the research agent (403). **Needs human eyes on the official pricing page before any change.** If confirmed, this is the highest-priority correction for next cycle since GPT-5.5 is heavily used. |
| **FLUX VTO** | Black Forest Labs | per-MP via BFL credit system | Image-editing virtual try-on launched May 26. Distinct capability from generation models — adds a new image-edit category. |
| **NVIDIA Nemotron 3 Nano / Super** | NVIDIA (NIM) | $0.05 / $0.20 (Nano); $0.10 / $0.50 (Super) | Strong open-weights candidates flagged last cycle; still no MJ vendor entry for NVIDIA NIM. Add vendor first. |
| **Llama Guard 4 12B** | Meta | hosted on DeepInfra/HF | Multimodal safety classifier; broadly available since April. Distinct category (safety) — not LLM. |
| **Gemini 3.5 Pro** | Google | TBD | Sundar Pichai at I/O: "give us until next month" — June GA expected. No developer API yet. |
| **Gemini Omni / Omni Flash** | Google | TBD | Rolled out to Gemini app May 19; developer API "in coming weeks". |
| **Veo 4 / Imagen 5** | Google | TBD | Announced at I/O; API GA pending. |
| **Grok V9-Medium** | x.ai | TBD | Training complete per Musk on X (May 25); 1.5T params; targets coding lead; expected mid-June. |
| **Claude Mythos Preview** | Anthropic | invite-only | Project Glasswing research preview; no public pricing/IDs. |

## Pricing Changes Detected

| Model                     | Vendor          | Previous Price (In / Out) | Current Price (In / Out) | Action                          |
| ------------------------- | --------------- | ------------------------- | ------------------------ | ------------------------------- |
| **DeepSeek V4 Pro**       | DeepSeek        | $1.74 / $3.48             | **$0.435 / $0.87** (PERMANENT, was promo until May 31) | **✅ Added new cost record dated 2026-05-23** |
| Mistral Large 3 (verification) | Mistral    | $0.50 / $1.50             | $0.50 / $1.50 (CONFIRMED) | No change — official mistral.ai/pricing confirms $0.50/$1.50; the third-party trackers reporting $2/$6 from last cycle were stale or were marketplace-markup figures. **Closes the open question from 2026-05-18 report.** |
| **GPT-5.5**               | OpenAI          | $2.50 / $15 (current MJ)  | **claimed $5 / $30**     | **HOLD — not edited in this PR.** Third-party sources (Register, explainx.ai, OpenRouter) consistently report the bump; official openai.com/api/pricing fetch was blocked (403) during research. **Human verification required before next sync.** If confirmed, GPT 5.5 Pro should also move to $30 / $180. |

## Model Updates & New Versions

- **Claude Opus 4.8 (`claude-opus-4-8`)** — flagship version bump. Same headline pricing and 1M context as 4.7, but Anthropic claims capability gains in reasoning and judgement. New "Fast Mode" tier at $10/$50 per 1M (vs $30/$150 for 4.6/4.7 Fast Mode) is Opus 4.8-only. Replacement on the `claude-opus-4-20250514` deprecation notice now points to 4.8 (was previously 4.7).
- **GPT-Realtime-2 (`gpt-realtime-2`)** — Realtime API GA on May 7, 2026 (3 weeks before this report window opened, but worth noting): 128K context (up from 32K in v1.5), audio in/out $32/$64 per 1M (cached audio in $0.40/1M), text in/out $4/$24 per 1M, image input $5/1M. **The existing MJ row should be verified against these final numbers** — if it was authored against an earlier preview, the context window and pricing need correction.
- **Vertex AI rebrand → Gemini Enterprise Agent Platform** (May 21, 2026). Naming/URL change only — no model impact. Model Garden preserved as sub-feature. The MJ "Vertex AI" vendor entry can stay as-is.
- **Cerebras hosts Kimi K2.6 at 981 tok/s** — verified by Artificial Analysis; enterprise-trial only as of June 1, no public pay-per-token pricing yet. Flag for inventory when GA pricing lands.
- **Fireworks.ai GA**: DeepSeek V4 Pro ($1.75 / $0.15 cached / $3.48 per 1M), Kimi K2.6 ($0.95 / $0.16 cached / $4.00 per 1M). Both also via Microsoft Foundry. **Consider adding Fireworks vendor entries** for both models in next sync — would enable inference routing fallback.

## Deprecated / Sunset Models

### Retired in this window (IsActive=false applied in this PR)

| Model                          | Retirement Date | Source                          | Action Taken             |
| ------------------------------ | --------------- | ------------------------------- | ------------------------ |
| **Grok Code Fast 1**           | 2026-05-15      | docs.x.ai/developers/migration  | **IsActive=false; Description updated.** Replacement is Grok Build 0.1 (added this PR). |
| **Gemini 2.0 Flash**           | 2026-06-01 (today) | ai.google.dev/gemini-api/docs/pricing | **IsActive=false; Description updated.** Replacement: gemini-2.5-flash-lite or Gemini 3 Flash. |
| **Gemini 2.0 Flash-Lite**      | 2026-06-01 (today) | ai.google.dev/gemini-api/docs/pricing | **IsActive=false; Description updated.** Replacement: gemini-2.5-flash-lite or gemini-3.1-flash-lite. |

### Confirmed retirements (vendor-level — not edited in this PR)

| Item                                | Date       | Notes                                                                     |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------- |
| Kimi K2 (original) on Moonshot      | 2026-05-25 | Series of K2 preview/turbo/thinking IDs retired. Replacement: kimi-k2.6. MJ Kimi K2 row has Moonshot + Groq + Fireworks vendors — recommend setting Moonshot + Groq vendor entries to `Status=Deprecated` next sync; Fireworks still works. |
| Llama 3.1 8B on Cerebras            | 2026-05-27 | Confirmed retired on schedule. Cerebras vendor entries on Llama 3.1 8B should be Status=Deprecated. |
| Qwen 3 235B Instruct on Cerebras    | 2026-05-27 | Confirmed retired on schedule. Cerebras vendor entries on the corresponding Qwen row should be Status=Deprecated. |

### Scheduled retirements (heads-up)

| Model                          | Retirement Date | Notes                                                          |
| ------------------------------ | --------------- | -------------------------------------------------------------- |
| Claude Opus 4 / Sonnet 4 (`-20250514`) | 2026-06-15 | Anthropic; Opus 4 replacement updated to Claude Opus 4.8 (was 4.7). |
| GPT-4.5 in ChatGPT             | 2026-06-27      | ChatGPT only — no API impact. Not in MJ inventory.             |
| Vertex AI Generative AI SDK module | 2026-06-24  | Integration code only — migrate to Google Gen AI library. Not a model deprecation. |
| Gemini 2.5 Pro / Flash / Flash-Lite | 2026-10-16 | Extended from original Jun date; Google will give 6mo notice when 3.x GA. |
| Grok Code Fast 1 (auto-redirect to 4.3) | 2026-08-15 | xAI; redirect period ends. Already inactive in MJ this PR. |
| OpenAI Assistants API          | 2026-08-26      | Replaced by Responses API.                                     |
| OpenAI Videos API / Sora 2 snapshots | 2026-09-24| —                                                              |
| DeepSeek `deepseek-chat` / `deepseek-reasoner` aliases | 2026-07-24 | Alias retirements. |

## New Vendors Worth Considering

| Vendor               | Why                                                                | Action                  |
| -------------------- | ------------------------------------------------------------------ | ----------------------- |
| **NVIDIA NIM**       | Nemotron 3 Nano (30B, 1M ctx, $0.05/$0.20) and Super (120B, $0.10/$0.50) are competitive open-weights coders. Flagged last cycle, still not added. | Add vendor + 2 models in next sync. |
| **Together AI**      | Major host of open models (Llama 4, DeepSeek V4 Pro, Qwen 3.6 Plus, Kimi K2.6, MiniMax M2.7, GLM 5.1). Missing from MJ vendor list. | Add as inference provider; useful for routing fallback. |
| **DeepInfra**        | Hosts Kimi K2.6, DeepSeek V4 Pro/V3.2, Nemotron 3 Nano Omni, Llama Guard 4. Closed $107M Series B May 4 (NVIDIA participated). Processes ~5T tokens/week. | Add for K2.6 / Nemotron Omni routing. |
| **Subquadratic (SubQ)** | Launched May 5, 2026 with $29M seed. **First sub-quadratic sparse-attention LLM with 12M-token context** (1M production / 12M research). OpenAI-compatible. Vendor-claimed 1/5 cost of frontier models on long-context tasks. Per-token pricing not yet published publicly. | **Watchlist** — wait for publicly listed pricing before adding. Distinct enough capability (12M context) that it's worth tracking. |
| **Cerebras** (already a vendor) | Now neocloud-positioned, IPO'd May 14. Confirm pricing tracking is up to date next cycle. | Maintenance only. |

## Recommended Actions (Prioritized)

1. **MERGE THIS PR**: Adds 4 high-confidence new models (Opus 4.8, Grok Build 0.1, Command A+, MiniMax-M3), deactivates 3 retired models (Grok Code Fast 1, Gemini 2.0 Flash, Gemini 2.0 Flash-Lite), and corrects DeepSeek V4 Pro pricing to the new permanent rate.
2. **HUMAN VERIFY GPT-5.5 pricing** — third-party sources consistently report a price increase to $5/$30 (Pro to $30/$180), but the official OpenAI pricing page was not directly fetchable during research. This is the single highest-impact open item; check openai.com/api/pricing manually and apply the correction next sync.
3. **Mark Kimi K2 Moonshot + Groq vendor entries as `Status=Deprecated`** — the model is dead on Moonshot (May 25) and Groq (already), still callable on Fireworks. Don't deactivate the whole MJ row; just deactivate the dead vendor entries.
4. **Mark Llama 3.1 8B / Qwen 3 235B Instruct Cerebras vendor entries as `Status=Deprecated`** — both retired on schedule May 27.
5. **Add Fireworks.ai vendor entries** to DeepSeek V4 Pro (`accounts/fireworks/models/deepseek-v4-pro`, $1.75 / $0.15 cached / $3.48 per 1M) and Kimi K2.6 (`accounts/fireworks/models/kimi-k2-6`, $0.95 / $0.16 cached / $4.00 per 1M).
6. **Add Microsoft Foundry / Azure inference vendor entries** for Claude Opus 4.8 if MJ wants to track Foundry routing (Foundry uses passthrough Anthropic pricing).
7. **Verify the existing "GPT Realtime 2" MJ row** matches the May 7 GA spec: 128K context, $32 / $64 audio in/out, $4 / $24 text in/out per 1M, $0.40 cached audio. If it was authored against the 1.5 preview, correct it.
8. **Tier-2 watchlist for next cycle**: Qwen 3.7 Plus Preview (when priced), Gemini 3.5 Pro (June GA expected), Gemini Omni developer API, Veo 4 / Imagen 5 API, NVIDIA Nemotron 3 family (+ add NIM vendor), FLUX VTO (image-edit category), Grok V9-Medium (mid-June), Subquadratic SubQ (when priced).
9. **GPT-Realtime-Translate / Whisper**: Confirm `MJ: AI Model Price Unit Types` supports per-minute audio billing. If not, add a unit type and then catalog these.
10. **Acknowledge** Anthropic's Mythos Preview and OpenAI's GPT-Rosalind exist (both limited-access research previews) — not appropriate for the public model catalog yet.

## Research Sources

### Anthropic
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic Model Deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- [Claude Opus 4.8 — 9to5Mac](https://9to5mac.com/2026/05/28/anthropic-upgrades-claude-with-new-opus-4-8-model-heres-whats-new/)
- [Anthropic raises $65B; releases Claude Opus 4.8 — Fortune](https://fortune.com/2026/05/29/anthropic-raises-65-billion-at-record-965-billion-valuation-promises-mythos-ai-model-in-wide-release-in-coming-weeks-releases-claude-opus-4-8/)
- [Claude Opus 4.8 on Bedrock — AWS](https://www.aboutamazon.com/news/aws/anthropic-claude-4-opus-sonnet-amazon-bedrock)
- [Claude Opus 4.8 Bedrock model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-8.html)
- [Claude Mythos Preview](https://red.anthropic.com/2026/mythos-preview/)

### OpenAI
- [OpenAI Realtime Voice Models May 7](https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/)
- [OpenAI Realtime Voice — ghacks coverage](https://www.ghacks.net/2026/05/11/openai-releases-three-new-realtime-voice-models-for-the-api-with-gpt-5-class-reasoning/)
- [GPT-5.5 pricing — explainx.ai](https://explainx.ai/blog/openai-gpt-55-pricing-fine-tuning-api-wind-down-2026)
- [GPT-5.5 token math — The Register](https://www.theregister.com/ai-and-ml/2026/05/08/gpt-55-may-burn-fewer-tokens-but-it-always-burns-more-cash/5237498)
- [GPT-5.5 cost analysis — OpenRouter](https://openrouter.ai/announcements/gpt55-cost-analysis)
- [GPT-4o / older model retirement](https://openai.com/index/retiring-gpt-4o-and-older-models/)
- [GPT-Rosalind announcement](https://openai.com/index/introducing-gpt-rosalind/)

### Google / Gemini
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 2.0 Flash discontinuation Jun 1, 2026 — Google Devs Forum](https://discuss.ai.google.dev/t/gemini-2-0-flash-discontinuation-date/131389)
- [Gemini 2.0 Flash migration guide — Gemini Lab](https://gemilab.net/en/articles/gemini-api/gemini-2-0-flash-deprecation-june-2026-migration-guide)
- [Gemini 2.5 retirement extended to Oct 2026 — GCP Study Hub](https://gcpstudyhub.com/blog/google-is-retiring-gemini-2-5-on-vertex-ai-what-you-need-to-know-and-do-before-october-2026)
- [Gemini 3.5 Flash model card](https://deepmind.google/models/model-cards/gemini-3-5-flash/)
- [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- [Vertex AI → Gemini Enterprise Agent Platform](https://cloud.google.com/products/gemini-enterprise-agent-platform)
- [Gemini Omni — Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni/)
- [Gemini 3.5 Pro launch guide — Codersera](https://codersera.com/blog/gemini-3-5-pro-launch-guide-2026/)

### x.ai
- [xAI Models docs](https://docs.x.ai/developers/models)
- [May 15, 2026 Model Retirement](https://docs.x.ai/developers/migration/may-15-retirement)
- [Grok Build 0.1 — KuCoin](https://www.kucoin.com/news/flash/xai-launches-grok-build-0-1-for-agentic-coding-with-256k-context-window)
- [Grok Build 0.1 — Basenor](https://www.basenor.com/blogs/news/xai-launches-grok-build-0-1-agentic-coding-model-explained)
- [Grok Build 0.1 — OpenRouter](https://openrouter.ai/x-ai/grok-build-0.1)
- [Grok V9-Medium training milestone — TechTimes](https://www.techtimes.com/articles/317328/20260528/grok-ai-new-model-triples-parameter-count-targets-coding-lead-release-expected-mid-june.htm)

### Mistral
- [Mistral Large 3 docs](https://docs.mistral.ai/models/mistral-large-3-25-12)
- [Mistral Pricing](https://mistral.ai/pricing/)
- [Mistral Changelog](https://docs.mistral.ai/getting-started/changelog)
- [Vibe Remote Agents — Mistral](https://mistral.ai/news/vibe-remote-agents-mistral-medium-3-5/)
- [AI Now Summit 2026 — Mistral](https://mistral.ai/news/ai-now-summit-2026/)

### Alibaba (Qwen)
- [Qwen 3.7 blog](https://qwen.ai/blog?id=qwen3.7)
- [Qwen 3.7 Max — OpenRouter](https://openrouter.ai/qwen/qwen3.7-max)
- [Qwen 3.7 Max — Digital Applied guide](https://www.digitalapplied.com/blog/qwen-3-7-max-alibaba-flagship-ai-model-2026)

### DeepSeek
- [DeepSeek API pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [DeepSeek V4 Pro permanent 75% cut — Engadget](https://www.engadget.com/2180062/deepseek-permanently-reduces-the-price-of-its-flagship-v4-model-by-75-percent/)

### Moonshot (Kimi)
- [Kimi Platform Models](https://platform.kimi.ai/docs/models)
- [Kimi K3 release watch — TokenMix](https://tokenmix.ai/blog/kimi-k3-release-preview-4t-parameters-2026)

### MiniMax
- [MiniMax-M3 announcement](https://www.minimax.io/blog/minimax-m3)
- [MiniMax API release notes](https://platform.minimax.io/docs/release-notes/models)
- [MiniMax-M3 on OpenRouter](https://openrouter.ai/minimax/minimax-m3)

### Inference Providers
- [Groq pricing](https://groq.com/pricing)
- [Groq deprecations](https://console.groq.com/docs/deprecations)
- [Groq $650M raise — Axios](https://www.axios.com/2026/05/28/groq-650-million-nvidia)
- [Cerebras pricing](https://www.cerebras.ai/pricing)
- [Cerebras runs Kimi K2.6 — VentureBeat](https://venturebeat.com/technology/cerebras-says-its-chips-run-a-trillion-parameter-ai-model-nearly-7-times-faster-than-gpu-clouds)
- [Cerebras Llama 3.1 8B deprecation](https://inference-docs.cerebras.ai/models/llama-31-8b)
- [Fireworks DeepSeek V4 Pro](https://fireworks.ai/models/deepseek-ai/deepseek-v4-pro)
- [Fireworks DeepSeek V4 Pro blog](https://fireworks.ai/blog/deepseek-v4-pro-validating-frontier-models-for-production)
- [Azure Foundry — DeepSeek V4 Flash & Pro](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-deepseek-v4-flash-and-v4-pro-in-microsoft-foundry/4515174)
- [Microsoft Foundry May 2026 changelog](https://devblogs.microsoft.com/foundry/whats-new-in-microsoft-foundry-may-2026/)
- [Fireworks AI on Foundry](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/open-model-inference-at-scale-on-foundry-what%E2%80%99s-new-with-fireworks-ai/4519534)
- [OpenRouter $1.3B Series B — TechCrunch](https://techcrunch.com/2026/05/26/openrouter-more-than-doubles-valuation-to-1-3b-in-a-year/)
- [OpenRouter changelog](https://openrouter.ai/docs/changelog)

### Specialized Vendors
- [Cohere Command A+ docs](https://docs.cohere.com/docs/command-a-plus)
- [Cohere Rerank 4 changelog](https://docs.cohere.com/changelog/rerank-v4.0)
- [Cohere deprecations](https://docs.cohere.com/docs/deprecations)
- [BFL pricing](https://bfl.ai/pricing)
- [Mercury 2 pricing reference](https://pricepertoken.com/pricing-page/model/inception-mercury-2)
- [Llama Guard 4 model card](https://www.llama.com/docs/model-cards-and-prompt-formats/llama-guard-4/)
- [Muse Spark by Meta SL](https://ai.meta.com/blog/introducing-muse-spark-msl/)
- [NVIDIA Nemotron 3 family](https://nvidianews.nvidia.com/news/nvidia-debuts-nemotron-3-family-of-open-models)
- [Subquadratic SubQ launch — SiliconANGLE](https://siliconangle.com/2026/05/05/subquadratic-launches-29m-bring-12m-token-context-windows-ai/)
- [DeepInfra Series B](https://deepinfra.com/series-b)
- [Together AI pricing](https://www.together.ai/pricing)

---

## Notes for Reviewers

- **Prompt-injection encountered during research**: One sub-agent's WebSearch response contained an injected `<system-reminder>`-style block attempting to surface a fake "skills" list. The sub-agent ignored it and continued the original research task. Flagging here for awareness.
- **DeepSeek V4 Pro cost record strategy**: Per the prompt's "don't modify old cost records, add new ones" guidance, the new permanent-pricing cost record was appended with `StartedAt=2026-05-23`. The prior `2026-04-24` cost record at $1.74/$3.48 is left in place as historical record. Downstream consumers should select the most-recent active cost row per `StartedAt`.
- **Gemini 2.0 Flash / Flash-Lite were retired today**: this report is timed to the actual sunset. The `IsActive=false` flip is appropriate as of the date of this PR; if the PR merges in the next day or two, the model is already dead in production.
- **Grok Code Fast 1**: Set to `IsActive=false` for the MJ row. xAI redirects calls to grok-4.3 through 2026-08-15, so callers using the old API name aren't immediately broken — but new code should use Grok Build 0.1 (added this PR) or Grok 4.3.
- **PriorVersionID lineage**: Set on all four new entries (Opus 4.8 → Opus 4.7; Grok Build 0.1 → Grok Code Fast 1; Command A+ → Command A; MiniMax-M3 → MiniMax-M2.7). MiniMax-M3 is not a strict successor to M2.7 (they coexist), but PriorVersionID is the closest available metaphor for the lineage tracker.
