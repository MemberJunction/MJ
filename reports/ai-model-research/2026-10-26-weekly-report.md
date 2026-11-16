# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-10-26
**Research Period**: 2026-10-19 → 2026-10-26
**Base Branch**: `next`
**Research Branch**: `claude/magical-turing-4tmy9f`

> **Branch name deviation.** The routine template asks for `claude/ai-model-research-2026-10-26`. This
> session was assigned `claude/magical-turing-4tmy9f` by its environment and is not permitted to push
> anywhere else. Same base (`next`), same contents, different name. **This has now recurred every week
> since 2026-10-02** — five consecutive runs. The routine prompt should either stop specifying a branch
> name or the scheduler should stop overriding it; a human needs to pick one. (Carried, unchanged.)

---

## Executive Summary

A quiet week with a clean result. **Three models released in the window are added** — Kimi K3.1 Pro and
Kimi K3.1 Pro Highspeed (Moonshot AI, 2026-10-23) and MiniMax-M3.1-Flash (MiniMax, 2026-10-19). There
are **no pricing changes, no deprecations and no new vendors** to apply: every candidate that turned up
either already sits in the catalogue at the right price, or could not be verified to the standard
§0.3/guideline-1 demands.

The more useful result is the **non-findings**, and this week there are an unusual number of them. Five
candidates that looked like gaps are already in MJ, added by earlier runs or by separate commits:
**Claude Opus 4.8**, **Grok Build 0.1**, **Cohere Command A+**, **Qwen 3.8 Max** ($2/$6) and
**Qwen 3.7 Max** ($2.50/$7.50). A **first-party sweep of all 14 Anthropic cost rows** against
`platform.claude.com` — base rates, cache reads and cache writes — found **zero drift**, including the
cache-read split (Fable 5.1 at 0.025x, Opus 5.5 and Sonnet 5.5 at 0.05x, everything else at 0.1x) that
took three runs to get right. Documented here so a future run need not redo it.

Two carried items are **closed** this week, both by evidence rather than by a decision:

- **Carried item 32 (8 duplicate `primaryKey` UUIDs)** — resolved as a false alarm. Every one of the 8
  pairs is a model ID colliding with a *vendor* ID: different entities, different tables, no collision.
  Drop it from the carry list.
- **Carried item 25's "non-token billing" sub-item** gains a sharp new instance but also a clear shape
  (see item 18 below), moving it from "someday" to a scoped decision.

One **new, code-affecting** finding that is not a metadata change and needs a human: Anthropic's API
version `2026-10-21` **removes `temperature`, `top_p` and `top_k` entirely** — a 400 error, not a
warning. See item 12.

### Research-channel constraint — read this before judging the coverage

Egress matched last week's shape almost exactly. **`platform.claude.com` was again the only first-party
rate card reachable**, and it was reachable in full.

| Channel | Status this week |
|---|---|
| `platform.claude.com` (pricing, models overview, deprecations) | ✅ Full first-party read, all three pages |
| `WebSearch` (standard + extended) | ✅ Worked throughout; the backbone of this run |
| `cloud.google.com` | ⚠️ Resolves but JS-rendered; returned title only, no pricing tables |
| `docs.x.ai`, `platform.moonshot.ai`, `minimax.io`, `openrouter.ai` | ❌ DNS blocked |
| `developers.openai.com`, `benchlm.ai`, `pricepertoken.com`, `modeldeprecations.dev` | ❌ DNS blocked |
| `en.wikipedia.org`, `llmgateway.io` | ❌ DNS blocked |

Every edit below states the standard it met, and **each new cost row's own `Comments` records that
standard, names the unreachable first-party page, and dates the observation** — so a later run with
wider egress knows exactly what to re-verify rather than re-deriving it from scratch.

This is the **fourth consecutive run** with materially different channels. The standing recommendation
to add an egress-reality note to Step 2 of the routine prompt is repeated below.

---

## Current Inventory Snapshot

**225 models** (190 `IsActive`), **659 vendor rows**, **323 cost rows** after this run's edits
(222 / 653 / 320 before).

| Vendor | Inference routes | of which Active |
|---|---|---|
| OpenRouter | 125 | 125 |
| OpenAI | 44 | 36 |
| Google | 29 | 21 |
| Azure | 28 | 27 |
| Amazon Bedrock | 24 | 24 |
| Vertex AI | 24 | 18 |
| Anthropic | 23 | 13 |
| Groq | 17 | 9 |
| x.ai | 15 | 15 |
| Fireworks.ai | 15 | 14 |
| Mistral AI | 13 | 10 |
| Cerebras | 11 | 1 |
| Alibaba Cloud | 10 | 10 |
| LM Studio / Z.AI | 7 / 7 | 7 / 7 |
| **Moonshot AI** | **6** | **5** |
| LocalEmbeddings | 6 | 6 |
| **MiniMax** | **5** | **5** |
| Eleven Labs | 4 | 4 |
| Inception Labs / DeepSeek / Cohere | 3 / 3 / 3 | 3 / 3 / 3 |
| Black Forest Labs | 2 | 2 |
| 7 single-route vendors | 7 | 7 |

