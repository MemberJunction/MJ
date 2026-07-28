# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-07-27
**Research Period**: 2026-07-20 → 2026-07-27
**Base Branch**: `next`
**Working Branch**: `claude/ai-model-research-2026-07-27`

## Executive Summary

One in-window frontier release warrants an addition to the inventory this week:

1. **Claude Opus 5** (Anthropic, July 24, 2026) — Anthropic's fifth-generation Opus flagship. Simultaneously available on Anthropic direct API, Amazon Bedrock, Claude Platform on AWS, Google Vertex AI, and Microsoft Foundry. Ships at the **same $5/$25 per-1M pricing as Opus 4.8** while doubling Frontier-Bench v0.1 performance and reaching within 0.5% of Fable 5 on CursorBench 3.2 at half the cost. **Added to `.ai-models.json`** with Anthropic (developer + inference), Amazon Bedrock, and OpenRouter rows.

Two housekeeping edits piggyback on this PR:

- **Claude Opus 4.1** description text updated — Anthropic's official migration guide now points **claude-opus-4-1-20250805** users at **Claude Opus 5**, not Claude Opus 4.8. Retirement is 9 days out (August 5, 2026). `IsActive` stays `true` for now; the retirement itself will fall in next week's window and be handled then.
- **`.cohere-reranker-models.json`** `rerank-v3.5` description updated to reflect the confirmed **August 1, 2026 auto-migration** to `cohere-rerank-4-fast`. Cohere routes deprecated 3.5 requests to `rerank-4-fast` automatically after that date, and the scores change (hard-coded thresholds need retuning).

Baseline pricing across all tracked frontier vendors matches current market pricing — no cost-record edits required. Several previously-watched items remain in the "not yet ready" pile (see the watch list).

## Current Inventory Snapshot

| Category | Before | After this PR | Delta |
|---|---|---|---|
| Total model entries | 174 | 175 | +1 |
| Active models | 150 | 151 | +1 |
| Vendors | 30 | 30 | 0 |

Baseline is the 2026-07-20 report's end-state (174 / 150 / 30). `next` had no new AI-metadata PRs merge between last week's report and today.

Vendors after this PR (30, unchanged): Anthropic, OpenAI, Google, Vertex AI, Azure, Amazon Bedrock, x.ai, Groq, Cerebras, Mistral AI, Alibaba Cloud, Moonshot AI, Z.AI, MiniMax, DeepSeek, Cohere, NVIDIA, Black Forest Labs, Inception Labs, Fireworks.ai, OpenRouter, LM Studio, LocalEmbeddings, Tasio Labs, Eleven Labs, HeyGen, AssemblyAI, Inworld, HuggingFace, Thinking Machines Lab.

## New Models Available

### Claude Opus 5 (Anthropic) — **ADDED to `.ai-models.json`**

