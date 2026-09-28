# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-09-28
**Research Period**: 2026-09-22 → 2026-09-28
**Base Branch**: `next`
**Research Branch**: `claude/magical-turing-e67z59`

> **Branch note.** The routine asks for `claude/ai-model-research-YYYY-MM-DD`. This session's runtime
> pins its own designated branch and forbids pushing anywhere else, so the branch name breaks the
> usual convention — the same situation as 2026-09-07, 09-14 and 09-21. Nothing else about the PR
> changes.

---

## Executive Summary

The busiest launch week of the quarter, and the first in a month where the work was mostly *adding*
rather than reconciling. **Four frontier models shipped inside 36 hours**, three of them from the
top three labs: **Claude Opus 5.5** (2026-09-22, $4/$20), **GPT-6 Sol** and **GPT-6 Luna**
(2026-09-22, $2/$10 and $0.10/$0.50 — both exactly half their GPT-5.6 predecessors), and
**Grok 4.7** (2026-09-21), which ends a five-week run of slipped dates. Xiaomi also open-sourced the
**MiMo V2.6** family under MIT. All six are applied, along with a **new `Xiaomi` vendor**.

Two structural notes matter more than any single price. First, **the industry moved to a price war
in the same 90 minutes**: Sol landed at Opus 5.5's exact rate band, and OpenAI halved the whole
GPT-6 tier. Second, **two of this week's four launches are not models at all** —
`gpt-6-luna-pro` is `gpt-6-luna` with `reasoning.mode=pro`, and Anthropic's fast mode now covers
Opus 5.5 at $8/$40 as a `speed` parameter. That is the third consecutive week that carried item 3
(how MJ models a request-level tier) has been reinforced by a new launch instead of resolved. It is
now the highest-value open question in this file.

One carried item closes: the **GLM-5.3-FlashX OpenRouter rate** is confirmed and recorded.

Eight edits across two files. Nothing required an expiry this week — no vendor sunset a route, and
no price fell on an existing record.

---

## Current Inventory Snapshot

- **206 models** in `.ai-models.json` (200 before this run), **178 active**, plus 4 Cohere rerankers
  in `.cohere-reranker-models.json` = **210 model records**
- **33 vendors** in `.ai-vendors.json` (32 before — **Xiaomi** added)

| Vendor | Bindings | Latest In-Inventory Model | Newest Cost Record |
|---|---:|---|---|
| **OpenRouter** | **119** | **MiMo V2.6 Pro / Flash (Sep 22)** | **2026-09-22** |
| **OpenAI** | **94** | **GPT-6 Sol, GPT-6 Luna (Sep 22)** | **2026-09-22** |
| Google | 49 | Gemini 3.8 Live Extended Thinking | 2026-09-15 |
| **Anthropic** | **44** | **Claude Opus 5.5 (Sep 22)** | **2026-09-22** |
| Vertex AI | 41 | Gemini 3.8 Flash | 2026-09-02 |
| Alibaba Cloud | 29 | Qwen3.8-Flash (Aug 26) | 2026-08-26 |
| **x.ai** | **27** | **Grok 4.7 (Sep 21)** | **2026-09-21** |
| **Azure** | **27** | **GPT-6 Sol / Luna (routes)** | 2026-08-26 |
| Mistral AI | 26 | Mistral Medium 3.5 | 2026 mid-year |
| **Amazon Bedrock** | **21** | **GPT-6 Sol / Luna, Claude Opus 5.5** | **2026-09-22** |
| Groq | 17 | — | — |
| Z.AI | 16 | GLM-5.3-FlashX (Sep 18) | **2026-09-18 (+OpenRouter)** |
| Fireworks.ai | 15 | — | — |
| Cerebras | 11 | — | — |
| Moonshot AI | 10 | Kimi K3 | 2026-07-16 |
| DeepSeek | 6 | DeepSeek V4.1 Flash (Sep 10) | 2026-09-10 |
| **Xiaomi** | **2** | **MiMo V2.6 Pro / Flash (Sep 22)** | **(dev attribution only)** |
| Meta | 1 | Muse Spark 1.3 (Sep 2) | 2026-09-02 |

---

## New Models Available

### 1. Anthropic — **Claude Opus 5.5** *(NEW — applied)*

Released **2026-09-22**. Anthropic's new recommended default for most workloads, and the
best-sourced finding in this report: every figure below comes from Anthropic's own rate card and
model-overview pages, both of which are reachable from this environment.

| | Claude Opus 5 (existing) | **Claude Opus 5.5 (new)** |
|---|---|---|
| Claude API ID | `claude-opus-5` | **`claude-opus-5-5`** |
| Price per 1M | $5 / $25 | **$4 / $20** (−20%) |
| Cache read | $0.50 (0.1x) | **$0.20 (0.05x)** |
| Cache write 5m / 1h | $6.25 / $10 | **$5 / $8** |
| Batch | $2.50 / $12.50 | **$2 / $10** |
| Context / max output | 1M / 128K | 1M / 128K |
| Default effort | — | **`medium`** (vs `high` on Fable 5.1 and Sonnet 5) |
| Fast mode | $10 / $50 | **$8 / $40** |
| Retirement (tentative) | — | Not sooner than 2027-09-22 |
| Ranks | Power 26, Speed 7, Cost 10 | **Power 27, Speed 8, Cost 9** |

**The 0.05x cache multiplier is new to this file.** Anthropic now publishes three different cache-read
ratios — 0.025x on Fable 5.1 and Mythos 5.1, **0.05x on Opus 5.5 only**, and the standard 0.1x
everywhere else. The $0.20 figure is recorded directly rather than derived.

