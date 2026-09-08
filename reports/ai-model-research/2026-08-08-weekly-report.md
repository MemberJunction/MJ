# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-08-08
**Research Period**: 2026-08-03 → 2026-08-08
**Base Branch**: `next`
**Working Branch**: `release/v6.1-prep`

## Executive Summary

Five-day window between the scheduled 2026-08-03 weekly report and this refresh, run as the
Step-2 model refresh for the **v6.1.0-edge.1** release build. Two in-window events warrant JSON
edits — and one of them is a carryover the previous two reports explicitly deferred to this one.

1. **Claude Opus 4.1 retirement — flag flipped this week (the deferred action is now due).**
   `claude-opus-4-1-20250805` reached hard retirement on the Claude API on **2026-08-05**,
   60 days after its 2026-06-05 deprecation notice. Both the 2026-07-31 and 2026-08-03 reports
   deliberately left `IsActive: true` and instructed that the flip happen in "the first weekly
   report dated on/after 2026-08-05" — matching the Grok 4 and Mistral summer-2026 precedent of
   deactivating only once retirement has actually occurred. This report is dated 2026-08-08, so
   **`IsActive` is now `false`** and the description records the retirement. Migration target
   remains **`claude-opus-5`** (per the 2026-07-24 update), not `claude-opus-4-8`; both are
   already tracked and active.
2. **Qwen 3.8 Max added — the deferral condition has been satisfied.** The 2026-08-03 report
   listed "Qwen 3.8-Max standalone API pricing" on the watch list as *not yet ready*. Alibaba
   opened **global standalone API access on 2026-08-03** at **$2.00 / $6.00 per 1M tokens**
   ($0.25/1M cached input), which is exactly the condition that was blocking the add. Alibaba
   Cloud is already a tracked vendor and Qwen 3.7 Max is already modeled, so this is a
   continuation of an existing family rather than a new-vendor onboarding.

One in-window release is documented **without** a JSON edit: **Meta Muse Spark 1.2**
(2026-08-05). See "New Vendors Worth Considering".

## Current Inventory Snapshot

| Category | Before | After this PR | Delta |
|---|---|---|---|
| Total model entries | 178 | 179 | +1 |
| Active models | 153 | 153 | 0 (+1 added, −1 retired) |
| Vendors | 30 | 30 | 0 |
| Model-vendor bindings on Qwen 3.8 Max | 0 | 2 | +2 |
| Cost rows on Qwen 3.8 Max | 0 | 1 | +1 |

Baseline: `next` at `fc5124a36d`. One model added, one model deactivated, no vendors added.

## Deprecated / Sunset Models

### Claude Opus 4.1 — retired 2026-08-05; **flag flipped this week**

`IsActive` moved `true → false`. This is the action the prior two reports scheduled for exactly
this report date, and it is now supported by an actual past retirement date rather than an
announced future one.

