# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-10-12
**Research Period**: 2026-10-05 → 2026-10-12
**Base Branch**: `next`
**Research Branch**: `claude/magical-turing-9l4bs3`

> **Branch name deviation.** The routine template asks for `claude/ai-model-research-2026-10-12`. This
> session was assigned the branch `claude/magical-turing-9l4bs3` by its environment and is not
> permitted to push anywhere else. Same base (`next`), same contents, different name. This has now
> recurred every week since 2026-10-02; the routine prompt should either stop specifying a branch name
> or the scheduler should stop overriding it.

---

## Executive Summary

Two genuinely new models landed in the research window and both are now in the catalogue:
**Claude Haiku 5.5** (2026-10-07) and **Mistral Large 4** (2026-10-06). Everything else this week was
a verification result rather than a change — sweeps against the vendors' own rate cards found MJ's
**GPT-6, Gemini 3.x, Grok 4.x and GLM 5.x** families already matching current published prices, which
also **closes two carried items** that turned out to be false alarms.

This run applies **7 edits**: 2 new models (5 vendor rows, 3 cost rows) and 2 first-party price
corrections on Anthropic routes. The sharpest correction is **Claude Sonnet 5.5's cache-read price,
recorded at 2× the real rate** — Anthropic prices cache hits on Sonnet 5.5 at 0.05× base, not the
standard 0.1×, and MJ had applied the standard multiplier.

No vendor was deprecated and no cost row was expired. One new vendor row was *not* needed: both new
models are from vendors MJ already carries.

### Research-channel constraint — read this before judging the coverage

This session's egress policy is **more restrictive than last week's**. Last week's run could reach
`platform.claude.com`, the AWS Price List API and vendors' docs repositories on GitHub. This week:

| Channel | Status |
|---|---|
| `WebFetch` | **Anthropic-owned hosts only.** `platform.claude.com` resolves; `platform.openai.com`, `ai.google.dev`, `openrouter.ai`, `llmgateway.io`, `en.wikipedia.org` all fail DNS. |
| Raw `curl` / proxy | **403 at the gateway** for every vendor host tried (openrouter.ai, api.groq.com, docs.x.ai, ai.google.dev, api.deepseek.com, pricing.us-east-1.amazonaws.com). |
| `raw.githubusercontent.com` | 403. `api.github.com` responds, but this session's GitHub access is **scoped to `memberjunction/mj`**, so last week's "read the vendors' docs repos" route is closed by policy, not by network. |
| `WebSearch` | **Works**, and was the primary channel. |

So the AWS Price List API route that last week's report recommended adding to the prompt is **not
usable from a session with this scope** — worth knowing before that recommendation is acted on.

Where a fact could not be reached first-party, this run used `WebSearch` restricted to the vendor's
own domains (`allowed_domains`), which surfaces the vendor's own page content. That is close to
primary but not identical to reading the page, and **every edit below says which standard it met.**
Anthropic facts are genuine first-party page reads; Mistral facts are vendor-domain search results.

---

## Current Inventory Snapshot

217 model records (183 `IsActive`), 307 cost rows, 39 vendors. Inference-provider routes by vendor:

| Vendor | Routes | Active | Vendor | Routes | Active |
|---|---|---|---|---|---|
| OpenRouter | 121 | 121 | Cerebras | 11 | 1 |
| OpenAI | 47 | 44 | Alibaba Cloud | 10 | 10 |
| Azure | 28 | 27 | LM Studio / Z.AI / Cohere | 7 each | 7 each |
| Google | 25 | 16 | LocalEmbeddings | 6 | 6 |
| Anthropic | 24 | 13 | Eleven Labs / Moonshot / MiniMax | 4 each | 4/3/4 |
| Amazon Bedrock | 24 | 24 | DeepSeek | 3 | 3 |
| Vertex AI | 22 | 16 | Black Forest Labs / Inception | 2 each | 2 each |
| Groq | 17 | 9 | Tasio, HeyGen, AssemblyAI, Inworld, | | |
| Fireworks.ai | 15 | 14 | Hugging Face, DeepInfra, SiliconFlow, | 1 each | 1 each |
| x.ai | 14 | 14 | MemberJunction | | |
| Mistral AI | 14 | 11 | | | |