**Rank calibration.** PowerRank **27** matches Claude Fable 5.1 and GPT-6 Astra: Anthropic positions
Opus 5.5 as matching Fable 5.1 on most tasks, and independent measurement backs it — its
Terminal-Bench 4.0 score (66.4%) tops even GPT-6 Astra's 57.9%. SpeedRank moves 7 → **8** on
Anthropic's "noticeably faster" claim and the docs' "Moderate" latency band (Fable 5.1 is "Slower" at
6). CostRank **9** is the one judgement call: $4/$20 is genuinely below the saturated `10` band, but
`GPT 5.6` already carries `10` at the *identical* $4/$20. That inconsistency is pre-existing; see
Recommended Action 8.

**Three deliberate omissions.**

- **No Amazon Bedrock cost row.** The Bedrock route is wired (`anthropic.claude-opus-5-5`, confirmed
  by Anthropic's own docs) but the rate is **not** recorded, because sources conflict: secondary
  reporting says Bedrock is at parity ($4/$20), while OpenRouter's Bedrock sub-route is reported at
  **$2.20/$11**. Anthropic's page explicitly says Bedrock sets its own pricing. Two contradictory
  figures means no figure — this follows the GLM-5.3-FlashX precedent from last week.
- **No Vertex AI or Azure route.** Anthropic documents `claude-opus-5-5` on both Google Cloud and
  Microsoft Foundry, but neither `Claude Opus 5` nor `Claude Fable 5.1` carries those routes in MJ.
  Adding them for 5.5 alone would make the Claude family inconsistent. Noted in the Description;
  see Recommended Action 6.
- **No separate "Claude Opus 5.5 Fast" record.** Fast mode is a `speed: "fast"` parameter, not a
  model id — the whole point of carried item 3. Creating the record would entrench the modelling
  error a second time.

Sources: <https://platform.claude.com/docs/en/about-claude/pricing> ·
<https://platform.claude.com/docs/en/about-claude/models/overview> ·
<https://openrouter.ai/anthropic/claude-opus-5.5> ·
<https://www.eesel.ai/blog/claude-opus-5-5-pricing> ·
<https://shattered.io/claude-opus-5-5-launch-pricing-2026/>

### 2. x.ai — **Grok 4.7** *(NEW — applied)*

Released **2026-09-21**, ending the five-slip watch this report has carried since 2026-08-24. The
recommendation from those reports — *"stop treating the announced date as information"* — was correct
and is now retired: there is a model id, a rate card and independent benchmarks.

**Price is unchanged from Grok 4.6**: $2/$6 per 1M below 200K prompt tokens, $0.50 cached, with the
whole request re-rated at $4/$12 / $1.00 once a prompt reaches 200K. Context stays 500K.

The gain is broad rather than narrow, which is why PowerRank moves 26 → **27**:

| Benchmark | Grok 4.6 | **Grok 4.7** |
|---|---|---|
| AA Coding Agent Index | 47 | **56** |
| DeepSWE v1.1 | 65% | **73%** |
| Terminal-Bench 4.0 | 18% | **33%** |
| SWE-Atlas-QnA | 58% | **63%** |
| GDPval-AA (Elo) | 1605 | **1695** |
| Analytical quality (Elo) | 1690 | **1994** |
| AA-Omniscience hallucination | 34% | **29%** (lower is better) |

xAI describes it as a **new and larger base model** with a longer RL run weighted toward
many-hour tasks — not a re-tune of 4.6. SpeedRank and CostRank stay at 6: nothing suggests it is
faster, and the rate card is identical.

**`MaxOutputTokens` is deliberately conservative, and this is the one figure to re-check.** xAI
publishes **no** text output cap for Grok 4.7. Third-party model cards advertise **450,000** tokens,
which would be remarkable against a 500K context — and which xAI's own "no stated limit" wording
neither confirms nor denies. The record carries **128,000**, copied from the Grok 4.6 route, because
the two failure directions are not symmetric: too low under-uses the model, too high makes requests
fail at call time. Raise it when xAI documents a number. See Recommended Action 7.

**Bedrock and Azure are deliberately not wired.** Both still list Grok 4.6 as their newest Grok.
`x.ai` direct and OpenRouter only.

Sources: <https://artificialanalysis.ai/articles/benchmarking-grok-4-7> ·
<https://llm-stats.com/models/grok-4.7> · <https://pricepertoken.com/pricing-page/model/xai-grok-4.7> ·
<https://www.cometapi.com/what-is-grok-4-7/> · <https://kingy.ai/blog/grok-4-7-release-features-pricing-access/> ·
<https://www.orcarouter.ai/blog/grok-4-7-vs-grok-4-6> · <https://www.layer3labs.io/guides/grok-4-7-limits>

### 3. OpenAI — **GPT-6 Sol** *(NEW — applied)*

Released **2026-09-22**, nineteen days after GPT-6 Astra and roughly 90 minutes after Claude Opus
5.5. **$2/$10 per 1M — half the $4/$20 the GPT-5.6 generation settled at**, landing it in Opus 5.5's
exact rate band. Cached input $0.20, cache write $2.50. 1,050,000-token context, 128K max output.

**The benchmarks are genuinely mixed, and the record says so.** This is not a uniform upgrade:

| Benchmark | GPT-5.6 Sol | **GPT-6 Sol** | Claude Opus 5 | Claude Opus 5.5 |
|---|---|---|---|---|
| AA Coding Agent Index (max effort) | 55 | **57** | — | — |
| Terminal-Bench 4.0 | 37% | **43%** | — | 66.4% |
| SWE-Atlas-QnA | 54 | **58** | — | — |
| DeepSWE | 72.7% | **68.8%** ↓ | 73.7% | — |
| OSWorld 2.0 | 66.2% | **64.4%** ↓ | 70.2% | — |

Sol *regresses* against its own predecessor on DeepSWE and OSWorld 2.0, and Opus 5.5 leads it by
~7 points on AutomationBench and ~5 on FrontierCode. PowerRank **25** reflects that: above the GPT
5.x band, below Claude Opus 5 (26) and GPT-6 Astra (27). CostRank **5** matches Claude Sonnet 5, the
existing anchor at the same $2/$10.

**No `PriorVersionID`.** Sol's natural predecessor is `gpt-5.6-sol`, which **MJ does not carry** —
see Recommended Action 9 — and `GPT-6 Astra` already claims `GPT 5.6`. Asserting a succession from a
model Sol did not supersede would be worse than leaving the field empty.

**Four routes wired, three priced.** OpenAI, Azure/Foundry, Amazon Bedrock and OpenRouter are all
confirmed live. Cost rows exist for OpenAI ($2/$10, authoritative), Amazon Bedrock ($2/$10, on the
documented "Bedrock matches OpenAI direct in commercial regions" rule) and OpenRouter ($2/$10,
confirmed by OpenRouter at launch). **Azure carries no cost row** — Microsoft's own rate card for the
GPT-6 tier could not be read during this run, and `developers.openai.com` is unreachable from this
environment.

Sources: <https://www.iclarified.com/102351/openai-cuts-api-prices-50-with-gpt-6-sol-and-luna> ·
<https://www.eesel.ai/blog/gpt-6-sol> · <https://www.sim.ai/models/openai/gpt-6-sol> ·
<https://www.vellum.ai/blog/gpt-6-sol-and-luna-benchmarks-explained> ·
<https://kingy.ai/blog/gpt-6-sol-luna-specs-benchmarks-pricing-comparison/> ·
<https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/> ·
<https://openrouter.ai/openai/gpt-6-sol>

### 4. OpenAI — **GPT-6 Luna** *(NEW — applied)*

Released **2026-09-22**. **$0.10/$0.50 per 1M** — half GPT-5.6-luna's $0.20/$1.20, and one of the
cheapest frontier-lab routes in the inventory. Cached input $0.01, cache write $0.125. Same
1,050,000 / 128K envelope as Sol.

Quality per dollar is the story, and it is stark against the model MJ would otherwise reach for:

| | **GPT-6 Luna** | Gemini 3.5 Flash-Lite (existing) |
|---|---|---|
| AA Intelligence Index | **37.26** | 22.17 |
| Declines to answer when unsure | **23.3%** | 65.6% |
| MMMU-Pro (multimodal) | 75.5% | **79.0%** |
| Price per 1M | **$0.10 / $0.50** | $0.30 / $2.50 |
| Cost per index task | **$0.068** | $0.124 |
| Ranks | **Power 20, Speed 11, Cost 2** | Power 19, Speed 12, Cost 3 |

PowerRank **20** sits just above Gemini 3.5 Flash-Lite (19), which it beats by 15 points on the
Intelligence Index while losing on multimodal reasoning. CostRank **2** matches GLM-5.3-Flash
($0.15/$0.50), the nearest existing price anchor. Note that `GPT 5.6-luna` carries CostRank **6** at
*twice* this price — another instance of the CostRank drift in Recommended Action 8.

`PriorVersionID` → `GPT 5.6-luna`, which MJ does carry and which Luna genuinely supersedes at
exactly half the price.

**`gpt-6-luna-pro` is deliberately NOT a separate record.** It is this same model served with
`reasoning.mode=pro`, at the same per-token rate. Recording it would duplicate the model and
double-count the route — the same trap `Claude Opus 5 Fast` already fell into.

Sources: <https://www.iclarified.com/102351/openai-cuts-api-prices-50-with-gpt-6-sol-and-luna> ·
<https://go.tabbit.ai/blog/gpt-luna-6-pricing> · <https://www.vakati-tech.ai/models/openai-gpt-6-luna> ·
<https://www.orcarouter.ai/blog/gpt-6-luna-vs-gemini-3-5-flash-lite> ·
<https://www.orcarouter.ai/blog/gpt-6-luna-pro-explained> · <https://openrouter.ai/openai/gpt-6-luna>

### 5. Xiaomi — **MiMo V2.6 Pro** and **MiMo V2.6 Flash** *(NEW — applied, with a new vendor)*

Released **2026-09-22** and **open-sourced under MIT**, the whole family at once. These are the
lowest-confidence of this week's six additions and the reasoning for including them is stated
plainly below.

| | **MiMo V2.6 Pro** | **MiMo V2.6 Flash** |
|---|---|---|
| OpenRouter slug | `xiaomi/mimo-v2.6-pro` | `xiaomi/mimo-v2.6-flash` |
| Architecture | MoE, >1T total params | MoE, 309B total / 15B active, hybrid attention |
| Context / max output | 1,050,000 / 131,072 | 1,048,576 / 131,072 |
| Price per 1M | $0.435 / $0.87, cache read $0.004 | $0.14 / $0.28, cache read $0.0028 |
| RL training cost | ~$2.62M | ~$0.85M |
| Ranks | **Power 23, Speed 6, Cost 3** | **Power 18, Speed 9, Cost 2** |

**Why they clear the bar.** Xiaomi is a major vendor, the models are GA rather than preview, the
weights are MIT, the rate is consistent across Xiaomi's own API and OpenRouter, and Pro is reported
to top the open-weight field on release. Guideline 6 is satisfied.

**Why PowerRank 23 and not higher.** Pro is reported to *top* the open models, which would argue for
24 — above `GLM 5.3` (23), currently MJ's highest-ranked open-weight model. **23 is used instead**:
the "tops the open models" claim rests on a single benchmark snapshot from one source, and ranking a
brand-new entrant above an established one on that basis is not warranted. Equal-to, not above.

**Wired through OpenRouter only.** No `XiaomiLLM` driver class exists, and guideline 4 says not to
invent one. The `Xiaomi` vendor row therefore records **Model Developer attribution only** and
carries no inference route — exactly the shape `Meta`/`Muse Spark 1.3` and `Sakana AI`/`Fugu` already
use in this file.

**One honest limitation recorded in both Descriptions.** These models are natively **omnimodal**
(text, image, video *and* audio input). `InheritTypeModalities: true` makes them inherit the `LLM`
type's modalities, which does **not** express video or audio. Correcting that needs explicit
`MJ: AI Model Modalities` rows, which could not be authored against a verified modality catalogue in
this run. Flagged rather than guessed — see Recommended Action 10.

`MiMo-V2.6-Pro-UltraSpeed`, a third family member and a serving variant rather than new weights, is
**not** modelled — the same call made for `GLM-5.3-FlashX` vs `GLM-5.3-Flash` last week, in the
opposite direction, because UltraSpeed's rate could not be confirmed.

Sources: <https://openrouter.ai/xiaomi/mimo-v2.6-pro> · <https://openrouter.ai/xiaomi/mimo-v2.6-flash> ·
<https://www.requesty.ai/models/xiaomi/mimo-v2.6-pro> · <https://www.requesty.ai/models/xiaomi/mimo-v2.6-flash> ·
<https://www.eesel.ai/blog/xiaomi-mimo-v2-6-pricing> ·
<https://mixed-news.com/en/xiaomi-mimo-v2-6-pro-top-open-model-2-62m-rl-run/> ·
<https://mimo.mi.com/models/en-US/mimo-v2.6-flash> · <https://en.wikipedia.org/wiki/Xiaomi_MiMo>

---

## Pricing Changes Detected

| Model | Vendor | Previous (In/Out) | Current (In/Out) | Change | Applied? |
|---|---|---|---|---|---|
| Claude Opus 5.5 | Anthropic | *(new model)* | $4 / $20, cache $0.20 | new record | **Yes** |
| Claude Opus 5.5 | OpenRouter | *(new model)* | $4 / $20, cache $0.20 | new record | **Yes** |
| Grok 4.7 | x.ai | *(new model)* | $2 / $6, cache $0.50 | new record | **Yes** |
| Grok 4.7 | OpenRouter | *(new model)* | $2 / $6, cache $0.50 | new record | **Yes** |
| GPT-6 Sol | OpenAI | *(new model)* | $2 / $10, cache $0.20 | new record | **Yes** |
| GPT-6 Sol | Amazon Bedrock | *(new model)* | $2 / $10 | new record | **Yes** |
| GPT-6 Sol | OpenRouter | *(new model)* | $2 / $10, cache $0.20 | new record | **Yes** |
| GPT-6 Luna | OpenAI | *(new model)* | $0.10 / $0.50, cache $0.01 | new record | **Yes** |
| GPT-6 Luna | Amazon Bedrock | *(new model)* | $0.10 / $0.50 | new record | **Yes** |
| GPT-6 Luna | OpenRouter | *(new model)* | $0.10 / $0.50, cache $0.01 | new record | **Yes** |
| MiMo V2.6 Pro | OpenRouter | *(new model)* | $0.435 / $0.87, cache $0.004 | new record | **Yes** |
| MiMo V2.6 Flash | OpenRouter | *(new model)* | $0.14 / $0.28, cache $0.0028 | new record | **Yes** |
| **GLM-5.3-FlashX** | **OpenRouter** | *(route wired, no price)* | **$0.37 / $1.25, cache $0.09** | **carried item closed** | **Yes** |

**No existing cost row changed, and nothing was expired.** Every price movement this week arrived as
a new model rather than a re-rate of an old one, which is why the deprecation machinery in §0.2 did
not fire at all.

### GLM-5.3-FlashX on OpenRouter — last week's follow-up, closed

The 2026-09-21 run wired the `z-ai/glm-5.3-flashx` route but deliberately withheld the rate, because
searches kept returning GLM-5.3-*Flash* gateway figures ($0.075/$0.25) intermixed with FlashX's. It
is now confirmed at **$0.37/$1.25 — at parity with Z.AI direct on input and output**. The one
difference worth recording: **cache read is $0.09 on OpenRouter versus $0.075 on Z.AI direct.**

The stale sentence in the Z.AI cost row's `Comments` ("NO OpenRouter cost row is recorded yet …
Confirm and add in a later run") has been replaced, since it is now false. That is the single
deletion in this diff.

Sources: <https://openrouter.ai/z-ai/glm-5.3-flashx> ·
<https://aihubmix.com/blog/glm-5-3-flash-pricing-compared-openrouter-z-ai-and-aihubmix>

### Checked and unchanged

**Anthropic** — verified directly against `platform.claude.com`, which is reachable. Fable 5.1 and
Mythos 5.1 hold $10/$50 with 0.025x cache reads; Opus 5, 4.8, 4.7, 4.6 and 4.5 all hold $5/$25;
Sonnet 5 holds $2/$10 (the cancelled $3/$15 increase remains cancelled); Sonnet 4.6/4.5 hold $3/$15;
Haiku 4.5 holds $1/$5. Opus 5, 4.8, 4.7, 4.6, 4.5, Sonnet 4.6 and 4.5 are now listed as **"Legacy
models (still available)"** — *available*, not retired. **No `IsActive` or vendor `Status` change is
warranted on any of them**, and the temptation to mark the Opus tier down on the arrival of 5.5 is
precisely the error §0.2 exists to prevent.

**Fast mode** — now covers Opus 5.5 ($8/$40), Opus 5 and Opus 4.8 ($10/$50 each), is labelled
**research preview**, and is **first-party only** (not on Claude Platform on AWS, Bedrock or Vertex).
It is explicitly *unavailable* on Opus 4.7 (returns an error) and *silently ignored* on Opus 4.6
(runs at standard speed, bills at standard rates). Our `Claude Opus 5 Fast` record's $10/$50 is still
correct and needed no edit.

**Google** — no new Gemini. 3.8 Flash (2026-09-02) remains the newest; the introductory $0.75/$3.75
holds through 2026-12-31. The 2027-01-01 step-up to $1.50/$7.50 remains a calendar item.

**Mistral** — the €3B Series D (2026-09-08, >€21B post-money) did not move the rate card: Medium 3.5
$1.50/$7.50, Large 3 $0.50/$1.50, Small 4 $0.15/$0.60, Ministral from $0.10. No change.

**Black Forest Labs** shipped **FLUX 3 Action** (2026-09-24), a 7B open-weights *world action* model
for robotics (tops RoboLab-120 at 42.92%, integrated into Hugging Face LeRobot, runs on Jetson).
**Not added**: MJ has no `AIModelTypeID` for an action-prediction model, and filing it as an image
model would be wrong. Recorded here so it is not re-discovered as new.

**Groq**, **Cerebras**, **Alibaba/Qwen**, **Moonshot/Kimi**, **MiniMax**, **DeepSeek**,
**Fireworks.ai**, **Cohere**, **NVIDIA**, **Meta**, **Inception Labs**, **Thinking Machines Lab**,
**Vertex AI**: no releases or rate changes found in the window. The **NVIDIA Nemotron Coalition** is
still the March 2026 announcement — no Nemotron 4 id, card or rate.

---

## Model Updates & New Versions

**No existing model record changed this week** beyond the GLM-5.3-FlashX comment correction. The four
frontier launches were all genuinely new models rather than re-pointed API names, so nothing needed
an `APIName`, token-limit or capability edit.

### The pattern worth naming: two of this week's launches are parameters, not models

This is the third consecutive week a launch has landed on carried item 3, and it now has two
independent confirmations in seven days:

- **`gpt-6-luna-pro`** is `gpt-6-luna` with `reasoning.mode=pro`. Same weights, same per-token rate,
  separate OpenRouter slug.
- **Anthropic fast mode** now spans three models via `speed: "fast"` + a beta header, at a *different
  price* per model ($8/$40 on Opus 5.5, $10/$50 on Opus 5 and 4.8).

MJ models an inference route as `(vendor, DriverClass, APIName)`. Neither of these fits, and they
fail in opposite directions: Luna Pro would **duplicate** a model if recorded, while fast mode
**cannot be priced at all** unless it is recorded. Anthropic's case is the urgent one, because the
price genuinely differs and the deprecated `claude-opus-5-fast` id that our record depends on is
already on borrowed time (deprecated 2026-09-01, still serving).

The recommendation from 2026-09-21 stands unchanged and is now better evidenced: a
`ModelConfiguration.LLM` tier flag, letting one model record carry a per-tier price. See
Recommended Action 3.

---

## Deprecated / Sunset Models

**Nothing was deprecated or expired this week.** No vendor announced a sunset, no route went dark,
and no cost row received an `EndedAt`. The §0.2 recipe did not fire.

Three standing items were re-checked and deliberately left alone:

- **Anthropic's "legacy" relabelling is not a deprecation.** Opus 5 and the 4.x tier moved into a
  "Legacy models (still available)" list on the docs overview when 5.5 shipped. They still serve,
  still bill, and their retirement dates are unchanged. No edit.
- **OpenAI's 2026-10-23 tranche** (`o1`, `o1-pro`, `o3-mini`, `o4-mini`, possibly `GPT 4.1 Nano` and
  `GPT 4o`) is **still 25 days out and still not due**. `developers.openai.com` remains unreachable
  from this environment, so the `gpt-4o` scope question flagged on 2026-09-14 is **still open** for a
  third week. Whoever applies this must read OpenAI's own page directly.
