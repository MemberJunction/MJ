# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-10-19
**Research Period**: 2026-10-12 → 2026-10-19
**Base Branch**: `next`
**Research Branch**: `claude/magical-turing-mwc8rn`

> **Branch name deviation.** The routine template asks for `claude/ai-model-research-2026-10-19`. This
> session was assigned `claude/magical-turing-mwc8rn` by its environment and is not permitted to push
> anywhere else. Same base (`next`), same contents, different name. **This has now recurred every week
> since 2026-10-02** — four consecutive runs. The routine prompt should either stop specifying a branch
> name or the scheduler should stop overriding it; a human needs to pick one.

---

## Executive Summary

The dominant finding is a **deprecation deadline four days out that MJ was fully exposed to**: OpenAI
shuts down `o1`, `o1-pro`, `o3-mini`, `o4-mini` and `gpt-image-1` on its own API on **2026-10-23**, and
all five were `Active` on their OpenAI route in MJ. That is now applied. This closes the single
longest-running sub-item on the carry list (the "OpenAI 2026-10-23 tranche membership", open since
2026-10-05 with two sources contradicting each other) — the contradiction is resolved: the October 23
wave hits *snapshot* ids and the o-series, **not** base `gpt-4o`, which moves to 2027-01-14.

Two genuinely new models landed in the window and both are added: **Grok Voice 3.0** (2026-10-14) and
**Meta Muse Spark Open** (2026-10-15), the latter being MJ's **first Meta inference route** — the Meta
vendor row has existed with zero routes until now.

This run applies **19 edits**: 5 route deprecations with 3 cost-row expirations, 2 new models, 1 new
vendor route on an existing model, 1 promotional-price rollover, and 2 cache-price corrections. It
**closes four carried items** (10-23 tranche, Haiku 5.5's OpenRouter route, Sonnet 5.5's cache-read
split, Mistral Large 4's promo deadline) and adds no new vendor — every model this week comes from a
vendor MJ already carries.

Notably, **three candidate releases turned out to be non-findings**, which is itself the useful result:
Gemini 4 Argon (GA 2026-10-13) was already added by a separate commit (`61efa8beb`) and is already
priced correctly *including* its 2026-12-01 step-up; DeepSeek V4.1 Flash is already in the catalogue
with the correct first-party id `deepseek-flash`; and MJ's entire Chinese-model shelf (Kimi K3 at
$3/$15, K2.6, K2.7-Code, GLM 5.3 family, Qwen 3.8 Max) matches current published rates with no drift.

### Research-channel constraint — read this before judging the coverage

Egress this week was **narrower than any prior run**, and in a different shape. Raw `curl` and the
proxy denied essentially every vendor domain (403 at the CONNECT gateway); `WebFetch` resolved only a
small allowlist. The practical consequence: **`platform.claude.com` was the only first-party rate card
reachable all week.**

| Channel | Status this week |
|---|---|
| `platform.claude.com` (Anthropic docs + pricing + deprecations) | ✅ Full first-party read |
| `cloud.google.com` | ⚠️ Reachable but JS-rendered; returned title only, no tables |
| `WebSearch` (standard + extended) | ✅ Worked throughout; the backbone of this run |
| `openrouter.ai`, `openai.com`, `developers.openai.com`, `platform.openai.com` | ❌ DNS/policy blocked |
| `mistral.ai`, `docs.mistral.ai`, `api.deepseek.com`, `ai.google.dev`, `aws.amazon.com` | ❌ DNS/policy blocked |
| `community.openai.com` | ❌ DNS blocked |

Every edit below states which standard it met. Where a figure is corroborated-but-not-first-party, the
cost row's own `Comments` says so, names the unreachable page, and records the observation date — so a
later run with wider egress knows exactly what to re-verify rather than re-deriving it.

---

## Current Inventory Snapshot

**219 models** (184 `IsActive`), **646 vendor rows**, **318 cost rows** after this run's edits
(217 / 641 / 314 before).

| Vendor | Inference routes | of which Active |
|---|---|---|
| OpenRouter | 124 | 124 |
| OpenAI | 47 | 39 |
| Google | 29 | 21 |
| Azure | 28 | 27 |
| Anthropic | 24 | 13 |
| Amazon Bedrock | 24 | 24 |
| Vertex AI | 24 | 18 |
| Groq | 17 | 9 |
| x.ai | 15 | 15 |
| Fireworks.ai | 15 | 14 |
| Mistral AI | 14 | 11 |
| Cerebras | 11 | 1 |
| Alibaba Cloud | 10 | 10 |
| Z.AI | 7 | 7 |
| LM Studio | 7 | 7 |
| LocalEmbeddings | 6 | 6 |
| Eleven Labs / MiniMax | 4 / 4 | 4 / 4 |
| Moonshot AI | 4 | 3 |
| DeepSeek / Cohere | 3 / 3 | 3 / 3 |
| Black Forest Labs / Inception Labs | 2 / 2 | 2 / 2 |
| 8 single-route vendors | 8 | 8 |

The `Anthropic 24 → 13 Active` and `Cerebras 11 → 1 Active` ratios are expected, not drift: both
reflect deliberate historical deprecation (Anthropic retires aggressively; the Cerebras routes were
expired in earlier runs).

---

## New Models Available

### 1. Grok Voice 3.0 — **ADDED**

| | |
|---|---|
| Vendor / route | x.ai, `grok-voice-3.0` (alias `grok-voice-latest` now resolves here) |
| Released | 2026-10-14 |
| Price | **$0.08 / minute** of audio — unchanged from Grok Voice 2.0 |
| Transport | WebSocket `wss://api.x.ai/v1/realtime`, OpenAI-Realtime-API compatible |
| Model type | `Realtime`, DriverClass `GrokRealtime` |
| Ranks assigned | PowerRank 13, SpeedRank 9, CostRank 4 |

