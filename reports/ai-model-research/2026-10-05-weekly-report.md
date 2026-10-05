# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-10-05
**Research Period**: 2026-10-02 → 2026-10-05
**Base Branch**: `next`
**Research Branch**: `claude/magical-turing-8n1u9z`

> **Two deviations from the routine, both deliberate.**
>
> 1. **Branch name.** The routine template asks for `claude/ai-model-research-2026-10-05`. This
>    session was assigned the branch `claude/magical-turing-8n1u9z` by its environment, and pushing
>    anywhere else is not permitted to it. Same base (`next`), same contents, different name.
> 2. **Scope.** This run could only reach **one** vendor's primary sources. See the next section —
>    it is the headline finding, not a footnote.

---

## Executive Summary

**This session's egress policy blocks almost every AI vendor's documentation and pricing host.**
Anthropic was the only vendor that could be researched to the routine's primary-source standard, and
it shipped nothing in the 2026-10-02 → 2026-10-05 window. So this run applies **25 edits** that are
either first-party-verified Anthropic facts or internal-consistency repairs needing no vendor data —
including a Claude Sonnet 4.5 output cap that was wrong by nearly 8× — and applies **no new model and
no re-rated price**.

Everything else is a change candidate with its evidence grade attached. Three of those candidates are
live mispricings (Gemini 3.6 Flash at 2× the real rate, `grok-code-fast-1` at a fifth of real cost,
Kimi K2.6 understated), four MJ routes retire within 15 days — the first on **2026-10-09** — and a
new model category appeared that MJ has no type for. Three research claims were checked and rejected
before they could produce bad edits.

---

## 🚨 Blocker: this session's egress policy blocks almost every vendor's documentation

The routine's first rule is "only add models/pricing you can verify from official sources". This
session cannot reach those sources. Verified directly with `WebFetch` and corroborated by
`$HTTPS_PROXY/__agentproxy/status`, which records each attempt as
`connect_rejected — "gateway answered 403 to CONNECT (policy denial)"`:

| | Hosts |
|---|---|
| **Reachable** | `platform.claude.com`, `anthropic.com`, `www.anthropic.com` |
| **Blocked** | `developers.openai.com`, `platform.openai.com`, `openai.com`, `api.openai.com` |
| | `learn.microsoft.com`, `prices.azure.com`, `azure.microsoft.com`, `docs.microsoft.com` |
| | `ai.google.dev`, `cloud.google.com`, `docs.cloud.google.com`, `blog.google`, `deepmind.google`, `generativelanguage.googleapis.com`, `aiplatform.googleapis.com` |
| | `docs.x.ai`, `x.ai` |
| | `console.groq.com`, `groq.com`, `api.groq.com` |
| | `inference-docs.cerebras.ai`, `api.cerebras.ai`, `www.cerebras.ai` |
| | `openrouter.ai` |
| | `docs.mistral.ai`, `api-docs.deepseek.com`, `docs.cohere.com`, `elevenlabs.io` |
| | `platform.kimi.ai`, `docs.z.ai`, `alibabacloud.com`, `help.aliyun.com`, `platform.minimax.io`, `mimo.xiaomi.com` |
| | `docs.bfl.ai`, `huggingface.co`, `developers.cloudflare.com`, `docs.typesafe.ai` |
| | `en.wikipedia.org`, `raw.githubusercontent.com` |

GitHub access is scoped to `memberjunction/mj`, so the first-party documentation repositories
(`MicrosoftDocs/azure-ai-docs`, `openai/openai-openapi`) are not a fallback either.

**What that means for this PR.** `WebSearch` still works, and domain-restricted search returns a
search engine's *summary* of the vendor's own pages. That is good enough to **flag** a change and
not good enough to **write a price row** — which is exactly the standard the routine sets. So:

- **Anthropic was researched properly** and its findings are applied.
- **Every other vendor is reported as a change candidate**, with the evidence grade attached, and
  **nothing is written to the JSON from search-derived figures.**
- A set of **internal-consistency defects** that need no vendor access at all were found and fixed.

This is a small, green PR by design (Guideline 11). The candidate list below is the real output for
a human with unrestricted egress — several entries are live mispricings.

**Action for whoever owns the egress allowlist:** this routine cannot do its job under the current
policy. The highest-value additions, in order: `developers.openai.com`, `ai.google.dev`,
`openrouter.ai`, `api-docs.deepseek.com`, `docs.x.ai`, `console.groq.com`, `prices.azure.com`,
`platform.kimi.ai`, `api.cerebras.ai` (that last one needs no API key and returns ids + context +
pricing for the whole Cerebras catalogue in one request).

---

## Current Inventory Snapshot

**211 models** (182 active before this run, **177 after**) in `.ai-models.json`, plus **4 Cohere
rerankers** in `.cohere-reranker-models.json`. **36 vendors**, unchanged.

By model type: LLM 170 · Realtime 13 · Embeddings 12 · Image Generator 6 · Reranker 5 · TTS 5 ·
Speech to Text 3 · Video 1.

Inference routes per vendor (Active / non-Active):

| Vendor | Active | Non-Active | | Vendor | Active | Non-Active |
|---|---|---|---|---|---|---|
| OpenRouter | 121 | 0 | | Z.AI | 7 | 0 |
| OpenAI | 44 | 3 | | Cohere | 7 | 0 |
| Azure | 27 | 1 | | LocalEmbeddings | 6 | 0 |
| Amazon Bedrock | 23 | 0 | | Eleven Labs | 4 | 0 |
| Google | 16 | 9 | | MiniMax | 4 | 0 |
| Vertex AI | 16 | 6 | | Moonshot AI | 3 | 1 |
| Anthropic | 13 | 10 | | DeepSeek | 3 | 0 |
| x.ai | 14 | 0 | | Black Forest Labs | 2 | 0 |
| Fireworks.ai | 14 | 1 | | Inception Labs | 2 | 0 |
| Mistral AI | 12 | 1 | | Tasio Labs / HeyGen / AssemblyAI | 1 each | 0 |
| Alibaba Cloud | 10 | 0 | | Inworld / Hugging Face | 1 each | 0 |
| Groq | 9 | 8 | | DeepInfra / SiliconFlow | 1 each | 0 |
| LM Studio | 7 | 0 | | MemberJunction | 1 | 0 |
| Cerebras | 1 | 10 | | | | |

---

## New Models Available

**None added this run.** No candidate cleared the primary-source bar.

Anthropic — the one vendor that *could* be verified — **released nothing between 2026-10-02 and
2026-10-05**. The API release-notes page's newest entry is 2026-09-30 (the Sonnet 4.5 deprecation),
and anthropic.com/news has two October posts, neither a model or pricing change.

Candidates found but **not** added, with evidence grade:

