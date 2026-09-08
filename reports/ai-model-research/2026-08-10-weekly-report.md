# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-08-10
**Research Period**: 2026-08-08 → 2026-08-10
**Base Branch**: `next`
**Working Branch**: `claude/ai-model-research-2026-08-10`

## Executive Summary

Two-day interval since the 2026-08-08 refresh, but the window is meaningful because it
finally clears a deferral the 2026-08-03 report set incorrectly: **Inkling-Small** was flagged
as "still in preview" on 2026-08-03, when in fact Thinking Machines Lab had already published
the full Apache-2.0 open weights on 2026-07-30. Both the Aug 3 and Aug 8 reports carried that
error forward. This report corrects it — Inkling Small is the only JSON edit.

Three other in-window events are documented **without** JSON edits, each for a specific reason:

1. **Grok 4.6** (2026-08-07) — xAI shipped the model but has not published API pricing yet;
   the report's methodology bar ("No JSON edit was made on the basis of a single uncorroborated
   source") is not met. Track for next weekly.
2. **FLUX 3 Video GA** (2026-08-04) — new modality (video) that Black Forest Labs prices per
   clip, not per token. The `.ai-models.json` cost schema is per-1M-tokens; the mapping decision
   isn't a mechanical add, so it goes to the watch list.
3. **Poolside Laguna S 2.1 / XS 2.1** — the same "first-party vendor onboarding" question the
   report has consistently deferred for Meta. Poolside is not a tracked vendor, and adding it
   is a procurement decision, not a weekly-refresh mechanical add.

Grok 4.6 shipping between the 2026-08-08 refresh and this one is why the routine ran on Sunday
rather than waiting for the 2026-08-15 slot noted in the previous report.

## Current Inventory Snapshot

| Category | Before | After this PR | Delta |
|---|---|---|---|
| Total model entries | 182 | 183 | +1 |
| Active models | 154 | 155 | +1 |
| Vendors | 30 | 30 | 0 |
| Model-vendor bindings on Inkling Small | 0 | 2 | +2 |
| Cost rows on Inkling Small | 0 | 1 | +1 |

Baseline: `next` at `ac91e5a59`. One model added, no vendors added, no models deactivated.
(Counts are from `python3 -c "import json; …"` against the raw JSON; prior reports quoted
slightly lower numbers because they filtered out non-LLM/embedding/vendor-legacy rows —
noting the difference so a reader comparing snapshot deltas across reports understands why.)

Snapshot of most recently touched vendor families (for context, not delta):

| Vendor family | Notable recent activity |
|---|---|
| Anthropic | Fable/Mythos 5, Opus 5, Sonnet 5, Haiku 4.5, Opus 4.8 all present; Opus 4.1 retired 2026-08-05 |
| OpenAI | GPT 5.6 Sol/Terra/Luna present; 2026-07-30 price cuts (Luna 80%, Terra 20%) captured |
| Google | Gemini 3.6 Flash (2026-07-21), 3.5 Flash / Flash-Lite present; 2.0 Flash already deactivated |
| xAI | Grok 4.5, 4.3, 4.20, Grok 4 Fast, Grok Build 0.1 present; **Grok 4.6 (2026-08-07) not yet added — no pricing** |
| Alibaba (Qwen) | 3.8 Max GA pricing added 2026-08-08 refresh; 3.7 Max still present |
| Moonshot (Kimi) | K3, K3 Fast, K2.7-Code all present |
| MiniMax | M3 present at $0.60/$2.40 standard |
| Thinking Machines Lab | Inkling present; **Inkling Small added this report** |
| Cohere | Rerank v4 Pro / v4 Fast present; v3.5 shows deprecation notice in description |
| BFL | FLUX.2 Pro, FLUX 1.1 Pro present; **FLUX 3 Video GA not added — pricing model mismatch** |

## New Models — **JSON EDITS APPLIED**

### Inkling Small — added (open weights 2026-07-30, GA on OpenRouter shortly after)

| Attribute | Value |
|---|---|
| Vendor | Thinking Machines Lab (Model Developer) |
| Inference provider modeled | OpenRouter (`thinkingmachines/inkling-small`) |
| Input / Output | **$0.45 / $1.20** per 1M tokens (OpenRouter listing) |
| Context window (OpenRouter-served) | 524,288 tokens |
| Max output | 262,144 tokens |
| License | Apache 2.0 (open weights on Hugging Face) |
| Architecture | 276B total / 12B active mixture-of-experts, multimodal |