- **`o3`'s API shutdown** remains 2026-12-11. Our rows are correct today.

The **DeepSeek V4 Pro** near-miss from last week — announced retirement, reversed in 45 hours — needs
no further action. V4 Pro still serves at unchanged billing, and remains untouched.

---

## New Vendors Worth Considering

**One added: `Xiaomi`** — required before the two MiMo V2.6 models could resolve their
`@lookup:MJ: AI Vendors.Name=Xiaomi` references. Model Developer attribution only, `API Key`
credential type, no inference route (no driver class exists). Verified after the edit that the lookup
resolves against `.ai-vendors.json`, and that `metadata/.mj-sync.json`'s `directoryOrder` pushes
`ai-vendors` **before** `ai-models`, so the vendor row is created before anything references it.

**One still held: `TypeSafe AI`** (carried from 2026-09-21) — blocked on the same model-type question
as `Jev 1.13` itself. Adding the vendor without the model serves no purpose.

---

## A latent data bug found while verifying — reported, not fixed

Verification of primary-key uniqueness across `metadata/` turned up something not previously
recorded. **Four models each carry three byte-identical `Active` `MJ: AI Model Costs` rows, and two
of the three share the same `primaryKey.ID`**:

| Model | Vendor | Rows | Duplicated PK | Price |
|---|---|---:|---|---|
| `Llama 4 Maverick` | Groq | 3 | `CCA0A4DC-…A7CA` ×2 | $0.50 / $0.77 |
| `Claude 4 Sonnet` | Anthropic | 3 | `6C644B8C-…539B` ×2 | $1.50 / $7.50 |
| `Claude 4 Opus` | Anthropic | 3 | `A727C77A-…CCF5` ×2 | $7.50 / $37.50 |
| `Llama 4 Scout` | Groq | 3 | `DA3A0E18-…3F01` ×2 | $0.11 / $0.34 |