- **Vendors**: Anthropic (Model Developer + Inference Provider), Amazon Bedrock (`anthropic.claude-opus-5`), OpenRouter (`anthropic/claude-opus-5`; the `anthropic/claude-opus-5-fast` variant is mentioned in the cost-row comments but not carried as its own vendor row — the fast slug is a routing-mode selector, not a distinct model)
- **API names**: `claude-opus-5` (Anthropic direct + Claude Platform on AWS + Vertex AI, all identical string); `anthropic.claude-opus-5` (Bedrock; also `global.anthropic.claude-opus-5` on the bedrock-runtime client); `anthropic/claude-opus-5` (OpenRouter)
- **Released**: July 24, 2026 (simultaneous on all four cloud surfaces)
- **Context window**: 1,000,000 input tokens; 128,000 max output tokens (300K via `output-300k-2026-03-24` batch beta)
- **Pricing**: $5 input / $25 output per 1M tokens on all surfaces (**identical to Opus 4.8**); cache-hit reads at $0.50/1M; Batch API 50% discount ($2.50/$12.50); Fast Mode tier at $10/$50 per 1M (2.5x throughput / 2x price) via `speed: "fast"` (Fast Mode for Opus 4.7 was removed in the same release notes and returns an error)
- **Capabilities**: Streaming, JSON output, tool use, adaptive thinking (defaults to `effort: high` on the Claude API and Claude Code — set explicitly to change), mid-conversation tool changes (beta), automatic safety fallbacks (beta), visual output generation, stronger agentic self-verification, multilingual, vision, up to 2576px image input
- **Performance headline**: 2× Opus 4.8 on Frontier-Bench v0.1; within 0.5% of Fable 5 on CursorBench 3.2 at ½ the cost; ≥ Fable 5 on OSWorld 2.0 at ⅓ the cost; ~3× the next-best score on ARC-AGI 3; ~1.5× the next competitor on Zapier AutomationBench (Anthropic's own numbers, cited by MarkTechPost, Coursiv, 9to5Mac)
- **Knowledge cutoff**: May 2026 (training data cutoff also May 2026)
- **Positioning in inventory**: `PowerRank: 26` (above Opus 4.8 at 24 and Grok 4.5 at 25, below Claude Fable 5 at 30 and Claude Mythos 5); `SpeedRank: 7` (same tier as Opus 4.8 / Sonnet 5); `CostRank: 10` (same tier as Opus 4.8)
- **Prior version**: `Claude Opus 4.8`
- **DriverClass**: `AnthropicLLM` (native), `BedrockLLM` (Bedrock), `OpenRouterLLM` (OpenRouter). All three drivers already exist and support this API shape — no code changes needed to consume the new vendor rows.
- **Sources**: [Anthropic — Introducing Claude Opus 5](https://www.anthropic.com/news/claude-opus-5), [Anthropic Platform Models overview](https://platform.claude.com/docs/en/about-claude/models/overview), [Migration guide → Opus 5](https://platform.claude.com/docs/en/about-claude/models/migration-guide), [OpenRouter — Claude Opus 5](https://openrouter.ai/anthropic/claude-opus-5), [OpenRouter — Claude Opus 5 (Fast)](https://openrouter.ai/anthropic/claude-opus-5-fast), [AWS ML blog — Claude Opus 5 on AWS](https://aws.amazon.com/blogs/machine-learning/introducing-claude-opus-5-on-aws-anthropics-most-capable-opus-model/), [AWS What's New — Claude Opus 5 available](https://aws.amazon.com/about-aws/whats-new/2026/07/claude-opus-5-aws/), [AWS docs — Claude Opus 5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5.html), [Anthropic's Claude Opus product page](https://www.anthropic.com/claude/opus), [MarkTechPost — Meet the new Claude Opus 5 (Jul 24)](https://www.marktechpost.com/2026/07/24/meet-the-new-claude-opus-5-frontier-class-agentic-coding-and-computer-use-at-unchanged-opus-pricing/), [9to5Mac — Anthropic upgrades Claude with Opus 5 (Jul 24)](https://9to5mac.com/2026/07/24/anthropic-upgrades-claude-with-new-opus-5-model-details-here/), [Coursiv — Claude Opus 5 guide (Jul 2026)](https://coursiv.io/blog/claude-opus-5)

## Pricing Changes Detected

**None requiring JSON updates.** All baseline pricing verified from multiple sources as unchanged from the 2026-07-20 report:

| Model | Vendor | JSON price (In/Out per 1M) | Web price this week | Match? |
|---|---|---|---|---|
| Claude Opus 5 (NEW) | Anthropic | $5 / $25 (added this PR) | $5 / $25 | ✅ (baseline for the added row) |
| Claude Opus 4.8 | Anthropic | $5 / $25 | $5 / $25 | ✅ |
| Claude Sonnet 5 | Anthropic | $2 / $10 (intro through Aug 31) | $2 / $10 (intro) | ✅ |
| Claude Fable 5 | Anthropic | $10 / $50 | $10 / $50 | ✅ |
| Claude Haiku 4.5 | Anthropic | $1 / $5 | $1 / $5 | ✅ |
| GPT 5.6 Sol | OpenAI | $5 / $30 | $5 / $30 | ✅ |
| GPT 5.6-terra | OpenAI | $2.50 / $15 | $2.50 / $15 | ✅ |
| GPT 5.6-luna | OpenAI | $1 / $6 | $1 / $6 | ✅ |
| Gemini 3.5 Flash | Google | $1.50 / $9 | $1.50 / $9 | ✅ |
| Grok 4.5 | x.ai | $2 / $6 | $2 / $6 | ✅ |
| DeepSeek V4 Pro | DeepSeek | $0.435 / $0.87 | $0.435 / $0.87 | ✅ |
| DeepSeek V4 Flash | DeepSeek | $0.14 / $0.28 | $0.14 / $0.28 | ✅ |
| Kimi K3 | Moonshot AI | $3 / $15 (cached-in $0.30/1M) | $3 / $15 | ✅ |
| Kimi K2.6 | Moonshot AI | $0.60 / $2.50 | $0.60 / $2.50 | ✅ |
| GLM 5.2 | Z.AI | $1.40 / $4.40 | $1.40 / $4.40 (direct-API) | ✅ |
| Inkling | Thinking Machines / OpenRouter | $1 / $4.05 | $1 / $4.05 | ✅ |
| Mistral Medium 3.5 | Mistral AI | $1.50 / $7.50 | $1.50 / $7.50 | ✅ |
| Mistral Large 3 | Mistral AI | $0.50 / $1.50 | $0.50 / $1.50 | ✅ |
| Mistral Small 4 | Mistral AI | $0.15 / $0.60 | $0.15 / $0.60 | ✅ |
| Cohere Command A | Cohere | (as JSON) | Command A+ (`command-a-plus-05-2026`) is now GA per Cohere docs — new SKU, not a price change on the existing row | ✅ existing row unchanged; new SKU flagged in Watch List |

## Model Updates & New Versions

### Claude Opus 4.1 — description-text update **APPLIED**

The retirement date (August 5, 2026) is 9 days after this report. Anthropic's [migration guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide) now points Opus 4.1 users at **Claude Opus 5** rather than Opus 4.8, since Opus 5 is the current Opus flagship at the same $5/$25 pricing as 4.8. The description text on the Opus 4.1 entry was updated to reflect this. `IsActive` stays `true` for this week — the retirement is next-week's window and the vendor row will be flipped to `Status="Deprecated"` (or the model to `IsActive=false`) as part of the 2026-08-03 report.

### Cohere `rerank-v3.5` — description-text update **APPLIED**

Cohere confirmed 2026-07-01 that `cohere-rerank-3.5` is deprecated and starting **2026-08-01** it will be auto-served by `cohere-rerank-4-fast`. Scores differ — hard-coded thresholds need retuning. The description in `.cohere-reranker-models.json` was updated to note the auto-migration date and recommended target. `IsActive` stays `true` because the endpoint still resolves (transparently under the hood after Aug 1) — the row provides continuity for callers using the old name.

### Ambient platform / driver activity — no JSON changes

- **Anthropic API platform** — Fast Mode for **Claude Opus 4.7** removed the same week; requests with `speed: "fast"` on `claude-opus-4-7` now return an error. Opus 4.7 itself remains available at standard speed. No MJ inventory action — Opus 4.7 vendor rows don't record a `speed` field.
- **Mid-conversation tool changes (beta)** — Now available on Fable 5, Mythos 5, Opus 4.8, and **Opus 5** via the `mid-conversation-tool-changes-2026-07-01` beta header. Prompt-cache-preserving. Ambient platform capability, not a per-model driver setting.
- **Kimi K3 open weights** — Confirmed dropping on Hugging Face at **2026-07-27 00:00 UTC** (today), ~594 GB MXFP4 format, Modified MIT license, `moonshotai/Kimi-K3`. This is a self-host / benchmark availability change, not an API/vendor change — inventory rows for Kimi K3 already cover Moonshot direct + OpenRouter and don't need edits.
- **GPT-5.6 Sol/Terra/Luna on Amazon Bedrock** — GA'd on Bedrock on July 13, 2026. **Not in this report's changes** because it fell in the last-report's window; noting for completeness. The current MJ inventory rows for GPT 5.6 / 5.6-terra / 5.6-luna already point to OpenAI direct only. A Bedrock vendor row could be added on any of the three in a subsequent PR if MJ wants Bedrock as a secondary path — flagged for the watch list, not edited here (out-of-scope for a weekly research pass; wants a code-side confirmation that MJ's Bedrock driver supports OpenAI-family models).

## Deprecated / Sunset Models

- **Claude Opus 4.1** (`claude-opus-4-1-20250805`) — retirement in 9 days (Aug 5, 2026). Description text updated; will flip active state next week.
- **Cohere `rerank-v3.5`** — auto-migrated to `rerank-v4-fast` starting Aug 1, 2026 (5 days). Description text updated; row kept active because Cohere itself keeps the endpoint resolving.
- **Groq — pending August cleanup (unchanged from last report)**: `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` are removal-eligible; recommended replacements `openai/gpt-oss-20b` and `openai/gpt-oss-120b` are already in the MJ inventory. Additional Groq deprecations announced at the same time: `qwen/qwen3-32b` and `meta-llama/llama-4-scout-17b-16e-instruct` (also removal-eligible). MJ inventory rows for "Llama 3.1 8b" / "Llama 3.3 70B Versatile" / "Qwen 3 32B" / "Llama 4 Scout" that specifically point at Groq will need `Status="Deprecated"` (or `IsActive=false`) once Groq confirms the removal date. Still flagged for a subsequent report or an out-of-band task; no removal date has been posted publicly. Sources: [Groq deprecations docs](https://console.groq.com/docs/deprecations).
- **Cerebras `ZAI-GLM-4.7`** — scheduled deprecation 2026-08-17 (unchanged from last week). Not in MJ inventory as a Cerebras-hosted row (GLM 4.7 is OpenRouter/Z.AI-only), so no action.

## New Vendors Worth Considering

**None new this week.** Thinking Machines Lab was added last week (Inkling launch). No other new AI labs shipped a first product in this window.

## Recommended Actions

Ordered by impact:

1. **[This PR — done]** Add `Claude Opus 5` to `.ai-models.json` with 4 vendor rows and 3 cost rows.
2. **[This PR — done]** Update `Claude Opus 4.1` description to point at Opus 5 as the recommended migration target.
3. **[This PR — done]** Update `rerank-v3.5` description to note the Aug 1 auto-migration to `rerank-4-fast`.
4. **[Next report]** Flip `Claude Opus 4.1` to `IsActive: false` on/after August 5, 2026 when retirement takes effect. (Optionally set the Anthropic Inference Provider row's `Status="Deprecated"` earlier for signalling — leaving as-is for now to avoid confusing driver behavior in the last week of availability.)
5. **[Watch — next report]** Confirm Claude Opus 5 pricing hasn't drifted (launch prices sometimes drift in the first 4 weeks). Confirm Bedrock and Vertex tier availability is fully rolled out (some regions may still be gating). Verify OpenRouter fast-mode variant `anthropic/claude-opus-5-fast` pricing is 2× base and add a distinct MJ row if MJ starts using it.
6. **[Watch — next report]**
   - **Grok 4.6** — Musk posted July 25 that Grok 4.6 is "2 weeks out" and 4.7 is "4 weeks out." Grok 4.6 could land in-window for next week. Rumoured 2T parameters, positioned to compete with Kimi K3.
   - **FLUX 3** (Black Forest Labs, July 23) — Image-and-video multimodal model. Currently in gated early access; FLUX 3 Image "in coming weeks"; FLUX 3 Dev (open weights) "later in 2026." **Skipped this week** per the "no preview/alpha" rule; add once public API access lands.
   - **Gemini 3.5 Pro** — Third slip (May target → June → July 17 → not yet). Polymarket now favors late July or early August. In limited enterprise Vertex preview.
   - **Qwen 3.8-Max-Preview** — Subscription-only via Alibaba Token Plan, no per-token API rate card. `qwen3.8-max-preview` accessible via Token Plan / Qoder / QoderWork. Skipped — flagged for when per-token pricing publishes.
   - **GLM 5.5** — Zhipu targeting August 2026 (JPMorgan research note, June 25). No model card or endpoint yet.
   - **MiniMax M3 Pro** — 2.7T-param open source, targeted Q3 2026 per The Information (July 8, 2026). No confirmed date, name, or license.
   - **DeepSeek V5 / R2** — No official roadmap or release date; V4 Pro/Flash still shipping. Speculative only.
   - **Cohere Command A+** (`command-a-plus-05-2026`) — Now GA per Cohere docs. Not yet in MJ inventory. Add if MJ needs it as a Cohere-side language-model option; low priority since Cohere is primarily used for reranking in MJ.
   - **Cohere Transcribe** — First Cohere transcription model (audio → text ASR). New product line, not previously modeled. Flagged for consideration only if MJ picks up speech transcription as a capability.
   - **Inkling-Small** — Thinking Machines Lab's smaller variant (276B total / 12B active MoE, based on the same recipe as Inkling). Still in preview at publication; no full-weight release yet.
   - **NVIDIA Nemotron 4 Coalition model** — Still in training. NVIDIA is already an inventory vendor; when the Coalition model ships no new vendor row will be needed.

## Research Sources

Frontier vendors (Anthropic / OpenAI / Google):
- [Anthropic — Introducing Claude Opus 5 (Jul 24)](https://www.anthropic.com/news/claude-opus-5)
- [Anthropic — Models overview (contains Opus 5 row)](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic — Migration guide (Opus 4.8 → Opus 5)](https://platform.claude.com/docs/en/about-claude/models/migration-guide)
- [Anthropic — Claude Opus product page](https://www.anthropic.com/claude/opus)
- [MarkTechPost — Meet the new Claude Opus 5 (Jul 24)](https://www.marktechpost.com/2026/07/24/meet-the-new-claude-opus-5-frontier-class-agentic-coding-and-computer-use-at-unchanged-opus-pricing/)
- [9to5Mac — Anthropic upgrades Claude with Opus 5 (Jul 24)](https://9to5mac.com/2026/07/24/anthropic-upgrades-claude-with-new-opus-5-model-details-here/)
- [Coursiv — Claude Opus 5: Benchmarks, Pricing, and Full Guide (Jul 2026)](https://coursiv.io/blog/claude-opus-5)
- [Finout — Claude Opus 5 Pricing 2026](https://www.finout.io/blog/claude-opus-5-pricing-2026)
- [Requesty — claude-opus-5 API Pricing & Cost](https://www.requesty.ai/models/anthropic/claude-opus-5)
- [Kingy AI — Claude Opus 5 specs / benchmarks / pricing / verdict](https://kingy.ai/blog/claude-opus-5-specs-benchmarks-pricing/)
- [QZ — Anthropic launches Claude Opus 5 at half the price of Fable 5](https://qz.com/anthropic-claude-opus-5-fable-5-price-072426)
- [Digital Applied — Claude Opus 5 launch benchmarks pricing 2026](https://www.digitalapplied.com/blog/claude-opus-5-launch-benchmarks-pricing-2026)
- [Releasebot — Anthropic Release Notes (July 2026)](https://releasebot.io/updates/anthropic)
- [TechCrunch — GPT-5.6 launch context (Jul 9)](https://techcrunch.com/2026/07/09/openai-launches-its-new-family-of-models-with-gpt-5-6/)
- [About Amazon — GPT-5.6 on Amazon Bedrock](https://www.aboutamazon.com/news/aws/bedrock-openai-models)
- [AWS What's New — GPT-5.6 Sol/Terra/Luna GA on Bedrock (Jul 13)](https://aws.amazon.com/about-aws/whats-new/2026/07/openai-gpt-sol-terra/)
- [TechTimes — Gemini 3.5 Pro third slip (Jul 16)](https://www.techtimes.com/articles/320308/20260713/gemini-35-pro-targets-july-17-after-full-rebuild-every-spec-remains-unconfirmed.htm)
- [Coursiv — Gemini 3.5 Pro rumours + confirmed](https://coursiv.io/blog/gemini-3-5-pro)

xAI / DeepSeek / Meta / Mistral:
- [Dataconomy — Musk Teases 2T Grok successor (Jul 20)](https://dataconomy.com/2026/07/20/musk-xai-grok-4-6-2t-model-training-next-week/)
- [Explainx — Grok 4.6 / 4.7 timeline (Jul 25)](https://explainx.ai/blog/grok-4-6-4-7-release-timeline-musk-announcement-july-2026)
- [Basenor — xAI's 2T Model: What Musk revealed](https://www.basenor.com/blogs/news/xais-2t-model-what-musk-just-revealed-about-groks-successor)
- [Layer3Labs — DeepSeek R2 status (2026)](https://www.layer3labs.io/guides/deepseek-r2-explained)
- [Chat-Deep — DeepSeek roadmap rumours](https://chat-deep.ai/guide/deepseek-roadmap-rumors/)
- [Releasebot — Mistral Release Notes (Jul 2026)](https://releasebot.io/updates/mistral)
- [BenchLM — Mistral API Pricing (Jul 2026)](https://benchlm.ai/mistral/api-pricing)
- [PricePerToken — Mistral AI provider](https://pricepertoken.com/pricing-page/provider/mistral-ai)

Chinese labs & open models:
- [TechTimes — Kimi K3 open weights arrive Sunday (Jul 25)](https://www.techtimes.com/articles/321551/20260725/kimi-k3-open-weights-arrive-sunday-self-hosting-cuts-china-data-risk-api-never-can.htm)
- [Hugging Face blog — Kimi K3 model overview + MXFP4 quantization](https://huggingface.co/blog/ResterChed/kimi-k3-model-overview-mxfp4-quantization-open-wei)
- [moonshotai/Kimi-K3 — upcoming release page](https://huggingface.co/moonshotai/Kimi-K3)
- [MarkTechPost — Alibaba Qwen 3.8 Max preview (Jul 19)](https://www.marktechpost.com/2026/07/19/alibaba-previews-qwen3-8-max-a-2-4-trillion-parameter-multimodal-model-days-after-moonshots-kimi-k3-open-weight-launch/)
- [Eesel — Qwen 3.8 Max pricing (2026)](https://www.eesel.ai/blog/qwen38-max-pricing)
- [Coursiv — Qwen 3.8 specs, pricing, access, benchmarks](https://coursiv.io/blog/qwen-3-8)
- [Wan27 — GLM-5.5 launching August 2026](https://wan27.org/blog/glm-5-5)
- [KuCoin — MiniMax to open-source 2.7T parameter model in Q3 2026](https://www.kucoin.com/news/flash/minimax-to-open-source-2-7-trillion-parameter-model-in-q3-2026)
- [Silicon Report — MiniMax 2.7T open-source model](https://www.siliconreport.com/chinas-minimax-reportedly-prepping-2-7t-parameter-open-source-model-44b80ac2)

Inference platforms & specialty:
- [Groq deprecations](https://console.groq.com/docs/deprecations) (blocked by 403 to WebFetch; verified via search)
- [Cerebras pricing](https://www.cerebras.ai/pricing)
- [Artificial Analysis — Cerebras provider](https://artificialanalysis.ai/providers/cerebras)
- [Fireworks pricing](https://www.morphllm.com/fireworks-ai-pricing)
- [Cohere Rerank v4.0 changelog](https://docs.cohere.com/changelog/rerank-v4.0)
- [Cohere deprecations](https://docs.cohere.com/docs/deprecations)
- [Oracle GenAI — Cohere Rerank 3.5 (deprecated) model card](https://docs.oracle.com/en-us/iaas/Content/generative-ai/cohere-rerank-3-5.htm)
- [AWS ML blog — Claude Opus 5 on AWS (Jul 24)](https://aws.amazon.com/blogs/machine-learning/introducing-claude-opus-5-on-aws-anthropics-most-capable-opus-model/)
- [AWS What's New — Claude Opus 5 (Jul 24)](https://aws.amazon.com/about-aws/whats-new/2026/07/claude-opus-5-aws/)
- [AWS docs — Claude Opus 5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5.html)
- [OpenRouter — Claude Opus 5](https://openrouter.ai/anthropic/claude-opus-5)
- [OpenRouter — Claude Opus 5 (Fast)](https://openrouter.ai/anthropic/claude-opus-5-fast)
- [OpenRouter — Kimi K3](https://openrouter.ai/moonshotai/kimi-k3)
- [OpenRouter — Inkling](https://openrouter.ai/thinkingmachines/inkling)
- [Thinking Machines Lab — Introducing Inkling](https://thinkingmachines.ai/news/introducing-inkling/) (baseline sanity check; unchanged this week)

Multimodal / image / video:
- [GlobeNewswire — BFL unveils FLUX 3 (Jul 23)](https://www.globenewswire.com/news-release/2026/07/23/3332364/0/en/black-forest-labs-unveils-flux-3-a-new-multimodal-frontier-model-for-visual-intelligence.html)
- [VentureBeat — BFL launches FLUX 3 (Jul 23)](https://venturebeat.com/technology/black-forest-labs-launches-flux-3-capable-of-generating-images-and-20-second-video-with-audio-but-in-limited-release-to-start)
- [MarkTechPost — BFL releases FLUX 3 (Jul 26)](https://www.marktechpost.com/2026/07/26/black-forest-labs-releases-flux-3-a-multimodal-flow-model-for-image-video-audio-and-robot-action-prediction/)
- [TechTimes — FLUX 3 launches (Jul 25)](https://www.techtimes.com/articles/321552/20260725/flux-3-launches-black-forest-labs-enters-video-audio-physical-ai-one-model.htm)