Moonshot AI (4 → 6) and MiniMax (4 → 5) are this week's growth. The `Anthropic 23 → 13 Active` and
`Cerebras 11 → 1 Active` ratios remain expected historical deprecation, not drift.

---

## New Models Available

### 1. Kimi K3.1 Pro — **ADDED**

| | |
|---|---|
| Vendor / route | Moonshot AI, `kimi-k3.1-pro` (DriverClass `MoonshotLLM`) |
| Released | 2026-10-23 |
| Price | **$2.00 in / $10.00 out** per 1M tokens, **$0.20** cached input |
| Context | 1,048,576 tokens, flat — no long-prompt surcharge |
| Ranks assigned | PowerRank 23, SpeedRank 6, CostRank 4 |
| Verification standard | **Corroborated**, not first-party (see below) |

Moonshot's successor to Kimi K3, and the headline is the price: **a one-third cut** against K3's
$3/$15 at the same $0.20 cached-input rate, with the same 1M context and the same flat pricing across
the whole window. PowerRank 23 places it one above Kimi K3 (22) and level with Claude Sonnet 5.5;
`PriorVersionID` chains it to Kimi K3, continuing the existing `K2.6 → K3` chain. CostRank drops from
K3's 5 to 4 to reflect the cut.

**Route scope — deliberately narrow.** Only the Moonshot first-party route is added. No OpenRouter or
Fireworks.ai slug for `kimi-k3.1-pro` surfaced in any reachable source three days after launch, and
inventing one (`moonshotai/kimi-k3.1-pro` would be the obvious guess) is exactly the kind of edit
guideline 10 exists to prevent. Both platforms carry Kimi K3, so the routes are likely to appear; the
sweep is flagged as item 16.

**`MaxOutputTokens` is set to 262,144, mirroring Kimi K3's existing row, and this is the weakest figure
in the record.** Sources disagree three ways: a documented `max_completion_tokens` default of 131,072
configurable upward, a listing of 512K, and a listing of 1,048,576. `platform.moonshot.ai` is DNS
blocked here. Mirroring the neighbour is the defensible choice — it is consistent within the Kimi line
and errs toward the middle of the range — but the uncertainty is written into the model's own
`Description` so the next reader sees it.

### 2. Kimi K3.1 Pro Highspeed — **ADDED**

| | |
|---|---|
| Vendor / route | Moonshot AI, `kimi-k3.1-pro-highspeed` |
| Released | 2026-10-23, alongside the standard tier |
| Price | **$4.00 in / $20.00 out** (2x standard), **$0.20** cached input (unchanged) |
| Ranks assigned | PowerRank 23, SpeedRank 8, CostRank 6 |

Identical weights and capabilities; Moonshot claims the same intelligence at roughly 2–3x generated-token
speed. **Modelled as its own record rather than a second vendor row on Kimi K3.1 Pro**, because it is
invoked through a distinct API id, not a per-request flag — which is precisely the reasoning MJ already
recorded for **Kimi K3 Fast**, and the ranks (22/8/6 there, 23/8/6 here) follow that record's
calibration. No `PriorVersionID`, matching Kimi K3 Fast.

### 3. MiniMax-M3.1-Flash — **ADDED**

| | |
|---|---|
| Vendor / route | MiniMax, `MiniMax-M3.1-Flash` (DriverClass `MiniMaxLLM`) |
| Released | 2026-10-19 GA (preview `MiniMax-M3.1-Flash-Preview` from 2026-09-27) |
| Price | **$0.15 in / $0.60 out**, **$0.015** cached input |
| Context | 1,000,000 tokens, flat — **no** long-context step-up |
| Ranks assigned | PowerRank 19, SpeedRank 10, CostRank 2 |

The cheapest frontier-adjacent route MJ carries from MiniMax, and the structurally interesting part is
the **absence** of a step-up: MiniMax-M3 doubles its rate above 512K input tokens, and M3.1-Flash does
not — it is flat across the full 1M window. That makes it one of the few long-context routes in the
catalogue whose single stored price pair is actually correct on all its traffic (cf. carried item 13).

