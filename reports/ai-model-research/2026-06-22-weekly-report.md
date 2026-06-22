# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-06-22
**Research Period**: 2026-06-09 through 2026-06-22
**Base Branch**: next
**Branch**: claude/ai-model-research-2026-06-22

## Executive Summary

A dramatic week in frontier models, defined by a single headline: **Anthropic released Claude Fable 5 and Claude Mythos 5 on June 9 — and they were both forcibly suspended worldwide on June 12 by a US government export-control directive.** No restoration date has been announced as of June 22. Both models are added to the inventory with `IsActive=false` so they can be flipped active when access is restored without re-authoring the records. **Z.AI shipped GLM-5.2 on June 16** — a 753B-param open-weights coding-focused frontier model at $1.40/$4.40 per 1M tokens with a 1M context window, day-zero available on Fireworks; added to inventory. **Groq announced four model deprecations on June 17** (`llama-3.1-8b-instant`, `llama-3.3-70b-versatile`, `qwen/qwen3-32b`, `meta-llama/llama-4-scout-17b-16e-instruct`) — flagged for next-cycle vendor-status flips, not applied this PR because the affected models retain multiple live inference providers and a careful per-vendor edit is required. **Moonshot AI's Kimi K2.7-Code** (June 12, already in last week's inventory) and **Alibaba's Qwen-Robot Suite** (June 16, robotics-specialized, out of scope) round out the major releases. JSON edits in this PR: **3 new models** (Claude Fable 5, Claude Mythos 5, GLM-5.2), **0 pricing changes**, **0 deprecations applied directly** (Groq vendor flips deferred).

## Current Inventory Snapshot

| Vendor                | Models in Inventory (active LLMs unless noted)                  | Last MJ Update         |
| --------------------- | --------------------------------------------------------------- | ---------------------- |
| OpenAI                | 22+ (incl. embeddings, image, TTS, realtime)                    | 2026-05-14             |
| Anthropic             | 10 (Fable 5 + Mythos 5 added this PR — suspended)               | 2026-06-22             |
| Google                | 15 (incl. Gemma, TTS, Nano Banana)                              | 2026-05-21             |
| x.ai                  | 9 (multiple Grok variants inactive)                             | 2026-05-29             |
| Mistral AI            | 10 (incl. embed)                                                | 2026-05-14             |
| Groq (inference)      | ~12 hosted models — 4 deprecations announced 2026-06-17         | 2026-04-20             |
| Alibaba Cloud (Qwen)  | 11                                                              | 2026-06-08             |
| Moonshot AI (Kimi)    | 3 (Kimi K2.7-Code added 2026-06-12)                             | 2026-06-16             |
| DeepSeek              | 2 (+ 1 distilled on Groq)                                       | 2026-05-23             |
| Z.AI (GLM)            | 6 (GLM-5.2 added this PR)                                       | 2026-06-22             |
| MiniMax               | 4 (M3 launched 2026-06-01)                                      | 2026-06-05             |
| Inception Labs        | 2 (Mercury 2, Mercury Edit 2)                                   | 2026-05-18             |
| Black Forest Labs     | 2                                                               | 2026-02-12             |
| Cohere                | 4 rerankers + Command A + Command A+ + Embed v4                 | 2026-05-20             |

## New Models Available

### Tier-1 (high confidence — applied to JSON in this PR)

| Model              | Vendor          | API ID            | In / Out / 1M    | Context      | Release    | Notes                                                                |
| ------------------ | --------------- | ----------------- | ---------------- | ------------ | ---------- | -------------------------------------------------------------------- |
| **GLM-5.2**         | Z.AI            | `glm-5.2` / `z-ai/glm-5.2` / `accounts/fireworks/models/glm-5p2` | $1.40 / $4.40 | 1M / 32K | 2026-06-16 | Z.AI's frontier coding-focused open-weights LLM (753B params, MIT license). Day-zero on Fireworks. Cached input $0.26/M. Reportedly beats GPT-5.5 on long-horizon coding benchmarks at ~1/6 the cost. Power 23, Speed 7, Cost 6. `PriorVersionID` set to GLM 5.1. |
| **Claude Fable 5**  | Anthropic       | `claude-fable-5` / `anthropic.claude-fable-5-v1:0` / `claude-fable-5@20260609` | $10 / $50 | 1M / 128K | 2026-06-09 | Released June 9 on Anthropic API, AWS, Bedrock, Vertex AI, Microsoft Foundry. **SUSPENDED worldwide on June 12** by US export-control directive — no return date. Always-on adaptive thinking, refusal/fallback behavior. Added as `IsActive=false` per the "currently retired/unavailable" pattern used for Grok 4. Set `IsActive=true` when Anthropic announces restoration. Power 28, Speed 6, Cost 10. |
| **Claude Mythos 5** | Anthropic       | `claude-mythos-5` | $10 / $50 | 1M / 128K | 2026-06-09 | Same specs as Fable 5 minus the refusal safety classifiers. **Limited-access via Project Glasswing only**, AND **suspended worldwide on June 12** with Fable 5. Successor to Claude Mythos Preview. `IsActive=false`. Power 28, Speed 6, Cost 10. |

