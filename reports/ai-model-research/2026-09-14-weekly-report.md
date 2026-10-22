# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-09-14
**Research Period**: 2026-09-08 → 2026-09-14
**Base Branch**: `next`
**Research Branch**: `claude/magical-turing-ix7zq2`

> **Branch note.** The routine asks for `claude/ai-model-research-YYYY-MM-DD`. This session's runtime
> pins its own designated branch and forbids pushing anywhere else, so the branch name breaks the
> usual convention — the same situation as 2026-09-07. Nothing else about the PR changes.

---

## Executive Summary

One genuinely new vendor arrived and one long-standing price error came out. **Sakana AI shipped
Fugu Max and Fugu Ultra v2** on 2026-09-11 and put both on OpenRouter day-one, which dissolves the
blocker that kept Sakana flagged for two weeks: no `SakanaLLM` driver class is needed, because the
OpenRouter route works exactly like the Meta/Muse Spark precedent. Both are applied.

The more consequential finding is a correction, not an addition. **Our `GPT 5.6` cost row has been
wrong since 2026-08-21** — OpenAI cut Sol from $5/$30 to $4/$20 that day and we never picked it up,
so MJ has been over-estimating Sol spend by 20% on input and 33% on output for three weeks. This is
the "GPT 5.6 (Sol) pricing conflict" that has been carried since 2026-08-31, now resolved with a
specific date and rate. Note the catch recorded in the new row's `Comments`: OpenAI calls the rate
**promotional and guarantees it only through 2026-11-21**, so this needs re-checking in November.

Two carried follow-ups also close: the **DeepSeek V4.1 Flash OpenRouter rate** is confirmed and its
cost row added, and the **GLM 5.3 OpenRouter context window** is verified at 1,310,720 rather than
the 200,000 we recorded.

**Grok 4.7 slipped a fourth time.** Musk's Sept 11 target passed; on Sept 11 he wrote that it "needs
a few more days to cook". Still no model card, rate card or API id. It stays flagged, and the
recommendation from last week stands: stop treating the announced date as information.

Four edits applied across two files. Nothing this week required a deprecation, but a large one is
coming — see the OpenAI retirement calendar below.

---

## Current Inventory Snapshot

- **197 models** in `.ai-models.json` (195 before this run), **169 active**, plus 4 Cohere rerankers
  in `.cohere-reranker-models.json` = **201 model records**
- **32 vendors** in `.ai-vendors.json` (+1 — Sakana AI)

Vendor bindings, top of the distribution (delta versus 2026-09-13 in **bold**):

| Vendor | Bindings | Latest In-Inventory Model | Newest Cost Record |
|---|---:|---|---|
| OpenRouter | **112** | **Fugu Ultra v2 (Sep 11)** | **2026-09-11** |
| OpenAI | 90 | GPT-6 Astra (Sep 3) | **2026-08-21 (Sol re-rate)** |
| Google | 47 | Gemini 3.8 Flash (Sep 2) | 2026-09-02 |
| Anthropic | 42 | Claude Fable 5.1 (Sep 1) | 2026-09-01 |
| Vertex AI | 41 | Gemini 3.8 Flash | 2026-09-02 |
| Alibaba Cloud | 29 | Qwen3.8-Flash (Aug 26) | 2026-08-26 |
| Mistral AI | 26 | Mistral Medium 3.5 | 2026 mid-year |
| x.ai | 25 | Grok 4.6 (Aug 12) | 2026-08-25 |
| Azure | 24 | GPT-6 Astra | 2026-09-03 |
| Amazon Bedrock | 18 | GPT-6 Astra | 2026-09-08 |
| Groq | 17 | — | — |
| Fireworks.ai | 15 | — | — |
| Z.AI | 14 | GLM-5.3-Flash (Aug 26) | 2026-09-09 |
| DeepSeek | 6 | DeepSeek V4.1 Flash (Sep 10) | 2026-09-10 |
| **Sakana AI (new)** | **2** | **Fugu Max, Fugu Ultra v2 (Sep 11)** | **2026-09-11** |
| Meta | 1 | Muse Spark 1.3 (Sep 2) | 2026-09-02 |

---

## New Models Available

### 1. Sakana AI — **Fugu Max** and **Fugu Ultra v2** *(NEW — both applied, with Sakana AI as a new vendor)*

