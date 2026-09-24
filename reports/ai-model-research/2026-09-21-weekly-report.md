# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-09-21
**Research Period**: 2026-09-15 → 2026-09-21
**Base Branch**: `next`
**Research Branch**: `claude/magical-turing-b48g3r`

> **Branch note.** The routine asks for `claude/ai-model-research-YYYY-MM-DD`. This session's runtime
> pins its own designated branch and forbids pushing anywhere else, so the branch name breaks the
> usual convention — the same situation as 2026-09-07 and 2026-09-14. Nothing else about the PR
> changes.

---

## Executive Summary

A quiet week for launches and a useful one for corrections. **One genuinely new model shipped:
GLM-5.3-FlashX** (2026-09-18), Z.AI's 200 tokens/s serving variant of GLM-5.3-Flash — same weights,
2.5x the price. It is applied.

The two more valuable findings are not launches. First, **Anthropic deprecated the dedicated
`claude-opus-5-fast` API model id on 2026-09-01**, folding fast mode into a `speed: "fast"`
parameter on `claude-opus-5`. Our `Claude Opus 5 Fast` record is built entirely on that id. The
route still serves, so the Anthropic vendor row moves to `Deprecated` (not `Inactive`) and its cost
row stays `Active` — but MJ has no schema field for a per-request speed tier, so what this record
should become is an open modelling question, raised below.

Second, a near-miss worth recording: **DeepSeek announced the retirement of V4 Pro for 2026-09-14
and then reversed it within 45 hours.** A run that read only the announcement would have expired a
live model. V4 Pro is deliberately untouched.

One carried item closes: **Grok 4.6 in Microsoft Foundry** has confirmed pricing and is wired as an
Azure route at `Preview` status, resolving the half of item 9 that has been carried for four weeks.

**Grok 4.7 slipped a fifth time** — still no model card, rate card or API id.

Three edits applied to one file. Nothing required an expiry this week.

---

## Current Inventory Snapshot

- **200 models** in `.ai-models.json` (199 before this run), **172 active**, plus 4 Cohere rerankers
  in `.cohere-reranker-models.json` = **204 model records**
- **32 vendors** in `.ai-vendors.json` (unchanged — no new vendor cleared the bar this week)

| Vendor | Bindings | Latest In-Inventory Model | Newest Cost Record |
|---|---:|---|---|
| OpenRouter | **113** | **GLM-5.3-FlashX (Sep 18)** | 2026-09-11 |
| OpenAI | 90 | GPT-6 Astra (Sep 3) | 2026-08-21 |
| Google | 49 | Gemini 3.8 Live Extended Thinking | 2026-09-02 |
| Anthropic | 42 | Claude Fable 5.1 (Sep 1) | 2026-09-01 |
| Vertex AI | 41 | Gemini 3.8 Flash | 2026-09-02 |
| Alibaba Cloud | 29 | Qwen3.8-Flash (Aug 26) | 2026-08-26 |
| Mistral AI | 26 | Mistral Medium 3.5 | 2026 mid-year |
| **x.ai** | 25 | Grok 4.6 (Aug 12) | **2026-08-26 (Foundry)** |
| **Azure** | **25** | **Grok 4.6 (new route)** | **2026-08-26** |
| Amazon Bedrock | 18 | GPT-6 Astra | 2026-09-08 |
| Groq | 17 | — | — |
| Fireworks.ai | 15 | — | — |
| **Z.AI** | **16** | **GLM-5.3-FlashX (Sep 18)** | **2026-09-18** |
| DeepSeek | 6 | DeepSeek V4.1 Flash (Sep 10) | 2026-09-10 |
| Sakana AI | 2 | Fugu Max, Fugu Ultra v2 | 2026-09-11 |
| Meta | 1 | Muse Spark 1.3 (Sep 2) | 2026-09-02 |

---

## New Models Available

### 1. Z.AI — **GLM-5.3-FlashX** *(NEW — applied)*