MiniMax reports roughly one-third the cost and about 3x the speed of M3 on agentic workloads. Thinking
is always on with effort levels low through max, so `SupportsEffortLevel: true`, matching M3. PowerRank
19 sits below M3 and M2.7 (both 21) as a Flash-tier model; CostRank 2 places it below M2.5's 3.

Shape mirrors the existing `MiniMax-M3` record throughout, including `MaxInputTokens: 1000000` and
`MaxOutputTokens: 131072` — third-party listings give 128K on some and 512K on others, and
`platform.minimax.io` is blocked here, so the record uses the value the neighbouring M3 row already
carries and says so in its `Description`. First-party route only; the OpenRouter paid slug is
unverified (a `:free` variant was reported as ending 2026-10-22).

---

## Pricing Changes Detected

**None applied.** Two candidates were examined and both were rejected as unverifiable:

| Model | Vendor | MJ today | Reported | Why not applied |
|---|---|---|---|---|
| MiniMax-M3 | MiniMax | $0.60 / $2.40 | $0.30 / $1.20 | MJ's own row already documents $0.30/$1.20 as a **launch promo through ~2026-06-07**. Sources this week describe the same figure as "a 50% discount from list $0.60/$2.40" without saying whether it is still live, and OpenRouter is listed at a third figure ($0.23/$0.96). Three numbers, no first-party page. Flagged as item 14. |
| Cohere Command A+ | Cohere | $2.50 / $10 | $0.30 / $1.50 (OpenRouter) | Cohere's own docs reportedly publish **no per-token production rate** at all — production is priced through sales or Model Vault. OpenRouter's $0.30/$1.50 is a third-party listing, not Cohere's rate. Context window is also disputed four ways (128K / 192K / 200K / 436K). Flagged as item 15. |

### Anthropic first-party sweep — **verified, no change**

All 14 Anthropic `Active` cost rows were compared programmatically against the
`platform.claude.com/docs/en/about-claude/pricing` table fetched 2026-10-26, on four fields each (input,
output, cache read, cache write). **Every row matches.**

| Model | in / out | cache read | cache write (5m) |
|---|---|---|---|
| Claude Fable 5.1 | 10 / 50 | 0.25 | 12.50 |
| Claude Fable 5 | 10 / 50 | 1.00 | 12.50 |
| Claude Opus 5.5 | 4 / 20 | 0.20 | 5.00 |
| Claude Opus 5 | 5 / 25 | 0.50 | 6.25 |
| Claude Opus 4.8 | 5 / 25 | 0.50 | 6.25 |
| Claude Opus 4.7 | 5 / 25 | 0.50 | 6.25 |
| Claude Opus 4.6 | 5 / 25 | 0.50 | 6.25 |
| Claude 4.5 Opus | 5 / 25 | 0.50 | 6.25 |
| Claude Sonnet 5.5 | 2 / 10 | 0.10 | 2.50 |
| Claude Sonnet 5 | 2 / 10 | 0.20 | 2.50 |
| Claude Sonnet 4.6 | 3 / 15 | 0.30 | 3.75 |
| Claude 4.5 Sonnet | 3 / 15 | 0.30 | 3.75 |
| Claude Haiku 5.5 | 0.10 / 0.50 | 0.01 | 0.125 |
| Claude Haiku 4.5 | 1 / 5 | 0.10 | 1.25 |

The cache-read column is the one worth noting: it correctly reflects Anthropic's **three different
multipliers** (0.025x on Fable 5.1/Mythos 5.1, 0.05x on Opus 5.5/Sonnet 5.5, 0.1x everywhere else).
This closes the last residue of what was carried item 11 for three runs.

---

## Model Updates & New Versions

**No updates applied.** Checked and found already correct:

- **Claude Opus 4.8** — `claude-opus-4-8`, Active on Anthropic, Bedrock (`anthropic.claude-opus-4-8-v1`)
  and OpenRouter (`anthropic/claude-opus-4.8`) at $5/$25. Retirement commitment: not sooner than
  **2027-05-28** per the deprecations page. Present and correct; Claude Opus 5's `PriorVersionID`
  correctly chains to it.
- **Grok Build 0.1** — `grok-build-0.1` on x.ai and OpenRouter at $1/$2. Present.
- **Qwen 3.8 Max** ($2/$6) and **Qwen 3.7 Max** ($2.50/$7.50) — both present at the rates reported this
  week.
- **Qwen3.6 27B** (released 2026-10-21 per the aggregators) — already in MJ on Alibaba Cloud, Groq and
  OpenRouter.
- **Gemini 4 Argon** — $2/$10 with the 2026-12-01 step-up to $4 already modelled from the 2026-10-19
  run. Google's pricing page remains JS-rendered and unreadable here; the **post-December output rate
  ($20, per one third-party table) is still unconfirmed**. Carried as item 17.

