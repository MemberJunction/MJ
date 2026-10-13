# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-08-17
**Research Period**: 2026-08-10 → 2026-08-17
**Base Branch**: `next`
**Working Branch**: `claude/ai-model-research-2026-08-17`

## Executive Summary

The week 2026-08-10 → 2026-08-17 was heavy: xAI shipped **Grok 4.6** (Aug 12) with published
pricing that resolves the "no pricing yet" deferral from the 2026-08-10 report; Google shipped
**Gemini 3.7 Flash** (Aug 13) with a 50% introductory price cut on its Flash line; **DeepSeek
V4-Pro reached GA on Aug 13 and announced a peak/off-peak pricing model that takes effect Aug 16
(today−1) with the peak rate ~3× the current permanent rate**; **Anthropic made Claude Sonnet 5's
$2/$10 introductory pricing permanent** (Aug 10), cancelling the Sept 1 step-up to $3/$15 already
documented in the current cost record's Comments; **NVIDIA released Nemotron 3.5 Lightning** (Aug 11,
open-weights 30B MoE); **Meta shipped Muse Spark 1.2** (Aug 5, first-party API); **Alibaba released
Qwen Image 3 / 3 Pro** (Aug 5, image generation); **Zhipu released GLM-5.3** (Aug 14, Coding-Plan
only, no per-token rate card); **Cerebras deprecated GLM-4.7** effective today (Aug 17).

Applied JSON edits:
- **+1 model**: Grok 4.6 (with x.ai + OpenRouter vendor rows and cost rows).
- **+1 model**: Gemini 3.7 Flash (with Google + Vertex AI + OpenRouter vendor rows and Google/Vertex cost rows).
- **+2 cost rows** on DeepSeek V4 Pro and V4 Flash for the Aug 16 peak/off-peak pricing change.
- **+3 cost rows** on Claude Sonnet 5 (Anthropic, Bedrock, OpenRouter) marking the $2/$10 permanent
  freeze effective 2026-09-01 (the date the previously-scheduled step-up was cancelled from).

Deferred (report-only, no JSON edit) for the reasons noted below:
- **Meta Muse Spark 1.2** — Meta is not currently a tracked vendor; adding a new vendor is a
  procurement decision, not a mechanical weekly-refresh add.
- **NVIDIA Nemotron 3.5 Lightning** — no first-party token rate card publicly linked; NVIDIA
  distributes it as an NIM microservice and via third-party inference providers.
- **Qwen Image 3 / 3 Pro** — priced per image, not per token; `.ai-models.json` cost schema is
  per-1M-tokens, same mismatch that has parked BFL FLUX 3 Video since 2026-08-10.
- **Zhipu GLM-5.3** — no public per-token rate card; access only through the GLM Coding Plan
  subscription. Track for next weekly when Zhipu publishes API rates.
- **FLUX 3 (BFL)** — still Early Access, still per-clip pricing (unchanged from last week).
- **Cerebras GLM-4.7 deprecation** — no Cerebras vendor row exists on the GLM 4.7 model in the
  current JSON, so there is no vendor row to deactivate. Flagged for review.
- **Groq catalog contraction (Llama 4 Scout, Qwen3 32B removed 2026-07-21)** — the current JSON
  models "Llama 4 Scout" and "Qwen 3 32B" do not carry a Groq inference-provider row, so no edit
  is required to reflect the Groq delisting. Flagged for review.

## Current Inventory Snapshot

| Category | Before | After this PR | Delta |
|---|---|---|---|
| Total model entries | 183 | 185 | +2 |
| Vendors | 30 | 30 | 0 |
| New cost rows | — | +5 | +5 |
| New vendor-binding rows | — | +9 | +9 |

Snapshot of most recently touched vendor families (for context, not delta):

