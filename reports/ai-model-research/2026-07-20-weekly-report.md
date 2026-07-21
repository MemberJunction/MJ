# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-07-20
**Research Period**: 2026-07-13 → 2026-07-20
**Base Branch**: `next`
**Working Branch**: `claude/ai-model-research-2026-07-20`

## Executive Summary

Two in-window frontier releases warrant additions to the inventory this week:

1. **Kimi K3** (Moonshot AI, July 16, 2026) — the ~2.8T-parameter open-weight multimodal MoE previously on our watch list, now confirmed GA with pricing ($3.00 input / $15.00 output per 1M, $0.30 cached-input; 1M context). **Added to `.ai-models.json`** with Moonshot direct + OpenRouter vendor entries.
2. **Inkling** (Thinking Machines Lab, July 15, 2026) — the first major U.S. open-weights frontier release of 2026 from Mira Murati's lab. 975B total / 41B active MoE, Apache 2.0, 1M context. **Added to `.ai-models.json`** with a new **Thinking Machines Lab** vendor entry and an OpenRouter-based cost record ($1.00 / $4.05 per 1M).

The rest of the landscape is stable: **GLM 5.2 direct-API pricing is verified as correct** at $1.40/$4.40 (a lingering question from the 2026-07-13 report — the lower aggregator numbers are OpenRouter-hosted providers, not Z.AI direct). All other tracked baseline prices match current market pricing. The **DeepSeek `deepseek-chat` / `deepseek-reasoner` deprecation on 2026-07-24 15:59 UTC is CONFIRMED** with no delay — no MJ action needed because those aliases are not in the current inventory.

Several items are added to the watch list (Qwen 3.8-Max-Preview subscription-only, Gemini 3.5 Pro third-time slipped, GPT-Live-1 ChatGPT-only, Nemotron 4 still in training).

## Current Inventory Snapshot

| Category | Before | After this PR | Delta |
|---|---|---|---|
| Total model entries | 172 | 174 | +2 |
| Active models | 148 | 150 | +2 |
| Vendors | 29 | 30 | +1 |