Last updated: this file. The two models added below bring the count from 215 to 217.

---

## New Models Available

### 1. Claude Haiku 5.5 — **ADDED** ✅

**Verification standard: first-party.** Read directly from `platform.claude.com`
(models overview, pricing, model-deprecations pages) plus Anthropic's launch page.

| Attribute | Value |
|---|---|
| API id | `claude-haiku-5-5` (a pinned snapshot, not an alias) |
| Released | 2026-10-07 |
| Context / max output | 1,000,000 / 128,000 tokens |
| Price (prompts ≤100K) | **$0.10 in / $0.50 out** per 1M; cache read $0.01; 5m cache write $0.125 |
| Price (prompts >100K) | **$0.50 in / $2.50 out** per 1M; cache read $0.05 |
| Retirement | Not sooner than 2027-10-07 |
| Platform ids | Bedrock `anthropic.claude-haiku-5-5`; Google Cloud, Foundry and Claude-Platform-on-AWS all `claude-haiku-5-5` |

Anthropic calls it "the cheapest, fastest, and most capable small model we've ever released" and
reports it costs **~75% less to run on average than Haiku 4.5** — Haiku 4.5 is $1/$5, so the base
tier is a 10× list-price cut. It is the **first Haiku-class model with an adjustable effort setting**
(`SupportsEffortLevel: true`). Manual extended thinking (`thinking.type=enabled` with
`budget_tokens`) is rejected, and `temperature`/`top_p`/`top_k` return a 400 error — both recorded in
the Description because they are migration hazards for code written against Haiku 4.5.

**Routes added**: Anthropic (Model Developer + Inference Provider) and Amazon Bedrock. **OpenRouter
was deliberately not added** — every other Claude model in MJ carries an `anthropic/claude-*`
OpenRouter route, and the obvious id would be `anthropic/claude-haiku-5.5`, but OpenRouter is
unreachable from this session and *guessing an API id is exactly the mistake that produced two
uncallable Cohere reranker routes* found on 2026-10-05. Flagged below instead.

**Ranks**: PowerRank 20, SpeedRank 12, CostRank 2. PowerRank 20 sets it level with GPT-6 Luna, its
closest competitor at an identical $0.10/$0.50 list price; Anthropic's own guidance that Sonnet 5.5
and Opus 5.5 remain better for complex agentic coding argues against going higher without
independent benchmarks. Note that **Haiku 4.5's PowerRank is 4**, which is a stale value from an
older calibration and is not a usable reference point — see carried item on rank recalibration.
SpeedRank 12 matches Haiku 4.5 deliberately: 12 is outside the documented 1–10 band, but setting 10
would have ranked the faster model slower than its own predecessor, so this inherits the known
overflow rather than introducing a new ordering error.

### 2. Mistral Large 4 — **ADDED** ✅

**Verification standard: vendor-domain search** (`docs.mistral.ai`, `mistral.ai`) — the model page,
changelog and API pricing page, consistent across all three. Not a direct page read.

| Attribute | Value |
|---|---|
| API id | `mistral-large-4` |
| Released | 2026-10-06 (Public Preview) |
| Architecture | Granular MoE, 1.05T total / 52B active params + 1.6B vision encoder; natively multimodal |
| Context | 1,048,576 tokens (max output not published) |
| Price (launch promo) | **$0.68 in / $2.09 out** per 1M; cached input $0.07 |
| Price (standard) | $1.36 in / $4.18 out per 1M; cached input $0.14 |
| Weights | Open-weight; Mistral says weights publish at end of October 2026 |

**Added despite being a preview** because it is a major vendor, generally available on the public API
and Mistral Studio, and open-weight — not an allowlisted or invitation-only release. Guideline 6's
exception applies.

**The cost row records the promotional price**, which Mistral's changelog describes as 50% off for
two weeks from release, i.e. expected to lapse **around 2026-10-20**. The row's `Comments` names the
standard rate and instructs the next run to expire it. This mirrors the shape already in the
catalogue for Gemini 3.8 Flash, whose introductory $0.75/$3.75 is recorded `Active` with the
2027-01-01 standard rate documented. **This is the single most time-sensitive follow-up in this
report** — if nobody acts by ~2026-10-20, MJ under-costs Mistral Large 4 by 2×.