Released **2026-09-18**. FlashX is a *serving* upgrade, not a new intelligence checkpoint: identical
capability base to GLM-5.3-Flash (320B total / 18B active MoE, hybrid sparse + linear attention,
native multimodal), served at up to **200 tokens/s** for about 2.5x the per-token price.

| | GLM-5.3-Flash (existing) | **GLM-5.3-FlashX (new)** |
|---|---|---|
| Z.AI model id | `glm-5.3-flash` | **`glm-5.3-flashx`** |
| OpenRouter slug | `z-ai/glm-5.3-flash` | **`z-ai/glm-5.3-flashx`** |
| Price per 1M | $0.15 / $0.50, cache read $0.016 | **$0.37 / $1.25, cache read $0.075** |
| Context / max output | 1,310,720 / 131,072 | **1,048,576 / 131,072** |
| Throughput | standard | **~200 tok/s** |
| Ranks | Power 17, Speed 10, Cost 2 | **Power 17, Speed 10, Cost 3** |

**Rank calibration.** PowerRank is held at **17, identical to GLM-5.3-Flash**, on purpose: every
source describes FlashX as the same model on faster infrastructure, and inventing a power delta
where the vendor documents none would be a fabrication. SpeedRank is already at the ceiling (10) for
Flash, so the 200 tok/s gain cannot be expressed there — it lives in the Description. Only CostRank
moves, 2 → 3, matching the 2.5x rate.

**Two deliberate omissions.**

- **No `PriorVersionID`.** FlashX does not supersede Flash; the two coexist, and Z.AI added Flash to
  its GLM Coding Plan subscription while leaving FlashX off it. A `PriorVersionID` would assert a
  succession that has not happened.
- **No OpenRouter cost row.** The OpenRouter route is wired as an Inference Provider, but the
  published OpenRouter rate could not be confirmed independently of Z.AI's own card during this run —
  searches returned GLM-5.3-*Flash* gateway figures ($0.075/$0.25) intermixed with FlashX's, and
  `openrouter.ai` is unreachable from this environment (see Verification). This follows the
  DeepSeek V4.1 Flash precedent from 2026-09-13: wire the route, withhold the price, confirm later.
  An invented price is worse than an absent one.

Sources: <https://openrouter.ai/z-ai/glm-5.3-flashx> · <https://docs.z.ai/guides/vlm/glm-5.3-flash> ·
<https://www.cometapi.com/what-is-glm-5-3-flashx/> ·
<https://www.orcarouter.ai/blog/glm-5-3-flashx-release> ·
<https://apimaster.ai/blog/glm-5-3-flashx-api> · <https://lmmarketcap.com/model/z-ai-glm-5-3-flashx> ·
<https://superpowerdaily.com/posts/z-ai-adds-glm-5-3-flash-to-coding-plan-but-leaves-flashx-off-it>

### 2. TypeSafe AI — **Jev 1.13** *(flagged, NOT applied)*

Released **2026-09-15** (one source says the 1.13 point release landed 2026-09-18). Jev is the first
of TypeSafe's "System One" models: it does **not** return prose. It returns a typed choice — a
structured decision for routing, classification and in-application branch points. Listed at
**$0.042/1M input and $0.00/1M output**, on OpenRouter as `typesafe/jev-1.13`.

**Not applied, for three reasons that compound.** (a) The model type is the blocker: MJ's
`AIModelTypeID` catalogue has no category for a structured-decision model, and filing it as `LLM`
would tell every downstream consumer it generates text, which it does not. (b) Sources disagree on
both the release date (Sep 15 vs Sep 18) and the context window (32,000 on OpenRouter vs 64,000 on
its largest deployment). (c) A $0.00 output price is not a rate this schema can distinguish from
"unknown", which is the same question raised by Cohere North Mini Code last week and still unanswered
(carried item 8). TypeSafe AI is also not a major vendor, so guideline 6 does not force the issue.
This is a deliberate human decision, not an oversight. See Recommended Action 5.

