# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-07-31
**Research Period**: 2026-07-27 → 2026-07-31
**Base Branch**: `next`
**Working Branch**: `claude/ai-model-research-2026-07-31`

## Executive Summary

This is an **off-cadence, release-driven report**. The weekly routine's last deliverable was the
2026-07-27 report (PR #3292), which merged on 2026-07-28 and shipped in **v5.50.0** (tagged
2026-07-29). Because v5.51.0 is being built on 2026-07-31, DEPLOYMENT.md Step 2 requires a current
model refresh for *this* release rather than reusing the one already released. The research window is
therefore short — four days — and the findings are correspondingly narrow.

One inventory addition warrants inclusion:

1. **Qwen 3.7 Flash** (Alibaba Cloud, July 27, 2026) — the Flash/speed tier of the Qwen 3.7 family.
   Released on the *same day* as the last report and so fell outside its evidence window, leaving the
   3.7 family represented by Max and Plus only. A vision-language reasoning model with a 1M-token
   context and 65,536 max output, priced at **$0.03/$0.13 per 1M** — the cheapest entry in the entire
   Qwen inventory and roughly 8× cheaper on input than Qwen 3.6 Flash, which it directly succeeds.
   **Added to `.ai-models.json`** with Alibaba Cloud (developer + inference) and OpenRouter rows.

Both items the 2026-07-27 report explicitly deferred into this window were re-checked and resolved:

- **Claude Opus 4.1 retirement (2026-08-05)** — confirmed against Anthropic's deprecation page.
  Retirement lands **5 days after this window**, i.e. *inside* the v5.51.0 support window but not yet
  in effect. `IsActive` **stays `true`**, matching the repo's established precedent (Grok 4 and the
  Mistral summer-2026 tranche were only deactivated *after* their retirement dates passed). The
  description's relative-date phrasing — which was anchored to the previous report and now read
  incorrectly — was rewritten to be absolute and to name the exact condition for flipping the flag.
- **Cohere `rerank-v3.5` → `cohere-rerank-4-fast` auto-migration (2026-08-01)** — confirmed, no edit
  required. The description written in #3292 is already accurate and already warns that relevance
  scores change and hard-coded thresholds need re-tuning. Requests continue to succeed after August 1
  (they are routed, not rejected), so `IsActive` correctly stays `true`, and both `rerank-v4-fast` and
  `rerank-v4-pro` migration targets are already carried in the inventory.

No cost-record edits were required for any other tracked vendor — baseline pricing across the frontier
set matches current market pricing.

## Current Inventory Snapshot

| Category | Before | After this PR | Delta |
|---|---|---|---|
| Total model entries | 177 | 178 | +1 |
| Active models | 152 | 153 | +1 |
| Vendors | 30 | 30 | 0 |

Baseline is `next` at `f1ab356886`. Note this differs from the 2026-07-27 report's stated end-state
(175 / 151 / 30): two further entries (including `Claude Opus 5 Fast`) merged to `next` between that
report and this one via separate PRs.

## New Models Available

### Qwen 3.7 Flash (Alibaba Cloud) — **ADDED to `.ai-models.json`**

- **Vendors**: Alibaba Cloud (Model Developer + Inference Provider), OpenRouter
- **API names**: `qwen3.7-flash` (Alibaba Cloud DashScope / Model Studio, OpenAI-compatible Chat
  Completions); `qwen/qwen3.7-flash` (OpenRouter, listed 2026-07-29)
- **Released**: July 27, 2026
- **Context window**: 1,000,000 input tokens; 65,536 max output tokens
- **Pricing**: $0.03 input / $0.13 output per 1M tokens on both surfaces (passthrough on OpenRouter)
- **Modalities**: vision-language — built for multimodal agents, visual coding, search, and
  computer/UI interaction; claimed strengths in object recognition and spatial understanding
- **Ranks assigned**: `PowerRank` 15 (above Qwen 3.6 Flash's 14, below Qwen 3.7 Plus's 18),
  `SpeedRank` 10 (matching the Flash tier), `CostRank` 1 (cheapest in inventory — Qwen 3.6 Flash
  sits at 2, Qwen 3.7 Plus at 4)
