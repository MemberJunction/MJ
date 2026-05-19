# Weekly AI Model Research Report — 2026-05-13

**Scope of research window:** ~2026-05-04 through 2026-05-13 (since the previous research cycle).

**Current MJ inventory snapshot (pre-PR):**
- `metadata/ai-models/.ai-models.json`: 129 models
- `metadata/ai-models/.cohere-reranker-models.json`: 4 reranker models
- `metadata/ai-vendors/.ai-vendors.json`: 25 vendors

Inventory is current as of last cycle's PR (2026-05-04). This cycle picks up five GA model releases that landed in the past week plus one notable upcoming xAI deprecation event scheduled for 2026-05-15.

---

## Executive Summary

Four new models added this PR — **GPT 5.5 Instant**, **GPT Realtime 2**, **GPT Image 2**, **GLM 5V Turbo**, and **Mistral Medium 3.5**. The new vendor count is unchanged. Two minute-billed OpenAI realtime audio models (Translate, Whisper) are intentionally flagged for human review rather than added because MJ's pricing schema does not currently have a "Per Minute" unit type, so they don't fit cleanly without schema work. xAI also announced five model retirements effective 2026-05-15 (a near-term event) — listed under "Existing models to mark inactive" for separate action.

---

## Summary of Recommended Changes

| Category | Count | Action |
|---|---|---|
| New models to add | 5 | JSON edits |
| New vendors | 0 | None |
| Pricing changes | 1 | DeepSeek cache-hit input rate (note in existing cost row) |
| Updated models (metadata) | 0 | None verified |
| Models to mark inactive | 5 | xAI retirements 2026-05-15 — flag, human approval |
| Flagged for human review | 4 | Report-only |

---

## 1. New Models (JSON edits this PR)

