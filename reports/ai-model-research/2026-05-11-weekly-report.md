# Weekly AI Model Research Report — 2026-05-11

**Scope of research window:** ~2026-05-04 through 2026-05-11 (since the previous research cycle).

**Base branch:** `next` → working branch `claude/ai-model-research-2026-05-11`.

**Current MJ inventory snapshot (pre-PR):**
- `metadata/ai-models/.ai-models.json`: 129 models
- `metadata/ai-models/.cohere-reranker-models.json`: 4 reranker models
- `metadata/ai-vendors/.ai-vendors.json`: 25 vendors

The inventory was very recently refreshed (last commit 2026-05-08), so frontier-model coverage for late-April releases (GPT-5.5, Grok 4.3, Kimi K2.6, DeepSeek V4) is already current. This cycle's findings are mostly **housekeeping** — retiring decommissioned model rows that are still marked `IsActive=true` — plus one production-ready image model addition.

---

## Executive Summary

The window between this report and the last (2026-05-04 → 2026-05-11) was quiet on the frontier-LLM front: no new flagship general-availability releases from Anthropic, OpenAI, Google, xAI, Mistral, Moonshot, DeepSeek, or Meta. Two security-gated previews (**Anthropic Claude Mythos Preview** and **OpenAI GPT-5.5-Cyber**) were announced and are noted for human review but explicitly **not added** — both are restricted-access cybersecurity research previews, not GA, so they fall outside the "production-ready" inclusion bar.

The most valuable changes this cycle are deprecation hygiene: nine models that vendors have retired or decommissioned are still marked `IsActive=true` in MJ. These cause silent runtime failures if selected, so they should be flipped to `IsActive=false`. One new image model (**FLUX.2 [max]** from Black Forest Labs) is being added because it has a stable, documented public API and is the top-tier sibling of the FLUX.2 family already in inventory.

---

## Summary of Recommended Changes

| Category | Count | Action |
|---|---|---|
| New models to add | 1 (FLUX.2 [max]) | JSON edit |
| New vendors | 0 | None |
| Pricing changes | 0 | None verified |
| Updated models (metadata) | 0 | None |
| Deprecations (set `IsActive=false`) | 9 | JSON edits |
| Approaching deprecation (flag only) | 4 | Report-only |
| Flagged for human review | 4 | Report-only |

---

## 1. Current Inventory Snapshot

| Vendor | Active models | Notes |
|---|---|---|
| Anthropic | 7 active | Opus 4.7, Opus 4.6, Sonnet 4.6, Haiku 4.5, Opus 4.1, Sonnet 4.5, Opus 4.5; older 3.x/4.x correctly inactive |
| OpenAI | 14 active | GPT 5.5/Pro, 5.4/5.4-mini/5.4-nano, 5.2/5.2-codex, 5.1-codex variants, 5/5-mini/5-nano, 4.1 family, 4o family, o-series, image, embeddings |
| Google + Vertex AI | 11 active | Gemini 3.1 Pro, 3.1 Flash-Lite, 3 Pro, 3 Flash, 2.5 Pro/Flash/Flash-Lite, 2.5 previews, 2.0 Flash/Flash-Lite, 1.5 Pro/Flash, Nano Banana Pro |
| xAI | 8 active | Grok 4.3, 4.20, 4 Fast (R/NR), 4-1 Fast (R/NR), Code Fast 1, Grok 4 |
| Mistral AI | 8 active | Large 3, Medium 3.1, Small 4, Small 3.2, Devstral 2, Codestral 2508, mistral-large-latest, mistral-medium-latest, Mixtral 8x7B (legacy) |
| Moonshot AI | 2 active | Kimi K2.6, Kimi K2.5 |
| DeepSeek | 2 active | V4 Pro, V4 Flash (added 2026-05-08) |
| MiniMax | 3 active | M-2.7, M-2.5, M-2.5-highspeed |
| Z.AI | 2 active | GLM 5.1, GLM 5 |
| Inception Labs | 1 active | Mercury 2 |
| Alibaba Cloud | 1 active | Qwen 3.6 35B A3B |
| Groq (inference provider) | spans many | Llama 3/3.1/3.3/4, Kimi K2, GPT-OSS, Qwen 3, DeepSeek R1 distill, Groq Compound |
| Cerebras (inference provider) | spans many | Llama 3.3/4, Qwen 3.x family, GPT-OSS, GLM, DeepSeek R1 distill |
| Fireworks.ai / OpenRouter | spans many | Open-weight serverless / unified gateway respectively |
| Amazon Bedrock | spans Claude/GPT-OSS | Inference provider for Anthropic and OpenAI open models |
| Azure | spans OpenAI family | Microsoft Foundry/Azure OpenAI |
| Cohere | 4 reranker models | rerank-v4-pro, rerank-v4-fast, rerank-v3.5, rerank-multilingual-v3.0 |
| Black Forest Labs | 2 active | FLUX.2 Pro, FLUX 1.1 Pro — **FLUX.2 [max] missing, see §2** |
| Eleven Labs, HeyGen, Tasio Labs, LM Studio, LocalEmbeddings | Various TTS/video/local | OK |