Released **2026-09-11**. Fugu is not a conventional model. It is a *learned multi-agent
orchestrator*: a language model trained to route each task across a fixed pool of open-weight and
specialist models — NVIDIA's Nemotron family among them — and to recursively call instances of
itself, then stitch the results back together. Sakana's claim is that the family beats frontier
benchmarks without containing a frontier model.

| | Fugu Max | Fugu Ultra v2 |
|---|---|---|
| OpenRouter slug | `sakana/fugu-max` | `sakana/fugu-ultra-v2` |
| Price (per 1M) | **$2.00 / $6.00**, cache read $0.25 | **$5.00 / $30.00**, cache read $0.50 |
| Long-context tier | none — flat across the window | **$10 / $45 above 272K input** |
| Context / max output | 1,048,576 / 128,000 | 1,000,000 / 128,000 |
| Input modalities | text, image, PDF | text, image, PDF |
| Features | function calling, structured outputs, effort levels (high/xhigh/max), web search **and** web fetch | function calling, structured outputs, effort levels (high/xhigh/max), web search |
| Ranks assigned | Power **22**, Speed **5**, Cost **6** | Power **25**, Speed **4**, Cost **8** |

**How it's wired.** `Sakana AI` is added to `.ai-vendors.json` (CredentialType `API Key`) as a
**Model Developer only**; inference goes through **OpenRouter** with `DriverClass: OpenRouterLLM`.
Sakana does serve its own OpenAI-compatible API, but wiring it up would need a `SakanaLLM` driver
class that does not exist in the codebase. This is the same shape already used for Meta/Muse Spark,
NVIDIA/Nemotron and Thinking Machines Lab/Inkling, and it closes the item flagged on 2026-09-13
without inventing a driver class.