Sources: <https://openrouter.ai/typesafe/jev-1.13> · <https://openrouter.ai/provider/typesafe> ·
<https://llmgateway.io/models/jev-1.13.0> · <https://opper.ai/typesafe/jev-1-13-0>

---

## Pricing Changes Detected

| Model | Vendor | Previous (In/Out) | Current (In/Out) | Change | Applied? |
|---|---|---|---|---|---|
| GLM-5.3-FlashX | Z.AI | *(new model)* | $0.37 / $1.25, cache $0.075 | new record | **Yes** |
| Grok 4.6 | Azure (Foundry) | *(no route)* | $2.00 / $6.00, cache $0.50 | new route | **Yes** |

### Grok 4.6 in Microsoft Foundry — carried item 9, half of it now closed

Carried since 2026-08-31 as "an Azure vendor row could be added once Foundry pricing is confirmed".
It is confirmed. Grok 4.6 landed in Microsoft Foundry Models in **public preview on 2026-08-26**, and
the Global Standard deployment prices it at **$2.00 input / $6.00 output / $0.50 cached input** per
1M — at parity with x.ai direct's sub-200K tier.

Three details are recorded deliberately:

- **`MaxInputTokens: 200000`, not 500000.** Foundry caps the context window at 200K where xAI serves
  500K. A consequence worth noting: xAI's tiered long-context rate ($4/$12 above 200K prompt tokens)
  cannot arise on this route at all, so unlike the x.ai and Bedrock rows this one has no tier caveat.
- **Vendor row `Status: "Preview"`, not `Active`.** Microsoft lists the deployment as public preview.
  `Preview` is a valid `CK_AIModelVendor_Status` value but **has never been used in this file before**
  (zero prior occurrences), so it is called out here rather than buried: it is semantically exact, and
  consumers that filter on `Status = 'Active'` will correctly skip a preview route. If the project
  would rather reserve `Preview` or not use it at all, this is the row to change.
- **`MaxOutputTokens: 128000` is carried over from the x.ai route.** Microsoft has not published a
  separate completion cap. Noted in the cost row's `Comments` rather than guessed at silently.

Note that Azure's *general* Grok rate card still tops out at Grok 4.3 ($1.25/$2.50); the 4.6 pricing
is specific to the Foundry Models preview listing.

Sources: <https://juliangoldie.com/grok-4-6-microsoft-foundry/> ·
<https://tokencost.app/blog/grok-4-6-long-context-cloud-pricing> ·
<https://www.eesel.ai/blog/grok-4-6-pricing> · <https://docs.x.ai/developers/models>

### Checked and unchanged

**Anthropic** — verified directly against `platform.claude.com/docs/en/about-claude/pricing`, the
authoritative card. Fable 5.1 and Mythos 5.1 hold $10/$50 with the 0.025x cache read ($0.25); Opus 5,
4.8, 4.7, 4.6 and 4.5 all hold $5/$25; Haiku 4.5 holds $1/$5. One note that is *good* news and needs
no edit: the **Claude Sonnet 5 introductory $2/$10 is now the standard price** — the increase to
$3/$15 scheduled for 2026-09-01 **will not occur**. Our six Sonnet 5 cost rows already carry $2/$10,
so the figures are right; the row *count* is a separate problem (see carried item 13).

**Google** — Gemini 3.x Flash holds the introductory $0.75/$3.75 through 2026-12-31, rising to
$1.50/$7.50 on 2027-01-01. Gemini 3.1 Pro holds $2/$12. **Calendar item**: the 2027-01-01 step-up is
a genuine scheduled price change across several of our records and should be applied as an expiry
plus a new row at the changeover, not left to drift.

**DeepSeek** — V4.1 Flash's $0.30/$1.20/$0.006 figures reported this week are the **peak** tier,
exactly 2x the off-peak $0.15/$0.60/$0.003 our rows record. No conflict; last week's deliberate
choice to record the off-peak tier holds.

