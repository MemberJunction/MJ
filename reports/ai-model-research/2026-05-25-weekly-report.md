# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-05-25
**Research Period**: 2026-05-18 through 2026-05-25
**Base Branch**: next
**Branch**: claude/ai-model-research-2026-05-25

## Executive Summary

A quieter week than last (no I/O-class keynotes), but two concrete changes worth shipping to JSON: **(1) DeepSeek made its 75%-off V4-Pro promo permanent on May 22, 2026** — the prior $1.74/$3.48 list pricing recorded last month is now obsolete and replaced by $0.435/$0.87 (still the cheapest credible Opus-tier reasoning model on the market); and **(2) xAI quietly released Grok Build 0.1 on May 14, 2026**, a 256K-context coding-specialized model at $1.00/$2.00, slotting in between Grok Code Fast 1 and Grok 4.3. Anthropic and OpenAI did not release new flagship models this week (Code with Claude 2026 was infrastructure-focused, no model drop; OpenAI's last release remains GPT-5.5 Instant on May 5). Meta announced **Muse Spark** (their post-Llama flagship; April 8 launch) but it has no public API yet — flagging as Tier-2. Cerebras put **Kimi K2.6** in enterprise trial (981 tok/s vs ~36 tok/s on Moonshot direct) but published no public pricing — flagging as Tier-2.

## Current Inventory Snapshot

| Vendor | Models in Inventory (active LLMs unless noted) | Last MJ Update |
|---|---|---|
| OpenAI | 22 (incl. embeddings, image, TTS, realtime) | 2026-05-14 |
| Anthropic | 7 | 2026-05-08 |
| Google | 15 (incl. Gemma, TTS, Nano Banana, Gemini 3.5 Flash) | 2026-05-20 |
| x.ai | 8 → **9** (Grok Build 0.1 added) | 2026-05-25 |
| Mistral AI | 10 (incl. embed) | 2026-04-20 |
| Groq (inference) | ~12 hosted models | 2026-04-20 |
| Alibaba Cloud (Qwen) | 10 (incl. Qwen 3.7 Max) | 2026-05-21 |
| Moonshot AI (Kimi) | 3 | 2026-04-27 |
| DeepSeek | 2 (now with updated permanent pricing on V4-Pro) | **2026-05-25** |
| Z.AI (GLM) | 5 | 2026-04-20 |
| MiniMax | 3 | 2026-04-27 |
| Inception Labs | 2 (Mercury 2 + Mercury Edit 2) | 2026-05-18 |
| Black Forest Labs | 2 | 2026-02-12 |
| Cohere | 6 (Command A + Embed v4 + 4 rerankers) | 2026-05-18 |
| Cerebras / Fireworks / OpenRouter | (multi-model inference providers) | various |

**Total models**: 143 (was 142; +1 Grok Build 0.1).

## New Models Available

### Tier-1 (high confidence — applied to JSON)

| Model | Vendor | API ID | In / Out / Cached / 1M | Context | Notes |
|---|---|---|---|---|---|
| **Grok Build 0.1** | x.ai | `grok-build-0.1` | $1.00 / $2.00 / $0.20 | 256K | **NEW** — Early access May 14, 2026. Purpose-built for agentic coding (multi-step tool use, terminal interaction, self-correction). Text+image input, text output. Function calling + structured outputs + always-on reasoning. Input cost ~2x above 200K-token threshold. No enforced output cap (whole-codebase refactor in one pass). Also live on OpenRouter at passthrough pricing. SuperGrok / X Premium subscribers get it via xAI OpenCode at no separate API cost. |

### Tier-2 (verified but deferred — flagged only)

The following are real and verified, but were not added to the JSON to keep the change-set focused and/or because their API/pricing isn't production-ready:

| Model | Vendor | Status | Rationale for adding later |
|---|---|---|---|
| **Muse Spark** | Meta (Superintelligence Labs) | Launched April 8, 2026 in Meta AI app + meta.ai web; **no public API yet**, private API preview to select users only. Matches frontier models at ~10× less compute. Natively multimodal (text/image/audio in, text out). Closed-source for now; open-source variant promised later. | Add when public API + pricing announced. Major because Meta has pivoted away from the Llama brand entirely. |
| **Kimi K2.6 on Cerebras** | Cerebras (hosting Moonshot's K2.6) | Enterprise trial only; 981 tok/s (6.7× faster than next GPU cloud, 29× faster than Moonshot direct). Cerebras publishes no public per-token pricing for K2.6 yet. | Add as a 3rd vendor row on the existing "Kimi K2.6" entry once Cerebras publishes pricing or it goes GA. |
| **Qwen 3.7 Plus** (multimodal/vision variant of 3.7 Max) | Alibaba Cloud | Preview-only as of May 20, 2026. Production API and final pricing pending. | Add when production API + pricing post on Alibaba Cloud Model Studio. |
| All deferred items from 2026-05-18 report | various | Still applicable | See "Recommended Actions" §2 below. |

## Pricing Changes Detected

| Model | Vendor | Previous Price (In / Out) | New Price (In / Out) | Effective Date | Action Taken |
|---|---|---|---|---|---|
| **DeepSeek V4 Pro** | DeepSeek | $1.74 / $3.48 (list, with separate 75% promo through May 31) | **$0.435 / $0.87** | **2026-05-22** | ✅ **Added new cost record** dated 2026-05-22 alongside the prior launch-pricing row. Cache-hit input becomes ~$0.003625/1M. Updated model `Description` to reflect that the promo is now the permanent list price. Sources: Engadget, AndroidHeadlines, Yahoo/Reuters, api-docs.deepseek.com. |

No other vendor changed published pricing between 2026-05-18 and 2026-05-25.

## Model Updates & New Versions

- **Anthropic** — No new flagship release this week. Code with Claude 2026 (May 18-19) was infrastructure-only: MCP tunnels, self-hosted sandboxes for Claude Managed Agents (public beta), Stainless acquisition announced. Andrej Karpathy joined Anthropic on May 19. Claude Opus 4.7 (Apr 16) remains the frontier. Pricing unchanged: Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15, Opus 4.7 $5/$25.
- **OpenAI** — No new model since GPT-5.5 Instant (May 5, 2026). "GPT-5.6" is leak chatter only; no API, no benchmarks, no date. Sora was permanently discontinued March 24 (web shut Apr 26, API shuts Sep 24). DALL·E 2/3 were removed from the API on May 12, 2026 — replaced by the GPT Image family already in MJ inventory.
- **xAI** — Grok Build 0.1 (May 14) is the only new entry. Grok 4.3 unchanged at $1.25/$2.50 since April 30 launch; Grok 4.20 unchanged at $2/$6 with 2M context; Grok Code Fast 1 unchanged at $0.20/$1.50. The Aug 15, 2026 retirement of Grok Code Fast 1 (announced earlier) still stands — Grok Build 0.1 is positioned to displace it.
- **Google** — No new model since Gemini 3.5 Flash (May 19). All preview prices unchanged. The `gemini-3.1-flash-lite-preview` shutdown is **today** (May 25, 2026) but MJ already swapped the APIName to the GA `gemini-3.1-flash-lite` in last week's PR.
- **DeepSeek** — 75% V4-Pro promo became permanent on May 22 (logged in Pricing Changes above). V4 Flash pricing unchanged at $0.14/$0.28.
- **Moonshot AI** — Kimi K2.6 unchanged. Kimi K3 referenced in leaks (targeting 3-4T parameters) but no release. K2.6 Code Preview is open to all users; formal GA window referenced but no date.
- **Inception Labs** — Mercury Edit 2 (May 12, $0.25/$0.75) already in inventory from last week. No new releases.
- **Mistral AI** — No new releases this week. Voxtral Mini TTS (Apr 19, 2026) still flagged Tier-2 pending a new price-unit type for per-character pricing.
- **Cerebras** — Hosting K2.6 in enterprise trial (no public pricing). No new GA model.
- **Cohere** — No new releases. Rerank 4 Pro/Fast (released Dec 16, 2025 per Cohere; Apr 6, 2026 per OpenRouter listing) are already in MJ's `.cohere-reranker-models.json`.

## Deprecated / Sunset Models

### Already retired / shut down (no new actions needed)

| Model | Retirement Date | Notes |
|---|---|---|
| OpenAI DALL·E 2 and DALL·E 3 | **May 12, 2026** | Removed from API. Not in MJ inventory (MJ has GPT Image family). |
| `gemini-3.1-flash-lite-preview` | **May 25, 2026 (today)** | Already pre-empted last week by switching MJ's APIName to GA `gemini-3.1-flash-lite`. |
| OpenAI Sora 2 web app | April 26, 2026 | Sora API shuts down September 24, 2026. Not in MJ inventory. |

### Scheduled for retirement (carried forward — re-flag, no new dates announced)

| Model | Retirement Date | Notes |
|---|---|---|
| Grok Code Fast 1 | Aug 15, 2026 | xAI; redirects to grok-4.3. Now also being displaced by Grok Build 0.1 for coding workloads. |
| Claude Opus 4 / Sonnet 4 | Jun 15, 2026 | Anthropic — neither in MJ inventory (we're already on 4.5/4.6/4.7). |
| Gemini 2.5 Pro / Flash | Jun 17, 2026 | Google — both still in MJ inventory; recommend marking deprecating in next sync. |
| Gemini 2.0 Flash / Flash-Lite | Jun 1, 2026 | Google — Gemini 2.0 Flash is in MJ inventory; recommend marking deprecating. |
| Llama 3.1 8B on Cerebras | May 27, 2026 (2 days) | Already flagged last week. |
| Qwen 3 235B Instruct on Cerebras | May 27, 2026 (2 days) | Already flagged last week. |
| DeepSeek `deepseek-chat` / `deepseek-reasoner` aliases | Jul 24, 2026 | DeepSeek alias retirement. |
| Kimi K2 (original) on Moonshot | **May 25, 2026 (today!)** | Last-call alert. Direct-vendor Moonshot row of `Kimi K2` should be marked deprecated. Groq's Kimi K2 was already marked deprecated last week. |
| OpenAI Assistants API | Aug 26, 2026 | Replaced by Responses API. |
| OpenAI Videos API / Sora 2 snapshots | Sep 24, 2026 | — |

## New Vendors Worth Considering

No new vendor activity this week beyond what was flagged last week (NVIDIA NIM, DeepInfra, Together AI, SambaNova, Microsoft Foundry). No action taken.

## Recommended Actions (Prioritized)

1. **MERGE THIS PR** — Adds Grok Build 0.1 (Tier-1 new model) and the DeepSeek V4 Pro permanent-price cost record.
2. **Next sync — process the Tier-2 backlog from 2026-05-18** — Phi-4 family, Amazon Nova family, FLUX.2 [max/flex/klein] + FLUX.1 Kontext, Voxtral TTS, Gemma 4 E2B/E4B, Imagen 5, Veo 4, MiniMax Speech/Music/Hailuo. Still real, still waiting for a focused PR.
3. **Mark Kimi K2 (original) on Moonshot AI vendor as `Status=Deprecated`** — retirement date is today (May 25, 2026). One-line edit, didn't include in this PR.
4. **Mark Gemini 2.0 Flash for deprecation in MJ** — Jun 1, 2026 retirement, 7 days out.
5. **Mark Gemini 2.5 Pro / Flash for deprecation in MJ** — Jun 17, 2026 retirement (23 days out).
6. **Mark Llama 3.1 8B + Qwen 3 235B Instruct on Cerebras vendor as `Status=Deprecated`** — May 27, 2026 retirement (2 days out). Already flagged last week, not yet executed.
7. **Watch list for next week**:
   - Meta Muse Spark public API release.
   - Cerebras Kimi K2.6 GA pricing.
   - Qwen 3.7 Plus production pricing.
   - Any successor to Claude Opus 4.7 (last major release Apr 16, 2026; cadence suggests a refresh window opens late May / early June).
8. **Consider** — Investigate whether `MJ: AI Model Price Unit Types` has (or needs) a per-character or per-minute audio type. Voxtral / Voxtral Mini TTS, GPT-Realtime-Translate, GPT-Realtime-Whisper, Hailuo, Veo all use unit types that don't map cleanly to `Per 1M Tokens`. This is the blocker for adding several Tier-2 audio/video models.

## Research Sources

### Anthropic
- [Anthropic Claude API Pricing — Suprmind](https://suprmind.ai/hub/claude/pricing/)
- [Claude Pricing — mem0.ai (May 2026)](https://mem0.ai/blog/anthropic-claude-pricing)
- [Anthropic Release Notes — Releasebot (May 2026)](https://releasebot.io/updates/anthropic)
- [Why Did Anthropic Skip a New Model at Code with Claude 2026? — Pravin Kumar](https://www.pravinkumar.co/blog/code-with-claude-2026-no-new-model)
- [Anthropic enhances Claude Managed Agents with two new privacy and security features — 9to5Mac](https://9to5mac.com/2026/05/19/anthropic-enhances-claude-managed-agents-with-two-new-privacy-and-security-features/)

### OpenAI
- [OpenAI Release Notes — Releasebot (May 2026)](https://releasebot.io/updates/openai)
- [GPT-5.5 Instant — OpenAI](https://openai.com/index/gpt-5-5-instant/)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [OpenAI API Pricing 2026: GPT-5.5 Cost Breakdown — Rogue Marketing](https://the-rogue-marketing.github.io/openai-api-pricing-may-2026/)
- [OpenAI Image Pricing Calculator — InvertedStone](https://invertedstone.com/calculators/dall-e-pricing)

### Google
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3.5 Flash launch — TokenMix](https://tokenmix.ai/blog/gemini-3-5-pro-release-date-google-io-2026)
- [Gemini 3.5 Flash on Vertex AI — Lushbinary](https://lushbinary.com/blog/deploy-gemini-3-5-flash-vertex-ai-production-guide/)
- [Google Cloud Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)

### x.ai (Grok)
- [Grok Build 0.1 — xAI Docs](https://docs.x.ai/developers/models/grok-build-0.1)
- [Grok Build 0.1 — OpenRouter](https://openrouter.ai/x-ai/grok-build-0.1)
- [The Quiet Arrival of Grok Build 0.1 — Kilo.ai blog](https://blog.kilo.ai/p/the-quiet-arrival-of-grok-build-01)
- [xAI Launches grok-build-0.1 for Agentic Coding with a 256k Context Window — KuCoin](https://www.kucoin.com/news/flash/xai-launches-grok-build-0-1-for-agentic-coding-with-256k-context-window)
- [5 xAI Grok Updates You May Have Missed This May — Basenor](https://www.basenor.com/blogs/news/5-xai-grok-updates-you-may-have-missed-this-may)
- [Grok API Pricing — mem0.ai (May 2026)](https://mem0.ai/blog/xai-grok-api-pricing)
- [xAI launches Grok 4.3 — Artificial Analysis](https://artificialanalysis.ai/articles/xai-launches-grok-4-3-with-improved-agentic-performance-and-lower-pricing)

### DeepSeek
- [DeepSeek permanently reduces V4 price by 75% — Engadget](https://www.engadget.com/2180062/deepseek-permanently-reduces-the-price-of-its-flagship-v4-model-by-75-percent/)
- [DeepSeek Makes Big 75% Price Cut Permanent — AndroidHeadlines](https://www.androidheadlines.com/2026/05/deepseek-v4-pro-api-price-cut-permanent-ai-rate-limits.html)
- [DeepSeek to make permanent 75% price cut on V4-Pro — Yahoo/Reuters](https://finance.yahoo.com/sectors/technology/articles/chinas-deepseek-permanent-75-price-133313757.html)
- [DeepSeek V4-Pro 75% Permanent Cut — TokenMix](https://tokenmix.ai/blog/deepseek-v4-pro-api-pricing-permanent-cut)
- [DeepSeek API Docs Pricing](https://api-docs.deepseek.com/quick_start/pricing)

### Meta
- [Meta is back in the LLM game after a year-long break — Understanding AI](https://www.understandingai.org/p/meta-is-back-in-the-llm-game-after)
- [Introducing Muse Spark — Meta AI](https://ai.meta.com/blog/introducing-muse-spark-msl/)
- [Meta's New Muse Spark Changes Frontier AI Pricing — Kursol](https://www.kursol.io/blog/ai-breaking-news-2026-04-09-meta-muse-spark)
- [Is There a Muse Spark API? — WaveSpeed](https://wavespeed.ai/blog/posts/is-there-muse-spark-api-2026/)

### Moonshot AI / Cerebras
- [Cerebras Brings Kimi K2.6 Inference to Enterprises](https://www.cerebras.ai/blog/cerebras-kimi-k2-Enterprise)
- [Cerebras achieves record speeds serving K2.6 — CryptoBriefing](https://cryptobriefing.com/cerebras-record-speed-trillion-parameter-kimi-k2/)
- [Cerebras Free Tier 2026 — Price Per Token](https://pricepertoken.com/endpoints/cerebras/free)
- [Kimi K2.6 API Pricing — Price Per Token](https://pricepertoken.com/pricing-page/model/moonshotai-kimi-k2.6)

### Alibaba / Qwen
- [Qwen3.7-Max — OpenRouter](https://openrouter.ai/qwen/qwen3.7-max)
- [Qwen3.7-Max Review — felloai](https://felloai.com/qwen-3-7-max-review/)
- [Qwen 3.7 Deep Dive: Max vs Plus — atalupadhyay](https://atalupadhyay.wordpress.com/2026/05/19/qwen-3-7-deep-dive-honest-review-hands-on-testing-and-when-to-use-max-vs-plus/)

### Mistral
- [Mistral AI Models 2026 Guide — Serenities AI](https://serenitiesai.com/articles/mistral-ai-models-2026-complete-guide)
- [Voxtral Mini TTS — OpenRouter](https://openrouter.ai/mistralai/voxtral-mini-tts-2603)
- [Speaking of Voxtral — Mistral AI](https://mistral.ai/news/voxtral-tts)

### Black Forest Labs
- [FLUX.2 Pro — OpenRouter](https://openrouter.ai/black-forest-labs/flux.2-pro)
- [FLUX.2 Max Effective Pricing — OpenRouter](https://openrouter.ai/black-forest-labs/flux.2-max/pricing)

### Cohere
- [Rerank 4 Pro — OpenRouter](https://openrouter.ai/cohere/rerank-4-pro)
- [Cohere API Pricing — AI Pricing Guru](https://www.aipricing.guru/cohere-pricing/)