**Rank calibration.** Ultra v2 is set at PowerRank 25 — deliberately one below the 26–27 frontier
cluster (Claude Fable 5.1, GPT-6 Astra, Grok 4.6, Gemini 3.8 Flash) rather than level with it,
because the benchmark claims are the vendor's own and the architecture is unusual. Speed is set low
(4 and 5, against Grok 4.6's 6) because an orchestrator that recursively calls sub-models is
structurally slower per answer than a single-model call. Fugu Max's CostRank 6 matches Grok 4.6,
which has the identical $2/$6 rate card.

**Two caveats recorded in the model descriptions rather than the ranks:**

- **No EU/EEA service.** Sakana does not serve the Fugu family inside the EU or EEA pending GDPR
  compliance work. This is a deployment constraint MJ's schema has no field for, so it lives in the
  Description.
- **Web search bills per call**, at $10 per 1,000 calls on Fugu Max. MJ prices per token; the
  per-call charge is noted in `Comments` and deliberately not modelled.

Sources: <https://openrouter.ai/sakana/fugu-max> ·
<https://openrouter.ai/sakana/fugu-ultra-v2> ·
<https://www.marktechpost.com/2026/09/10/sakana-ai-launches-fugu-max-and-fugu-ultra-v2-for-cheaper-stronger-multi-agent-orchestration/> ·
<https://datanorth.ai/news/sakana-ai-launches-fugu-max-and-fugu-ultra-v2> ·
<https://tokencost.app/blog/sakana-fugu-max-pricing-orchestration-tokens> ·
<https://aicybr.com/blog/sakana-fugu-max-ultra-v2-orchestration-pricing-api>

---

## Pricing Changes Detected

| Model | Vendor | Previous (In/Out) | Current (In/Out) | Change | Applied? |
|---|---|---|---|---|---|
| GPT 5.6 (Sol) | OpenAI | $5.00 / $30.00 | **$4.00 / $20.00** (cache $0.40) | −20% in, −33% out | **Yes** |
| DeepSeek V4.1 Flash | OpenRouter | *(no cost record)* | $0.15 / $0.60 (cache $0.003) | new record | **Yes** |
| Fugu Max | OpenRouter | *(new model)* | $2.00 / $6.00 | new record | **Yes** |
| Fugu Ultra v2 | OpenRouter | *(new model)* | $5.00 / $30.00 | new record | **Yes** |

### GPT 5.6 (Sol) — the carried pricing conflict, resolved

Our record has carried `$5.00 / $30.00` with `StartedAt` 2026-07-10 since the model was added.
OpenAI cut the rate on **2026-08-21** to **$4.00 input / $0.40 cached input / $20.00 output** per
1M — a 20% input and 33% output reduction — and we never picked it up. Corroborated by OpenAI's own
model page and three independent trackers, all naming the same date and the same three figures.

Applied per §0.2 and Step 3B: the $5/$30 row is `Expired` with `EndedAt: 2026-08-21T00:00:00.000Z`,
and a new `Active` row starts at that instant. The old row is preserved, not rewritten — the history
is the point.

**Read the new row's `Comments` before relying on the rate.** OpenAI describes $4/$20 as
**promotional** and commits to it only **through 2026-11-21**. It applies to metered API usage and
purchased credits, not consumer subscriptions; Batch remains half rate. A future run must re-check
on or shortly after 2026-11-21 and either extend or expire this row.

Sources: <https://developers.openai.com/api/docs/models/gpt-5.6-sol> ·
<https://techjacksolutions.com/ai-brief/openai-gpt-5-6-sol-api-price-cut-20-percent-november-2026/> ·
<https://cellcog.ai/blog/gpt-5-6-pricing/> ·
<https://enterprisedna.co/resources/news/openai-gpt-56-sol-price-cut-20-percent-frontier-model-august-2026/>

### DeepSeek V4.1 Flash on OpenRouter — the rate confirmed

Last week added the OpenRouter inference route (`deepseek/deepseek-v4.1-flash`) but deliberately
wrote **no** cost row, because the rate was unconfirmed and an invented price is worse than an
absent one. It is now confirmed: OpenRouter passes DeepSeek's own card through at **$0.15 input /
$0.60 output / $0.003 cache read** per 1M off-peak, at parity with DeepSeek direct, with peak
exactly double during Monday–Friday 01:00–04:00 and 06:00–10:00 UTC. Recorded at the off-peak tier,
matching the DeepSeek-direct row and for the same reason — a real tier rather than a blend.

The DeepSeek-direct row's `Comments` said "No OpenRouter cost row is recorded"; that sentence is now
removed, since it would otherwise contradict the row sitting beside it.

Worth noting for capacity planning rather than pricing: OpenRouter reported **1T tokens in the first
24 hours** for this model, **90% of them cache reads**, which is what makes the $0.003 cache-read
rate the number that actually matters on agentic workloads.

Sources: <https://openrouter.ai/deepseek/deepseek-v4.1-flash> ·
<https://www.eesel.ai/blog/deepseek-v4-1-flash-pricing> ·
<https://dataconomy.com/2026/09/11/deepseek-v4-1-flash-ultralow-token-pricing/>

### Checked and unchanged

Anthropic (Fable 5.1 / Mythos 5.1 hold $10/$50 with the $0.25 cache read), Google (Gemini 3.8 Flash
holds $0.75/$3.75 through 2026-12-31), Mistral (September funding round did not move the rate card),
Alibaba/Qwen (Qwen3.8-Max $2/$6, Qwen3.8-Flash $0.14/$0.42), Moonshot, MiniMax, Z.AI, Cohere,
NVIDIA, Black Forest Labs, Inception Labs, Thinking Machines Lab, Groq, Cerebras, Fireworks.ai,
Amazon Bedrock, Azure.

---

## Model Updates & New Versions

### GLM 5.3 — OpenRouter context window corrected *(APPLIED)*

Open since 2026-09-07 as "verify against OpenRouter's listing before changing it". Verified:
OpenRouter serves `z-ai/glm-5.3` with a **1,310,720-token** context window, not the 200,000 our row
recorded. `MaxInputTokens` is updated accordingly.

`MaxOutputTokens` is **left at 128,000**. OpenRouter's listing reports a maximum completion length of
1,048,576, but Z.AI's own documentation says 128K and the Z.AI-direct row in our metadata already
uses 128K. Where a gateway's advertised ceiling and the model developer's documented one disagree,
the developer's figure is the safer one to serve to a caller. Flagged below rather than changed.

The same record's Description also still read "AS OF 2026-08-24: no per-token API rate has been
published" — three weeks after the rate card was posted and one week after we recorded it. That text
is refreshed to state the actual $1.40/$4.40/$0.26 card and its 2026-08-19 effective date.

Sources: <https://openrouter.ai/z-ai/glm-5.3> · <https://docs.z.ai/guides/llm/glm-5.3>

### DeepSeek V4 Flash Vision Experimental — item closed, nothing to do

Carried since 2026-08-31 as "decide the modelling for `DeepSeek V4 Flash Vision Experimental`". A
search of `.ai-models.json` finds **no record by that name** — the model was discussed in reports but
never entered the inventory. With native vision now in mainline `deepseek-flash`, there is nothing
to add and nothing to retire. **Item closed.**

### x.ai — Grok 4.7 still has not shipped

xAI's newest model remains **Grok 4.6** (2026-08-12; $2/$6 below 200K prompt tokens, $4/$12 above,
cache read $0.50/$1.00). Musk posted on Sept 1 that 4.7 was "10 days" out, which pointed at Sept 11;
on Sept 11 he wrote it "needs a few more days to cook". No model card, context window, rate card or
API identifier exists. That is a **fourth** missed date.

