# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-08-03
**Research Period**: 2026-07-31 → 2026-08-03
**Base Branch**: `next`
**Working Branch**: `claude/ai-model-research-2026-08-03`

## Executive Summary

Short research window (3 days) between the off-cadence 2026-07-31 report (v5.51.0 release
refresh) and this scheduled weekly run. One in-window event warrants JSON edits and one
watch-list carryover is confirmed but deliberately deferred.

1. **OpenAI GPT-5.6 Luna & Terra price cuts (2026-07-30)** — OpenAI slashed GPT-5.6 Luna
   **80%** ($1.00/$6.00 → **$0.20/$1.20** per 1M tokens) and GPT-5.6 Terra **20%**
   ($2.50/$15.00 → **$2.00/$12.00** per 1M tokens) three weeks after the family's
   general-availability launch. Sol was unchanged. Both new cost rows are added to
   `.ai-models.json` (new `StartedAt: 2026-07-30`), and the pre-July-30 rows are marked
   `SUPERSEDED …` in their `Comments` so the price history is preserved rather than
   overwritten.
2. **Claude Opus 4.1 retirement — deferred one more week.** Retirement is confirmed
   2026-08-05, i.e. 2 days *after* this report's window closes. The 2026-07-31 report
   explicitly deferred the `IsActive: false` flip to a report **"dated on/after 2026-08-05"**
   citing repo precedent (Grok 4 and the Mistral summer-2026 tranche were only deactivated
   *after* their retirement dates passed). This report is dated 2026-08-03 — 2 days *before*
   — so the flag stays `true`. **The next weekly report (~2026-08-10) must flip it.**

No new vendors, no new models added this week — the frontier releases that were "next up"
in the 2026-07-27 watch list (Grok 4.6, Gemini 3.5 Pro, GLM 5.5, FLUX 3 general-access,
Qwen 3.8-Max standalone API pricing, DeepSeek V5/R2) remain not yet ready. One notable
update — **DeepSeek-V4-Flash-0731**, a re-post-training refresh of the existing V4 Flash
model with unchanged architecture, pricing, and API alias — is documented under Updates
below without a JSON edit because the stable `deepseek-v4-flash` alias already covers it.

## Current Inventory Snapshot

| Category | Before | After this PR | Delta |
|---|---|---|---|
| Total model entries | 178 | 178 | 0 |
| Active models | 153 | 153 | 0 |
| Vendors | 30 | 30 | 0 |
| Cost rows on GPT 5.6-luna | 1 | 2 | +1 |
| Cost rows on GPT 5.6-terra | 1 | 2 | +1 |