---

## 2. New Models (JSON edits this PR)

### 2.1 FLUX.2 [max] (Black Forest Labs)

- **Release:** Late 2025 as the top-tier variant in the FLUX.2 family (FLUX.2 itself launched 2025-11-25). Speed upgrade 2026-03-03 doubled generation throughput at zero quality loss.
- **API name:** `flux-2-max` (BFL direct API; also surfaced via OpenRouter, fal.ai, DeepInfra).
- **Parameters:** 32B. 4-megapixel output ceiling. Highest-consistency image editing in the FLUX.2 family — preserves colors, lighting, faces, written characters, and object detail.
- **Positioning:** Default choice for product marketing, e-commerce variations, packaging, interior design, 3D reconstruction, video production — use cases where FLUX.2 Pro's lower-tier consistency isn't sufficient.
- **Pricing (BFL direct API):**
  - Input: $0.03 per megapixel (reference/editing inputs)
  - Output: $0.07 for the **first** megapixel; $0.03 for each subsequent megapixel
  - Effective cost: a 1024×1024 (1 MP) image ≈ $0.07; a full 4 MP image ≈ $0.07 + 3 × $0.03 = $0.16
- **Action:** New model entry. Vendor rows: Black Forest Labs (Model Developer + Inference Provider). Cost row using the `Per Image` unit-type pattern already used for FLUX.2 Pro / FLUX 1.1 Pro, with the per-megapixel detail captured in `Comments`. `PriorVersionID = FLUX.2 Pro` (sibling/upgrade).
- **PowerRank:** 11 (above FLUX.2 Pro at 10); SpeedRank 6 (slower than Pro because of higher consistency processing); CostRank 7 (the launch price is roughly 2.3× FLUX.2 Pro per 1024² image).

---

## 3. Pricing Changes

**None verified this cycle.** Spot-checks performed on 2026-05-11:

- **Anthropic:** Opus 4.7 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5 — unchanged. (Verified against [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing).)
- **OpenAI:** GPT 5.5 $5/$30, GPT 5.5 Pro $30/$180, GPT 5.4 $2.50/$15 — unchanged.
- **xAI:** Grok 4.3 $1.25/$2.50, Grok 4.20 $2/$6 — unchanged.
- **Mistral:** Large 3 $0.50/$1.50, Small 4 $0.15/$0.60 — unchanged. One aggregator article (TokenMix Blog) cited "$2/$6 for Mistral Large 3" but multiple authoritative trackers (mistral.ai/pricing, pricepertoken.com, devtk.ai) confirm $0.50/$1.50 — **no edit**.
- **DeepSeek:** V4 Pro list pricing $1.74/$3.48 (75% promo through 2026-05-31). V4 Flash $0.14/$0.28 — unchanged.
- **Moonshot:** Kimi K2.6 $0.60/$2.50 launch — unchanged.
- **Google:** Gemini 3.1 Pro $2/$12 (≤200K), $4/$18 (>200K) — unchanged.
- **Black Forest Labs:** FLUX.2 Pro and FLUX 1.1 Pro unchanged.

