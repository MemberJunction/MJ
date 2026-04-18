# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-04-18
**Research Period**: Approximately 2026-03-17 → 2026-04-18 (since last inventory update)
**Base Branch**: next
**Branch**: claude/ai-model-research-2026-04-18

## Executive Summary
Five production-ready new models have shipped since the last MJ inventory update and are being added in this report: **Claude Opus 4.7** (Anthropic, Apr 16), **GPT 5.4 Mini** and **GPT 5.4 Nano** (OpenAI, Mar 17), **Grok 4.20** (xAI, Mar 31), and **Mistral Small 4** (Mistral AI, Mar 16). No pricing changes were detected on the existing inventory (rates held steady). Several other emerging models — DeepSeek V4, Qwen 3.5-Flash / Qwen 3.5 Medium, Kimi K2.6 Code Preview — are flagged for human review but intentionally not added to the JSON due to missing vendor, unclear pricing, or preview-only status.

## Current Inventory Snapshot

| Category | Count |
|---|---|
| Total models in `.ai-models.json` | 111 |
| Cohere reranker models (separate file) | 2 |
| Active LLMs | ~80 |
| Vendors registered | 22 |

Primary LLM vendors currently covered: Anthropic, OpenAI, Google, Vertex AI, Amazon Bedrock, Azure, Mistral AI, x.ai, Groq, Cerebras, Fireworks.ai, Alibaba Cloud, Moonshot AI, Z.AI, MiniMax, OpenRouter, Black Forest Labs, LM Studio, Cohere, Eleven Labs, HeyGen, Tasio Labs, LocalEmbeddings.

## New Models Available

### 1. Claude Opus 4.7 (Anthropic) — **ADDING**
| Attribute | Value |
|---|---|
| API name (Anthropic) | `claude-opus-4-7` |
| API name (Bedrock) | `anthropic.claude-opus-4-7-v1` |
| Release date | 2026-04-16 |
| Input price | $5.00 per 1M tokens |
| Output price | $25.00 per 1M tokens |
| Context window | 1,000,000 tokens |
| Max output | 128,000 tokens |
| Capabilities | Adaptive thinking, `xhigh` effort level, task budgets (beta), high-resolution image support (2576px), 1M context at standard pricing |

**Rationale to add**: Anthropic's new flagship, GA on both Anthropic API and Amazon Bedrock. Same per-token rates as Opus 4.6 but with better agentic coding, memory, and vision performance. Note that the new tokenizer may use up to 1.35x more tokens for the same text, so effective cost per request can increase. PowerRank set to 23 (incrementing from 4.6's 22).

### 2. GPT 5.4 Mini (OpenAI) — **ADDING**
| Attribute | Value |
|---|---|
| API name | `gpt-5.4-mini` |
| Release date | 2026-03-17 |
| Input price | $0.75 per 1M tokens |
| Output price | $4.50 per 1M tokens |
| Context window | 400,000 tokens |
| Max output | 128,000 tokens |
| Available on | OpenAI, Azure |
| Knowledge cutoff | 2025-08-31 |

**Rationale to add**: Mid-tier variant of the GPT 5.4 family — brings full 5.4 capability at substantially lower cost (70% cheaper input than full GPT 5.4). Strongly competitive mid-tier option. PowerRank 13 (between GPT 5-nano at 12 and GPT 5-mini at 15).

### 3. GPT 5.4 Nano (OpenAI) — **ADDING**
| Attribute | Value |
|---|---|
| API name | `gpt-5.4-nano` |
| Release date | 2026-03-17 |
| Input price | $0.20 per 1M tokens |
| Output price | $1.25 per 1M tokens |
| Context window | 400,000 tokens |
| Max output | 128,000 tokens |
| Available on | OpenAI, Azure |
| Knowledge cutoff | 2025-08-31 |

**Rationale to add**: Smallest, cheapest member of the 5.4 family. Designed for classification, extraction, ranking, and sub-agent workloads. Undercuts almost every alternative on input price. PowerRank 11.