xAI's third-generation speech-to-speech model. Added using the **per-minute convention already
established in the catalogue** by the Grok Voice Think Fast 2.0 row: `PriceTypeID=Minutes`,
`UnitTypeID=Per Minute`, the blended rate in `InputPricePerUnit` and `OutputPricePerUnit: 0` so
consumers multiply elapsed minutes by one rate and never double-count. Both cache columns are null —
cache pricing does not apply to per-minute audio billing.

PowerRank 13 places it one above Think Fast 2.0 (12), which it supersedes on the alias; `PriorVersionID`
chains it to Think Fast 2.0, continuing the existing `Grok Voice → Think Fast 2.0` chain. Price and
speed ranks are unchanged from its predecessor because the rate is identical and xAI claims a latency
improvement it does not quantify in reachable sources.

**Not modelled**: xAI also lists **$0.004 per text input**. MJ has no field for a per-request text
surcharge alongside a per-minute audio rate, so it is recorded in the row's `Comments` only. This is a
concrete instance of carried item 20 (non-token billing units).

**Verification standard**: corroborated across several independent launch write-ups; `x.ai`'s own
pricing page was unreachable. The $0.08 figure is consistent across every source found and matches the
rate MJ already carries for the previous generation, which is the strongest available cross-check.

### 2. Muse Spark Open — **ADDED** (first Meta inference route in MJ)

| | |
|---|---|
| Developer | Meta (Model Developer row — attribution) |
| Inference route | OpenRouter, `meta/muse-spark-open`, DriverClass `OpenRouterLLM` |
| Released | 2026-10-15 |
| Price | **$1.25 input / $4.25 output** per 1M; cached input $0.15 |
| Context | 1,048,576 tokens |
| Architecture | ~816B total / ~42B active sparse MoE, natively multimodal (text/image/video/audio in → text out) |
| Ranks assigned | PowerRank 22, SpeedRank 6, CostRank 3 |

Meta's answer to the leading Chinese open-weight models, and the most consequential structural change
this week: **MJ has carried a `Meta` vendor row with zero inference routes**, with every Llama route
going through Groq, Cerebras or OpenRouter. This is the first model attributed to Meta that MJ can
actually call.

Ranks are calibrated against **Mistral Large 4** (PowerRank 22, CostRank 3), which is the closest
comparable: both are trillion-ish-parameter open-weight flagships at within 10% of the same price
($1.25/$4.25 vs $1.36/$4.18). Equal PowerRank is the honest placement — no reachable source benchmarks
them head to head, and inventing a gap would be fabrication.

**Deliberate omissions, each recorded in the row's `Comments`**:
- `MaxOutputTokens` is **omitted entirely** — no source consulted published an output cap. Guessing one
  would be worse than leaving it null.
- The **Contributor tier** ($0.10/$0.20, in exchange for letting Meta train on your traffic, 60 rpm cap)
  is a separate SKU and is not modelled.
- `CacheReadPricePerUnit: 0.15` comes from **Together AI's** rate card, not OpenRouter's, which
  published none. Flagged in the comment as indicative for this route.
- Together AI and Amazon SageMaker JumpStart also serve it. **Together AI is not an MJ vendor** — see
  "New Vendors Worth Considering".

**Licence caveat worth a human's attention**: the weights are under the "Muse Model License", not an
OSI-style licence. Organisations above **$20M gross revenue** in any consecutive twelve-month period
must enter a separate written agreement with Meta before offering it as Model-as-a-Service. That is
recorded in the model `Description`. It does not affect API consumption through OpenRouter, but it does
affect anyone who reads "open-weight" in the catalogue and plans to self-host.

### 3. GPT Image 2.5 Sunburst / Flare — **NOT added** (flagged)

These are the **named replacements for the `gpt-image-1` route this run just deprecated**, which makes
them the highest-value gap left open. Two API variants — Flare (fast) and Sunburst (precise editing) —
released ~2026-09-08/09, so *out of this week's window*, which is why they were not caught earlier.

Reported token pricing (all variants share one rate card): $5/1M text input, $8/1M image input, $30/1M
image output, cached text $1.25/1M, cached image $2/1M.

**Not added, for two reasons that compound**: (a) pricing is third-party only, with OpenAI's own pages
unreachable; (b) more importantly, **MJ's existing `GPT Image 2` row models cost as `Per Image`** with a
hand-computed representative figure ($0.053 for a 1024×1024 medium-quality image), and deriving the
equivalent for 2.5 requires image-output token counts that no reachable source publishes. Adding a
`Per 1M Tokens` row would make the two image models non-comparable inside the catalogue; inventing a
per-image figure would be fabrication. This needs the modelling decision in carried item 20 first.

### 4. DeepSeek V4.1 Flash `-1017` snapshot — **NOT added** (flagged, low priority)

Trackers listed "DeepSeek V4.1 Flash 1017" as a 2026-10-17 release. Investigation shows this is a
**snapshot refresh of a model MJ already carries**, not a new model: MJ's `DeepSeek V4.1 Flash` already
points at `deepseek-flash`, which SiliconFlow confirms is DeepSeek's direct-API id for this model. ✅
No action. The open question is only whether MJ should pin `deepseek-v4.1-flash-1017` instead of the
floating id — the same versioning question as carried item 24 (Mistral `-latest` aliases), and it should
be decided once for the whole catalogue rather than per-model.

Aggregator prices for the `-1017` id ranged from $0.10/$0.29 (DeepInfra) to $0.50/$1.50 (TensorX) —
a 5× spread that is itself evidence these are provider-specific rates, not a DeepSeek price change.