| Vendor family | Notable recent activity in-window (2026-08-10 → 2026-08-17) |
|---|---|
| xAI | **Grok 4.6 (2026-08-12) added — full pricing published** |
| Google | **Gemini 3.7 Flash (2026-08-13) added — introductory $0.75/$3.75** |
| Anthropic | **Sonnet 5 $2/$10 pricing made permanent (2026-08-10)** — Sept 1 step-up cancelled |
| DeepSeek | **V4-Pro GA (2026-08-13); peak/off-peak pricing effective 2026-08-16** — both V4 Pro and V4 Flash affected |
| Meta | Muse Spark 1.2 (2026-08-05, $1.25/$4.25) — **not yet added** (new vendor onboarding needed) |
| Alibaba (Qwen) | Qwen Image 3 / 3 Pro GA (2026-08-05) — per-image, deferred like FLUX 3 |
| Zhipu | GLM-5.3 (2026-08-14) — no per-token rate card yet, deferred |
| NVIDIA | Nemotron 3.5 Lightning (2026-08-11) — no first-party token pricing |
| Cerebras | GLM-4.7 deprecation effective today (2026-08-17) — no vendor row to deactivate |
| Cohere | No new releases in-window; Rerank v3.5 → v4-fast auto-route already documented |
| Moonshot (Kimi) | No new releases in-window (K3 launch top-up rebate expired 2026-08-12) |
| MiniMax | No new releases in-window |

## New Models — **JSON EDITS APPLIED**

### Grok 4.6 — added (xAI, 2026-08-12)

