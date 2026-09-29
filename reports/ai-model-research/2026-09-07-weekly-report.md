# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-09-07
**Research Period**: 2026-09-01 → 2026-09-07
**Base Branch**: `next`
**Research Branch**: `claude/magical-turing-uxei24`

> **Branch note.** Prior weeks used `claude/ai-model-research-YYYY-MM-DD`. This session's runtime
> pins its own designated branch (`claude/magical-turing-uxei24`) and forbids pushing anywhere else,
> so the branch name breaks the usual convention. Nothing else about the PR changes.

---

## Executive Summary

The heaviest release week this routine has seen: **all three Western frontier labs shipped a new
flagship inside 72 hours**, and Meta shipped its second proprietary model. Anthropic released
**Claude Fable 5.1** (Sept 1) at Fable 5's unchanged $10/$50 but with cache reads cut 75% to
$0.25/1M; OpenAI released **GPT-6 Astra** (Sept 3) at $10/$50 with a 1.05M context and a
long-context surcharge that rebills the *entire* request above 272K input tokens; Google released
**Gemini 3.8 Flash** (Sept 2) holding 3.7 Flash's $0.75/$3.75 introductory rate through year-end.
Meta released **Muse Spark 1.3** (Sept 2) at $1.25/$4.25, which finally forces the Meta-vendor
onboarding this report has flagged for three weeks — resolved here by adding Meta as a *Model
Developer only* and routing inference through OpenRouter, so no new driver class is needed. Two
housekeeping items also close: **GLM-5.3's rate card** ($1.40/$4.40), left as "pricing TBD" on
2026-08-24, and **Claude Opus 4.1's retirement on the Anthropic API** (2026-08-05), which our
metadata still recorded as Active. xAI's Grok 4.7 is announced for Sept 12 but has no model ID or
rate card — flagged, not applied.

---

## Current Inventory Snapshot

- **Total models**: 193 in `metadata/ai-models/.ai-models.json` (+4) + 4 in
  `.cohere-reranker-models.json` = **197 model records**
- **Total vendors** (`metadata/ai-vendors/.ai-vendors.json`): **31** (+1 — Meta)

Coverage across major vendors (delta versus 2026-08-31 in **bold**):

| Vendor | Models Count (approx.) | Latest In-Inventory Model | Newest Cost Record |
|---|---:|---|---|
| Anthropic | **9** | **Claude Fable 5.1 (Sep 1)** | **2026-09-01** |
| OpenAI | **21** | **GPT-6 Astra (Sep 3)** | **2026-09-03** |
| Google / Vertex AI | **13** | **Gemini 3.8 Flash (Sep 2)** | **2026-09-02** |
| **Meta (new vendor)** | **1** | **Muse Spark 1.3 (Sep 2)** | **2026-09-02** |
| x.ai | 8 | Grok 4.6 (Aug 12) | 2026-08-25 |
| Mistral AI | 8 | Mistral Medium 3.5, Magistral 1.2 | 2026 mid-year |
| DeepSeek | 2 | V4 Pro / V4 Flash | 2026-08-16 |
| Moonshot AI | 3 | Kimi K3 / K3 Fast (K2.5 sunset Aug 31) | 2026-07-27 |
| Alibaba Cloud (Qwen) | 13 | Qwen3.8-Flash (Aug 26) | 2026-08-26 |
| Z.AI (GLM) | 9 | GLM-5.3-Flash (Aug 26) | **2026-08-19 (GLM 5.3 rate card)** |
| MiniMax | 4 | MiniMax-M3 | 2026-06-01 |
| Thinking Machines Lab | 2 | Inkling / Inkling Small | 2026 mid-year |
| NVIDIA | 3 | Nemotron 3 Ultra / Super / Nano | 2026 mid-year |
| Groq (inference) | many via passthroughs | Qwen 3.6 27B, GPT-OSS-* | — |
| Cerebras (inference) | 2 direct: GPT-OSS-120B, Gemma 4 31B | — | — |
| Fireworks.ai (inference) | many via passthroughs | GLM-5.3-Flash, Qwen3.8-Flash | — |
| OpenRouter (gateway) | most models mirrored (**+ Fable 5.1, + Gemini 3.8 Flash, + Muse Spark 1.3**) | — | **2026-09-02** |
| Azure (gateway) | OpenAI family (**+ GPT-6 Astra, gated**) | — | **2026-09-03** |
| Amazon Bedrock (gateway) | Anthropic (**+ Fable 5.1**), GPT-OSS, Magistral, Grok 4.6 | — | **2026-09-01** |
| Cohere | 1 embedding + 4 rerankers (separate file) | rerank-v4-pro / rerank-v4-fast | Dec 2025 |
| Black Forest Labs | 2 image gen | FLUX.2 Pro, FLUX 1.1 Pro | 2025-10-01 |
| Inception Labs | 2 diffusion LLM | Mercury 2, Mercury Edit 2 | — |

