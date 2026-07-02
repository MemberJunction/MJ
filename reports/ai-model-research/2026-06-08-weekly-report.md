# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-06-08
**Research Period**: 2026-06-01 through 2026-06-08
**Base Branch**: next
**Branch**: claude/ai-model-research-2026-06-08

## Executive Summary

A relatively quiet week dominated by **two scheduled events** rather than new flagship launches: (1) **Anthropic announced the deprecation of Claude Opus 4.1** (`claude-opus-4-1-20250805`) on 2026-06-05, with retirement scheduled for August 5, 2026 and `claude-opus-4-8` as the recommended replacement; and (2) **Alibaba's Qwen 3.7 Plus reached GA** on 2026-06-01 at endpoint `qwen3.7-plus` with $0.40 / $1.16 per 1M pricing — roughly 1/6 the cost of Qwen 3.7 Max — resolving the Tier-2 watchlist item from the 2026-06-01 report. Two anticipated launches did NOT ship in-window: **Gemini 3.5 Pro** (still preview, GA "nears" per third-party reports) and **xAI Grok V9-Medium** (training complete, mid-June targeted). **NVIDIA Nemotron 3 family** (Nano/Super/Nano Omni) is now widely available across DeepInfra/Fireworks/OpenRouter but is still not in the MJ inventory because the **NVIDIA NIM vendor** has not been added yet — flagged for next cycle. JSON edits in this PR: 1 new model (Qwen 3.7 Plus), 1 deprecation-notice update (Claude Opus 4.1 description), and 2 vendor-status flips (Kimi K2 on Groq and Moonshot AI → `Status=Deprecated`).

## Current Inventory Snapshot

| Vendor                | Models in Inventory (active LLMs unless noted) | Last MJ Update         |
| --------------------- | ----------------------------------------------- | ---------------------- |
| OpenAI                | 22+ (incl. embeddings, image, TTS, realtime)    | 2026-05-14             |
| Anthropic             | 8 (Opus 4.1 deprecation notice added this PR)   | 2026-06-05             |
| Google                | 15 (incl. Gemma, TTS, Nano Banana)              | 2026-05-21             |
| x.ai                  | 9 (Grok Code Fast 1, 4-1 Fast x2, 4 Fast x2 all inactive) | 2026-05-29  |
| Mistral AI            | 10 (incl. embed)                                | 2026-05-14             |
| Groq (inference)      | ~12 hosted models                               | 2026-04-20             |
| Alibaba Cloud (Qwen)  | 11 (Qwen 3.7 Plus added this PR)                | 2026-06-08             |
| Moonshot AI (Kimi)    | 3 (Kimi K2 Moonshot vendor now Deprecated)      | 2026-06-08             |
| DeepSeek              | 2 (+ 1 distilled on Groq)                       | 2026-05-23             |
| Z.AI (GLM)            | 5                                               | 2026-04-20             |
| MiniMax               | 4 (M3 launched 2026-06-01)                      | 2026-06-05             |
| Inception Labs        | 2 (Mercury 2, Mercury Edit 2)                   | 2026-05-18             |
| Black Forest Labs     | 2                                               | 2026-02-12             |
| Cohere                | 4 rerankers + Command A + Command A+ + Embed v4 | 2026-05-20             |

## New Models Available

### Tier-1 (high confidence — applied to JSON in this PR)

| Model              | Vendor          | API ID            | In / Out / 1M    | Context      | Release    | Notes                                                                |
| ------------------ | --------------- | ----------------- | ---------------- | ------------ | ---------- | -------------------------------------------------------------------- |
| **Qwen 3.7 Plus**  | Alibaba Cloud   | `qwen3.7-plus`    | $0.40 / $1.16    | 1M / 64K     | 2026-06-01 | Multimodal Plus-tier Qwen 3.7 model (text + vision + video understanding). Deep reasoning, tool invocation, autonomous iteration. ~1/6 the per-token cost of Qwen 3.7 Max. Resolves Tier-2 item from 2026-06-01 report. Listed on OpenRouter 2026-06-03 (`qwen/qwen3.7-plus`, passthrough pricing). |

### Tier-2 (verified but deferred — flag only)