### Tier-2 (verified but deferred — flag only)

| Model                              | Vendor                | Pricing                  | Rationale for deferring                                                                                                                                                                                       |
| ---------------------------------- | --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Magistral Medium 1.2**           | Mistral AI            | $2.00 / $5.00            | Mistral's reasoning model line (`magistral-medium-2509`). 128K context. Released **2025-09-18** — has been GA for 9 months and is not currently in inventory. The persistent omission of the Magistral family across multiple weekly reviews suggests an intentional product decision; flagging once more for explicit human disposition. Source: https://docs.mistral.ai/models/magistral-medium-1-2-25-09 |
| **Magistral Small 1.2**            | Mistral AI            | $0.50 / $1.50            | Companion to Magistral Medium 1.2. Apache 2.0, fits on a Macbook. Same disposition question as Medium. Source: https://venturebeat.com/ai/mistrals-updated-magistral-small-1-2-reasoning-model-can-analyze-images-and |
| **Voxtral TTS**                    | Mistral AI            | $0.016 per 1K characters | `voxtral-tts-2603`. Released **2026-03-26**. 4.1B params, 9 languages, 70ms latency, zero-shot voice cloning. Open weights on Hugging Face (CC BY-NC 4.0). Has been around 3 months without entering inventory — possibly out-of-scope for `.ai-models.json` (per-character TTS pricing doesn't map cleanly to `Per 1M Tokens`). Flag for product decision on whether MJ catalogs TTS-character-priced models. Source: https://mistral.ai/news/voxtral-tts/ |
| **NVIDIA Nemotron 3 family**       | NVIDIA NIM            | $0.05 / $0.20 (Nano), $0.10 / $0.50 (Super), $0.20 / $0.80 (Nano Omni) | Same blocker as the **past 3 cycles**: NVIDIA NIM vendor entry still missing from MJ. Recommend adding the NIM vendor + all three Nemotron 3 models as a coordinated batch. |
| **Grok V9-Medium**                 | x.ai                  | TBD                      | Training complete (1.5T params, Cursor data). Available in consumer Grok product on X / SuperGrok since 2026-06-16, but **still not in xAI API as of June 19**. Watch for next cycle. Source: https://www.bighatgroup.com/blog/xai-weekly-2026-06-03/ |
| **Grok Imagine Video 1.5**         | x.ai                  | (image/video gen)        | `grok-imagine-video-1.5` GA in xAI API + grok.com/imagine + iOS/Android. 6-second 720p videos in ~25s (down from 40+). MJ does not currently track video-gen models in `.ai-models.json`; defer. |
| **Qwen 3.6-27B**                   | Alibaba Cloud         | open weights             | Dense open-weight model, Apache 2.0 license, hybrid Gated DeltaNet + attention architecture. Recommended Groq replacement target for the deprecated `qwen/qwen3-32b`. Released **2026-04-22** — has been around 2 months. Outperforms 397B MoE on agentic coding benchmarks per MarkTechPost. Worth catalog consideration if Groq picks it up as official replacement. |
| **Qwen-Robot Suite**               | Alibaba Cloud         | (robotics-specialized)   | `Qwen-RobotNav`, `Qwen-RobotManip`, `Qwen-RobotWorld` announced 2026-06-16. Out of scope for the LLM/embedding/TTS catalog. |
| **GLM-5.2 on Cerebras**            | Cerebras              | TBD                      | Cerebras has historically hosted Z.AI models (`zai-glm-4.7`, `zai-glm-4.6`) but **no published Cerebras endpoint for GLM-5.2 as of June 22**. Skip Cerebras inference-provider row until they list it; revisit next cycle. |
| **Avocado / Muse Spark**           | Meta Superintelligence | TBD                     | Meta's reported "successor to Llama" line (codename **Avocado**, Q1 2026 target, delayed). **Muse Spark** allegedly released April 2026 as replacement. No verifiable public API ID, pricing, or model card from primary Meta sources — third-party reporting only. Skip until Meta publishes an official model card. |
| **GPT-5.6**                        | OpenAI                | TBD                      | Rumored but **NOT confirmed** by OpenAI. Third-party blogs speculate 1.5M context, Q2/Q3 release window. Treat as rumor until openai.com/news ships an announcement. |

## Pricing Changes Detected

| Model                     | Vendor          | Previous Price (In / Out) | Current Price (In / Out)         | Action                                |
| ------------------------- | --------------- | ------------------------- | -------------------------------- | ------------------------------------- |
| _(none in-window)_        | —               | —                         | —                                | All in-inventory pricing verified unchanged for the week. |

### Resolutions of prior open items

| Item                                  | Prior Status                                                            | Status now                                                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gemini 3.5 Pro (preview)**          | Last cycle: "preview, GA nears". Pichai said "give us until next month".| Still preview-only as of June 22. No GA announcement found in the past 2 weeks. Hold.                                                                                                       |
| **Gemini Omni / Omni Flash**          | Last cycle: consumer-only, developer API "coming weeks".                | No developer API release found in research window. Consumer Omni Flash mention now reframed as "Gemini Omni" — likely the same product line. Hold for first developer-API endpoint.        |
| **Grok V9-Medium**                    | Last cycle: training complete, "mid-June" targeted.                     | Consumer GA on X / SuperGrok 2026-06-16. **API still not opened as of June 19** (per xAI weekly + xAI docs). Two gates; API gate not opened.                                              |
| **NVIDIA Nemotron 3 family**          | Past 3 cycles: blocked on NIM vendor not in MJ.                         | **Still blocked.** Strong recommendation: add NIM vendor + 3-4 Nemotron 3 models as a coordinated batch next cycle.                                                                          |
| **Magistral / Voxtral**               | Newly surfaced this cycle.                                              | Flagged as Tier-2 above. Both have been GA for months — the persistent omission deserves a product-decision call.                                                                            |

## Model Updates & New Versions

- **Claude Fable 5 + Mythos 5 launched and suspended (NEW — DEFINING EVENT THIS CYCLE).**
  - **2026-06-09**: Both models launch GA. Fable 5 on Anthropic API + AWS + Bedrock + Vertex AI + Microsoft Foundry; Mythos 5 limited via Project Glasswing.
  - **2026-06-12**: US government issues export-control directive citing national security. Anthropic suspends both models worldwide for all customers (foreign and domestic) to comply.
  - **2026-06-22 (today)**: Both still suspended. Polymarket gives 41-57% odds of restoration before June 26 / July 1.
  - Anthropic public statement: working to restore access; disagrees with the government's assessment ("narrow jailbreak").
  - Sources: https://platform.claude.com/docs/en/about-claude/models/introducing-claude-fable-5-and-claude-mythos-5 ; https://www.anthropic.com/news/fable-mythos-access ; https://x.com/AnthropicAI/status/2065597531644743999 ; https://natlawreview.com/article/ai-company-anthropic-suspends-access-claude-fable-5-claude-mythos-5-following-us
- **GPT-5.2 retired from ChatGPT on 2026-06-12.** All GPT-5.2 sessions auto-continue on the corresponding GPT-5.5 model. API behavior of `gpt-5.2` not affected per OpenAI docs, but ChatGPT-product surfaces no longer show it. Source: https://help.openai.com/en/articles/9624314-model-release-notes
- **Gemini 3.5 Flash GA + default-on for Gemini Enterprise (2026-06-08).** Already in inventory; this confirms the default-on transition. No JSON change.
- **OpenAI deprecation notice (2026-06-02)**: Older GPT Image models flagged for **2026-12-01 removal** from the API. Specific model IDs not surfaced in this research window. Worth direct verification next cycle to flip `IsActive` on any affected entries in inventory (current inventory contains `GPT-4o Image 1.0` / `gpt-image-1`, `GPT 4.o Image 1.5` / `gpt-image-1.5`, `GPT Image 2` / `gpt-image-2` — likely safe but verify which generation is being deprecated).
- **Vertex AI pricing structure transition (heads-up for 2026-07-01)**: Carry-over from prior cycle — non-global endpoints for Gemini 3.x+ families switch to new GA pricing structure. Not actionable this PR.

## Deprecated / Sunset Models

### Vendor-status flips RECOMMENDED but DEFERRED to next cycle (per "be conservative" rule)

Groq announced **four deprecations on 2026-06-17** (per https://console.groq.com/docs/deprecations). All four affect models that retain multiple active inference providers in our inventory — flipping just the Groq vendor row to `Status=Deprecated` is the correct surgical action, but each requires precise per-row identification to avoid clobbering other vendor rows:

| Model in MJ                                | Groq Replacement Recommended | Recommended Action                                                                  |
| ------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------- |
| **Llama 3.1 8b** (Groq row: `llama-3.1-8b-instant`) | `openai/gpt-oss-20b`        | Flip Groq vendor row `Status` → `Deprecated`. OpenRouter row stays Active.          |
| **Llama 3.3 70B Versatile** (Groq row: `llama-3.3-70b-versatile`) | `openai/gpt-oss-120b` or `qwen/qwen3.6-27b` | Flip Groq vendor row `Status` → `Deprecated`. Cerebras + OpenRouter rows stay Active. |
| **Qwen 3 32B** (Groq row: `qwen/qwen3-32b`) | `openai/gpt-oss-120b` or `qwen/qwen3.6-27b` | Flip Groq vendor row `Status` → `Deprecated`. Cerebras + OpenRouter rows stay Active. |
| **Llama 4 Scout** (Groq row: `meta-llama/llama-4-scout-17b-16e-instruct`) | `openai/gpt-oss-120b` or `qwen/qwen3.6-27b` | Flip Groq vendor row `Status` → `Deprecated`. Cerebras + OpenRouter rows stay Active. |

**Why deferred**: Each of these models has 2-3 inference-provider rows. Flipping the wrong row would break routing. A precise, per-model edit pass next cycle (with cross-verification of vendor-entry primaryKey IDs from the actual JSON) is the safer approach.

### Notes on Anthropic suspensions (June 12, 2026)

The Fable 5 / Mythos 5 suspension is **not a normal deprecation** — it's an externally-imposed access cutoff with no announced restoration date. The right disposition:

- `IsActive=false` for both new entries, with explanatory description.
- Vendor `Status=Active` retained (the rows model what the vendor *would* serve if access returned — flipping Status would imply a vendor decision to drop the model, which isn't accurate here).
- The cost records also retain `Status=Active` for the same reason.

When access is restored: flip `IsActive=true` on both model entries. No other changes required.

## New Vendors Worth Considering

- **NVIDIA NIM** — Persistent recommendation across **3+ cycles**. Hosts Nemotron 3 family plus a large number of third-party models. Recommend adding next cycle with `CredentialTypeID` set to "API Key" and a coordinated batch of 3-4 Nemotron models. Sources: https://build.nvidia.com/ ; https://www.marktechpost.com/2026/04/22/alibaba-qwen-team-releases-qwen3-6-27b... (Nemotron Super 120B-A12B on OpenRouter)
- **Meta Superintelligence Labs** — If/when Muse Spark or Avocado publish an official model card. Currently third-party reporting only — too speculative to add.
- **Microsoft Foundry** — Mentioned in Anthropic's Fable 5 / Mythos 5 docs as a deployment surface. Not yet in MJ inventory. Worth adding if Foundry-hosted models develop traction beyond the Anthropic family.

## Recommended Actions (prioritized)

1. **APPLIED THIS PR**: Add Claude Fable 5 (suspended), Claude Mythos 5 (suspended + Glasswing-only), GLM-5.2 (active) to `.ai-models.json`. 3 new model entries; 10 new vendor rows; 5 new cost rows.
2. **NEXT CYCLE**: Apply the 4 Groq vendor-status flips for the 2026-06-17 deprecations. Requires careful per-row primary-key verification.
3. **NEXT CYCLE / SOMEDAY**: Add NVIDIA NIM vendor + Nemotron 3 family (Nano, Super, Nano Omni, possibly Ultra). Pricing is published and stable; the only blocker is the new vendor record. Recommended as a coordinated batch.
4. **PRODUCT DECISION**: Is the Magistral family (Mistral reasoning) intentionally excluded from the MJ catalog? It's been GA for 9 months. Same question for Voxtral TTS (3 months). If they're in scope, both can be added next cycle.
5. **MONITOR**: Claude Fable 5 / Mythos 5 restoration. Flip `IsActive=true` on both rows when Anthropic announces restoration. Run a quick re-verification of the listed cost records when this happens (vendor pricing on restoration is the most likely thing to have shifted).
6. **MONITOR**: Grok V9-Medium API GA. Currently consumer-only; API gate not opened as of 2026-06-19.
7. **MONITOR**: OpenAI Dec 1, 2026 image-model deprecation. Identify exactly which `gpt-image-*` ID is being deprecated.

## Research Sources

### Releases / Status
- Claude Fable 5 / Mythos 5 docs: https://platform.claude.com/docs/en/about-claude/models/introducing-claude-fable-5-and-claude-mythos-5
- Anthropic suspension statement: https://www.anthropic.com/news/fable-mythos-access
- Anthropic X/Twitter announcement: https://x.com/AnthropicAI/status/2065597531644743999
- Fable 5 status tracker: https://isfableback.org/ , https://isfable5back.com/
- "Is Fable 5 Back" (June 21 update): https://explainx.ai/blog/is-fable-5-back-2026
- Fable 5 pricing & benchmarks: https://www.finout.io/blog/claude-fable-5-mythos-5-pricing-benchmarks
- GLM-5.2 launch (VentureBeat): https://venturebeat.com/technology/z-ais-open-weights-glm-5-2-beats-gpt-5-5-on-multiple-long-horizon-coding-benchmarks-for-1-6th-the-cost
- GLM-5.2 on Fireworks: https://fireworks.ai/blog/glm-5p2
- GLM-5.2 pricing & API guide: https://lushbinary.com/blog/glm-5-2-api-pricing-glm-coding-plan-guide/
- GLM-5.2 OpenRouter: https://openrouter.ai/z-ai/glm-5.2
- Kimi K2.7-Code release (MarkTechPost): https://www.marktechpost.com/2026/06/12/moonshot-ai-releases-kimi-k2-7-code-a-coding-model-reporting-21-8-on-kimi-code-bench-v2-over-k2-6/
- Groq deprecations: https://console.groq.com/docs/deprecations
- xAI release notes: https://docs.x.ai/developers/release-notes ; https://x.ai/build/changelog
- xAI weekly (Grok V9-Medium): https://www.bighatgroup.com/blog/xai-weekly-2026-06-03/
- Grok V9-Medium builders' guide: https://chatforest.com/builders-log/xai-grok-v9-medium-1-5t-coding-model-mid-june-2026-builder-guide/
- Alibaba Qwen-Robot Suite: https://gigazine.net/gsc_news/en/20260617-qwen-robot-suite
- Mistral changelog: https://docs.mistral.ai/resources/changelogs (403 to WebFetch; secondary sources used)
- Magistral Medium 1.2: https://docs.mistral.ai/models/magistral-medium-1-2-25-09
- Voxtral TTS: https://mistral.ai/news/voxtral-tts/
- OpenAI release notes: https://help.openai.com/en/articles/9624314-model-release-notes
- Gemini changelog: https://ai.google.dev/gemini-api/docs/changelog
- Gemini Enterprise release notes: https://docs.cloud.google.com/gemini/enterprise/docs/release-notes

### Pricing trackers used as convergence sources
- AI Pricing Guru: https://www.aipricing.guru/ (Mistral, OpenAI, Anthropic, Cohere)
- Price Per Token: https://pricepertoken.com/
- OpenRouter (`z-ai/glm-5.2`, `anthropic/claude-fable-5`): https://openrouter.ai/
- LLMReference: https://www.llmreference.com/

## Operational Notes

- **openai.com/api/pricing, docs.z.ai, docs.mistral.ai, console.groq.com/docs/deprecations all return HTTP 403 to WebFetch** — same recurring issue as prior cycles. Third-party trackers with cross-source convergence used instead. Worth flagging to the team that a stable upstream access path (or a periodic mirror) would meaningfully improve the precision of this routine.
- **Status of Claude Fable 5 / Mythos 5 is genuinely fluid** — they are added with `IsActive=false` so flipping back is a one-character change. If the user prefers the inverse default (`IsActive=true`, with a description note about suspension), the swap is trivial.
- **GLM-5.2 vendor row for Cerebras was NOT added** — Cerebras historically hosts Z.AI models but no public GLM-5.2 endpoint was found as of June 22. Adding speculatively would create a row that doesn't route; revisit next cycle.
- **`PriorVersionID` populated** for GLM-5.2 (→ GLM 5.1) and Claude Fable 5 (→ Claude Opus 4.8) per the chained-versions pattern visible across existing entries. Claude Mythos 5 left without PriorVersionID — its predecessor (Claude Mythos Preview) is not in inventory.
- **No prompt injection encountered** in any of the fetched content this cycle.
- **No PR-watching subscription needed** — this is a one-shot routine; the PR is the deliverable.