---

## New Models Available

### 1. Anthropic — **Claude Fable 5.1** *(NEW — added in this PR)*

- **Released**: 2026-09-01. API model ID `claude-fable-5-1`.
- **Availability**: Claude API, Claude Platform on AWS, Amazon Bedrock
  (`anthropic.claude-fable-5-1`), Google Cloud Vertex AI, Microsoft Foundry, OpenRouter
  (`anthropic/claude-fable-5.1`, live day-one).
- **Specs**: 1M-token context (the full window at flat per-token pricing), 128K max output,
  adaptive thinking always on with a five-level effort setting defaulting to `high`.
- **Pricing**: **$10 / $50** per 1M in/out — *unchanged* from Fable 5. The change is caching:
  **cache hits and refreshes fall 75%, from $1 to $0.25 per 1M** (a 0.025x multiplier on base input
  versus the 0.1x every other Claude model uses). 5-minute cache writes $12.50/1M, 1-hour writes
  $20/1M. Batch API is half rate ($5/$25). Anthropic estimates ~25% savings on typical workloads,
  up to ~45% on heavily agentic ones.
- **Applied**: model record + Anthropic (Developer + Inference), Amazon Bedrock and OpenRouter
  inference rows; three cost records (Anthropic, Bedrock, OpenRouter), each at $10/$50 with
  $0.25/1M cache read. `PriorVersionID` → Claude Fable 5.
- **Ranks assigned**: PowerRank **27** (above Claude Fable 5 / Claude Opus 5 / Grok 4.6 /
  Gemini 3.1 Pro at 26), SpeedRank **6** (matching Fable 5), CostRank **10**.
- **Sources**:
  - <https://platform.claude.com/docs/en/about-claude/pricing>
  - <https://www.anthropic.com/claude-fable-and-mythos-5-1>
  - <https://openrouter.ai/anthropic/claude-fable-5.1>

### 2. OpenAI — **GPT-6 Astra** *(NEW — added in this PR)*

- **Released**: 2026-09-03. API model ID `gpt-6-astra`.
- **Specs**: **1,050,000-token context**, 128K max output. Streaming, Structured Outputs, computer
  use, Programmatic Tool Calling, multi-agent orchestration, explicit prompt caching, persisted
  reasoning. `reasoning.effort` accepts `low`, `medium`, `high`, `xhigh`, `max` — but **not**
  `none`, a change from GPT 5.6.
- **Pricing (short context, ≤272K input)**: $10 input / $1 cached input / **$12.50 cache write** /
  $50 output per 1M. Note the cache-write charge: earlier OpenAI models did not bill cache writes.
- **Long-context surcharge**: a request whose input exceeds **272,000 tokens** is rebilled *in its
  entirety* at 2x input/cache and 1.5x output — $20 / $2 / $25 / $75 per 1M. Only the short-context
  rate is recorded; the Comments field spells out the second tier for whoever needs it.
- **Availability caveat**: rollout began Sept 3 with a limited set of organizations and widened over
  the following days. Microsoft listed it in Foundry the same day at $10/$50 Global Standard, but
  **behind the Limited Access Program**, in Global and US Data Zone flavours only (no EU Data Zone).
  AWS's OpenAI model cards still ended at GPT-5.6 as of early September, so **no Bedrock row was
  added**. Astra was absent from OpenRouter as of Sept 4, so **no OpenRouter row was added** either.
- **Applied**: model record + OpenAI (Developer + Inference) and Azure inference rows; cost records
  for OpenAI and Azure at $10/$50. `PriorVersionID` → GPT 5.6.
