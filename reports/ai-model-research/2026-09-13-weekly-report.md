# AI Model & Vendor Weekly Intelligence Report

**Date:** 2026-09-13
**Prepared for:** v6.1.0-edge.7 release (DEPLOYMENT.md Step 2)

## Executive Summary

A quiet week for frontier launches and a busy one for follow-through. Nothing shipped that changes
the shape of the catalog; what did happen is that three items flagged in prior weeks finally became
actionable, and two of them are applied here.

The week's substantive events: **DeepSeek V4.1 Flash** (2026-09-10) supersedes V4 Flash with native
vision and a 552B MoE at the same Flash price point; **GPT-6 Astra reached GA on Amazon Bedrock**
(2026-09-08), closing an item open since Astra's launch; and the **GLM-5.3-Flash launch promo
expired** on schedule at 2026-09-09 16:00 UTC, exactly as last week's report predicted.

**Grok 4.7 slipped again** — a third missed date. Musk's Sept 12 target passed with the model still
in supplemental training and no model card, rate card or API id published. It stays flagged.

Three edits applied. Everything else is carried forward, and the carry-forward list is now long
enough to be worth a deliberate triage session rather than another week of accumulation — see
Recommended Actions 4 through 10.

## Current Inventory Snapshot

- **195 models** (194 before this run), **166 active**
- Vendor bindings, top of the distribution: OpenRouter 110, OpenAI 91, Google 47, Anthropic 42,
  Vertex AI 41, Alibaba Cloud 29, Mistral AI 26, x.ai 25, Azure 24, Amazon Bedrock 18, Groq 17
- **31 vendors** in `.ai-vendors.json`

## New Models Available

| Model | Vendor | Released | Status |
|---|---|---|---|
| DeepSeek V4.1 Flash | DeepSeek | 2026-09-10 | **Applied** |
| GPT Image 2.5 Flare / Sunburst | OpenAI | 2026-09-08 | Flagged — image cost schema |
| Fugu Max | Sakana AI | 2026-09-11 | Flagged — new vendor, no driver class |

## Pricing Changes Detected

- **GLM-5.3-Flash — the launch promo expired 2026-09-09 16:00 UTC** (24:00 Singapore, UTC+8), on
  the date last week's report named. Z.AI's own OpenRouter endpoint moved to list pricing
  ($0.15 input / $0.50 output per 1M) on 2026-09-11, at parity with Z.AI direct. **Applied**: the
  OpenRouter promo row is `Expired` with `EndedAt`, and a list-rate row starts at the promo's end
  instant. The Z.AI direct row already carried the list rate and needed no change, as predicted.

  One discrepancy is worth recording rather than smoothing over: our promo row was captured at
  **$0.05/$0.1667** on 2026-08-26, while Z.AI's later materials describe the promo as
  **$0.075/$0.25** (a clean 50% of list). The two disagree. The row is left as originally recorded
  — rewriting a historical price after the fact would destroy the only evidence of what we were
  actually quoted — and the divergence is noted in its `Comments`. It does not affect the forward
  rate.

- **GPT-6 Astra on Amazon Bedrock** — Standard pricing, global cross-Region, short-context tier
  (≤272K input): **$10 input / $50 output**, $1 cache read, $12.50 cache write per 1M. Above 272K
  the entire request is rebilled at $20/$75. In-Region and US-geographic cross-Region inference run
  10% higher ($11/$55 short; $22/$82.50 long). Priority and Flex tiers are not supported for Astra.
  **Applied** at the short-context global rate, matching the convention the existing OpenAI-direct
  and Azure rows already use.

- **DeepSeek V4.1 Flash** — off-peak $0.15 input / $0.60 output / $0.003 cached input per 1M; peak
  exactly double, Monday–Friday 01:00–04:00 and 06:00–10:00 UTC. **Applied at the off-peak rate.**
  Recording a real tier rather than a blend is deliberate: the 2026-08-16 `DeepSeek V4 Pro` row was
  written at a figure matching neither tier and has been an unresolved reconciliation item since.

## Model Updates & New Versions

- **DeepSeek V4.1 Flash supersedes V4 Flash.** Official API id is `deepseek-flash`. The retired
  `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` ids **temporarily route** to V4.1 Flash at
  the Flash rate, so existing callers keep working. Native vision arrives in the mainline Flash
  model, which also answers the long-open question of how to model
  `DeepSeek V4 Flash Vision Experimental` — it no longer needs its own entry, it needs retiring.
- **Grok 4.6 remains the x.ai flagship** (500K context; $2/$6 per 1M below 200K prompt tokens,
  $4/$12 above). Grok 4.7 has not shipped.

## Deprecated / Sunset Models

Nothing newly sunset this week. `DeepSeek V4 Flash` is functionally superseded but its API id still
routes, so it is **not** expired here — see Recommended Action 3.

## New Vendors Worth Considering

- **Sakana AI** — shipped Fugu Max 2026-09-11. Not in `.ai-vendors.json`, and adding it is the same
  two-part decision the Meta onboarding needed: a vendor row is cheap, but a first-party inference
  route also needs a `SakanaLLM` driver class that does not exist in the codebase. Worth doing only
  if there is demand; an OpenRouter route, if one appears, would sidestep the driver question.

## Recommended Actions

Ranked by confidence and impact. Items 1–3 are this week's; 4–10 are carried forward.

1. **[Applied]** Expire the `GLM-5.3-Flash` OpenRouter promo cost row (`Expired` + `EndedAt`
   2026-09-09T16:00Z) and add the $0.15/$0.50 list-rate row. Closes item 9 from 2026-09-07.