Two things captured in the cost row's `Comments` because they materially affect how a reviewer
would interpret the number:

1. **Direct Tinker API is priced by prefill / sampled / training / cached-prefill tokens** —
   promotional launch rates at $0.58 / $1.44 / $1.73 / $0.116 per 1M respectively — not the
   input/output token model MJ's cost schema uses. The OpenRouter route uses the standard
   input/output model, which is why the vendor row selected here is OpenRouter, mirroring how
   the base Inkling entry handled the same asymmetry.
2. **The $0.30 / $1.20 figure that some aggregators cite for "direct Thinking Machines" is
   inconsistent with Thinking Machines's own published prefill/sampled schedule**, so the
   OpenRouter number is the one carried in this record. If Thinking Machines publishes a
   token-model rate card, add a second cost row rather than editing this one.

`IsActive: true`. Follows the same two-vendor pattern as the base **Inkling** entry
(TML as Model Developer, OpenRouter as Inference Provider). No `PriorVersionID` — Small is a
distilled sibling of Inkling, not a successor.

## New Models Available — deferred, with reason

### Grok 4.6 (xAI, 2026-08-07)

| Attribute | Status |
|---|---|
| Release | Shipped 2026-08-07 (1.5T-parameter foundation model built on Grok 4.5) |
| Public API pricing | **Not published** as of 2026-08-10 |
| Successor context | Grok 4.7 (~2.1T params) expected "a few weeks later" per xAI roadmap |

Not added. The 2026-07-27 and 2026-08-03 reports both wrote "wait until pricing publishes"
into the methodology; that condition is not met yet. Add on the first weekly report dated
after xAI publishes an API rate card.

### FLUX 3 Video — GA (Black Forest Labs, 2026-08-04)

| Attribute | Status |
|---|---|
| Release | GA on BFL API and select partners, 2026-08-04 |
| Pricing basis | Per-clip, tiered by full-render vs draft; entry price ~$1.20 per 20-second clip |
| Related | FLUX 3 Image "coming weeks"; FLUX 3 Dev (open weights) later this year |

Not added. The `.ai-models.json` cost schema uses `Per 1M Tokens` unit types via
`@lookup:MJ: AI Model Price Unit Types.Name=Per 1M Tokens`, which does not fit a per-clip
video-generation pricing model. This is the same schema mismatch that keeps Cohere reranker
cost pricing out of the JSON (see the existing Cohere Rerank v4 Pro / v4 Fast entries whose
descriptions record the $2.50/$1.50 per 1,000-search-unit pricing but leave the cost rows off).
A "per-second" or "per-clip" price unit would need to be added first, and that's a schema
decision, not a weekly refresh.

## Pricing Changes Detected

None inside the 2026-08-08 → 2026-08-10 window. The most recent pricing event on the horizon
was the 2026-07-30 GPT-5.6 Luna/Terra cut, which was already captured in the 2026-08-05 push.

## Model Updates & New Versions

None in this window. No model in inventory had a specification change (context, API name, or
capability) between 2026-08-08 and 2026-08-10.

## Deprecated / Sunset Models

No new deprecations to flip this week.

Existing deprecation state remains correct:

- **Gemini 2.0 Flash** — `IsActive: false` since Google's 2026-06-01 shutdown. No change.
- **Claude Opus 4.1** — `IsActive: false` since the 2026-08-08 refresh flipped it after the
  2026-08-05 hard retirement. No change.
- **Cohere rerank-v3.5** — Automatic routing to `cohere-rerank-4-fast` began 2026-08-01. The
  MJ entry still shows `IsActive: true` with a description that already documents the auto-route
  and the score-scale change. Deliberately left active because the API endpoint still responds
  (transparently), so consumers do not break. Recommend flipping to `IsActive: false` only if
  Cohere removes the endpoint entirely, which they have not announced.

## New Vendors Worth Considering

### Poolside — Laguna S 2.1 (2026-07-21) and Laguna XS 2.1 (2026-07-02) — **no JSON edit; deliberate**

Poolside is a San Francisco AI startup shipping the Laguna coding-agent family under the
OpenMDW-1.1 open-weight license. The models are distributed primarily through OpenRouter and
Vercel AI Gateway; Poolside operates a first-party API but the aggregator routes are the
primary access path.

| Model | Released | Params | Context | Input / Output (OpenRouter) |
|---|---|---|---|---|
| Laguna S 2.1 | 2026-07-21 | 118B total / 8B active | 1,048,576 | $0.10 / $0.20 per 1M |
| Laguna XS 2.1 | 2026-07-02 | 33B / A3B | 262,144 | $0.06 / $0.12 per 1M |