### 4. Grok 4.20 (x.ai) — **ADDING**
| Attribute | Value |
|---|---|
| API name (reasoning) | `grok-4.20-0309-reasoning` |
| API name (non-reasoning) | `grok-4.20-0309-non-reasoning` |
| Release date | 2026-03-31 |
| Input price | $2.00 per 1M tokens |
| Output price | $6.00 per 1M tokens |
| Context window | 2,000,000 tokens |
| Max output | 128,000 tokens |

**Rationale to add**: xAI's newest flagship. 2M context at $2/$6 is aggressively priced vs Claude/GPT 5.4 flagships. Reasoning and non-reasoning variants ship under the same price. Multi-agent variant (`grok-4.20-multi-agent-0309`) also available at identical pricing but not added to avoid clutter — can be added later if adopted. PowerRank 22 (above Grok 4's 19 since this is xAI's new top model).

### 5. Mistral Small 4 (Mistral AI) — **ADDING**
| Attribute | Value |
|---|---|
| API name | `mistral-small-2603` |
| Release date | 2026-03-16 |
| Input price | $0.15 per 1M tokens |
| Output price | $0.60 per 1M tokens |
| Context window | 262,144 tokens |
| Max output | 128,000 tokens |
| Architecture | 119B-param MoE (6B active), Apache 2.0 |

**Rationale to add**: Unifies Magistral (reasoning) + Pixtral (vision) + Devstral (agentic coding) into one model. Open-weights and cheaper than Mistral Medium 3.1. PowerRank 10 (above Small 3.2's 6, below Medium 3.1's 8 would be odd — bumping to 10 to reflect the multi-capability merge).

## Pricing Changes Detected

**No pricing changes** were detected on models already in the inventory during this research period. Claude Opus 4.7 pricing matches Opus 4.6 ($5/$25). Existing OpenAI, Anthropic, Mistral, Groq, x.ai, and Google models all match their current published rates.

## Model Updates & New Versions

### Grok Model Lineage (Noted, No Edit)
Grok 4.20 supersedes Grok 4 as xAI's flagship. However, Grok 4 remains available on the API, so we are keeping it `IsActive: true`. The older `grok-4-0709` is still the generally recommended model for some users.

### Gemini Free Tier Changes (Noted, No Edit)
As of 2026-04-01, Google tightened the Gemini free tier — Pro-series models (Gemini 3 Pro, Gemini 3.1 Pro) are now paid-only; Flash and Flash-Lite remain in the free tier. This does not change API pricing itself and no inventory edit is required.

## Deprecated / Sunset Models

No models in the current inventory have been announced for sunset/deprecation in this research window. (The already-`IsActive: false` models — Claude 3 Haiku, Claude 3 Sonnet, claude-v1, GPT 4, GPT 3.5, Llama 3.1 70b, Gemini 1.0 Ultra — remain marked inactive.)

## New Vendors Worth Considering

### DeepSeek (flagged, not adding)
DeepSeek V4 was released in early March 2026 at $0.30 input / $0.50 output per 1M tokens with a 1M-token context window and ~81% SWE-bench Verified. DeepSeek is **not currently an MJ vendor**. Adding it would require:
1. A new entry in `.ai-vendors.json` for the DeepSeek vendor
2. Confirmation of the exact API model name (search results variously suggest `deepseek-v4` and `deepseek-chat`)
3. Confirmation whether the existing `OpenAILLM` driver can be reused via base URL override, or whether a new `DeepSeekLLM` driver class is needed

Recommended for human review — not included in this PR's JSON edits.

## Recommended Actions

Ordered by impact:

1. **(High)** Review and merge the Claude Opus 4.7 addition — this is the new production flagship across Anthropic, Bedrock, Vertex AI, and Azure Foundry. Customers running agentic workloads will likely ask for it. **[Done in this PR]**
2. **(High)** Review and merge the GPT 5.4 Mini/Nano additions. These are now OpenAI's most cost-competitive serious models and likely to be adopted for medium- and low-cost tiers. **[Done in this PR]**
3. **(Medium)** Review and merge Grok 4.20 — new xAI flagship with attractive pricing at 2M context. **[Done in this PR]**
4. **(Medium)** Review and merge Mistral Small 4 — significant model lineage consolidation, strong multimodal + coding at very low cost. **[Done in this PR]**
5. **(Medium)** Consider adding DeepSeek as a new vendor with DeepSeek V4 (manual decision — requires driver class + vendor entry).
6. **(Low)** Watch for Kimi K3 (announced but no release date) and Qwen3.5 Medium (open-weights available, API pricing pending). Re-evaluate next cycle.
7. **(Low)** Consider whether the multi-agent Grok 4.20 variant (`grok-4.20-multi-agent-0309`) should be a separate MJ model entry or a future option.

## Research Sources

### Anthropic
- [What's new in Claude Opus 4.7 — Claude API Docs](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7)
- [Introducing Claude Opus 4.7 — Anthropic](https://www.anthropic.com/news/claude-opus-4-7)
- [Claude Opus 4.7 in Amazon Bedrock — AWS](https://aws.amazon.com/blogs/aws/introducing-anthropics-claude-opus-4-7-model-in-amazon-bedrock/)
- [Claude Opus 4.7 — Amazon Bedrock model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-7.html)
- [Anthropic releases Claude Opus 4.7 — VentureBeat](https://venturebeat.com/technology/anthropic-releases-claude-opus-4-7-narrowly-retaking-lead-for-most-powerful-generally-available-llm)

### OpenAI
- [Introducing GPT-5.4 mini and nano — OpenAI](https://openai.com/index/introducing-gpt-5-4-mini-and-nano/)
- [GPT-5.4 mini Model — OpenAI API docs](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [GPT-5.4 nano Model — OpenAI API docs](https://developers.openai.com/api/docs/models/gpt-5.4-nano)
- [OpenAI API Pricing](https://openai.com/api/pricing/)

### xAI
- [Models and Pricing — xAI Docs](https://docs.x.ai/developers/models)
- [Grok 4.20 0309 Reasoning — xAI Docs](https://docs.x.ai/developers/models/grok-4.20-0309-reasoning)
- [xAI Grok API Pricing 2026 — mem0.ai](https://mem0.ai/blog/xai-grok-api-pricing)

### Mistral AI
- [Changelog — Mistral Docs](https://docs.mistral.ai/getting-started/changelog)
- [Mistral Small 4 — Puter Developer](https://developer.puter.com/ai/mistralai/mistral-small-2603/)
- [Mistral Small 4 on Hugging Face](https://huggingface.co/mistralai/Mistral-Small-4-119B-2603)
- [Mistral AI Pricing](https://mistral.ai/pricing)

### Google
- [Gemini API Pricing Guide — aipricing.guru](https://www.aipricing.guru/google-ai-pricing/)
- [Release notes — Gemini API](https://ai.google.dev/gemini-api/docs/changelog)

### DeepSeek (flagged, not added)
- [DeepSeek V4 Specs & API Pricing — Morph](https://www.morphllm.com/deepseek-v4)
- [Models & Pricing — DeepSeek API Docs](https://api-docs.deepseek.com/quick_start/pricing)

### Alibaba / Qwen (flagged, not added)
- [Alibaba's Qwen3.5-Medium — VentureBeat](https://venturebeat.com/technology/alibabas-new-open-source-qwen3-5-medium-models-offer-sonnet-4-5-performance)
- [Alibaba Cloud Model Studio pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing)

### Moonshot AI (flagged, not added)
- [Kimi Code K2.6 Preview — Buildfast](https://www.buildfastwithai.com/blogs/kimi-code-k26-preview-2026)

### Black Forest Labs (confirmed no changes)
- [FLUX API Pricing](https://bfl.ai/pricing)

### Cohere (confirmed no changes)
- [Cohere Pricing](https://cohere.com/pricing)