`MaxOutputTokens` is **omitted** rather than guessed: Mistral publishes the 1M context window but no
output cap for this model. `SupportsEffortLevel` is `false`, mirroring Mistral Large 3 (unverified
for Large 4).

### 3. Gemini 3.8 Flash Cyber — **NOT added** (flagged)

Confirmed real: `blog.google` announced it alongside Gemini 3.8 Flash, and Google Cloud's model page
gives 1,048,576 context / 65,536 max output. **Excluded because it is GA behind an allowlist** —
access requires contacting a Google representative or applying to the Fairwind Program. That makes it
the same category as Claude Mythos 5.1, which has been flagged-not-added since 2026-08-31 pending a
decision on how MJ represents gated models. Pricing is also unsettled across sources: the Agent
Platform table shows Priority-tier $2.70/$13.50 global, a CodeMender table shows $1.50/$0.15/$7.50,
and whether the base model's introductory $0.75/$3.75 covers Cyber is contradicted between sources.

### 4. Cohere Embed 5 — **NOT added**, but its price is now verified

Carried from 2026-10-02 ("needs an official per-token price"). `cohere.com/blog/embed-5` gives
**Pro $0.12/1M and Fast $0.08/1M tokens**, image input $0.40/1M for both tiers, released 2026-09-30.
**The blocker has moved**: the price is settled, but the API model ids are not published in anything
this session could reach. `embed-v5.0-pro` / `embed-v5.0-fast` would follow the `embed-v4.0` pattern,
but that is a guess, and the 2026-10-05 run had to repair exactly this class of guess on two
rerank ids. One look at `docs.cohere.com/docs/models` closes it.

---

## Pricing Changes Detected

| Model | Vendor | Previous (In/Out) | Current (In/Out) | Change | Action |
|---|---|---|---|---|---|
| Claude Sonnet 5.5 | Anthropic | cache read **$0.20** | cache read **$0.10** | −50% | **Applied** (amended) |
| Claude Opus 5 | Anthropic | cache write `null` | cache write **$6.25** | filled | **Applied** (amended) |
| GPT-6 Sol | OpenAI | $2 / $10 | $2 / $10 | none | verified, no change |
| GPT-6 Luna | OpenAI | $0.10 / $0.50 | $0.10 / $0.50 | none | verified, no change |
| GPT-6.1 Sol | OpenAI | $2 / $10, cached $0.10 | same | none | verified, no change |
| Gemini 3.6 Flash | Google | $1.50 / $7.50 | $1.50 / $7.50 | none | **closes carried item** |
| Gemini 3.8 Flash | Google | $0.75 / $3.75 | $0.75 / $3.75 | none | verified, no change |
| Gemini 3.5 Flash / Flash-Lite | Google | $1.50/$9.00, $0.30/$2.50 | same | none | verified, no change |
| Gemini 3.1 Pro / Flash-Lite | Google | $2/$12, $0.25/$1.50 | same | none | verified, no change |
| Grok 4.7 / 4.6 / 4.5 / 4.3 | x.ai | $2/$6, $2/$6, $2/$6, $1.25/$2.50 | same | none | verified, no change |
| GLM 5.3 / 5.3-Flash / 5.3-FlashX | Z.AI | $1.4/$4.4, $0.15/$0.50, $0.37/$1.25 | same | none | verified, no change |

### Both corrections were deliberately scoped to the Anthropic route only

This matters, and a first pass at this report got it wrong before being corrected:

**Sonnet 5.5 cache read.** Anthropic's rate card, footnote 2: cache hits and refreshes on Claude
Opus 5.5 and Claude Sonnet 5.5 are priced at **0.05× the base input price**, where every other model
uses 0.1×. Base input is $2, so cache reads are **$0.10/MTok**. MJ had $0.20 on all three Sonnet 5.5
routes — the standard multiplier, applied to a model that is an exception. Opus 5.5's $0.20 on a $4
base is already correct.

Only the **Anthropic** row was changed. Bedrock and OpenRouter set their own rates, and MJ's $0.20 on
those rows was sourced from *their* price lists (the Bedrock row's comment cites the AWS price list
published 2026-09-30, naming cache read $0.20). Neither is reachable from this session, so changing
them would have replaced a sourced figure with an inference. **Whether Bedrock and OpenRouter also
charge 0.05× is now an open question** — flagged below. The original route-specific comments on both
rows were preserved intact.