Sources: <https://cellcog.ai/blog/grok-4-7-release-date/> · <https://benchlm.ai/xai/api-pricing>

---

## Deprecated / Sunset Models

**Nothing was expired this week** — but the largest retirement wave of the year lands in six weeks,
and it hits models we carry as `Active`.

### OpenAI's 2026-10-23 shutdown — *flagged, not applied*

OpenAI's April 22 deprecation notice covers 25+ model ids across two hard shutdown dates, July 23
(passed) and **2026-10-23**. The October tranche removes the GPT-3.5 Turbo line, GPT-4 and GPT-4
Turbo, GPT-4.1 nano, the original May 2024 GPT-4o snapshot, the first GPT image model, and the
**o1, o1-pro, o3-mini and o4-mini** reasoning models, plus fine-tunes built on several of those
bases. After that date, calls to the affected ids return errors.

Cross-referencing against our inventory, these records carry an `Active` OpenAI Inference Provider
row today and will need the §0.2 treatment **on or after 2026-10-23**:

| Our record | API id | Notes |
|---|---|---|
| `o1` | `o1` | OpenAI + Azure + OpenRouter rows, all Active; OpenAI and Azure cost rows at $15/$60 |
| `o1-pro` | `o1-pro` | OpenAI rows only, no cost record |
| `o3-mini` | `o3-mini` | OpenAI + Azure + OpenRouter; cost rows at $1.10/$4.40 |
| `o4-mini` | `o4-mini` | OpenAI + Azure + OpenRouter; Azure cost row at $1.10/$4.40 |
| `GPT 4.1 Nano` | `gpt-4.1-nano` | **Verify before acting** — see caveat |
| `GPT 4o` | `gpt-4o` | **Verify before acting** — see caveat |

**They are deliberately not touched now.** All of them still serve today; expiring a live route six
weeks early would make the metadata wrong in the other direction. This is a calendar item for the
run of 2026-10-26 or later.

**Caveat on the last two rows, and it matters.** Sources disagree about scope. One states flatly that
"GPT-4o … GPT-4.1 nano … all fail from this date"; another, more precisely worded, says the tranche
removes only "the original May 2024 GPT-4o snapshot". Those cannot both be true of the undated
`gpt-4o` alias, and `gpt-4.1-nano` is a current-generation model whose inclusion would be surprising.
Whoever applies this in late October must confirm the exact id list against OpenAI's own deprecations
page — and Azure and OpenRouter set their own schedules, so those rows do not follow automatically.

### OpenAI `o3` — API retirement is 2026-12-11, not August

Worth recording because it is easy to get wrong. `o3` was retired **from ChatGPT** on 2026-08-26,
which several trackers report as "o3 retired". The **API** shutdown is **2026-12-11**, announced to
developers on 2026-06-11, with `gpt-5.6-sol` as the named replacement. Our `o3` record's Active rows
are therefore correct today. Calendar item for December.

### OpenAI Sora 2 — removed from the API 2026-09-24

Ten days out. **Not in our inventory**, so no action; noted so a future run does not re-research it.

Sources: <https://developers.openai.com/api/docs/deprecations> ·
<https://therouter.ai/news/openai-legacy-model-deprecation-wave-july-october-2026/> ·
<https://benchr.org/deprecations> · <https://llmlatency.dev/deprecations/openai> ·
<https://andrew.ooo/answers/o3-retired-august-26-2026-what-to-use-instead/>

---

## New Vendors Worth Considering