| Model                              | Vendor                | Pricing                  | Rationale for deferring                                                                                                                                                                                       |
| ---------------------------------- | --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nemotron 3 Nano 30B-A3B**        | NVIDIA NIM            | $0.05 / $0.20            | NIM vendor entry still missing from MJ — same blocker as last two cycles. Recommend adding the NVIDIA NIM vendor + all three Nemotron 3 models (Nano, Super, Nano Omni) as a coordinated batch next sync. Verified on https://build.nvidia.com/nvidia/nemotron-3-nano-30b-a3b. |
| **Nemotron 3 Super 120B-A12B**     | NVIDIA NIM / DeepInfra| $0.10 / $0.50            | Same — NIM vendor blocker. Released 2026-03-11. Confirmed pricing on https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b.                                                                                  |
| **Nemotron 3 Nano Omni 30B-A3B**   | NVIDIA NIM / DeepInfra| $0.20 / $0.80            | NEW since last cycle. Unified vision+audio+video+docs+text in a single pass; ~9× throughput of comparable open omni models. Source: https://deepinfra.com/blog/nvidia-nemotron-3-nano-omni-release.            |
| **Nemotron 3 Ultra**               | Fireworks.ai          | TBD                      | Listed on Fireworks 2026-06-02/03 (NVFP4 + BF16 variants). Pricing not surfaced in OpenRouter changelog. Pair with NIM vendor add.                                                                             |
| **Llama Guard 4 12B**              | Meta / DeepInfra      | varies by host           | Multimodal safety classifier — NOT a chat model. Hosted on Meta Llama Moderations API, NVIDIA NIM, DeepInfra, Together AI, OpenRouter. MJ has no `Safety Classifier` model type yet; recommend deciding whether to add the type or slot as LLM. Source: https://huggingface.co/meta-llama/Llama-Guard-4-12B. |
| **Qwen 3.7 Max-Preview**           | Alibaba Cloud         | unchanged                | Pricing still $1.25 / $3.75 promo (list $2.50 / $7.50). No update in window. Promo flag still active per pricepertoken.com.                                                                                    |
| **Grok V9-Medium**                 | x.ai                  | TBD                      | Training complete announcement 2026-05-25; SFT + RL underway; release still targeted "mid-June 2026". Did NOT ship in this window. Watch for next cycle.                                                       |
| **Gemini 3.5 Pro**                 | Google                | TBD                      | Still preview-only. TechTimes 2026-06-06 reports launch "nears" with 2M context and Deep Think reasoning, but no firm date. Pichai's I/O "give us until next month" timeline has not yet elapsed.              |
| **Gemini Omni / Omni Flash**       | Google                | TBD                      | Consumer Omni Flash live since 2026-05-19 (Gemini app/Flow/YouTube Shorts). Developer API still "coming weeks" — no release in window.                                                                         |
| **Veo 4 / Imagen 5**               | Google                | TBD                      | No public Veo 4 launch, no public model card or API model ID. Note Vertex Imagen GA endpoints shut down 2026-06-24 (heads-up).                                                                                 |
| **`grok-imagine-video-1.5-preview`**| x.ai                  | preview                  | Image-to-video model added to xAI API preview this week with 720p output and natural-language motion control. MJ does not currently track video-gen models in `.ai-models.json`; defer.                        |
| **Subquadratic SubQ**              | Subquadratic Inc      | claimed ~$1.50 / 1M      | Interview-only pricing (theneurondaily.com). No public pricing page. Still private beta. Defer until rate card lands.                                                                                          |
| **FLUX VTO**                       | Black Forest Labs     | not publicly listed      | Per-image price still not disclosed on bfl.ai/pricing — credit-based model implies it sits in the $0.01–$0.03/image range. Don't add line-item without official price.                                         |
| **GPT-Realtime-Translate / Whisper**| OpenAI                | $0.034 / $0.017 per min  | Pricing CONFIRMED this cycle. Blocker is still unit type: verify `MJ: AI Model Price Unit Types` supports per-minute audio billing before cataloging.                                                          |

## Pricing Changes Detected

| Model                     | Vendor          | Previous Price (In / Out) | Current Price (In / Out)         | Action                                |
| ------------------------- | --------------- | ------------------------- | -------------------------------- | ------------------------------------- |
| _(none in-window)_        | —               | —                         | —                                | Inventory pricing all confirmed unchanged for the week. |

### Resolutions of prior open items