**Opus 5 cache write.** Anthropic publishes $6.25/MTok for 5-minute cache writes on Opus 5; the field
was `null`. Filled on the Anthropic row, original comment preserved with the provenance appended. The
**Bedrock row was left `null`** for the same reason — the AWS rate card is unreachable.

Because base rates did not move in either case, both rows were **amended in place rather than
superseded**. Adding a new cost row would falsely assert a price change on a date when none occurred.
This follows the precedent set on 2026-10-05 for the same situation.

---

## Model Updates & New Versions

Nothing required an edit. Two items examined and left alone:

- **`gpt-6.1-sol` MaxInputTokens is 922,000 in MJ** while its siblings `gpt-6-sol`, `gpt-6-luna` and
  `gpt-6-astra` all carry 1,050,000. OpenAI's docs give **both** figures meaning different things:
  1,050,000 is the context window, 922,000 the max input when reserving the full 128,000 output
  (1,050,000 − 128,000 = 922,000). Both conventions are defensible, so this is an **internal
  inconsistency, not an error**, and picking one is a convention decision rather than a research
  finding. Flagged, not edited.
- **GLM-5.3-Flash cached-input price** is $0.016 in MJ against $0.03 on Z.AI's rate card. The search
  result flagged that page as ~117 days stale, so the discrepancy may be in either direction. Not
  enough to act on.

---

## Deprecated / Sunset Models

**No deprecation was applied this week**, and that is a finding rather than an absence of work — two
carried deadlines fell inside this window and neither could be confirmed.

### Anthropic — verified, nothing new

The full deprecation table was read first-party. The only deprecated-not-retired model is
`claude-sonnet-4-5-20250929` (deprecated 2026-09-30, retires **2026-11-30**), which the 2026-10-05
run already applied — MJ's Anthropic route is `Deprecated`, the Bedrock and OpenRouter routes stay
`Active`, and `IsActive` stays `true`. Correct per §0.2; no change needed. No new Anthropic
deprecation was announced in the window.

### The two deadlines that passed unverifiable

| Item | Date | Status |
|---|---|---|
| OpenRouter `qwen/qwen3.6-max-preview`, `qwen/qwen3-235b-a22b-thinking-2507` | **2026-10-09 — 3 days ago** | **Could not confirm.** Both still `Active` in MJ. |
| OpenRouter `google/gemini-2.5-flash`, `google/gemini-2.5-pro` | **2026-10-20 — 8 days out** | Could not confirm. Both still `Active` in MJ. |

`openrouter.ai` is 403 at the gateway and unresolvable from `WebFetch`, and a targeted search found
**no** OpenRouter deprecation notice for any of the four. Third-party coverage of OpenRouter churn in
this window concerned `:free` variants and the deprecation of the original `openrouter/auto` router,
not these ids.

**This is now the highest-risk open item in the catalogue** and it has been flagged for two
consecutive weeks. Applying a retirement on an unconfirmed date would be guessing at a sunset date,
which §0.2 makes a correctness issue (`EndedAt` is a historical assertion). Anyone with unrestricted
egress closes all four with one load of `openrouter.ai/api/v1/models`.

---

## New Vendors Worth Considering

**None added.** Both new models came from vendors MJ already carries, so no `@lookup:MJ: AI Vendors`
target needed creating. Candidates seen in aggregator coverage but not pursued — none verifiable
first-party from this session, all carried: Perplexity `pplx-decider-v1-27b` (Perplexity already has
a vendor row), Cloudflare Clef / Clef-flash (needs the `Decision` model type first), Reka,
Microsoft MAI-Voice-2.1.

---

## Recommended Actions

### Applied this run — 7 edits

1. **[Applied]** **Claude Haiku 5.5 added** — 3 vendor rows (Anthropic developer + inference, Amazon
   Bedrock), 2 cost rows. Every field first-party verified except the Bedrock *price*, see item 3.