- **Ranks assigned**: PowerRank **27**, SpeedRank **7**, CostRank **10**.
- **Sources**:
  - <https://developers.openai.com/api/docs/models/gpt-6-astra>
  - <https://aicybr.com/blog/gpt-6-astra-api-pricing-rollout>
  - <https://www.unite.ai/microsoft-brings-openais-gpt-6-astra-to-foundry-with-limited-access/>
  - <https://technspire.com/en/blog/gpt-6-astra-foundry-price-gate-eu-gap>

### 3. Google — **Gemini 3.8 Flash** *(NEW — added in this PR)*

- **Released**: 2026-09-02. Model ID `gemini-3.8-flash`.
- **Specs**: 1M-token input context, **64K output cap** (65,536), knowledge cutoff March 2026.
  Multimodal input (text, image, audio, video, PDF); text output. Function calling, code execution,
  search grounding, structured output, tunable thinking levels (low/medium/high).
- **Pricing**: **$0.75 / $3.75** per 1M introductory — the *same* headline rate as Gemini 3.7 Flash,
  so this is a capability upgrade at flat cost. Cached input $0.075/1M. **Intro window runs through
  2026-12-31**; standard pricing $1.50/$7.50 takes effect **2027-01-01**, when cached input also
  doubles to $0.15/1M and cache storage from $0.50 to $1.00 per 1M per hour.
- **Applied**: model record + Google (Developer + Inference), Vertex AI (Developer + Inference) and
  OpenRouter inference rows; cost records for Google and Vertex AI. `PriorVersionID` → Gemini 3.7
  Flash.