Not added, for the same scope reason Meta Muse Spark was deferred on 2026-08-08: Poolside is
not a tracked vendor. Onboarding a new vendor row and either adding a `PoolsideLLM` driver
class or routing exclusively through OpenRouter is a procurement decision, and back-filling
Laguna XS.2 (2026-04) alongside the 2.1 pair is the honest scope. **Recommended**: raise
Poolside vendor onboarding as its own change; if adopted, add XS.2 + S 2.1 + XS 2.1 together.

### Amazon Nova 2 family — still deferred (unchanged since 2026-05-18 report)

The 2026-05-18 report first listed Nova 2 Lite / Pro / Sonic / Omni as "worth considering."
The vendor question — whether to add "Amazon" as a Model Developer distinct from the existing
"Amazon Bedrock" Inference Provider — has not been resolved. No change this week; the current
line-up hasn't materially shifted:

- Nova 2 Lite (GA 2025-12-02): $0.30 / $2.50 per 1M tokens, 1M context
- Nova 2 Pro (Preview): $0.80 / $3.20 per 1M tokens
- Nova 2 Sonic (May 2026 refresh): speech-to-speech, different pricing basis
- Nova 2 Omni (Preview): multimodal, multi-basis pricing

### Meta Muse Spark 1.2 — still deferred (unchanged since 2026-08-08 report)

Continues to require a first-party Meta vendor onboarding decision. No change.

## Watch List — carried forward

Same set as 2026-08-08 with three status updates:

- **Grok 4.6** — **shipped 2026-08-07**, pricing not yet published; still on watch for pricing
- **Grok 4.7** — new; xAI roadmap says "a few weeks after 4.6"
- **Gemini 3.5 Pro** — still unreleased; Google's May-I/O window has slipped past July/August
- **GLM 5.5** — no update
- **FLUX 3 general access** — **partially resolved**: Video GA on 2026-08-04; Image + Dev still pending
- **DeepSeek V5 / R2** — no update; V4-Pro / V4-Flash remain the current DeepSeek line
- **Meta Muse Spark first-party onboarding** — no update
- **Poolside vendor onboarding** — **new** to this list

## Recommended Actions

1. **This PR**: merge the Inkling Small addition. It corrects an incorrect deferral in the
   2026-08-03 and 2026-08-08 reports (Small was described as "still in preview" when the
   Apache-2.0 weights had already shipped 2026-07-30).
2. **Next weekly (~2026-08-15)**: re-check Grok 4.6 pricing. If xAI has published a rate card
   by then, add the model.
3. **Separate decision (unblocked)**: Poolside vendor onboarding. Recommend routing through
   OpenRouter only (matches how Laguna is actually served in practice) rather than adding a
   new driver class.
4. **Separate schema decision (long-standing)**: add a per-clip or per-second unit type to
   `MJ: AI Model Price Unit Types` so video-generation models (FLUX 3 Video, Veo 3.1, Seedance)
   and rerank models can be priced in JSON instead of only in descriptions.
5. **Separate decision (unchanged)**: Amazon Nova family and Meta Muse Spark family
   onboardings — both stalled on the "add first-party vendor?" question.

## Methodology & Confidence

- **Inkling Small existence and specs**: high confidence — Thinking Machines Lab's own
  announcement, VentureBeat and Dataconomy coverage, plus the OpenRouter listing all agree on
  release date (2026-07-30), architecture (276B/12B MoE), and open-weights license (Apache 2.0).
- **Inkling Small OpenRouter pricing**: high confidence for OpenRouter's $0.45 / $1.20 listing;
  the "direct Thinking Machines" number varies across aggregators because Tinker meters
  prefill/sampled/training/cached-prefill rather than input/output — recorded in Comments so a
  reviewer can drill down before adding a second cost row.
- **Grok 4.6 release date (2026-08-07)**: high confidence; multiple outlets and xAI roadmap
  coverage. **Grok 4.6 pricing**: not published — deferred rather than guessed.
- **FLUX 3 Video GA (2026-08-04)**: high confidence via BFL's own release and independent
  coverage; deferred on schema grounds, not evidence grounds.
- **Poolside Laguna S 2.1 / XS 2.1 release dates and pricing**: high confidence — Poolside's
  own blog + OpenRouter listing + Hugging Face weight card triangulate. Deferred on vendor-
  onboarding grounds.
- No JSON edit was made on the basis of a single uncorroborated source.

## Files Changed