**Fireworks.ai** raised on-demand *dedicated GPU* rates on 2026-09-01 ($8/hr H100-H200, $13 B200,
$15 B300, $20 GB300). Per-token serverless rates are unchanged, and MJ prices per token, so there is
nothing to record. **Groq**, **Cerebras**, **Mistral** (the Samsung investment did not move the rate
card), **Alibaba/Qwen**, **Moonshot**, **MiniMax**, **Cohere**, **NVIDIA**, **Black Forest Labs**,
**Inception Labs**, **Thinking Machines Lab**, **Meta**, **Amazon Bedrock**, **Vertex AI**: no
changes found in the window.

---

## Model Updates & New Versions

### Claude Opus 5 Fast — the dedicated API id is deprecated *(APPLIED)*

This is the week's most consequential finding, and it was not announced as a model event.

Anthropic's fast-mode documentation now lists exactly two supported models — **`claude-opus-5`** and
**`claude-opus-4-8`** — invoked with `speed: "fast"` (or `service_tier: "fast"`) plus the
`fast-mode-2026-02-01` beta header. There is **no `claude-opus-5-fast` model id anywhere in that
documentation**. The dedicated fast ids, `claude-opus-5-fast` and `claude-opus-4-8-fast`, were
**deprecated on 2026-09-01** in favour of the parameter, on both the Anthropic API and OpenRouter.

Our `Claude Opus 5 Fast` record is built entirely on that id, on both its Anthropic and OpenRouter
routes. What saves it is the backward-compatibility clause: **requests to the deprecated ids keep
working and are served by the same fast-tier capacity.** The route is deprecated, not dead.

**Applied, narrowly.** The Anthropic Inference Provider row moves `Active` → **`Deprecated`**. That
is the §0.1 vendor-Status value for exactly this state, and the repo already uses it (Kimi K2 on
Groq, Gemini 1.5 on Vertex, Claude 4 Sonnet/Opus on Anthropic). The **cost row stays `Active` with
no `EndedAt`** — the route still bills at $10/$50 — and the Model Developer row stays `Active` per
§0.2. The model's `IsActive` stays `true`. The Description is rewritten to state the deprecation, the
replacement invocation, and the unchanged access limits.

**Deliberately not applied: the OpenRouter row.** OpenRouter's `anthropic/claude-opus-5-fast` listing
carries the same notice, so an argument exists for marking it too. §0.2's "leave other vendors' rows
alone" points the other way, and the practical risk of being wrong is asymmetric — a wrongly
deprecated route is invisible to consumers, a wrongly retained one merely reads stale. Left `Active`
and flagged.

**The real question this raises is a schema one, and it needs a human.** MJ models an inference route
as `(vendor, DriverClass, APIName)`. Fast mode is now a *request parameter on an existing model*, not
a model id. When the dedicated ids are eventually withdrawn, `Claude Opus 5 Fast` cannot be repaired
by editing `APIName` — pointing it at `claude-opus-5` would duplicate the `Claude Opus 5` record and
silently bill fast-mode work at standard rates in any consumer that reads the cost row. The options
are (a) a `ModelConfiguration` flag that makes `AnthropicLLM` send `speed: "fast"`, keeping the
separate record and its separate price, or (b) retiring the record and losing the ability to price
fast mode at all. (a) is clearly right but is a driver change, not a metadata change. See
Recommended Action 3.

Sources: <https://platform.claude.com/docs/en/build-with-claude/fast-mode> ·
<https://platform.claude.com/docs/en/about-claude/pricing> ·
<https://openrouter.ai/anthropic/claude-opus-5-fast> · <https://openrouter.ai/anthropic/claude-opus-4.8-fast>

### Anthropic model lifecycle — checked against the source, nothing due

