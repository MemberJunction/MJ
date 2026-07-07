# AI Model & Vendor Weekly Intelligence Report

- **Generated**: 2026-07-06
- **Research Period**: 2026-06-01 → 2026-07-06 (with emphasis on 2026-06-16 → 2026-07-06, i.e. since the last update to `.ai-models.json`)
- **Base Branch**: `next`
- **Feature Branch**: `claude/ai-model-research-2026-07-06`

## Executive Summary

The `metadata/ai-models/.ai-models.json` inventory is impressively fresh — the most recent additions (GLM 5.2, Magistral 1.2, Nemotron 3 Ultra) landed on 2026-07-01, five days ago. Since then, **the two biggest gaps are Anthropic's Claude 5 family** — Claude Sonnet 5 shipped generally-available on 2026-06-30 and Claude Fable 5 shipped GA on 2026-06-09 (with Bedrock re-availability on 2026-07-01) — both entirely absent from the inventory. The other significant gaps are two open-weights NVIDIA Nemotron 3 siblings (Super 120B and Nano 30B-A3B) and Alibaba's dense Qwen 3.6-27B model. This PR proposes adding these **5 confirmed-GA models** to the JSON directly.

Two other frontier-class rollouts (OpenAI GPT-5.6 Sol/Terra/Luna and Anthropic Claude Mythos 5) are restricted to ~20 government-vetted or Project-Glasswing partners respectively — neither is generally available on the API and both are flagged for later addition once availability opens. No pricing changes are proposed against existing records; the inventory's recent updates already reflect current market rates.

## Current Inventory Snapshot

| Metric | Value |
|---|---|
| Total models | 158 |
| Distinct vendors | 30 |
| Model types in use | LLM, Embeddings, Image Generator, Reranker, Realtime, TTS, Video |
| Most recent update | 2026-07-01 (GLM 5.2, Magistral 1.2, Nemotron 3 Ultra) |
| Recent frontier LLMs already covered | Claude Opus 4.8 (2026-05-28), GPT 5.5 / 5.5 Pro (2026-04-24), Grok 4.3 (2026-04-30), DeepSeek V4 Pro/Flash (2026-04-24), Qwen 3.7 Max/Plus (2026-05-19/2026-06-02), Kimi K2.7-Code (2026-06-12), GLM 5.2 (2026-06-16), Nemotron 3 Ultra (2026-06-04) |

## New Models Available

### A1. Claude Sonnet 5 — **ADDED to JSON**