**Sakana AI — added.** See the New Models section: Model Developer role only, `API Key` credential
type, inference through OpenRouter.

Nothing else clears the bar. Checked and skipped:

- **Cohere North Mini Code** — a 30B-total/3B-active Apache-2.0 agentic coding MoE, 256K context,
  64K output, scoring 80.2% on SWE-Bench Verified. Cohere is **already** a vendor, so this is a model
  question, not a vendor one — and it surfaced this week only because of a benchmark write-up; the
  model itself shipped in **June 2026**, so it is not a this-week release. It is also listed at
  **$0.00/$0.00** on OpenRouter's free endpoint, which our cost schema would record as a zero-price
  row that says nothing about the paid Cohere-API rate. Worth a deliberate decision next week rather
  than a rushed row. See Recommended Action 8.
- **NVIDIA Nemotron Coalition** (Black Forest Labs, Cursor, LangChain, Mistral AI, Perplexity,
  Reflection AI, Sarvam, Thinking Machines Lab) — an announced collaboration whose first model will
  underpin **Nemotron 4**. No model, no id, no rate card yet. Nothing to add; watch for Nemotron 4.

---

## Recommended Actions

Items 1–5 are this week's; 6–13 are carried forward, and the carry-forward list has now been long
enough for three consecutive weeks that a deliberate triage session is overdue.

1. **[Applied]** Add `Sakana AI` as a vendor and `Fugu Max` + `Fugu Ultra v2` as models, Model-
   Developer-only with OpenRouter inference and one cost row each. Closes the Sakana item from
   2026-09-13.
2. **[Applied]** Correct `GPT 5.6` (Sol) pricing — expire the $5/$30 row at 2026-08-21, add the
   $4/$20 row with $0.40 cache read. Closes the Sol pricing conflict open since 2026-08-31.
   **Re-check on 2026-11-21**, when OpenAI's promotional commitment ends.
3. **[Applied]** Add the `DeepSeek V4.1 Flash` OpenRouter cost row at $0.15/$0.60 off-peak, $0.003
   cache read. Closes the follow-up from 2026-09-13.
4. **[Applied]** Correct the `GLM 5.3` OpenRouter `MaxInputTokens` to 1,310,720 and refresh the
   model Description, which still claimed no rate card existed. Closes the item from 2026-09-07.
5. **[Closed, no action]** `DeepSeek V4 Flash Vision Experimental` has no record in the inventory;
   with vision in mainline `deepseek-flash` there is nothing to model. Remove from future carry-
   forward lists.
6. **[Calendar — 2026-10-26 or later]** Apply §0.2 to the OpenAI 2026-10-23 tranche: `o1`, `o1-pro`,
   `o3-mini`, `o4-mini`, and — **only after confirming the exact id list against OpenAI's own
   deprecations page** — possibly `GPT 4.1 Nano` and `GPT 4o`. Azure and OpenRouter rows do not
   follow automatically.
7. **[Calendar — 2026-12-12 or later]** Apply §0.2 to `o3` on OpenAI direct.
8. **[Flagged]** **Cohere North Mini Code** — decide whether MJ records models whose only confirmed
   public rate is $0.00 on a gateway's free endpoint. The same question will recur; answering it once
   is worth more than answering it for this model.
9. **[Flagged — fourth slip]** **Grok 4.7.** Nothing shipped. Separately, **Grok 4.6 is in Microsoft
   Foundry** (500K context) and an Azure vendor row could be added once Foundry pricing is confirmed —
   that half of the item is actionable independently of 4.7 and has been carried three weeks.
10. **[Flagged — carried]** **The image/video/audio cost-schema decision.** Now blocking four
    separate things: `GPT Image 2.5 Flare` and `Sunburst` ($8/$30, 2026-09-08), the **FLUX 3** family
    refresh (shipped 2026-07-23; our two FLUX records still carry `StartedAt` 2025-10-01), and
    **Gemini Omni 1.1 Flash** (GA 2026-08-27, `gemini-omni-1.1-flash`), which prices *text* output at
    $9/1M and *video* output at $17.50/1M against a single $1.50/1M input — two output rates our
    one-`OutputPricePerUnit` schema cannot express. Also unmodellable today: **Gemini 3.5 Transcribe**
    (speech-to-text). Decide the schema once and apply it to all of them together.