The deprecations page gives tentative retirement dates for everything we carry, and **none falls
before 2026-11-24**: `claude-opus-4-5-20251101` not sooner than 2026-11-24,
`claude-sonnet-4-5-20250929` not sooner than 2026-09-29, `claude-haiku-4-5-20251001` not sooner than
2026-10-15. Two of those are inside six weeks and are **calendar items, not work for today** — a
"tentative retirement date" is not a retirement. `claude-opus-4-1-20250805` (retired 2026-08-05) and
`claude-opus-4-20250514` / `claude-sonnet-4-20250514` (retired 2026-06-15) are already reflected in
our metadata as `Inactive`/`Deprecated` on the Anthropic route with partner routes left alone, which
matches Anthropic's own "retired, except on Bedrock and Google Cloud" wording.

Source: <https://platform.claude.com/docs/en/about-claude/model-deprecations>

### x.ai — Grok 4.7 has now slipped five times

xAI's newest model remains **Grok 4.6** (2026-08-12). No model page, API identifier, price or
release-note entry for 4.7 exists. The recommendation from the last two reports stands and hardens:
**stop treating the announced date as information.** Nothing about 4.7 should appear in a future
report until a rate card or model id exists.

Sources: <https://cellcog.ai/blog/grok-4-7-release-date/> · <https://benchlm.ai/xai/api-pricing> ·
<https://docs.x.ai/developers/models>

---

## Deprecated / Sunset Models

**One vendor row was deprecated this week** (Claude Opus 5 Fast on Anthropic, above). **Nothing was
expired** — no cost row received an `EndedAt`.

### DeepSeek V4 Pro — announced, then reversed. Deliberately untouched.

Worth recording at length because it is the exact failure mode §0.2 exists to prevent, arriving from
the opposite direction.

On releasing V4.1 Flash, DeepSeek announced it would **discontinue V4 Pro at 12:00 Beijing time on
2026-09-14**, routing all Pro requests to V4.1 Flash and billing at Flash's price. Multiple trackers
reported the retirement as fact. **DeepSeek reversed the decision within roughly 45 hours** in
response to user demand: V4 Pro remains on the API past 2026-09-14 **with billing unchanged**.

A run that read the announcement and applied §0.2 would have set the V4 Pro vendor row `Inactive` and
expired its cost rows — making our metadata wrong about a live, unchanged, still-billing model, and
doing so in the direction that silently removes a route from every consumer. **No edit made.** The
lesson generalises: an announced sunset is not a sunset until the date passes *and* the route is
confirmed gone.

Sources: <https://thenextweb.com/news/deepseek-v4-1-flash-launch-v4-pro-retired-price-cut> ·
<https://medium.com/@mehmet.ozel2701/deepseek-planned-to-retire-v4-pro-for-v4-1-flash-they-backed-down-in-45-hours-ec28b949406c> ·
<https://api-docs.deepseek.com/updates/>

### OpenAI's 2026-10-23 shutdown — *still flagged, still not due*

Unchanged from last week and repeated only so it is not lost: `o1`, `o1-pro`, `o3-mini`, `o4-mini`
and — **only after confirming the exact id list against OpenAI's own deprecations page** —
possibly `GPT 4.1 Nano` and `GPT 4o`, all need the §0.2 treatment **on or after 2026-10-23**. They
serve today; expiring a live route five weeks early is the same error as the DeepSeek one above. The
scope ambiguity flagged on 2026-09-14 (whether the tranche removes all of `gpt-4o` or only the
original May 2024 snapshot) was **not resolved this week** — `developers.openai.com` is unreachable
from this environment, so the authoritative page could not be read. Whoever applies this in late
October must read it directly. Azure and OpenRouter set their own schedules and do not follow
automatically.

`o3`'s **API** shutdown remains 2026-12-11 (the 2026-08-26 date was ChatGPT only). Our `o3` rows are
correct today.

---

## New Vendors Worth Considering

**None added.** Two were assessed:

- **TypeSafe AI** — would be required before `Jev 1.13` could be added. Held pending the model-type
  decision above, since adding a vendor row for a model we are not adding serves no purpose.