- Deprecation announced: 2026-06-05
- Hard retirement (API calls fail permanently): 2026-08-05
- This report: 2026-08-08 — 3 days after retirement, so the precedent condition is met
- Recommended replacement: **`claude-opus-5`** (same $5/$25 per-1M pricing as 4.8, and
  Anthropic's official post-4.1 migration target)

Both `Claude Opus 4.8` and `Claude Opus 5` are present and active, so no consumer is left
without a tracked migration target.

## New Models — **JSON EDITS APPLIED**

### Qwen 3.8 Max — added (GA 2026-08-03)

| Attribute | Value |
|---|---|
| API id | `qwen3.8-max` |
| Vendor | Alibaba Cloud (Model Developer + Inference Provider) |
| Input / Output | **$2.00 / $6.00** per 1M tokens |
| Cached input | **$0.25** per 1M tokens (implicit cache) |
| Context window | 1M, **flat rate across the whole window** |
| Max input | 991.8K standard / 983.6K in Thinking Mode |
| Max output | 131,072 |

Two behavioral notes captured in the cost row's `Comments` because they materially affect real
spend: `reasoning_effort` defaults to **`xhigh`** and `preserve_thinking` is **on by default**,
so thinking tokens bill at the output rate — effective cost runs above the headline $6.

Unlike other Qwen tiers there is **no long-prompt price step-up**; one rate applies across the
entire 1M window.

No OpenRouter binding was added. Qwen 3.7 Max carries one, but I did not find verified
OpenRouter availability and pricing for 3.8 Max within this window, and inventing a binding
would put an unverified route into production metadata. Worth adding once confirmed.

## New Vendors Worth Considering

### Meta Muse Spark 1.2 (2026-08-05) — **no JSON edit; deliberate**

Meta shipped Muse Spark 1.2 alongside the Muse Code coding agent on 2026-08-05, with a 1M-token
context window and two-tier pricing: **$1.25/$4.25** standard ($0.15/1M cached input), or
**$0.10/$0.20** on a contributor tier whose traffic is used to improve Meta's products.

It is **not** added, for a reason that is about scope rather than merit: the repo tracks Meta's
*open* Llama weights through third-party inference providers (Groq and others), but has **no
first-party Meta vendor** — and Muse Spark 1.1 was never tracked either. Adding 1.2 means
onboarding Meta as a first-party API vendor and back-filling a family, which is a deliberate
vendor decision rather than a weekly-refresh mechanical add, and it should not be made silently
inside a release build.

**Recommended**: decide Meta first-party onboarding as its own change. If adopted, add 1.1 and
1.2 together, and note the contributor tier's data-usage terms explicitly — a cheaper rate whose
traffic trains the vendor's models is a procurement decision, not just a price.

## Watch List — carried forward

Unchanged from 2026-08-03; none shipped in this window:

- Grok 4.6, Gemini 3.5 Pro, GLM 5.5, FLUX 3 general access, DeepSeek V5 / R2
- Qwen 3.8 Max — **resolved this week** (added above)
- Meta Muse Spark first-party onboarding — **new**, see above

## Recommended Actions

1. **Merged into this release.** Both JSON edits ride `release/v6.1-prep` and are captured in the
   consolidated `V202608080752__v6.1.x__Metadata_Sync.sql` migration, regenerated after these
   edits so the release migration is one complete log rather than a partial delta.
2. **Next weekly (~2026-08-15)**: re-check OpenRouter availability for `qwen3.8-max` and add the
   binding if live.
3. **Separate decision**: Meta first-party vendor onboarding (above).

## Methodology & Confidence

- Anthropic retirement: **high confidence** — corroborated by Anthropic's own deprecation docs
  plus independent coverage, and the date is now in the past rather than announced.
- Qwen 3.8 Max pricing and limits: **high confidence** — specs cross-checked across a pricing
  breakdown and mainstream tech coverage; figures agree ($2/$6/$0.25, 1M flat).
- Muse Spark 1.2 pricing: **medium-high** — consistent across multiple outlets, but not adopted,
  so nothing depends on it.
- No JSON edit was made on the basis of a single uncorroborated source.

## Files Changed

- `metadata/ai-models/.ai-models.json` — Claude Opus 4.1 `IsActive` → `false` + description
  updated to record retirement; Qwen 3.8 Max added (1 model, 2 vendor bindings, 1 cost row)
- `reports/ai-model-research/2026-08-08-weekly-report.md` — this report

## Sources

- [Anthropic model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
- [Claude Opus 4.1 deprecation / August 5 migration guide](https://therouter.ai/news/anthropic-deprecates-claude-opus-4-1-august-5-migration-guide/)
- [Qwen3.8-Max API pricing](https://aireiter.com/blog/qwen3-8-max-api-pricing)
- [Alibaba Qwen3.8-Max pricing and open weights](https://www.techrepublic.com/article/news-alibaba-qwen3-8-max-pricing-open-weights/)
- [Alibaba's Qwen3.8-Max prices frontier AI at $2 per million tokens](https://www.forbes.com/sites/jonmarkman/2026/08/05/alibabas-qwen38-max-prices-frontier-ai-at-2-per-million-tokens/)
- [Meta Muse Spark 1.2 and Muse Code launch](https://www.digitalapplied.com/blog/meta-muse-spark-1-2-muse-code-launch-guide)
- [Muse Spark 1.2 — 1M-token context window](https://pulse2.com/meta-launches-muse-spark-1-2-and-muse-code-coding-agent-with-1-million-token-context-window/)