| Attribute | Value |
|---|---|
| API name | `grok-4.6` (dotted form; hyphenated `grok-4-6` is URL slug only) |
| Context window | 500,000 input / 128,000 output |
| Modality | Text + image input, text output |
| Reasoning effort | low / medium / high / xhigh |
| Pricing (< 200K tokens) | **$2.00 / $6.00** per 1M input/output; **$0.50 / 1M** cached input |
| Pricing (≥ 200K tokens) | **$4.00 / $12.00** per 1M input/output; **$1.00 / 1M** cached input |
| Vendors modeled | x.ai (Developer + Inference Provider); OpenRouter (`x-ai/grok-4.6`) |
| PowerRank / SpeedRank / CostRank | 26 / 6 / 6 (positioned above Grok 4.5's 25/6/6) |

The recorded cost row uses the sub-200K rate ($2/$6 with $0.50 cached). The tiered
long-context rate ($4/$12 above 200K) is captured in Comments — the cost schema records a
single input/output rate per row, and encoding the tier flip as a second cost row keyed only
by prompt length would misuse the vendor/StartedAt keying that Cost rows are designed around.

Positions above Grok 4.5 in PowerRank because xAI positions 4.6 as "the next evolution" with
better performance on coding, long-running agents, and interactive/visual work at the same
headline $2/$6 price.

### Gemini 3.7 Flash — added (Google, 2026-08-13)

| Attribute | Value |
|---|---|
| API name | `gemini-3.7-flash` |
| Context window | 1,048,576 input / 65,536 output |
| Modality | Text/image/video/audio/PDF input; text output |
| Pricing (introductory, through 2026-12-31) | **$0.75 / $3.75** per 1M input/output; **$0.075 / 1M** cached input |
| Pricing (standard, from 2027-01-01) | **$1.50 / $7.50** per 1M input/output (matches Gemini 3.6 Flash headline) |
| Vendors modeled | Google (Developer + Inference Provider); Vertex AI (Developer + Inference Provider); OpenRouter (`google/gemini-3.7-flash`) |
| PowerRank / SpeedRank / CostRank | 25 / 11 / 5 (versus Gemini 3.6 Flash's 24 / 11 / 6) |

The introductory pricing is recorded as the initial cost row; the standard $1.50/$7.50 that
kicks in 2027-01-01 is documented in Comments so the reviewer can decide whether to add a
second cost row when the intro period ends. This matches the pattern used for Claude Sonnet 5.

**Aggressive positioning**: Google shipped Gemini 3.7 Flash at literally half the headline
rate of Gemini 3.6 Flash ($0.75/$3.75 vs $1.50/$7.50) — the first Flash-tier price cut of the
Gemini 3 line. Framed by Google as an agent-workhorse move rather than a capability upgrade.

## Pricing Changes — **JSON EDITS APPLIED**

### DeepSeek V4-Pro (peak/off-peak effective 2026-08-16)

| Rate | Cache-miss input / 1M | Output / 1M | Cache-hit input / 1M |
|---|---|---|---|
| Previous permanent (from 2026-05-23) | $0.435 | $0.87 | $0.003625 |
| **New peak (2026-08-16, 01:00-04:00 & 06:00-10:00 UTC)** | **$1.32** | **$3.96** | *DeepSeek did not restate cache-hit* |
| **New off-peak (all other hours)** | **$0.66** | **$1.98** | *see above* |

Peak input is ~3× the prior permanent rate; peak output is ~4.5×. New cost row records the
**off-peak** rate (the majority-of-hours rate; 17 of 24 hours are off-peak) and documents peak
pricing in Comments. Recording off-peak avoids inflating cost projections for workloads that
don't run in the two peak windows; recording peak would over-count for typical usage. Reviewer
can add a second peak-row if a workload runs primarily in the peak windows.

### DeepSeek V4-Flash (peak/off-peak effective 2026-08-16, 16:00 UTC)

| Rate | Input / 1M | Output / 1M |
|---|---|---|
| Previous (from 2026-04-24) | $0.14 | $0.28 |
| **New peak (01:00-04:00 & 06:00-10:00 UTC)** | **$0.44** | **$1.32** |
| **New off-peak (all other hours)** | **$0.22** | **$0.66** |

Same peak/off-peak structure and same recording convention (off-peak as the row rate; peak in
Comments) as V4-Pro.

### Claude Sonnet 5 — introductory pricing made permanent (2026-08-10)

Anthropic announced 2026-08-10 that Sonnet 5's launch $2/$10 rate is now permanent, cancelling
the previously-scheduled Sept 1 step-up to $3/$15. The current cost rows (StartedAt 2026-06-30)
document the Sept 1 step-up in their Comments — those comments are now factually stale. Adding
three new cost rows (Anthropic, Bedrock, OpenRouter) with **StartedAt 2026-09-01** at the same
$2/$10 rate makes the price-history record show the freeze explicitly rather than leaving the
stale "steps up on Sept 1" text as the last word.

Prices themselves are unchanged, so this is a documentary edit — but a material one, because
customers reading the cost row's Comments field would otherwise budget for the Sept 1 increase
that will not happen.

## New Vendors Worth Considering (deferred — flagged for review)

### Meta — Muse Spark 1.2 (2026-08-05, first-party API)

Meta shipped **Muse Spark 1.2** on 2026-08-05 with a first-party API and a companion "Muse Code"
terminal coding agent. This is a materially new development because Meta's prior AI presence in
MJ's inventory has been open-weights Llama distributed through third-party inference providers
(Groq, Fireworks, OpenRouter). Muse Spark 1.2 is a proprietary Meta-hosted model with its own
first-party API and a distinct pricing model:

| Tier | Input / Output per 1M | Cached input | Notes |
|---|---|---|---|
| Standard API | $1.25 / $4.25 | $0.15 | 1,048,576-token context; 3,000 rpm |
| Contributor | $0.10 / $0.20 | — | Discount in exchange for permission to train future Meta models on your prompts/completions; 60 rpm cap |

Also available on **OpenRouter** at `meta/muse-spark-1.2`.

**Why deferred**: Adding "Meta" as a first-party vendor is a procurement/CredentialType decision
(is it API Key? contributor-tier consent flow?), not a mechanical weekly-refresh add. Reviewer
should confirm whether MJ wants to onboard Meta as a first-party vendor now that Meta operates
a paid API, and how MJ should represent the Contributor tier's data-sharing trade-off in metadata.

### NVIDIA — Nemotron 3.5 Lightning (2026-08-11)

30B MoE with 3B active parameters, open weights, "lightweight" enough for a single laptop/desktop
GPU. NVIDIA already exists as a tracked vendor (`Nemotron 3 Ultra`, `Nemotron 3 Super`,
`Nemotron 3 Nano` are all in inventory). Adding Nemotron 3.5 Lightning is mechanically small,
but I have no first-party token rate card to record — NVIDIA distributes it as an NIM
microservice and through third-party inference providers. **Track for next weekly** once
Fireworks / OpenRouter / Together AI publish rates.

Also flagged: **Nvidia Nemotron 4** is in training (targeting 1T parameters), no release date.

### Zhipu GLM-5.3 (2026-08-14)

New GLM iteration. **No per-token rate card**. Currently accessible only via the GLM Coding Plan
subscription. Deferred to next weekly.

### Qwen Image 3 / 3 Pro (Alibaba, 2026-08-05)

Unified image generation and editing. **Per-image pricing** ($0.03 / $0.04). Same
per-image-vs-per-token schema mismatch as BFL FLUX 3 Video (deferred since 2026-08-10). Deferred
pending a decision on how MJ should represent per-image cost in `MJ: AI Model Costs`.

## Deprecated / Sunset Models

### Cerebras GLM-4.7 — deprecated effective 2026-08-17 (today)

Z.ai GLM 4.7 is scheduled for deprecation on Cerebras today. **No JSON edit made** because the
current GLM 4.7 model entry in `.ai-models.json` does not carry a Cerebras inference-provider
vendor row (only Z.ai + OpenRouter). Flagged so a reviewer can confirm the model wasn't reachable
via Cerebras in production.

### Groq catalog contraction (2026-07-21) — Llama 4 Scout, Qwen3 32B

Groq removed Llama 4 Scout and Qwen3 32B from their published catalog on 2026-07-21. **No JSON
edit made** because the current "Llama 4 Scout" and "Qwen 3 32B" model entries in the JSON do
not carry a Groq inference-provider vendor row. Flagged for reviewer confirmation.

## Recommended Actions (prioritized)

1. **Merge this PR** — the five verified edits (Grok 4.6, Gemini 3.7 Flash, DeepSeek V4 Pro/Flash
   peak-hour costs, Claude Sonnet 5 permanent-price cost rows) are all well-sourced and follow
   established patterns.
2. **Onboard Meta as a first-party vendor** — Muse Spark 1.2 + Muse Code represent Meta's first
   proprietary paid-API model. A CredentialType decision is needed; once made, Muse Spark 1.2 is
   an easy add.
3. **Confirm the Cerebras GLM-4.7 and Groq Llama 4 Scout / Qwen3 32B non-changes** — the current
   JSON does not carry the vendor rows the vendor announcements would deactivate, but if any of
   these were reachable via those vendors in production, a manual clean-up is needed.
4. **Add DeepSeek V4 Pro / V4 Flash peak-hour cost rows** if any workload runs primarily in the
   two UTC peak windows (01:00-04:00 and 06:00-10:00) — the off-peak rate is recorded here as
   the row rate, and workloads that hit peak will materially undercount cost against that row.
5. **Watch list for 2026-08-24**: Nemotron 3.5 Lightning first-party pricing; Zhipu GLM-5.3 rate
   card; Qwen Image 3 / FLUX 3 Video cost-schema decision.

## Research Sources

### Anthropic
- <https://platform.claude.com/docs/en/about-claude/pricing>
- <https://x.com/claudeai/status/2086891169217122586> (Aug 10 permanent pricing announcement)
- <https://www.anthropic.com/news/claude-sonnet-5>

### Google
- <https://ai.google.dev/gemini-api/docs/pricing>
- <https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash>
- <https://venturebeat.com/technology/googles-gemini-3-7-flash-targets-coding-and-agents-with-a-50-introductory-price-cut>

### xAI
- <https://docs.x.ai/developers/grok-4-6>
- <https://www.digitalapplied.com/blog/grok-4-6-launch-pricing-agentic-benchmarks-2026>
- <https://apidog.com/blog/what-is-grok-4-6/>

### DeepSeek
- <https://api-docs.deepseek.com/news/news260813/> (V4-Pro GA + pricing change announcement)
- <https://www.engadget.com/2236912/deepseek-ai-models-get-four-times-pricier/>
- <https://www.infoworld.com/article/4209439/deepseek-raises-some-v4-prices-by-more-than-10x-as-ai-demand-strains-capacity.html>

### Meta
- <https://openrouter.ai/meta/muse-spark-1.2>
- <https://opper.ai/meta/muse-spark-1-2>
- <https://www.digitalapplied.com/blog/meta-muse-spark-1-2-muse-code-launch-guide>

### NVIDIA
- <https://nvidianews.nvidia.com/news/nvidia-debuts-nemotron-3-family-of-open-models>
- <https://www.marktechpost.com/2026/08/11/nvidia-ai-releases-nemotron-3-5-lightning-and-nemo-switchyard/>

### Alibaba (Qwen)
- <https://www.orcarouter.ai/blog/qwen-image-3-0-ga>
- <https://openrouter.ai/qwen/qwen-image-3-pro>

### Zhipu (GLM)
- <https://emergent.sh/news/glm-53-officially-launched>

### Cerebras
- <https://inference-docs.cerebras.ai/models/overview>

### Groq
- <https://www.eesel.ai/blog/groq-pricing>

### OpenRouter
- <https://openrouter.ai/blog/announcements/>

### Cohere
- (No in-window releases — Rerank v3.5 → v4-fast auto-route documented in prior report.)

### Moonshot AI
- <https://openrouter.ai/moonshotai/kimi-k3>