| Model / family | Vendor | Published price | Why not added |
|---|---|---|---|
| **Claude Mythos 5.1** `claude-mythos-5-1` | Anthropic | $10/$50, cache read $0.25 (0.025×), 5m write $12.50, 1h write $20, batch $5/$25; 1M ctx / 128K out | **Price fully verified first-party.** Held back only on the open policy question (carried item 15): access is "by invitation only, as part of Project Glasswing". MJ has no convention for a gated model. **This item is now one decision away from closing** — see Recommended Action 6. |
| Claude Mythos 5 `claude-mythos-5` | Anthropic | $10/$50, cache read $1.00 | Same gating question. |
| `kimi-k2.7-code-highspeed` | Moonshot AI | $1.90/$8.00, cache hit $0.38, 262,144 ctx/out | Vendor-page snippet only; `platform.kimi.ai` blocked. Carried item 12 — the $1.90/$8 figure is now corroborated but still not page-read. |
| `gemini-3-pro-image`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image` (Nano Banana Pro / 2 / 2 Lite) | Google | image out $120 / $60 / $30 per 1M | `ai.google.dev` blocked. MJ's only Google image route is the **retired** preview id. Also blocked on the media cost-schema decision (carried item 14). |
| `gemini-3.5-transcribe`, `-transcribe-live`, `gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`, `gemini-omni-1.1-flash-preview`, `gemini-3.8-flash-cyber` | Google | various | Same. Useful structural note: these are **token-priced**, with per-second/per-minute figures published as derived equivalents — so they fit MJ's existing per-1M-token schema. That partially de-risks carried item 14. |
| `gpt-image-2.5-sunburst`, `-flare` | OpenAI | ~$8/1M image in, $30/1M image out | `developers.openai.com` blocked, and the unit model differs from MJ's existing per-image `gpt-image-2` row. |
| `@cf/cloudflare/clef`, `clef-flash` | **Cloudflare** (no MJ vendor) | $0.240 / $0.090 per 1M input; **output not billed** | New vendor + new model category. See "New Vendors" below. |
| `jev-1.13` | **TypeSafe AI** (no MJ vendor) | $0.042 per 1M input; no output tokens exist | Carried item 16. See "New Vendors" below. |
| `MAI-Transcribe-2-Streaming`, `MAI-Voice-2.1`, `MAI-Voice-2.1-Flash` | Microsoft AI (via Foundry) | $0.54/audio-hour (intro); $22 and $15 per 1M chars | `microsoft.ai` and `learn.microsoft.com` blocked. |
| `qwen3.8-max-0902` | Alibaba Cloud | $2.00/$6.00 — same as `qwen3.8-max` | Snippet only. Resolves the rename half of the 10-02 open item: it is a dated snapshot at an unchanged price. |
| `MiniMax-M3.1-Flash-Preview` | MiniMax | **no public PAYG price** | Plan-only (M Plan / MiniMax Code), so correctly has no cost row. |
| HeyGen Video | HeyGen | $0.03/sec @768p; promo $0.01/sec @480p through end of Oct | Blocked. Notable because MJ's existing HeyGen row has `APIName: null`. |
| Deepgram `nova-3-pharma`; Tavus Griffin; Bilibili Index-Translate; Luminal; inclusionAI | various | — | Not addable: no public priced API, or price only on aggregators. |

---

## Pricing Changes Detected

**No price row was re-rated from a vendor's published price this run**, because the only vendor whose
pricing page could be read had no price change in the window. Anthropic's one dated pricing
statement is a *non*-change: footnote 3 confirms Sonnet 5's $2/$10 introductory rate became the
standard price and **the scheduled 2026-09-01 increase to $3/$15 will not occur**. That fact is what
let the duplicate Sonnet 5 rows be resolved (below).

What **was** applied is cache pricing that Anthropic publishes and MJ had left blank. The base rate
is unchanged on all three, so the existing row is amended rather than superseded:

| Model | Vendor | Cache read added | 5m cache write added |
|---|---|---|---|
| Claude Opus 4.8 | Anthropic | $0.50 | $6.25 |
| Claude Sonnet 5 | Anthropic | $0.20 | $2.50 |
| Claude Fable 5 | Anthropic | $1.00 | $12.50 |

Deliberately **not** applied to the Amazon Bedrock and OpenRouter rows on those same models: those
platforms price independently, and the AWS rate card is unreachable. Anthropic also publishes the
multipliers as rules (5m write = 1.25× input, 1h write = 2× input, read = 0.1× input, except 0.025×
on Fable 5.1 / Mythos 5.1 and 0.05× on Opus 5.5), so the remaining gaps are mechanically fillable
once Bedrock's own card can be read.

### Candidate re-ratings — flagged, not applied

Ranked by how much money is at stake. **Every one needs one page-load to confirm.**

| # | Model | Vendor | MJ records | Published (snippet) | Grade |
|---|---|---|---|---|---|
| 1 | **Gemini 3.6 Flash** | Google **and** Vertex AI | $1.50/$7.50, cache $0.15 | **$0.75/$3.75, cache $0.075** through 2026-12-31 | MJ is costing it at **2× the live rate**. MJ holds the post-2027-01-01 price. Vendor-page snippet. |
| 2 | **`grok-code-fast-1`** | x.ai | $0.20/$1.50, cache $0.02 | id **retired 2026-05-15**, auto-routes to `grok-build-0.1` and bills at **$1.00/$2.00**, cache $0.20 | MJ understates live input cost **5×**. Vendor-page snippet. |
| 3 | **Kimi K2.6** | Moonshot AI | $0.60/$2.50, no cache | **$0.95/$4.00**, cache hit $0.16 | Settles the 10-02 conflict: the official-page reading was right, the third-party $0.55/$2.65 was wrong. Vendor-page snippet. |
| 4 | **DeepSeek V4 Pro** | DeepSeek | three concurrent Active rows: $1.74/$3.48, $0.435/$0.87, $0.66/$1.98 | two tiers only — **peak $1.32/$3.96** (cache $0.044), **off-peak $0.66/$1.98** (cache $0.022). Peak = 01:00–04:00 and 06:00–10:00 UTC Mon–Fri ex-holidays; off-peak = everything else at exactly 50% | MJ's $0.66/$1.98 is the off-peak tier exactly; the other two match no published tier. Carried item 17, now diagnosed. Vendor-page snippet. |
| 5 | **MiniMax-M3** | MiniMax | $0.6/$2.4 (one row) | tiered **by input size**: ≤512K in **$0.30/$1.20** (permanent 50% off), >512K $0.60/$2.40 | MJ holds only the expensive tier, so most traffic is over-costed 2×. Vendor-page snippet. |
| 6 | Qwen 3.6 Plus | Alibaba Cloud | $0.325/$1.95 | 0–256K **$0.50/$3.00** (MJ is exactly 0.65× — a lapsed 35%-off promo) | Snippet. |
| 7 | Qwen 3.6 Max Preview | Alibaba Cloud | $1.04/$6.24 | 0–128K **$1.30/$7.80** (MJ is exactly 0.8× — a lapsed 20%-off promo) | Snippet. |
| 8 | Qwen 3.7 Plus | Alibaba Cloud | $0.4/$1.16 | 0–256K $0.40/**$1.60** — input matches, output looks like a digit transposition | Snippet. |
| 9 | Groq `llama-3.1-8b-instant`, `llama-3.3-70b-versatile` | Groq | $0.05/$0.08 and $0.59/$0.79 | **"Contact Sales"** — Enterprise tier only since 2026-08-16 | MJ prices a tier that no longer exists publicly. Snippet. |
| 10 | Grok 4.5 | x.ai | cache read $0.50 | cache read **$0.30** | Snippet. |
| 11 | GLM-5.3-Flash | Z.AI | cache read $0.016 | cached input **$0.03** | Snippet. |
| 12 | Missing cache rates | several | — | Kimi K3 cache **write** $3.00; GLM 5 $0.20; GLM 5.2 $0.26; Qwen 3.7 Max $0.50; MiniMax-M2.7 read $0.06 / write $0.375; MiniMax-M2.5 read $0.03 / write $0.375 | Snippet. |
| 13 | Gemini audio/modality prices | Google | — | audio input $1.00 on 2.5 Flash, $0.50 on 3.1 Flash-Lite; Gemini 3.8 Live audio in $3.00 / audio out $12.00 / image+video in $1.00 | Snippet. |
| 14 | Long-context tiers absent from the schema | OpenAI, Google, x.ai | one price pair per route | `gpt-6.1-sol` >272K rebills the whole request at $4/$15; `gemini-3.1-pro-preview` >200K $4/$18; `gemini-2.5-pro` >200K $2.50/$15; **every Grok 4.x** doubles at ≥200K | Structural — see Recommended Action 7. |
| 15 | Gemini Embedding 2 | Google | **no cost row** | text in $0.20/1M | Snippet. |
| 16 | Eleven v4 / v4 Turbo | Eleven Labs | **no cost row** | $0.022 and $0.011 per 1,000 chars | Snippet. |
| 17 | Cohere rerankers (all 4) | Cohere | **no cost rows** | per *search*: rerank-4-pro $0.0025, rerank-4-fast $0.002, rerank-v3.5 $0.001 | Carried item 14. Snippet. |

### A claim I checked and rejected

A research pass reported "cross-contamination": MJ's DeepSeek V4 Pro `$0.435/$0.87` row and
DeepSeek V4 Flash `$0.14/$0.28` row supposedly copied from Xiaomi's MiMo V2.6 Pro and Flash,
"to the cent across two rows including a cache rate". **It does not hold.** The DeepSeek rows start
`2026-04-24` and `2026-05-23`; the MiMo rows start `2026-09-22`, four to five months later, and MiMo
V2.6 did not exist when the DeepSeek rows were written. The cache rates also differ on the Pro pair
(DeepSeek's stray row has none; MiMo's is $0.004). The V4 Flash price match is exact but can only
run MiMo→DeepSeek in time order, i.e. the opposite direction, or be coincidence on a common price
point. The underlying defect is real and already tracked — DeepSeek has five never-closed concurrent
cost rows — but it is not a contamination bug, and chasing one would waste the next run's time.

---

## Model Updates & New Versions

### Applied — Anthropic limits corrected against first-party model pages

| Model | Field | Was | Now | Source |
|---|---|---|---|---|
| Claude 4.5 Sonnet | `MaxOutputTokens` (all 3 routes) | 8,192 | **64,000** | `/docs/en/models/sonnet-4-5/overview` — "Max output: 64K tokens" |
| Claude Sonnet 4.6 | `MaxInputTokens` (all 3 routes) | 200,000 | **1,000,000** | `/docs/en/build-with-claude/context-windows` — names Sonnet 4.6 in the 1M list |
| Claude Sonnet 4.6 | `MaxOutputTokens` (all 3 routes) | 64,000 | **128,000** | same page — "can generate up to 128k output tokens" |

The Sonnet 4.5 figure was wrong by nearly 8×, which would have truncated long generations. Limits are
replicated across all three routes, matching the catalogue's existing convention (Claude Sonnet 5.5,
added 2026-10-02, carries identical limits on its Anthropic, Bedrock and OpenRouter rows).

### Verified Anthropic facts worth encoding later, not applied

- **300K output on the Batches API** for Opus 5.5/5/4.8/4.7/4.6, Sonnet 5.5/5/4.6, with header
  `output-300k-2026-03-24`. The synchronous cap stays 128K. MJ has one output cap per route.
- **Effort is GA** (`output_config.effort`: `low|medium|high|xhigh|max`), no beta header, and it does
  **not** change per-token price. Default is `high` everywhere that supports it **except Opus 5.5,
  where it is `medium`**. Haiku 4.5 and Sonnet 4.5 do not support it at all. MJ's
  `SupportsEffortLevel` boolean cannot express the default or the available levels.
- **`temperature` / `top_p` / `top_k` return 400** on Opus 4.7 and later when set to a non-default.
- **`inference_geo: "us"` applies a flat 1.1× to every token category**, cache included; Foundry's
  "US Data Zone Standard" is the same multiplier. Regional/multi-region endpoints on Bedrock and
  Google Cloud carry a **10% premium** over global, for Sonnet 4.5 / Haiku 4.5 / Opus 4.5 onward.
- **Structured outputs are not supported on Amazon Bedrock**, though they are on the Claude API,
  Google Cloud and Foundry. MJ's `SupportedResponseFormats` reads `"Any, JSON"` on Bedrock rows.
- **Anthropic-operated marketplaces** (Claude Platform on AWS, Microsoft Foundry) bill in Claude
  Consumption Units — 100 CCU = $1.00 — rated at the standard per-model prices. Same price, different
  unit, if MJ ever models those routes.
- **`GET /v1/models`** returns `max_input_tokens`, `max_tokens` and a `capabilities` object per
  model. It needs an API key, but it is the authoritative programmatic feed if this routine should
  ever sync Anthropic automatically instead of scraping docs.

### Candidates — flagged, not applied

- **`gemini-3-flash-preview`** (Google + Vertex, both `Active`): deprecated 2025-12-17 with no
  shutdown date, so it still resolves. Replacement named on the deprecations page is
  `gemini-3.6-flash` — the same row carrying candidate re-rating #1.
- **Google preview ids never become GA ids.** Documented policy: "stable versions are released under
  distinct GA model IDs, and upgrading requires updating the model ID." That answers how MJ should
  treat every Google `-preview` route: repoint or retire, never expect an in-place promotion. There is
  **no GA `gemini-3-flash` and no GA Pro id at all** — the Pro line is still `gemini-3.1-pro-preview`.
- **Vertex AI has been rebranded** to "Gemini Enterprise Agent Platform"; pricing now lives at
  `cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing` and per-model pages at
  `docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/*`. The old paths still
  resolve as aliases, but the source URLs in MJ's cost-row comments are stale.
- **`deepseek-v4-flash`** should be repointed to `deepseek-flash`: the old name was retired
  2026-09-10 and is only "temporarily routed", with no hard-off date published.
- **Grok 4.7 max output** (carried item 7): xAI publishes 500,000 context and explicitly **"no text
  output limit"** — so there is no vendor figure to record. MJ's conservative 128,000 is a safety
  rail, not a published cap. Worth deciding whether the schema should express "bounded only by
  context".
- **MJ `MaxInputTokens` convention is inconsistent.** Two research passes flagged GPT-6.1 Sol's
  `in=922000` as a data error against OpenAI's documented 1,050,000 context. It is **not** an error:
  1,050,000 − 128,000 = 922,000 exactly, and the record's own description says "1,050,000-token
  context (922K max input)". That record stores *context minus max output*; most others store full
  context. One convention should be chosen and written down — but do not "fix" 922,000.
- **Claude Opus 4.8's Bedrock `APIName` is `anthropic.claude-opus-4-8-v1`.** Anthropic documents the
  Messages-endpoint form as `anthropic.claude-opus-4-8` (no suffix, for Opus 4.7 and later) and the
  legacy InvokeModel form as `...-v1:0`. MJ's `-v1` matches **neither**. Needs an AWS-side check.
- Limit corrections from snippets, unapplied: Groq `gpt-oss-120b`/`-20b` max out 65,536 (MJ 32,000);
  Cerebras `gpt-oss-120b` ctx 131,072 / out 40,960; Kimi K3 max out settable to 1,048,576 (MJ
  262,144); GLM-5.3-Flash ctx 1,000,000 (MJ overstates at 1,310,720); MiniMax-M3 max out 524,288;
  Grok 4.20 ctx 1,000,000 (MJ records 2,000,000); `grok-build-0.1` records `out=2000000` on a
  256K-context model, which is impossible on its face.
- **Google token limits look like placeholders** on four rows: `gemini-2.5-flash-lite`
  in=10,000/out=400, `gemini-2.5-flash` in=30,000/out=2,500, `gemini-2.5-pro` in=200,000/out=10,000,
  `gemini-3-pro-image-preview` in=12,000. The real 2.5-family limits are 1,048,576 / 65,536.

---

## Deprecated / Sunset Models

### Applied

| Model | Change | Published date | Source |
|---|---|---|---|
| **Claude 4.5 Sonnet** | Anthropic inference row `Active` → **`Deprecated`**; description records the retirement | deprecated **2026-09-30**, retires **2026-11-30** | `/docs/en/about-claude/model-deprecations` and the model page, which agree exactly |
| | Cost row stays `Active` and the model stays `IsActive` — it serves until 2026-11-30. Replacement: Claude Sonnet 5.5 (already in MJ). | | |

Five models were set **`IsActive: false`** because *every* inference route on them was already
`Inactive` or `Deprecated` — the §0.2 condition for flipping the model-level flag. They were
advertising themselves as active while being unreachable on every route:

| Model | Route states |
|---|---|
| Llama 2 70B / Groq | Groq `Inactive` |
| Gemini 1.5 Flash | Google `Inactive`, Vertex AI `Deprecated` |
| Gemini 1.5 Pro | Google `Inactive`, Vertex AI `Deprecated` |
| Gemini 2.5 Pro Preview | Google `Inactive`, Vertex AI `Inactive` |
| Gemini 2.5 Flash Preview | Google `Inactive`, Vertex AI `Inactive` |

### Reverted, because §0.3 caught it

**Claude 3.5 Sonnet / Anthropic.** Both `claude-3-5-sonnet` snapshots retired on the Claude API on
**2025-10-28** (first-party, verified), and MJ's Anthropic vendor row is already `Inactive` while its
cost row stayed open. Expiring it at the published date failed the §0.3 pre-flight with
`EndedAt <= StartedAt`: the row's `StartedAt` is `2026-01-08T14:56:00.690Z`, the seed-import
timestamp, **2.5 months after the model was retired**. The row claims a price that began after the
model died. It cannot be expired until `StartedAt` is corrected, and no amount of research supplies
that date — someone has to decide it. Reverted and flagged. This is a textbook case for why §0.3 runs
before the commit and not after.

### Candidates — dates verified only from snippets, so not applied

Past their published shutdown, yet still `Active` in MJ:

| Vendor | id | Shutdown | MJ state |
|---|---|---|---|
| Groq | `qwen/qwen3-32b` | 2026-07-17 | Active |
| Groq | `meta-llama/llama-4-scout-17b-16e-instruct` | 2026-07-17 | Active |
| Groq | `moonshotai/kimi-k2-instruct-0905` | 2026-04-15 | model Active |
| Groq | `qwen/qwen3.6-27b` | 2026-09-14 | Active |
| Moonshot | `kimi-k2.5` | 2026-08-31 — calls now return 404 | model `IsActive: true` |
| Google / Vertex | `gemini-3-pro-preview` | 2026-03-09 | both rows recorded |
| Google | `gemini-3-pro-image-preview` | 2026-06-25 | already Inactive ✓ |
| Vertex AI | `gemini-2.0-flash-001`, `gemini-2.0-flash-lite-001` | **2026-06-01**, including Provisioned Throughput | **both `Active` with live $0.15/$0.60 prices.** The 10-02 run retired the *Google* rows and left Vertex unverified; Vertex is now reported to carry the same date, with no divergence. |
| DeepSeek | `deepseek-chat`, `deepseek-reasoner` | inaccessible after 2026-07-24 | not in MJ ✓ |
| x.ai | `grok-voice-transcribe-1.0` | **2026-10-02** (inside the window) | not a distinct MJ row |

Announced, not yet effective — apply on or after the date:

| Date | Vendor | ids |
|---|---|---|
| **2026-10-09** | OpenRouter | `qwen/qwen3.6-max-preview`, `qwen/qwen3-235b-a22b-thinking-2507` |
| **2026-10-14** | Azure | `gpt-4.1-nano` (unconfirmed — one pass found `gpt-4.1`, not `-nano`, at this date) |
| **2026-10-15** | Azure | `gpt-4o-mini-tts` (not corroborated this run) |
| **2026-10-20** | OpenRouter | `google/gemini-2.5-flash`, `-flash-lite`, `-pro` |
| **2026-10-20** | Moonshot | legacy WebSearch tool approach |
| **2026-10-21** | Xiaomi | MiMo V2.5 series |
| **2026-10-22** | Google | Veo models (set unspecified) |
| **2026-10-23** | OpenAI | `gpt-4.1-nano`, `o1`, `o1-pro`, `o3-mini`, `o4-mini`, `gpt-image-1`, `gpt-4o-2024-05-13` — **see the warning below** |
| **2026-10-23** | Azure | `gpt-image-1` (not corroborated this run) |
| **2026-11-02** | x.ai | `grok-imagine-image-quality` |
| **2026-11-19** | Azure | `o1`, `o1-pro`, `o3`, `o3-mini`, `o4-mini` (corroborated at snippet level) |
| **2026-11-30** | Anthropic | `claude-sonnet-4-5-20250929` → Sonnet 5.5 — **applied above** |
| **2027-01-01** | Google | Gemini 3.x Flash intro rate ends; $0.75/$3.75 → $1.50/$7.50, cache $0.075 → $0.15. Confirmed to also cover 3.6 Flash and both 3.8 TTS models; `gemini-3.8-flash-cyber` is excluded and already sits at the higher rate. |
| **2027-05-07** | Google | `gemini-3.1-flash-lite` (a floor, not a commitment — Google's dates are "earliest possible", with ≥45 days' notice) |

> ⚠️ **Do not touch MJ's OpenAI 2026-10-23 tranche list on this run's evidence.** Two independent
> search result sets **disagree on its membership**: one includes `o1-pro`, `o3-mini` and `o4-mini`,
> the other omits all three and adds `gpt-3.5-turbo-0125`, `gpt-4-0613`, `gpt-4-1106-preview` and
> `gpt-4-turbo`. Named replacements conflict too, and one source claims the wave is ChatGPT-only with
> no API impact. The `gpt-4o`-alias scope question — open for a fourth week — is precisely where they
> split. MJ has a live `gpt-4o` route at $2.50/$10 exposed to the ambiguity. This is unresolvable
> without `developers.openai.com/api/docs/deprecations`, and the deadline is 18 days out.

Also reported, not actionable:

- **Anthropic soft commitments** ("not sooner than", no deprecation announced): **Haiku 4.5
  2026-10-15 — 10 days out**, Opus 4.5 2026-11-24, Opus 4.6 2027-02-05, Sonnet 4.6 2027-02-17,
  Opus 4.7 2027-04-16, Opus 4.8 2027-05-28, Mythos 5 / Fable 5 2027-06-09, Sonnet 5 2027-06-30,
  Opus 5 2027-07-24, Fable 5.1 / Mythos 5.1 2027-09-01, Opus 5.5 2027-09-22, Sonnet 5.5 2027-09-28.
  Anthropic commits to ≥60 days' notice.
- **Anthropic retirement dates bind only Anthropic-operated platforms.** Bedrock and Google Cloud set
  their own, and several models MJ records as retired still serve there: Opus 4.1 (Bedrock + Google
  Cloud), Opus 4 (Google Cloud), Sonnet 4 and Haiku 3.5 (both).
- **`claude-opus-5-fast` does not exist as an Anthropic model id.** A search of models/overview, the
  deprecations page including full history, model-ids-and-versions and the fast-mode page finds it
  nowhere; it appears only as an OpenRouter route. Fast mode is a **request-level flag**
  (`speed: "fast"` + beta header `fast-mode-2026-02-01`), Claude API only, on Opus 5.5 / 5 / 4.8
  only, priced $8/$40 (5.5) and $10/$50 (5 and 4.8). MJ's `$10/$50` numbers were therefore *right*
  and the *modelling* is what is wrong. **Not applied**: §0.2 needs an `EndedAt`, the repo's recorded
  2026-09-01 date is not corroborated by any Anthropic page, and the route is already `Deprecated`.
  This is the hard deadline on carried item 3.
- **Gemini 2.5 family access restriction (2026-09-18):** not a deprecation — the models still serve —
  but access is now limited to projects that have used them before. MJ has four 2.5 rows that will
  fail for any new tenant.
- **Cerebras's public catalogue is now two models** (`gpt-oss-120b`, `qwen-3.8-27b`); everything else
  moved to Dedicated Inference or was deprecated, mostly **with no published shutdown date**. So 10
  of MJ's 11 Cerebras routes are likely uncallable on an ordinary key. Dateless, so not actionable,
  but `api.cerebras.ai/public/v1/models` would settle the whole slice in one unauthenticated request.
- **Cerebras `llama3.1-8b` on the "Llama 3.1 70b" record** (carried from 10-02): confirmed an MJ
  mislabel — `llama3.1-8b` and `llama-3.3-70b` are distinct Cerebras ids, and MJ already has a correct
  `llama-3.3-70b` row on "Llama 3.3 70B Versatile". Cerebras separately retired a real `llama3.1-70b`
  id and aliased it to `llama-3.3-70b`. The record is already `IsActive: false`, so only the
  name/id mismatch needs fixing — and no shutdown date is published.

---

## New Vendors Worth Considering

**None added.** All three candidates below sit behind blocked domains, and two of them raise a schema
question that should be settled before any row is written.

### A new model *category* appeared — this is the week's most consequential finding

Three vendors shipped "return a typed, calibrated answer; never generate text" models within about
24 hours, and **MJ has no `AIModelTypeID` that fits any of them**:

| Vendor | Model | Price | Public self-serve API? |
|---|---|---|---|
| **Cloudflare** (Workers AI) | `@cf/cloudflare/clef` (27B, multimodal), `@cf/cloudflare/clef-flash` (9B) | **$0.240** and **$0.090** per 1M input; **output not billed** | Yes, published pricing. Released 2026-10-01 with an RL fine-tuning service; Apache-2.0 weights. ⚠️ an open Cloudflare Community thread disputes the advertised 64K context against an apparent 2,048-state-token plateau. |
| **TypeSafe AI** | `jev-1.13` | **$0.042 per 1M input**; output free because no output tokens are produced | Yes — console API key, Python SDK, documented REST API. 64K/request, 32K for state + longest question; text only; 100K tok/s, 80 req/s. |
| **OpenAI** | Decisions API (runs Luna against finite-answer questions) | not published | No — limited preview as of DevDay. |

You send a state plus named typed questions and get back yes/no, multiple-choice or ordered-score
answers **with probabilities**. There is no text generation, no `MaxOutputTokens` concept, and a `0`
in an output-price column would be semantically wrong rather than merely odd.

**This closes the research half of carried item 16** ("whether MJ records structured-decision models,
and under which `AIModelTypeID`"). The answer has changed since it was filed: it is no longer one
vendor's curiosity but a category with three entrants and an OpenAI preview behind it. It now
warrants a new model type rather than a judgement call per model. AWS Strands Labs also shipped
`Strands Decider 2B`, but weights-and-local-server only, so not addable.

### Other vendor candidates

- **Microsoft AI (MAI)** — three speech models shipped 2026-10-01 through Foundry / Azure Speech.
  These probably belong on MJ's **existing Azure vendor**, not a new one.
- **Deepgram**, **Cartesia**, **Voyage AI**, **ZeroEntropy**, **Jina** — all have public priced APIs
  and no MJ vendor row. Out of window; worth a deliberate pass rather than a weekly drip.
- **inclusionAI (Ant Group)** — carried item: **resolved as not addable as a first-party vendor.**
  There is no inclusionAI-owned API or pricing page; GitHub and HuggingFace are their only
  first-party developer surface, and distribution is entirely third-party (OpenRouter, ZenMux,
  Vercel AI Gateway, Novita, Azure AI Foundry catalog). The $0.30/$0.90 figure circulating as "their
  official API" appears **only on aggregators**. If `ling-3.1-flash` is ever added it should be an
  **OpenRouter route at OpenRouter's price**, with OpenRouter as the vendor. The free promo ending
  2026-10-13 is corroborated only third-party.
- **Bilibili (Index-Translate)**, **Tavus**, **Luminal** — no published commercial pricing. Not addable.

---

## Recommended Actions

### Applied this run — 25 edits, 0 new vendor prices

1. **[Applied]** **Anthropic limit corrections**, verified page-by-page on `platform.claude.com`:
   Claude 4.5 Sonnet `MaxOutputTokens` 8,192 → 64,000 (3 routes); Claude Sonnet 4.6
   `MaxInputTokens` 200,000 → 1,000,000 and `MaxOutputTokens` 64,000 → 128,000 (3 routes).
2. **[Applied]** **Claude 4.5 Sonnet deprecation**: Anthropic route → `Deprecated`, description
   records the 2026-11-30 retirement and Sonnet 5.5 as the replacement. Cost row and `IsActive`
   untouched — it still serves.
3. **[Applied]** **Published cache rates filled** on the three first-party Anthropic rows that had
   none (Opus 4.8, Sonnet 5, Fable 5). Base rates unchanged, so the rows are amended, not superseded.
4. **[Applied]** **Nine never-closed duplicate cost rows expired.** Concurrent-`Active` pairs on the
   same model+vendor+`ProcessingType` went from **13 to 2** (both remaining are the DeepSeek tiered
   rows, which need the vendor page). Each expiry needed no new vendor data:
   - Claude Sonnet 5 on Anthropic / Bedrock / OpenRouter — the 2026-06-30 row expired at 2026-09-01.
     Root cause now documented first-party: the launch row recorded introductory pricing through
     2026-08-31 and a second row was added when that became standard; Anthropic confirms the
     increase to $3/$15 will not occur. Identical price on both rows.
   - Claude 4 Opus, Claude 4 Sonnet (Batch), Llama 4 Maverick/Groq, Llama 4 Scout/Groq — exact
     duplicates from the January 2026 seed import, expired at the later row's `StartedAt`.
   - GPT 5.6-terra and GPT 5.6-luna — the 2026-07-10 rows expired at 2026-07-30, which the later
     rows already supersede.
5. **[Applied]** **`IsActive: false` on five models** whose every inference route was already
   dropped (table above).

### Open — needs someone with unrestricted egress

6. **[Flagged — new, deadline in 4 days]** **Two MJ OpenRouter routes retire 2026-10-09** —
   `qwen/qwen3.6-max-preview` and `qwen/qwen3-235b-a22b-thinking-2507` — and two more on 2026-10-20
   (`google/gemini-2.5-flash`, `google/gemini-2.5-pro`). All four are `Active` today. Separately, five
   MJ OpenRouter ids are already dead or renamed, and 10 of 15 Fireworks routes are not
   serverless-callable. See the route-validation section. This is the item most likely to cause a
   production failure, and it is the one the blocked `openrouter.ai/api/v1/models` would settle
   outright.
7. **[Flagged — now one decision from closing]** **Claude Mythos 5.1 / Mythos 5.** Pricing is fully
   verified first-party ($10/$50, cache read $0.25 and $1.00, batch $5/$25, 1M/128K, platform ids on
   Bedrock, Google Cloud and Foundry). The *only* open question is MJ's convention for an
   invitation-only model. Open since 2026-08-31 (carried item 15); the data half is done.
8. **[Flagged — the highest-value structural item, third week]** **Request-level tiers and
   long-context tiers.** Now confirmed across four vendors, not one: Anthropic fast mode
   ($8/$40 and $10/$50 on the same model id); OpenAI's Ultrafast tier ($60/$300 vs Standard $10/$50
   on `gpt-6-astra`); `gpt-6.1-sol` rebilling the whole request at $4/$15 above 272K; every Grok 4.x
   doubling at ≥200K; Gemini Pro and MiniMax M3 tiering by input size. MJ stores one price pair per
   route, so **all of these are silently wrong on part of their traffic today.** This is driver and
   schema work, not metadata work, and it supersedes carried item 3's narrower framing.
9. **[Flagged — new, and the cheapest high-value fix]** **Gemini 3.6 Flash is costed at 2× the live
   rate** on both the Google and Vertex rows. One page-load on `ai.google.dev/gemini-api/docs/pricing`
   confirms or refutes it.
10. **[Flagged — new]** **`grok-code-fast-1` bills at 5× MJ's recorded input price**, having
   auto-routed to `grok-build-0.1` since 2026-05-15. One page-load on `docs.x.ai/developers/pricing`.
11. **[Flagged — carried, now diagnosed]** **DeepSeek V4 Pro / V4 Flash**: five concurrent Active
    rows across two models. The structure is two tiers (peak, and off-peak at exactly 50%, peak being
    01:00–04:00 and 06:00–10:00 UTC Mon–Fri ex-holidays). MJ's $0.66/$1.98 is off-peak exactly; the
    $1.74/$3.48 and $0.435/$0.87 rows match no tier. Note DeepSeek **reversed** the announced
    2026-09-14 V4 Pro retirement, so the model stands. Carried items 13 and 17 converge here.
12. **[Flagged — new, non-negotiable deadline]** **Confirm the OpenAI 2026-10-23 tranche**, which is
    **18 days out** and whose membership two sources contradict (see the warning above). MJ has a live
    `gpt-4o` route exposed to the `gpt-4o`-alias scope question, open for a fourth week.
13. **[Flagged — new]** **Vertex `gemini-2.0-flash-001` and `gemini-2.0-flash-lite-001` are `Active`
    with live prices on routes discontinued 2026-06-01.** The 10-02 run retired the Google rows and
    explicitly left Vertex unverified; this run reports Vertex carries the same date. One page-load
    closes it.
14. **[Flagged — new, local, needs a human decision not research]** **Claude 3.5 Sonnet's Anthropic
    cost row cannot be expired** because its seed-import `StartedAt` (2026-01-08) postdates the
    model's 2025-10-28 retirement. Someone must decide the real start date. See the "Reverted"
    section.
15. **[Flagged — new, local]** **Three cost rows have no `StartedAt` at all**: Whisper Large v3 /
    Groq, Whisper Large v3 Turbo / Groq, Whisper 1 / OpenAI. All three also store a per-hour or
    per-minute rate in a per-1M-token field — part of the unit problem in item 15.
16. **[Flagged — carried, widened]** **Non-token billing units.** Already blocking the image/video/
    audio schema decision (carried item 14); this run adds Cloudflare **neurons** ($0.011/1K with a
    published token→neuron conversion), Cohere rerank **per search**, TTS **per character** in both
    $/1M and $/1K conventions, STT **per hour of audio**, and video **per second by resolution**.
    A catalogue keyed on $/1M tokens needs an explicit unit field. The good news from this run:
    Google's new audio/TTS/omni models are **token-priced**, with per-second figures published as
    derived equivalents, so they fit the existing schema.
17. **[Flagged — new]** **Create a `Decision` model type** and then add Cloudflare Clef / Clef-flash
    and TypeSafe `jev-1.13`. This replaces carried item 16's per-model framing — it is a category now.
18. **[Flagged — carried, unchanged]** **CostRank/SpeedRank scale overflow**: 13 active models exceed
    the documented 1–10 range (SpeedRank 12 on Claude Haiku 4.5, Gemini 3.1 Flash-Lite, Gemini 3.5
    Flash-Lite; SpeedRank 11 on GPT 5.4-nano, Qwen 3.6 35B A3B, Mercury 2, Mercury Edit 2,
    GPT 5.6-luna, Gemini 3.6/3.7/3.8 Flash, GPT-6 Luna; CostRank 11 on Claude Opus 5 Fast).
    Carried item 8 — one recalibration pass with the band boundaries written down.
19. **[Flagged — carried, unchanged]** **115 Active inference routes have no Active cost row**,
    almost all OpenRouter. The underlying question is still open: should OpenRouter rows track
    OpenRouter's moving lowest-provider price at all?
20. **[Resolved — remove from the carry list]** **Carried item 12 is done.** A full scan finds
    **zero** duplicate primary keys across every model, vendor and cost row. The "no Realtime row on
    Claude 4 Opus / 4 Sonnet" half is moot: both are `IsActive: false` and retired on the Claude API,
    so adding a Realtime row would be wrong. Their duplicate Batch rows were de-duplicated above.
21. **[Resolved]** **Carried item 6** — "should the Claude family carry Vertex AI and Azure/Foundry
    routes?" — is answered as a *fact*: yes, Anthropic documents every current Claude model on
    Bedrock, Google Cloud and Microsoft Foundry, with platform-specific ids. Format rules that matter
    if MJ adds them: Bedrock's Messages endpoint (Opus 4.7+ and Haiku 4.5) uses bare
    `anthropic.<id>`; legacy InvokeModel (Opus 4.6 and earlier) uses `...-v1:0` **and requires an
    inference-profile prefix** (`global.` / `us.` / `eu.` / `jp.` / `apac.`); Google Cloud matches the
    Claude API exactly, with `@YYYYMMDD` for dated ids; Foundry uses the Claude API id as the default
    *deployment name*, and the deployment name — not the model id — goes in the `model` field.
    Whether to add them remains a scope decision.
22. **[Flagged — carried]** `ROUTINE_PROMPT.md:210` still defines `Priority` backwards, and this run
    found the inconsistency is worse than recorded. Details below.
23. **[Flagged — carried, unchanged]** Items 3, 10, 14 and 16 from the 2026-09-28 report not
    otherwise listed above. Not touched this run.

### Note on the routine prompt itself (§0 asks for this)

The repo mirror `reports/ai-model-research/ROUTINE_PROMPT.md` **matches the stored scheduled prompt
section for section** (§0.1–§0.6, Steps 1–4, Deliverables 1–4, Guidelines 1–11). No stale divergence
to report.

The `Priority` defect at line 210 is in **both** copies, so it is not a mirror drift — it is a real
error in the prompt of record, carried since `be40db4894`. Verified again in code today:
`BaseModelRunner.ts:1347` and `:1523`, `ExecutionPlanner.ts:428` and `:618` all sort
`b.Priority - a.Priority` — **descending, so a higher number is tried first** — while the routine
says "lower = higher priority". **New this run:** `AIModelVendor.Priority` is also read *ascending*
in `RerankerService.ts:341`, so the same field is sorted in both directions depending on the caller.
`BaseAIEngine.ts:1136/1395/1785` and `agent-pre-execution-rag.ts:161` also sort ascending, but on
different entities (presets, RAG rows), so those are not in conflict. The catalogue follows the
routine's inverted rule throughout (developer row 0, first-party 1, Bedrock 5, OpenRouter 50,
Fireworks 150), which means un-pinned failover currently tries **Fireworks → OpenRouter → Bedrock →
first-party**. The rows added this run follow the existing convention deliberately; fixing the prompt,
reconciling `RerankerService`, and renumbering the catalogue belong in one deliberate pass.

---

## OpenRouter & Fireworks.ai route validation

`openrouter.ai/api/v1/models` is the one source that would settle 121 of MJ's routes in a single
request, and it is blocked. The id-by-id validation the routine asks for **could not be completed**.
What follows is domain-restricted-search evidence covering roughly 60 of the 121 OpenRouter ids and
all 15 Fireworks ids. **Nothing here was applied.**

### Dead or renamed OpenRouter ids that MJ still records as `Active`

Verified locally that MJ carries each of these; the id status itself is snippet-grade.

| MJ model | MJ route id | Reported status | Replacement |
|---|---|---|---|
| Mistral Medium 3.5 | `mistralai/mistral-medium-3.5` | **dead** — canonical slug is hyphenated | `mistralai/mistral-medium-3-5` |
| Qwen 3.8 Max | `qwen/qwen3.8-max` | **renamed** | `qwen/qwen3.8-max-0902` (same $2/$6) |
| Kimi K2 | `moonshotai/kimi-k2` | **renamed** — OpenRouter's own page says K2 0905 "uses the original slug `moonshotai/kimi-k2`", and bare `kimi-k2` is no longer listed on the author page | `moonshotai/kimi-k2-0905` (256K ctx, not MJ's 131,072) |
| Magistral Medium 1.2 | `mistralai/magistral-medium-2509` | **never present on OpenRouter** — only the `2506` snapshot exists | `mistralai/magistral-medium-2506` |
| Magistral Small 1.2 | `mistralai/magistral-small-2509` | **never present** | `mistralai/magistral-small-2506` |

The two Magistral rows carry prices ($2/$5 and $0.5/$1.5) for ids that appear never to have existed
on that gateway, which suggests they were fabricated at ingest rather than retired. Both also have
Amazon Bedrock routes with **no cost row**, so the whole Magistral pair deserves a look.

### Time-critical: four MJ routes retire within 15 days

Confirmed still scheduled, and the first is **4 days out**:

| Date | MJ model | Route |
|---|---|---|
| **2026-10-09** | Qwen 3.6 Max Preview | `qwen/qwen3.6-max-preview` |
| **2026-10-09** | Qwen 3 235B | `qwen/qwen3-235b-a22b-thinking-2507` |
| **2026-10-20** | Gemini 2.5 Flash | `google/gemini-2.5-flash` (incl. `:batch`) |
| **2026-10-20** | Gemini 2.5 Pro | `google/gemini-2.5-pro` (incl. `:batch`) |

All four are `vendorRow=Active` today. The 2026-10-09 wave is broader than previously recorded — ten
further Qwen3-generation routes go with it, none of which MJ holds. `minimax/minimax-m2.1` retires
2026-10-08 (not in MJ). `google/gemini-2.5-flash-lite`'s OpenRouter date could not be confirmed, but
MJ already has that model `IsActive: false`. Also at risk and unconfirmed: MJ's `qwen/qwen3-32b` and
`qwen/qwen3-coder` — the same generational cull, and OpenRouter's canonical coder slug now reads
`qwen/qwen3-coder-480b-a35b`. **Probe both before 2026-10-09.**

### Fireworks.ai — the 10-02 open item is resolved at snippet grade

**10 of MJ's 15 Fireworks routes are not serverless-callable.** Per-route, from Fireworks' own model
pages and changelog:

| Not serverless (on-demand only, deprecated, or nonexistent) | Confirmed serverless, price matches MJ |
|---|---|
| `qwen3-235b-a22b`, `kimi-k2-instruct`, `qwen3-coder-480b-a35b-instruct`, `glm-4p6`, `glm-4p7` (also deprecated → GLM 5.1), `kimi-k2p5`, `minimax-m2p5` | `gpt-oss-120b` $0.15/$0.60 |
| `gpt-oss-20b` and `minimax-m2p7` — both **removed from serverless 2026-08-27** | `kimi-k3` $3/$15, cache $0.30 |
| `glm-5p2` — not on the serverless price list (MJ's row is already Inactive ✓) | `routers/kimi-k3-fast` $4.50/$22.50, cache $0.45 |
| **`qwen3p8-flash` — the id does not exist**, which explains the 404. The real ids are `qwen3p8-flash-next-fp8` / `-nvfp4`, both on-demand only. Nearest serverless equivalent is `qwen3p8-max` ($2/$6). | `glm-5p3-flash` $0.15/$0.50, cache $0.03 |

One price delta: MJ records Fireworks `gpt-oss-120b` cached input at **$0.075**; the published figure
is **$0.015** — MJ is 5× high on cache reads. In/out match. Snippet-grade, so flagged not applied.

Two Fireworks pricing-policy facts worth recording: since **2026-09-01, US-only serverless models
cost 1.5× the base serverless price**, and models not individually listed fall back to
parameter-count tiers (<4B $0.10; 4–16B $0.20; >16B $0.90; MoE ≤56B $0.50; MoE 56.1–176B $1.20 per
1M). Fireworks commits to ≥2 weeks' notice before removing a model.

### OpenRouter platform mechanics worth adopting

- **Deprecated variant suffixes.** `:thinking` is replaced by the `reasoning` request parameter,
  `:online` by the `openrouter:web_search` server tool, and `:extended` **has no model behind it at
  all** — `model:extended` requests fail. `openrouter/auto` is deprecated in favour of Auto Beta.
  **Checked locally: MJ uses none of these suffixes on any route. Clean.**
- **Latest-resolution aliases.** `~author/family-latest` (`~anthropic/claude-sonnet-latest`,
  `~openai/gpt-sol-latest`, `~google/gemini-flash-latest`, `~x-ai/grok-latest`,
  `~moonshotai/kimi-latest`) auto-resolve to the newest family member and would have absorbed
  several of the renames above. Worth deciding whether MJ's OpenRouter rows should pin or float.
- **Anthropic fast mode is a service tier on OpenRouter too** — `service_tier: "fast"` on the base
  model. The dedicated `*-fast` routes are deprecated-but-working with no shutdown date, which is
  consistent with the first-party finding that no `claude-opus-5-fast` model id exists at Anthropic.
- A per-model `llms.txt` exists (e.g. `openrouter.ai/mistralai/mistral-medium-3-5/llms.txt`), and
  dead slugs render a page titled **"Model Not Found"** — a clean presence test for a future run that
  can fetch pages.
- Limit corrections reported for MJ's NVIDIA rows: `nemotron-3-super-120b-a12b` ctx 262,144 (MJ
  records 1,000,000) and max out 262,144; `nemotron-3-ultra-550b-a55b` max out 65,536 (MJ 131,072);
  `nemotron-3-nano-30b-a3b` max out 262,144 (MJ 131,072). Also `z-ai/glm-5.3` max out reported as
  943,718 against MJ's 131,072, by two independent queries.
- In-window, non-model: **OpenRouter announced on 2026-10-02 that it is joining Stripe.** Vendor-risk
  note only.

### Three research claims this run checked and corrected

Worth recording, because each would have produced a wrong edit:

1. **"MJ's DeepSeek rows are contaminated with Xiaomi MiMo prices."** Rejected — the DeepSeek rows
   predate MiMo V2.6 by four to five months and the cache rates differ. Detail in the pricing section.
2. **"`openai/gpt-6-astra` is the biggest gap in MJ's catalogue."** Wrong — **GPT-6 Astra is already
   in MJ**, fully modelled on OpenAI, Azure and Amazon Bedrock at $10/$50 with cache read $1.00 and
   write $12.50, which matches the reported gateway price exactly. The only real gap is that MJ has
   no *OpenRouter* route for it. The claim came from a pass that was shown only the OpenRouter slice.
3. **"`gpt-6.1-sol`'s `MaxInputTokens` of 922,000 is a transcription error."** Wrong — it is
   1,050,000 context minus 128,000 max output, and the record's own description says so. Two separate
   passes flagged it. Do not "fix" it; decide the convention instead.


## Research Sources

### Fetched directly, and the basis for every applied edit

- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/build-with-claude/context-windows
- https://platform.claude.com/docs/en/models/sonnet-4-5/overview
- https://platform.claude.com/docs/en/about-claude/model-deprecations
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions
- https://platform.claude.com/docs/en/build-with-claude/fast-mode
- https://platform.claude.com/docs/en/build-with-claude/effort
- https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock
- https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock-legacy
- https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai
- https://platform.claude.com/docs/en/build-with-claude/claude-in-microsoft-foundry
- https://platform.claude.com/docs/en/models/opus-4-5/overview
- https://platform.claude.com/docs/en/release-notes/api
- https://www.anthropic.com/news · https://anthropic.com/glasswing

### Verified locally, no network needed

- `metadata/ai-models/.ai-models.json`, `metadata/ai-vendors/.ai-vendors.json`
- `packages/AI/Prompts/src/BaseModelRunner.ts`, `packages/AI/Prompts/src/ExecutionPlanner.ts`,
  `packages/AI/Reranker/src/RerankerService.ts`, `packages/AI/BaseAIEngine/src/BaseAIEngine.ts`
- `packages/TestingFramework/integration-test-suite/rigs/native-posture.cjs` (the `CAPABLE` driver set)
- `reports/ai-model-research/ROUTINE_PROMPT.md` (mirror check)

### Attempted and blocked at the egress proxy — no content obtained

`developers.openai.com/api/docs/{pricing,changelog,deprecations,models}` ·
`learn.microsoft.com/.../model-retirement-schedule` · `prices.azure.com/api/retail/prices` ·
`ai.google.dev/gemini-api/docs/{pricing,models,changelog,deprecations}` ·
`cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing` ·
`docs.x.ai/developers/{models,pricing,release-notes}` ·
`console.groq.com/docs/{models,deprecations}` ·
`inference-docs.cerebras.ai/{models,support/pricing,support/deprecation}` ·
`api.cerebras.ai/public/v1/models` · `openrouter.ai/api/v1/models` ·
`docs.mistral.ai/getting-started/models` · `api-docs.deepseek.com/quick_start/pricing` ·
`docs.cohere.com/docs/models` · `elevenlabs.io/docs/overview/models` ·
`platform.kimi.ai/docs/pricing/chat` · `docs.z.ai/guides/overview/pricing` ·
`alibabacloud.com/help/en/model-studio/model-pricing` ·
`platform.minimax.io/docs/guides/pricing-paygo` · `mimo.xiaomi.com/mimo-v2-6/article` ·
`docs.bfl.ai/quick_start/pricing` · `developers.cloudflare.com/workers-ai/platform/pricing` ·
`docs.typesafe.ai/models` · `developers.heygen.com/docs/models/heygen-video` ·
`microsoft.ai/news/...` · `deepgram.com/pricing`

### Vendor pages reached only as domain-restricted search summaries

Every non-Anthropic figure in this report comes from this channel. The vendor's own page is the
source, but no page was rendered, so **none of it was written to the JSON.** The full per-vendor URL
lists are preserved in the research transcripts for this run.
