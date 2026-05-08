# Weekly AI Model Research Report — 2026-05-04

**Scope of research window:** ~2026-04-20 through 2026-05-04 (since the previous research cycle).

**Current MJ inventory snapshot (pre-PR):**
- `metadata/ai-models/.ai-models.json`: 123 models
- `metadata/ai-models/.cohere-reranker-models.json`: 4 reranker models
- `metadata/ai-vendors/.ai-vendors.json`: 24 vendors

The inventory is broadly current as of mid-April. This cycle picks up four well-documented frontier-model releases that landed late April 2026 and one missing model-developer vendor.

---

## Executive Summary

Five new models added this PR — **GPT-5.5**, **GPT-5.5 Pro**, **Grok 4.3**, **Kimi K2.6**, and the **DeepSeek V4** family (Pro + Flash). All five are generally available with public API documentation and verified pricing. One new vendor (**DeepSeek**) is added to support the V4 family. No pricing changes detected on existing models. Two notable items are flagged for human review only (Claude Mythos Preview, Qwen3.6 Plus / Qwen3.6 Max Preview).

---

## Summary of Recommended Changes

| Category | Count | Action |
|---|---|---|
| New models to add | 5 | JSON edits |
| New vendors | 1 (DeepSeek) | JSON edit |
| Pricing changes | 0 | None verified |
| Updated models (metadata) | 0 | None verified |
| Deprecations | 0 | None |
| Flagged for human review | 3 | Report-only |

---

## 1. New Models (JSON edits this PR)

### 1.1 GPT-5.5 (OpenAI)
- **Release:** API GA 2026-04-24; ChatGPT/Codex rollout 2026-04-23.
- **API name:** `gpt-5.5` (also surfaced on Microsoft Foundry / Azure).
- **Context:** 1,050,000 tokens (≈1M) input, 128,000 tokens output. Codex deployment uses a 400K context.
- **Capabilities:** OpenAI's new flagship reasoning model. Supports adjustable `reasoning_effort` (none/low/medium/high/xhigh). Built for "professional scenarios where precision, reliability, and persistence matter." Successor to GPT-5.4.
- **Pricing (OpenAI standard):** $5.00 / $30.00 per 1M tokens (input/output). Prompts >272K input tokens billed at 2× input / 1.5× output for the full session. Batch and Flex are 50% off; Priority is 2.5× standard. Regional data-residency endpoints carry a 10% uplift.
- **Action:** New model entry. Vendor rows for OpenAI (Model Developer + Inference Provider) and Azure (Inference Provider). Cost rows for OpenAI and Azure both at $5/$30. `PriorVersionID = GPT 5.4`.
- **PowerRank:** 12 (above GPT 5.4 at 14, since 5.5 is the new flagship and OpenAI describes it as "frontier"); SpeedRank 7; CostRank 10 (matches Opus-class pricing).

### 1.2 GPT-5.5 Pro (OpenAI)
- **Release:** API GA 2026-04-24 alongside GPT-5.5.
- **API name:** `gpt-5.5-pro` (Responses API + Batch API).
- **Context:** Same as GPT-5.5 — 1M input / 128K output.
- **Positioning:** Premium variant that "extends reasoning depth and task complexity for the most demanding enterprise workloads." Highest-end OpenAI tier.
- **Pricing:** $30.00 / $180.00 per 1M tokens. Batch/Flex at 50% off.
- **Action:** New model entry, separate from GPT-5.5 because the SKU, pricing, and product positioning differ. Vendor rows: OpenAI (Model Developer + Inference Provider). `PriorVersionID = GPT 5.5` (sibling-style).
- **PowerRank:** 8 (top tier alongside Opus 4.7); SpeedRank 5 (slower due to deeper reasoning); CostRank 10.