2. **[Applied]** **Mistral Large 4 added** — 2 vendor rows, 1 cost row at the launch promotion.
3. **[Applied, with stated provenance]** **Haiku 5.5's Bedrock cost row** records Anthropic's list
   price mirrored onto the Bedrock route. Amazon sets its own rates and the AWS rate card is
   unreachable here. This is the seeding convention every other Claude/Bedrock row in the catalogue
   used, and all of them matched the AWS card when checked on 2026-10-05 — but it is a prior, not a
   verification, and the row's `Comments` says so and names the page to check.
4. **[Applied]** **Claude Sonnet 5.5 cache read $0.20 → $0.10** on the Anthropic route only.
5. **[Applied]** **Claude Opus 5 cache write `null` → $6.25** on the Anthropic route only.
6. **[Verified, no change]** **GPT-6 / Gemini 3.x / Grok 4.x / GLM 5.x price sweeps** — 20+ routes
   checked against vendor rate cards, all matching. Documented so a future run need not redo it.

### Resolved — remove from the carry list

7. **[Resolved]** **Carried item 13 (2026-10-05): "Gemini 3.6 Flash is costed at 2× the live rate."**
   **False alarm.** Google's own what's-new notes give $1.50 input / $7.50 output; MJ records exactly
   that on both the Google and Vertex rows. No edit needed. Drop it.
8. **[Resolved]** **Carried item 12 (2026-10-02) / the GPT-6 "50% price cut" of 2026-10-07.** Third-
   party coverage reported OpenAI halving GPT-6 API prices on 2026-10-07. The cut was **relative to
   GPT-5.6's promotional rates**, and MJ already carries the post-cut figures from the 2026-09-22
   launch. Nothing to apply.
9. **[Partially resolved]** **Cohere Embed 5 pricing** is now verified ($0.12 Pro / $0.08 Fast per
   1M). The open half is the API model id — see "New Models" item 4.

### Open — needs someone with unrestricted egress

10. **[Flagged — carried 2nd week, HIGHEST RISK, one deadline already passed]** **Four OpenRouter
    routes with announced retirements**, two of them **3 days overdue**. See the Deprecated section.
    One load of `openrouter.ai/api/v1/models` settles all four, plus the five already-dead MJ
    OpenRouter ids and the 10-of-15 non-serverless Fireworks routes from prior weeks.