- **NVIDIA Nemotron Coalition** (Black Forest Labs, Cursor, LangChain, Mistral AI, Perplexity,
  Reflection AI, Sarvam, Thinking Machines Lab) — the Mistral/NVIDIA base model that will underpin
  **Nemotron 4** still has no id, no card and no rate. NVIDIA is already a vendor. Watch for
  Nemotron 4; nothing to do.

---

## Recommended Actions

Items 1–5 are this week's; 6–15 are carried. The carry-forward list has now been long enough for
**four** consecutive weeks. Items 10, 11 and 13 are each blocking multiple downstream additions, and
they are blocked on decisions no research run can make. A triage session is past due.

1. **[Applied]** Add **GLM-5.3-FlashX** (Z.AI + OpenRouter routes, one Z.AI cost row at
   $0.37/$1.25/$0.075). No OpenRouter cost row until the gateway rate is confirmed — **follow-up for
   next week**.
2. **[Applied]** Mark the **`claude-opus-5-fast` Anthropic route `Deprecated`** and rewrite the model
   Description. Cost row stays `Active`; OpenRouter row left `Active` and flagged.
3. **[Flagged — needs a human, new and structural]** **How should MJ model a speed/service tier?**
   Fast mode is now a request parameter, not a model id. Recommended: a `ModelConfiguration.LLM`
   flag that makes `AnthropicLLM` send `speed: "fast"` + the beta header, preserving the separate
   record and its separate $10/$50 price. This is a driver change and out of scope for a metadata
   run. Has a deadline: whenever Anthropic withdraws the deprecated ids.
4. **[Applied]** Add the **Grok 4.6 Microsoft Foundry (Azure)** route at `Status: "Preview"` with a
   $2/$6 cost row from 2026-08-26 and a 200K input cap. Closes half of carried item 9. **Confirm the
   `Preview` status value is wanted** — first use in this file.