- **Vendor**: Anthropic (Model Developer) + Anthropic / Amazon Bedrock / OpenRouter (Inference Providers)
- **Release**: 2026-06-30 ([Anthropic announcement](https://www.anthropic.com/news/claude-sonnet-5), [Simon Willison notes](https://simonwillison.net/2026/Jun/30/claude-sonnet-5/))
- **API names**: `claude-sonnet-5` (Anthropic direct + Vertex), `anthropic.claude-sonnet-5` (Bedrock), `anthropic/claude-sonnet-5` (OpenRouter)
- **Context**: 1M input tokens, 128K max output tokens ([Anthropic docs](https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5))
- **Pricing**: **Launch $2 / $10** per 1M tokens (in/out) through 2026-08-31; **standard $3 / $15** per 1M tokens from 2026-09-01 ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), [The New Stack](https://thenewstack.io/claude-sonnet-5-launch/))
- **Notable**: New tokenizer produces ~30–35% more tokens than Sonnet 4.6 for the same text — factor into cost projections; supports streaming, JSON, effort levels
- **Recommendation**: PowerRank between Sonnet 4.6 (already in inventory) and Opus 4.7/4.8 (23-24). Set at **19**. Speed 7, Cost 5 (launch pricing, will step up).

### A2. Claude Fable 5 — **ADDED to JSON**

- **Vendor**: Anthropic (Model Developer) + Anthropic / Amazon Bedrock / OpenRouter (Inference Providers)
- **Release**: 2026-06-09 GA on Claude API, Claude Platform on AWS, Amazon Bedrock, Google Cloud, and Microsoft Foundry ([Anthropic announcement](https://www.anthropic.com/news/claude-fable-5-mythos-5))
- Briefly withdrawn from AWS to comply with a US government export-control directive; **returned to Amazon Bedrock on 2026-07-01** ([AWS post](https://www.aboutamazon.com/news/aws/claude-fable-5-anthropic-available-amazon-bedrock))
- **API names**: `claude-fable-5` (Anthropic direct + Vertex), `anthropic.claude-fable-5` (Bedrock), `anthropic/claude-fable-5` (OpenRouter)
- **Context**: 1M input tokens, 128K max output tokens
- **Pricing**: **$10 / $50** per 1M tokens (in/out) — exactly 2× Opus 4.8's $5/$25 ([Anthropic docs](https://platform.claude.com/docs/en/about-claude/pricing))
- **Notable**: Class-topping Mythos-tier model made "safe for general use" via a safety-classifier layer; queries on some sensitive topics may transparently fall back to Opus 4.8. Companion model **Claude Mythos 5** shares the exact same specs and pricing but is limited to Project Glasswing partners — flagged in "Not Added" below.
- **Recommendation**: This is now Anthropic's most capable generally-available model. PowerRank **26** (above Opus 4.8's 24), Speed 6, Cost 10.

### A3. NVIDIA Nemotron 3 Super — **ADDED to JSON**

- **Vendor**: NVIDIA (Model Developer) + OpenRouter (Inference Provider)
- **Release**: 2026-03-11 at GTC ([NVIDIA Nemotron 3 family page](https://research.nvidia.com/labs/nemotron/Nemotron-3/))
- **API name**: `nvidia/nemotron-3-super-120b-a12b` (OpenRouter)
- **Context**: 1M input tokens
- **Pricing**: $0.08 / $0.45 per 1M tokens ([OpenRouter listing](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b))
- **Notable**: 120B total / 12B active MoE, open-weights under the NVIDIA Open Model License. Sits mid-tier between Nemotron 3 Nano and Ultra (both of which are now covered by this PR). Free tier also available at `nvidia/nemotron-3-super-120b-a12b:free`.
- **Recommendation**: PowerRank **13** (below Ultra's 17, above open-weights baseline), Speed 8, Cost 2.

### A4. NVIDIA Nemotron 3 Nano — **ADDED to JSON**

- **Vendor**: NVIDIA (Model Developer) + OpenRouter (Inference Provider)
- **Release**: 2025-12-15 ([NVIDIA Nemotron 3 family page](https://research.nvidia.com/labs/nemotron/Nemotron-3/))
- **API name**: `nvidia/nemotron-3-nano-30b-a3b` (OpenRouter)
- **Context**: 262K input tokens
- **Pricing**: $0.05 / $0.20 per 1M tokens ([OpenRouter listing](https://openrouter.ai/nvidia/nemotron-3-nano-30b-a3b))
- **Notable**: 30B total / 3B active MoE, smallest/cheapest of the Nemotron 3 family. Free tier also available.
- **Recommendation**: PowerRank **9**, Speed 9, Cost 1.

### A5. Qwen 3.6 27B — **ADDED to JSON**

- **Vendor**: Alibaba Cloud (Model Developer) + Alibaba Cloud / OpenRouter / Groq (Inference Providers)
- **Release**: 2026-04-22 on Hugging Face + ModelScope; general API availability across providers since then ([Qwen blog](https://qwen.ai/blog?id=qwen3.6-27b), [buildfastwithai review](https://www.buildfastwithai.com/blogs/qwen3-6-27b-review-2026))
- **API name**: `qwen3.6-27b` (Alibaba Cloud), `qwen/qwen3.6-27b` (OpenRouter), `qwen/qwen3.6-27b` (Groq preview)
- **Context**: 262K native, extensible to 1M via YaRN scaling
- **Pricing**: **Alibaba direct** $0.15 / $0.50 per 1M tokens; **OpenRouter** $0.285 / $2.40 per 1M tokens ([CloudPrice](https://cloudprice.net/models/alibaba-qwen3-6-27b))
- **Notable**: Dense 27B, hybrid multimodal (text/image/video in, text out), strong on agentic coding. Available on Groq at 486 tokens/sec ([Artificial Analysis](https://artificialanalysis.ai/models/qwen3-6-27b/providers)). First Qwen open-source with **Thinking Preservation** (retains CoT across turns).
- **Recommendation**: PowerRank **13**, Speed 8, Cost 2.

## Pricing Changes Detected

**None with high confidence.**

The following was investigated but produced no confident recommendation:

| Model | Existing $/M (in/out) | Observed $/M (in/out) | Notes |
|---|---|---|---|
| MiniMax-M3 | $0.60 / $2.40 | $0.30 / $1.20 on OpenRouter | This is a **50% promotional discount**, not a standard price change. Skipping. |
| Devstral 2 | $0.40 / $2.00 | $0.40 / $2.00 (standard); currently free during promotional launch on Mistral direct | Standard price unchanged; leave record alone. |
| Grok 4.3 | $1.25 / $2.50 | $1.25 / $2.50 | No change. |
| GPT-5.5 / 5.5 Pro | $5/$30 and $30/$180 | Same | No change. |
| DeepSeek V4 Pro | $1.74/$3.48 and $0.435/$0.87 (two entries, second is the current cache-miss standard) | Same | No change. |

## Model Updates & New Versions

- **Cerebras adds GPT-5.6 Sol** at up to 750 tokens/sec, announced 2026-07-01 as "coming in July" — no shipped API surface yet; hold for now ([AWS/OpenAI joint post](https://openai.com/index/previewing-gpt-5-6-sol/), covered in "Not Added" below).
- **Groq deprecated `llama-3.1-8b-instant` and `llama-3.3-70b-versatile`** in June 2026 ([Groq deprecation notice](https://console.groq.com/docs/deprecations)). These entities still list Groq as an inference provider on the following inventory models: `Llama 3.1 8b`, `Llama 3.3 70B Versatile`. **Not automated as JSON edits** — safer to convert the affected Groq subrecords to `Status: "Deprecated"` in a follow-up once we confirm whether they were rebranded or fully removed (they still work via OpenRouter, Fireworks, etc., so the parent models remain active).

## Deprecated / Sunset Models

| Vendor | Model | Effective | Recommended action |
|---|---|---|---|
| Groq | `llama-3.1-8b-instant` (Groq-hosted only) | June 2026 | Convert the `Llama 3.1 8b` model's Groq subrecord to `Status: "Deprecated"` in a follow-up PR (parent model still on OpenRouter/Fireworks). |
| Groq | `llama-3.3-70b-versatile` (Groq-hosted only) | June 2026 | Same treatment for `Llama 3.3 70B Versatile`'s Groq subrecord. |
| DeepSeek | `deepseek-chat` and `deepseek-reasoner` (legacy endpoints) | Fully retired after **2026-07-24 15:59 UTC** | Currently route to `deepseek-v4-flash` (non-thinking / thinking respectively). **No action needed** — the legacy endpoint names aren't in the inventory; the parent models (`DeepSeek V4 Pro`, `DeepSeek V4 Flash`) already point at the current APIs. ([DeepSeek news](https://api-docs.deepseek.com/news/news260424)) |

## New Vendors Worth Considering

**Nex AGI** (creator of Nex-N2-Pro) — a small Chinese open-weights lab shipping a 397B / 17B-active MoE ([Artificial Analysis](https://artificialanalysis.ai/models/nex-n2-pro)) tuned for agentic coding. Notable but not yet at the scale/adoption where I'd add the vendor without confirming demand from the MJ team. Flagged for next week's report.

## Not Added — Preview / Restricted Availability

These are frontier-class rollouts that meet the "major vendor" bar but do NOT meet the "widely available" bar in the task's instruction #6. Adding a metadata row before real API access exists would create fake vendor entries and misleading cost records. Recommend re-evaluating each as availability changes.

| Model | Status | Pricing (announced) | Context | Notes |
|---|---|---|---|---|
| **GPT-5.6 Sol** | Limited to ~20 US-government-vetted orgs on OpenAI API + Codex | $5 in / $30 out per 1M | 1.5M | Add when GA on OpenAI API. Cerebras high-speed lane launching in July. ([VentureBeat](https://venturebeat.com/technology/openai-unveils-gpt-5-6-sol-terra-and-luna-models-but-only-accessible-to-limited-preview-partners-for-now-per-us-gov), [OpenAI](https://openai.com/index/previewing-gpt-5-6-sol/)) |
| **GPT-5.6 Terra** | Same restricted preview | $2.50 / $15 per 1M | (not disclosed publicly) | Same rationale. |
| **GPT-5.6 Luna** | Same restricted preview | $1 / $6 per 1M | (not disclosed publicly) | Same rationale. |
| **Claude Mythos 5** | Limited to Project Glasswing + trusted-access partners | $10 / $50 per 1M | 1M / 128K out | Add when GA. Shares specs with Fable 5, but no safety classifier. ([Anthropic docs](https://platform.claude.com/docs/en/about-claude/models/introducing-claude-fable-5-and-claude-mythos-5)) |
| **Grok 4.4 / 4.5 (V9)** | Private beta at SpaceX/Tesla; public roadmap slipping | Unannounced | ~1.5T param V9 | Grok 5 (10T) further out; still Q3 2026 target. |
| **Gemini 3.5 Pro** | Preview delayed to July, still limited-preview | Unannounced (Ultra plan gated) | 2M | Gemini 3.5 Flash already covered. Add Pro when it exits limited preview. |
| **FLUX.2 [flex] / [dev] / [klein]** | GA, credit-based | Credit-based ($0.01/credit), scales with megapixels | — | Doesn't map cleanly to `Per 1M Tokens` unit type. Add when we support megapixel-based unit types (cf. how the Cohere rerank models are already excluded from cost modelling for a similar reason). |
| **Kimi K3** | Rumored only | — | — | Not officially announced. Skip. |
| **Nex-N2-Pro** | GA on OpenRouter (free tier during launch window) | $0.25 / $1.00 per 1M standard | 262K | Small vendor; hold for next week. |

## Recommended Actions (Prioritized)

1. **[Included in this PR]** Add **Claude Sonnet 5** — highest priority, missing frontier GA model that MJ agents actively rely on downstream.
2. **[Included in this PR]** Add **Claude Fable 5** — MJ users targeting Anthropic's most capable GA model need this.
3. **[Included in this PR]** Add **NVIDIA Nemotron 3 Super** and **Nano** — completes the Nemotron 3 family alongside Ultra.
4. **[Included in this PR]** Add **Qwen 3.6 27B** — mid-tier open-weights that's already sitting on Groq's preview lane.
5. **[Follow-up PR]** Deprecate the Groq subrecords for `Llama 3.1 8b` and `Llama 3.3 70B Versatile` once we confirm the Groq changelog — safer to leave the parent models active.
6. **[Watch for next week]** GPT-5.6 GA rollout (Sol/Terra/Luna), Claude Mythos 5 GA, Gemini 3.5 Pro GA, Grok 4.5 exit from private beta.
7. **[Long-term]** Add a `Per Megapixel` price-unit type so we can model FLUX.2 [flex]/[dev]/[klein] properly.

## Research Sources

### Anthropic (Claude Sonnet 5, Fable 5, Mythos 5)
- [Introducing Claude Sonnet 5 — Anthropic](https://www.anthropic.com/news/claude-sonnet-5)
- [Claude Fable 5 and Claude Mythos 5 — Anthropic](https://www.anthropic.com/news/claude-fable-5-mythos-5)
- [What's new in Claude Sonnet 5 — Anthropic docs](https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5)
- [Anthropic Pricing docs](https://platform.claude.com/docs/en/about-claude/pricing)
- [Introducing Claude Fable 5 and Mythos 5 — Anthropic docs](https://platform.claude.com/docs/en/about-claude/models/introducing-claude-fable-5-and-claude-mythos-5)
- [What's new in Claude Sonnet 5 — Simon Willison, 2026-06-30](https://simonwillison.net/2026/Jun/30/claude-sonnet-5/)
- [Claude Sonnet 5 Pricing: Cost Parity — The New Stack](https://thenewstack.io/claude-sonnet-5-launch/)
- [Claude Sonnet 5 pricing — Finout](https://www.finout.io/blog/claude-sonnet-5-pricing-2026-the-hidden-costs-and-real-savings-behind-the-cost-neutral-launch)
- [Claude Sonnet 5 model card — AWS Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5.html)
- [Claude Fable 5 model card — AWS Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5.html)
- [Claude Fable 5 back on Amazon Bedrock — AWS, 2026-07-01](https://www.aboutamazon.com/news/aws/claude-fable-5-anthropic-available-amazon-bedrock)

### OpenAI (GPT-5.6 Sol / Terra / Luna)
- [Previewing GPT-5.6 Sol — OpenAI](https://openai.com/index/previewing-gpt-5-6-sol/)
- [OpenAI unveils GPT-5.6 Sol/Terra/Luna — VentureBeat](https://venturebeat.com/technology/openai-unveils-gpt-5-6-sol-terra-and-luna-models-but-only-accessible-to-limited-preview-partners-for-now-per-us-gov)
- [GPT-5.6 Sol/Terra/Luna deep dive — DataCamp](https://www.datacamp.com/blog/gpt-5-6-sol-luna-terra)
- [OpenAI Realtime & Voice pricing 2026 — TokenMix](https://tokenmix.ai/blog/openai-realtime-voice-api-2026-cost-latency)

### NVIDIA Nemotron 3 (Super / Nano)
- [NVIDIA Nemotron 3 family page](https://research.nvidia.com/labs/nemotron/Nemotron-3/)
- [Nemotron 3 Super — OpenRouter](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b)
- [Nemotron 3 Nano 30B A3B — OpenRouter](https://openrouter.ai/nvidia/nemotron-3-nano-30b-a3b)
- [NVIDIA Nemotron 3 Ultra launch — Artificial Analysis](https://artificialanalysis.ai/articles/nvidia-nemotron-3-ultra-launch-announced)

### Alibaba Qwen 3.6 27B
- [Qwen3.6-27B blog — Qwen team](https://qwen.ai/blog?id=qwen3.6-27b)
- [Qwen3.6-27B — OpenRouter](https://openrouter.ai/qwen/qwen3.6-27b)
- [Qwen3.6-27B pricing — CloudPrice](https://cloudprice.net/models/alibaba-qwen3-6-27b)
- [Qwen3.6-27B providers — Artificial Analysis](https://artificialanalysis.ai/models/qwen3-6-27b/providers)
- [Qwen 3.6 27B deep dive — buildfastwithai](https://www.buildfastwithai.com/blogs/qwen3-6-27b-review-2026)

### xAI Grok 4.4 / 4.5 / 5
- [xAI Models docs](https://docs.x.ai/developers/models)
- [Grok 4.5 Release Date — felloai](https://felloai.com/grok-4-5/)
- [xAI Grok roadmap — MindStudio](https://www.mindstudio.ai/blog/xai-grok-roadmap-7-models-training-grok-5-10-trillion)

### Groq (deprecations)
- [Groq Model Deprecation notice](https://console.groq.com/docs/deprecations)
- [Groq supported models](https://console.groq.com/docs/models)

### Fireworks / Cerebras / OpenRouter / others
- [OpenRouter Open-Weight Models June 2026 — blog](https://openrouter.ai/blog/insights/the-open-weight-models-that-matter-june-2026/)
- [Fireworks pricing](https://fireworks.ai/pricing)
- [Cerebras inference](https://www.cerebras.ai/infcamp)

### DeepSeek / Mistral / Moonshot / MiniMax
- [DeepSeek V4 Preview news](https://api-docs.deepseek.com/news/news260424)
- [Mistral changelog](https://docs.mistral.ai/resources/changelogs)
- [Introducing Devstral 2 — Mistral](https://mistral.ai/news/devstral-2-vibe-cli/)
- [Moonshot Kimi K2.7-Code release — MarkTechPost](https://www.marktechpost.com/2026/06/12/moonshot-ai-releases-kimi-k2-7-code-a-coding-model-reporting-21-8-on-kimi-code-bench-v2-over-k2-6/)
- [MiniMax M3 release — llm-stats](https://llm-stats.com/llm-updates)

### Gemini (3.5 Pro delay)
- [Gemini 3.5 Pro delayed to July — Investing.com](https://www.investing.com/news/stock-market-news/google-delays-gemini-35-pro-model-release-to-july--insider-93CH-4758816)
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)

### BFL FLUX.2 family
- [Black Forest Labs FLUX models](https://bfl.ai/models)
- [BFL FLUX API pricing](https://bfl.ai/pricing)
- [FLUX.2 [flex] on Vercel AI Gateway](https://vercel.com/ai-gateway/models/flux-2-flex)

### Nex AGI / Nex-N2-Pro
- [Nex-N2-Pro — OpenRouter](https://openrouter.ai/nex-agi/nex-n2-pro:free)
- [Nex-N2-Pro — Artificial Analysis](https://artificialanalysis.ai/models/nex-n2-pro)