---

## Deprecated / Sunset Models

**No §0.2 recipe applied this week.** Nothing crossed its sunset date in the window. Two dated items are
tracked and neither is due yet:

| Model | Route | Retirement | Status in MJ | Action |
|---|---|---|---|---|
| `claude-sonnet-4-5-20250929` | Anthropic | **2026-11-30** | Vendor row correctly `Deprecated`; cost row `Active` | Apply §0.2 on the run nearest 2026-11-30 (i.e. 2026-11-30 itself, or 2026-11-23 if that is the last run before it). Bedrock and OpenRouter routes stay — partner platforms set their own dates. |
| `claude-opus-4-5-20251101` | Anthropic | **not sooner than 2026-11-24** | `Active` | A *floor*, not a scheduled retirement — Anthropic has not deprecated it. Watch; do not pre-emptively expire. |

Also confirmed: the OpenAI 2026-10-23 wave, applied last week, is done and correct — `o1`, `o1-pro`,
`o3-mini`, `o4-mini` and `gpt-image-1` are all `Inactive` on their OpenAI routes with their cost rows
expired, while the Azure and OpenRouter routes stay live. The 2027-01-14 GPT-4o/GPT-4.1 wave remains
well inside notice (carried item 17 from last week, re-dated below as item 11).

---

## New Vendors Worth Considering

**None added.** Every model in this run comes from a vendor MJ already carries. Four vendors appeared in
research and none clears the bar:

- **Block** (voice model running locally on an M4 Max, 2026-10-24) — no API, no pricing.
- **Hugging Face Carbon-X** (14B DNA language model, 2026-10-25) — domain-specific; MJ already carries a
  Hugging Face vendor row, and a DNA model has no obvious MJ consumer.
- **Microsoft MAI-Voice-2.1** ($22 per 1M characters, 2026-10-01) — blocked on the per-character billing
  unit (item 18), not on the vendor.
- **Kling / LTX / Runway** video models — blocked on per-second billing (item 18).

---

## Recommended Actions

### Applied this run — 3 models, 12 records, 0 deletions

1. **[Applied]** **Kimi K3.1 Pro added** — 2 vendor rows + 1 cost row at $2/$10, cache read $0.20.
   `PriorVersionID` → Kimi K3.
2. **[Applied]** **Kimi K3.1 Pro Highspeed added** — 2 vendor rows + 1 cost row at $4/$20, cache read
   $0.20. Modelled on the existing Kimi K3 Fast convention.
3. **[Applied]** **MiniMax-M3.1-Flash added** — 2 vendor rows + 1 cost row at $0.15/$0.60, cache read
   $0.015.
4. **[Verified, no change]** **Anthropic 14-row first-party price sweep** (input, output, cache read,
   cache write) — zero drift. **Claude Opus 4.8, Grok Build 0.1, Cohere Command A+, Qwen 3.7 Max,
   Qwen 3.8 Max, Qwen3.6 27B** — all already present and correctly priced. Documented so a future run
   need not redo it.

### Resolved — remove from the carry list

5. **[Resolved]** **Carried item 32 — the 8 duplicate `primaryKey` UUIDs.** This is a **false alarm and
   should be struck**. A full re-scan across all three AI metadata files (1,262 keys) returns the same
   8 pairs, and every one of them is an `MJ: AI Models` ID equal to an `MJ: AI Vendors` ID:
   `DAB9433E-…` (Eleven Labs model / Eleven Labs vendor), `E1B9433E-…` (HeyGen / HeyGen),
   `D8A5CCEC-…` (GPT 3.5 / OpenAI), `DAA5CCEC-…` (claude-v1 / Anthropic), `DBA5CCEC-…`
   (mistral-embed / Mistral AI), `E3A5CCEC-…` (Llama 2 70B / Groq), `E4A5CCEC-…` (Gemini 1.5 Pro /
   Google), `27C0423E-…` (Betty Bot / Tasio Labs). **Different entities, different tables — no
   collision is possible.** They are seed artifacts from the original catalogue where a model and its
   vendor were created in the same pass. Nothing to fix. This item has consumed a verification slot in
   every run since 2026-08; it can now be closed permanently.
6. **[Resolved]** **Last week's item 19 (Muse Spark 1.1/1.2/1.3 sweep)** is partly done without action
   from this run: **Muse Spark 1.3** was added to MJ by a separate commit and is live on OpenRouter at
   $1.25/$4.25. 1.1 and 1.2 remain absent and are folded into item 16.

### Open — needs a human decision (not more research)