5. **[Flagged]** **TypeSafe AI / Jev 1.13** — decide whether MJ records structured-decision ("System
   One") models at all, and under which `AIModelTypeID`. Merges with item 8: both are really "what
   do we do with a model whose pricing or output shape our schema cannot express".
6. **[Calendar — 2026-10-26 or later]** OpenAI's 2026-10-23 tranche. Confirm the id list against
   OpenAI's own page first; the `gpt-4o` / `gpt-4.1-nano` scope question is **still open**.
7. **[Calendar — 2026-12-12 or later]** Apply §0.2 to `o3` on OpenAI direct.
8. **[Flagged — carried]** **Cohere North Mini Code** and the $0.00-on-a-free-endpoint question.
9. **[Flagged — fifth slip]** **Grok 4.7.** Treat the announced date as noise. The Foundry half of
   this item is now closed (action 4).
10. **[Flagged — carried, blocking four things]** **The image/video/audio cost-schema decision** —
    `GPT Image 2.5 Flare`/`Sunburst`, the **FLUX 3** family refresh (our two FLUX records still carry
    `StartedAt` 2025-10-01), **Gemini Omni 1.1 Flash** (two output rates against one input rate), and
    **Gemini 3.5 Transcribe**. **Now also blocking the four Cohere rerankers**, which carry *no cost
    rows at all* because Rerank is billed per search ($0.0025/search Pro, $0.002 Fast), not per token.
    Decide once, apply to all of them.
11. **[Flagged — carried]** **Claude Mythos 5.1** and OpenAI's **Daybreak Red / Daybreak Blue**:
    does MJ model gated-access models? Anthropic's pricing page lists Mythos 5.1 at $10/$50 with a
    "limited availability" link, so the *price* is public even though access is not. Open since
    2026-08-31.
12. **[Flagged — carried]** **`Claude 4 Opus` / `Claude 4 Sonnet` cost-row cleanup.** Fix the prices
    *first*, then expire — the other order preserves the bad data permanently.
13. **[Flagged — carried, systemic]** **Concurrent `Active` cost rows on the same model+vendor.**
    Re-confirmed this week and worse than recorded: **`Claude Sonnet 5` carries six `Active` rows** —
    three from 2026-06-30 and three from 2026-09-01, all at $2/$10 across Anthropic, Bedrock and
    OpenRouter. The 2026-09-01 set was presumably added in anticipation of the $3/$15 increase that
    Anthropic then cancelled, leaving exact duplicates. `GPT 5.6-terra`, `GPT 5.6-luna` (two each)
    and `DeepSeek V4 Pro` (three) are the same shape; `o1-mini` has an `Inactive` vendor row with an
    `Active`, un-ended cost row. Any consumer asking "what is the current price" gets an arbitrary
    pick. One deliberate pass, not piecemeal fixes.
14. **[Flagged — carried]** **`DeepSeek V4 Pro` cost reconciliation** ($0.66/$1.98 matches neither
    tier); **`GLM 5.3` OpenRouter max output** (our 128,000 vs the gateway's advertised 1,048,576 —
    we keep the developer's figure); **Muse Spark Contributor tier** and a first-party Meta route
    needing a `MetaLLM` driver class.
15. **[Flagged — new, low priority]** Two small data questions surfaced while verifying:
    **(a) Cohere reranker API ids.** We record `rerank-v4-pro` / `rerank-v4-fast`; several sources
    give `rerank-4-pro` / `rerank-4-fast`, while Vercel's AI Gateway and Cohere's own changelog use
    the `v4` spelling. Ambiguous, so unchanged — but one of the two will fail at call time.
    **(b) Claude Sonnet 5 cache rates.** Anthropic publishes $0.20 cache read and $2.50 5-minute
    cache write; all six of our Sonnet 5 cost rows leave both null. Worth filling in as part of the
    item-13 pass rather than as a separate edit.
16. **[Calendar — 2027-01-01]** Google's Gemini 3.x Flash introductory rate ($0.75/$3.75) ends and
    standard pricing ($1.50/$7.50) begins. A genuine scheduled change across several records: expire
    and add, don't let it drift.

---

## Instruction-file discrepancy — still live, for a human to reconcile

The scheduler's copy of this routine prompt still states, as a **CRITICAL formatting rule**: *"Do NOT
include `primaryKey` or `sync` objects."* The repo copy at
`reports/ai-model-research/ROUTINE_PROMPT.md` was **corrected on 2026-09-15** (commit `a73c891c`,
per cadam11's review of PR #4474) to require the opposite: a `uuidgen` `primaryKey` on every new
record, with `crypto.randomUUID()` where `uuidgen` is unavailable, and no hand-authored `sync`.

`metadata/CLAUDE.md` and §0.6 both side with the repo copy, and every existing record in
`.ai-models.json` carries a `primaryKey`. **This run follows the repo copy**: seven new records, each
with a `crypto.randomUUID()` `primaryKey`, no `sync` anywhere.

The scheduler's stored prompt is not a repo file and cannot be fixed from this branch. **Its owner
needs to update it**, or every future run will re-litigate this.

---

## Verification

`mj sync validate` needs a database and cannot run in this environment. The §0.3 pure-JSON pre-flight
was run against both model files after the edits and prints **`OK`**:

- every `MJ: AI Model Vendors` `Status` ∈ {Active, Inactive, Deprecated, Preview}
- every `MJ: AI Model Costs` `Status` ∈ {Active, Pending, Expired, Invalid}
- every `Expired` cost row carries an `EndedAt`, and every `EndedAt` > its `StartedAt`

Additionally verified:

- Every `@lookup:MJ: AI Vendors.Name=…` in both model files resolves to a row in `.ai-vendors.json`.
  No new vendor was introduced, so no new lookup target was needed.
- No `sync`, `__mj_CreatedAt` or `__mj_UpdatedAt` key was authored on any new record.
- All **seven** new `primaryKey` UUIDs occur exactly once across `metadata/`.
- The diff is **five hunks in one file** — three additions and two in-place field changes. No
  reformatting, no incidental churn; `.cohere-reranker-models.json` and `.ai-vendors.json` are
  untouched.

**A limitation on this week's research, stated plainly.** This environment's egress proxy blocks a
number of the domains this routine normally reads directly, including `openrouter.ai`, `docs.z.ai`,
`developers.openai.com`, `ai.google.dev`, `llm-stats.com` and several trackers. Web *search* works
and returns synthesised answers with sources; direct page fetches of those domains do not.
`platform.claude.com` **is** reachable, which is why the Anthropic findings are the best-sourced in
this report — they come from the vendor's own pricing, fast-mode and deprecations pages. Everything
applied this week was corroborated by at least two independent sources and is internally consistent
(FlashX's $0.37/$1.25 is exactly the documented 2.5x of Flash's verified $0.15/$0.50; Foundry's
$2/$6/$0.50 matches x.ai's verified sub-200K tier). The two places where sources could not be
reconciled — the FlashX OpenRouter rate and the OpenAI October id list — were **left unapplied** for
that reason, not overlooked.

---

## Research Sources

**Vendor-authoritative (fetched directly):**
<https://platform.claude.com/docs/en/about-claude/pricing> ·
<https://platform.claude.com/docs/en/build-with-claude/fast-mode> ·
<https://platform.claude.com/docs/en/about-claude/model-deprecations>

**Model and pricing research:**
<https://openrouter.ai/z-ai/glm-5.3-flashx> · <https://docs.z.ai/guides/vlm/glm-5.3-flash> ·
<https://www.cometapi.com/what-is-glm-5-3-flashx/> ·
<https://www.orcarouter.ai/blog/glm-5-3-flashx-release> · <https://apimaster.ai/blog/glm-5-3-flashx-api> ·
<https://lmmarketcap.com/model/z-ai-glm-5-3-flashx> ·
<https://superpowerdaily.com/posts/z-ai-adds-glm-5-3-flash-to-coding-plan-but-leaves-flashx-off-it> ·
<https://juliangoldie.com/grok-4-6-microsoft-foundry/> ·
<https://tokencost.app/blog/grok-4-6-long-context-cloud-pricing> ·
<https://www.eesel.ai/blog/grok-4-6-pricing> · <https://docs.x.ai/developers/models> ·
<https://cellcog.ai/blog/grok-4-7-release-date/> · <https://benchlm.ai/xai/api-pricing> ·
<https://openrouter.ai/anthropic/claude-opus-5-fast> ·
<https://openrouter.ai/anthropic/claude-opus-4.8-fast> ·
<https://thenextweb.com/news/deepseek-v4-1-flash-launch-v4-pro-retired-price-cut> ·
<https://api-docs.deepseek.com/updates/> ·
<https://medium.com/@mehmet.ozel2701/deepseek-planned-to-retire-v4-pro-for-v4-1-flash-they-backed-down-in-45-hours-ec28b949406c> ·
<https://openrouter.ai/typesafe/jev-1.13> · <https://llmgateway.io/models/jev-1.13.0> ·
<https://opper.ai/typesafe/jev-1-13-0> · <https://openrouter.ai/cohere/rerank-4-pro> ·
<https://openrouter.ai/cohere/rerank-4-fast> · <https://docs.cohere.com/changelog/rerank-v4.0> ·
<https://cohere.com/pricing> · <https://ai.google.dev/gemini-api/docs/pricing> ·
<https://benchlm.ai/google/api-pricing> · <https://www.eesel.ai/blog/groq-pricing> ·
<https://pricepertoken.com/pricing-page/provider/fireworks> ·
<https://nvidianews.nvidia.com/news/nvidia-launches-nemotron-coalition-of-leading-global-ai-labs-to-advance-open-frontier-models> ·
<https://llmgateway.io/timeline> · <https://aireleasetracker.com/latest>