All four are **pre-existing in `next`** (confirmed against `git show HEAD:`) and untouched by this
PR. Two consequences:

1. **A duplicated PK within one entity means `mj sync push` upserts the second row over the first.**
   The file claims three cost rows; the database gets two. That divergence is invisible from either
   side.
2. **`Claude 4 Opus` and `Claude 4 Sonnet` have `ProcessingType: "Batch"` on all three rows and no
   `Realtime` row at all.** The prices are *correct* for batch (they are exactly Anthropic's 50%
   batch rates), so this is **not** the mispricing that carried item 12 assumed — the actual defect
   is that "what did Claude 4 Opus cost at realtime?" is unanswerable from our metadata. Carried item
   12's description should be corrected accordingly.

Both models are already `IsActive: false` with a `Deprecated` Anthropic route, so §0.2 is satisfied
for them — except that their cost rows remain `Active` with no `EndedAt`, the same shape as the
`o1-mini` case in carried item 13. **Not fixed here**: per guidelines 2 and 10 this belongs in the
single deliberate pass that item 13 already calls for, not bolted onto a research PR.

---

## Recommended Actions

Items 1–2 are this week's applied work; 3–10 are open, mixing new and carried. The carry-forward list
is now in its **fifth** consecutive week. Items 3, 8, 12, 13 and 14 are each blocking downstream
work and none can be resolved by a research run. **A triage session is overdue.**

