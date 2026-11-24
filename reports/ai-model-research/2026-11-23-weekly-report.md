# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-11-23
**Research Period**: 2026-11-16 → 2026-11-23
**Base Branch**: `next`
**Research Branch**: `claude/ai-model-research-2026-11-23`

> **⚠ The firing prompt is still stale against the repo copy — fourth week running.**
> First reported [2026-11-02](2026-11-02-weekly-report.md), repeated
> [2026-11-09](2026-11-09-weekly-report.md) and [2026-11-16](2026-11-16-weekly-report.md).
> `reports/ai-model-research/ROUTINE_PROMPT.md` still carries **two sections the fired prompt does
> not**: **§0.6** (every LLM must state `ModelConfiguration.LLM.SupportsNativeToolCalling`, enforced
> by a test that fails the build) and **§0.7** (seven *standing decisions* dated 2026-10-20 that are
> to be applied, not re-flagged). The fired prompt's §0.6 is the repo's §0.8.
>
> **The dangerous divergence is unchanged.** The fired prompt's "Deliverable 2" says in bold *"Do NOT
> include `primaryKey` or `sync` objects"*. The repo copy says the opposite — *"**DO** include a
> `primaryKey` on every new record"* — and so does `metadata/CLAUDE.md` §1: *"`mj sync push` creates a
> new row for any record without one, so an omitted `primaryKey` inserts a duplicate."* The fired
> prompt's own §0.6 (repo §0.8) says `metadata/CLAUDE.md` wins on disagreement, so this run followed
> the repo and put a `primaryKey` on all 18 records it added. A run that followed the fired prompt
> literally would have inserted 18 duplicate rows on push.
>
> **New evidence this week that the repo copy is the live one.** `next` now contains commit
> `8e18be74f` *"chore(metadata): write back mj sync push canonical primaryKey and sync blocks"* —
> 1,301 of the file's 1,319 records now carry a push-written `sync` block. That writeback only works
> because records carry stable `primaryKey`s. The fired prompt's instruction is not merely out of
> date, it is now contradicted by the file's own contents.
>
> **Minor divergence, unchanged:** the fired prompt's §0.5 names three packages for the changeset.
> `.claude/rules/changesets.md` says a `metadata/`-only branch lists `"@memberjunction/core": minor`,
> which is what every prior run in this series shipped. This run follows the rule and the precedent.

---

## Executive Summary

**OpenAI shipped a new flagship generation on 2026-11-17 and MJ did not have it.** GPT-6.2 Astra and
GPT-6.2 Sol are both live on the OpenAI API and generally available in Microsoft Foundry (deployment
version `2026-11-17`); Astra carries a **20% price cut** from GPT-6 Astra ($8/$40, down from
$10/$50) and Sol holds GPT-6.1 Sol's $2/$10. Both are added. **Qwen4-Max**, Alibaba's first Qwen 4
generation flagship (2026-11-16, $1.50/$4.50, 1M context), and **Muse Ember**, Meta's cheapest Muse
tier, are added as well.

Two long-standing flagged items are closed by direct evidence rather than carried a fifth week: the
**Qwen 3.7 Plus output-price error** ($1.16 → $1.60, a digit transposition flagged for four weeks) and
**Gemini 4 Carbon's missing `MaxOutputTokens`** (65,536, from Google AI Studio's own developer guide,
matching the sibling Neon and Hydrogen records). The **2026-12-11 OpenAI shutdown wave** also has its
price windows closed ahead of time, so cost reporting for `gpt-5`, `gpt-5-mini` and `gpt-5-nano`
corrects itself on the retirement date with no further edit.

Anthropic's full list-price table was re-verified line by line and **matches MJ on all 26 Claude
models**, cache multipliers included. **No new Claude model shipped this week** — the lineup is
unchanged from 2026-11-16.

### Research-channel status — unchanged, and now the fourth week of degraded coverage

Direct outbound HTTPS to vendor documentation hosts remains blocked by the environment's network
policy. **`platform.claude.com` is the only reachable host, for the fourth week running**, and
`WebFetch` is subject to the same policy (confirmed again this week: `developers.openai.com`,
`techcommunity.microsoft.com`, `technode.com` and `docs.modelstudio.console.alibabacloud.com` all
fail with `ENOTFOUND` through the tool, not just through `curl`).

| Channel | Status this run |
|---|---|
| `platform.claude.com` | **Working, direct fetch** — pricing and models-overview tables read verbatim |
| WebSearch (standard + extended) | Working; reaches first-party pages server-side. The channel for everything else. |
| `developers.openai.com` | Blocked (`ENOTFOUND`), both `curl` and `WebFetch` — the GPT-6.2 rate card could not be read directly |
| `techcommunity.microsoft.com` / `learn.microsoft.com` | Blocked — Microsoft's own GA announcement reachable only through search |
| `docs.modelstudio.console.alibabacloud.com`, `alibabacloud.com` | Blocked — fourth week; Qwen figures remain search-quoted |
| `openrouter.ai/api/v1/models` | **Blocked** — no route sweep, fourth week running |
| `ai.google.dev`, `docs.x.ai`, `console.groq.com`, `api-docs.deepseek.com` | Blocked direct; WebSearch only |
| AWS Bedrock price list / model cards | Not reached by either channel — carried items stay open |