Baseline: `next` at `169817375` (last PR merged 2026-08-02: #3396 docs/backfill-release-notes).
Two AI-metadata cost rows added; no models added, no vendors added.

Vendors (30, unchanged): Anthropic, OpenAI, Google, Vertex AI, Azure, Amazon Bedrock, x.ai,
Groq, Cerebras, Mistral AI, Alibaba Cloud, Moonshot AI, Z.AI, MiniMax, DeepSeek, Cohere,
NVIDIA, Black Forest Labs, Inception Labs, Fireworks.ai, OpenRouter, LM Studio,
LocalEmbeddings, Tasio Labs, Eleven Labs, HeyGen, AssemblyAI, Inworld, Hugging Face,
Thinking Machines Lab.

## Pricing Changes Detected — **JSON EDITS APPLIED**

### GPT 5.6-luna — 80% price cut (2026-07-30)

| | Previous | New (effective 2026-07-30) | Change |
|---|---|---|---|
| Input per 1M tokens | $1.00 | **$0.20** | **−80%** |
| Output per 1M tokens | $6.00 | **$1.20** | **−80%** |
| Cache read per 1M tokens | $0.10 (Family B: 10% of input) | **$0.02** | −80% |

- **Source of truth**: OpenAI blog post *"Advancing the price-performance frontier with
  GPT-5.6"* (2026-07-30). Independently reported by
  [VentureBeat](https://venturebeat.com/technology/ai-price-wars-openai-cuts-gpt-5-6-luna-prices-by-80-as-model-competition-shifts-toward-cost),
  [CNBC](https://www.cnbc.com/2026/07/30/open-ai-price-cut-gpt.html), and
  [MLQ News](https://mlq.ai/news/openai-slashes-gpt-56-luna-prices-80-undercutting-deepseek-as-ai-price-war-intensifies/).
- **What changed**: pricing only. Architecture, capabilities, API alias `gpt-5.6-luna`,
  context window (1,050,000 in / 128,000 out), and reasoning-effort levels are all
  unchanged.
- **Positioning**: Places Luna at $0.20/$1.20 — within striking range of DeepSeek V4 Flash
  ($0.14/$0.28) at 20-25× cheaper than it was three weeks ago. Multiple analysts flag this
  as OpenAI's explicit answer to Chinese open-weight cost pressure.
- **Edit**: appended a new `MJ: AI Model Costs` row to the GPT 5.6-luna entry with
  `StartedAt: 2026-07-30T00:00:00.000Z`, new `InputPricePerUnit: 0.2`,
  `OutputPricePerUnit: 1.2`, `CacheReadPricePerUnit: 0.02`. The pre-July-30 cost row is
  **kept** and its `Comments` field is amended to note it is superseded (preserves price
  history for auditing).

### GPT 5.6-terra — 20% price cut (2026-07-30)

| | Previous | New (effective 2026-07-30) | Change |
|---|---|---|---|
| Input per 1M tokens | $2.50 | **$2.00** | **−20%** |
| Output per 1M tokens | $15.00 | **$12.00** | **−20%** |
| Cache read per 1M tokens | $0.25 | **$0.20** | −20% |

- **Source of truth**: Same OpenAI blog post as above; corroborated by
  [Axios](https://www.axios.com/2026/07/30/openai-cuts-prices-gpt-terra-luna5),
  [Apidog analysis](https://apidog.com/blog/gpt-5-6-price-cut/),
  [explainX](https://www.explainx.ai/blog/openai-gpt-5-6-luna-terra-price-cuts-july-2026).
- **What changed**: pricing only. `gpt-5.6-terra` alias, context window, and capabilities
  unchanged.
- **Edit**: appended a new `MJ: AI Model Costs` row to the GPT 5.6-terra entry with
  `StartedAt: 2026-07-30T00:00:00.000Z`, new `InputPricePerUnit: 2`,
  `OutputPricePerUnit: 12`, `CacheReadPricePerUnit: 0.2`. Pre-July-30 row kept and
  annotated as superseded.

### GPT 5.6 (Sol) — **no JSON change**

Sol's standard pricing is unchanged at $5.00/$30.00 per 1M tokens. The 2026-07-30 release
did add an **API-level Fast mode** for Sol (`service_tier: "fast"` — or the existing
`service_tier: "priority"` alias — delivering up to 2.5× throughput at 2× standard price,
so $10.00/$60.00 for a Fast-mode request; no intelligence change).

This mirrors how **Claude Opus 5's Fast Mode** was handled in the 2026-07-27 report — as a
service-tier selector living alongside the base cost record rather than as a distinct
vendor row. No MJ inventory row currently records a `speed`/`service_tier` field, so no
JSON change is warranted for Sol. If MJ adopts Fast mode as a first-class configuration in
the OpenAI driver, that becomes a code-side change plus a follow-up metadata pass — not a
weekly-research decision.

**Sources**:
[OpenAI Devs tweet on Fast mode](https://x.com/OpenAIDevs/status/2082878473409085654),
[Fast mode docs](https://developers.openai.com/api/docs/guides/fast-mode),
[ITBrief coverage](https://itbrief.com.au/story/openai-cuts-gpt-5-6-api-prices-adds-faster-sol-mode).

### All other tracked vendors — verified unchanged

Spot-checked against public pricing pages within this 3-day window:

| Model | Vendor | JSON price (In/Out) | Web price this week | Match? |
|---|---|---|---|---|
| Claude Opus 5 | Anthropic | $5 / $25 | $5 / $25 | ✅ |
| Claude Opus 4.8 | Anthropic | $5 / $25 | $5 / $25 | ✅ |
| Claude Sonnet 5 | Anthropic | $2 / $10 (intro) | $2 / $10 (intro through Aug 31) | ✅ |
| Claude Fable 5 | Anthropic | $10 / $50 | $10 / $50 | ✅ |
| Claude Haiku 4.5 | Anthropic | $1 / $5 | $1 / $5 | ✅ |
| Grok 4.5 | x.ai | $2 / $6 | $2 / $6 | ✅ |
| Grok 4.3 | x.ai | $1.25 / $2.50 | $1.25 / $2.50 | ✅ |
| Grok Build 0.1 | x.ai | $1.00 / $2.00 | $1.00 / $2.00 | ✅ |
| DeepSeek V4 Pro | DeepSeek | $0.435 / $0.87 | $0.435 / $0.87 | ✅ |
| DeepSeek V4 Flash | DeepSeek | $0.14 / $0.28 | $0.14 / $0.28 (V4-Flash-0731 refresh at same price) | ✅ |
| Kimi K3 | Moonshot AI | $3 / $15 | $3 / $15 | ✅ |
| GLM 5.2 | Z.AI | $1.40 / $4.40 | $1.40 / $4.40 | ✅ |
| Gemini 3.5 Flash | Google | $1.50 / $9 | $1.50 / $9 | ✅ |

## Model Updates & New Versions (no JSON edit — description-only or already-covered)

### DeepSeek-V4-Flash-0731 — refresh **NOT** modeled as a new row

DeepSeek pushed a re-post-training refresh of V4 Flash on 2026-07-31 dubbed
`DeepSeek-V4-Flash-0731`. Key facts:

- **Architecture, size, license (MIT)**: unchanged from the April 24 release.
- **Public API alias**: still `deepseek-v4-flash` — the same string the MJ inventory row
  already uses. The `-0731` suffix appears in benchmark leaderboards and in the OpenRouter
  slug `deepseek/deepseek-v4-flash-0731`, but the direct-API surface hasn't broken the
  alias.
- **Pricing**: unchanged at $0.14 / $0.28 per 1M tokens (cache-hit $0.0028 / 1M).
- **What did change**: added native support for OpenAI's Responses API format, Codex
  compatibility, and reported major agentic gains — all **driver-side capabilities**, not
  metadata-modeled fields.
- **Decision**: no JSON edit. The stable `deepseek-v4-flash` alias covers this. If MJ
  needs to expose the `-0731` OpenRouter route specifically (some third-party benchmarks
  target it), a separate OpenRouter vendor row could be added on the existing DeepSeek V4
  Flash entry in a future pass — flagged in Watch List rather than edited here.

**Sources**:
[MarkTechPost — DeepSeek upgrades V4-Flash-0731 (Jul 31)](https://www.marktechpost.com/2026/07/31/deepseek-upgrades-deepseek-v4-flash-0731-with-major-agentic-and-coding-gains/),
[explainX — Codex Support, $0.14/$0.28 pricing](https://explainx.ai/blog/deepseek-v4-flash-0731-codex-responses-api-july-2026),
[Artificial Analysis — V4 Flash 0731 (max)](https://artificialanalysis.ai/models/deepseek-v4-flash),
[XenoSpectrum — public beta, price held at $0.14](https://xenospectrum.com/en/deepseek-v4-flash-0731-pricing/),
[OpenRouter — deepseek-v4-flash-0731](https://openrouter.ai/deepseek/deepseek-v4-flash-0731).

## Deprecated / Sunset Models

### Claude Opus 4.1 — retirement 2026-08-05 (2 days from now); **flag NOT flipped this week**

Anthropic re-confirmed the 2026-08-05 hard retirement of `claude-opus-4-1-20250805` on
their deprecations page. Requests will begin failing with an error on the API after that
date; migration target is **Claude Opus 5** per Anthropic's migration guide (this was
already reflected in the description text by PR #3292 / the 2026-07-27 report).

**Why not flipped this week**: The 2026-07-31 report explicitly stated *"Action for the
next report dated on/after 2026-08-05: flip Claude Opus 4.1 to IsActive: false"*, citing
established repo precedent — Grok 4 and the Mistral summer-2026 tranche were only
deactivated after their retirement dates passed, not before. This report is dated
2026-08-03, which is 2 days *before* the retirement.

**Deliberate deferral, not an oversight.** Flipping the flag 2 days early would break the
established convention and, if the model happens to still resolve for a hot-fix window
(Anthropic has extended a few deprecation windows in the past), would surface a false-red
in MJ's model selector.

**Concrete action for the next weekly report (~2026-08-10)**:
1. On `Claude Opus 4.1`, set `fields.IsActive: false`.
2. Consider setting the Anthropic Inference-Provider vendor row's `Status: "Deprecated"`
   for signal parity (not required — `IsActive: false` at model level is authoritative).
3. Leave the Amazon Bedrock vendor row alone unless AWS also confirms Bedrock-side
   retirement; the two surfaces can retire on different dates.

**Sources**:
[Anthropic — model deprecations page](https://platform.claude.com/docs/en/about-claude/model-deprecations),
[TheRouter — Aug 5 migration guide](https://therouter.ai/news/anthropic-deprecates-claude-opus-4-1-august-5-migration-guide/),
[Nova3 — deprecation announcement](https://nova3.ai/surface/b4f97c67-1bf6-45e2-acde-1619f5246638),
[Narracomm — Anthropic retirement dates](https://www.narracomm.com/anthropic-sets-retirement-dates-for-multiple-claude-models/).

### Cohere `rerank-v3.5` — auto-migration to `rerank-v4-fast` now **live** (was 2026-08-01)

Cohere's automated routing from `cohere-rerank-3.5` to `cohere-rerank-4-fast` went live
2026-08-01 (2 days before this report). No JSON change required — the description already
warns callers that relevance scores change and hard-coded thresholds need retuning, and
the row is intentionally kept `IsActive: true` because the endpoint still resolves
transparently under the hood after the migration date. Confirmed against Cohere's
[deprecations page](https://docs.cohere.com/docs/deprecations).

### Groq August cleanup — **still no confirmed removal date**

The pending Groq deprecations (`llama-3.1-8b-instant`, `llama-3.3-70b-versatile`,
`qwen/qwen3-32b`, `meta-llama/llama-4-scout-17b-16e-instruct`) noted in the 2026-07-27
report remain "removal-eligible" without a posted date. Recommended replacements
(`openai/gpt-oss-20b`, `openai/gpt-oss-120b`) are already carried in the inventory.
Nothing to do this week; re-check when Groq publishes a concrete removal date.

## New Vendors Worth Considering

**None new this week.** No new AI labs shipped a first product in this 3-day window that
merits vendor-row creation.

**Carryover**: **Meta** (Muse Spark 1.1, released 2026-07-09) is still not in the MJ
vendor list. That release fell in the 2026-07-13 report's window and appears to have been
consciously not added at that time. Adding Meta would require a new vendor row plus a new
`MetaLLM` driver class — significant enough to be a separate metadata + code PR, not a
routine weekly addition. Flagged in Watch List for an explicit decision.

## Recommended Actions

Ordered by impact:

1. **[This PR — done]** Add new cost rows for GPT 5.6-luna ($0.20/$1.20) and GPT 5.6-terra
   ($2.00/$12.00) with `StartedAt: 2026-07-30`.
2. **[This PR — done]** Annotate the pre-July-30 GPT 5.6-luna and GPT 5.6-terra cost row
   `Comments` fields as `SUPERSEDED 2026-07-30` (preserves price history for auditing).
3. **[Next weekly report — ~2026-08-10]** Flip `Claude Opus 4.1` `IsActive` to `false`
   post-retirement. See instructions in the Deprecated / Sunset section above.
4. **[Watch — next report]** GPT 5.6 Sol Fast mode / service tiers: if MJ picks up
   `service_tier: "fast" | "priority" | "standard"` on the OpenAI driver, model Fast-mode
   pricing as a driver-side selector, not a distinct cost row (matches how Claude Opus 5
   Fast Mode is documented in existing MJ metadata).
5. **[Watch — next report]** Frontier releases that were "next up" but did **not** land
   in this window (unchanged since 2026-07-31):
   - **Grok 4.6** — Musk's July 30 comment ("about one week") points to roughly 2026-08-06
     or 08-07. May land in-window for next week.
   - **Gemini 3.5 Pro** — Polymarket still favors early August (August 7 at ~73%). Third
     public slip; internal enterprise Vertex preview only.
   - **GLM 5.5** (Zhipu / Z.AI) — JPMorgan projection August 2026; no model card, endpoint,
     or benchmark from Zhipu yet.
   - **FLUX 3** (Black Forest Labs) — Video is now in Early Access (July 23), but
     public/API pricing is still "by request." FLUX 3 Image and FLUX 3 Dev (open weights)
     staged after.
   - **Qwen 3.8-Max-Preview** — Still subscription-only via Alibaba Token Plan; no per-token
     API pricing published. Add when a standalone rate card ships.
   - **DeepSeek V5 / R2** — No official roadmap. Third-party analysts predict late Aug or
     early Sept. Speculative only.
   - **Cohere Transcribe** — First Cohere ASR product. New product line; skip unless MJ
     picks up speech transcription.
   - **NVIDIA Nemotron 4 Coalition** — Still in training.
   - **Inkling-Small** (Thinking Machines Lab) — Still in preview; no full-weight release
     yet.
   - **Meta Muse Spark 1.1** — Released 2026-07-09; not in inventory. Adding Meta requires
     both a new vendor row and a new `MetaLLM` driver class — recommend a conscious
     include/exclude decision from repo maintainers before a future weekly report adds it.
6. **[Watch — next report]** Options for `deepseek-v4-flash-0731` OpenRouter route: if MJ
   wants to explicitly target the July-31 re-post-trained variant on OpenRouter (some
   evals do), add a second OpenRouter vendor row on the existing DeepSeek V4 Flash entry
   with `APIName: deepseek/deepseek-v4-flash-0731`. Not done here to keep the change
   surface minimal.
7. **[Watch — next report]** `Grok STT 1.0` (xAI, 2026-07-23) — MJ tracks speech unevenly.
   Still no explicit include/exclude decision in the repo. Flagged again for consistency.

## Methodology & Confidence

- **Sources**: Vendor blog posts, changelogs, deprecation pages, plus corroborating
  coverage from CNBC / VentureBeat / Axios / TechCrunch / MLQ News / MarkTechPost / Bloomberg
  (via TechTimes summary) / Explainx / Apidog / Coursiv / Artificial Analysis / OpenRouter.
  Where WebFetch was blocked (openai.com returned 403), primary information was
  reconstructed from multiple corroborating third-party reports of the same OpenAI blog
  post.
- **High confidence** (edits applied): GPT 5.6-luna and -terra July 30 price cuts —
  reported by 4+ independent outlets with matching numbers. Effective date, cache-read
  ratios, and unchanged capability set all match across sources.
- **High confidence** (deferrals): Claude Opus 4.1 retirement date (2026-08-05) is
  first-party confirmed on Anthropic's deprecations page. Cohere `rerank-v3.5` migration
  date (2026-08-01) is first-party confirmed on Cohere's deprecations page.
- **Not edited despite noteworthy news**: DeepSeek-V4-Flash-0731 (same alias, same
  price — description-only refresh); Meta Muse Spark 1.1 (not currently a vendor;
  requires code-side driver and a maintainer decision); GPT 5.6 Sol Fast mode (service-
  tier selector, not a distinct cost row per repo convention).

## Files Changed

| File | Change |
|---|---|
| `metadata/ai-models/.ai-models.json` | +2 cost rows (GPT 5.6-luna 07-30 pricing; GPT 5.6-terra 07-30 pricing); 2 existing cost row `Comments` fields annotated as `SUPERSEDED 2026-07-30`. |
| `reports/ai-model-research/2026-08-03-weekly-report.md` | this report |

## Sources

Frontier vendors:
- [OpenAI — Advancing the price-performance frontier with GPT-5.6 (Jul 30)](https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/)
- [CNBC — OpenAI cuts prices for two of its GPT-5.6 AI models (Jul 30)](https://www.cnbc.com/2026/07/30/open-ai-price-cut-gpt.html)
- [VentureBeat — AI price wars: OpenAI cuts GPT-5.6 Luna prices by 80%](https://venturebeat.com/technology/ai-price-wars-openai-cuts-gpt-5-6-luna-prices-by-80-as-model-competition-shifts-toward-cost)
- [MLQ News — OpenAI slashes GPT-5.6 Luna prices 80%, undercutting DeepSeek](https://mlq.ai/news/openai-slashes-gpt-56-luna-prices-80-undercutting-deepseek-as-ai-price-war-intensifies/)
- [Axios — OpenAI discounts GPT-5.6 Luna and Terra](https://www.axios.com/2026/07/30/openai-cuts-prices-gpt-terra-luna5)
- [Apidog — GPT-5.6 price cut: Luna down 80%](https://apidog.com/blog/gpt-5-6-price-cut/)
- [Explainx — GPT-5.6 Luna Terra price cuts July 2026](https://www.explainx.ai/blog/openai-gpt-5-6-luna-terra-price-cuts-july-2026)
- [OpenAI Devs on X — Fast mode for GPT-5.6 Sol](https://x.com/OpenAIDevs/status/2082878473409085654)
- [OpenAI Fast mode docs](https://developers.openai.com/api/docs/guides/fast-mode)
- [ITBrief — OpenAI cuts GPT-5.6 API prices & adds faster Sol mode](https://itbrief.com.au/story/openai-cuts-gpt-5-6-api-prices-adds-faster-sol-mode)
- [Anthropic — Claude Opus 4.1 deprecation page](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- [TheRouter — Anthropic deprecates Claude Opus 4.1: Aug 5 migration guide](https://therouter.ai/news/anthropic-deprecates-claude-opus-4-1-august-5-migration-guide/)
- [Narracomm — Anthropic sets retirement dates for multiple Claude models](https://www.narracomm.com/anthropic-sets-retirement-dates-for-multiple-claude-models/)
- [Nova3 — Anthropic Claude Opus 4.1 deprecation and retirement Aug 5](https://nova3.ai/surface/b4f97c67-1bf6-45e2-acde-1619f5246638)
- [Anthropic — Claude platform release notes](https://platform.claude.com/docs/en/release-notes/overview)

Chinese labs & open models:
- [MarkTechPost — DeepSeek upgrades V4-Flash-0731 (Jul 31)](https://www.marktechpost.com/2026/07/31/deepseek-upgrades-deepseek-v4-flash-0731-with-major-agentic-and-coding-gains/)
- [Explainx — DeepSeek-V4-Flash-0731: Codex support, $0.14/$0.28 pricing](https://explainx.ai/blog/deepseek-v4-flash-0731-codex-responses-api-july-2026)
- [Artificial Analysis — DeepSeek V4 Flash 0731 (max)](https://artificialanalysis.ai/models/deepseek-v4-flash)
- [XenoSpectrum — DeepSeek V4 Flash 0731 public beta, price held at $0.14](https://xenospectrum.com/en/deepseek-v4-flash-0731-pricing/)
- [OpenRouter — DeepSeek V4 Flash 0731](https://openrouter.ai/deepseek/deepseek-v4-flash-0731)
- [Kie.ai — What Is GLM-5.5? Zhipu's 1T open-weight model](https://kie.ai/blog/what-is-glm-5-5)
- [Wan27 — GLM-5.5 launching August 2026](https://wan27.org/blog/glm-5-5)
- [MarkTechPost — Alibaba Qwen 3.8 Max preview (Jul 19)](https://www.marktechpost.com/2026/07/19/alibaba-previews-qwen3-8-max-a-2-4-trillion-parameter-multimodal-model-days-after-moonshots-kimi-k3-open-weight-launch/)
- [Eesel — Qwen 3.8 Max pricing 2026](https://www.eesel.ai/blog/qwen38-max-pricing)
- [SitePoint — DeepSeek R2 status (2026)](https://www.sitepoint.com/deepseek-r2-what-developers-need-to-know-before-august/)

xAI / Google:
- [EvoLink — Grok 4.6 release watch: date, status & API availability](https://evolink.ai/blog/grok-4-6-release-date)
- [Releasebot — xAI release notes Aug 2026](https://releasebot.io/updates/xai)
- [BenchLM — Grok API pricing Aug 2026](https://benchlm.ai/xai/api-pricing)
- [Coursiv — Gemini 3.5 Pro rumours & confirmed](https://coursiv.io/blog/gemini-3-5-pro)
- [TechTimes — Gemini 3.5 Pro targets July 17 after full rebuild](https://www.techtimes.com/articles/320308/20260713/gemini-35-pro-targets-july-17-after-full-rebuild-every-spec-remains-unconfirmed.htm)
- [CroeAi — Is Gemini 3.5 Pro out yet? July 2026 status](https://croeai.com/is-gemini-3-5-pro-out-yet-july-2026/)

Multimodal / image / video / speech:
- [Coursiv — FLUX 3 released: multimodal video, audio, robotics](https://coursiv.io/blog/flux-3)
- [Kie.ai — What Is FLUX 3? BFL's multimodal omni model](https://kie.ai/blog/what-is-flux-3)
- [TechTimes — FLUX 3 launches (Jul 25)](https://www.techtimes.com/articles/321552/20260725/flux-3-launches-black-forest-labs-enters-video-audio-physical-ai-one-model.htm)
- [Cohere — deprecations page (rerank-v3.5 → rerank-4-fast auto-migration Aug 1)](https://docs.cohere.com/docs/deprecations)
- [Cohere — rerank v4.0 changelog](https://docs.cohere.com/changelog/rerank-v4.0)

Aggregator trackers used for cross-checking:
- [LLM Stats — AI updates today (Aug 2026)](https://llm-stats.com/llm-updates)
- [LLM Gateway — Model release timeline](https://llmgateway.io/timeline)
- [Price Per Token — model releases in the last 24 hours](https://pricepertoken.com/news/model-releases)
- [BenchLM — OpenAI API pricing Aug 2026](https://benchlm.ai/openai/api-pricing)