2. **[Applied]** Add the `GPT-6 Astra` Amazon Bedrock inference row (`openai.gpt-6-astra`) and its
   $10/$50 short-context cost record. Closes item 10 from 2026-09-07.
3. **[Applied]** Add `DeepSeek V4.1 Flash` — DeepSeek Developer + Inference rows and an OpenRouter
   inference row, with the off-peak cost record. **No OpenRouter cost row was written**: the route
   exists but its rate was not confirmed at research time, and an invented price is worse than an
   absent one. Follow-up: confirm the OpenRouter rate, then decide whether to expire
   `DeepSeek V4 Flash` and `DeepSeek V4 Flash Vision Experimental` now that both ids route here.
4. **[Flagged — third slip]** **Grok 4.7.** Musk's Sept 12 target passed; as of Sept 12 the model is
   still in supplemental training, with no model card, context window, rate card or API id. Roughly
   2.1T parameters per Musk, not per a spec sheet. Separately, **Grok 4.6 is in Microsoft Foundry**
   (500K context) and an Azure vendor row could be added once Foundry pricing is confirmed. Given
   three missed dates, stop treating the announced date as information.
5. **[Flagged]** **GPT Image 2.5 Flare and Sunburst** (2026-09-08, $8/$30 per 1M). Blocked behind
   the same cost-schema decision as the FLUX family: these are image models and the catalog prices
   per 1M tokens. Decide the schema once and apply it to FLUX 3, Flare and Sunburst together.
6. **[Flagged]** **Sakana AI / Fugu Max** — new vendor plus a missing driver class. Same shape as
   the Meta decision; see New Vendors above.
7. **[Flagged — carried]** **Claude Mythos 5.1** and OpenAI's **Daybreak Red / Daybreak Blue**:
   gated-access variants. One human decision covers all three — does MJ model gated-access models at
   all? Open since 2026-08-31.
8. **[Flagged — carried]** **`Claude 4 Opus` / `Claude 4 Sonnet` cost-row cleanup.** Both retired on
   the Anthropic API 2026-06-15; each carries three duplicate rows at apparent batch rates. Fix the
   prices *first*, then expire — the other order preserves the bad data permanently.
9. **[Flagged — carried]** **`GLM 5.3` OpenRouter context window**: our row says 200,000, Z.AI's docs
   say 1M. Verify against OpenRouter's listing before changing.
10. **[Flagged — carried]** **`DeepSeek V4 Pro` cost reconciliation** (2026-08-16, $0.66/$1.98 —
    matches neither the off-peak nor the peak tier); **`GPT 5.6` (Sol) pricing conflict** against
    OpenAI's own page; **FLUX family refresh** (FLUX 3 shipped 2026-07-23, our records still carry
    `StartedAt` 2025-10-01); **Muse Spark Contributor tier** ($0.10/$0.20, grants Meta training
    rights over submitted data — a governance call) and a first-party Meta route needing a
    `MetaLLM` driver class.

## Verification

`mj sync validate` needs a database and was not available at research time. The §0.3 pure-JSON
pre-flight was run against both model files after every edit and prints **`OK`**:

- every `MJ: AI Model Vendors` `Status` ∈ {Active, Inactive, Deprecated, Preview}
- every `MJ: AI Model Costs` `Status` ∈ {Active, Pending, Expired, Invalid}
- every `Expired` cost row carries an `EndedAt`, and every `EndedAt` > its `StartedAt`

Additionally verified: every `@lookup:MJ: AI Vendors.Name=…` in the models file resolves to a row in
`.ai-vendors.json` (**none missing**); `PriorVersionID` on the new model resolves to an existing
model name; the file re-serializes byte-identically to its on-disk form, so the diff contains only
intended changes; and no `primaryKey`, `sync`, `__mj_CreatedAt` or `__mj_UpdatedAt` keys were
written on any new record.

Note that `mj sync validate --dir=metadata` **was** run later in the release, against the release
database, and passed — see the edge.7 release PR.

## Research Sources

- [OpenRouter — Z.ai GLM 5.3 Flash](https://openrouter.ai/z-ai/glm-5.3-flash)
- [CellCog — GLM-5.3-Flash: Is It Still Free? Price After the Promo](https://cellcog.ai/blog/glm-5-3-flash/)
- [AIHubMix — GLM-5.3-Flash Pricing Compared: OpenRouter, Z.ai, AIHubMix](https://aihubmix.com/blog/glm-5-3-flash-pricing-compared-openrouter-z-ai-and-aihubmix)
- [AWS — Amazon Bedrock model card: GPT-6 Astra](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-astra.html)
- [OpenRouter — DeepSeek V4.1 Flash](https://openrouter.ai/deepseek/deepseek-v4.1-flash)
- [TechBriefly — DeepSeek launches V4.1-Flash with ultra-cheap off-peak API pricing](https://techbriefly.com/2026/09/11/deepseek-v4-1-flash-api-pricing/)
- [CellCog — Grok 4.7: Release Date, What Musk Has Promised, and What xAI Has Shipped](https://cellcog.ai/blog/grok-4-7-release-date/)
- [x.ai — Developer release notes](https://docs.x.ai/developers/release-notes)
- [BenchLM — Grok API Pricing (September 2026)](https://benchlm.ai/xai/api-pricing)
- [LLM Gateway — New AI Model Releases, September 2026 timeline](https://llmgateway.io/timeline)
- [digitalapplied — AI Model Releases: September 2026 Tracker](https://www.digitalapplied.com/blog/ai-model-releases-september-2026-tracker)