### 1.3 Grok 4.3 (xAI)
- **Release:** Beta to SuperGrok Heavy 2026-04-17; API GA 2026-04-30.
- **API name:** `grok-4.3` (xAI direct API). OpenRouter mirrors this as `x-ai/grok-4.3`.
- **Context:** 1,000,000 tokens. Always-on reasoning (reasoning is permanent state, not optional).
- **Capabilities:** Aggressively priced flagship. Built-in code execution environment, video upload, generation of downloadable PDFs / spreadsheets / PowerPoint decks. Scores 53 on the Artificial Analysis Intelligence Index at 207 t/s output speed.
- **Pricing:** $1.25 / $2.50 per 1M tokens (≤200K context). Requests above 200K input billed at higher rates per xAI doc. This is a 40% price cut vs. Grok 4.20 ($2/$6), making it one of the most cost-efficient frontier reasoning models.
- **Action:** New model entry. Vendor rows: x.ai (Model Developer + Inference Provider). Cost row at $1.25/$2.50. `PriorVersionID = Grok 4.20`.
- **PowerRank:** 16; SpeedRank 8 (207 t/s is fast for a reasoning model); CostRank 4.

### 1.4 Kimi K2.6 (Moonshot AI)
- **Release:** 2026-04-20.
- **API name:** `kimi-k2.6` on Moonshot direct; OpenRouter form `moonshotai/kimi-k2.6`. Hugging Face: `moonshotai/Kimi-K2.6`.
- **Architecture:** 1T-parameter MoE, 32B active per token, INT4 native, Modified MIT License (open weights).
- **Context:** 262,144 tokens (≈256K) input, output up to 262,144 tokens with per-step limit of 49,152.
- **Capabilities:** Multimodal (text/image/video in, text out). Strong long-horizon coding and multi-agent orchestration. Highest "Intelligence Index" on Fireworks at 54.
- **Pricing (Moonshot direct API):** $0.60 / $2.50 per 1M tokens (per Moonshot launch announcement, "8.3× cheaper input / 10× cheaper output than Opus 4.7"). Note: a few aggregator pages quote a different figure ($0.74/$3.49) — likely a different SKU or post-launch tier. We are recording the $0.60/$2.50 launch pricing and noting the discrepancy in the cost-row Comments.
- **Action:** New model entry. Vendor rows: Moonshot AI (Model Developer + Inference Provider). `PriorVersionID = Kimi K2.5`.
- **PowerRank:** 18; SpeedRank 7; CostRank 3.

### 1.5 DeepSeek V4 Pro (DeepSeek)
- **Release:** Preview 2026-04-24.
- **API name:** `deepseek-v4-pro` (DeepSeek direct); OpenRouter `deepseek/deepseek-v4-pro`.
- **Architecture:** 1.6T total / 49B active MoE. MIT license. Supports thinking and non-thinking modes. OpenAI-compatible and Anthropic-compatible API formats.
- **Context:** 1M tokens input, max output 384K tokens.
- **Pricing:** **List** $1.74 / $3.48 per 1M tokens. **Promo (75% off, through 2026-05-31 15:59 UTC):** $0.435 / $0.87. Cache-hit input pricing reduced to 1/10 of launch price.
- **Action:** New model. We record the **list** price as the primary cost row (since the promo expires inside the SLA window of this report). The promo can be tracked separately as a future ad-hoc cost row if it gets extended. Vendor rows: DeepSeek (Model Developer + Inference Provider).
- **PowerRank:** 15; SpeedRank 7; CostRank 4 (using list price).

### 1.6 DeepSeek V4 Flash (DeepSeek)
- **Release:** Preview 2026-04-24 (same announcement as V4 Pro).
- **API name:** `deepseek-v4-flash`.
- **Architecture:** 284B total / 13B active MoE. MIT license. Same 1M context and 384K output ceiling as V4 Pro.
- **Pricing:** $0.14 / $0.28 per 1M tokens.
- **Action:** New model. Vendor rows: DeepSeek (Model Developer + Inference Provider). Cost row at $0.14/$0.28.
- **PowerRank:** 30; SpeedRank 9; CostRank 2.

### 1.7 New vendor: DeepSeek
DeepSeek does not currently appear in `metadata/ai-vendors/.ai-vendors.json`. (The existing model "Deepseek R1 Distill Llama 3.3 70B" uses Groq/Cerebras as inference providers and Meta as the underlying model developer for Llama 3.3, so it does not require a DeepSeek vendor entry.) We add **DeepSeek** as a new vendor with `CredentialTypeID = API Key` to support the V4 family above.