- **Lineage**: `PriorVersionID` → `Qwen 3.6 Flash`
- **Driver classes**: `QwenLLM` (Alibaba Cloud), `OpenRouterLLM` (OpenRouter) — matching the existing
  Qwen 3.6 Flash / 3.7 Plus rows

## Housekeeping Edits

### Claude Opus 4.1 — description corrected

The text carried a parenthetical anchored to the previous report (`"retires August 5, 2026 (9 days
after this report)"`). Read on 2026-07-31 that is simply wrong, and it would drift further every week.
Replaced with an absolute statement that additionally records *why* the model is still active and the
precise trigger for deactivating it, so the next report does not have to re-derive the decision.

`IsActive` is unchanged (`true`). **Action for the next report dated on/after 2026-08-05: flip
`Claude Opus 4.1` to `IsActive: false`.**

### Cohere `rerank-v3.5` — verified, no change

Re-checked against Cohere's deprecation page. The #3292 description remains correct through the
2026-08-01 routing switch. Flagged here only so the deferral is visibly closed rather than dropped.

## Watch List

- **Claude Opus 4.1** — hard API retirement 2026-08-05. Deactivate next week (see above).
- **Cohere `rerank-v3.5`** — auto-routing to `cohere-rerank-4-fast` begins 2026-08-01. Relevance
  scores change; any hard-coded score threshold in consuming code needs re-tuning. Watch for a
  subsequent hard-retirement announcement.
- **Grok STT 1.0** (xAI, released 2026-07-23) — **not currently in the inventory**. It falls in the
  *previous* report's window (2026-07-20 → 2026-07-27) rather than this one, so it is flagged here
  rather than added, to avoid silently re-scoping a closed window. It may also be a deliberate
  omission: MJ tracks speech models unevenly (`Grok Voice` is present; dedicated STT is generally
  covered via AssemblyAI / Eleven Labs entries). **Recommend an explicit include/exclude decision in
  the next weekly report.**
- **Gemini 3.x Pro line** — inventory carries `Gemini 3.1 Pro` plus `3.5 Flash` / `3.5 Flash-Lite` /
  `3.6 Flash`, but no `3.5`/`3.6` Pro. Reporting through this window indicated Gemini 3.5 Pro had
  slipped; no confirmed GA was found in-window. Re-check next week.

## Methodology & Confidence

This report was produced through the DEPLOYMENT.md Step 2 **manual fallback** path (web research
across provider release pages and aggregator trackers), not the scheduled Claude routine — no
routine-generated PR was open at release time and the release could not wait for the next weekly run.

Confidence notes, stated plainly because they affect review:

- **Qwen 3.7 Flash release date, context window, pricing, and OpenRouter slug** are corroborated by
  multiple independent sources including the OpenRouter model page.
- **Max output tokens (65,536)** comes from secondary aggregator sources; the OpenRouter page does not
  publish it. It matches Qwen 3.7 Plus, which is the expected family value. **This is the single
  weakest fact in the addition** — worth a reviewer's eye.
- Claude Opus 4.1 and Cohere items are confirmed against first-party vendor documentation.

## Files Changed

| File | Change |
|---|---|
| `metadata/ai-models/.ai-models.json` | +1 model (`Qwen 3.7 Flash`, 3 vendor rows, 2 cost rows); `Claude Opus 4.1` description corrected |
| `reports/ai-model-research/2026-07-31-weekly-report.md` | this report |

## Sources

- https://openrouter.ai/qwen/qwen3.7-flash
- https://www.orcarouter.ai/blog/what-is-qwen-3-7-flash
- https://llmgateway.io/timeline
- https://llm-stats.com/llm-updates
- https://platform.claude.com/docs/en/about-claude/model-deprecations
- https://docs.cohere.com/docs/deprecations
- https://docs.cohere.com/changelog/rerank-v4.0
