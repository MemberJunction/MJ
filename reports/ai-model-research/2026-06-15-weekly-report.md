# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-06-15
**Research Period**: 2026-06-08 through 2026-06-15
**Base Branch**: next
**Branch**: claude/ai-model-research-2026-06-15

## Executive Summary

The week's headline event is **today's scheduled retirement of Claude Opus 4 and Claude Sonnet 4** (`-20250514` snapshots) — those vendor entries are flipped to `Status=Deprecated` in this PR. The most material **new** release was **Moonshot's Kimi K2.7-Code** (2026-06-12) — a coding-specialist successor to K2.6 reporting a +21.8 pp gain on Kimi Code Bench v2 at $0.95/$4.00 per 1M; **added to the inventory in this PR**. Two other Anthropic launches — **Claude Fable 5** (2026-06-09 GA at $10/$50) and **Claude Mythos 5** (limited-availability) — are flagged but **NOT** added because of a 2026-06-12 export-control suspension report that has not yet been authoritatively resolved. **Mistral's June 30 retirement tranche** is now ten days out, so deprecation notes were added to the three affected MJ entries (`Mistral Medium 3.1`, `Mistral Small 3.2`, `Devstral 2`); same for **Nano Banana Pro** (`gemini-3-pro-image-preview` shuts down 2026-06-25). Two anticipated launches did NOT ship in-window: **Gemini 3.5 Pro** (still limited Vertex preview) and **xAI Grok V9-Medium** (training complete, no public release yet). **NVIDIA Nemotron 3 Ultra** released 2026-06-04 at $0.50/$2.50, but the NVIDIA NIM vendor is still missing from MJ — flagged for the fourth cycle running. JSON edits in this PR: 1 new model (Kimi K2.7-Code), 2 vendor-status flips (Claude 4 Sonnet + Claude 4 Opus Anthropic Inference entries → Deprecated), and 4 deprecation-notice description updates (Mistral Medium 3.1, Mistral Small 3.2, Devstral 2, Nano Banana Pro).

## Current Inventory Snapshot

| Vendor                | Models in Inventory (active LLMs unless noted) | Last MJ Update         |
| --------------------- | ----------------------------------------------- | ---------------------- |
| OpenAI                | 22+ (incl. embeddings, image, TTS, realtime)    | 2026-05-14             |
| Anthropic             | 8 (Claude 4 Sonnet + Opus snapshots flipped this PR) | 2026-06-15        |
| Google                | 15 (Nano Banana Pro deprecation note this PR)   | 2026-06-15             |
| x.ai                  | 9 (Grok Build 0.1 latest)                       | 2026-05-29             |
| Mistral AI            | 10 (3 deprecation notes added this PR)          | 2026-06-15             |
| Groq (inference)      | ~12 hosted models                               | 2026-04-20             |
| Alibaba Cloud (Qwen)  | 11                                              | 2026-06-08             |
| Moonshot AI (Kimi)    | 4 (Kimi K2.7-Code added this PR)                | 2026-06-15             |
| DeepSeek              | 2 (+ 1 distilled on Groq)                       | 2026-05-23             |
| Z.AI (GLM)            | 5                                               | 2026-04-20             |
| MiniMax               | 4                                               | 2026-06-05             |
| Inception Labs        | 2                                               | 2026-05-18             |
| Black Forest Labs     | 2                                               | 2026-02-12             |
| Cohere                | 4 rerankers + Command A + Command A+ + Embed v4 | 2026-05-20             |

## New Models Available

### Tier-1 (high confidence — applied to JSON in this PR)