- **Ranks assigned**: PowerRank **26** (one above Gemini 3.7 Flash's 25), SpeedRank **11**,
  CostRank **5** — same speed/cost tier as 3.7 Flash, since the rate is identical.
- **Sources**:
  - <https://ai.google.dev/gemini-api/docs/latest-model>
  - <https://deepmind.google/models/model-cards/gemini-3-8-flash/>
  - <https://tokencost.app/blog/gemini-3-8-flash-introductory-price-expiry>

### 4. Meta — **Muse Spark 1.3** *(NEW — added in this PR, with Meta as a new vendor)*

- **Released**: 2026-09-02. Multimodal reasoning model for long-horizon agentic work, coding and
  computer use. Text, image and video input; **1,048,576-token context**.
- **Meta publishes neither a parameter count nor a maximum output length**, and the model's `max`
  reasoning mode is held back pending further safety testing — so `MaxOutputTokens` is deliberately
  left unset on the vendor row rather than guessed.
- **Pricing**: Standard **$1.25 / $4.25** per 1M with $0.15/1M cached input. A **Contributor tier**
  runs $0.10/$0.20 per 1M in exchange for letting Meta train on submitted prompts and outputs —
  **not recorded**, because opting into that is a data-governance decision, not a pricing one.
- **How it's wired**: Meta is added to `.ai-vendors.json` (CredentialType `API Key`) as a **Model
  Developer only**; inference goes through **OpenRouter** (`meta/muse-spark-1.3`,
  `DriverClass: OpenRouterLLM`). This is the same shape already used for NVIDIA/Nemotron and
  Thinking Machines Lab/Inkling, and it resolves the "onboard Meta" item open since 2026-08-17
  **without inventing a `MetaLLM` driver class that does not exist in the codebase**.
- **Caveat worth reading**: VentureBeat notes Meta's headline benchmark figures come from a variant
  developers cannot broadly use yet. Ranks are set conservatively on that basis.
- **Ranks assigned**: PowerRank **21** (between MiniMax-M2.7 at 21 and Inkling at 20), SpeedRank
  **8**, CostRank **4**.
- **Sources**:
  - <https://research.meta.ai/blog/introducing-muse-spark-1-3>
  - <https://openrouter.ai/meta/muse-spark-1.3>
  - <https://www.bloomberg.com/news/articles/2026-09-02/meta-releases-more-powerful-ai-model-edging-closer-to-rivals>
  - <https://venturebeat.com/technology/meta-says-muse-spark-1-3-has-frontier-performance-but-its-best-results-come-from-a-model-developers-cant-broadly-use-yet>

---

## Pricing Changes Detected

| Model | Vendor | Previous (In/Out) | Current (In/Out) | Change | Applied? |
|---|---|---|---|---|---|
| GLM 5.3 | Z.AI | *(no cost record — "pricing TBD")* | $1.40 / $4.40 (cache $0.26) | new record | **Yes** |
| Claude Fable 5.1 vs Fable 5 | Anthropic | $10 / $50, cache read $1 | $10 / $50, **cache read $0.25** | −75% cache read | **Yes** (new model) |
| Gemini 3.8 Flash vs 3.7 Flash | Google / Vertex | $0.75 / $3.75 | $0.75 / $3.75 | flat | **Yes** (new model) |
| GLM-5.3-Flash | Z.AI direct | $0.15 / $0.50 | $0.075 / $0.25 (50% promo) | promo | No — see flags |

### GLM 5.3 rate card — resolved

Added on 2026-08-24 with no `MJ: AI Model Costs` array because Zhipu/Z.AI had not posted a
per-token rate. Z.AI's developer docs now serve `glm-5.3` at
`https://api.z.ai/api/paas/v4/chat/completions` with **$1.40 input / $4.40 output / $0.26 cached
input** per 1M, effective 2026-08-19 — identical to the GLM-5.2 rate card. Cached-input *storage* is
listed as free for a limited time. A Z.AI Inference Provider row (`ZAILLM`, `glm-5.3`, 1M context /
128K output) and the cost record are both applied.

Sources: <https://docs.z.ai/guides/llm/glm-5.3> ·
<https://venturebeat.com/technology/glm-5-3-hits-the-api-at-1-4-4-4-per-million-tokens> ·
<https://www.requesty.ai/models/zai/glm-5.3>

---

## Model Updates & New Versions

Nothing beyond the four new records above. Specifically checked and found unchanged this week:
Mistral AI (shipped **Mistral OCR 4.1** GA and an Agentic Search retrieval layer — neither is an LLM
in MJ's inventory; **Leanstral 1.5** retires 2026-09-30 but has never been in the inventory),
Alibaba/Qwen (latest is still Qwen3.8-Max, Aug 3; no Qwen 4), Moonshot AI, MiniMax, DeepSeek,
Cohere (Rerank 4 Pro / 4 Fast unchanged since April), NVIDIA, Black Forest Labs, Inception Labs,
Thinking Machines Lab, Groq, Cerebras, Fireworks.ai.

---

## Deprecated / Sunset Models

### Claude Opus 4.1 — retired on the Anthropic API 2026-08-05 *(APPLIED in this PR)*

Anthropic's deprecation page records `claude-opus-4-1-20250805` as **Retired**: deprecated
2026-06-05, retired **2026-08-05**, recommended replacement `claude-opus-4-8`. Requests to it now
fail on Anthropic direct. Our metadata still carried the Anthropic Inference Provider row as
`Active` with a live cost record — a real gap this week's review caught.

Applied per §0.2 exactly:

- Anthropic **Inference Provider** row → `Status: "Inactive"`.
- Anthropic **cost row** → `Status: "Expired"` **and** `EndedAt: "2026-08-05T00:00:00.000Z"`.
- Anthropic **Model Developer** row left `Active` (attribution, not service).
- **Amazon Bedrock and OpenRouter rows left untouched** — those are the only two routes this model
  has besides Anthropic direct. Anthropic's page states that partner-operated platforms set their
  own retirement schedules, which covers the Bedrock row; the OpenRouter row is a gateway
  passthrough and likewise unaffected by an Anthropic-API retirement. Note that Anthropic's page
  names Bedrock *and Google Cloud* as the survivors on its own platforms — but our inventory has no
  Vertex AI route for Opus 4.1, so that phrase does not describe our rows and must not be copied
  into them. Of the two surviving routes only Amazon Bedrock carries a cost record.
- The model's `IsActive` was already `false` and was not touched.

Source: <https://platform.claude.com/docs/en/about-claude/model-deprecations>

### Not applied — see flags

Anthropic's page also marks `claude-opus-4-20250514` and `claude-sonnet-4-20250514` retired
(2026-06-15). Our `Claude 4 Opus` and `Claude 4 Sonnet` records each carry **three duplicate cost
rows** at what look like *batch* rates ($7.50/$37.50 and $1.50/$7.50) rather than the $15/$75 and
$3/$15 list rates. Expiring rows whose prices are already wrong would cement the error, so this is
flagged rather than edited.

---

## New Vendors Worth Considering

**Meta — added.** See §4 above: Model Developer role only, API Key credential type, inference via
OpenRouter.

Nothing else this week rises to the bar. Two near-misses, both deliberately skipped:

- **Poolside** (`Laguna XS 2.1`, a 33B-A3B coding agent model) — no verified rate card found.
- **OpenCode's "Omen Alpha"** (Sept 4, 500K-context stealth model, reference price $0.20/1M input) —
  anonymous stealth listings are exactly what guideline 6 excludes.

---

## Recommended Actions

Ranked by confidence and impact.

1. **[Applied]** Add `Claude Fable 5.1` — Anthropic (Developer + Inference), Amazon Bedrock and
   OpenRouter inference rows; three cost records at $10/$50 with $0.25/1M cache read.
2. **[Applied]** Add `GPT-6 Astra` — OpenAI (Developer + Inference) and Azure inference rows; cost
   records at $10/$50 (short-context tier). No Bedrock or OpenRouter row: neither was serving it.
3. **[Applied]** Add `Gemini 3.8 Flash` — Google and Vertex AI (Developer + Inference) plus
   OpenRouter inference rows; cost records at the $0.75/$3.75 introductory rate.
4. **[Applied]** Add `Meta` as a vendor and `Muse Spark 1.3` as a model, Model-Developer-only with
   OpenRouter inference. Closes the "onboard Meta" item open since 2026-08-17.
5. **[Applied]** Add the `GLM 5.3` Z.AI inference row and $1.40/$4.40 cost record. Closes the
   "pricing TBD" item from 2026-08-24.
6. **[Applied]** Expire `Claude Opus 4.1` on Anthropic direct (vendor row `Inactive`, cost row
   `Expired` + `EndedAt` 2026-08-05); Bedrock and OpenRouter left Active.
7. **[Flagged, not applied]** **Claude Mythos 5.1** (released alongside Fable 5.1, same $10/$50 rate
   card and same 1M/128K envelope, model ID `claude-mythos-5-1`). Access is gated to vetted
   organizations through Anthropic's Cyber Verification and Life Sciences Verification programs
   (Project Glasswing), initially US-only. Same category as OpenAI's Daybreak models flagged last
   week — a human should decide whether MJ models gated-access variants at all, and answer for both
   at once.
8. **[Flagged, not applied]** **Grok 4.7** — Musk announced a Sept 12 target on Sept 2 (2.1T
   parameters, up from Grok 4.6's 1.5T). As of Sept 5, xAI's developer docs still list Grok 4.6 as
   newest; no model ID, rate card, or context window published, and the date has slipped twice
   already. Re-check next week. Separately, **Grok 4.6 is now in Microsoft Foundry** (500K context) —
   an Azure vendor row could be added once Foundry pricing is confirmed.
9. **[Flagged, not applied]** **GLM-5.3-Flash promo expiry.** The 50% Z.AI promo (Z.AI direct
   $0.075/$0.25; OpenRouter $0.05/$0.1667) ends **2026-09-09 16:00 UTC**, two days after this
   report. Next week's run must expire the OpenRouter promo row (`Status: "Expired"` + `EndedAt`)
   and add the list-rate row. Note also that our Z.AI direct row records the $0.15/$0.50 *list*
   rate while the promo is live, so it needs no change.
10. **[Flagged, not applied]** **GPT-6 Astra on Bedrock.** OpenAI's launch named AWS Bedrock as a
    channel but AWS had not published a model card as of early September. Add the Bedrock row once
    it appears.
11. **[Flagged, not applied]** **Muse Spark Contributor tier** ($0.10/$0.20 per 1M) and a
    **first-party Meta inference route**. The Contributor tier grants Meta training rights over
    submitted data — a governance call. A Meta-direct route additionally needs a `MetaLLM` driver
    class, which does not exist in the codebase.
12. **[Flagged, not applied]** **`Claude 4 Opus` / `Claude 4 Sonnet` cost-row cleanup.** Both were
    retired on the Anthropic API 2026-06-15, but each carries three duplicate cost rows at apparent
    batch rates. Fix the prices first, then expire — doing it in the other order preserves bad data.
13. **[Flagged, not applied]** **`GLM 5.3` OpenRouter context window.** The OpenRouter row records
    `MaxInputTokens: 200000`, but Z.AI's own docs state a 1M-token window (the new Z.AI row uses
    1,000,000). Either OpenRouter caps its route or the original entry was a placeholder; verify
    against OpenRouter's listing before changing it.
14. **[Flagged, not applied — still open from prior weeks]** Reconcile the `DeepSeek V4 Pro` cost
    record dated 2026-08-16 ($0.66/$1.98), which matches neither DeepSeek's off-peak ($0.435/$0.87)
    nor peak ($1.32/$3.96) tier; resolve the `GPT 5.6` (Sol) pricing conflict against OpenAI's own
    page; coordinate a **FLUX family refresh** — BFL shipped **FLUX 3** on 2026-07-23 (unified
    image/video/audio) and our two FLUX records still carry `StartedAt` 2025-10-01, but FLUX 3's
    video/audio outputs need a cost-schema decision first; update `DeepSeek V4 Pro` / `V4 Flash`
    descriptions with the 0813 checkpoint, DSpark speculative decoding and effort levels; decide the
    modelling for `DeepSeek V4 Flash Vision Experimental` and OpenAI's **Daybreak Red / Daybreak
    Blue** (see item 7 — same question).

---

## Verification

`mj sync validate` needs a database and cannot run in this environment. The §0.3 pure-JSON
pre-flight check was run against both model files after every edit and prints **`OK`**:

- every `MJ: AI Model Vendors` `Status` ∈ {Active, Inactive, Deprecated, Preview}
- every `MJ: AI Model Costs` `Status` ∈ {Active, Pending, Expired, Invalid}
- every `Expired` cost row carries an `EndedAt`, and every `EndedAt` > its `StartedAt`

Additionally verified: every `@lookup:MJ: AI Vendors.Name=…` introduced resolves to a row in
`.ai-vendors.json` (including the new `Meta` row); every `PriorVersionID` resolves to an existing
model name; both JSON files re-serialize byte-identically to their on-disk form, so the diff
contains only intended changes; no `primaryKey`, `sync`, `__mj_CreatedAt` or `__mj_UpdatedAt` keys
were written on any new record.

---

## Research Sources

**Anthropic**
- <https://platform.claude.com/docs/en/about-claude/pricing>
- <https://platform.claude.com/docs/en/about-claude/model-deprecations>
- <https://www.anthropic.com/claude-fable-and-mythos-5-1>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5-1.html>
- <https://openrouter.ai/anthropic/claude-fable-5.1>

**OpenAI**
- <https://developers.openai.com/api/docs/models/gpt-6-astra>
- <https://aicybr.com/blog/gpt-6-astra-api-pricing-rollout>
- <https://www.unite.ai/microsoft-brings-openais-gpt-6-astra-to-foundry-with-limited-access/>
- <https://technspire.com/en/blog/gpt-6-astra-foundry-price-gate-eu-gap>
- <https://www.cloudzero.com/blog/gpt-6-pricing/>

**Google**
- <https://ai.google.dev/gemini-api/docs/latest-model>
- <https://deepmind.google/models/model-cards/gemini-3-8-flash/>
- <https://cloud.google.com/vertex-ai/generative-ai/pricing>
- <https://tokencost.app/blog/gemini-3-8-flash-introductory-price-expiry>

**Meta**
- <https://research.meta.ai/blog/introducing-muse-spark-1-3>
- <https://openrouter.ai/meta/muse-spark-1.3>
- <https://www.bloomberg.com/news/articles/2026-09-02/meta-releases-more-powerful-ai-model-edging-closer-to-rivals>
- <https://www.mindstudio.ai/blog/muse-spark-1-3-pricing>
- <https://venturebeat.com/technology/meta-says-muse-spark-1-3-has-frontier-performance-but-its-best-results-come-from-a-model-developers-cant-broadly-use-yet>

**Z.AI / Zhipu**
- <https://docs.z.ai/guides/llm/glm-5.3>
- <https://venturebeat.com/technology/glm-5-3-hits-the-api-at-1-4-4-4-per-million-tokens>
- <https://www.requesty.ai/models/zai/glm-5.3>

**x.ai**
- <https://www.bighatgroup.com/blog/xai-weekly-2026-09-06/>
- <https://www.orcarouter.ai/blog/grok-4-7-release-date>

**Other vendors checked (no change)**
- <https://docs.mistral.ai/resources/changelogs>
- <https://openrouter.ai/blog/announcements/>
- <https://aireleasetracker.com/latest>
- <https://llm-stats.com/llm-updates>
- <https://www.aipricing.guru/cohere-pricing/>
- <https://bfl.ai/models>