- `metadata/ai-models/.ai-models.json` — added Inkling Small (1 model, 2 vendor bindings,
  1 cost row)
- `reports/ai-model-research/2026-08-10-weekly-report.md` — this report

## Sources

### Inkling Small (JSON edit)
- [Thinking Machines Lab — Introducing Inkling-Small](https://thinkingmachines.ai/news/inkling-small/)
- [VentureBeat — Thinking Machines debuts Inkling Small open source AI model](https://venturebeat.com/technology/thinking-machines-debuts-inkling-small-open-source-ai-model-nearing-performance-of-predecessor-at-about-1-4-size)
- [Dataconomy — Thinking Machines Launches Open-source Inkling-Small](https://dataconomy.com/2026/07/31/thinking-machines-launches-open-source-inkling-small-model/)
- [Artificial Analysis — Inkling Small profile](https://artificialanalysis.ai/models/inkling-small)
- [OpenRouter — Inkling Small](https://openrouter.ai/thinkingmachines/inkling-small)
- [explainx.ai — Inkling-Small open weights coverage](https://explainx.ai/blog/inkling-small-thinking-machines-open-weights-july-2026)
- [BenchLM — Inkling Small pricing](https://benchlm.ai/models/inkling-small)

### Deferred but researched
- [Grok 4.6 release coverage](https://aitoolsreview.co.uk/insights/grok-4-6-grok-4-7-release-date)
- [Grok 4.6 specs and 1.5T parameter count](https://kie.ai/blog/what-is-grok-4-6)
- [XenoSpectrum — FLUX 3 Video GA (2026-08-04)](https://xenospectrum.com/en/flux-3-video-general-availability/)
- [Digital Applied — FLUX 3 Video GA guide](https://www.digitalapplied.com/blog/flux-3-video-ga-guide-20-second-native-audio)
- [Poolside — Introducing Laguna XS 2.1](https://poolside.ai/blog/introducing-laguna-xs-2-1)
- [Design For Online — Laguna S 2.1 review](https://designforonline.com/ai-models/poolside-laguna-s-2-1/)
- [Design For Online — Laguna XS 2.1 review](https://designforonline.com/ai-models/poolside-laguna-xs-2-1/)
- [Future AGI — Amazon Nova 2 Lite v1.0 pricing](https://futureagi.com/llm-cost-calculator/bedrock/amazon-nova-2-lite-v1-0/)
- [AWS Blog — Amazon Nova 2 Sonic release](https://aws.amazon.com/blogs/aws/introducing-amazon-nova-2-sonic-next-generation-speech-to-speech-model-for-conversational-ai/)

### Cross-check searches (no edits produced)
- [Anthropic Claude pricing August 2026 landscape](https://benchlm.ai/anthropic/api-pricing)
- [OpenAI GPT-5.6 pricing landscape](https://devtk.ai/en/blog/openai-api-pricing-guide-2026/)
- [Gemini API pricing August 2026](https://benchlm.ai/google/api-pricing)
- [xAI Grok API pricing 2026](https://www.grizzlypeaksoftware.com/articles/p/xai-grok-api-pricing-2026-every-model-real-costs-and-how-to-estimate-your-bill-cgw8qnau)
- [Mistral API pricing August 2026](https://benchlm.ai/mistral/api-pricing)
- [Groq pricing 2026](https://www.cloudzero.com/blog/groq-pricing/)
- [DeepSeek API pricing August 2026](https://benchlm.ai/deepseek/api-pricing)
- [Cohere pricing 2026](https://www.eesel.ai/blog/cohere-ai-pricing)
- [Qwen 3.8 Max GA pricing 2026-08-03](https://apidog.com/blog/qwen-3-8-pricing/)
- [Kimi K3 launch pricing](https://kimi-k2.org/kimi-k3)
- [MiniMax M3 pricing](https://felloai.com/minimax-m3/)
- [Z.ai GLM-5.2 pricing](https://www.aipricing.guru/z-ai-pricing/)
- [NVIDIA Nemotron 3 lineup pricing](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b)
- [Fireworks AI serverless pricing 2026](https://www.morphllm.com/fireworks-ai-pricing)
- [Cerebras inference pricing](https://deploybase.ai/articles/cerebras-inference-pricing)
- [Inception Mercury 2 pricing](https://openrouter.ai/inception/mercury-2)
- [DeepSeek V5 / R2 status](https://chat-deep.ai/guide/deepseek-roadmap-rumors/)
- [Gemini 3.5 Pro status](https://www.eesel.ai/blog/gemini-3-5-pro)