---

## 2. Pricing Changes

**None verified this cycle.** Spot-checks against provider docs on 2026-05-04 were consistent with current MJ inventory:

- **Anthropic:** Opus 4.7 $5/$25; Sonnet 4.6 $3/$15; Haiku 4.5 $1/$5 — unchanged.
- **OpenAI:** GPT 5.4 $2.50/$15; GPT 5.4-mini $0.75/$4.50; GPT 5.4-nano unchanged.
- **xAI:** Grok 4.20 $2/$6 still listed alongside the new Grok 4.3 — unchanged.
- **Google:** Gemini 3.1 Pro $2/$12; Gemini 3.1 Flash-Lite — unchanged.
- **MiniMax:** M2.7 $0.30/$1.20 — unchanged.
- **Mistral:** Small 4 $0.15/$0.60 — unchanged.
- **Inception Labs:** Mercury 2 $0.25/$0.75 — unchanged.

---

## 3. Updated Models (Metadata Changes)

**None this cycle.** No API-name renames, context-window expansions, or capability updates detected on currently-tracked models.

---

## 4. Deprecated / Sunset Models

**None new this cycle.** Inventory's `IsActive=false` set is already in sync with vendor announcements.

---

## 5. Flagged for Human Review (No JSON Changes)

### 5.1 Claude Mythos Preview (Anthropic) — INTENTIONALLY NOT ADDED
- Announced 2026-04-07 via the Project Glasswing program. Not GA.
- **Access:** Invite-only gated research preview with ~12 founding orgs and ~40 vetted critical-infrastructure operators. Available on Anthropic API, Vertex AI, and Bedrock under restricted allow-lists.
- **Pricing:** $25 / $125 per 1M tokens (5× Opus 4.7).
- **Capabilities:** State-of-the-art on cybersecurity, software coding, and complex reasoning. SWE-bench Verified 93.9%.
- **Recommendation:** **Do not add yet.** Preview/non-GA models shouldn't enter the catalog until either (a) Anthropic announces broad availability, or (b) MJ explicitly wants to model invite-only SKUs. Flagging for human decision on whether to track gated previews.

### 5.2 Qwen3.6 Plus (Alibaba Cloud) — Likely supersedes Qwen 3.5 Plus
- **Released:** 2026-03-31 on Alibaba's Model Studio + OpenRouter.
- **API name:** `qwen3.6-plus` (Alibaba direct), `qwen/qwen3.6-plus` (OpenRouter).
- **Pricing (Alibaba direct):** $0.325 / $1.95 per 1M tokens.
- **Specs:** 1M context, up to 65,536 output tokens. Proprietary.
- **Why flagged not added:** The MJ inventory already contains "Qwen 3.5 Plus" with `qwen/qwen3.5-plus-02-15`. Adding Qwen 3.6 Plus is straightforward and reasonable, but I want a human signal on whether MJ wants to (a) add 3.6 Plus alongside 3.5 Plus, or (b) treat 3.6 as the successor and mark 3.5 inactive. Recommend adding next cycle once that decision is made.

### 5.3 Qwen3.6 Max Preview (Alibaba Cloud) — Same flag as 5.2
- **Released:** 2026-04-20.
- **Pricing:** $1.30 / $7.80 per 1M tokens.
- Same disposition as 5.2: easy to add but coupled to the broader Qwen-family curation question.

### 5.4 Qwen3.6-27B / Qwen3.6-35B-A3B (Alibaba)
- The 35B-A3B variant **is already in inventory** as "Qwen 3.6 35B A3B".
- Qwen3.6-27B (open-weight, released 2026-04-22) is **not yet in inventory** but, like 5.2/5.3, is part of the broader Qwen family curation question.

---

## 6. New Vendors Worth Considering

- **DeepSeek** — added in this PR (see 1.7).
- No other gaps identified. All major frontier-model providers are already represented.

---

## 7. Recommended Actions (Prioritized)