11. **[Flagged — carried]** **Claude Mythos 5.1** and OpenAI's **Daybreak Red / Daybreak Blue**:
    gated-access variants. One human decision covers all three — does MJ model gated-access models at
    all? Open since 2026-08-31.
12. **[Flagged — carried]** **`Claude 4 Opus` / `Claude 4 Sonnet` cost-row cleanup.** Both retired on
    the Anthropic API 2026-06-15; each carries three duplicate rows at apparent batch rates. Fix the
    prices *first*, then expire — the other order preserves the bad data permanently.
13. **[Flagged — new, systemic]** **Concurrent `Active` cost rows on the same model+vendor.** Noticed
    while fixing Sol: `GPT 5.6-terra` and `GPT 5.6-luna` each carry two `Active` OpenAI rows (the
    2026-07-10 launch rate and the 2026-07-30 cut), and `DeepSeek V4 Pro` carries **three**. Nothing
    expires the superseded ones, so any consumer reading "the current price" gets an arbitrary pick.
    Sol was fixed here because its live figure was flatly wrong; the rest were left alone because
    this is a convention question across dozens of records, not a one-off error, and fixing two of
    many would make the file *less* consistent. Worth one deliberate pass. Related: `o1-mini` has an
    `Inactive` OpenAI vendor row but its cost row is still `Active` with no `EndedAt`.