1. **[Applied]** Add **six models** — `Claude Opus 5.5`, `Grok 4.7`, `GPT-6 Sol`, `GPT-6 Luna`,
   `MiMo V2.6 Pro`, `MiMo V2.6 Flash` — and the **`Xiaomi`** vendor. 12 new cost rows across 5
   vendors.
2. **[Applied]** Record the **GLM-5.3-FlashX OpenRouter rate** ($0.37/$1.25, cache $0.09) and correct
   the now-false comment on its Z.AI row. **Closes the 2026-09-21 follow-up.**
3. **[Flagged — needs a human; now the highest-value open item]** **How should MJ model a
   request-level tier?** Two launches this week (`gpt-6-luna-pro`, fast mode on Opus 5.5) confirm this
   is the industry's direction, not an Anthropic quirk. Recommended: a `ModelConfiguration.LLM` tier
   flag that lets one model record carry a per-tier price. Driver work, not metadata work. Has a
   hard deadline: whenever Anthropic withdraws `claude-opus-5-fast`.
4. **[Flagged — new]** **Claude Opus 5.5 on Amazon Bedrock has no cost row** because sources conflict
   ($4/$20 parity vs $2.20/$11 via OpenRouter's Bedrock sub-route). Read the AWS rate card and add
   one row. Small, self-contained, and someone with AWS console access can close it in minutes.
5. **[Flagged — new]** **GPT-6 Sol and Luna have no Azure cost row.** Routes are wired and confirmed
   live in Microsoft Foundry; only the rate is missing. Same shape as item 4.
6. **[Flagged — new, consistency]** **Should the Claude family carry Vertex AI and Azure/Foundry
   routes?** Anthropic documents `claude-opus-5-5` on both, but no Claude record in MJ has them.
   Decide once for the family rather than per-model — this is why 5.5 did not get them.
7. **[Flagged — new, verify]** **`Grok 4.7` `MaxOutputTokens` is a conservative 128,000.** xAI
   publishes no cap; third parties claim 450,000. Confirm against xAI's own docs and raise it.
8. **[Flagged — new, systemic]** **CostRank has drifted and the `10` band is saturated.** `GPT 5.6`
   carries 10 at $4/$20 while `Claude Opus 5.5` now carries 9 at the identical price; `GPT 5.6-luna`
   carries 6 at $0.20/$1.20 while `GPT-6 Luna` carries 2 at half that. The scale also exceeds its
   documented 1–10 range in places (`Claude Opus 5 Fast` 11, `Gemini 3.5 Flash-Lite` speed 12). One
   re-calibration pass across the file, with the band boundaries written down.
9. **[Flagged — new, low priority]** **`gpt-5.6-sol` is missing from the inventory.** It surfaced as
   GPT-6 Sol's benchmark baseline and it *beats* GPT-6 Sol on DeepSWE and OSWorld 2.0. Prior
   generation, so low urgency — but it is a real gap, and it is why GPT-6 Sol has no `PriorVersionID`.
10. **[Flagged — new]** **The MiMo records understate their modalities.** Both are omnimodal
    (video + audio input) but inherit LLM modalities. Needs explicit `MJ: AI Model Modalities` rows,
    authored against a verified modality catalogue.
11. **[Calendar — 2026-10-26 or later]** OpenAI's 2026-10-23 tranche. **Confirm the id list against
    OpenAI's own page first**; the `gpt-4o` / `gpt-4.1-nano` scope question is open for a third week.
12. **[Flagged — carried, description corrected this week]** **`Claude 4 Opus` / `Claude 4 Sonnet`
    cost rows.** The prices are *not* wrong — they are correct batch rates with
    `ProcessingType: "Batch"`. The real defects are (a) no `Realtime` row exists for either model and
    (b) three duplicate rows, two sharing a PK. See the section above.
13. **[Flagged — carried, systemic, worse than recorded]** **Concurrent `Active` cost rows on the
    same model+vendor.** `Claude Sonnet 5` (six), `DeepSeek V4 Pro` (three), `GPT 5.6-terra` and
    `GPT 5.6-luna` (two each), `o1-mini` (`Inactive` vendor row, `Active` un-ended cost row), and now
    the four duplicate-PK models above. One deliberate pass.
14. **[Flagged — carried, blocking five things]** **The image/video/audio cost-schema decision** —
    `GPT Image 2.5 Flare`/`Sunburst`, the **FLUX 3** family refresh (our two FLUX records still carry
    `StartedAt` 2025-10-01, and FLUX 3 Action now adds a *world action model* with no MJ type at
    all), **Gemini Omni 1.1 Flash**, **Gemini 3.5 Transcribe**, and the four **Cohere rerankers**
    (billed per search, so they carry no cost rows at all).
15. **[Flagged — carried]** **Claude Mythos 5.1** / OpenAI **Daybreak Red & Blue**: does MJ model
    gated-access models? Mythos 5.1's price *is* public ($10/$50 on Anthropic's card) even though
    access is not. Open since 2026-08-31.