### 5. Kimi K3 / K2.6 / K2.7-Code — **verified already present, no change**

A sweep prompted by October pricing coverage found MJ's Moonshot shelf **already correct**: K3 at
$3/$15 with $0.30 cache hit, K2.6 at $0.6/$2.5, K2.7-Code at $0.95/$4.00 — all matching the rates
Moonshot's pricing page now publishes. Worth recording so a future run need not redo it.

---

## Pricing Changes Detected

| Model | Vendor | Previous (In/Out) | Current (In/Out) | Change | Action |
|---|---|---|---|---|---|
| Mistral Large 4 | Mistral AI | $0.68 / $2.09 | **$1.36 / $4.18** | **+100%** (promo lapse) | ✅ Expired + new row |
| Claude Sonnet 5.5 (cache read) | Amazon Bedrock | $0.20 | **$0.10** | −50% | ✅ Corrected |
| Claude Sonnet 5.5 (cache read) | OpenRouter | $0.20 | **$0.10** | −50% | ✅ Corrected |
| GPT-6 / Gemini 3.x / Grok 4.x / GLM 5.x / Qwen 3.x / Kimi | all | — | matches | none | ✅ Verified, no change |
| Claude (all 14 current models, base rates) | Anthropic | — | matches | none | ✅ Verified first-party |

### Mistral Large 4 — the promotional rollover (carried item 12, deadline met)

Last week's run recorded the launch promotion with an explicit standing instruction in the row's own
`Comments`: *"this is a promotional rate, 50% off for two weeks from release per Mistral's changelog,
so it is expected to lapse around 2026-10-20. When it does, expire this row and add the standard rate
of $1.36 input / $0.14 cached input / $4.18 output."* That deadline is **tomorrow**.

Applied per §0.2: the $0.68/$2.09 row is `Expired` with `EndedAt: 2026-10-20`, and a new `Active` row
starts 2026-10-20 at $1.36 / $0.14 cached / $4.18.

**The honest uncertainty, and why it was applied anyway.** Mistral **never published an explicit discount
end date** — multiple sources say so outright, and this week's searches confirmed it. 2026-10-20 is
arithmetic: release (2026-10-06) + the changelog's "two weeks" term, which *was* recorded first-party
on 2026-10-12 when `docs.mistral.ai` was reachable. It could not be re-verified this week.

I applied it rather than flagging it because the risk is asymmetric and the asymmetry favours applying:

- This PR merges at release time, which is after 2026-10-20 — so by merge, the standard rate is almost
  certainly live. Leaving MJ at half price would be wrong *at merge*, not just later.
- If the promotion was quietly extended, MJ **over**states cost by 2×. For a cost catalogue that drives
  model selection, overestimation steers you to a cheaper model; underestimation produces surprise
  bills. Overestimation is the safer failure direction.
- The expired row is preserved, so re-opening it is a one-line change if the promotion did continue.

The new row's `Comments` states all of this explicitly, including the instruction to re-open the expired
row if the promotion turns out to have been extended.

### Claude Sonnet 5.5 cache read (carried item 11, closed)

Last week's run corrected the **Anthropic** route to $0.10 and flagged whether Bedrock and OpenRouter
mirror Anthropic's exception or apply the standard multiplier. **Resolved, on evidence from inside MJ's
own data.**

Anthropic's pricing page (read first-party this week) carries footnote 2: *"Cache hits and refreshes on
Claude Opus 5.5 and Claude Sonnet 5.5 are priced at 0.05x the base input price"*, against a standard
0.1× for everything else. That is stated as a **property of the model**, in the model-pricing table.

The clincher is MJ's internal inconsistency: **MJ's Opus 5.5 rows on Bedrock and OpenRouter already
carry $0.20 = 0.05 × $4** — the exception. Only Sonnet 5.5's rows on those two vendors carried
$0.20 = 0.1 × $2, the standard multiplier. So MJ was applying the exception to one of the two models it
covers and not the other, on the same vendors. The $0.20 on Sonnet 5.5 was a stale calculation that the
Anthropic-route fix last week didn't reach, not a considered per-vendor difference.

Corrected to $0.10 on both. Both vendors' own rate cards were unreachable, so this is Anthropic list
price mirrored onto the routes — the same seeding convention every other Claude row on those vendors
already uses, and now internally consistent. Each row's `Comments` records the reasoning and the
unreachable page.

### Anthropic base-rate sweep — first-party, 14 models, zero drift

With `platform.claude.com` reachable, every current Claude model's base input/output/cache-write price
was diffed against Anthropic's own table programmatically. **All 14 match**: Fable 5.1 ($10/$50), Opus
5.5 ($4/$20), Opus 5 / 4.8 / 4.7 / 4.6 / 4.5 ($5/$25), Sonnet 5.5 and Sonnet 5 ($2/$10), Sonnet 4.6 and
4.5 ($3/$15), Haiku 5.5 ($0.10/$0.50), Haiku 4.5 ($1/$5). The only diffs the sweep reported were null
cache columns on OpenRouter rows (unpopulated, not wrong) and the Sonnet 5.5 cache read fixed above.

---

## Model Updates & New Versions

### Gemini 4 Argon — already correct, no action (worth recording)

Gemini 4 Argon went **GA in the paid Gemini API on 2026-10-13**, inside this window, at $2/$10 with
$0.10 cached — introductory pricing through **2026-11-30**, stepping up to **$4/$20 with $0.20 cached on
2026-12-01**. Free tier excluded. 1,048,576-token shared context window (input + thinking + output
share the budget).

MJ **already carries all of this**, correctly, on Google / Vertex AI / OpenRouter routes — added by
commit `61efa8beb`, outside this routine. Both cost rows already document the December 1 step-up in
their `Comments`. ✅ Nothing to do.