14. **[Flagged — carried]** **`DeepSeek V4 Pro` cost reconciliation** (2026-08-16, $0.66/$1.98 —
    matches neither the off-peak nor the peak tier); **`GLM 5.3` OpenRouter max output** (our 128,000
    vs OpenRouter's advertised 1,048,576 — see Model Updates); **Muse Spark Contributor tier**
    ($0.10/$0.20, grants Meta training rights over submitted data — a governance call) and a
    first-party Meta route needing a `MetaLLM` driver class.

---

## A discrepancy between two instruction files, for a human to reconcile

The routine prompt's Deliverable 2 states as a **CRITICAL formatting rule**: *"Do NOT include
`primaryKey` or `sync` objects — these are auto-generated by mj-sync."*

`metadata/CLAUDE.md` §1 states the opposite for half of that: *"`primaryKey`: New records **SHOULD**
include a `primaryKey` with a hardcoded UUID generated at the CLI with `uuidgen` … so the record gets
the same deterministic ID in every environment."* Both agree that `sync` must never be authored.

The routine's own §0.6 says `metadata/CLAUDE.md` wins when the two disagree, so **this run includes
`primaryKey` on the eleven new records and no `sync` anywhere.** `uuidgen` is not installed in this
environment, so the UUIDs come from Node's `crypto.randomUUID()`, which is the same RFC-4122 v4
CSPRNG output — the rule's intent ("never invent/infer a UUID by hand") is satisfied. Each of the
eleven was verified to appear exactly once across all of `metadata/`.

This is a change from the last several weekly runs, which followed the routine prompt and omitted
`primaryKey`; the release-time `mj sync push` then assigned IDs and wrote them back. Both approaches
work, but the difference is not cosmetic: hand-assigned IDs are stable across environments and
machine-assigned ones are not.

**Resolved on review (2026-09-15).** cadam11 confirmed on PR #4474 that the metadata this run
produced is correct and that including `primaryKey` is the right call — every one of the existing
records in `.ai-models.json` already carries one after a push, so this is the first run whose output
matches what the file actually looks like. Per that review, the three contradicting lines in
`reports/ai-model-research/ROUTINE_PROMPT.md` are corrected **on this branch** to require a
`uuidgen` `primaryKey` (or `crypto.randomUUID()` where `uuidgen` is unavailable) and to keep the
prohibition on hand-authored `sync` blocks. The two example JSON blocks are updated to match, so the
rule and its example no longer disagree. The copy of this prompt held by the scheduler is **not** a
repo file and must be updated separately by its owner.

---

## Verification

`mj sync validate` needs a database and cannot run in this environment. The §0.3 pure-JSON pre-flight
was run against both model files after every edit and prints **`OK`**:

- every `MJ: AI Model Vendors` `Status` ∈ {Active, Inactive, Deprecated, Preview}
- every `MJ: AI Model Costs` `Status` ∈ {Active, Pending, Expired, Invalid}
- every `Expired` cost row carries an `EndedAt`, and every `EndedAt` > its `StartedAt`

Additionally verified:

- Every `@lookup:MJ: AI Vendors.Name=…` in both model files resolves to a row in `.ai-vendors.json`,
  including the new `Sakana AI` row — **none missing**.
- No `sync`, `__mj_CreatedAt`, `__mj_UpdatedAt`, `CreatedAt` or `UpdatedAt` key was written on any
  record.
- All eleven new `primaryKey` UUIDs are unique across `metadata/` (checked by grep, one occurrence
  each). Twelve duplicate `primaryKey` values do exist in these files, but all twelve are present on
  `origin/next` unchanged and none is one of the new ones.
- Both edited files re-serialize **byte-identically** at two-space indent, so the diff contains only
  intended changes: 9 hunks, +222/−5 lines across two files.
- `npm run check:changeset` — the changeset is `minor`, correct for a `metadata/` branch.

---

## Research Sources

**OpenAI**
- <https://developers.openai.com/api/docs/models/gpt-5.6-sol>
- <https://developers.openai.com/api/docs/deprecations>
- <https://techjacksolutions.com/ai-brief/openai-gpt-5-6-sol-api-price-cut-20-percent-november-2026/>
- <https://cellcog.ai/blog/gpt-5-6-pricing/>
- <https://enterprisedna.co/resources/news/openai-gpt-56-sol-price-cut-20-percent-frontier-model-august-2026/>
- <https://therouter.ai/news/openai-legacy-model-deprecation-wave-july-october-2026/>
- <https://andrew.ooo/answers/o3-retired-august-26-2026-what-to-use-instead/>
- <https://benchr.org/deprecations>
- <https://llmlatency.dev/deprecations/openai>
- <https://www.cloudzero.com/blog/openai-pricing/>

**Sakana AI**
- <https://openrouter.ai/sakana/fugu-max>
- <https://openrouter.ai/sakana/fugu-ultra-v2>
- <https://www.marktechpost.com/2026/09/10/sakana-ai-launches-fugu-max-and-fugu-ultra-v2-for-cheaper-stronger-multi-agent-orchestration/>
- <https://datanorth.ai/news/sakana-ai-launches-fugu-max-and-fugu-ultra-v2>
- <https://tokencost.app/blog/sakana-fugu-max-pricing-orchestration-tokens>
- <https://aicybr.com/blog/sakana-fugu-max-ultra-v2-orchestration-pricing-api>
- <https://theroboticsmedia.com/article/sakana-ai-fugu-ultra-v2-0-1m-context-multi-agent-orchestration-september-11-2026>
- <https://pondero.ai/news/2026-09-12-sakana-fugu-max-ultra-v2/>

**DeepSeek**
- <https://openrouter.ai/deepseek/deepseek-v4.1-flash>
- <https://www.eesel.ai/blog/deepseek-v4-1-flash-pricing>
- <https://dataconomy.com/2026/09/11/deepseek-v4-1-flash-ultralow-token-pricing/>

**Z.AI / Zhipu**
- <https://openrouter.ai/z-ai/glm-5.3>
- <https://docs.z.ai/guides/llm/glm-5.3>

**x.ai**
- <https://cellcog.ai/blog/grok-4-7-release-date/>
- <https://benchlm.ai/xai/api-pricing>
- <https://mem0.ai/blog/xai-grok-api-pricing>

**Google**
- <https://ai.google.dev/gemini-api/docs/changelog>
- <https://www.eesel.ai/blog/gemini-omni-1-1-flash-pricing>
- <https://benchlm.ai/google/api-pricing>

**Other vendors checked (no change)**
- <https://benchlm.ai/alibaba/api-pricing>
- <https://benchlm.ai/mistral/api-pricing>
- <https://releasebot.io/updates/mistral>
- <https://tech-insider.org/ca/cohere-north-mini-code-2026/>
- <https://nvidianews.nvidia.com/news/nvidia-launches-nemotron-coalition-of-leading-global-ai-labs-to-advance-open-frontier-models>
- <https://bfl.ai/blog/flux-3>
- <https://www.eesel.ai/blog/groq-pricing>
- <https://pricepertoken.com/pricing-page/provider/fireworks>
- <https://llmgateway.io/timeline>
- <https://llm-stats.com/llm-updates>
- <https://www.digitalapplied.com/blog/ai-model-releases-september-2026-tracker>