16. **[Flagged — carried]** **TypeSafe AI / Jev 1.13** — whether MJ records structured-decision
    models, and under which `AIModelTypeID`. Merges with the Cohere North Mini Code $0.00-output
    question.
17. **[Flagged — carried]** **`DeepSeek V4 Pro` cost reconciliation** ($0.66/$1.98 matches neither
    tier); **`GLM 5.3` OpenRouter max output** (our 128,000 vs the gateway's 1,048,576);
    **Muse Spark Contributor tier** and a first-party Meta route needing a `MetaLLM` driver class;
    **Cohere reranker API ids** (`rerank-v4-pro` vs `rerank-4-pro` — one of the two will fail at call
    time).
18. **[Calendar — 2027-01-01]** Google's Gemini 3.x Flash introductory rate ($0.75/$3.75) ends and
    $1.50/$7.50 begins. Expire and add; don't let it drift.

**Retired from this list:** the **Grok 4.7** watch (five slips, now shipped) and the **GLM-5.3-FlashX
OpenRouter** follow-up.

---

## Instruction-file discrepancy — still live, for a human to reconcile

Unchanged from 2026-09-21, and it will recur every week until someone fixes the scheduler's copy.

The scheduler's stored prompt states as a **CRITICAL formatting rule**: *"Do NOT include `primaryKey`
or `sync` objects."* The repo copy at `reports/ai-model-research/ROUTINE_PROMPT.md` was **corrected on
2026-09-15** (commit `a73c891c`) to require the opposite: a `uuidgen` `primaryKey` on every new
record, and no hand-authored `sync`.

`metadata/CLAUDE.md`, §0.6 and every existing record in `.ai-models.json` side with the repo copy.
**This run follows the repo copy**: 40 new records, each with a distinct `crypto.randomUUID()`
`primaryKey`, no `sync` anywhere.

The scheduler's prompt is not a repo file and cannot be fixed from this branch. **Its owner needs to
update it.**

---

## Verification

`mj sync validate` needs a database and cannot run in this environment. The **§0.3 pure-JSON
pre-flight was run against both model files after the edits and prints `OK`**:

- every `MJ: AI Model Vendors` `Status` ∈ {Active, Inactive, Deprecated, Preview}
- every `MJ: AI Model Costs` `Status` ∈ {Active, Pending, Expired, Invalid}
- every `Expired` row carries an `EndedAt`, and every `EndedAt` > its `StartedAt`

An additional check was run beyond §0.3, and also passes:

- **Every** `@lookup:MJ: AI Vendors.Name=…` in both model files resolves to a row in
  `.ai-vendors.json` — including the new `Xiaomi` target. `directoryOrder` confirmed to push
  `ai-vendors` before `ai-models`.
- Every `@lookup:` `PriorVersionID` resolves to a model that exists. (Three pre-existing records —
  `GLM 4.7`, `Claude Opus 4.6`, `Claude Sonnet 4.6` — carry raw UUIDs rather than lookups, which is
  legal and was not changed.)
- All **40** new `primaryKey` UUIDs are distinct and none collides with any existing record anywhere
  in `metadata/`. The 12 duplicate PKs in the file are all pre-existing: 8 are benign cross-entity
  collisions (a model and a vendor sharing an id in different tables), and 4 are the real
  within-entity bug reported above.
- No `sync`, `__mj_CreatedAt` or `__mj_UpdatedAt` key authored on any new record.
- Every new record has exactly one Model Developer vendor row and at least one Inference Provider
  row; every Inference Provider row has both a `DriverClass` and an `APIName`, and every Model
  Developer row has neither.
- Every new `DriverClass` value (`AnthropicLLM`, `BedrockLLM`, `OpenRouterLLM`, `xAILLM`, `OpenAILLM`,
  `AzureLLM`) already exists in the file — **no new driver class invented**, per guideline 4.
- Every new cost row is `USD`, `Realtime`, and carries at least one source URL in `Comments`.
- Both JSON files round-trip byte-identically apart from the intended additions: **791 insertions,
  1 deletion** across two files, no reformatting.

**A limitation on this week's research, stated plainly.** This environment's egress proxy blocks many
domains this routine would normally read first-hand, including `developers.openai.com`, `docs.x.ai`,
`openrouter.ai`, `llm-stats.com`, `pricepertoken.com`, `marktechpost.com` and
`digitalapplied.com`. Web *search* works and returns synthesised answers with sources; direct fetches
of those domains do not. `platform.claude.com` **is** reachable, which is why the Claude Opus 5.5
figures are the strongest in this report — they come from Anthropic's own pricing and model-overview
pages, read directly.

Everything applied was corroborated by at least two independent sources and checked for internal
consistency: Sol's $2/$10 and Luna's $0.10/$0.50 are each exactly half the GPT-5.6 figures already in
our inventory; Grok 4.7's $2/$6/$0.50 matches the Grok 4.6 rows we already hold; FlashX's OpenRouter
$0.37/$1.25 matches Z.AI direct, which was verified last week. **The four places where sources could
not be reconciled — Opus 5.5 on Bedrock, Sol and Luna on Azure, Grok 4.7's output cap, and the
OpenAI October id list — were left unapplied or set conservatively for that reason, not overlooked.**

---

## Research Sources

**Vendor-authoritative (fetched directly):**
<https://platform.claude.com/docs/en/about-claude/pricing> ·
<https://platform.claude.com/docs/en/about-claude/models/overview>

**Model, pricing and benchmark research:**
<https://openrouter.ai/anthropic/claude-opus-5.5> · <https://www.eesel.ai/blog/claude-opus-5-5-pricing> ·
<https://shattered.io/claude-opus-5-5-launch-pricing-2026/> · <https://cellcog.ai/blog/claude-opus-5-5-release-date/> ·
<https://www.orcarouter.ai/blog/claude-opus-5-5> · <https://www.finout.io/blog/claude-opus-5.5-pricing-2026-what-anthropics-new-flagship-actually-costs> ·
<https://artificialanalysis.ai/articles/benchmarking-grok-4-7> · <https://llm-stats.com/models/grok-4.7> ·
<https://pricepertoken.com/pricing-page/model/xai-grok-4.7> · <https://www.cometapi.com/what-is-grok-4-7/> ·
<https://kingy.ai/blog/grok-4-7-release-features-pricing-access/> · <https://www.orcarouter.ai/blog/grok-4-7-vs-grok-4-6> ·
<https://www.layer3labs.io/guides/grok-4-7-limits> · <https://llm-stats.com/models/compare/grok-4.6-vs-grok-4.7> ·
<https://financefeeds.com/grok-4-7-keeps-a-500k-context-window-what-traders-can-actually-do-with-it/> ·
<https://www.iclarified.com/102351/openai-cuts-api-prices-50-with-gpt-6-sol-and-luna> ·
<https://www.eesel.ai/blog/gpt-6-sol> · <https://www.sim.ai/models/openai/gpt-6-sol> ·
<https://openrouter.ai/openai/gpt-6-sol> · <https://openrouter.ai/openai/gpt-6-luna> ·
<https://www.vellum.ai/blog/gpt-6-sol-and-luna-benchmarks-explained> ·
<https://kingy.ai/blog/gpt-6-sol-luna-specs-benchmarks-pricing-comparison/> ·
<https://kingy.ai/blog/claude-opus-5-5-vs-gpt-6-astra-vs-gpt-5-6-sol/> ·
<https://alphacorp.ai/blog/claude-opus-5-5-vs-gpt-6-sol-benchmarks-pricing-and-which-is-better> ·
<https://go.tabbit.ai/blog/gpt-luna-6-pricing> · <https://www.vakati-tech.ai/models/openai-gpt-6-luna> ·
<https://www.orcarouter.ai/blog/gpt-6-luna-vs-gemini-3-5-flash-lite> ·
<https://www.orcarouter.ai/blog/gpt-6-luna-pro-explained> · <https://evolink.ai/blog/gpt-6-luna-release-date> ·
<https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/> ·
<https://www.truefoundry.com/blog/claude-opus-5-5-gpt-6-sol-and-gpt-6-luna-are-now-live-on-truefoundry-ai-gateway> ·
<https://www.datacamp.com/blog/gpt-6-sol-and-luna> · <https://aws.amazon.com/bedrock/pricing/> ·
<https://openrouter.ai/xiaomi/mimo-v2.6-pro> · <https://openrouter.ai/xiaomi/mimo-v2.6-flash> ·
<https://www.requesty.ai/models/xiaomi/mimo-v2.6-pro> · <https://www.requesty.ai/models/xiaomi/mimo-v2.6-flash> ·
<https://www.eesel.ai/blog/xiaomi-mimo-v2-6-pricing> · <https://mimo.mi.com/models/en-US/mimo-v2.6-flash> ·
<https://mixed-news.com/en/xiaomi-mimo-v2-6-pro-top-open-model-2-62m-rl-run/> ·
<https://en.wikipedia.org/wiki/Xiaomi_MiMo> · <https://computingforgeeks.com/xiaomi-mimo-v2-6-pro-flash/> ·
<https://openrouter.ai/z-ai/glm-5.3-flashx> ·
<https://aihubmix.com/blog/glm-5-3-flash-pricing-compared-openrouter-z-ai-and-aihubmix> ·
<https://benchlm.ai/google/api-pricing> · <https://benchlm.ai/mistral/api-pricing> ·
<https://pricepertoken.com/pricing-page/provider/mistral-ai> ·
<https://www.marktechpost.com/2026/09/24/black-forest-labs-releases-flux-3-action-a-7b-open-weights-world-action-model-that-tops-robolab-120/> ·
<https://nvidianews.nvidia.com/news/nvidia-launches-nemotron-coalition-of-leading-global-ai-labs-to-advance-open-frontier-models> ·
<https://docs.cohere.com/docs/deprecations> · <https://llmgateway.io/timeline> ·
<https://llm-stats.com/llm-updates> · <https://www.digitalapplied.com/blog/ai-model-releases-september-2026-tracker>