This is also a **partial answer to carried item 15** (MJ's convention for invitation-only models):
Argon was announced 2026-09-30 for vetted cyber defenders and reached general availability 13 days
later. The invitation-only state can be transient, which argues for carrying such models with an
explicit status rather than omitting them until GA.

### Claude Haiku 5.5 — OpenRouter route added (carried item 13, closed)

OpenRouter's own listing for `anthropic/claude-haiku-5.5` gives $0.10/$0.50 per 1M, 1M context, released
2026-10-07, served by 5 providers (Anthropic, Amazon Bedrock, Google Vertex, Azure, Claude Platform on
AWS). Added for parity with every other Claude model, with cache figures mirroring Anthropic list
($0.01 read / $0.125 5m write). `StartedAt` is the 2026-10-19 observation date, not an OpenRouter
price-change date — stated in the comment so it is not mistaken for one.

Two variants found and deliberately **not** modelled, both noted in the comment: a half-price `:batch`
listing ($0.05/$0.25) and EU in-region routing at $0.11/$0.55 (Business/Enterprise plans only).

### Claude Haiku 5.5's long-context tier — confirmed first-party, still unfixable

Anthropic's pricing table confirms what last week inferred, now first-party: Haiku 5.5 bills **two
tiers**, split at 100,000 prompt tokens.

| Prompt size | Input | Output | Cache read | 5m cache write |
|---|---|---|---|---|
| ≤ 100K | $0.10 | $0.50 | $0.01 | $0.125 |
| > 100K | **$0.50** | **$2.50** | $0.05 | $0.625 |

A **5× step** — the steepest in the catalogue, on exactly the long-context traffic a cheap 1M-context
model attracts. MJ stores one price pair per route, so all three Haiku 5.5 rows are correct only at or
below 100K and understate by 5× above it. This is schema work (carried item 16), not metadata work. Each
Haiku 5.5 row's `Comments` now states the limitation explicitly rather than leaving the row looking
complete.

### Anthropic tokenizer change — a cost factor MJ's schema cannot express

Recorded because it silently affects every cost estimate: **Claude 4.7 and later use a new tokenizer
that produces ~30% more tokens for the same text.** Claude Sonnet 4.6 and earlier use the previous one.
So a $5/MTok Opus 4.8 call and a $5/MTok Opus 4.5 call on identical input **do not cost the same**. No
field in `MJ: AI Model Costs` expresses tokens-per-character, so per-model cost comparison across the
4.6/4.7 boundary is systematically skewed. Flagged — see Recommended Actions.

---

## Deprecated / Sunset Models

### OpenAI's 2026-10-23 wave — APPLIED (closes the carry list's oldest open deadline)

**This was the week's real exposure.** Five routes MJ carried as `Active` on OpenAI die in four days.

| MJ model | API id | Sunset | Replacement | Applied |
|---|---|---|---|---|
| `o1` | `o1` | 2026-10-23 | `gpt-5.6-sol` | Route `Inactive`, cost row `Expired` |
| `o1-pro` | `o1-pro` | 2026-10-23 | `gpt-5.6-sol` (`reasoning.mode=pro`) | Route `Inactive`, **`IsActive: false`** |
| `o3-mini` | `o3-mini` | 2026-10-23 | `gpt-5.6-sol` | Route `Inactive`, cost row `Expired` |
| `o4-mini` | `o4-mini` | 2026-10-23 | `gpt-5.6-terra` | Route `Inactive` |
| `GPT-4o Image 1.0` | `gpt-image-1` | 2026-10-23 | `gpt-image-2.5-sunburst` / `-flare` | Route `Inactive`, cost row `Expired`, **`IsActive: false`** |

Applied strictly per §0.2, and the parts that are easy to get wrong in the *other* direction were
deliberately left alone:

- **The OpenAI Model Developer rows stay `Active`** on all five — they record attribution, not service.
- **Azure and OpenRouter routes are untouched.** Those platforms run their own lifecycles, and this is
  not hypothetical: **Azure retires `o1` and `o3-mini` on 2026-11-19**, a month later. MJ keeps serving
  them there.
- **`o1`, `o3-mini` and `o4-mini` keep `IsActive: true`** — they still have live Azure and OpenRouter
  routes. Only `o1-pro` and `GPT-4o Image 1.0` drop to `IsActive: false`, because OpenAI was their
  *only* inference provider.
- **Azure cost rows stay `Active`**; only the OpenAI-vendor cost rows were expired.
- **`o3` is NOT in this wave and was not touched.** Worth stating plainly, because it is the trap here:
  `o3` was retired from *ChatGPT* on 2026-08-26 and OpenAI explicitly said the API was unaffected. MJ's
  `o3` routes remain correctly `Active`.

**Verification standard.** Both `openai.com` and `developers.openai.com` were DNS-blocked, so the
deprecations page could not be read directly. The date and the per-model replacements are corroborated
by **six independent sources** quoting that page's contents, including four bug reports filed against
real projects (`microsoft/semantic-kernel` #14526, `LibreChat-AI/LibreChat` #16893,
`ashbuilds/payload-ai` #181, `profullstack/pairux.com` #134) that each name the 2026-10-23 date for
`gpt-image-1` plus the sunburst/flare replacements, and a price-calendar tracker. Independent
downstream projects breaking on the same date is strong evidence. Each expired row's `Comments` names
the source page.

**On applying a future-dated sunset.** The sunset is 4 days out, so for 4 days these rows are marginally
early. This is the right trade: the PR merges at release time (after 2026-10-23), the replacements all
exist, and the carry list shows overdue deprecations rot for weeks when flagged rather than applied
(carried item 10 has been overdue since 2026-10-05). `EndedAt: 2026-10-23` satisfies
`chk_AIModelCost_DateRange` on all three expired rows.

### Resolves the 10-23 tranche contradiction (carried item 25)

Carried for two weeks as *"the OpenAI 2026-10-23 tranche membership, two sources still contradict, and
MJ still has a live `gpt-4o` route."* **Resolved, and the prior read was right to be cautious:**

- **2026-10-23** hits `gpt-4o-2024-05-13` (the snapshot) and the o-series/image ids above.
- **2027-01-14** is when `gpt-4o-2024-08-06`, `gpt-4o-2024-11-20`, base `gpt-4o` and the GPT-4.1 family
  leave the API, fine-tuned versions included. Replacement `gpt-6-luna`.
- **Azure** runs its own schedule: `gpt-4o` version `2024-05-13` retires 2026-12-09.

So **MJ's live base `gpt-4o` route is not exposed on 2026-10-23** — the exposure is 2027-01-14, and MJ
carries no dated `gpt-4o` snapshot routes at all. No edit needed now. Carried forward with its real
date, well inside notice.

### Anthropic lifecycle sweep — first-party, one item to watch

Read directly from Anthropic's deprecations table:

- `claude-sonnet-4-5-20250929` — **Deprecated 2026-09-30, retires 2026-11-30.** MJ's `Claude 4.5 Sonnet`
  Anthropic route is already `Deprecated` ✅. **Not yet retired**, so per §0.2 it stays `Deprecated`
  rather than `Inactive`. **Next action falls on the run nearest 2026-11-30** — flagged below.
- `claude-haiku-4-5-20251001` — Active, retirement "not sooner than **2026-10-15**", i.e. *four days
  ago*. Still listed Active, so no action, but it is now retirable at any time. Watch weekly.
- `claude-opus-4-5-20251101` — Active, "not sooner than 2026-11-24". MJ Active ✅.
- `claude-opus-4-1-20250805` — retired on the Claude API 2026-08-05. MJ's Anthropic row is `Inactive` ✅,
  Bedrock/OpenRouter still `Active` (legitimate — partner platforms set their own dates). **But its
  model-level `IsActive` is `false` while two routes are still live**, which inverts the §0.2 rule.
  Pre-existing; flagged below.
- `claude-mythos-5-1` / `claude-mythos-5` — Active, limited availability. Still absent from MJ. Carried
  item 15, still needs a human decision, not research.

---

## New Vendors Worth Considering

**No vendor row was added this week** — both new models route through vendors MJ already carries (x.ai
direct, and Meta-as-developer via OpenRouter). Two candidates surfaced and are flagged rather than
added:

1. **Together AI** — serves Muse Spark Open at $1.25/$0.15 cached/$4.25 and is one of Meta's named
   launch partners. It is a credible second route for a model MJ now carries with only one, and it is
   the source of the cache-read figure MJ just recorded. Adding it is a small, well-evidenced change,
   but it needs its `CredentialTypeID` decided (API Key, presumably) and ideally a second model to
   justify the row. Flagged.
2. **Amazon SageMaker JumpStart** — also serves Muse Spark Open. Distinct from `Amazon Bedrock`, which
   MJ already has. Mentioning it mainly so a future run does not mistake it for the Bedrock row;
   JumpStart is a self-managed-endpoint product with a different cost model (per instance-hour, not
   per token), so it likely does not belong in a $/1M-token catalogue at all without the carried
   item 20 schema work.

---

## Recommended Actions

### Applied this run — 19 edits

1. **[Applied]** **OpenAI 2026-10-23 wave** — `o1`, `o1-pro`, `o3-mini`, `o4-mini`, `gpt-image-1`:
   OpenAI inference rows → `Inactive`; 3 OpenAI cost rows → `Expired` + `EndedAt: 2026-10-23`;
   `o1-pro` and `GPT-4o Image 1.0` → `IsActive: false`. Azure/OpenRouter routes and all Model Developer
   rows untouched. `o3` deliberately excluded.
2. **[Applied]** **Mistral Large 4 promotional rollover** — promo row `Expired` + `EndedAt: 2026-10-20`;
   new `Active` row at $1.36 / $0.14 cached / $4.18. Executes last week's standing instruction on its
   deadline. Date provenance and the re-open instruction are in the row's `Comments`.
3. **[Applied]** **Claude Sonnet 5.5 cache read $0.20 → $0.10** on Amazon Bedrock and OpenRouter,
   closing carried item 11 on the strength of Anthropic's footnote 2 plus MJ's own Opus 5.5 rows.
4. **[Applied]** **Claude Haiku 5.5 OpenRouter route added** — vendor row + cost row at $0.10/$0.50,
   closing carried item 13.
5. **[Applied]** **Grok Voice 3.0 added** — 2 vendor rows, 1 cost row at $0.08/min on the existing
   per-minute convention.
6. **[Applied]** **Muse Spark Open added** — 2 vendor rows, 1 cost row at $1.25/$4.25. MJ's first Meta
   inference route.
7. **[Verified, no change]** **Anthropic 14-model first-party price sweep**, **Gemini 4 Argon**,
   **DeepSeek V4.1 Flash**, **Kimi K3/K2.6/K2.7-Code**, **GLM 5.x**, **Qwen 3.x** — all match current
   published rates. Documented so a future run need not redo it.

### Resolved — remove from the carry list

8. **[Resolved]** **Carried item 25's OpenAI sub-item — the 2026-10-23 tranche membership.** The two
   contradicting sources are reconciled: 10-23 = `gpt-4o-2024-05-13` + o-series + `gpt-image-1`;
   2027-01-14 = base `gpt-4o`, the dated 4o snapshots and GPT-4.1. MJ's `gpt-4o` route is **not**
   exposed on 10-23. Replaced below by a dated 2027-01-14 item.
9. **[Resolved]** **Carried item 13 — Haiku 5.5's OpenRouter route.** Id and price confirmed, route
   added. Drop it.
10. **[Resolved]** **Carried item 11 — Sonnet 5.5 cache read on Bedrock/OpenRouter.** Resolved and
    applied. The companion question ("does Opus 5.5 need the same?") is answered too: MJ already had it
    right. Drop it.
11. **[Resolved]** **Carried item 12 — Mistral Large 4 promo deadline.** Executed. The residual
    `MaxOutputTokens` gap is carried below as its own, smaller item.
12. **[Partially resolved]** **Carried item 15 — invitation-only models.** Gemini 4 Argon shows the
    invitation-only state is often *transient* (30 days, in its case). That is evidence for the
    convention decision, not the decision itself; the Mythos half still needs a human.

### Open — needs a human decision (not more research)

13. **[Flagged — carried since 2026-08-31, 8th week, now with supporting evidence]** **MJ's convention
    for limited-availability models.** Blocks Claude Mythos 5.1 / Mythos 5 (pricing fully verified
    first-party *again* this week: $10/$50, cache read $0.25, both Active, retirement not sooner than
    2027-09-01) and Gemini 3.8 Flash Cyber. The data half has now been done **four times**. Gemini 4
    Argon's 13-day path from vetted-access to GA argues for carrying such models with an explicit
    status rather than omitting them. **This needs a decision, and re-researching it weekly is waste.**
14. **[Flagged — carried, the highest-value structural item, 5th week]** **Request-level and
    long-context price tiers.** Now first-party confirmed for **Claude Haiku 5.5** (5× above 100K — the
    steepest in the catalogue, and MJ carries three rows that are wrong on exactly the traffic Haiku is
    cheapest for). Still outstanding: Gemini 3.1 Pro ($2/$12 ≤200K, $4/$18 above), `gpt-6-sol` /
    `gpt-6.1-sol` whole-request rebilling above 272K, GPT-6 Luna, GPT-6.1 Sol Flex/Ultrafast, every
    Grok 4.x doubling at ≥200K, and now **Mistral Large 4's batch tier** ($0.34/$1.045) and **regional
    endpoints at 1.1×**. **MJ stores one price pair per route, so every one of these is silently wrong
    on part of its traffic today.** Driver and schema work.
15. **[Flagged — new, and it has no field at all]** **The Anthropic tokenizer discontinuity.** Claude
    4.7+ produce ~30% more tokens for the same text than Claude 4.6 and earlier. Two models at the same
    $/MTok do not cost the same per unit of work, and `MJ: AI Model Costs` cannot express this. Any
    cost-based model comparison spanning the 4.6/4.7 boundary is skewed by ~30%. Needs either a
    tokens-per-character field or an explicit documented caveat in the cost UI.
16. **[Flagged — new, deadline 2026-11-30]** **`claude-sonnet-4-5-20250929` retires 2026-11-30.** MJ's
    row is correctly `Deprecated` today. The run nearest that date must apply §0.2: Anthropic route →
    `Inactive`, its cost row → `Expired` + `EndedAt: 2026-11-30`. Bedrock/OpenRouter routes stay —
    partner platforms set their own dates.
17. **[Flagged — new, deadline 2027-01-14]** **Base `gpt-4o` and the GPT-4.1 family leave the OpenAI
    API 2027-01-14** (replacement `gpt-6-luna`); Azure retires `gpt-4o` `2024-05-13` on 2026-12-09. MJ
    carries live `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano` routes. Well inside
    notice; recorded with dates so it is not rediscovered each week.
18. **[Flagged — new, caused by this run]** **`gpt-image-2.5-sunburst` / `-flare` are now the named
    replacement for a route MJ just deprecated**, and MJ carries neither. Blocked on the `Per Image`
    vs `Per 1M Tokens` modelling decision (item 20) plus OpenAI pricing egress. Highest-value *model*
    gap left open.
19. **[Flagged — new, small]** **Muse Spark 1.1 / 1.2 / 1.3** are on OpenRouter and absent from MJ,
    alongside `meta/muse-wonder`. Having added Muse Spark Open, the line is worth a sweep. Also still
    open from item 11: **Muse Spark Open's `MaxOutputTokens`** and whether Groq or Fireworks serve it.
20. **[Flagged — carried, unchanged]** **Carried item 10 — four OpenRouter routes with announced
    retirements, two now ~2 weeks overdue**, plus five already-dead MJ OpenRouter ids and the
    10-of-15 non-serverless Fireworks routes. One load of `openrouter.ai/api/v1/models` settles all of
    it. **Blocked three weeks running on egress** — `openrouter.ai` is DNS-blocked here. This needs a
    session with wider egress, or the URL fetched once by a human and pasted in.
21. **[Flagged — carried, unchanged]** **DeepSeek V4 Pro / V4 Flash**: five concurrent `Active` cost
    rows across two models, peak/off-peak tier structure diagnosed 2026-10-05. Now compounded by the
    **`-1017` snapshot-vs-floating-id question** (item 24's scope).
22. **[Flagged — carried, worsening]** **CostRank / SpeedRank scale overflow.** 13+ active models exceed
    the documented 1–10 range. Also folded in: **Haiku 4.5's PowerRank of 4** (a stale outlier that
    makes the Haiku line unrankable — Haiku 5.5 sits at 20), **Mistral Large 3's PowerRank 9 below
    Mistral Medium 3.5's 13**, and **DeepSeek V4.1 Flash at PowerRank 32**, the highest in the
    catalogue, above every frontier model. The scale is no longer meaningful without a recalibration
    pass.
23. **[Flagged — carried, unchanged]** **116 Active inference routes have no Active cost row**, almost
    all OpenRouter. Underlying question still open: should OpenRouter rows track OpenRouter's moving
    lowest-provider price at all? This run added one more such row and faced the same question.
24. **[Flagged — carried, unchanged]** **Non-token billing units.** Rerank per search, TTS per
    character, STT per hour, video per second, Cloudflare neurons — and now **Grok Voice 3.0's $0.004
    per text input**, which has no field. Blocking the image/video/audio schema decision and item 18.
25. **[Flagged — carried, unchanged]** **Create a `Decision` model type**, then add Cloudflare Clef /
    Clef-flash and TypeSafe `jev-1.13`.
26. **[Flagged — carried, unchanged]** **Three cost rows have no `StartedAt`** (Whisper Large v3 / Groq,
    Whisper Large v3 Turbo / Groq, Whisper 1 / OpenAI), all three also storing per-hour or per-minute
    rates in a per-1M-token field.
27. **[Flagged — carried, unchanged]** **Claude 3.5 Sonnet's Anthropic cost row cannot be expired**
    because its seed `StartedAt` (2026-01-08) postdates the model's 2025-10-28 retirement; `EndedAt >
    StartedAt` is unsatisfiable. Needs a human to set a real start date.
28. **[Flagged — carried, now with a second instance]** **Model-level `IsActive: false` while routes are
    still live.** `Claude Opus 4.1` is `IsActive: false` with `Active` Bedrock and OpenRouter routes —
    the inverse of the §0.2 rule. A catalogue-wide consistency scan would be cheap and is worth doing
    once; this run's own two `IsActive: false` edits were checked by hand against the rule.
29. **[Flagged — carried, unchanged]** **Mistral `-latest` alias duplication** (`Mistral Large` vs
    `Mistral Large 3`, `Mistral Medium` vs `Mistral Medium 3.5`), worsened by Mistral Large 4 —
    `mistral-large-latest` will eventually resolve to Large 4, giving MJ three records for two models.
    Same question as DeepSeek's `-1017`: **does MJ pin versions or float aliases?** Decide once.
30. **[Flagged — carried, unchanged]** Vertex `gemini-2.0-flash-001` / `-lite-001` `Active` on routes
    discontinued 2026-06-01; `grok-code-fast-1` alias billing; `Mixtral 8x7B`'s `open-mistral-8x7b` id
    (Mistral's is `open-mixtral-8x7b`) and its `Active` cost row on a model retired 2025-03-30;
    `mistral-embed` with `APIName: undefined`; three OpenAI embedding routes with `APIName: undefined`;
    Codestral 2508's context figures; BFL `flux-1.1-pro` → `flux-pro-1.1` and FLUX.2 Pro's
    per-megapixel unit; ~30 Bedrock models MJ carries no route for.
31. **[Flagged — carried, unchanged]** **`gpt-6.1-sol` MaxInputTokens 922,000 vs 1,050,000 on its
    siblings.** A convention decision, not an error.
32. **[Flagged — carried, re-verified this week]** **8 duplicate `primaryKey` UUIDs across the AI
    metadata files.** Re-scanned across all three files on this branch: **still exactly 8**, all
    pre-dating this branch — `E3A5CCEC-`, `D8A5CCEC-`, `DAA5CCEC-`, `DBA5CCEC-`,
    `E4A5CCEC-6A37-EF11-86D4-000D3A4E707E`, `27C0423E-F36B-1410-8876-005D02743E8C`, `DAB9433E-` and
    `E1B9433E-F36B-1410-8DA0-00021F8B792E`. This run's **11 new UUIDs each appear exactly once**
    (verified, see Verification below). Still worth one human look to confirm whether the paired
    records belong to different entities (harmless) or the same one (a real collision).

### Notes on the routine prompt itself (§0 asks for this)

**The repo mirror matches the stored prompt** section for section (§0.1–§0.6, Steps 0–4, Deliverables
1–4, Guidelines 1–11). No stale divergence this week.

Three carried defects in the prompt of record, all still **unfixed**, all re-confirmed this week:

1. **Deliverable 2 contradicts `metadata/CLAUDE.md` on `primaryKey`.** The prompt says "Do NOT include
   `primaryKey`"; `metadata/CLAUDE.md` rule 1 says new records **SHOULD** carry a `uuidgen` UUID, and
   §0.6 says `metadata/CLAUDE.md` wins. Following the prompt literally reddens the CodeGen drift gate,
   as it did on 2026-10-05. **This run supplied 11 kernel-generated UUIDs** (from
   `/proc/sys/kernel/random/uuid` — `uuidgen` is not installed in this image) on **every** new record
   including the two top-level models, and verified `would mint: 0` against the gate's own
   `isSyncOnlyChange`. Deliverable 2 should be corrected to *require* a `primaryKey` while keeping the
   "never `sync`" half.
2. **§0.3 still does not catch the missing-`primaryKey` failure**, which has now reddened two separate
   runs (2026-10-05, 2026-10-12). Last week's report proposed the exact reusable check; it is still not
   in the prompt. **Strong recommendation: paste it into §0.3 next to the Status check.** It needs no
   database and reproduces the gate exactly. This run ran it and reports the result below.
3. **`Priority` is defined backwards at line 210.** The prompt says "lower = higher priority";
   `BaseModelRunner.ts:1347`/`:1523` and `ExecutionPlanner.ts:428`/`:618` all sort
   `b.Priority - a.Priority` — descending, so **higher is tried first** — while `RerankerService.ts:341`
   reads the same field ascending. Present in both copies of the prompt, so a real error, not mirror
   drift. (This run used `Priority: 0` for Model Developer and `1`/`50` for Inference Provider, copying
   the dominant existing convention rather than the prompt's prose.)

**New recommendation — Step 2's source list needs an egress-reality note.** Three consecutive runs have
now had materially different channels: 2026-10-05 reached `platform.claude.com`, the AWS Price List API
and vendor GitHub docs; 2026-10-12 lost the latter two; **this week lost everything except
`platform.claude.com` and WebSearch**. Step 2 reads as though vendor pricing pages are reachable. It
should instead instruct the run to **probe its channels first, state the map in the report, and label
every edit with the standard it met** — which is what this report does. Without that, a reader cannot
tell a first-party verification from a corroborated inference, and the §0.3/guideline-1 "accuracy over
completeness" rule becomes unenforceable.

---

## Verification

Both mandatory pre-flight gates pass on this branch:

```
§0.3 Status / EndedAt check ............ OK
primaryKey drift gate .................. would mint: 0 | sync-only: true
```

Additional checks run before committing:

| Check | Result |
|---|---|
| JSON parses (all 3 metadata files) | ✅ |
| Byte-stable round-trip (`indent=2`, no trailing newline) | ✅ diff is 236 insertions / 24 deletions, no reformatting noise |
| Every `@lookup:` vendor + model target resolves | ✅ 113 distinct refs, 0 unresolvable |
| New `@lookup:` targets introduced | ✅ only `MJ: AI Models.Name=Grok Voice Think Fast 2.0`, which exists |
| This run's 11 new UUIDs unique across all 3 files | ✅ 0 collisions (1,238 keys scanned) |
| `Expired` rows have `EndedAt > StartedAt` | ✅ all 4 |
| Cost `Status` values within `chk_AIModelCost_Status` | ✅ no `Inactive` on any cost row |
| Vendor `Status` values within `CK_AIModelVendor_Status` | ✅ |

`mj sync validate` needs a database and could not be run here; the Integration Tier on the PR is the
backstop (§0.4) and will be watched.

---

## Research Sources

**First-party (read directly this week)**
- https://platform.claude.com/docs/en/about-claude/models/overview — Claude lineup, API ids, context/output limits, retirement commitments
- https://platform.claude.com/docs/en/about-claude/pricing — full Claude price table, cache multipliers (footnotes 1–3), tokenizer note, cloud-platform policy
- https://platform.claude.com/docs/en/about-claude/model-deprecations — lifecycle table and full deprecation history

**OpenAI 2026-10-23 wave** (page itself unreachable; corroborated via downstream reports quoting it)
- https://github.com/microsoft/semantic-kernel/issues/14526
- https://github.com/LibreChat-AI/LibreChat/issues/16893
- https://github.com/ashbuilds/payload-ai/issues/181
- https://github.com/profullstack/pairux.com/issues/134
- https://cloud.cloudquell.com/llm/price-calendar/openai-2026-10-23-gpt-image-1/
- https://benchlm.ai/blog/posts/openai-october-23-shutdown
- https://datanorth.ai/news/gpt-4o-and-gpt-4-1-leave-openais-api-on-14-january-2027-fine-tuned-versions-included — the 2027-01-14 tranche

**Grok Voice 3.0**
- https://www.unite.ai/xai-introduces-grok-voice-3-0-speech-to-speech-model-for-voice-agents/
- https://dev.to/gabrielanhaia/grok-voice-30-took-over-grok-voice-latest-on-october-14-pin-your-voice-agents-model-435
- https://cellcog.ai/blog/grok-voice-3/

**Muse Spark Open**
- https://research.meta.ai/blog/muse-spark-open — Meta's own announcement
- https://openrouter.ai/meta/muse-spark-open — route id, $1.25/$4.25, 1M context, release date
- https://huggingface.co/blog/meta-muse-spark-open — architecture, 816B/42B, licence scope
- https://thenewstack.io/meta-muse-spark-open/ — licence limits
- https://aiweekly.co/alerts/meta-prices-muse-spark-11-api-at-125425-per-m-tokens — Together AI rates incl. cached input

**Claude Haiku 5.5 on OpenRouter**
- https://openrouter.ai/anthropic/claude-haiku-5.5 — price, context, provider list
- https://www.marktechpost.com/2026/10/07/anthropic-releases-claude-haiku-5-5-a-small-model-with-1m-context-priced-at-0-10-per-million-input-tokens/ — the >100K tier

**Mistral Large 4**
- https://tokencost.app/blog/mistral-large-4-pricing — $0.68/$2.09 sale vs $1.36 list
- https://tech-insider.org/mistral-large-4-launch-1-05t-params-pricing-2026/
- https://mxchat.ai/mistral-large-4-pricing-preview-discount/ — the two-price confusion, batch and regional tiers

**Gemini 4 Argon**
- https://venturebeat.com/technology/google-makes-gemini-4-argon-broadly-available-with-limited-time-low-api-pricing-of-2-10-per-1m-token
- https://www.technology.org/2026/10/14/gemini-4-argon-generally-available-pricing-december/ — the 2026-12-01 step-up

**Non-findings (verified already correct)**
- https://www.siliconflow.com/blog/deepseek-v4-1-flash-api-migration — confirms `deepseek-flash` as DeepSeek's direct-API id
- https://benchlm.ai/moonshot/api-pricing — Kimi K3 $3/$15, K2.6, K2.7-Code $0.95/$4.00
- https://llmgateway.io/timeline, https://www.evertune.ai/resources/ai-model-tracker — release-window scans

**Prior reports carried forward**: `2026-10-12`, `2026-10-05`, `2026-10-02`.