7. **[Flagged — carried since 2026-08-31, 9th week]** **MJ's convention for limited-availability
   models.** Blocks **Claude Mythos 5.1 / Mythos 5** (pricing re-verified first-party *again* this week:
   $10/$50, cache read $0.25 and $1 respectively, both `Active`, Mythos 5.1 retirement not sooner than
   2027-09-01) and Gemini 3.8 Flash Cyber. The data half has now been done **five times**. Last week's
   supporting evidence stands: Gemini 4 Argon went from vetted-access to GA in 13 days, which argues for
   carrying such models with an explicit status rather than omitting them. **This needs a decision, and
   re-researching it weekly is pure waste.**
8. **[Flagged — carried, the highest-value structural item, 6th week]** **Request-level and long-context
   price tiers.** MJ stores one price pair per route, so every tiered model is silently wrong on part of
   its traffic. Confirmed instances: **Claude Haiku 5.5** (5x above 100K — the steepest in the
   catalogue, first-party confirmed again this week, and MJ carries three rows that are wrong on exactly
   the traffic Haiku is cheapest for), **Grok 4.7** ($2/$0.50/$6 under 200K → $4/$1/$12 above),
   **MiniMax-M3** (doubles above 512K), Gemini 3.1 Pro, `gpt-6-sol` / `gpt-6.1-sol` whole-request
   rebilling above 272K, GPT-6 Luna, every Grok 4.x doubling at ≥200K, Mistral Large 4's batch tier and
   its regional endpoints at 1.1x, and Google's regional endpoints at 1.1x. Driver and schema work.
   *Note the counter-example this week:* **MiniMax-M3.1-Flash and Kimi K3.1 Pro are both explicitly
   flat**, and vendors are now marketing flatness as a feature — which makes the tiered ones more, not
   less, worth modelling correctly.