| # | Action | Impact | In this PR? |
|---|---|---|---|
| 1 | Add **DeepSeek** vendor | Required for V4 family | ✅ |
| 2 | Add **GPT-5.5** | New OpenAI flagship | ✅ |
| 3 | Add **GPT-5.5 Pro** | Highest-end OpenAI SKU | ✅ |
| 4 | Add **Grok 4.3** | New xAI flagship at 40% lower price | ✅ |
| 5 | Add **Kimi K2.6** | Open-weights leader | ✅ |
| 6 | Add **DeepSeek V4 Pro** + **V4 Flash** | Major frontier launches | ✅ |
| 7 | Decide curation policy on Qwen 3.6 family (Plus / Max / 27B) | Catalog completeness | ⏸ Next cycle, pending human guidance |
| 8 | Decide policy on gated previews (Claude Mythos) | Catalog completeness | ⏸ Awaiting human guidance |

---

## 8. Research Sources

**OpenAI (GPT-5.5):**
- [Introducing GPT-5.5 — OpenAI](https://openai.com/index/introducing-gpt-5-5/)
- [GPT-5.5 Model — OpenAI API docs](https://developers.openai.com/api/docs/models/gpt-5.5)
- [GPT-5.5 Pro Model — OpenAI API docs](https://developers.openai.com/api/docs/models/gpt-5.5-pro)
- [OpenAI's GPT-5.5 in Microsoft Foundry — Azure Blog](https://azure.microsoft.com/en-us/blog/openais-gpt-5-5-in-microsoft-foundry-frontier-intelligence-on-an-enterprise-ready-platform/)

**Anthropic (Claude 4.7 / Mythos Preview):**
- [Claude Opus 4.7 is generally available — GitHub Changelog](https://github.blog/changelog/2026-04-16-claude-opus-4-7-is-generally-available/)
- [Claude Mythos Preview — red.anthropic.com](https://red.anthropic.com/2026/mythos-preview/)
- [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing)

**xAI (Grok 4.3):**
- [Grok 4.3 — xAI Docs](https://docs.x.ai/developers/models/grok-4.3)
- [xAI launches Grok 4.3 — VentureBeat](https://venturebeat.com/technology/xai-launches-grok-4-3-at-an-aggressively-low-price-and-a-new-fast-powerful-voice-cloning-suite)
- [Grok 4.3 Intelligence Analysis — Artificial Analysis](https://artificialanalysis.ai/models/grok-4-3)

**Moonshot AI (Kimi K2.6):**
- [Kimi K2.6 Tech Blog — kimi.com](https://www.kimi.com/blog/kimi-k2-6)
- [Kimi K2.6 — Hugging Face](https://huggingface.co/moonshotai/Kimi-K2.6)
- [Kimi K2.6 Pricing — OpenRouter](https://openrouter.ai/moonshotai/kimi-k2.6)

**DeepSeek (V4 Pro / V4 Flash):**
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [DeepSeek V4 Preview Release — DeepSeek API Docs](https://api-docs.deepseek.com/news/news260424)
- [DeepSeek V4 Flash — Hugging Face](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash)
- [DeepSeek V4 Pro / Flash — OpenRouter](https://openrouter.ai/deepseek)

**Alibaba (Qwen 3.6):**
- [Qwen3.6 Plus — OpenRouter](https://openrouter.ai/qwen/qwen3.6-plus)
- [Qwen3.6 Max Preview — Artificial Analysis](https://artificialanalysis.ai/models/qwen3-6-max)

**Other vendors checked (no actionable changes):**
- [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Mistral AI Models 2026 — Serenities AI](https://serenitiesai.com/articles/mistral-ai-models-2026-complete-guide)
- [Groq pricing](https://groq.com/pricing)
- [Cerebras pricing](https://www.cerebras.ai/pricing)
- [Black Forest Labs pricing](https://bfl.ai/pricing)
- [Fireworks pricing](https://fireworks.ai/pricing)
- [Cohere pricing](https://cohere.com/pricing)
- [Mercury 2 — Inception Labs / Artificial Analysis](https://artificialanalysis.ai/models/mercury-2)
- [MiniMax pricing](https://platform.minimax.io/docs/release-notes/models)
- [LLM Updates — May 2026](https://llm-stats.com/llm-updates)