| Model              | Vendor       | API ID            | In / Out / 1M       | Cached In | Context  | Release    | Notes                                                                |
| ------------------ | ------------ | ----------------- | ------------------- | --------- | -------- | ---------- | -------------------------------------------------------------------- |
| **Kimi K2.7-Code** | Moonshot AI  | `kimi-k2.7-code`  | $0.95 / $4.00       | $0.19     | 262,144  | 2026-06-12 | Coding-specialist successor to K2.6. 1T MoE / 32B active. +21.8 pp on Kimi Code Bench v2 vs K2.6. Open-weight (Modified MIT). OpenRouter sells the same route at $0.75/$3.50. Sources: [MarkTechPost](https://www.marktechpost.com/2026/06/12/moonshot-ai-releases-kimi-k2-7-code-a-coding-model-reporting-21-8-on-kimi-code-bench-v2-over-k2-6/), [Codersera](https://codersera.com/blog/kimi-k2-7-complete-guide-2026/) |

### Tier-2 (verified but deferred — flag only)

| Model                              | Vendor                | Pricing                      | Rationale for deferring                                                                                                                                                                                       |
| ---------------------------------- | --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Fable 5**                 | Anthropic             | $10 / $50 per 1M (cached $1) | Released 2026-06-09 as the next Mythos-class GA flagship (1M context, 128K output, hardened safety classifiers). However, on 2026-06-12 third-party sources (OutlierKit, news) reported Anthropic **suspended access** to Fable 5 + Mythos 5 under a US government export-control directive. InfoQ reported "re-released" within hours but availability remains unclear. The Anthropic pricing page still lists it. **Hold for next cycle** once the access situation stabilizes. Sources: [Anthropic news](https://www.anthropic.com/news/claude-fable-5-mythos-5), [InfoQ](https://www.infoq.com/news/2026/06/claude-5-release/), [OutlierKit](https://outlierkit.com/resources/claude-fable-5-discontinued/) |
| **Claude Mythos 5**                | Anthropic             | $10 / $50                    | Released alongside Fable 5 but **limited availability** (Project Glasswing — US gov cyber + select biomed). Not GA. Same suspension uncertainty as Fable 5. **Not catalog-eligible** until GA. |
| **Cohere North Mini Code 1.0**     | Cohere                | Free / Apache 2.0            | Released 2026-06-09. 30B MoE / 3B active, agentic coding, no per-token API price (free + open weights). MJ doesn't typically catalog free open-weight models without a paid host route — defer. Source: [Artificial Analysis](https://artificialanalysis.ai/models/north-mini-code) |
| **NVIDIA Nemotron 3 Ultra**        | NVIDIA NIM            | $0.50 / $2.50                | Released 2026-06-04 (550B / 55B active). NIM vendor entry still missing from MJ — same blocker as the past three cycles. Recommend a focused mini-PR to add NIM + 4 Nemotron 3 models (Nano, Super, Nano Omni, Ultra). DeepInfra pre-release at $0.37 / $1.08. Sources: [OpenRouter Nemotron 3 Ultra](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b), [build.nvidia.com](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b) |
| **Microsoft MAI family**           | Microsoft Foundry     | TBD                          | Announced Build 2026 (June 2): MAI-Thinking-1, MAI-Code-1-Flash, MAI-Voice-1, MAI-Image-2 updates, plus **MAI-Transcribe-1** (STT, 25 langs, June 9). Distributed via Fireworks and Microsoft Foundry. **No public per-token pricing** for any of them. Sources: [microsoft.ai/news](https://microsoft.ai/news/today-were-announcing-3-new-world-class-mai-models-available-in-foundry/) |
| **Z.AI GLM-5.2**                   | Z.AI                  | Subscription-only currently  | Released 2026-06-13: 744B MoE, 1M context, 131K max output. **Currently only via paid Coding Plan subscription** (Lite/Pro/Max/Team) — per-token API pricing and open weights promised "next week" (June 15-22). Hold until per-token rate publishes. Sources: [Codersera](https://codersera.com/blog/glm-5-2-release-1m-context-coding-2026/), [aitoolly](https://aitoolly.com/ai-news/article/2026-06-14-zhipu-ai-releases-glm-52-a-fully-open-source-frontier-model-featuring-a-1m-context-window) |
| **Google DiffusionGemma**          | Google DeepMind       | Self-host only               | Released 2026-06-10: 26B MoE / ~3.8B active, 256K context, Apache 2.0, multimodal, 140+ langs. Open weights, no per-token API. **Not catalog-eligible** without a hosted route. Source: [NVIDIA blog](https://blogs.nvidia.com/blog/rtx-ai-garage-local-gemma-diffusion/) |
| **Cohere Command A+ (open weights)**| Cohere               | Sales-contact only           | Open-weights launch claimed 2026-06-12 (~2× faster than Command A). **No public per-token API price** — sales contact only. MJ already has a "Cohere Command A+" entry from a prior cycle; no new public pricing to record. Source: [Artificial Analysis](https://artificialanalysis.ai/articles/cohere-launches-open-weights-model-command-a) |
| **Cohere Rerank 4 Fast**           | Cohere                | ~$2.00 / 1M (snippet only)   | Rerank 4 now ships in two variants — Pro (1627 ELO) and **Fast** (~$2.00/M, 1506 ELO, 32K ctx). MJ's `.cohere-reranker-models.json` only has the original Rerank 4. Could be added but pricing needs a primary-source confirmation. Source: [devx.com](https://devx.com/daily-news/cohere-launches-rerank-4-for-enterprises) |
| **Grok V9-Medium**                 | x.ai                  | TBD                          | Training complete 2026-05-25 (1.5T params); release still targeted "mid-June 2026". Did NOT ship 2026-06-08 → 06-15. Watch for next cycle. Source: [TechTimes](https://www.techtimes.com/articles/317328/20260528/grok-ai-new-model-triples-parameter-count-targets-coding-lead-release-expected-mid-june.htm) |
| **Gemini 3.5 Pro**                 | Google                | TBD                          | Still limited Vertex preview; broad GA expected later June. No public API ID, model card, or pricing. Source: [TechTimes 2026-06-06](https://www.techtimes.com/articles/317919/20260606/google-gemini-35-pro-nears-june-launch-2-million-token-context-deep-think-reasoning.htm) |
| **Gemini Omni Flash (developer API)** | Google             | TBD                          | Live in Gemini app / Flow / YouTube Shorts. Developer API still "coming weeks". Source: [WaveSpeed](https://wavespeed.ai/blog/posts/gemini-omni-flash-shipped-what-actually-launched/) |
| **TML-Interaction-Small**          | Thinking Machines Lab | research preview             | Mira Murati previewed at Bloomberg Tech 2026-06-04. Research preview only since mid-May 2026. No public API or pricing. Source: [Semafor](https://www.semafor.com/article/05/13/2026/mira-muratis-thinking-machines-previews-interaction-models) |
| **Subquadratic (SubQ)**            | Subquadratic Inc      | waitlist only                | No public API; no per-token rate card yet. $29M seed (May 5). Still waitlist gated. |
| **Apple Foundation Models v2**     | Apple                 | on-device, free              | WWDC26 (June 8). On-device only; no API surface. Not catalog-eligible. Source: [Apple Dev session 241](https://developer.apple.com/videos/play/wwdc2026/241/) |
| **Varya (Avataar.ai)**             | Avataar / IndiaAI     | $0.005/sec                   | Text-to-video, 14B params, distilled. MJ does not catalog video-gen models in `.ai-models.json`; defer. Source: [TechCrunch](https://techcrunch.com/2026/06/11/cheaper-faster-and-culturally-aware-avataars-video-ai-is-built-for-indias-scale/) |
| **GPT-Realtime-Translate / Whisper**| OpenAI               | $0.034/min / $0.017/min      | Per-minute audio billing — still blocked on `MJ: AI Model Price Unit Types` supporting per-minute audio. Source: [TokenCost](https://tokencost.app/blog/openai-gpt-realtime-2-voice-pricing) |
| **Llama Guard 4 12B**              | Meta / DeepInfra      | $0.18 / $0.18                | Safety classifier — same model-type schema question from prior cycles. DeepInfra and OpenRouter confirmed. Source: [OpenRouter Llama Guard 4](https://openrouter.ai/meta-llama/llama-guard-4-12b) |

## Pricing Changes Detected

| Model                     | Vendor          | Previous Price (In / Out) | Current Price (In / Out)         | Action                                |
| ------------------------- | --------------- | ------------------------- | -------------------------------- | ------------------------------------- |
| _(none in-window with high confidence)_ | — | — | — | All inventory pricing verified unchanged this cycle. |

### Notable third-party-tracker discrepancies (flagged, NOT edited)

| Model                | Inventory price (In / Out) | Conflicting tracker price (In / Out) | Notes                                                                                                                                                                                              |
| -------------------- | -------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mistral Large 3**  | $0.50 / $1.50              | $2 / $6 (TokenMix, CloudZero, PricePerToken) | Last cycle confirmed $0.50/$1.50 from a primary source. This cycle's secondary trackers show $2/$6 — likely conflating with Mistral Large 2 (retired June 30). **No change** — last-cycle primary source still authoritative. Re-verify next cycle. |
| **Qwen 3.7 Plus**    | $0.40 / $1.16              | $1.60 (VentureBeat), $1.28 (OpenRouter) | Discrepancy across three sources — official Qwen post said $0.40/$1.16, VentureBeat reported $0.40/$1.60, OpenRouter shows $0.40/$1.28. **No change** — keep the official quote until disambiguated. |
| **Kimi K2.6**        | $0.60 / $2.50 (Moonshot launch) | $0.95 / $4.00 (current aggregators) | Inventory comment already flags this. The K2.7-Code launch at $0.95/$4.00 confirms the family-wide repricing. **Recommend adding a new cost record** with `StartedAt` = the repricing date next cycle once that date is verified. |
| **Nemotron 3 Super** | (not in MJ)                | $0.10/$0.50 vs $0.09/$0.45           | Vendor pricing varies by reseller; pair with NIM-vendor add next cycle. |

### Resolutions of prior open items

| Item                                  | Prior Status (2026-06-08)                                              | Status now                                                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Opus 4 / Sonnet 4 retirement (2026-06-15)** | 7 days out, replacements set in prior PR.            | **TODAY.** Both Anthropic Inference Provider vendor entries flipped to `Status=Deprecated` in this PR.                                                                                       |
| **Mistral June 30 retirement specifics** | Date confirmed, specific model IDs to verify.                        | **VERIFIED**: Mistral Medium 3.1, Mistral Small 3.2, Devstral 2 (all in MJ inventory) are on the list. Description-level deprecation notices applied this PR. IsActive left `true` (still callable through 2026-06-30). |
| **Vertex Imagen GA shutdown (2026-06-24)** | Heads-up.                                                          | **CONFIRMED** — all `imagen-*` endpoints shut down 2026-06-24; migration target `gemini-2.5-flash-image`. MJ has no `imagen-*` catalog entries, so no direct edit needed. Source: [igly.ai](https://igly.ai/blog/google-imagen-shutdown-migration-guide-2026)              |
| **`gemini-3-pro-image-preview` shutdown (2026-06-25)** | Not previously flagged.                                          | **NEW THIS WEEK.** MJ's "Nano Banana Pro" is the affected entry. Description updated with the 2026-06-25 retirement note in this PR. Source: [ai.google.dev/deprecations](https://ai.google.dev/gemini-api/docs/deprecations) |
| **Gemini 3.5 Pro GA**                 | Imminent.                                                              | **STILL preview-only.** No GA in window.                                                                                                                                                       |
| **Grok V9-Medium ship date**          | Training complete; mid-June targeted.                                  | **STILL no public release** by 2026-06-15.                                                                                                                                                     |
| **NVIDIA NIM vendor add**             | Highest priority for next cycle.                                       | **STILL not added.** Nemotron 3 Ultra now released (2026-06-04) at $0.50/$2.50, making the catalog of NIM-eligible Nemotrons four models. Fourth cycle flagged with no progress.              |
| **Fireworks DeepSeek V4 Pro price**   | Recommended add but verify cut propagation.                            | **CONFIRMED**: Fireworks DeepSeek V4 Pro is STILL at $1.74/$3.48 — the May-22 DeepSeek-direct cut to $0.435/$0.87 did **NOT** propagate to Fireworks. So a Fireworks vendor entry is fine if added at the higher rate, but recommend annotating that DeepSeek-direct is materially cheaper. Source: [pricepertoken DeepSeek V4 Pro](https://pricepertoken.com/pricing-page/model/deepseek-deepseek-v4-pro) |
| **Cerebras Llama 3.1 8B / Qwen 3 235B retirements** | Verify before flipping.                                  | **CONFIRMED** retired 2026-05-27 per Cerebras deprecation docs. MJ's `Llama 3.1 8b` entry on Cerebras vendor still shows `Status=Active`. **Will apply in next cycle** — held this PR to keep this PR scoped to Anthropic and Mistral. Source: [pydantic genai-prices YAML](https://github.com/pydantic/genai-prices/blob/main/prices/providers/cerebras.yml) |
| **Microsoft Foundry Opus 4.8 routing** | Recommended add.                                                      | **PARTIALLY CONFIRMED** — Claude Opus 4.8 IS in Microsoft Foundry (`claude-opus-4-8`, $5/$25, 200K ctx), but as a "Foundry catalog" entry, not an Azure OpenAI Service endpoint as last week's framing suggested. MJ Claude Opus 4.8 entry already has Anthropic + Amazon Bedrock vendors — adding a Microsoft Foundry vendor entry would need a Microsoft Foundry vendor record (does MJ have one? — "Azure" vendor exists, but Foundry is its own catalog). Hold pending clarification on whether to use the existing "Azure" vendor or add a "Microsoft Foundry" vendor. Source: [Coursiv](https://coursiv.io/blog/claude-opus-4-8) |
| **GPT-Realtime per-minute unit type** | Still blocked.                                                         | No movement on schema decision. Same blocker. |

## Model Updates & New Versions

- **TODAY — Claude Opus 4 + Claude Sonnet 4 retirement (2026-06-15).** Both Anthropic Inference Provider vendor entries flipped to `Status=Deprecated` this PR. The Model Developer entries are kept `Status=Active` (the lineage exists; the API is the thing being retired). Replacement guidance was set in a prior cycle: `claude-opus-4-8` and `claude-sonnet-4-6`. Source: [Anthropic deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- **Claude Fable 5 + Mythos 5 launch (2026-06-09).** Anthropic shipped the next Mythos-class flagship line. Fable 5 ($10/$50) is GA; Mythos 5 is Project Glasswing only. **Then on 2026-06-12, third-party reporting indicates Anthropic suspended access to both** under a US government export-control directive; InfoQ reports re-release shortly after. As of 2026-06-15 the Anthropic pricing page still lists both with no suspension banner, but availability is unconfirmed. **Not added to MJ this cycle** until the situation stabilizes. Sources: [VentureBeat](https://venturebeat.com/technology/anthropic-brings-mythos-to-the-masses-with-claude-fable-5-its-most-powerful-generally-available-model-ever), [InfoQ](https://www.infoq.com/news/2026/06/claude-5-release/), [OutlierKit](https://outlierkit.com/resources/claude-fable-5-discontinued/)
- **Bedrock added Claude Fable 5 on 2026-06-09** — `anthropic.claude-fable-5` / `us.anthropic.claude-fable-5`, $10/$50. Subject to the same suspension caveat.
- **NEW — Moonshot Kimi K2.7-Code (2026-06-12).** Coding-specialist successor to K2.6, +21.8 pp on Kimi Code Bench v2. Same family architecture (1T MoE / 32B active, 256K ctx, Modified MIT). **Added to MJ inventory this PR** at $0.95/$4.00 Moonshot direct (with note that OpenRouter passes through at $0.75/$3.50). Source: [MarkTechPost](https://www.marktechpost.com/2026/06/12/moonshot-ai-releases-kimi-k2-7-code-a-coding-model-reporting-21-8-on-kimi-code-bench-v2-over-k2-6/)
- **Microsoft MAI family launch (Build 2026, 2026-06-02).** MAI-Thinking-1, MAI-Code-1-Flash, MAI-Voice-1, MAI-Image-2 (update), and MAI-Transcribe-1 (June 9 STT). Distributed via Fireworks + Microsoft Foundry. **No public per-token pricing yet.** Source: [microsoft.ai/news](https://microsoft.ai/news/today-were-announcing-3-new-world-class-mai-models-available-in-foundry/)
- **Google DiffusionGemma (2026-06-10).** 26B MoE / 3.8B active, multimodal, open weights only. Source: [NVIDIA blog](https://blogs.nvidia.com/blog/rtx-ai-garage-local-gemma-diffusion/)
- **Cohere North Mini Code 1.0 (2026-06-09).** 30B MoE / 3B active, agentic coding, Apache 2.0, free. Source: [Artificial Analysis](https://artificialanalysis.ai/models/north-mini-code)
- **xAI Grok 4 retirement migration window** is still in effect — 8 retired slugs auto-redirect to `grok-4.3`; final removal **2026-08-15**. Already inactive in MJ.
- **OpenAI GPT-5.2 retired from ChatGPT on 2026-06-12.** ChatGPT consumer only, not relevant to MJ catalog (no `gpt-5.2` API entry). Source: [TechTimes 2026-06-13](https://www.techtimes.com/articles/318345/20260613/openai-retires-gpt-52-moves-everyone-gpt-55-what-changes-chatgpt-users-developers.htm)
- **`gemini-3-pro-image-preview` and `gemini-3.1-flash-image-preview` shut down 2026-06-25.** MJ has the former as "Nano Banana Pro" — description updated with the retirement note this PR. The flash-image-preview is not in MJ inventory. Source: [ai.google.dev/deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
- **Gemini CLI / Code Assist deprecated 2026-06-18.** Not a model issue (tooling/CLI). Source: [KuCoin](https://www.kucoin.com/news/flash/google-to-deprecate-old-gemini-cli-by-june-18-2026-pushes-antigravity-cli)
- **Qwen 3.7 Max promo extension.** 50% promo ($1.25/$3.75) now ends 2026-06-22 (vs the standard $2.50/$7.50). No JSON change — MJ inventory comment already notes the promo. Source: [QwenCloud promo](https://www.qwencloud.com/promo/discount-qwen)

## Deprecated / Sunset Models

### Vendor-status flips applied in this PR

| Model              | Vendor (entry)                | Old Status | New Status   | Reason                                                                                                                                                                       |
| ------------------ | ----------------------------- | ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude 4 Sonnet** | Anthropic (Inference Provider, `claude-sonnet-4-20250514`) | Active     | **Deprecated** | Anthropic's scheduled retirement date is today, 2026-06-15. Source: [platform.claude.com/docs/en/about-claude/model-deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| **Claude 4 Opus**   | Anthropic (Inference Provider, `claude-opus-4-20250514`)   | Active     | **Deprecated** | Same retirement date.                                                                                                                                                         |

### Deprecation-notice updates applied in this PR (model still Active)

| Model                | Retirement Date | Source                                                                | Action Taken             |
| -------------------- | --------------- | --------------------------------------------------------------------- | ------------------------ |
| **Mistral Medium 3.1** | 2026-06-30      | [Xentoo blog](https://blog.xentoo.info/2026/05/30/mistral-retiring-models-during-summer-2026/) | Description updated; replacement is Mistral Medium 3.5. `IsActive=true` retained. |
| **Mistral Small 3.2**  | 2026-06-30      | Same source                                                            | Description updated; replacement is Mistral Small 4. `IsActive=true` retained.    |
| **Devstral 2**         | 2026-06-30      | Same source                                                            | Description updated; replacement is Mistral Medium 3.5. `IsActive=true` retained. |
| **Nano Banana Pro** (`gemini-3-pro-image-preview`) | 2026-06-25 | [ai.google.dev/deprecations](https://ai.google.dev/gemini-api/docs/deprecations) | Description updated; replacement is `gemini-2.5-flash-image` (Nano Banana). `IsActive=true` retained. |

### Scheduled retirements (heads-up — NOT edited this PR)

| Model                                       | Retirement Date | Notes                                                                       |
| ------------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| Gemini 3.1 Flash Image Preview              | 2026-06-25      | Not in MJ inventory; no edit needed.                                        |
| GPT-4.5 in ChatGPT                          | 2026-06-27      | ChatGPT-only; not in MJ inventory.                                          |
| Vertex non-global Gemini 3.x pricing change | 2026-07-01      | Pricing-structure change; review cost records around that date.            |
| DeepSeek `deepseek-chat` / `deepseek-reasoner` aliases | 2026-07-24 | Alias retirements; no change this cycle.                                    |
| Mistral July model retirements              | 2026-07-31      | Second tranche of the May-29 announcement.                                  |
| **Claude Opus 4.1**                         | **2026-08-05**  | Description was updated in prior cycle. Still callable.                     |
| Grok Code Fast 1 (auto-redirect to 4.3 ends) | 2026-08-15      | xAI; already inactive in MJ.                                                |
| OpenAI Assistants API                        | 2026-08-26      | Replaced by Responses API.                                                  |
| OpenAI o3 (90-day sunset announced 2026-06-03) | 2026-08-26    | API model — not currently in MJ inventory.                                  |
| OpenAI Videos API / Sora 2 snapshots        | 2026-09-24      | —                                                                           |
| Gemini 2.5 Pro / Flash / Flash-Lite          | 2026-10-16      | Extended from original June date.                                           |

## New Vendors Worth Considering

| Vendor               | Why                                                                                                                                                                | Action                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **NVIDIA NIM**       | **Fourth cycle running** — now Nemotron 3 Nano ($0.05/$0.20), Super ($0.10/$0.50), Nano Omni ($0.20/$0.80, multimodal), and **Ultra** ($0.50/$2.50, released 2026-06-04, 550B/55B active). Three of four are well-priced GA models on https://build.nvidia.com/. Recommend a focused mini-PR. | **Add vendor + 4 models next sync.** |
| **Microsoft Foundry** | Distinct from the existing "Azure" vendor — Foundry hosts the MAI family + Anthropic Claude Opus 4.8 directly. The current "Azure" entry in MJ may be the right home, but the catalog vs. service-endpoint distinction needs a deliberate decision. | **Decide once MAI pricing publishes.**                                 |
| **Together AI**      | Major host of open models — Kimi K2.6 ($1.20/$4.50), GLM 5.1 ($1.40/$4.40), Llama 4 Scout ($0.15/$0.60), Llama 4 Maverick ($0.55/$2.19). Still not added.       | Add as inference provider for routing fallback.                        |
| **DeepInfra**        | Hosts Kimi K2.6 ($0.75/$3.50), Nemotron 3 Nano Omni, Llama Guard 4 12B ($0.18/$0.18). Pair with NIM/Together adds.                                                  | Add for K2.6 / Nemotron Omni / Llama Guard routing.                    |
| **Subquadratic (SubQ)** | Still waitlist-only; no public per-token rate card. Now also shipping a $999 hardware device (May 20). | **Watchlist.** |
| **Thinking Machines Lab** (Mira Murati) | TML-Interaction-Small in research preview only; no public API yet. June 4 Bloomberg Tech preview. | **Watchlist.** |
| **Avataar.ai** (IndiaAI Mission)       | Varya text-to-video at $0.005/sec is genuinely interesting pricing, but MJ doesn't catalog video-gen models. | **Watchlist** (post-architecture decision on video models). |

## Recommended Actions (Prioritized)

1. **MERGE THIS PR**: Adds 1 new model (Kimi K2.7-Code), 2 vendor-status flips (Claude 4 Sonnet + Opus Anthropic Inference entries → `Deprecated` for today's retirement), 4 description updates (Mistral Medium 3.1, Mistral Small 3.2, Devstral 2, Nano Banana Pro — all with upcoming retirement dates).
2. **HIGHEST PRIORITY — Resolve the Claude Fable 5 / Mythos 5 situation.** Anthropic shipped them 2026-06-09 then reportedly suspended access 2026-06-12 under an export-control directive. The Anthropic pricing page still lists them but third-party trackers report active suspension. Recommend a human-mediated check on `anthropic.com/news/claude-fable-5-mythos-5` and the actual API to decide whether to add Fable 5 to MJ next cycle.
3. **HIGHEST PRIORITY (recurring) — Add NVIDIA NIM vendor + Nemotron 3 family.** Four cycles flagged with no progress. Now four models worth cataloging (Nano $0.05/$0.20, Super $0.10/$0.50, Nano Omni $0.20/$0.80, Ultra $0.50/$2.50 — released 2026-06-04). Same focused-mini-PR recommendation as last cycle.
4. **Apply Cerebras vendor-status flips** for `Llama 3.1 8b` and `Qwen 3 235B Instruct` — retirement dates (2026-05-27) now confirmed via the Cerebras deprecation docs. Held this PR to keep scope on Anthropic + Mistral.
5. **Decide on per-minute audio unit type** for `MJ: AI Model Price Unit Types`, then catalog **GPT-Realtime-Translate** ($0.034/min) and **GPT-Realtime-Whisper** ($0.017/min). Pricing remains firmly confirmed.
6. **Decide on Microsoft Foundry vs Azure vendor handling** before adding the Foundry route for Claude Opus 4.8 (the existing MJ "Azure" vendor covers Azure OpenAI Service, but Microsoft Foundry is a separate catalog).
7. **Add a "Safety Classifier" model type** so Llama Guard 4 12B can be cataloged at its $0.18/$0.18 DeepInfra rate.
8. **Track Qwen 3.7 Max promo end (2026-06-22)** — extend the existing inventory comment with the new termination date, then add a post-promo cost record once the standard rate kicks back in.
9. **Track Vertex non-global Gemini 3.x pricing change (2026-07-01)** — review the existing Vertex cost records around that date.
10. **Re-verify Mistral Large 3 pricing next cycle** ($0.50/$1.50 in MJ vs $2/$6 from secondary trackers). Last cycle's primary-source confirmation is still in force, but the discrepancy is now consistent across three trackers and deserves a primary-source recheck.
11. **Watchlist for next cycle**: Gemini 3.5 Pro GA, Gemini Omni Flash dev API, Grok V9-Medium, Mercury 3, Kimi K3 (Q3 target), DeepSeek V5/R2, GLM-5.2 public per-token API, Microsoft MAI public pricing, Cohere Rerank 4 Fast formal API listing, Avataar Varya / video-gen architecture decision, Subquadratic public pricing.

## Research Sources

### Anthropic
- [Anthropic Model Deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic Claude Fable 5 + Mythos 5 announcement](https://www.anthropic.com/news/claude-fable-5-mythos-5)
- [VentureBeat — Claude Fable 5 launch](https://venturebeat.com/technology/anthropic-brings-mythos-to-the-masses-with-claude-fable-5-its-most-powerful-generally-available-model-ever)
- [InfoQ — Claude 5 release / re-release](https://www.infoq.com/news/2026/06/claude-5-release/)
- [OutlierKit — Fable 5 Discontinued?](https://outlierkit.com/resources/claude-fable-5-discontinued/)
- [Wikipedia — Claude Mythos](https://en.wikipedia.org/wiki/Claude_Mythos)
- [Finout pricing analysis](https://www.finout.io/blog/claude-fable-5-mythos-5-pricing-benchmarks)

### OpenAI
- [OpenAI GPT-Rosalind update](https://openai.com/index/introducing-new-capabilities-to-gpt-rosalind/) (June 3 expansion)
- [TechTimes — GPT-5.2 retired](https://www.techtimes.com/articles/318345/20260613/openai-retires-gpt-52-moves-everyone-gpt-55-what-changes-chatgpt-users-developers.htm)
- [gHacks — o3 + GPT-4.5 retirements confirmed](https://www.ghacks.net/2026/06/03/openai-upgrades-gpt-5-5-instant-and-confirms-retirement-of-o3-and-gpt-4-5-models/)
- [GPT-5.5 pricing — apidog](https://apidog.com/blog/gpt-5-5-pricing/)
- [TokenCost — voice pricing](https://tokencost.app/blog/openai-gpt-realtime-2-voice-pricing)

### Google / Gemini
- [ai.google.dev pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [ai.google.dev deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
- [TechTimes — Gemini 3.5 Pro nears launch](https://www.techtimes.com/articles/317919/20260606/google-gemini-35-pro-nears-june-launch-2-million-token-context-deep-think-reasoning.htm)
- [WaveSpeed — Gemini Omni Flash shipped](https://wavespeed.ai/blog/posts/gemini-omni-flash-shipped-what-actually-launched/)
- [WaveSpeed — Veo 4 alternatives](https://wavespeed.ai/blog/posts/veo-4-alternatives-2026/)
- [igly.ai — Imagen GA shutdown migration](https://igly.ai/blog/google-imagen-shutdown-migration-guide-2026)
- [KuCoin — Gemini CLI deprecation](https://www.kucoin.com/news/flash/google-to-deprecate-old-gemini-cli-by-june-18-2026-pushes-antigravity-cli)
- [NVIDIA blog — DiffusionGemma](https://blogs.nvidia.com/blog/rtx-ai-garage-local-gemma-diffusion/)

### x.ai
- [TechTimes — Grok V9-Medium training milestone](https://www.techtimes.com/articles/317328/20260528/grok-ai-new-model-triples-parameter-count-targets-coding-lead-release-expected-mid-june.htm)
- [ChatForest — Grok V9-Medium guide](https://chatforest.com/builders-log/xai-grok-v9-medium-1-5t-coding-model-mid-june-2026-builder-guide/)
- [docs.x.ai migration page](https://docs.x.ai/developers/migration/may-15-retirement)
- [blockchain.news — Grok Imagine 1.5 preview](https://blockchain.news/news/xai-grok-imagine-1-5-preview)
- [x.ai — Grok Build 0.1](https://x.ai/news/grok-build-0-1)

### Mistral
- [Xentoo blog — Mistral summer 2026 retirements](https://blog.xentoo.info/2026/05/30/mistral-retiring-models-during-summer-2026/)

### Alibaba (Qwen)
- [VentureBeat — Qwen 3.7 Plus](https://venturebeat.com/technology/alibabas-qwen3-7-plus-supports-text-video-and-imagery-inputs-at-low-cost-of-0-4-1-6-per-1m-token-but-its-proprietary)
- [OpenRouter Qwen 3.7 Plus](https://openrouter.ai/qwen/qwen3.7-plus)
- [QwenCloud promo](https://www.qwencloud.com/promo/discount-qwen)
- [Qoder — Qwen Max discount](https://docs.qoder.com/events/qwen-max-discount)

### Moonshot (Kimi)
- [MarkTechPost — Kimi K2.7-Code release](https://www.marktechpost.com/2026/06/12/moonshot-ai-releases-kimi-k2-7-code-a-coding-model-reporting-21-8-on-kimi-code-bench-v2-over-k2-6/)
- [Codersera — Kimi K2.7 Code guide](https://codersera.com/blog/kimi-k2-7-complete-guide-2026/)
- [DeepInfra Kimi K2.6 pricing guide](https://deepinfra.com/blog/kimi-k2-6-pricing-guide-deployment-tradeoffs)

### MiniMax
- [SCMP — MiniMax-M3](https://www.scmp.com/tech/tech-trends/article/3355529/minimax-debuts-ai-model-built-long-and-complex-coding-tasks)
- [Codersera — MiniMax M3 dev guide](https://codersera.com/blog/minimax-m3-developer-guide/)

### DeepSeek
- [Engadget — DeepSeek V4 Pro 75% cut](https://www.engadget.com/2180062/deepseek-permanently-reduces-the-price-of-its-flagship-v4-model-by-75-percent/)
- [InfoWorld — DeepSeek V4 Pro pricing war](https://www.infoworld.com/article/4176709/deepseeks-steep-v4-pro-price-cut-escalates-ai-pricing-war.html)
- [pricepertoken — DeepSeek V4 Pro](https://pricepertoken.com/pricing-page/model/deepseek-deepseek-v4-pro)

### Z.AI (GLM)
- [Codersera — GLM 5.2 release](https://codersera.com/blog/glm-5-2-release-1m-context-coding-2026/)
- [aitoolly — GLM 5.2 open source](https://aitoolly.com/ai-news/article/2026-06-14-zhipu-ai-releases-glm-52-a-fully-open-source-frontier-model-featuring-a-1m-context-window)
- [OpenRouter GLM 5.1](https://openrouter.ai/z-ai/glm-5.1)

### Cohere
- [Artificial Analysis — North Mini Code 1.0](https://artificialanalysis.ai/models/north-mini-code)
- [Artificial Analysis — Command A+ open weights](https://artificialanalysis.ai/articles/cohere-launches-open-weights-model-command-a)
- [devx.com — Cohere Rerank 4 launch](https://devx.com/daily-news/cohere-launches-rerank-4-for-enterprises)

### Inference Providers
- [pydantic genai-prices YAML — Cerebras](https://github.com/pydantic/genai-prices/blob/main/prices/providers/cerebras.yml)
- [costbench Cerebras pricing](https://costbench.com/software/llm-api-providers/cerebras-inference/)
- [pricepertoken Cerebras](https://pricepertoken.com/endpoints/cerebras/free)
- [pricepertoken — DeepSeek V4 Pro on Fireworks](https://pricepertoken.com/pricing-page/model/deepseek-deepseek-v4-pro)
- [llmreference Kimi K2.6 on Fireworks](https://www.llmreference.com/model/kimi-k2-6/fireworks-ai)
- [OpenRouter Nemotron 3 Super](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b)
- [OpenRouter Nemotron 3 Ultra](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b)
- [build.nvidia.com Nemotron 3 Ultra](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b)
- [Artificial Analysis — Nemotron 3 Ultra launch](https://artificialanalysis.ai/articles/nvidia-nemotron-3-ultra-launch-announced)
- [DeepInfra — Llama Guard 4 12B](https://deepinfra.com/meta-llama/Llama-Guard-4-12B)
- [OpenRouter — Llama Guard 4 12B](https://openrouter.ai/meta-llama/llama-guard-4-12b)
- [aipricing.guru — Together AI pricing](https://www.aipricing.guru/together-pricing/)
- [Digital Applied — OpenRouter June 2026 roundup](https://www.digitalapplied.com/blog/openrouter-new-models-june-2026-roundup-pricing-rankings)
- [Codersera — Kimi K2.7 Code guide](https://codersera.com/blog/kimi-k2-7-complete-guide-2026/)

### Microsoft / Foundry
- [microsoft.ai/news — MAI family announce](https://microsoft.ai/news/today-were-announcing-3-new-world-class-mai-models-available-in-foundry/)
- [Coursiv — Claude Opus 4.8 on Foundry](https://coursiv.io/blog/claude-opus-4-8)

### Other / Notable
- [Apple WWDC26 session 241 — Foundation Models v2](https://developer.apple.com/videos/play/wwdc2026/241/)
- [TechCrunch — Avataar Varya text-to-video](https://techcrunch.com/2026/06/11/cheaper-faster-and-culturally-aware-avataars-video-ai-is-built-for-indias-scale/)
- [llmreference SubQ family](https://www.llmreference.com/model-family/subq)
- [Semafor — Mira Murati interaction models preview](https://www.semafor.com/article/05/13/2026/mira-muratis-thinking-machines-previews-interaction-models)
- [theaiinsider.tech — Mira Murati / Thinking Machines](https://theaiinsider.tech/2026/06/09/mira-murati-breaks-18-month-silence-to-preview-real-time-ai-interaction-models-at-thinking-machines-lab/)
- [HPCwire — Argonne ALCF Inference Service](https://www.hpcwire.com/2026/06/01/new-ai-inference-service-now-ready-for-science-at-argonne/)

---

## Notes for Reviewers

- **Conservative-edit discipline maintained**: 1 new model + 2 status flips + 4 description updates = 7 JSON edits total. Every Tier-2 item in this report has a documented blocker (unverified primary source, pending vendor record, missing schema feature, suspension uncertainty, free-only/sales-contact pricing, or "MJ doesn't catalog this category yet").
- **Today's Anthropic retirement is the centerpiece**: flipping the two `-20250514` Inference Provider entries to `Deprecated` keeps the inventory honest about today's transition. The model-level `IsActive=false` was already set in a prior cycle; this PR completes the lineage.
- **Direct vendor doc access remained the principal blocker.** Across the research agents this cycle, every direct WebFetch to first-party vendor pages — openai.com/api/pricing, build.nvidia.com, console.groq.com, fireworks.ai, cerebras.ai, deepinfra.com, openrouter.ai (changelog), inceptionlabs.ai, cohere.com, bfl.ai, docs.x.ai, ai.meta.com — returned HTTP 403. Every confirmation in this report came from a third-party aggregator (PricePerToken, OpenRouter, DeepInfra blog, Codersera, MarkTechPost, Engadget, Artificial Analysis) cross-confirmed where possible. This is the same access pattern flagged in the prior two cycles; recommend the team consider a human-mediated weekly snapshot of the first-party pricing pages as a research-workflow improvement.
- **Fable 5 / Mythos 5 status is the most consequential unresolved question this cycle.** Anthropic clearly shipped them (the news release exists). Whether they are currently callable is genuinely unclear — InfoQ says yes after a brief suspension, OutlierKit says no, the Anthropic pricing page still lists them. Holding the add for one cycle to let the dust settle is the right call.
- **The NIM-vendor blocker has been flagged for four consecutive cycles.** Now four well-priced GA Nemotron 3 models exist (Nano, Super, Nano Omni, Ultra). The mini-PR has crossed the threshold from "nice-to-have" to "this is now an embarrassing gap."
- **No prompt injection encountered this cycle.**