No promotional discounts or rate cards moved this week that affect the inventory.

---

## 4. Deprecations (JSON edits this PR)

Nine models in the inventory are still flagged `IsActive=true` but the underlying vendor API endpoints are retired or decommissioned. Calling these from MJ today either returns a redirect to a successor or an HTTP error. Action: set `IsActive=false`.

| # | MJ Model Name | API Name | Vendor Status | Retired On | Source |
|---|---|---|---|---|---|
| 1 | **Llama 2 70B / Groq** | `llama2-70b-4096` | Decommissioned by Groq | 2024 (exact date not in docs); decommissioned | [Groq deprecations](https://console.groq.com/docs/deprecations) (per cached references) |
| 2 | **Llama 3 70b** | `llama3-70b-8192` | Deprecated 2025-05-31, fully decommissioned thereafter | 2025-05-31 | [Groq deprecations](https://console.groq.com/docs/deprecations); confirmed by [gptel issue #1294](https://github.com/karthink/gptel/issues/1294) |
| 3 | **Llama 3.1 405b** | `llama-3.1-405b-reasoning` (Groq) | Moved from preview to offline due to demand | 2024–2025 | [Groq deprecations](https://console.groq.com/docs/deprecations); confirmed via aggregator and Meta blog references |
| 4 | **Claude 3.5 Sonnet** | `claude-3-5-sonnet-latest` (Anthropic) | Retired by Anthropic | 2026-01-05 (deprecation notice 2025-08-13) | [Anthropic model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations); confirmed by [endoflife.date/claude](https://endoflife.date/claude) |
| 5 | **Mixtral 8x7B** | `open-mistral-8x7b` (Mistral AI) | Mistral API endpoint retired (open weights remain) | 2025-03-30 | [Mistral docs: Mixtral 8x7B](https://docs.mistral.ai/models/mixtral-8x7b-0-1) — replacement: Mistral Small 3.2 |
| 6 | **Gemini 1.5 Flash** | `gemini-1.5-flash` (Google + Vertex) | All Gemini 1.0/1.5 endpoints shut down — return 404 | 2025 (all 1.5 endpoints) | [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations) |
| 7 | **Gemini 1.5 Pro** | `gemini-1.5-pro-latest` (Google) / `gemini-1.5-pro-002` (Vertex) | Same as #6 — fully shut down | 2025 | [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations) |
| 8 | **Gemini 2.5 Pro Preview** | `gemini-2.5-pro-preview-05-06` | Preview endpoint redirected 2025-06-26 → stable `gemini-2.5-pro`; preview endpoints shut down 2025-07-15 | 2025-07-15 | [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations); [Google dev blog](https://developers.googleblog.com/en/gemini-2-5-thinking-model-updates/) |
| 9 | **Gemini 2.5 Flash Preview** | `gemini-2.5-flash-preview-04-17` | Same as #8 — preview redirected to GA on 2025-06-19, shut down 2025-07-15 | 2025-07-15 | [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations) |

**Note on #1 (Llama 2 70B):** Public Groq docs no longer list this model anywhere. We could not find an explicit "retired on YYYY-MM-DD" line, only its absence from the current models list and references to it being unavailable. Setting `IsActive=false` is the safe call regardless.

**Note on #3 (Llama 3.1 405b):** Same — Groq said it went from "preview" to "offline" due to overwhelming demand; later messaging treats it as deprecated. There is no GA endpoint replacement on Groq; users are directed to `llama-3.3-70b-versatile`. Since the MJ entry points only at Groq's `llama-3.1-405b-reasoning`, deactivation is correct.

---

## 5. Approaching Deprecation (Report Only — No Edits)

These models have **announced shutdown dates within the next ~5 weeks**. They should be re-checked next cycle and probably deactivated in the report dated 2026-06-08 or 2026-06-15.

| MJ Model Name | API Name(s) | Vendor Shutdown Date | Replacement |
|---|---|---|---|
| Gemini 2.0 Flash | `gemini-2.0-flash`, `gemini-2.0-flash-001` (Vertex) | **2026-06-01** | `gemini-2.5-flash-lite` or 3.1 Flash-Lite |
| Gemini 2.0 Flash-Lite | `gemini-2.0-flash-lite`, `gemini-2.0-flash-lite-001` | **2026-06-01** | `gemini-2.5-flash-lite` or 3.1 Flash-Lite |
| Gemini 2.5 Pro (GA) | `gemini-2.5-pro` (Google + Vertex) | **2026-06-17** | `gemini-3.1-pro-preview` or `gemini-3-pro-preview` |
| Gemini 2.5 Flash (GA) | `gemini-2.5-flash` (Google + Vertex) | **2026-06-17** | `gemini-3-flash-preview` or `gemini-3.1-flash-lite-preview` |

Source: Google developer forum thread [Clarification on Stable Replacement Models for gemini-2.5-flash and gemini-2.5-pro Before June 2026 Deprecation](https://discuss.ai.google.dev/t/clarification-on-stable-replacement-models-for-gemini-2-5-flash-and-gemini-2-5-pro-before-june-2026-deprecation/130009) and [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations).

These are **not** being deactivated yet because the endpoints are still live and accepting requests. Flipping them prematurely would lose ~3–5 weeks of usability for production callers. The next report should either deactivate them or re-confirm Google's timeline if it slips.

---

## 6. Items Flagged for Human Review (No Edits)

### 6.1 Anthropic Claude Mythos Preview
- **Released:** 2026-04-07 alongside Project Glasswing (a cross-industry critical-software-security initiative).
- **Status:** **Gated research preview**, not GA, never planned for general availability.
- **Specs:** 1M context, 128K output. Top scorer on SWE-bench Verified (93.9%), GPQA Diamond (94.6%), CyberGym (83.1%). Has autonomously discovered thousands of zero-days in every major OS and browser.
- **Pricing for Glasswing participants (after $100M credit pool):** $25 / $125 per 1M tokens. Available via Claude API, Bedrock, Vertex AI, and Microsoft Foundry.
- **Why not added:** Per the rule "Focus on production-ready models — Skip preview/alpha models unless they're from major vendors and widely available." Mythos is from a major vendor but explicitly **not widely available** — it's vetted-only. Most MJ users would never have valid credentials. Reconsider if Anthropic opens it up.
- **Sources:** [red.anthropic.com Mythos Preview](https://red.anthropic.com/2026/mythos-preview/); [Anthropic Glasswing](https://www.anthropic.com/glasswing); [LLM Stats](https://llm-stats.com/models/claude-mythos-preview).

### 6.2 OpenAI GPT-5.5-Cyber
- **Released:** 2026-05-07 in limited preview to vetted defenders responsible for securing critical infrastructure.
- **Status:** Gated, not GA. Capability-wise it's "primarily trained to be more permissive on security-related tasks" relative to base GPT-5.5; benchmark deltas are modest (81.8% vs 79.0% on CyberGym; 88.1% vs 83.7% internal CTF).
- **Pricing:** Not publicly disclosed (gated program).
- **Why not added:** Same reasoning as Mythos — gated, not generally available, no public pricing. The base GPT-5.5 already covers MJ users' needs for that capability tier.
- **Sources:** [OpenAI: Scaling Trusted Access for Cyber](https://openai.com/index/gpt-5-5-with-trusted-access-for-cyber/); [CNBC coverage](https://www.cnbc.com/2026/05/07/openai-rolls-out-new-gpt-5point5-cyber-to-vetted-cybersecurity-teams.html).

### 6.3 Mistral Voxtral TTS
- **Released:** April 2026 (with Mistral Small 4 batch).
- **Status:** GA, public API.
- **Pricing:** $0.016 per 1,000 characters — uses a **character-based** unit type, not tokens.
- **Why not added (this cycle):** MJ's `MJ: AI Model Price Unit Types` schema currently has token-based and image-based unit types; a character-based unit type would either need to be normalized (e.g. approximate token equivalence) or a new unit type added. Eleven Labs and OpenAI TTS are already in inventory using `Per 1M Tokens` — Voxtral would fit alongside them but the unit normalization should be a human decision. Flagging for review rather than guessing.
- **Sources:** [Mistral AI pricing](https://mistral.ai/pricing).

### 6.4 Mistral Leanstral
- **Released:** April 2026.
- **Status:** GA, open weights (Apache 2.0). 6B parameters.
- **Specialization:** First open-source Lean 4 code agent for formal mathematical verification.
- **Why not added:** Niche use case — formal verification of math/proof code. Unless MJ has known users doing Lean 4 work, the catalog cost outweighs the value. Defer to human judgment.
- **Sources:** [Mistral release notes](https://releasebot.io/updates/mistral).

### 6.5 Gemini 3.1 Deep Think
- **Status:** Early access via Gemini API to "select researchers, engineers and enterprises"; consumer access via the Gemini app on Google AI Ultra subscriptions only. **Not a public-API GA endpoint.**
- **What it is:** A specialized reasoning mode built on top of Gemini 3.1 Pro that uses iterative rounds of reasoning across multiple hypotheses. Achieves gold-medal scores at math and programming world championships.
- **Why not added:** No public API model name documented yet. Reconsider when Google ships it as a standard `gemini-3.1-deep-think` (or similar) endpoint with published pricing.
- **Sources:** [Google: Gemini 3 Deep Think](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-deep-think/); [DeepMind Deep Think page](https://deepmind.google/models/gemini/deep-think/).

### 6.6 Grok 5 (xAI)
- **Status:** Pre-release. Per xAI's own X account, Q2 2026 (May–June) is the most likely window for a public beta; full API access likely Q3 2026. Architecture: MoE, 6T total parameters.
- **Why not added:** Not released yet. Track for next cycle.
- **Sources:** [NxCode Grok 5 guide](https://www.nxcode.io/resources/news/grok-5-release-date-6t-parameters-agi-xai-complete-guide-2026); [Fello AI](https://felloai.com/all-we-know-so-far-about-grok-5/).

---

## 7. Recommended Actions (Ordered by Impact)

1. **High impact, low risk — deprecation hygiene.** Set `IsActive=false` on the 9 retired models in §4. These are silent failure modes today.
2. **Medium impact — add FLUX.2 [max].** New top-tier BFL image model with stable API, clean pricing, used by enterprise customers for product photography.
3. **Calendar reminder for 2026-06-08 report.** Re-check the four Gemini 2.0/2.5 models in §5 — they're scheduled to shut down 2026-06-01 and 2026-06-17. Plan to deactivate them in the next two cycles.
4. **No pricing-row edits this cycle.** All spot-checked prices match.
5. **No new vendors this cycle.** All vendors mentioned in research findings (Anthropic, OpenAI, Google, Mistral, BFL, etc.) are already in inventory.

---

## 8. Research Sources

### Anthropic / Claude
- [Pricing — Claude API Docs](https://platform.claude.com/docs/en/about-claude/pricing)
- [Model Deprecations — Claude API Docs](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- [Anthropic Claude Opus 4.7 GA — GitHub Changelog](https://github.blog/changelog/2026-04-16-claude-opus-4-7-is-generally-available/)
- [Claude Mythos Preview — red.anthropic.com](https://red.anthropic.com/2026/mythos-preview/)
- [Anthropic — Project Glasswing](https://www.anthropic.com/glasswing)
- [endoflife.date — Anthropic Claude](https://endoflife.date/claude)

### OpenAI
- [Introducing GPT-5.5 — OpenAI](https://openai.com/index/introducing-gpt-5-5/)
- [Scaling Trusted Access for Cyber with GPT-5.5 and GPT-5.5-Cyber](https://openai.com/index/gpt-5-5-with-trusted-access-for-cyber/)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [GPT-5.5 Model API docs](https://developers.openai.com/api/docs/models/gpt-5.5)
- [CNBC — OpenAI announces GPT-5.5 (2026-04-23)](https://www.cnbc.com/2026/04/23/openai-announces-latest-artificial-intelligence-model.html)
- [CNBC — GPT-5.5-Cyber (2026-05-07)](https://www.cnbc.com/2026/05/07/openai-rolls-out-new-gpt-5point5-cyber-to-vetted-cybersecurity-teams.html)

### Google / Gemini
- [Gemini API deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3.1 Pro — Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/)
- [Gemini 3 Deep Think](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-deep-think/)
- [Vertex AI partner-model deprecations](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/deprecations/partner-models)
- [Google AI Dev Forum — 2.5 deprecation clarification](https://discuss.ai.google.dev/t/clarification-on-stable-replacement-models-for-gemini-2-5-flash-and-gemini-2-5-pro-before-june-2026-deprecation/130009)

### xAI
- [xAI Models and Pricing](https://docs.x.ai/developers/models)
- [Grok 4.3 docs](https://developer.puter.com/ai/x-ai/grok-4.3/)
- [Grok 5 release date guide (NxCode)](https://www.nxcode.io/resources/news/grok-5-release-date-6t-parameters-agi-xai-complete-guide-2026)

### Mistral AI
- [Mistral pricing](https://mistral.ai/pricing)
- [Mistral docs — Mixtral 8x7B retirement](https://docs.mistral.ai/models/mixtral-8x7b-0-1)
- [Mistral release notes (Releasebot mirror)](https://releasebot.io/updates/mistral)

### Groq
- [Groq Model Deprecation](https://console.groq.com/docs/deprecations)
- [gptel issue #1294 — llama3-70b-8192 deprecation confirmation](https://github.com/karthink/gptel/issues/1294)
- [crewAI issue #1976 — llama-3.1-70b-versatile decommissioning](https://github.com/crewAIInc/crewAI/issues/1976)

### Black Forest Labs
- [BFL pricing](https://bfl.ai/pricing)
- [FLUX.2 [max] product page](https://bfl.ai/models/flux-2-max)
- [BFL Documentation](https://docs.bfl.ml/quick_start/pricing)

### Cross-vendor trackers / aggregators (used for verification)
- [LLM Stats — Updates feed](https://llm-stats.com/llm-updates)
- [LLM Stats — News](https://llm-stats.com/ai-news)
- [AI Flash Report — Model Release Timeline 2025–2026](https://aiflashreport.com/model-releases.html)
- [pricepertoken.com — provider pages](https://pricepertoken.com/)
- [OpenRouter — model pages](https://openrouter.ai/)

---

## Appendix A: How These Findings Were Validated

For each deprecation in §4, the workflow was:
1. Confirm the API name is no longer in the vendor's "supported models" docs.
2. Find at least one independent confirmation (GitHub issue, third-party tracker, or vendor blog) that the endpoint either returns errors or has been redirected.
3. Verify there's no equivalent new endpoint the MJ row could be re-pointed at without semantic loss.

For each pricing spot-check in §3, the workflow was:
1. Read the vendor's official pricing page.
2. Cross-reference with at least one third-party tracker (`pricepertoken.com`, `llm-stats.com`, or OpenRouter).
3. Note any discrepancies in the report rather than silently editing.

For the FLUX.2 [max] addition in §2, the workflow was:
1. Confirm GA status on BFL's own pricing and product pages.
2. Confirm at least one independent inference-provider (OpenRouter, fal.ai, DeepInfra) hosts it.
3. Match the pricing structure to the existing `Per Image` pattern used by FLUX.2 Pro / FLUX 1.1 Pro / Nano Banana Pro, with the per-megapixel detail captured in Comments.