11. **[Flagged — new, directly caused by this run's correction]** **Do Bedrock and OpenRouter also
    price Sonnet 5.5 cache reads at 0.05×?** MJ now carries $0.10 on the Anthropic route and $0.20 on
    the other two. That split is *correct if* those vendors apply the standard 0.1× multiplier and
    *wrong if* they mirror Anthropic's exception. The same question applies to **Opus 5.5**, the only
    other model with the 0.05× footnote. Two page loads: `aws.amazon.com/bedrock/pricing/` and
    `openrouter.ai`.
12. **[Flagged — new, deadline ~2026-10-20]** **Expire Mistral Large 4's promotional cost row** when
    the two-week launch discount lapses and add the standard $1.36/$4.18 row. The row's `Comments`
    carries the instruction and the numbers. Also still needed: Large 4's `MaxOutputTokens` and
    whether an OpenRouter route exists.
13. **[Flagged — new]** **Claude Haiku 5.5's OpenRouter route**, deliberately omitted. Confirm the id
    (likely `anthropic/claude-haiku-5.5`) and OpenRouter's price, then add it for parity with every
    other Claude model.
14. **[Flagged — new]** **Verify Haiku 5.5's Bedrock rate** against the AWS rate card and correct the
    row from item 3 if Amazon differs from Anthropic's list price.
15. **[Flagged — carried, now one decision from closing]** **Claude Mythos 5.1 / Mythos 5.** Pricing
    fully verified first-party again this week ($10/$50, cache read $0.25 / $1.00, 1M/128K; both
    `Active`, Mythos 5.1 retiring not sooner than 2027-09-01, and `claude-mythos-preview` is
    `Deprecated` with retirement TBA). The only open question remains **MJ's convention for
    invitation-only models** — now blocking a second model, Gemini 3.8 Flash Cyber. Open since
    2026-08-31. The data half has been done three times; this needs a human decision, not research.
16. **[Flagged — carried, the highest-value structural item, 4th week]** **Request-level and
    long-context price tiers.** This week added two more instances: **Claude Haiku 5.5** (5× above
    100K prompts — the steepest in the catalogue, and MJ now carries a row that is wrong on exactly
    the traffic Haiku is cheapest for), and **Gemini 3.1 Pro** ($2/$12 up to 200K, $4/$18 above).
    Also re-confirmed: `gpt-6-sol`/`gpt-6.1-sol` rebill a whole request above 272K; GPT-6 Luna's
    long-context tier is $0.20/$0.75; GPT-6.1 Sol Flex is $1/$5 and Ultrafast is 6× standard; every
    Grok 4.x doubles at ≥200K. **MJ stores one price pair per route, so all of these are silently
    wrong on part of their traffic today.** Driver and schema work, not metadata work.
17. **[Flagged — carried, unchanged]** **DeepSeek V4 Pro / V4 Flash**: five concurrent `Active` rows
    across two models, the peak/off-peak tier structure diagnosed on 2026-10-05, needing the vendor
    page this session cannot reach.
18. **[Flagged — carried, unchanged]** **CostRank/SpeedRank scale overflow**: 13 active models exceed
    the documented 1–10 range. **Haiku 5.5 was added at SpeedRank 12, making it 14** — a deliberate
    choice explained above (matching its predecessor beat inverting the speed order). Also worth
    folding into that pass: **Haiku 4.5's PowerRank of 4** is a stale outlier that makes the Haiku
    line unrankable against anything, and **Mistral Large 3's PowerRank of 9 sits below Mistral
    Medium 3.5's 13**, which is backwards.
19. **[Flagged — carried, unchanged]** **115 Active inference routes have no Active cost row**, almost
    all OpenRouter. Underlying question still open: should OpenRouter rows track OpenRouter's moving
    lowest-provider price at all?
20. **[Flagged — carried, unchanged]** **Non-token billing units** — rerank per search, TTS per
    character, STT per hour, video per second, Cloudflare neurons. A catalogue keyed on $/1M tokens
    needs an explicit unit field. Blocking the image/video/audio schema decision.
21. **[Flagged — carried, unchanged]** **Create a `Decision` model type**, then add Cloudflare
    Clef / Clef-flash and TypeSafe `jev-1.13`.
22. **[Flagged — carried, unchanged]** **Three cost rows have no `StartedAt`** (Whisper Large v3 /
    Groq, Whisper Large v3 Turbo / Groq, Whisper 1 / OpenAI), all three also storing per-hour or
    per-minute rates in a per-1M-token field.
23. **[Flagged — carried, unchanged]** **Claude 3.5 Sonnet's Anthropic cost row cannot be expired**
    because its seed `StartedAt` (2026-01-08) postdates the model's 2025-10-28 retirement. Needs a
    human to decide the real start date. Related and still true: `Claude 3.5 Sonnet` is `IsActive:
    true` with its only live route on OpenRouter, and Anthropic's table confirms
    `claude-3-5-sonnet-*` retired 2025-10-28.
24. **[Flagged — carried, unchanged]** **Mistral `-latest` alias duplication** (`Mistral Large` vs
    `Mistral Large 3`, `Mistral Medium` vs `Mistral Medium 3.5`). **Mistral Large 4's arrival makes
    this worse**: `mistral-large-latest` will eventually resolve to Large 4, at which point MJ has
    three records for two models. Decide whether MJ pins versions or floats aliases.
25. **[Flagged — carried, unchanged]** Vertex `gemini-2.0-flash-001` / `gemini-2.0-flash-lite-001`
    `Active` on routes discontinued 2026-06-01; `grok-code-fast-1` alias billing; `Mixtral 8x7B`'s
    `open-mistral-8x7b` id (Mistral's is `open-mixtral-8x7b`) and its `Active` cost row on a model
    retired 2025-03-30; `mistral-embed` with `APIName: undefined`; Codestral 2508's context figures;
    BFL `flux-1.1-pro` → `flux-pro-1.1` and FLUX.2 Pro's per-megapixel unit; ~30 Bedrock models MJ
    carries no route for; the OpenAI 2026-10-23 tranche membership (**11 days out**, two sources
    still contradict, and MJ still has a live `gpt-4o` route — though OpenAI's help page says base
    GPT-4o stays in the API, so the exposure is the alias-scope question, not the base id).
26. **[Flagged — new, internal]** **`gpt-6.1-sol` MaxInputTokens 922,000 vs 1,050,000 on its
    siblings.** A convention decision, not an error — see Model Updates.

### Notes on the routine prompt itself (§0 asks for this)

**The repo mirror matches the stored prompt** section for section (§0.1–§0.6, Steps 1–4,
Deliverables 1–4, Guidelines 1–11). No stale divergence.

Three carried defects in the prompt of record, all **unfixed**, all re-verified this week:

1. **Deliverable 2 contradicts `metadata/CLAUDE.md` on `primaryKey`.** The prompt says "Do NOT
   include `primaryKey`"; `metadata/CLAUDE.md` rule 1 says new records **SHOULD** include a
   `uuidgen` UUID, and §0.6 of the prompt says `metadata/CLAUDE.md` wins. Following the prompt reds
   the CodeGen drift gate, as it did on 2026-10-05. **This run supplied CLI-generated UUIDs**
   (from `/proc/sys/kernel/random/uuid`, the kernel generator `uuidgen` wraps — `uuidgen` is not
   installed in this image — rather than invented by hand, which rule 1 forbids). Deliverable 2
   should be corrected to require a `uuidgen` `primaryKey` while keeping the "never `sync`" half.
   `metadata/CLAUDE.md` is also internally inconsistent here (rule 1 vs. its seed-data sections), so
   the reconciliation needs to cover all three places.
2. **`Priority` is defined backwards at line 210.** The prompt says "lower = higher priority";
   `BaseModelRunner.ts:1347`/`:1523` and `ExecutionPlanner.ts:428`/`:618` all sort
   `b.Priority - a.Priority` — **descending, so higher is tried first** — while
   `RerankerService.ts:341` reads the same field ascending. The defect is in both copies of the
   prompt, so it is a real error, not mirror drift.
3. **Trailing newline.** Correcting last week's note: `metadata/ai-models/.ai-models.json` **does**
   end with exactly one `\n`, and a `json.dumps(…, indent=2, ensure_ascii=False) + "\n"` round-trip
   is byte-identical to the committed file. Verified before editing, which is why this run's diff is
   209 insertions / 4 deletions rather than a whole-file rewrite. Worth stating in the prompt as the
   safe edit recipe.

**New recommendation**: Step 2's source list should record that **egress varies between sessions**.
Last week's advice to prefer the AWS Price List API and vendors' GitHub docs repos did not work this
week — both are blocked, and the GitHub route is additionally closed by repo scoping. A run should
probe its channels first and say which standard each edit met, as this report does.

---

## Research Sources

**First-party page reads (`WebFetch`)**
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/about-claude/model-deprecations

**Vendor-domain search results**
- https://www.anthropic.com/claude-haiku-5-5 · https://platform.claude.com/docs/en/models/haiku-5-5/whats-new-haiku-5-5
- https://docs.mistral.ai/models/mistral-large-4 · https://docs.mistral.ai/resources/changelogs · https://mistral.ai/pricing/api/ · https://mistral.ai/news/mistral-large-4/
- https://developers.openai.com/api/docs/pricing · https://developers.openai.com/api/docs/models/gpt-6-sol · https://developers.openai.com/api/docs/models/gpt-6-luna · https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://ai.google.dev/gemini-api/docs/pricing · https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/ · https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash-cyber · https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.6
- https://docs.x.ai/developers/models · https://x.ai/news/grok-4-7
- https://docs.z.ai/guides/overview/pricing · https://docs.z.ai/guides/llm/glm-5.3 · https://docs.z.ai/guides/vlm/glm-5.3-flash
- https://cohere.com/blog/embed-5 · https://docs.cohere.com/v2/changelog
- https://help.openai.com/en/articles/20001051-retiring-gpt-4o-and-other-chatgpt-models

**Aggregators — used only to find leads, never as a basis for an edit**
- https://llmgateway.io/timeline · https://opper.ai/model-releases · https://www.digitalapplied.com/blog/ai-model-releases-october-2026-tracker · https://capitalandcompute.net/blog/new-ai-models-october-2026/ · https://releasebot.io/updates/mistral

**Prior reports carried forward**
- `reports/ai-model-research/2026-10-05-weekly-report.md` · `2026-10-02-weekly-report.md`