| Item                                  | Prior Status (2026-06-01)                                              | Status now                                                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GPT-5.5 pricing**                   | Inventory $5/$30; third parties claimed bump from $2.50/$15 — official OpenAI page returned 403, needed human eyes. | **RESOLVED.** Multi-source convergence (AI Pricing Guru, OpenRouter, apidog, devtk.ai, costgoat) confirms the doubling to $5/$30 happened in **May 2026** as part of OpenAI's broader May repricing wave. **Current MJ inventory at $5/$30 is correct — no change needed.** GPT-5.5 Pro $30/$180 also confirmed correct. openai.com/api/pricing STILL returns 403 to WebFetch this cycle. |
| **GPT-Realtime-Translate / Whisper**  | $0.034/min and $0.017/min confirmed; blocked on per-minute unit type.  | Same. Unit-type question still open. Source: https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/.                                                            |
| **Qwen 3.7 Plus**                     | Preview-only; pricing TBD on DashScope.                                | **RESOLVED.** GA on 2026-06-01 at $0.40/$1.16 per 1M. **Added to JSON in this PR.**                                                                                                          |
| **NVIDIA Nemotron 3 family**          | Flagged for next cycle; no NIM vendor in MJ.                           | Confirmed pricing still current. NIM vendor still not added. Now an explicit recommendation (Action #2 below) — Nano Omni is new since last cycle.                                          |
| **Kimi K2 on Moonshot + Groq**        | Recommended `Status=Deprecated` on dead vendor entries.                | **APPLIED** in this PR. Moonshot retirement 2026-05-25; Groq retirement actually 2026-03-23 (corrected from last cycle's "already retired" assumption — Groq replaced K2 with gpt-oss-120b per https://console.groq.com/docs/deprecations). Fireworks vendor entry left Active. |
| **Llama 3.1 8B / Qwen 3 235B on Cerebras** | Recommended `Status=Deprecated` for Cerebras vendor entries.       | **NOT applied this PR.** Cerebras Llama 3.1 8B retirement was 2026-05-27. Will apply next cycle once we verify Cerebras vendor entries on those rows actually exist in MJ (avoid speculative edits). |
| **Fireworks.ai vendor entries for DeepSeek V4 Pro + Kimi K2.6** | Recommended add.                                              | **NOT applied this PR.** Kimi K2.6 on Fireworks confirmed at $0.95/$4.00 (cached $0.16/M), but DeepSeek V4 Pro Fireworks rate is ambiguous — the post-2026-05-23 permanent cut may not have propagated identically to Fireworks. Hold for direct verification. |
| **Microsoft Foundry / Azure Opus 4.8** | Recommended add for routing.                                          | **NOT applied this PR.** Not directly verified in research window; defer.                                                                                                                    |
| **Mistral Large 3 verification**      | Confirmed $0.50/$1.50.                                                 | Still confirmed unchanged. Mistral Medium 3.5 also confirmed at $1.50/$7.50 — matches inventory.                                                                                              |

## Model Updates & New Versions

- **Claude Opus 4.1 deprecation announced (NEW THIS WEEK, 2026-06-05).** `claude-opus-4-1-20250805` retires August 5, 2026; recommended replacement is `claude-opus-4-8`. **Description updated in JSON this PR**; `IsActive` left as `true` because the model is still callable through 2026-08-05. Source: https://platform.claude.com/docs/en/about-claude/model-deprecations.
- **Claude Mythos Preview** is now officially listed on Anthropic's models overview page (still invitation-only research preview, Project Glasswing). Mythos Preview gets full 1M context at standard pricing per Anthropic's long-context docs. No public pricing — not catalog-eligible. 2026-06-02 expansion to 150 organizations in critical infrastructure (15+ countries) reported by TechCrunch.
- **OpenAI GPT-Rosalind update (2026-06-03).** Stronger medicinal chemistry + genomics reasoning; ~31% fewer tokens than GPT-5.5 on evaluated research tasks. **Still research preview to eligible orgs only — NOT GA**, so not catalog-eligible. Source: https://openai.com/index/introducing-new-capabilities-to-gpt-rosalind/.
- **MiniMax-M3 launch promo ENDS today (2026-06-08).** Promo rate ($0.30/$1.20) reverts to the standard rate ($0.60/$2.40) — which is what's already in the MJ cost record (`StartedAt=2026-06-01`). **No JSON change needed** — the inventory already encodes the standard rate, with the promo noted in the comments. Source: https://help.apiyi.com/en/minimax-m3-api-launch-discount-guide-en.html.
- **OpenRouter June 4 changelog**: Listed Qwen 3.7 Plus (June 3), NVIDIA Nemotron 3 Ultra (June 4), and added Gemini 3.5 Flash and Claude Opus 4.8 as routes (which MJ already tracks directly on the upstream provider). Speech/transcription APIs and Model Fusion also rolled out. Source: https://openrouter.ai/docs/changelog.
- **Vertex AI pricing structure change (heads-up for 2026-07-01)**: Non-global endpoints for Gemini 3.x and later families switch to a new GA pricing structure on 2026-07-01. Not actionable this PR but worth tracking.
- **Cerebras hosts Kimi K2.6** still enterprise-trial only as of 2026-06-08; no public per-token pricing. Pricing page lists Llama, Qwen3 235B, Qwen3 Coder 480B ($2.00/MTok), GLM-4.7 ($2.25/$2.75) — no K2.6 line item yet.

## Deprecated / Sunset Models

### Deprecation-notice updates applied in this PR (model still Active)

| Model              | Retirement Date | Source                                                                | Action Taken             |
| ------------------ | --------------- | --------------------------------------------------------------------- | ------------------------ |
| **Claude Opus 4.1** | 2026-08-05      | https://platform.claude.com/docs/en/about-claude/model-deprecations   | **Description updated** to note Aug 5, 2026 retirement and Opus 4.8 as replacement. `IsActive=true` retained (still callable through retirement date). |

### Vendor-status flips applied in this PR (model still has live vendors)

| Model    | Vendor (entry)      | Old Status | New Status   | Reason                                                                                                                                                                       |
| -------- | ------------------- | ---------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kimi K2** | **Groq** (Inference) | Active     | **Deprecated** | Groq retired Kimi K2 on **2026-03-23** in favor of `gpt-oss-120b` per https://console.groq.com/docs/deprecations. The whole MJ Kimi K2 row stays Active — Fireworks entry is still live. |
| **Kimi K2** | **Moonshot AI** (Model Developer) | Active     | **Deprecated** | Moonshot officially retired the entire Kimi K2 series on the platform 2026-05-25 (replacement: kimi-k2.6). Marking the Model Developer entry as Deprecated reflects the upstream lineage state; Fireworks-hosted route remains the only callable path. |

### Scheduled retirements (heads-up — NOT edited this PR)

| Model                                       | Retirement Date | Notes                                                                       |
| ------------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| Claude Opus 4 / Sonnet 4 (`-20250514`)      | 2026-06-15      | Anthropic; replacements set in prior PR. **7 days from report date.**       |
| Vertex AI Generative AI module + Imagen GA endpoints | 2026-06-24 | Migration to newer Gemini/Veo endpoints — not specifically "Imagen 5".      |
| GPT-4.5 in ChatGPT                          | 2026-06-27      | ChatGPT only; not in MJ inventory.                                          |
| Mistral June model retirements              | 2026-06-30      | Per Mistral 2026-05-29 announcement (https://blog.xentoo.info/2026/05/30/mistral-retiring-models-during-summer-2026/). Specific model IDs to verify next cycle. |
| Vertex non-global Gemini 3.x pricing change | 2026-07-01      | Pricing-structure change; no model deprecation, but cost-record impact possible. |
| DeepSeek `deepseek-chat` / `deepseek-reasoner` aliases | 2026-07-24 | Alias retirements; no change this cycle.                                    |
| Mistral July model retirements              | 2026-07-31      | Same source as above; second tranche.                                       |
| **Claude Opus 4.1**                          | **2026-08-05**  | **NEW THIS WEEK.** Description updated in this PR.                          |
| Grok Code Fast 1 (auto-redirect to 4.3 ends) | 2026-08-15      | xAI; redirect period ends. Already inactive in MJ.                          |
| OpenAI Assistants API                        | 2026-08-26      | Replaced by Responses API.                                                  |
| OpenAI Videos API / Sora 2 snapshots        | 2026-09-24      | —                                                                           |
| Gemini 2.5 Pro / Flash / Flash-Lite          | 2026-10-16      | Extended from original June date.                                           |

## New Vendors Worth Considering

| Vendor               | Why                                                                                                                                                                | Action                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **NVIDIA NIM**       | Now an **explicit blocker** — Nemotron 3 Nano ($0.05/$0.20), Super ($0.10/$0.50), and the NEW Nano Omni ($0.20/$0.80, multimodal vision+audio+video+docs+text) are all GA on https://build.nvidia.com/. Three cycles in a row flagged with no progress. Recommend a focused mini-PR to add the NIM vendor + all three Nemotron 3 models. | **Add vendor + 3 (or 4 if Ultra pricing surfaces) models next sync.** |
| **Together AI**      | Major host of open models. Confirmed pricing pulled this cycle: Kimi K2.6 ($1.20/$4.50), GLM 5.1 ($1.40/$4.40), Qwen 3.6 Plus ($0.50/$3.00), MiniMax M2.7 ($0.30/$1.20), Llama 4 Scout ($0.11/M, 10M ctx), Llama 4 Maverick ($0.20/M). | Add as inference provider; useful for routing fallback.                |
| **DeepInfra**        | Hosts Kimi K2.6, DeepSeek V4 Pro (at the post-cut $0.435/$0.87 rate, made permanent 2026-05-22), Nemotron 3 Nano Omni ($0.20/$0.80), Llama Guard 4 12B.            | Add for K2.6 / Nemotron Omni / Llama Guard routing.                    |
| **Subquadratic (SubQ)** | Interview pricing of ~$1.50/1M tokens at 12M token context; still private beta and no public rate card. Per https://www.theneurondaily.com/p/subq-ships-12m-tokens-at-1-5-the-cost. | **Watchlist** — wait for publicly listed pricing.                      |
| **Thinking Machines Lab** (Mira Murati) | $2B Series B at $10B valuation announced 2026-06-04. Infrastructure phase only, no model releases.                                                  | **Watchlist.**                                                         |
| **Brian Chesky AI lab** | New lab announced 2026-06-04. No models yet.                                                                                                                    | **Watchlist.**                                                         |

## Recommended Actions (Prioritized)

1. **MERGE THIS PR**: Adds 1 new model (Qwen 3.7 Plus), updates 1 deprecation notice (Claude Opus 4.1 → retires 2026-08-05), and flips 2 vendor entries on Kimi K2 to `Status=Deprecated` (Groq + Moonshot AI Model Developer).
2. **HIGHEST PRIORITY FOR NEXT CYCLE — Add NVIDIA NIM vendor + Nemotron 3 family.** This has been flagged three weeks running with no action. The vendor and three models (Nano, Super, Nano Omni) are all well-priced ($0.05/$0.20 to $0.20/$0.80 per 1M) and all confirmed GA on https://build.nvidia.com/. Also add Nemotron 3 Ultra on Fireworks once pricing is published. Suggest a focused mini-PR specifically for this.
3. **Add a "Safety Classifier" model type** (one-time schema decision) and then catalog **Llama Guard 4 12B**. If MJ chooses to slot safety classifiers as LLMs instead, that's also fine — but the decision blocks adding the model.
4. **Decide on per-minute audio unit type** for `MJ: AI Model Price Unit Types`, then catalog **GPT-Realtime-Translate** ($0.034/min) and **GPT-Realtime-Whisper** ($0.017/min). Pricing is now firmly confirmed, only the unit-type schema is blocking.
5. **Verify Cerebras vendor entries on Llama 3.1 8B and Qwen 3 235B Instruct** before flipping `Status=Deprecated` — those retirements happened 2026-05-27. Held this cycle to avoid speculative edits without confirming the entries are present.
6. **Verify Fireworks.ai pricing for DeepSeek V4 Pro post-cut** before adding a Fireworks vendor entry — research suggests DeepSeek's permanent 75% cut may not have propagated identically to Fireworks' rate card.
7. **Track Vertex pricing structure change effective 2026-07-01** for non-global Gemini 3.x endpoints — review existing Vertex cost records around that date.
8. **Track Mistral June 30, 2026 model retirements.** Mistral's 2026-05-29 announcement schedules retirements on May 31, June 30, and July 31; the May tranche presumably already executed (verify next cycle), June 30 is one tranche out.
9. **Watch list for next cycle**: Gemini 3.5 Pro GA (still imminent), Grok V9-Medium (still imminent), Mercury 3, Kimi K3 (Q3 target), DeepSeek V5/R2, Llama 5 follow-ups, Subquadratic public pricing.
10. **Acknowledge** Anthropic's Mythos Preview, OpenAI's GPT-Rosalind update, and xAI's `grok-imagine-video-1.5-preview` exist — all in research-preview/limited-availability tiers and not appropriate for the public model catalog.

## Research Sources

### Anthropic
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Anthropic Model Deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations) — Claude Opus 4.1 retirement notice 2026-06-05
- [Anthropic scales Claude Mythos — TechCrunch](https://techcrunch.com/2026/06/02/anthropic-scales-claude-mythos-to-critical-infrastructure-in-15-countries/)
- [Claude Mythos Preview — Anthropic](https://red.anthropic.com/2026/mythos-preview/)

### OpenAI
- [OpenAI Realtime Voice Models](https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/) — Realtime-Translate / Whisper pricing
- [GPT-Rosalind update — OpenAI](https://openai.com/index/introducing-new-capabilities-to-gpt-rosalind/) — 2026-06-03 update
- Pricing convergence (third-party, openai.com/api/pricing returned 403 again this week): AI Pricing Guru, OpenRouter, apidog, devtk.ai, costgoat — all confirm $5/$30 (standard) and $30/$180 (Pro)

### Google / Gemini
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3.5 Pro launch nears — TechTimes](https://www.techtimes.com/articles/317919/20260606/google-gemini-35-pro-nears-june-launch-2-million-token-context-deep-think-reasoning.htm)
- [Gemini Omni Flash — TechJackSolutions](https://techjacksolutions.com/ai-brief/gemini-omni-flash-is-live-subscriber-access-youtube-ai-tools/)
- [Vertex AI updates — ReleaseBot](https://releasebot.io/updates/google/vertex-ai) — Imagen GA endpoint shutdown 2026-06-24

### x.ai
- [xAI updates — ReleaseBot](https://releasebot.io/updates/xai) — grok-imagine-video-1.5-preview, Quality Mode
- [Grok V9-Medium training milestone — TechTimes](https://www.techtimes.com/articles/317328/20260528/grok-ai-new-model-triples-parameter-count-targets-coding-lead-release-expected-mid-june.htm)
- [Grok Build 0.1 — Requesty](https://www.requesty.ai/models/xai/grok-build-0.1)

### Mistral
- [Mistral retirement schedule — xentoo blog](https://blog.xentoo.info/2026/05/30/mistral-retiring-models-during-summer-2026/) — May 31, June 30, July 31 tranches
- [Mistral pricing — CloudZero](https://www.cloudzero.com/blog/mistral-api-pricing/), [AI Pricing Guru](https://www.aipricing.guru/mistral-ai-pricing/)

### Alibaba (Qwen)
- [Qwen 3.7 Plus launch — MarkTechPost](https://www.marktechpost.com/2026/06/02/alibabas-qwen-team-launches-qwen3-7-plus-adding-vision-deep-reasoning-tool-invocation-and-autonomous-iteration-on-the-bailian-platform/)
- [Qwen 3.7 Plus guide — Digital Applied](https://www.digitalapplied.com/blog/qwen-3-7-plus-alibaba-multimodal-agent-model-2026-release)
- [Qwen 3.7 Max promo — PricePerToken](https://pricepertoken.com/pricing-page/model/qwen-qwen3.7-max)

### DeepSeek
- [DeepSeek V4 Pro permanent cut — Codersera](https://codersera.com/blog/deepseek-v4-pro-permanent-price-cut-may-2026/)
- [DeepSeek V4 Pro permanent cut — apidog](https://apidog.com/blog/deepseek-v4-pro-permanent-price-cut/)

### Moonshot (Kimi)
- [Kimi K3 Q3 target — AIBase](https://news.aibase.com/news/27577)
- [Kimi K2.6 pricing — DeepInfra blog](https://deepinfra.com/blog/kimi-k2-6-pricing-guide-deployment-tradeoffs)
- [Groq deprecations — Kimi K2 retired 2026-03-23](https://console.groq.com/docs/deprecations)

### MiniMax
- [MiniMax-M3 promo schedule — APIYI](https://help.apiyi.com/en/minimax-m3-api-launch-discount-guide-en.html)

### Z.AI (GLM)
- [Z.AI pricing context — Yahoo Finance](https://finance.yahoo.com/sectors/technology/articles/zhipu-raises-ai-model-prices-131652529.html)

### Inference Providers
- [OpenRouter changelog](https://openrouter.ai/docs/changelog) — Qwen 3.7 Plus, Nemotron 3 Ultra, Gemini 3.5 Flash, Claude Opus 4.8 additions
- [OpenRouter June roundup — Digital Applied](https://www.digitalapplied.com/blog/openrouter-new-models-june-2026-roundup-pricing-rankings)
- [Cerebras pricing](https://pricepertoken.com/endpoints/cerebras)
- [Cerebras Kimi K2 Enterprise](https://www.cerebras.ai/blog/cerebras-kimi-k2-Enterprise)
- [Fireworks Kimi K2.6 — LLM Reference](https://www.llmreference.com/model/kimi-k2-6/fireworks-ai)
- [Together AI pricing — AI Pricing Guru](https://www.aipricing.guru/together-pricing/)
- [DeepInfra Llama Guard 4](https://deepinfra.com/meta-llama/Llama-Guard-4-12B)

### Specialized Vendors
- [Cohere Command A+ docs](https://docs.cohere.com/docs/command-a-plus)
- [Cohere Rerank 4 blog](https://cohere.com/blog/rerank-4)
- [Cohere models catalog](https://docs.cohere.com/docs/models)
- [BFL pricing](https://bfl.ai/pricing), [FLUX VTO docs](https://docs.bfl.ai/flux_tools/flux_vto), [FLUX VTO blog](https://bfl.ai/blog/flux-vto-virtual-try-on-at-catalog-scale)
- [Llama Guard 4 model card](https://huggingface.co/meta-llama/Llama-Guard-4-12B)
- [Llama 5 release — Financial Content](https://www.financialcontent.com/article/marketminute-2026-4-8-meta-unleashes-llama-5-zuckerbergs-open-source-gambit-challenges-proprietary-ai-dominance)
- [NVIDIA Nemotron 3 Nano](https://build.nvidia.com/nvidia/nemotron-3-nano-30b-a3b)
- [NVIDIA Nemotron 3 Super on OpenRouter](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b)
- [NVIDIA Nemotron 3 Nano Omni — DeepInfra](https://deepinfra.com/blog/nvidia-nemotron-3-nano-omni-release)
- [Subquadratic interview pricing — The Neuron Daily](https://www.theneurondaily.com/p/subq-ships-12m-tokens-at-1-5-the-cost)
- [Inception Labs Mercury refresh](https://www.inceptionlabs.ai/blog/mercury-refreshed)
- [Airbnb / Brian Chesky AI lab — TechCrunch](https://techcrunch.com/2026/06/04/airbnbs-brian-chesky-plans-to-launch-a-new-ai-lab/)

---

## Notes for Reviewers

- **Conservative-edit discipline**: This PR makes only four JSON changes — one new model, one description update, two vendor-status flips. Every other finding is reported but not edited because either the source was a third-party tracker (no convergent multi-source confirmation), the vendor entry hasn't yet been confirmed to exist in MJ, or a schema decision is required before adding (e.g., NIM vendor, safety-classifier type, per-minute audio unit).
- **openai.com/api/pricing STILL returns HTTP 403 to WebFetch**. Every OpenAI pricing claim this cycle relies on third-party trackers that converge. This is a recurring data-access problem worth flagging to the team — consider whether a human-mediated weekly snapshot of OpenAI's pricing page should be added to the research workflow.
- **Groq Kimi K2 retirement date correction**: Last cycle's report said the Groq vendor entry was "already retired". The official Groq deprecation page shows the actual retirement date was **2026-03-23** (much earlier than the May 25 Moonshot date). The MJ row's Status flip in this PR is overdue, not new.
- **MiniMax-M3 promo ending today**: No JSON change needed because the inventory's cost record already reflects the standard rate ($0.60/$2.40) with a comment noting the launch promo. The promo expiring is a non-event from a catalog perspective.
- **Sub-agent research note**: One research sub-agent flagged that all official OpenAI, Google AI, and xAI docs URLs returned 403 to WebFetch. Third-party aggregators provided the data, with confidence calibrated to source convergence.
- **No prompt injection encountered this cycle** (the prior cycle flagged one).