### 1.1 GPT 5.5 Instant (OpenAI)
- **Release:** 2026-05-05. Replaces GPT-5.3 Instant as the default ChatGPT model. In the API as the alias `chat-latest`.
- **API name:** `gpt-5.5-instant` (announcement; OpenAI's API page may also expose this under `chat-latest`).
- **Context:** Inherits from the GPT-5.5 family — 1,050,000 input tokens (≈1M), 128,000 output. Codex deployment uses a 400K context.
- **Capabilities:** Low-latency variant of GPT-5.5. Headline metric: 52.5% fewer hallucinated claims than GPT-5.3 Instant on high-stakes prompts (legal, medical, financial). Supports `reasoning_effort` like its siblings.
- **Pricing:** Not separately listed from GPT-5.5 in API documentation reviewed. We provisionally use the GPT-5.5 standard $5.00 / $30.00 per 1M tokens with a comment noting Instant may have a lower rate once OpenAI's pricing page differentiates it.
- **Action:** New model entry. Vendor rows for OpenAI (Model Developer + Inference Provider). Cost row at $5/$30 with a "pricing-verification-needed" annotation.
- **PowerRank:** 13 (above GPT 5.4 at 14; below the GPT 5.5 flagship at 12). SpeedRank: 9 (Instant series is the speed-optimized SKU). CostRank: 10 (pending verification).

### 1.2 GPT Realtime 2 (OpenAI)
- **Release:** 2026-05-07. Generation-2 of OpenAI's speech-to-speech model, now powered by GPT-5-class reasoning.
- **API name:** `gpt-realtime-2`.
- **Context:** 128K tokens (4× the predecessor's 32K).
- **Capabilities:** Five reasoning effort levels (minimal/low/medium/high/xhigh), parallel tool calls, spoken preambles, recovery on failed tasks. Real-time voice + text + image input.
- **Pricing:** $32 per 1M audio-input tokens (cached $0.40), $64 per 1M audio-output tokens, plus $4/$24 text input/output, $5/M image input. The token billing fits MJ's schema cleanly for the text channel; audio rates noted in Comments.
- **Action:** New model entry. AIModelType = TTS (closest fit; we already use this type for "OpenAI TTS" and "Gemini 3.1 Flash TTS"). Record the **text** rates as the canonical price row ($4 input / $24 output per 1M tokens) and document the multi-channel pricing reality in Comments.
- **PowerRank:** 11 (GPT-5-class reasoning surfaced through the audio modality). SpeedRank: 8 (latency-tuned). CostRank: 8 (text rates moderate; audio is much pricier).
- **SupportsEffortLevel:** true (exposes reasoning effort levels).

### 1.3 GPT Image 2 (OpenAI)
- **Release:** 2026-04-21 (API GA early May 2026 for developers; snapshot pinned as `gpt-image-2-2026-04-21`).
- **API name:** `gpt-image-2`.
- **Capabilities:** Generates and edits images at 1K, 2K, and 4K resolution. Accepts up to 16 reference images. Renders multilingual text inside images (Chinese, Japanese, Korean, etc.) with near-perfect accuracy. Claimed #1 on Image Arena leaderboard at launch by a +242 point margin.
- **Pricing:** Token-based ($5/M text in, $8/M image in / $2/M cached, $30/M image out) — but for the per-image catalog we record the medium-quality 1024×1024 representative cost of ~$0.053/image based on OpenAI's calculator, with the token-pricing reality documented in Comments. Batch API 50% discount with 24h latency.
- **Action:** New model entry. AIModelType = Image Generator. Vendor rows for OpenAI (Model Developer + Inference Provider). Cost row at $0.053/image (representative).
- **PowerRank:** 19 (above `GPT 4.o Image 1.5` at 18 — state-of-the-art with 4K, 16-ref images, multilingual). SpeedRank: 7. CostRank: 8.
- **SupportsEffortLevel:** false. The OpenAI API docs explicitly mark this capability as not supported, despite some launch-coverage articles describing "O-series reasoning" capabilities.
- **Naming note:** OpenAI rebranded away from the `GPT 4.o Image X` lineage with this release. New entry uses `GPT Image 2` matching the official `gpt-image-2` API ID and "ChatGPT Images 2.0" branding. Slight inconsistency with the existing `GPT 4.o Image 1.5` / `GPT-4o Image 1.0` entries, but those reflected the prior naming era; forcing "4o" into the new entry would be technically misleading.

### 1.4 GLM 5V Turbo (Z.AI)
- **Release:** 2026-04-01. Z.AI's first native multimodal agent foundation model for vision-based coding.
- **API name:** `glm-5v-turbo` (Z.AI direct, OpenRouter `z-ai/glm-5v-turbo`).
- **Context:** 202,752 input tokens, max output 131,072 tokens.
- **Capabilities:** Vision + video + text input. Use cases: frontend scaffolding from design assets, UI component extraction, screenshot-to-HTML, screen-recording analysis, autonomous GUI operation.
- **Pricing:** $1.20 / $4.00 per 1M tokens.
- **Action:** New model entry. AIModelType = LLM (Z.AI's existing GLM 5/5.1 entries are LLM; the vision capability is captured by modality config separately). Vendor rows for Z.AI (Model Developer + Inference Provider).
- **PowerRank:** 12. SpeedRank: 7. CostRank: 5.
- **SupportsEffortLevel:** false (no documented reasoning-effort knob).

### 1.5 Mistral Medium 3.5 (Mistral AI)
- **Release:** 2026-05-01. Public preview.
- **API name:** `mistral-medium-3.5`.
- **Architecture:** 128B dense, open-weights under modified MIT license.
- **Context:** 256K tokens.
- **Capabilities:** Unified instruction-following, reasoning, and coding. Vision input. Function calling, agents, conversation, structured outputs. Configurable reasoning effort.
- **Pricing:** $1.50 / $7.50 per 1M tokens.
- **Action:** New model entry. Vendor rows for Mistral AI (Model Developer + Inference Provider). Mistral Medium 3.1 already exists in inventory — 3.5 is the new release, not a replacement.
- **PowerRank:** 13. SpeedRank: 7. CostRank: 7.
- **SupportsEffortLevel:** true (the announcement references "configurable reasoning effort").

---

## 2. Pricing Changes

### 2.1 DeepSeek V4 cache-hit input pricing reduced (effective 2026-04-26 12:15 UTC)
DeepSeek announced that the **input cache-hit price** for V4 Pro and V4 Flash has been reduced to **1/10 of the launch price** as of 2026-04-26 12:15 UTC. This is documented on the DeepSeek API pricing page.

Both V4 Pro and V4 Flash are already in inventory from last cycle. **Action:** add a Comments annotation to the existing cost rows for both models noting the cache-hit reduction. The standard input/output rates remain unchanged. The 75%-off launch promo for V4 Pro is still in effect (extended through 2026-05-31 15:59 UTC).

### 2.2 All other vendors checked
Spot-checks against provider docs on 2026-05-13 confirm no changes to:

- **Anthropic:** Opus 4.7 $5/$25; Sonnet 4.6 $3/$15; Haiku 4.5 $1/$5 — unchanged.
- **OpenAI:** GPT-5.5 $5/$30; GPT-5.5 Pro $30/$180; GPT 5.4 $2.50/$15 — unchanged from last cycle.
- **xAI:** Grok 4.3 $1.25/$2.50 — unchanged.
- **Google:** Gemini 3.1 Pro $2/$12; Flash-Lite $0.25/$1.50 — unchanged.
- **MiniMax:** M2.7 $0.30/$1.20; M2.5 $0.15/$1.15 — unchanged.
- **Mistral:** Small 4 $0.15/$0.60; Large 3 unchanged — Medium 3.5 is new (see §1.5).
- **Cohere:** Command R+ $2.50/$10; Command R $0.15/$0.60; Command R7B $0.0375/$0.15 — unchanged.
- **Groq:** Llama 3.1 8B $0.05/$0.08; GPT-OSS 120B $0.15/$0.60; Llama 3.3 70B $0.59/$0.79 — unchanged.
- **Inception:** Mercury 2 — unchanged (no new May 2026 release after Mercury 2's February launch).
- **Black Forest Labs:** FLUX.2 Pro — unchanged.

---

## 3. Updated Models (Metadata Changes)

**None this cycle.** No API-name renames, context-window expansions, or capability updates detected on currently-tracked models.

---

## 4. Deprecated / Sunset Models — flagged for human approval

### 4.1 xAI deprecations effective 2026-05-15 (in 2 days)
xAI announced retirement of five models on 2026-05-15 at 12:00 PT. **All five are in current MJ inventory** and would need `IsActive` flipped to `false` or `Status` updated:

| MJ Inventory Name | xAI API Name | Action |
|---|---|---|
| `Grok 4` | `grok-4` | Mark deprecated/inactive after 2026-05-15 |
| `Grok 4-1 Fast Reasoning` | `grok-4-1-fast` (reasoning variant) | Same |
| `Grok 4-1 Fast Non-Reasoning` | `grok-4-1-fast` (non-reasoning variant) | Same |
| `Grok 4 Fast (Reasoning)` | `grok-4-fast` (reasoning variant) | Same |
| `Grok 4 Fast (Non-Reasoning)` | `grok-4-fast` (non-reasoning variant) | Same |
| `Grok Code Fast 1` | `grok-code-fast-1` | Same |

`grok-imagine-image-pro` was also announced for retirement but is not in current inventory.

xAI's recommendation: Grok 4.3 (already in inventory) is the migration path for general use.

**Recommendation:** Defer the deprecation edit to a follow-up PR closer to 2026-05-15. The model entries should not be deleted — just flipped to `IsActive=false`. Existing agent runs that reference these models by ID continue to function (the records remain), but new agent configurations will not see them in pickers.

### 4.2 No other deprecations this cycle.

---

## 5. Flagged for Human Review (No JSON Changes)

### 5.1 GPT-Realtime-Translate (OpenAI) — minute-billed; schema mismatch
- **Release:** 2026-05-07 alongside GPT Realtime 2.
- **API name:** `gpt-realtime-translate`.
- **Capabilities:** Real-time multilingual speech translation. Billed **by the minute** (rate not enumerated in this cycle's research).
- **Why not added:** MJ's `MJ: AI Model Price Unit Types` table has `Per 1M Tokens` and `Per Image` only. There is no `Per Minute` unit, so this model cannot be modeled accurately without schema work. Adding it with a misleading unit type would create the same "silent fallback" failure mode the broader artifact-routing plan is trying to retire.
- **Recommendation:** Either (a) add a `Per Minute` `PriceUnitType` row to support time-billed audio APIs going forward (small, additive schema change), or (b) defer adding minute-billed models until that schema gap is closed.

### 5.2 GPT-Realtime-Whisper (OpenAI) — same flag as 5.1
- **Release:** 2026-05-07.
- **API name:** `gpt-realtime-whisper`.
- **Capabilities:** Streaming speech-to-text transcription. Billed by the minute.
- **Recommendation:** Same as 5.1.
- **Additional note:** MJ also has no `Speech-to-Text` / `STT` value in `MJ: AI Model Types` today. The existing `TTS` type fits text-to-speech only. Adding `Speech-to-Text` is a separate small additive metadata change worth bundling with the `Per Minute` unit type.

### 5.3 Gemini Omni (Google) — pre-announcement leak
- **Status:** Internal model card leaked via the Gemini app interface on 2026-05-11, one week before Google I/O 2026 (scheduled 2026-05-19/20). Not GA. No public docs.
- **Capabilities (per leaked text):** Video generation model. "Remix your videos, edit directly in chat, try templates."
- **Recommendation:** **Do not add yet.** Wait for the I/O announcement and official documentation. Will be a leading candidate for the next cycle.

### 5.4 Gemma 4 (Google) — April 2026 open-weights model
- **Status:** Released 2026-04-02 per Google announcement. Purpose-built for advanced reasoning and agentic workflows. Open-weights.
- **Why flagged not added:** MJ's catalog historically focuses on hosted/inference-available models. Gemma 4 is open-weights and would need a chosen inference provider (Vertex AI, Together AI, etc.) for a meaningful cost row. Recommend adding next cycle if a decision is made to track open-weights Gemma family.

### 5.5 Qwen 3.6 family carry-over from last cycle
The Qwen 3.6 Plus / 3.6 Max-Preview / 3.6-27B items flagged in the 2026-05-04 report remain undecided. No change this cycle.

---

## 6. New Vendors Worth Considering

- **None this cycle.** All five proposed model adds map to existing vendors (OpenAI, Z.AI, Mistral AI).

---

## 7. Recommended Actions (Prioritized)

| # | Action | Impact | In this PR? |
|---|---|---|---|
| 1 | Add **GPT Image 2** | Catalog gap; user-requested for Betty testing | ✅ |
| 2 | Add **GPT 5.5 Instant** | New default ChatGPT model + API alias | ✅ |
| 3 | Add **GPT Realtime 2** | GPT-5-class voice agent model | ✅ |
| 4 | Add **GLM 5V Turbo** | Z.AI vision-coding model | ✅ |
| 5 | Add **Mistral Medium 3.5** | New mid-tier with vision + reasoning | ✅ |
| 6 | Note DeepSeek V4 cache-hit price reduction | Pricing accuracy | ✅ (Comments-only on existing rows) |
| 7 | Flip xAI retiring models to `IsActive=false` after 2026-05-15 | Catalog hygiene | ⏸ Follow-up PR near deadline |
| 8 | Decide `Per Minute` `PriceUnitType` + `Speech-to-Text` `AIModelType` | Unblocks Translate/Whisper adds | ⏸ Schema decision |
| 9 | Wait for Gemini Omni GA after Google I/O 2026 | Catalog completeness | ⏸ Next cycle |
| 10 | Decide curation policy on Qwen 3.6 family | Catalog completeness | ⏸ Carryover from prior cycle |

---

## 8. Research Sources

**OpenAI (GPT 5.5 Instant, GPT Image 2, GPT Realtime 2, voice models):**
- [GPT 5.5 Instant — OpenAI](https://openai.com/index/gpt-5-5-instant/)
- [OpenAI releases GPT 5.5 Instant — TechCrunch](https://techcrunch.com/2026/05/05/openai-releases-gpt-5-5-instant-a-new-default-model-for-chatgpt/)
- [Introducing ChatGPT Images 2.0 — OpenAI](https://openai.com/index/introducing-chatgpt-images-2-0/)
- [GPT Image 2 Model — OpenAI API](https://developers.openai.com/api/docs/models/gpt-image-2)
- [GPT Image 2 Pricing — Wavespeed Blog](https://wavespeed.ai/blog/posts/gpt-image-2-pricing-2026/)
- [OpenAI launches new voice intelligence features — TechCrunch](https://techcrunch.com/2026/05/07/openai-launches-new-voice-intelligence-features-in-its-api/)
- [GPT Realtime 2 Pricing — LLMReference](https://www.llmreference.com/model/gpt-realtime-2/openai-api)
- [OpenAI Releases Three Realtime Audio Models — MarkTechPost](https://www.marktechpost.com/2026/05/08/openai-releases-three-realtime-audio-models-gpt-realtime-2-gpt-realtime-translate-and-gpt-realtime-whisper-in-the-realtime-api/)

**Z.AI (GLM 5V Turbo):**
- [GLM 5V Turbo — OpenRouter](https://openrouter.ai/z-ai/glm-5v-turbo)
- [GLM-5V-Turbo Benchmarks, Pricing & Context Window — LLM-Stats](https://llm-stats.com/models/glm-5v-turbo)
- [GLM-5V-Turbo: What Developers Should Know in 2026 — Wavespeed Blog](https://wavespeed.ai/blog/posts/glm-5v-turbo-developers-2026/)
- [GLM-5: From Vibe Coding to Agentic Engineering — Z.AI Blog](https://z.ai/blog/glm-5)

**Mistral AI (Mistral Medium 3.5):**
- [Mistral Medium 3.5 article — Progressive Robot](https://www.progressiverobot.com/2026/05/01/mistral-medium-3-5/)
- [Mistral AI API Pricing (May 2026) — AI Pricing Guru](https://www.aipricing.guru/mistral-ai-pricing/)

**DeepSeek (cache-hit pricing update):**
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [DeepSeek V4 Preview Release — DeepSeek API Docs](https://api-docs.deepseek.com/news/news260424)

**xAI (retirements 2026-05-15):**
- [xAI Models — Docs](https://docs.x.ai/developers/models)
- [Grok 4.3 — Lorka AI Specs](https://www.lorka.ai/ai-models/xai)

**Anthropic (no new SKUs):**
- [Anthropic Release Notes May 2026 — Releasebot](https://releasebot.io/updates/anthropic)
- [Claude Updates May 2026 — Releasebot](https://releasebot.io/updates/anthropic/claude)

**Google (Gemini Omni leak, Gemma 4):**
- [Google Gemini Latest Model News May 2026 — Mean CEO Blog](https://blog.mean.ceo/google-gemini-latest-model-news-may-2026/)
- [Gemini API Release Notes](https://ai.google.dev/gemini-api/docs/changelog)

**Other vendors checked (no actionable changes):**
- [Cohere pricing](https://cohere.com/pricing)
- [Groq pricing](https://groq.com/pricing)
- [Cerebras pricing](https://www.cerebras.ai/pricing)
- [Black Forest Labs pricing](https://bfl.ai/pricing)
- [MiniMax pricing](https://platform.minimax.io/docs/pricing/overview)
- [Inception Labs Mercury 2](https://www.inceptionlabs.ai/blog/introducing-mercury-2)
- [LLM Updates — May 2026](https://llm-stats.com/llm-updates)