> Baseline note: this research was performed against a 170-model `next`. `next` has since gained **Gemini 3.6 Flash** and **Gemini 3.5 Flash-Lite** (PR #3238), so the table above reflects the post-rebase baseline of 172. Counts are exact, not approximate.

Vendors after this PR (30): Anthropic, OpenAI, Google, Vertex AI, Azure, Amazon Bedrock, x.ai, Groq, Cerebras, Mistral AI, Alibaba Cloud, Moonshot AI, Z.AI, MiniMax, DeepSeek, Cohere, NVIDIA, Black Forest Labs, Inception Labs, Fireworks.ai, OpenRouter, LM Studio, LocalEmbeddings, Tasio Labs, Eleven Labs, HeyGen, AssemblyAI, Inworld, HuggingFace, **Thinking Machines Lab** (new).

## New Models Available

### Kimi K3 (Moonshot AI) — **ADDED to `.ai-models.json`**

- **Vendors**: Moonshot AI (Model Developer + Inference Provider), OpenRouter as `moonshotai/kimi-k3`
- **API names**: `kimi-k3` (Moonshot direct at `https://api.moonshot.ai/v1`); `moonshotai/kimi-k3` (OpenRouter)
- **Released**: July 16, 2026
- **Context window**: 1,048,576 input tokens; 262,144 max output tokens (chosen conservatively; some sources report symmetric 1M output)
- **Pricing**: $3.00 input / $15.00 output per 1M tokens; $0.30 per 1M cached-input tokens; **flat across full context** (no long-context surcharge)
- **Capabilities**: Streaming, JSON output, tool calling, native multimodal (text + images), long-horizon agent workflows, repo navigation. Modified MIT open weights on Hugging Face.
- **Positioning in inventory**: `PowerRank: 22` (above Kimi K2.6 at 18, below Grok 4.5 at 25); `SpeedRank: 6` (large MoE); `CostRank: 5` (between Grok 4.5 at 6 and Kimi K2.6 at 3)
- **Prior version**: Kimi K2.6
- **DriverClass**: `MoonshotLLM` (native), `OpenRouterLLM` (OpenRouter)
- **Note**: Was on last week's watch list; now GA with pricing published, so added this week.
- **Sources**: [Moonshot Kimi K3 blog](https://www.kimi.com/blog/kimi-k3), [OpenRouter listing](https://openrouter.ai/moonshotai/kimi-k3), [Simon Willison notes](https://simonwillison.net/2026/Jul/16/kimi-k3/), [Kie.ai pricing guide](https://kie.ai/blog/kimi-k3-pricing), [Verdent K3 API guide](https://www.verdent.ai/guides/agents/kimi-k3-api-guide), [Bloomberg coverage](https://www.bloomberg.com/news/articles/2026-07-17/china-s-powerful-new-moonshot-ai-model-closes-gap-with-us-rivals)

### Inkling (Thinking Machines Lab) — **ADDED to `.ai-models.json`** (with new vendor row)

- **Vendors**: Thinking Machines Lab (Model Developer — NEW vendor entry added to `.ai-vendors.json`), OpenRouter as `thinkingmachines/inkling`
- **API names**: `inkling` (Tinker direct); `thinkingmachines/inkling` (OpenRouter)
- **Released**: July 15, 2026
- **Context window**: 1M tokens *architecturally*, but **the OpenRouter vendor row carries 524,288** — OpenRouter's endpoints API reports `context_length: 524288` for the sole (Together-backed) endpoint `thinkingmachines/inkling-20260715`, and Tinker offers only 64K/256K options. Per `CLAUDE.md` ("use actual provider limits, not theoretical model capabilities") the row records the served limit. `MaxOutputTokens` is 262,144: OpenRouter reports `max_completion_tokens: null` (no separate cap), so this is the conservative house convention value and sits safely under the 524K context.
- **Pricing**: OpenRouter at $1.00 input / $4.05 output per 1M tokens (this is the cost record on the model). Direct Tinker API is running a 50% launch-promo at $1.87 input / $0.374 cached-input / $4.68 output — noted in the cost row comments but not recorded as a separate cost record to avoid tying pricing history to a temporary discount.
- **Capabilities**: Streaming, JSON output, tool calling; multimodal pretraining on 45T tokens (text/image/audio/video); Apache 2.0 open-weights on Hugging Face at launch
- **Architecture**: 975B total / 41B active MoE
- **Positioning in inventory**: `PowerRank: 20` (above Kimi K2.6 at 18, below Kimi K3 at 22); `SpeedRank: 6`; `CostRank: 4` (cheaper than K3 at $1 input via OpenRouter)
- **DriverClass**: `OpenRouterLLM` (via OpenRouter). No direct Tinker driver entry added because no `TinkerLLM` / `ThinkingMachinesLLM` driver class exists in the codebase yet; a subsequent PR can add the direct inference-provider row when native driver support lands.
- **Other inference providers (not yet added — follow-up)**: Thinking Machines lists Together AI, **Fireworks**, Modal, Databricks, and Baseten as launch inference partners. Fireworks.ai is already an MJ vendor with a working `FireworksLLM` driver (used by Kimi K2/K2.5), so a Fireworks inference row is addable once its model slug and served context are verified. Until then Inkling has a **single** inference path (OpenRouter), which is a single point of failure.
- **Sources**: [Thinking Machines Inkling announcement](https://thinkingmachines.ai/news/introducing-inkling/), [TechCrunch coverage](https://techcrunch.com/2026/07/15/thinking-machines-amps-up-its-bet-against-one-size-fits-all-ai-with-its-first-open-model-inkling/), [OpenRouter listing](https://openrouter.ai/thinkingmachines/inkling), [Artificial Analysis leaderboard](https://artificialanalysis.ai/models/inkling)

### Thinking Machines Lab — **NEW VENDOR ADDED to `.ai-vendors.json`**

Mira Murati's AI research startup, founded by former OpenAI leadership. Currently ships one model (Inkling) via direct Tinker API and OpenRouter. First major U.S. open-weights frontier lab release of 2026. Credential type: API Key.

## Pricing Changes Detected

**None requiring JSON updates.** All baseline pricing verified via multiple sources as unchanged from the 2026-07-13 report:

| Model | Vendor | JSON price (In/Out per 1M) | Web price this week | Match? |
|---|---|---|---|---|
| Claude Opus 4.8 | Anthropic | $5 / $25 | $5 / $25 | ✅ |
| Claude Sonnet 5 | Anthropic | $2 / $10 (intro through Aug 31) | Same | ✅ |
| Claude Fable 5 | Anthropic | $10 / $50 | $10 / $50 | ✅ |
| Claude Haiku 4.5 | Anthropic | $1 / $5 | $1 / $5 | ✅ |
| GPT 5.6 Sol | OpenAI | $5 / $30 | $5 / $30 | ✅ |
| GPT 5.6-terra | OpenAI | $2.50 / $15 | $2.50 / $15 | ✅ |
| GPT 5.6-luna | OpenAI | $1 / $6 | $1 / $6 | ✅ |
| Gemini 3.5 Flash | Google | $1.50 / $9 | $1.50 / $9 | ✅ |
| Grok 4.5 | x.ai | $2 / $6 | $2 / $6 | ✅ |
| Grok 4.20 | x.ai | $2 / $6 | $2 / $6 | ✅ |
| Grok 4.3 | x.ai | $1.25 / $2.50 | $1.25 / $2.50 | ✅ |
| DeepSeek V4 Pro | DeepSeek | $0.435 / $0.87 | $0.435 / $0.87 | ✅ |
| DeepSeek V4 Flash | DeepSeek | $0.14 / $0.28 | $0.14 / $0.28 | ✅ |
| Kimi K2.6 | Moonshot AI | $0.60 / $2.50 | $0.60 / $2.50 | ✅ |
| **GLM 5.2** | Z.AI | **$1.40 / $4.40** | **$1.40 / $4.40 (direct-API)** | ✅ **VERIFIED** |

### GLM 5.2 pricing — resolved from last week

Last week's report flagged the JSON's $1.40/$4.40 as "possibly stale" because aggregators showed a wide range ($0.406–$0.93 in / $1.28–$3 out). **The JSON is correct.** Z.AI's canonical direct-API price is $1.40 input / $4.40 output per 1M tokens (plus $0.26/1M cached input). The lower aggregator numbers are third-party OpenRouter provider pools, not Z.AI direct. **No JSON change needed.** Sources: [AI Pricing Guru Z.AI](https://www.aipricing.guru/z-ai-pricing/), [PricePerToken GLM 5.2](https://pricepertoken.com/pricing-page/model/z-ai-glm-5.2), [OpenRouter GLM 5.2](https://openrouter.ai/z-ai/glm-5.2), [DeepInfra blog](https://deepinfra.com/blog/glm-5-2-pricing-benchmarks-cost-comparison).

### Cohere rerank-v4-fast — potential description-text update (flagged, not edited)

The Cohere pricing page currently shows `rerank-v4.0-fast` at **$2.00 per 1K searches** (= $0.002/search). The description text in `.cohere-reranker-models.json` for the `rerank-v4-fast` entry says **$1.50 per 1,000 search units**. This looks like either (a) a Cohere price increase since Rerank 4 launched on 2025-12-16 or (b) an error in our original description. **Flagged for human review** — I did not edit the file because rerank pricing is not modeled as a `MJ: AI Model Costs` row (it doesn't map cleanly to Per-1M-Tokens); the number lives only in the description comment. A human should verify Cohere's launch price vs. current price before deciding whether to update the note. Sources: [Cohere pricing page](https://cohere.com/pricing), [Cohere Rerank 4.0 changelog](https://docs.cohere.com/changelog/rerank-v4.0), [OpenRouter rerank-4-fast](https://openrouter.ai/cohere/rerank-4-fast).

## Model Updates & New Versions

None requiring JSON updates.

- **Anthropic in-window activity** was platform-only, not model releases: mid-conversation system messages went GA on Fable 5 / Mythos 5 / Opus 4.8 across API/Bedrock/Vertex (July 15); self-serve HIPAA config for Enterprise + API orgs (July 15); Admin API user-management beta (July 14).
- **Gemma 4 stealth in-place refresh** (July 15) — Same HF repo paths for the entire Gemma 4 family (`google/gemma-4-E2B`, `-E4B`, `-12B`, `-26B-A4B`, `-31B` and IT/QAT variants), new weights + templates + kernels. Adds Flash Attention 4 kernel path on Hopper (prefill throughput +25–70%, TTFT down up to 31%), tool-calling JSON consistency patches, OCR max-soft-tokens cap raised 280 → 1120. **No pricing change, no name change, no new SKU.** Providers picked up the new weights under the same names.
- **Groq deprecations announced** (June 17, effective ~August): `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` are scheduled for removal. Recommended Groq-hosted replacements: `openai/gpt-oss-20b` and `openai/gpt-oss-120b` (both already in the MJ inventory). The MJ inventory rows for "Llama 3.1 8b" and "Llama 3.3 70B Versatile" pointing at Groq will need `IsActive=false` and/or `Status="Deprecated"` on the Groq vendor row when the removal date lands — flagged for next report or an out-of-band task.
- **Cerebras `ZAI-GLM-4.7`** — scheduled for deprecation on 2026-08-17 per Cerebras pricing page. Not in MJ inventory directly (GLM 4.7 is on OpenRouter/Z.AI in the JSON, not Cerebras), so no action.

## Deprecated / Sunset Models

- **DeepSeek `deepseek-chat` and `deepseek-reasoner`** — Deprecation **CONFIRMED** for 2026-07-24 15:59 UTC (no delay, no grace period, no extension). Multiple sources agree (official docs, Developers Digest, TheRouter.ai, Enterprise DNA, byteiota). Migration: send `model: "deepseek-v4-flash"` with `thinking: {"type": "enabled"}` for reasoning behavior. **No MJ action required** — those aliases are not in the current inventory; MJ's DeepSeek rows already use `deepseek-v4-pro` / `deepseek-v4-flash`.

No models currently active in the MJ inventory are approaching end-of-life this week.

## New Vendors Worth Considering

- **Thinking Machines Lab** — added this week (Inkling launch). See above.

Two items to note (not adding as vendors yet):

- **Nemotron Coalition** — 8-lab collaboration (NVIDIA + Mistral AI + others) developing the upcoming Nemotron 4 base model, announced 2026-03-16 and Jensen-teased at Computex 2026. **Still in training as of 2026-07-20.** No API endpoint, no OpenRouter listing, no HF upload for the new Nemotron 4 family (the existing `nvidia/Nemotron-4-340B-*` on HF is the 2024 model, not the Coalition model). NVIDIA is already an inventory vendor via Nemotron 3, so when the Coalition model ships no new vendor row will be needed.
- **Thinking Machines Lab Tinker API** — recorded as vendor row but no direct-driver inference-provider row on the Inkling model. When `TinkerLLM` / `ThinkingMachinesLLM` driver support lands in code, add the direct inference-provider row + cost record for the Tinker API at that time.

## Recommended Actions

Ordered by impact:

1. **[This PR — done]** Add `Kimi K3` and `Inkling` to `.ai-models.json`; add `Thinking Machines Lab` vendor to `.ai-vendors.json`.
2. **[Watch — next report]** Confirm Kimi K3 API stability and any pricing adjustments. Confirm Inkling OpenRouter listing pricing is still $1/$4.05 (launch pricing on both direct API and OpenRouter is often volatile in the first 2–4 weeks).
3. **[Human decision — low priority]** Verify Cohere rerank-v4-fast pricing history. If Cohere increased the price from $1.50 to $2.00 per 1K searches since launch, the `.cohere-reranker-models.json` description text for `rerank-v4-fast` should be updated. If our original entry was wrong at launch time, still worth correcting.
4. **[Prepare for coming deprecations]**
   - Groq's `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` are removal-eligible. When Groq confirms the removal date, flip `IsActive=false` (or `Status="Deprecated"`) on the Groq vendor rows for the MJ inventory entries "Llama 3.1 8b" and "Llama 3.3 70B Versatile" (Groq specifically — OpenRouter/other-provider rows can stay active).
5. **[Watch — next report]** Qwen 3.8-Max-Preview (July 19 announcement) — no per-token pricing yet, subscription-only via Alibaba Token Plan; check for a DashScope per-token rate card and any OpenRouter listing. Gemini 3.5 Pro (missed July 17 target for the third time, now Aug). GPT-Live-1 / GPT-Live-1 mini (ChatGPT-only, API "coming soon"). Nemotron 4 Coalition model. MiniMax M3 Pro (Q3 2026 target). DeepSeek V5/R2. xAI 2T frontier model (Musk suggested "as soon as August 2026").

## Research Sources

Frontier vendors (Anthropic / OpenAI / Google):
- [Anthropic release notes](https://platform.claude.com/docs/en/release-notes/overview)
- [AI Pricing Guru — Anthropic](https://www.aipricing.guru/anthropic-pricing/)
- [BenchLM — Anthropic](https://benchlm.ai/anthropic/api-pricing)
- [TLDL — Anthropic pricing](https://www.tldl.io/resources/anthropic-api-pricing)
- [TechCrunch: GPT-5.6 launch (Jul 9)](https://techcrunch.com/2026/07/09/openai-launches-its-new-family-of-models-with-gpt-5-6/)
- [BenchLM — OpenAI](https://benchlm.ai/openai/api-pricing)
- [Eesel: GPT-Live pricing](https://www.eesel.ai/blog/gpt-live-pricing)
- [TechTimes: Gemini 3.5 Pro third slip (Jul 16)](https://www.techtimes.com/articles/320736/20260716/rebuilt-gemini-35-pro-misses-third-deadline-google-eyes-stopgap-release.htm)
- [Vertex AI generative release notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes)

xAI / DeepSeek / Meta / Mistral:
- [xAI Grok 4.5 announcement](https://x.ai/news/grok-4-5)
- [BenchLM xAI pricing](https://benchlm.ai/xai/api-pricing)
- [DeepSeek Change Log](https://api-docs.deepseek.com/updates/)
- [DeepSeek retirement notice — Developers Digest](https://www.developersdigest.tech/blog/deepseek-chat-to-v4-migration-guide)
- [DeepSeek V4 API migration — TheRouter](https://therouter.ai/news/deepseek-v4-api-migration-deprecation-2026/)
- [DeepSeek roadmap rumors](https://chat-deep.ai/guide/deepseek-roadmap-rumors/)
- [Meta Llama 5 forecast — Manifold Markets](https://manifold.markets/winged_one/when-will-meta-release-llama-5)
- [Mistral Robostral Navigate](https://mistral.ai/news/robostral-navigate/)
- [Mistral Leanstral 1.5](https://mistral.ai/news/leanstral-1-5/)
- [AI Pricing Guru — Mistral](https://www.aipricing.guru/mistral-ai-pricing/)

Chinese labs & open models:
- [Moonshot Kimi K3 blog](https://www.kimi.com/blog/kimi-k3)
- [OpenRouter Kimi K3](https://openrouter.ai/moonshotai/kimi-k3)
- [Simon Willison — Kimi K3](https://simonwillison.net/2026/Jul/16/kimi-k3/)
- [Kie.ai — Kimi K3 pricing](https://kie.ai/blog/kimi-k3-pricing)
- [Verdent — Kimi K3 API guide](https://www.verdent.ai/guides/agents/kimi-k3-api-guide)
- [Bloomberg: China's powerful new Moonshot AI model (Jul 17)](https://www.bloomberg.com/news/articles/2026-07-17/china-s-powerful-new-moonshot-ai-model-closes-gap-with-us-rivals)
- [Alibaba Qwen 3.8 Max Preview — MarkTechPost](https://www.marktechpost.com/2026/07/19/alibaba-previews-qwen3-8-max-a-2-4-trillion-parameter-multimodal-model-days-after-moonshots-kimi-k3-open-weight-launch/)
- [Bloomberg: Alibaba Qwen 3.8 preview (Jul 19)](https://www.bloomberg.com/news/articles/2026-07-19/alibaba-s-qwen-unveils-preview-of-flagship-ai-model)
- [Z.AI GLM 5.2 — AI Pricing Guru](https://www.aipricing.guru/z-ai-pricing/)
- [GLM 5.2 pricing — PricePerToken](https://pricepertoken.com/pricing-page/model/z-ai-glm-5.2)
- [OpenRouter GLM 5.2](https://openrouter.ai/z-ai/glm-5.2)
- [MiniMax Music-3.0 — Manifold July 2026 summary](https://manifold.markets/prismatic/july-2026-ai-model-releases)
- [Silicon Report — MiniMax M3 Pro 2.7T open-source](https://www.siliconreport.com/chinas-minimax-reportedly-prepping-2-7t-parameter-open-source-model-44b80ac2)
- [NVIDIA Nemotron Coalition announcement](https://nvidianews.nvidia.com/news/nvidia-launches-nemotron-coalition-of-leading-global-ai-labs-to-advance-open-frontier-models)
- [MarkTechPost — Nemotron-Labs-TwoTower](https://www.marktechpost.com/2026/07/01/nvidia-releases-nemotron-labs-twotower/)
- [Gemma 4 stealth update — The Decoder](https://the-decoder.com/gemma-4-gets-a-stealth-update-that-fixes-tool-calling-bugs-and-truncated-responses-under-the-same-name/)

Inference platforms & specialty:
- [Groq deprecations](https://console.groq.com/docs/deprecations)
- [Groq pricing](https://groq.com/pricing)
- [Cerebras pricing](https://www.cerebras.ai/pricing)
- [Cerebras model catalog](https://inference-docs.cerebras.ai/models/overview)
- [Fireworks pricing](https://fireworks.ai/pricing)
- [OpenRouter announcements](https://openrouter.ai/blog/announcements/)
- [Amazon Bedrock supported models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html)
- [Azure OpenAI What's New](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/whats-new)
- [Cohere pricing](https://cohere.com/pricing)
- [Cohere Rerank 4 changelog](https://docs.cohere.com/changelog/rerank-v4.0)
- [Thinking Machines Inkling announcement](https://thinkingmachines.ai/news/introducing-inkling/)
- [TechCrunch — Inkling (Jul 15)](https://techcrunch.com/2026/07/15/thinking-machines-amps-up-its-bet-against-one-size-fits-all-ai-with-its-first-open-model-inkling/)
- [Artificial Analysis — Inkling](https://artificialanalysis.ai/models/inkling)
- [OpenRouter Inkling](https://openrouter.ai/thinkingmachines/inkling)
- [AssemblyAI Universal-3 Pro](https://www.assemblyai.com/blog/introducing-universal-3-pro)