**The consequence, stated plainly: the Anthropic verification in this PR is first-party and every
addition is not.** Each added model's prices are quoted from the vendor's own page by several
independent write-ups that agree with one another — good evidence, and the sourcing is recorded in
each cost row's `Comments` — but it is not the same thing as reading the rate card. Where sources
disagreed (Azure per-token rates for GPT-6.2, Qwen4-Max's thinking-mode output cap) nothing was
written.

### Driver-registration check

This run adds **eight inference routes** across four driver classes, all already registered:

- `OpenAILLM` — registered, not in `DRIVERS_WITHOUT_TOOLS`, so model-level
  `SupportsNativeToolCalling: true` stands on both GPT-6.2 records.
- `AzureLLM` — registered, but **is** in `DRIVERS_WITHOUT_TOOLS`, so both GPT-6.2 Azure rows carry an
  explicit vendor-level `SupportsNativeToolCalling: false` override, exactly as the GPT-6 Astra and
  GPT-6.1 Sol Azure rows do.
- `QwenLLM` — named on 10 existing first-party Qwen routes; the Qwen4-Max Alibaba row mirrors the
  sibling `qwen3.8-max` row, vendor-level `false` included. (`QwenLLM` remains **unregistered** —
  carried item 12 below; the model still resolves through its OpenRouter route.)
- `OpenRouterLLM` — registered, not in `DRIVERS_WITHOUT_TOOLS`.

No new driver class is introduced.

---

## Current Inventory Snapshot

After this run's edits: **247 model records** (201 with `IsActive: true`), **720 vendor rows**,
**352 cost rows**, across **40 vendors**.

By model type: LLM 196, Realtime 16, Image Generator 12, Embeddings 12, TTS 5, Speech to Text 3,
Video 2, Reranker 1.

Inference routes by vendor (total / `Active`):

| Vendor | Inference routes | Active | Last touched by this routine |
|---|---|---|---|
| OpenRouter | 136 | 125 | **2026-11-23 (this run — Qwen4-Max, Muse Ember)** |
| OpenAI | 52 | 44 | **2026-11-23 (this run — GPT-6.2 Astra, GPT-6.2 Sol, Dec-11 wave)** |
| Google | 34 | 25 | **2026-11-23 (this run — Gemini 4 Carbon max output)** |
| Azure | 30 | 29 | **2026-11-23 (this run — GPT-6.2 Astra, GPT-6.2 Sol)** |
| Anthropic | 28 | 14 | 2026-11-16 |
| Vertex AI | 27 | 21 | **2026-11-23 (this run — Gemini 4 Carbon max output)** |
| Amazon Bedrock | 26 | 26 | 2026-11-16 |
| Groq | 18 | 9 | 2026-11-02 |
| x.ai | 15 | 15 | 2026-10-26 |
| Fireworks.ai | 15 | 14 | 2026-10-19 |
| Mistral AI | 14 | 11 | 2026-11-01 |
| Cerebras | 11 | 1 | 2026-08-17 |
| Alibaba Cloud | 11 | 11 | **2026-11-23 (this run — Qwen4-Max, Qwen 3.7 Plus price fix)** |
| LM Studio | 7 | 7 | — |
| Z.AI | 7 | 7 | 2026-10-12 |
| LocalEmbeddings | 6 | 6 | — |
| Eleven Labs | 6 | 6 | — |
| Moonshot AI | 6 | 5 | 2026-10-26 |
| MiniMax | 5 | 5 | 2026-10-19 |
| Black Forest Labs | 4 | 4 | 2026-11-09 |
| Inception Labs / DeepSeek / Cohere | 3 each | 3 each | 2026-10-05 / 2026-10-19 / 2026-11-09 |
| Tasio Labs, HeyGen, AssemblyAI, Inworld, Hugging Face, DeepInfra, SiliconFlow, MemberJunction | 1 each | 1 each | — |

Note: the **Meta**, **NVIDIA**, **Thinking Machines Lab**, **Sakana AI**, **Xiaomi**, **Cloudflare**,
**System One Endpoint**, **Perplexity** and **Subquadratic** vendor rows exist as Model Developers
only — MJ has no first-party driver for them, so their models route through OpenRouter. Muse Ember
follows that existing shape.

---

## New Models Available

### 1. GPT-6.2 Astra — **added**, third-party corroborated

| Field | Value |
|---|---|
| API id | `gpt-6.2-astra` (OpenAI direct and Microsoft Foundry use the same id) |
| Released | 2026-11-17 |
| Context | 1,050,000 tokens total — 922,000 max input, 128,000 max output |
| Price | **$8 / $40** per 1M in/out; cached input $0.40; cache write $10 (30-minute retention) |
| vs. predecessor | GPT-6 Astra was $10/$50 — a **20% cut** |
| Effort levels | `low`, `medium`, `high`, `xhigh`; **`none` is not accepted** |
| Features | Structured Outputs, streaming; function/tool calling requires the Responses API |
| Long context | A request above 272,000 input tokens is rebilled in its entirety at 2x input/cached and 1.5x output — **not modelled**, recorded in `Comments` per standing decision 6 |
| Ranks assigned | PowerRank 28, SpeedRank 7, CostRank 10 |

Added with an OpenAI Model Developer row, an OpenAI inference route (`OpenAILLM`), an Azure inference
route (`AzureLLM`, GA in Foundry at deployment version `2026-11-17`), and one OpenAI cost row.
`PriorVersionID` → GPT-6 Astra. **No Azure cost row** and **no Bedrock or OpenRouter route** — see
Flagged items 1 and 2.

Ranking rationale: GPT-6 Astra is P27/C10 and Claude Fable 5.2 — the same $8/$40 rate card — is
P28/C10, so P28/C10 places GPT-6.2 Astra consistently against both its predecessor and its nearest
price peer.

### 2. GPT-6.2 Sol — **added**, third-party corroborated

| Field | Value |
|---|---|
| API id | `gpt-6.2-sol` |
| Released | 2026-11-17 |
| Context | 1,050,000 total — 922,000 max input, 128,000 max output |
| Price | **$2 / $10** per 1M; cached input $0.10; cache write $2.50 — unchanged from GPT-6.1 Sol |
| Effort levels | `low`, `medium`, `high`, `xhigh`; no `none` |
| Foundry | GA, Global Standard, reported in 28 regions, version `2026-11-17` |
| Ranks assigned | PowerRank 27, SpeedRank 8, CostRank 5 |

Same route shape as Astra. `PriorVersionID` → GPT-6.1 Sol (P26/S8/C5), so P27 at the same cost rank
records "newer, same price".

### 3. Qwen4-Max — **added**, third-party corroborated

| Field | Value |
|---|---|
| API id | `qwen4-max` (Alibaba Cloud Model Studio); `qwen/qwen4-max` on OpenRouter |
| Released | 2026-11-16 |
| Architecture | 2.4T-parameter MoE, ~71B active; **closed weights** |
| Context | 1M window — 991,808 max input, 131,072 max output (non-thinking) |
| Price | **$1.50 / $4.50** per 1M, cached input $0.075 — International (Singapore). Frankfurt / Virginia / Tokyo / Hong Kong / Beijing list $1.413/$4.24 (not modelled) |
| Billing note | One price tier covers the whole 1M context; thinking and non-thinking share the rate, and reasoning bills as output |
| Modalities | Text, image and video input; text output |
| Ranks assigned | PowerRank 23, SpeedRank 6, CostRank 6 |

Added with an Alibaba Cloud Model Developer row, an Alibaba Cloud inference route (`QwenLLM`,
mirroring the sibling `qwen3.8-max` row including its vendor-level
`SupportsNativeToolCalling: false`), an OpenRouter route, and one Alibaba Cloud cost row.
`PriorVersionID` → Qwen 3.8 Max (P21/C7 at $2/$6), so P23/C6 records "stronger and cheaper".
**No OpenRouter cost row**, per standing decision 4.

The reported thinking-mode output cap (262,144 shared between thinking and answer) and the separate
`qwen4-max-preview` id (Token Plan only, reported 393,216 output) are **not modelled** — see
Flagged item 3.

### 4. Muse Ember — **added**, third-party corroborated, no cost row by design

| Field | Value |
|---|---|
| API id | `muse-ember-1.0` on the Meta Model API; `meta/muse-ember` on OpenRouter |
| Released | 2026-11-09 |
| Context | 1M tokens; multimodal input (text, image, video, audio, PDF), text output |
| Price | $0.10 / $0.50 per 1M on the Meta Model API, cache reads $0.004; above 200K input tokens the request rebills at $0.30/$1.50 |
| Ranks assigned | PowerRank 19, SpeedRank 10, CostRank 2 |

Positioned below Muse Spark as Meta's high-volume routing tier (Artificial Analysis gives it an
Intelligence Index of 36 against Muse Spark 1.3's 37, at ~1/17 the cost per task). MJ has no Meta
first-party driver, so — exactly as with Muse Wonder — the only inference route is OpenRouter, which
standing decision 4 says carries no cost row. **The model therefore has no cost row at all**; its
rate card is recorded in the `Description` so the information is not lost.

---

## Pricing Changes Detected

| Model | Vendor | Previously in MJ | Correct figure | Change | Applied |
|---|---|---|---|---|---|
| Qwen 3.7 Plus | Alibaba Cloud | $0.40 / **$1.16** | $0.40 / **$1.60** | **+37.9% output** | **Yes — in place** |
| GPT-6.2 Astra | OpenAI | *(new)* | $8 / $40 | −20% vs GPT-6 Astra | Yes (new record) |
| GPT-6.2 Sol | OpenAI | *(new)* | $2 / $10 | flat vs GPT-6.1 Sol | Yes (new record) |
| Qwen4-Max | Alibaba Cloud | *(new)* | $1.50 / $4.50 | −25% vs Qwen 3.8 Max | Yes (new record) |

No pricing drift was found anywhere in the Claude family — Anthropic's full list-price table was
re-read and matches MJ on all 26 models it carries, including the cache multipliers (0.025x on
Fable/Mythos 5.1 and 5.2, 0.05x on Opus 5.5 and Sonnet 5.5, 0.1x elsewhere).

### Why the Qwen 3.7 Plus fix is an in-place edit, not an expire-and-replace

This is a **data-entry error, not a price change**. Alibaba Cloud Model Studio lists `qwen3.7-plus`
at $0.40 input / **$1.60** output for the standard 0–256K input tier (excluding limited-time
promotions), with $4.80 output on the 256K–1M tier; MJ recorded $1.16, which is a digit
transposition of $1.60. Aggregator figures of $1.28 are a time-limited 20% discount on the alias, not
list price. The input price was already correct.

Expiring the row and opening a new one would assert that the price *changed* on 2026-11-23, which is
false — the row was never correct. Guideline 2 permits overwriting an existing entry *"when
correcting a clear error"*, so the output price is corrected in place and the correction, its date
and its reasoning are appended to the row's `Comments`. **The paired OpenRouter cost row is
deliberately left untouched** per standing decision 4. This closes an item flagged for four
consecutive weeks (2026-10-26 onward) that was costing ~38% accuracy on every Qwen 3.7 Plus output
token in cost reporting.

---

## Model Updates & New Versions

### Gemini 4 Carbon — `MaxOutputTokens` set to 65,536 (closes a carried flag)

Last week's run left `MaxOutputTokens` unset on all three Gemini 4 Carbon inference routes because
four third-party sources gave mutually contradictory figures. The Google AI Studio **developer
guide** settles it: the default synchronous output limit on the Interactions API is **65,536 tokens**,
raisable toward the full 1M window with `background=True` and a higher `max_output_tokens`. The
larger figures circulating (1,048,576; 943,718) are the background-execution ceiling and an
aggregator's arithmetic respectively.

65,536 is now recorded on the Google, Vertex AI and OpenRouter routes, matching the sibling
**Gemini 4 Neon** and **Gemini 4 Hydrogen** records that landed on `next` this week from other PRs.
The provenance is appended to the model's `Description`.

### Added to `next` by other PRs this week — verified, no action needed

`next` gained **Gemini 4 Neon** (`gemini-4-neon`, $3/$15, P27/S10/C6) and a unified **Gemini 4
Hydrogen** record (`gemini-4-hydrogen`, $0.45/$1.80) via commits `c1e44e45d` and `f06404769`. Gemini
4 Hydrogen was **Flagged item 4 on 2026-11-16** ("single source, not added") — it is now in the
repository from a first-party-informed PR, so that flag is **closed, not carried**. Both records were
checked against this run's gates and pass.

---

## Deprecated / Sunset Models

### OpenAI's 2026-12-11 wave — **price windows closed, routes left live**

OpenAI retires `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `o3`, `o3-pro` and their dated
snapshots from the API on **2026-12-11** (notice dated 2026-06-11); requests to those ids error
afterwards. MJ carries `GPT 5`, `GPT 5-mini`, `GPT 5-nano` and `o3`, all `Active`.

Applied, exactly as the Claude Sonnet 4.5 precedent from last week:

- **`EndedAt: 2026-12-11T00:00:00.000Z`** added to the **OpenAI** cost row of GPT 5, GPT 5-mini and
  GPT 5-nano. `Status` stays `Active`, so the row keeps being selected until the date and then stops
  being selected on its own — cost reporting corrects itself with no further edit.
- **`o3` has no OpenAI cost row** (only an Azure one), so there is nothing to window-close there.
- **Azure and OpenRouter rows are untouched.** Those platforms set their own lifecycle dates, and
  Azure's `gpt-5` family is still listed.
- **No vendor row set `Inactive` and no cost row set `Expired` yet.** Doing that today would strip
  the price 18 days early. That edit belongs to the first run after 2026-12-11 — Flagged item 5.

A convention note for the reader: `EndedAt` is set at **00:00Z on the retirement date**, so the price
stops being selected at the start of that day rather than the end of it. That is the convention the
Sonnet 4.5 row established last week; it is applied here for consistency rather than invented anew.

### Claude Sonnet 4.5 — retirement is **seven days out**, second half still pending

`claude-sonnet-4-5-20250929` retires on the Claude API on **2026-11-30**. The cost row's `EndedAt` was
set last week, so cost reporting already self-corrects. The remaining edit — Anthropic Inference
Provider route → `Inactive`, Anthropic cost row → `Expired` — is **Flagged item 4**, due on the first
run after 2026-11-30. Bedrock and OpenRouter routes must stay untouched.

### Nothing else newly deprecated

Anthropic's deprecations table shows no change since 2026-11-16. Moonshot's K2-series end-of-life
still has no published shutdown date. Groq's six past-shutdown routes are unchanged (Flagged item 11).

---

## New Vendors Worth Considering

**None added.** Every vendor named in this run's edits already has a row in
`metadata/ai-vendors/.ai-vendors.json` (OpenAI, Azure, Alibaba Cloud, Meta, OpenRouter), and every
`@lookup:MJ: AI Vendors.Name=…` introduced was checked mechanically against that file.

Two vendors surfaced in research and were **not** added, for the same reason as prior weeks — a
vendor row is only worth creating when a model will actually route through it:

- **Tencent** (`Hy4 flash`, reported 2026-11-16) — one release-tracker mention, no model id, no
  published USD rate card, and no MJ driver.
- **Together AI** (appears as a Qwen4-Max host, `Qwen/Qwen4-Max`) — a plausible future inference
  provider, but adding it would create a route with no driver behind it.

---

## Recommended Actions

### Applied this run: 4 models, 8 vendor rows, 3 cost rows, 1 price error fixed, 3 price windows closed, 3 token limits set, 0 deletions

1. **[Applied]** **GPT-6.2 Astra added** — `gpt-6.2-astra`, 922K/128K, OpenAI route `Active`, Azure
   route `Active`, one OpenAI cost row at $8/$40 with $0.40 cache read and $10 cache write.
2. **[Applied]** **GPT-6.2 Sol added** — `gpt-6.2-sol`, 922K/128K, OpenAI + Azure routes, one OpenAI
   cost row at $2/$10 with $0.10 cache read and $2.50 cache write.
3. **[Applied]** **Qwen4-Max added** — `qwen4-max`, 991,808/131,072, Alibaba Cloud + OpenRouter
   routes, one Alibaba Cloud cost row at $1.50/$4.50 with $0.075 cache read.
4. **[Applied]** **Muse Ember added** — `meta/muse-ember`, Meta Model Developer row + OpenRouter
   route, no cost row (standing decision 4); rate card recorded in the `Description`.
5. **[Applied]** **Qwen 3.7 Plus output price corrected** $1.16 → $1.60 on the Alibaba Cloud row,
   in place, with the correction documented in `Comments`. **Closes a four-week-old flag.**
6. **[Applied]** **Gemini 4 Carbon `MaxOutputTokens` = 65,536** on all three inference routes, with
   provenance appended to the `Description`. **Closes a flag from last week.**
7. **[Applied]** **2026-12-11 OpenAI shutdown wave** — `EndedAt` set on the OpenAI cost rows of
   GPT 5, GPT 5-mini and GPT 5-nano so their prices stop being selected on the retirement date.
8. **[Verified, no change]** **Anthropic's entire list-price table matches MJ** on all 26 Claude
   models, cache multipliers and the 200K-context generation included. No new Claude model shipped
   this week.
9. **[Verified, no change]** **MJ is current on Cohere rerank** — `rerank-v5.0-pro` and
   `rerank-v5.0-fast` (Rerank 5, released 2026-10-21) are already carried, including the
   2026-11-04 OpenRouter availability.
10. **[Verified, no change]** **Mistral Large 4's $0.70/$2.10 row is correct** — MJ already records
    the full price history (launch promo $0.68/$2.09 → $1.36/$4.18 from 2026-10-20 → $0.70/$2.10 from
    2026-10-29), which matches the most recent sources. No edit needed.
11. **[Verified, no change]** **MiniMax-M3.1-Flash, GLM-5.3, GLM-5.3-Flash, Kimi K3.1 Pro and
    DeepSeek V4.1 Flash** — all already carried at the prices research found.

### Flagged, not applied

1. **[Flagged — NEW, needs an Azure rate card]** **GPT-6.2 Astra and GPT-6.2 Sol have no Azure cost
   row.** Both Foundry routes are added (GA is confirmed by Microsoft's own announcement, deployment
   version `2026-11-17`), but unpriced: the search channel explicitly reported that sources *disagree*
   on the Foundry Global Standard per-token rate, and `techcommunity.microsoft.com` /
   `learn.microsoft.com` are unreachable. Every prior GPT-6 model prices Azure at parity with OpenAI
   direct, so $8/$40 and $2/$10 are the near-certain answers — but guideline 1 says not to write a
   price I cannot verify. One read of the Azure pricing page closes both.
2. **[Flagged — NEW, no confirmed ids]** **GPT-6.2 Astra / Sol on Amazon Bedrock and OpenRouter.**
   One source said both are listed on OpenRouter; a second, more specific search found no mention of
   either platform. GPT-6 Astra and GPT-6.1 Sol both have Bedrock routes, so routes probably exist —
   but a route with a guessed `APIName` is a permanently dead route, so none was added.
3. **[Flagged — NEW, needs Alibaba's docs]** **Qwen4-Max thinking-mode output cap and
   `qwen4-max-preview`.** Sources conflict on the thinking-on output ceiling (262,144 vs 393,216) and
   the preview id is Token-Plan-only. Only the non-thinking 131,072 cap is recorded. Same blocker as
   item 7.
4. **[Flagged — carried, deadline 2026-11-30, for the next run]** **Finish the Claude Sonnet 4.5
   retirement**: Anthropic Inference Provider route → `Inactive`, Anthropic cost row → `Expired`
   (`EndedAt` already set). Do **not** touch the Bedrock or OpenRouter routes.
5. **[Flagged — NEW, deadline 2026-12-11]** **Finish the OpenAI Dec-11 wave**: after the date, set the
   OpenAI Inference Provider routes on GPT 5 / GPT 5-mini / GPT 5-nano / `o3` to `Inactive` and their
   OpenAI cost rows to `Expired` (`EndedAt` already set on three of them; `o3` has no OpenAI cost
   row). Leave Azure and OpenRouter alone. Also check `gpt-5-pro` and `o3-pro` — MJ appears not to
   carry them, which is worth confirming rather than assuming.
6. **[Flagged — carried, environment, blocks future runs]** **Vendor documentation hosts are blocked
   by the network policy, and `WebFetch` cannot route around it.** Only `platform.claude.com` works.
   **Fourth week open.** The measure of the cost is inside this PR: the Anthropic *verification* is
   first-party down to the cache multiplier, and all four *additions* are third-party corroborated.
   Without the OpenRouter models API there is still no route sweep, so coverage keeps degrading to
   "the vendors we thought to ask about".
7. **[Flagged — carried, now fifth week, partially closed]** **Alibaba Model Studio is unreachable.**
   The Qwen 3.7 Plus price error is fixed this week on the strength of the search channel quoting
   Alibaba's own page, but the cached-input rates and output caps for Qwen4-Max remain third-party
   only. Allowing `alibabacloud.com` in the session's network settings closes this class of item.
8. **[Flagged — carried, needs the AWS price list]** **Claude Fable 5.2 on Bedrock has no cost row**
   (route added 2026-11-16, unpriced), and **GPT-6.1 Terra's Bedrock route is still unpriced**.
   `pricing.us-east-1.amazonaws.com` remains unreachable.
9. **[Flagged — carried, no price]** **Kimi K3.1 Pro on Amazon Bedrock** (AWS post ~2026-11-12) — a
   route addition, not a model, but it needs a Bedrock model id and rate, neither reachable.
10. **[Flagged — carried, no API identifier]** **GPT-6 Cyber** — a reported price ($20/$100) but still
    no published API model id, so standing decision 1 cannot help: a `Preview` route still needs an
    `APIName`.
11. **[Flagged — carried, needs an engineer]** **Six Groq routes past shutdown.** Own PR; test and
    prompt bindings must be repointed first.
12. **[Flagged — carried, unregistered drivers]** `MoonshotLLM`, `KimiLLM`, `QwenLLM`, `DeepSeekLLM`,
    `ZAILLM` are named on first-party routes (now **25**, since Qwen4-Max's Alibaba route uses
    `QwenLLM`) and registered nowhere — the registry has `ZhipuLLM`, a different name. Every affected
    active model still resolves via a higher-`Priority` registered route, so the symptom is a
    permanently unusable first-party route, not an outage.
13. **[Flagged — carried, deadline 2027-02-26]** OpenAI retires `whisper-1` and the
    `gpt-4o-transcribe` family. MJ's `Whisper 1` OpenAI route is affected; `OpenAIAudioGenerator`
    *is* registered, so this is a model-id migration, not driver work.
14. **[Flagged — carried, dated]** Remaining OpenAI shutdowns: **GPT Image models 2026-12-01**;
    `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` **2027-01-06**; GPT-4o / GPT-4o mini / GPT-4.1 /
    GPT-4.1 mini **2027-01-14**; `gpt-5.1`, `gpt-5.4-nano`, `gpt-5.3-codex` **2027-04-01**. The
    2026-12-01 image-model date is the nearest and should be checked on the next run — one source
    also reports Agent Builder, the Evals dashboard/API and `/v1/prompts` closing 2026-11-30, which is
    tooling rather than model metadata.
15. **[Flagged — carried, code]** Anthropic API version `2026-10-21` removes `temperature`, `top_p`
    and `top_k` (400 error) — affects `AnthropicLLM` and any prompt setting a temperature, once MJ
    moves to that version.
16. **[Flagged — carried, needs a driver]** **Gemini Omni 1.2 Flash** (no Google video driver) and
    **Nemotron 3.5 Transcribe** (no audio driver) would be intentionally dead routes.
17. **[Flagged — carried, still genuinely open]** MiniMax-M3 $0.60/$2.40 vs reported $0.30/$1.20;
    Cohere Command A+ possibly unpriceable, and **none of MJ's six Cohere reranker records has a cost
    row at all** (Rerank 5 Pro/Fast list at $0.05/M and $0.02/M, which needs the per-search vs
    per-token unit question settled first); DeepSeek V4 Pro's three concurrent `Active` cost rows and
    V4 Flash's two; the three cost rows with no `StartedAt` (Whisper Large v3, Whisper Large v3 Turbo,
    Whisper 1); Claude 3.5 Sonnet's unexpirable Anthropic row; Vertex `gemini-2.0-flash-001` /
    `-lite-001`; a `Decision` model type; Mistral Large 3 / Medium 3.5 retirement 2027-04-30; Kimi
    K2.6 / K2.7-Code deprecated on Moonshot with no shutdown date; the non-OpenRouter `Active` routes
    with no open `Active` cost row (**45**, up two from last week's 43 — both additions are this run's
    GPT-6.2 Azure routes, Flagged item 1. Breakdown: OpenAI 7, LM Studio 7, LocalEmbeddings 6, Eleven
    Labs 6, Amazon Bedrock 4, Azure 3, Google 2, and one each on Mistral AI, Tasio Labs, HeyGen,
    AssemblyAI, x.ai, Inworld, Groq, Hugging Face, Fireworks.ai and MemberJunction; the LM Studio and
    LocalEmbeddings ones are local and legitimately free).
18. **[Flagged — carried, one item closable]** **Claude Opus 4.1's model-level `IsActive: false`
    while its Bedrock and OpenRouter routes are live.** Anthropic's own table confirms it is "retired,
    except on Claude Models on Google Cloud (Google managed) and Bedrock", so MJ's shape is arguably
    right. Recommend **closing this item** rather than carrying it a fifth week; it needs a decision,
    not research.
19. **[Flagged — meta, oldest and highest-severity open item]** **The trigger's stored prompt is four
    weeks stale against `ROUTINE_PROMPT.md`, and one of the divergences is actively harmful.** See the
    banner: the fired prompt tells a run *not* to write `primaryKey`, which `metadata/CLAUDE.md` says
    would insert duplicate rows on push — and `next` now contains a `mj sync push` writeback commit
    that depends on those keys. An agent cannot fix this: the Routine was created through the HTTP
    API, so a human must edit it in the Routines UI.

### Settled by §0.7 — not re-flagged

Per standing decisions 1–7 (2026-10-20): the limited-availability convention (1 — nothing qualified
this week), pinned versions vs floating aliases (2 — the dateless `gpt-6.2-astra` / `gpt-6.2-sol` ids
are their own pinned snapshots and no alias record was added), non-token billing units (3), OpenRouter
routes missing cost rows (4 — **applied to the new Qwen4-Max and Muse Ember OpenRouter routes**, and
125 of MJ's OpenRouter routes are correctly unpriced), rank-scale recalibration (5 — new models ranked
against nearest neighbours; the DeepSeek P32/P30 outliers are not re-flagged), request-size and
long-context price tiers (6 — the GPT-6.2 272K surcharges, the Qwen 3.7 Plus 256K tier and the Muse
Ember 200K tier are recorded in `Comments`/`Description`), and the 8 duplicate `primaryKey` UUIDs
across two different tables (7).

---

## Verification performed on this branch

Stated precisely, including what was *not* run:

- **§0.3 pre-flight check — run, prints `OK`.** Both metadata files parse; every vendor `Status` and
  every cost `Status` is in its own entity's allowed set; no `Expired` row lacks `EndedAt`; no
  `EndedAt` is at or before its `StartedAt`. **No cost row anywhere carries `Inactive`** — the
  specific value that broke `next` in #4030 and #4110. This run adds no `Expired` row and no
  `Inactive` vendor row at all, so the §0.2 recipe had no occasion to be applied; the two pending
  deprecations are deliberately left for their post-date runs (Flagged items 4 and 5).
- **`primaryKey` / `sync` hygiene — run, passes.** All **1,319** records and nested children in
  `.ai-models.json` carry a `primaryKey`; all are well-formed uppercase UUIDs; **no duplicates
  anywhere in the file**. The 18 ids added this run were generated with a CSPRNG
  (`crypto.randomUUID`, uppercased) because `uuidgen` is not installed in this environment. **None of
  the 18 new records carries a `sync` block** — push writes those, as commit `8e18be74f` did for the
  1,301 pre-existing records.
- **`@lookup:` targets — checked mechanically.** Every `MJ: AI Vendors` lookup in the whole file
  resolves against `.ai-vendors.json`, and every `PriorVersionID` resolves against a model name in
  the file (GPT-6.2 Astra → GPT-6 Astra, GPT-6.2 Sol → GPT-6.1 Sol, Qwen4-Max → Qwen 3.8 Max — all
  three already on `next`, so no forward-reference ordering question).
- **Diff shape — confirmed additive.** 396 insertions, 6 deletions; all six "deletions" are modified
  lines (three GPT-5-family `Comments` strings, the Qwen 3.7 Plus `Comments` and
  `OutputPricePerUnit`, and the Gemini 4 Carbon `Description`). The file was confirmed to be canonical
  2-space JSON with no trailing newline before and after, so re-serialization introduced no
  incidental reformatting. **No record was deleted, and the only existing price touched is the
  Qwen 3.7 Plus error correction.**
- **Cost-row selection — verified by evaluating the real predicate against the edited file.** The
  predicate in `packages/AI/BaseAIEngine/src/BaseAIEngine.ts:874-883` (`Status === 'Active'` AND
  `ProcessingType` match AND `StartedAt <= now` AND `!EndedAt || EndedAt > now`, most recent
  `StartedAt` wins) was read and re-implemented. Exactly one row is selected at every instant tested:
  GPT-6.2 Astra → $8/$40 and GPT-6.2 Sol → $2/$10 at every date; Qwen4-Max → $1.50/$4.50;
  Qwen 3.7 Plus → $0.40/$1.60 (the corrected figure); Gemini 4 Carbon → $2/$10 today and on
  2026-11-30, $4/$20 from 2026-12-01 (the existing cutover still works); **GPT 5 / GPT 5-mini /
  GPT 5-nano on OpenAI → their current prices today and on 2026-11-30, and `(none)` from 2026-12-11
  onward**, while their **Azure rows keep returning a price**, which is the intended behaviour;
  Claude 4.5 Sonnet → $3/$15 today and `(none)` from 2026-11-30, unchanged from last week.
- **§0.6 `SupportsNativeToolCalling` gate — both assertions replicated, both pass; the test itself
  was NOT run.** `packages/AI/Core` has no `node_modules` in this environment, so `vitest` cannot
  start, and a workspace install was out of proportion to a metadata-only change. Both assertions in
  `modelConfiguration.test.ts` read `.ai-models.json` directly, so they were re-implemented against
  the edited file: all **196** LLM records (192 before, +4) state the flag as a boolean, and **no
  `Active` vendor row resolves `true` on a driver in `DRIVERS_WITHOUT_TOOLS`** — including the two new
  Azure rows, whose vendor-level `false` correctly wins over the model-level `true`. This is strong
  evidence, not a test run: **the Integration Tier and unit-test workflows on the PR are the real
  gate and should be read before merge** (§0.4).
- **`mj sync validate` — not run**, as the routine notes: it needs a database connection, which this
  environment does not have.

---

## Research Sources

**First-party (read directly):**

- Anthropic pricing table, including cache-hit multipliers, fast mode, batch and long-context —
  <https://platform.claude.com/docs/en/about-claude/pricing>
- Anthropic models overview, model ids and per-platform ids —
  <https://platform.claude.com/docs/en/about-claude/models/overview>

**First-party pages reached only through the search channel (host blocked to this session):**

- OpenAI models page (`gpt-6.2-astra`, `gpt-6.2-sol` ids and rate card) —
  <https://developers.openai.com/api/docs/models>
- Microsoft Foundry GA announcement for GPT-6.2 Astra and Sol —
  <https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/gpt-6-2-astra-and-gpt-6-2-sol-now-generally-available-in-microsoft-foundry/4574122>
- Microsoft Foundry reasoning-effort documentation —
  <https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning>
- Alibaba Cloud Model Studio model pricing —
  <https://www.alibabacloud.com/help/en/model-studio/model-pricing> ;
  <https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen3-7-plus>
- Google AI Studio Gemini 4 Carbon developer guide —
  <https://x.com/GoogleAIStudio/status/2120216895874117934>
- Cohere release notes — <https://docs.cohere.com/v2/changelog>

**Third-party corroboration:**

- GPT-6.2 Astra / Sol — <https://www.datacamp.com/blog/gpt-6-2-astra-and-sol> ;
  <https://www.epifive.com/blog/gpt-6-2-astra-sol-api-pricing-limits> ;
  <https://computingforgeeks.com/gpt-6-2-astra-sol-pricing-api/> ;
  <https://runelab.ai/en/blog/post/what-is-gpt-6-2-astra-and-sol>
- Qwen4-Max — <https://technode.com/2026/11/16/alibaba-launches-qwen4-max-with-lower-api-prices-and-a-million-token-context-window/> ;
  <https://www.marktechpost.com/2026/11/16/alibaba-qwen4-max-release/> ;
  <https://www.datastudios.org/post/alibaba-qwen4-max-launch-api-pricing-1-50-input-4-50-output> ;
  <https://openrouter.ai/qwen/qwen4-max>
- Qwen 3.7 Plus price — <https://openrouter.ai/qwen/qwen3.7-plus/pricing> ;
  <https://www.morphllm.com/qwen-3-7> ; <https://themagicofai.com/pricing/models/alibaba-qwen3-7-plus/>
- Muse Ember — <https://openrouter.ai/meta/muse-ember> ;
  <https://models.litellm.ai/models/muse-ember-1.0> ;
  <https://artificialanalysis.ai/models/muse-ember> ; <https://felloai.com/muse-ember/>
- Gemini 4 Carbon limits — <https://artificialanalysis.ai/models/gemini-4-carbon> ;
  <https://apidog.com/blog/gemini-4-carbon-api/> ; <https://dev.to/om_shree_0709/reverse-engineering-gemini-4-carbon-502m>
- OpenAI deprecations — <https://dev.to/aideprecations/what-to-do-before-openai-gpt-5-and-o3-shut-down-on-december-11-2026-fap> ;
  <https://brco.dev/insights/updates/openai-api-deprecations-2026/> ;
  <https://www.layer3labs.io/guides/openai-deprecated-models>
- Mistral Large 4 — <https://pricepertoken.com/pricing-page/model/mistral-ai-mistral-large-4> ;
  <https://kingy.ai/blog/mistral-large-4-specs-benchmarks-pricing/> ;
  <https://benchlm.ai/models/mistral-large-4>
- Moonshot / Kimi — <https://benchlm.ai/moonshot/api-pricing> ;
  <https://www.cloudzero.com/blog/kimi-api-pricing/> ; <https://www.kimi.ai/resources/kimi-k3-1-pro-pricing>
- Chinese-lab comparisons — <https://mofcloud.com/blog/2026-11-19-chinese-llm-api-pricing> ;
  <https://modelpricewatch.com/reports/state-of-llm-pricing-2026-11/> ;
  <https://capitalandcompute.net/blog/new-ai-models-november-2026/>
- Cohere Rerank 5 — <https://www.unite.ai/cohere-brings-embed-5-and-rerank-5-to-openrouters-unified-api/> ;
  <https://www.marktechpost.com/2026/10/22/cohere-rerank-5-context-focus/>
- Inference providers (Groq / Cerebras / Fireworks) — <https://www.deai.org/news/cerebras-inference-pricing> ;
  <https://infrabase.ai/blog/ai-inference-api-providers-compared>
- Release trackers (candidate generation only, never a price source) — <https://llmgateway.io/timeline> ;
  <https://www.promptzone.com/ai-model-releases> ; <https://beevr.ai/blog/ai-model-releases-november-2026>

**Repo sources:**

- `metadata/CLAUDE.md` §1 — the `primaryKey`-on-every-record rule the fired prompt contradicts
- `reports/ai-model-research/ROUTINE_PROMPT.md` — §0.6 and §0.7, absent from the fired prompt
- `packages/AI/Core/src/__tests__/modelConfiguration.test.ts` — the §0.6 gate and `DRIVERS_WITHOUT_TOOLS`
- `packages/AI/BaseAIEngine/src/BaseAIEngine.ts:874-883` — the cost-row selection predicate
- `.claude/rules/changesets.md` — the bump-level and package-listing rule for a `metadata/`-only branch
- Commits `8e18be74f`, `c1e44e45d`, `f06404769` on `next` — the push writeback and the Gemini 4
  Neon / Hydrogen additions this run verified against