9. **[Flagged — carried, unchanged]** **The Anthropic tokenizer discontinuity.** Claude 4.7+ produce
   ~30% more tokens for the same text than Claude 4.6 and earlier; the pricing page restates this
   verbatim this week and adds a figure for it ("1M tokens is roughly 555k words on the current
   tokenizer; models before it fit about 750k words"). Two models at the same $/MTok do not cost the
   same per unit of work, and `MJ: AI Model Costs` cannot express this. **Any cost comparison spanning
   the 4.6/4.7 boundary is skewed by ~30%.** Needs a tokens-per-character field or an explicit
   documented caveat in the cost UI.
10. **[Flagged — NEW, and it is code, not metadata]** **Anthropic API version `2026-10-21` removes
    `temperature`, `top_p` and `top_k`.** Per the deprecations page's API-parameter table, these now
    **return a 400 error** on that API version; earlier versions already 400 on a non-default value for
    Claude 4.7+ and Claude Mythos Preview. The recommended replacement is to omit them and steer with
    prompting. **MJ's `AnthropicLLM` driver and any prompt metadata that sets a temperature are exposed
    the moment MJ moves to that API version.** This is outside this routine's metadata remit, so nothing
    was changed — but it is the highest-urgency item in this report for an engineer. Worth an issue.
11. **[Flagged — carried, deadline 2026-11-30]** **`claude-sonnet-4-5-20250929` retires 2026-11-30.** MJ's
    Anthropic row is correctly `Deprecated` today. The run nearest that date must apply §0.2: Anthropic
    route → `Inactive`, its cost row → `Expired` + `EndedAt: 2026-11-30T00:00:00.000Z`. Bedrock and
    OpenRouter routes stay.
12. **[Flagged — carried, deadline 2027-01-14]** **Base `gpt-4o` and the GPT-4.1 family leave the OpenAI
    API 2027-01-14** (replacement `gpt-6-luna`); Azure retires the `gpt-4o` `2024-05-13` snapshot
    2026-12-09. MJ carries live `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
    routes. Well inside notice; re-recorded so it is not rediscovered each week.
13. **[Flagged — carried, unchanged]** **`gpt-image-2.5-sunburst` / `-flare` are the named replacement
    for a route MJ deprecated on 2026-10-23**, and MJ carries neither. Blocked on the `Per Image` vs
    `Per 1M Tokens` modelling decision (item 18) plus OpenAI pricing egress, which was blocked again
    this week. Still the highest-value *model* gap left open.
14. **[Flagged — NEW]** **MiniMax-M3's price needs one human look.** MJ holds $0.60/$2.40 list and its
    own `Comments` describe $0.30/$1.20 as a promo that ended ~2026-06-07. Coverage this week still
    quotes $0.30/$1.20 as current, and OpenRouter is listed at $0.23/$0.96. Either the promo became the
    standard price (as happened with Claude Sonnet 5) or the sources are stale. One load of
    `platform.minimax.io/docs/pricing` settles it.
15. **[Flagged — NEW]** **Cohere Command A+ may not be priceable at all.** MJ carries $2.50/$10
    (`IsActive: false`). Cohere reportedly publishes **no per-token production rate** — production is
    sales-or-Model-Vault only — while OpenRouter lists $0.30/$1.50 and four sources give four different
    context windows (128K / 192K / 200K / 436K). If Cohere genuinely does not publish a rate, MJ's row
    is a fiction and the honest fix is to blank the price rather than carry a wrong one. Needs a human
    with a Cohere account.
16. **[Flagged — NEW, small, mostly blocked on egress]** **Route sweep for models MJ already carries.**
    `kimi-k3.1-pro` and `MiniMax-M3.1-Flash` are first-party-only in MJ today; both vendors' models are
    normally also on OpenRouter and Fireworks.ai within days. Folded in from last week: **Muse Spark 1.1
    / 1.2** and `meta/muse-wonder` remain absent, and **Muse Spark Open's `MaxOutputTokens`** is still
    unknown. One load of `openrouter.ai/api/v1/models` resolves all of it — and item 19 as well.
17. **[Flagged — carried]** **Gemini 4 Argon's post-2026-12-01 output rate is unconfirmed.** The input
    step-up to $4 is first-party ($2 → $4 from 2026-12-01, cached $0.10 → $0.20). The matching output
    rate of $20 comes from one third-party table only; Google's snippet showed no output column.
    `cloud.google.com` is reachable but JS-rendered, so this has now failed to resolve twice. Needs the
    page fetched once by a human.
18. **[Flagged — carried, now the blocker for six distinct models]** **Non-token billing units.** The
    backlog behind this one field: rerank per search, TTS per character (**Microsoft MAI-Voice-2.1 at
    $22/1M characters**), STT per hour, **video per second** (Kling 4.0, LTX-2.5, Veo 3.1 Lite,
    HeyGen Video, Runway's Grok Imagine Video 1.5 Lite — a whole market segment MJ cannot represent),
    per-image (item 13), Cloudflare neurons, and Grok Voice 3.0's $0.004 per text input. **This is no
    longer a tidy-up; it is the single decision gating the most additions.** The per-minute workaround
    MJ uses for Grok Voice (blended rate in `InputPricePerUnit`, `OutputPricePerUnit: 0`) shows the
    shape of a solution but does not scale to per-second or per-character.
19. **[Flagged — carried, unchanged]** **DeepSeek V4 Pro / V4 Flash**: five concurrent `Active` cost rows
    across two models with an undocumented peak/off-peak tier structure, diagnosed 2026-10-05.
    Compounded by the `-1017` snapshot-vs-floating-id question (item 22). Sources this week still give
    two incompatible readings of V4.1 Flash's peak/off-peak split.
20. **[Flagged — carried, worsening]** **CostRank / SpeedRank scale overflow.** 13+ active models exceed
    the documented 1–10 range. Folded in and unchanged: **Haiku 4.5's PowerRank of 4** (a stale outlier
    that makes the Haiku line unrankable — Haiku 5.5 sits at 20), **Mistral Large 3's PowerRank 9 below
    Mistral Medium 3.5's 13**, and **DeepSeek V4.1 Flash at PowerRank 32**, the highest in the
    catalogue, above every frontier model. This run's three additions were calibrated against their
    nearest neighbours rather than against the documented scale, because the documented scale no longer
    describes the data. **A recalibration pass is overdue.**
21. **[Flagged — carried, unchanged]** **116+ Active inference routes have no Active cost row**, almost
    all OpenRouter. The underlying question is still open: should OpenRouter rows track OpenRouter's
    moving lowest-provider price at all? Until it is answered, each run faces it again.
22. **[Flagged — carried, unchanged]** **Does MJ pin versions or float aliases?** One decision resolves
    three symptoms: Mistral's `-latest` duplication (`Mistral Large` vs `Mistral Large 3` vs
    `Mistral Large 4`, `Mistral Medium` vs `Mistral Medium 3.5`), DeepSeek's `-1017` snapshot, and
    xAI's `grok-voice-latest` now resolving to Grok Voice 3.0.
23. **[Flagged — carried, unchanged]** **Create a `Decision` model type**, then add Cloudflare Clef /
    Clef-flash, TypeSafe `jev-1.13`, and **Perplexity's open decision model** (reported at $0.04/1M
    input, the cheapest launch of the month). MJ already carries Cloudflare and Perplexity vendor rows,
    so the model type is the only blocker.
24. **[Flagged — carried, unchanged]** **Three cost rows have no `StartedAt`** (Whisper Large v3 / Groq,
    Whisper Large v3 Turbo / Groq, Whisper 1 / OpenAI), all three also storing per-hour or per-minute
    rates in a per-1M-token field.
25. **[Flagged — carried, unchanged]** **Claude 3.5 Sonnet's Anthropic cost row cannot be expired**
    because its seed `StartedAt` (2026-01-08) postdates the model's 2025-10-28 retirement;
    `EndedAt > StartedAt` is unsatisfiable. Needs a human to set a real start date.
26. **[Flagged — carried, unchanged]** **Model-level `IsActive: false` while routes are still live.**
    `Claude Opus 4.1` is `IsActive: false` with `Active` Bedrock and OpenRouter routes — the inverse of
    the §0.2 rule, and Anthropic's own page confirms it is "retired, except on Bedrock and Google Cloud",
    so the routes are right and the flag is wrong. A catalogue-wide consistency scan would be cheap.
27. **[Flagged — carried, unchanged]** Vertex `gemini-2.0-flash-001` / `-lite-001` `Active` on routes
    discontinued 2026-06-01; `grok-code-fast-1` alias billing; `Mixtral 8x7B`'s `open-mistral-8x7b` id
    (Mistral's is `open-mixtral-8x7b`) and its `Active` cost row on a model retired 2025-03-30;
    `mistral-embed` with `APIName: undefined`; three OpenAI embedding routes with `APIName: undefined`;
    Codestral 2508's context figures; BFL `flux-1.1-pro` → `flux-pro-1.1` and FLUX.2 Pro's
    per-megapixel unit; `gpt-6.1-sol`'s MaxInputTokens 922,000 vs 1,050,000 on its siblings; ~30 Bedrock
    models MJ carries no route for.

### Notes on the routine prompt itself (§0 asks for this)

**The repo mirror (`reports/ai-model-research/ROUTINE_PROMPT.md`) matches the stored prompt** section
for section (§0.1–§0.6, Steps 0–4, Deliverables 1–4, Guidelines 1–11). No stale divergence this week.

Three carried defects in the prompt of record, all still **unfixed**, all re-confirmed this week:

1. **Deliverable 2 contradicts `metadata/CLAUDE.md` on `primaryKey`.** The prompt says "Do NOT include
   `primaryKey`"; `metadata/CLAUDE.md` rule 1 says **every** record MUST carry one, from `uuidgen`, and
   §0.6 says `metadata/CLAUDE.md` wins. Following the prompt literally reddens the CodeGen drift gate,
   as it did on 2026-10-05 and 2026-10-12. **This run supplied 12 kernel-generated UUIDs** (from
   `/proc/sys/kernel/random/uuid` — `uuidgen` is not installed in this image) on every new record
   including the three top-level models. **Deliverable 2 should be corrected to *require* a
   `primaryKey` while keeping the "never `sync`" half.** This is the third consecutive run to say so.
2. **§0.3 still does not catch the missing-`primaryKey` failure**, which has reddened two separate runs.
   The reusable check has now been proposed twice and is still not in the prompt. **Strong
   recommendation: paste it into §0.3 next to the Status check** — it needs no database, runs in
   milliseconds, and reproduces the gate exactly. This run's version also checks UUID uniqueness across
   all three files; its output is in Verification below.
3. **`Priority` is defined backwards at line 210.** The prompt says "lower = higher priority";
   `BaseModelRunner.ts:1347`/`:1523` and `ExecutionPlanner.ts:428`/`:618` all sort
   `b.Priority - a.Priority` — descending, so **higher is tried first** — while `RerankerService.ts:341`
   reads the same field ascending. Present in both copies of the prompt, so a real error, not mirror
   drift. (This run used `Priority: 0` for Model Developer and `1` for Inference Provider, copying the
   dominant existing convention rather than the prompt's prose.)

**Two additions to the recommendation list:**

4. **Step 2's source list needs an egress-reality note.** Four consecutive runs have now had materially
   different channels, and this is the second running where `platform.claude.com` plus `WebSearch` was
   the entire toolkit. Step 2 reads as though vendor pricing pages are reachable. It should instead
   instruct the run to **probe its channels first, state the map in the report, and label every edit
   with the standard it met** — which is what this report does. Without that, a reader cannot tell a
   first-party verification from a corroborated inference, and guideline 1 becomes unenforceable.
5. **NEW — the prompt has no slot for a code finding.** Item 10 (Anthropic removing `temperature` /
   `top_p` / `top_k` in API version `2026-10-21`) is the most urgent thing this run found, and it is not
   a metadata change, so Step 3's categories A–E have nowhere to put it and Deliverable 1's headings do
   not mention it. Vendors increasingly ship **API contract** changes alongside model changes. Step 2
   should add "breaking API/parameter changes" to what it asks the run to research, and Step 3 should
   gain a category F for findings that need an engineering issue rather than a JSON edit.

---

## Verification

Both mandatory pre-flight gates pass on this branch:

```
§0.3 Status / EndedAt check ............................. OK
primaryKey presence (all 3 AI metadata files) ........... 0 missing of 1,262 keys
```

Additional checks run before committing:

| Check | Result |
|---|---|
| JSON parses (all 3 metadata files) | ✅ |
| Byte-stable round-trip (`indent=2`, no trailing newline) | ✅ diff is **260 insertions / 0 deletions** — no reformatting noise |
| Every `@lookup:` vendor + model target resolves | ✅ 1,044 refs, 0 unresolvable |
| New `@lookup:` targets introduced | ✅ only `MJ: AI Models.Name=Kimi K3`, which exists |
| This run's 12 new UUIDs unique across all 3 files | ✅ 0 collisions (1,262 keys scanned) |
| Pre-existing duplicate UUIDs | 8, all cross-entity model↔vendor pairs — **confirmed harmless**, see item 5 |
| No `sync` block on any new record | ✅ all 12 |
| `Expired` rows have `EndedAt > StartedAt` | ✅ (none added this run; all existing pass) |
| Cost `Status` within `chk_AIModelCost_Status` | ✅ no `Inactive` on any cost row |
| Vendor `Status` within `CK_AIModelVendor_Status` | ✅ |
| Every new LLM states `ModelConfiguration.LLM.SupportsNativeToolCalling` | ✅ 3 of 3 (per #5610's guard test); `MoonshotLLM` vendor rows correctly override to `false` |

`mj sync validate` needs a database and could not be run here. `npm run check:guards` could not run
either — `vitest` is not installed in this container (`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`), and
`pnpm install` for a metadata-only change is not worth the time. Neither matters for this diff: both
gates scan TypeScript, and this PR changes only JSON metadata plus two Markdown files. **The Integration
Tier on the PR is the real backstop (§0.4) and will be watched.**

---

## Research Sources

**First-party (read directly):**

- Anthropic pricing — https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic models overview — https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic model deprecations — https://platform.claude.com/docs/en/about-claude/model-deprecations

**Corroborated (multi-source; first-party page unreachable from this environment):**

- MiniMax M3.1 Flash announcement — https://www.minimax.io/blog/minimax-m31f
- MiniMax M3.1 Flash coverage — https://www.marktechpost.com/2026/10/19/minimax-m3-1-flash-release/ ;
  https://llm-stats.com/models/minimax-m3.1-flash ; https://www.eesel.ai/blog/minimax-m3-1-flash-review ;
  https://www.digitalapplied.com/blog/minimax-m3-1-flash-price-benchmarks-release
- Kimi K3.1 Pro — https://www.yottalabs.ai/post/kimi-k3-1-pro-specs-price-open-weights-benchmarks ;
  https://kingy.ai/blog/kimi-k3-1-pro-launch-features-benchmarks-access/ ;
  https://www.orcarouter.ai/blog/kimi-k3-1-pro-release ;
  https://tech-insider.org/kimi-k3-1-pro-moonshot-ai-1m-context-open-weight-2026/
- Release timelines — https://llmgateway.io/timeline ; https://llm-stats.com/ai-news ;
  https://buttondown.com/agent-k/archive/llm-daily-october-25-2026/ ;
  https://www.digitalapplied.com/blog/ai-model-releases-october-2026-tracker
- Google / Gemini 4 Argon pricing —
  https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing (title only, JS-rendered)
- xAI Grok 4.7 / Grok Voice 3.0 — https://docs.x.ai/developers/release-notes (via search excerpts only)
- Cohere Command A+ — https://openrouter.ai/cohere/command-a-plus ;
  https://github.com/modelschemas/modelschemas/issues/447
- Deprecation trackers — https://dev.to/toolweather/ai-models-retired-or-deprecated-this-month-october-2026-3m3g ;
  https://modeldeprecations.dev/ ; https://www.stackspend.app/resources/model-changes/2026-10
- Video / audio model pricing — https://www.heygen.com/blog/cheapest-video-models ;
  https://openrouter.ai/blog/insights/image-to-video-models-compared/ ; https://releasebot.io/updates/runwayai

**Blocked this week** (DNS or policy, listed so a future run knows what to retry):
`docs.x.ai`, `platform.moonshot.ai`, `minimax.io`, `openrouter.ai`, `developers.openai.com`,
`platform.openai.com`, `benchlm.ai`, `pricepertoken.com`, `modeldeprecations.dev`, `llmgateway.io`,
`en.wikipedia.org`.
