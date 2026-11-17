# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-11-09
**Research Period**: 2026-11-02 → 2026-11-09
**Base Branch**: `next`
**Research Branch**: `claude/magical-turing-m5v0x0`

> **Branch-name note.** The routine template asks for `claude/ai-model-research-2026-11-09`. This
> session was assigned `claude/magical-turing-m5v0x0` by its harness, which instructs that pushes go
> to that branch only. The assigned branch wins; nothing else about the routine changed.

> **⚠ The firing prompt is still stale against the repo copy — a human needs to reconcile them.**
> This is the same divergence [2026-11-02](2026-11-02-weekly-report.md) reported, unchanged a week
> later. `reports/ai-model-research/ROUTINE_PROMPT.md` carries **two sections the fired prompt does
> not**: **§0.6** (every LLM must state `ModelConfiguration.LLM.SupportsNativeToolCalling`, enforced
> by a test that fails the build) and **§0.7** (seven *standing decisions* dated 2026-10-20 that are
> to be applied, not re-flagged). The fired prompt's §0.6 is the repo's §0.8.
>
> **Both omissions changed this run's output again.** Standing decision 1 is the entire reason the
> two Claude Mythos models below are *added* rather than flagged — the fired prompt gives no
> convention for limited-availability models, and MJ's own Fable 5.1 description still says Mythos
> 5.1 "is therefore NOT modelled here", a decision §0.7 reversed. And §0.6 is a build-gating
> requirement a new LLM would otherwise miss. The repo copy is newer and more correct; the trigger's
> stored prompt should be refreshed from it. **Two weeks is long enough — this is now the oldest
> unactioned item in this report.**

---

## Executive Summary

Four models are added and one dated price cutover is encoded, all from first-party rate cards.
**Claude Mythos 5 and Claude Mythos 5.1 were missing from MJ entirely** — not through oversight but
because MJ's own metadata says they were deliberately excluded for being limited-availability, a
judgement that standing decision 1 (2026-10-20) reversed three weeks ago and nobody had applied.
Both are listed `Active` on Anthropic's own deprecations page with published rate cards, so they get
full records with their inference routes at `Preview`. **GPT Image 2.6 Sunburst and Flare** launched
on 2026-11-04 and are added at OpenAI's published token rates, which standing decision 3 finally
makes representable. And **Gemini 3.8 Flash's introductory window** now closes automatically on
2027-01-01 with $1.50/$7.50 successor rows, the same shape proven on Gemini 4 Argon last week — the
old row's own `Comments` had been carrying a to-do for a human since September.

Nothing was deprecated this week. Anthropic's full list price table was re-verified against MJ and
matches on every model MJ carries. One carried item is **retired as factually wrong**: the claim
that `OpenAIAudioGenerator` is registered nowhere — it is registered twice, against both
`BaseAudioGenerator` and `BaseSpeechToText`.

### Research-channel status — mostly unchanged, one improvement

Direct outbound HTTPS to vendor documentation hosts is still blocked by the environment's network
policy, exactly as 2026-11-02 reported. **One host now resolves: `platform.claude.com` returns 200**,
which is why the Anthropic verification in this report is a direct read of the rate card rather than
a search synthesis — and that direct read is what surfaced the Mythos gap.

| Channel | Status this run |
|---|---|
| `platform.claude.com` (pricing + deprecations) | **Working, direct fetch** — full model table and lifecycle table read verbatim |
| WebSearch (standard + extended) | Working; reaches first-party pages server-side. The channel for everything else. |
| `openrouter.ai/api/v1/models` | **Blocked** — 403 CONNECT (proxy policy denial). No route sweep, second week running. |
| `ai.google.dev` | Blocked direct (`ENOTFOUND`); read via WebSearch |
| `developers.openai.com` | Blocked direct; read via WebSearch (quoted the pricing page for GPT Image 2.6) |
| `console.groq.com`, `docs.mistral.ai`, `platform.openai.com`, `api-docs.deepseek.com`, `docs.anthropic.com` | Blocked direct; WebSearch only |
| Alibaba Model Studio pricing | Not reached by either channel — carried item 10 stays open a third week |
| AWS Bedrock model cards | Not reached by either channel — carried item 9 stays open |

**The concrete consequence is the same as last week: there was no route sweep.** The OpenRouter
models API is how earlier runs enumerated new routes across every open-weight vendor at once.
Without it, coverage is "the vendors we thought to ask about by name", and the per-vendor searches
below returned tracker aggregators that contradict each other on model names and dates. Several
plausible new models (listed under "Flagged") could not be added for exactly this reason: no
first-party identifier or price.

### Driver-registration check

This run adds **four inference routes** on two driver classes, both registered:

- `AnthropicLLM` — `@RegisterClass(BaseLLM, 'AnthropicLLM')`. Not in the `DRIVERS_WITHOUT_TOOLS` list
  in `packages/AI/Core/src/__tests__/modelConfiguration.test.ts`, so `SupportsNativeToolCalling: true`
  on the two Mythos records is consistent. Both routes are `Preview`, not `Active`, so the test's
  second assertion does not even engage.
- `OpenAIImageGenerator` — `@RegisterClass(BaseImageGenerator, 'OpenAIImageGenerator')`. Image
  Generator records are outside §0.6's scope (it filters on model type `LLM`).

No new driver class is introduced.

---

## Current Inventory Snapshot

After this run's edits: **236 model records** (193 with `IsActive: true`), **685 vendor rows**,
**337 cost rows**, across **31 vendors**.

By model type: LLM 185, Realtime 16, Embeddings 12, Image Generator 12, TTS 5, Speech to Text 3,
Video 2, Reranker 1.

Inference routes by vendor (total / `Active`):

| Vendor | Inference routes | Active | Last touched by this routine |
|---|---|---|---|
| OpenRouter | 131 | 120 | 2026-11-02 |
| OpenAI | 50 | 42 | **2026-11-09 (this run — GPT Image 2.6 ×2)** |
| Google | 29 | 21 | **2026-11-09 (this run — Gemini 3.8 Flash cutover)** |
| Azure | 28 | 27 | 2026-10-26 |
| Anthropic | 26 | 13 | **2026-11-09 (this run — Mythos 5, Mythos 5.1)** |
| Amazon Bedrock | 25 | 25 | 2026-11-01 |
| Vertex AI | 24 | 18 | **2026-11-09 (this run — Gemini 3.8 Flash cutover)** |
| Groq | 18 | 9 | 2026-11-02 |
| x.ai | 15 | 15 | 2026-10-26 |
| Fireworks.ai | 15 | 14 | 2026-10-19 |
| Mistral AI | 14 | 11 | 2026-11-01 |
| Cerebras | 11 | 1 | 2026-08-17 |
| Alibaba Cloud | 10 | 10 | 2026-10-26 |
| LM Studio / Z.AI | 7 / 7 | 7 / 7 | 2026-10-26 |
| LocalEmbeddings / Eleven Labs / Moonshot AI | 6 / 6 / 6 | 6 / 6 / 5 | 2026-11-01 |
| MiniMax | 5 | 5 | 2026-10-19 |
| Black Forest Labs | 4 | 4 | 2026-10-12 |
| Inception Labs / DeepSeek / Cohere | 3 each | 3 each | 2026-10-05 |
| Tasio Labs, HeyGen, AssemblyAI, Inworld, Hugging Face, DeepInfra, SiliconFlow, MemberJunction | 1 each | 1 each | various |

Note the `Anthropic` row: 26 routes but only 13 `Active`. That is correct — it is a long lifecycle
history (retired 3.x and 4.x models) plus, as of this run, two `Preview` Mythos routes.

---

## New Models Available

### 1. Claude Mythos 5.1 — ADDED (route at `Preview`)

| Field | Value |
|---|---|
| API identifier | `claude-mythos-5-1` |
| Vendor | Anthropic (developer + inference) |
| Driver | `AnthropicLLM` |
| Context | 1,000,000 input / 128,000 output |
| Price | $10.00 / $50.00 per 1M; cache read/refresh $0.25/1M; 5-min cache write $12.50/1M; 1-hour write $20/1M |
| Lifecycle | **Active** on the Claude API; tentative retirement not sooner than 2027-09-01 |
| Ranks assigned | PowerRank 27, SpeedRank 6, CostRank 10 (identical to Claude Fable 5.1) |

Mythos 5.1 is the Mythos-class companion to Fable 5.1, released 2026-09-01: same specifications and
the same rate card, **without** Fable's safety-classifier routing layer. Access runs through
Anthropic's Cyber Verification and Life Sciences Verification programs (Project Glasswing) rather
than general API signup, which is exactly the situation standing decision 1 governs — so the
Inference Provider row is `Preview` (never auto-selected; a customer with access flips it to
`Active`) while the cost row is `Active` at the published price.

**Why this was missing**: MJ's Claude Fable 5.1 description states Mythos 5.1 "is therefore NOT
modelled here". That was a correct call under the conventions in force when it was written
(2026-09-10) and was superseded by standing decision 1 on 2026-10-20 — which names Claude Mythos 5.1
by name as its worked example. The exclusion survived three weekly runs because no run read
Anthropic's rate card directly; `platform.claude.com` only became reachable again this week.

Source: <https://platform.claude.com/docs/en/about-claude/pricing> (model table, read directly) ;
<https://platform.claude.com/docs/en/about-claude/model-deprecations> (lifecycle table, read directly).

### 2. Claude Mythos 5 — ADDED (route at `Preview`)

| Field | Value |
|---|---|
| API identifier | `claude-mythos-5` |
| Vendor | Anthropic (developer + inference) |
| Driver | `AnthropicLLM` |
| Context | 1,000,000 input / 128,000 output |
| Price | $10.00 / $50.00 per 1M; cache read/refresh $1.00/1M; 5-min cache write $12.50/1M; 1-hour write $20/1M |
| Lifecycle | **Active** on the Claude API; tentative retirement not sooner than 2027-06-09 |
| Ranks assigned | PowerRank 26, SpeedRank 6, CostRank 10 (identical to Claude Fable 5) |

The predecessor generation, released 2026-06-09 alongside Fable 5, same arrangement. `PriorVersionID`
on Mythos 5.1 points at this record; Mythos 5 itself has no `PriorVersionID`, because its own
predecessor (`claude-mythos-preview`, Deprecated since 2026-06-09) is not in MJ and is not worth
adding.

The cache-read rate is the one figure that differs between the two: $1.00/1M on Mythos 5 versus
$0.25/1M on Mythos 5.1 — the same 75% cut Fable 5 → Fable 5.1 got, and the headline change of that
generation.

Same sources as above.

### 3. GPT Image 2.6 Sunburst — ADDED

| Field | Value |
|---|---|
| API identifier | `gpt-image-2.6-sunburst` |
| Vendor | OpenAI (developer + inference) |
| Driver | `OpenAIImageGenerator` |
| Price (as recorded) | `Tokens` / `Per 1M Tokens`: input $5.00 (text input), output $30.00 (image output), cache read $2.00 (cached image input) |
| Other published rates | image input $8.00/1M (in `Comments`); batch half rate on every meter |
| Ranks assigned | PowerRank 21, SpeedRank 7, CostRank 8 |

### 4. GPT Image 2.6 Flare — ADDED

| Field | Value |
|---|---|
| API identifier | `gpt-image-2.6-flare` |
| Price | Identical to Sunburst on every meter |
| Ranks assigned | PowerRank 20, SpeedRank 9, CostRank 8 |

Released 2026-11-04 as the engine behind ChatGPT Images 2.6. Sunburst is the detail/consistency
variant; Flare trades detail for speed (reported ~50% faster than GPT Image 2.5). New in 2.6:
animated GIF output, SVG export, markup-guided edits, and a `complexity` parameter defaulting to
high. Quality settings low/medium/high/xhigh/max.

**Two routine-specific notes:**

- **Standing decision 3 is what made these addable.** They are billed per token, so the cost rows
  use `Tokens` / `Per 1M Tokens` with input = the text-input rate and output = the media-output rate,
  and every other meter goes in `Comments`. No representative per-image figure was computed. This
  also closes the long-carried "`gpt-image-2.5-sunburst` / `-flare` still unpriced" item, by
  superseding it: MJ never carried the 2.5 generation and now does not need to, since 2.6 is a
  drop-in at identical rates. `PriorVersionID` therefore points at `GPT Image 2`, the newest image
  model MJ does carry.
- **`MaxInputTokens` is deliberately left unset.** The only context figure found anywhere was 400K,
  from Flare's OpenRouter listing — third-party, and found for Flare only. Guessing one number and
  mirroring it onto Sunburst would be inventing data; an unset advisory limit is the honest record.
  Flagged below as a one-line fix for whoever next reaches `developers.openai.com`.

Source: <https://developers.openai.com/api/docs/pricing> and
<https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst> (both read via server-side
search; the host is not directly reachable from this environment).

---

## Pricing Changes Detected

| Model | Vendor | Previous (In/Out) | New (In/Out) | Change | Effective | Applied |
|---|---|---|---|---|---|---|
| Gemini 3.8 Flash | Google | $0.75 / $3.75 | $1.50 / $7.50 | **+100%** both meters | 2027-01-01 | ✅ dated rows |
| Gemini 3.8 Flash | Vertex AI | $0.75 / $3.75 | $1.50 / $7.50 | **+100%** both meters | 2027-01-01 | ✅ dated rows |

Cached input doubles with them, $0.075 → $0.15/1M. Batch doubles correspondingly, $0.375/$1.875 →
$0.75/$3.75 (recorded in `Comments`, not modelled as its own row).

**How it is encoded**, following the Gemini 4 Argon precedent set last week: the two introductory
rows keep `Status: "Active"` and gain `"EndedAt": "2027-01-01T00:00:00.000Z"`; two new `Active` rows
start at that instant with the standard rates. `BaseAIEngine`'s selection predicate is
`Status = 'Active' AND (StartedAt is null OR StartedAt <= now) AND (EndedAt is null OR EndedAt > now)`,
so the cutover is automatic and needs no future edit.

This replaces a literal to-do that had been sitting in the row's own `Comments` since 2026-09-10:
*"A reviewer should expire this row and add a standard-rate row before the intro window closes."*

**Verified by evaluating that predicate against the edited file** — exactly one row is selected at
every point tested, with no gap and no ambiguous overlap:

| Instant | Google | Vertex AI |
|---|---|---|
| 2026-11-09 (today) | $0.75/$3.75 | $0.75/$3.75 |
| 2026-12-31 23:00Z | $0.75/$3.75 | $0.75/$3.75 |
| 2027-01-01 00:00Z | $1.50/$7.50 | $1.50/$7.50 |
| 2027-06-01 | $1.50/$7.50 | $1.50/$7.50 |

Gemini 4 Argon's cutover (encoded last week) was re-verified at the same time and still behaves:
$2/$10 through 2026-11-30, $4/$20 from 2026-12-01.

### Prices verified with no change needed

**Anthropic's complete list price table was read directly and matches MJ on every model MJ carries**
— Fable 5.1 ($10/$50), Fable 5 ($10/$50), Opus 5.5 ($4/$20), Opus 5 / 4.8 / 4.7 / 4.6 / 4.5
($5/$25), Sonnet 5.5 ($2/$10), Sonnet 5 ($2/$10), Sonnet 4.6 / 4.5 ($3/$15), Haiku 5.5 ($0.10/$0.50
base tier), Haiku 4.5 ($1/$5). The Haiku 5.5 >100K-token tier ($0.50/$2.50) is already recorded in
`Comments` per standing decision 6.

---

## Model Updates & New Versions

Nothing applied. Two candidates were examined and rejected:

- **`deepseek-v4-flash-0731`** — one tracker (LLM Gateway) dates a DeepSeek snapshot to 2026-11-05.
  Under standing decision 2 this would be an `APIName` update on an existing record rather than a new
  model, but MJ's two DeepSeek Flash records already carry `deepseek-v4-flash` and `deepseek-flash`,
  and no first-party source confirms either a `-0731` suffix or which record it would belong to.
  Changing a live `APIName` on tracker evidence alone is exactly the edit that produces a silently
  dead route. Flagged.
- **`gemini-omni-1.1-flash` → `-1.2-flash`** — reported auto-routing from 2026-12-03, which would
  normally be a §0.2 deprecation. MJ carries neither model, so there is nothing to deprecate. See
  the flagged item on Omni below.

---

## Deprecated / Sunset Models

**No deprecation was applied this run.** Anthropic's deprecation history gained no new entry since
2026-09-30, and no other vendor's shutdown reached its date in this window.

### Reaching its date soon

| Model / route | Vendor | Retirement | Days out | Action when it arrives |
|---|---|---|---|---|
| `claude-sonnet-4-5-20250929` | Anthropic | **2026-11-30** | **21** | §0.2: Anthropic route → `Inactive`; its cost row → `Expired` + `EndedAt: 2026-11-30T00:00:00.000Z`. Bedrock and OpenRouter routes stay `Active`; model-level `IsActive` stays `true`. Replacement `claude-sonnet-5-5`. |

Re-confirmed directly this run: the MJ route is already marked `Deprecated` (correct for a deprecated-
but-live model) and the retirement date is unchanged at 2026-11-30. **The next run after that date
must apply the recipe** — it falls to the 2026-12-07 run. Note the date lands *between* weekly runs,
so MJ will carry a dead-but-`Deprecated` route for up to a week; that is the designed behaviour, not
a defect, because `Deprecated` routes are not auto-selected.

### Carried, past-shutdown, needs an engineer (not applied — unchanged from 2026-11-02)

Six Groq routes name models Groq has shut down. This still belongs in its own PR that first repoints
the test/prompt bindings, because the records are referenced by name elsewhere in the repo — which is
why a metadata-only research PR is the wrong vehicle. Full list and binding sites: the
["Deprecated / Sunset Models" section of 2026-11-02](2026-11-02-weekly-report.md).

---

## New Vendors Worth Considering

**None added.** No new vendor row was needed this run — every `@lookup:MJ: AI Vendors.Name=…` this
run introduces (`Anthropic`, `OpenAI`, `Google`, `Vertex AI`) already exists in
`metadata/ai-vendors/.ai-vendors.json`.

Two vendors are *mentioned* in flagged items but were not added, because a vendor row with no
addable model is dead weight: **Thinking Machines Lab** (Inkling 2 Small, no published API id or
price) and **Tencent** (Hy4, no published API id or price). Both already lack a row; add one only
when a model becomes addable.

---

## Recommended Actions

### Applied this run: 4 models, 1 price change (×2 vendors), 4 vendor rows, 6 cost rows, 2 rows window-closed, 0 deletions

1. **[Applied]** **Claude Mythos 5.1 added** — Anthropic developer row `Active`, inference route
   `Preview`, cost row `Active` at $10/$50 with $0.25 cache read. Per standing decision 1.
2. **[Applied]** **Claude Mythos 5 added** — same shape, $1.00 cache read. `PriorVersionID` on 5.1
   points here.
3. **[Applied]** **GPT Image 2.6 Sunburst added** — OpenAI route `Active`, `OpenAIImageGenerator`,
   cost row `Tokens`/`Per 1M Tokens` at $5/$30 with $2 cache read.
4. **[Applied]** **GPT Image 2.6 Flare added** — identical rates, speed-optimised variant.
5. **[Applied]** **Gemini 3.8 Flash post-introductory pricing** — Google and Vertex AI introductory
   rows window-closed at `2027-01-01` (kept `Active`, gained `EndedAt`); two new `Active` rows at
   $1.50/$7.50 with $0.15 cached. Cutover is automatic. Clears the to-do that had been sitting in the
   row's own `Comments` since September.
6. **[Verified, no change]** Anthropic's full list price table, read directly, matches MJ on every
   model. Gemini 4 Argon's 2026-12-01 cutover re-verified as correct.
7. **[Retired — factually wrong]** Carried item 13's extension, *"add `OpenAIAudioGenerator` to the
   list of drivers registered nowhere"*, is **false**. It is registered twice, in
   `packages/AI/Providers/OpenAI/src/models/tts.ts`:
   `@RegisterClass(BaseAudioGenerator, "OpenAIAudioGenerator")` and
   `@RegisterClass(BaseSpeechToText, "OpenAIAudioGenerator")`. MJ's `Whisper 1` and `OpenAI TTS`
   routes resolve. **The LLM half of item 13 still holds** and is re-confirmed: `MoonshotLLM`,
   `KimiLLM`, `QwenLLM`, `DeepSeekLLM` and `ZAILLM` are named on 24 first-party routes and registered
   nowhere (the registry does have `ZhipuLLM`, a different name). So the item is narrowed, not
   retired.

### Flagged, not applied

1. **[Flagged — deadline 2026-11-30, 21 days]** `claude-sonnet-4-5-20250929` retirement. Recipe in
   "Deprecated / Sunset Models" above; falls to the **2026-12-07** run.
2. **[Flagged — NEW, two minutes of work for anyone who can reach OpenAI's docs]** **GPT Image 2.6
   `MaxInputTokens`.** Left unset on both new routes because the only figure available was 400K from
   Flare's OpenRouter listing. One read of
   `developers.openai.com/api/docs/models/gpt-image-2.6-sunburst` settles both.
3. **[Flagged — NEW, no API identifier]** **GPT-6 Cyber.** Announced 2026-11-05, a security-research
   model rated Critical for cybersecurity under OpenAI's Preparedness Framework. Access is gated to
   select Daybreak Red customers behind identity verification, IP allowlisting and MFA. No published
   API model id and no published price, so standing decision 1 cannot help — a `Preview` route still
   needs an `APIName`. Re-check when OpenAI documents it.
4. **[Flagged — NEW, needs a driver]** **Gemini Omni 1.2 Flash** (`gemini-omni-1.2-flash`, GA
   2026-11-05, ~$0.07/second at 720p, 15-second video with audio, served on Google's Interactions API
   rather than `generateContent`). MJ has a `Video` model type and a `Per Second` price unit, so the
   schema fits — but the only registered video drivers are `HeyGenVideoGenerator` and
   `FLUX3VideoGenerator`. There is no Google video driver, so this would be an intentionally dead
   route. Same shape as the carried Nemotron 3.5 Transcribe item: both resolve the moment MJ gains
   the driver. Also note the reported auto-routing of Omni 1.1 → 1.2 on 2026-12-03, which matters
   only once MJ carries either.
5. **[Flagged — NEW, low confidence]** **`deepseek-v4-flash-0731`.** See "Model Updates" above. Needs
   one first-party read of DeepSeek's model list before any `APIName` is touched.
6. **[Flagged — NEW, no price or id]** **Inkling 2 Small** (Thinking Machines Lab, 2026-11-05) and
   **Tencent Hy4** (~2026-11-01). Corroborated across release trackers but with no first-party API
   identifier or rate card in reach. Also unverified: **Cohere Embed 5 Pro / Fast**, which appeared in
   one tracker with no date.
7. **[Flagged — NEW, price only]** **Qwen 3.8 27B's Groq rate.** Added last week without a cost row.
   Three aggregators now independently give $0.80/$4.00 per 1M for the Groq Preview tier, which is
   consistent, but **Groq removed its public pricing page in August 2026** and the rates now live only
   in developer docs that neither channel can reach. Still third-party-only, so still no cost row. If
   a human can reach `console.groq.com/docs/models`, this is a one-row fix.
8. **[Flagged — carried, now sharper]** **Qwen 3.7 Plus output price.** MJ holds **$0.40/$1.16**. The
   best-sourced figure this week — a page that reproduces Alibaba's Singapore pricing table, captured
   2026-10-31 — gives **$0.40/$1.60** list, with a limited-time 20% discount that would make it
   $0.32/$1.28 (matching OpenRouter's Alibaba endpoint), and a long-context tier above 256K input.
   **The input price matches exactly and the output price matches nothing**, and `1.16` is a digit
   transposition of `1.60`. That is now the leading hypothesis: MJ's row is most likely a typo, not a
   stale price. Still not corrected, because the evidence remains third-party and a wrong correction
   costs more than a wrong flag — but a human with one minute and the Model Studio page can settle a
   38% error in cost reporting. **Third week open.**
9. **[Flagged — carried, environment, blocks future runs]** **Vendor documentation hosts are blocked
   by the network policy.** `openrouter.ai` returns 403 CONNECT (proxy policy denial);
   `ai.google.dev`, `console.groq.com`, `platform.openai.com`, `developers.openai.com`,
   `docs.mistral.ai`, `api-docs.deepseek.com` and `docs.anthropic.com` all fail to resolve. Only
   `platform.claude.com` now works. **Without the OpenRouter models API there is no route sweep, so
   weekly coverage keeps degrading to "vendors we thought to ask about"** — and this run's flagged
   list is visibly longer for it. Either allow these hosts or confirm the restriction is intended.
   **Second week open.** Note the one improvement: `platform.claude.com` came back, and it is
   directly responsible for the two Mythos models in this PR. That is a concrete measure of what the
   other hosts are costing.
10. **[Flagged — carried, needs an engineer]** **Six Groq routes past shutdown.** Own PR, must
    repoint test/prompt bindings first.
11. **[Flagged — carried]** **GPT-6.1 Terra Bedrock price.** Route still has no cost row; needs the
    AWS model card (`model-card-openai-gpt-6-1-terra`). AWS unreachable again.
12. **[Flagged — carried, deadline 2027-02-26]** OpenAI retires `whisper-1` and the
    `gpt-4o-transcribe` family. MJ's `Whisper 1` OpenAI route is affected. Replacements
    `gpt-transcribe` / `gpt-live-transcribe` are not in MJ. **Partly good news**: item 7 above shows
    the `OpenAIAudioGenerator` driver does exist and is registered, so this is a model-id migration
    rather than blocked on driver work.
13. **[Flagged — carried, deadline 2027-01-14]** GPT-4o, GPT-4o mini, GPT-4.1 and GPT-4.1 mini leave
    the OpenAI API (replacement `gpt-6-luna`); `gpt-5.1`, `gpt-5.4-nano`, `gpt-5.3-codex` on
    2027-04-01; `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` on 2027-01-06. Not re-confirmed this run (the
    OpenAI deprecations page did not surface in this run's searches).
14. **[Flagged — carried, code]** Anthropic API version `2026-10-21` removes `temperature`, `top_p`
    and `top_k` (400 error) — affects `AnthropicLLM` and any prompt setting a temperature, once MJ
    moves to that version. **Re-confirmed directly this run** from the parameter-deprecation table on
    `platform.claude.com`.
15. **[Flagged — carried, unregistered drivers, now narrowed]** `MoonshotLLM`, `KimiLLM`, `QwenLLM`,
    `DeepSeekLLM`, `ZAILLM` on 24 first-party routes, registered nowhere. **`OpenAIAudioGenerator` is
    removed from this list** — see item 7. Every affected active model still resolves via a
    higher-`Priority` registered route (usually OpenRouter), so the symptom is a permanently unusable
    first-party route, not an outage.
16. **[Flagged — carried, still genuinely open]** MiniMax-M3 $0.60/$2.40 vs reported $0.30/$1.20;
    Cohere Command A+ possibly unpriceable at all; DeepSeek V4 Pro's three concurrent `Active` cost
    rows and V4 Flash's two; the three cost rows with no `StartedAt` (Whisper Large v3, Whisper Large
    v3 Turbo, Whisper 1); Claude Opus 4.1 model-level `IsActive: false` while its Bedrock and
    OpenRouter routes are live; Claude 3.5 Sonnet's unexpirable Anthropic row; Vertex
    `gemini-2.0-flash-001` / `-lite-001`; a `Decision` model type; Mistral Large 3 / Medium 3.5
    deprecated 2026-10-31 with retirement 2027-04-30 (apply §0.2 then); Kimi K2.6 / K2.7-Code
    deprecated on Moonshot with no shutdown date; Nemotron 3.5 Transcribe (needs an audio driver);
    the 42 non-OpenRouter `Active` routes with no `Active` cost row (OpenAI 7, LM Studio 7,
    LocalEmbeddings 6, Eleven Labs 6, Amazon Bedrock 3, Google 2, 11 others — the LM Studio and
    LocalEmbeddings ones are local and legitimately free).
17. **[Flagged — meta, oldest open item]** **The trigger's stored prompt is two weeks stale against
    `ROUTINE_PROMPT.md`.** See the banner at the top. It cannot be fixed by an agent — the Routine was
    created through the HTTP API, so a human must edit it in the Routines UI. Every week it stays
    stale, a run has to rediscover §0.7 by reading the repo copy, and a run that does not read the
    repo copy will flag settled questions and may miss the build-gating §0.6.

### Settled by §0.7 — not re-flagged

Per standing decisions 1–7 (2026-10-20): the limited-availability convention (decision 1 — **applied
twice this run**), pinned versions vs floating aliases (2), non-token billing units (3 — **applied
twice this run**), OpenRouter routes missing cost rows (4 — 120 of MJ's OpenRouter routes are
correctly unpriced), rank-scale recalibration (5), request-size and long-context price tiers plus the
Anthropic tokenizer discontinuity (6 — the Haiku 5.5 >100K tier and the Gemini batch rates are
recorded in `Comments` accordingly), and the eight duplicate `primaryKey` UUIDs across two different
tables (7).

---

## Verification performed on this branch

Stated precisely, because one of these is a replication rather than a real test run:

- **§0.3 pre-flight check — run, prints `OK`.** Both metadata files parse; every vendor `Status` and
  every cost `Status` is in its own entity's allowed set; no `Expired` row lacks `EndedAt`; no
  `EndedAt` is at or before its `StartedAt`. The two `Preview` vendor rows added this run are in
  `CK_AIModelVendor_Status`'s set; no cost row anywhere carries `Inactive`.
- **`primaryKey` / `sync` hygiene — run, passes.** All **1,291** records and nested children in
  `.ai-models.json` carry a `primaryKey`; all are well-formed UUIDs; **no duplicates within the
  file**. The 22 ids added this run were generated with a CSPRNG (`crypto.randomUUID`, uppercased) —
  `uuidgen` is not installed in this environment — and **no** new record carries a `sync` block, per
  `metadata/CLAUDE.md` §1.
- **`@lookup:` targets — checked mechanically.** Every `MJ: AI Vendors` and `MJ: AI Models` lookup in
  the whole file resolves against `.ai-vendors.json` / the models file itself. The one forward
  reference introduced (Mythos 5.1 → Mythos 5, added in the same push) is safe: `mj sync push`
  topologically sorts flattened records by dependency before saving
  (`packages/MetadataSync/src/lib/record-dependency-analyzer.ts`, `DependencyOrder`).
- **Cost-row selection — verified by evaluating `BaseAIEngine`'s real predicate against the edited
  file.** For Gemini 3.8 Flash, exactly one row is selected at 2026-11-09, 2026-12-31 23:00Z,
  2027-01-01 00:00Z and 2027-06-01, with the correct rate at each; Gemini 4 Argon re-verified at its
  own cutover. All four new models select their single `Active` cost row today.
- **§0.6 `SupportsNativeToolCalling` gate — assertions replicated, both pass; the test itself was
  NOT run.** `packages/AI/Core` has no `node_modules` in this environment, so `vitest` cannot start;
  a workspace install was out of proportion to a metadata-only change. The two assertions in
  `modelConfiguration.test.ts` read `.ai-models.json` directly, so they were re-implemented against
  the edited file: all **185** LLM records (183 before, +2 Mythos) state the flag as a boolean, and
  no `Active` vendor row resolves `true` on a driver in `DRIVERS_WITHOUT_TOOLS`. This is strong
  evidence, not a test run — **the Integration Tier and unit-test workflows on the PR are the real
  gate and should be read before merge** (§0.4).
- **`mj sync validate` — not run**, as the routine notes: it needs a database connection, which this
  environment does not have.

---

## Research Sources

**First-party, read directly:**

- Anthropic model pricing — <https://platform.claude.com/docs/en/about-claude/pricing>
- Anthropic model deprecations and lifecycle — <https://platform.claude.com/docs/en/about-claude/model-deprecations>
- Anthropic API parameter deprecations (`temperature` / `top_p` / `top_k` in version `2026-10-21`) — same page

**First-party, read via server-side search (host not directly reachable):**

- OpenAI API pricing — <https://developers.openai.com/api/docs/pricing>
- OpenAI GPT Image 2.6 Sunburst model page — <https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst>
- Gemini API pricing — <https://ai.google.dev/gemini-api/docs/pricing>
- Gemini 4 Argon "what's new" — <https://ai.google.dev/gemini-api/docs/latest-model>
- Groq supported models — <https://console.groq.com/docs/models>

**Secondary, used only for corroboration or for items that were flagged rather than applied:**

- GPT Image 2.6 coverage — <https://mlq.ai/news/openai-releases-images-26-with-gif-creation-and-new-api-controls/> ; <https://oimi.ai/en/blog/what-is-gpt-image-2-6> ; <https://argolink.io/en/blog/gpt-image-2-6-api-pricing>
- GPT Image 2.6 Flare route listing (400K context, 2026-11-04) — <https://openrouter.ai/openai/gpt-image-2.6-flare>
- Gemini 3.8 Flash 2027 rates — <https://ai-on-mac.com/articles/gemini-3-8-flash-pricing-api-benchmarks/> ; <https://www.eesel.ai/blog/gemini-3-8-flash-pricing> ; <https://www.layer3labs.io/guides/gemini-3-8-flash-pricing>
- GPT-6 Cyber — <https://thehackernews.com/2026/11/openai-launches-gpt-6-cyber-after-ai.html> ; <https://finance.yahoo.com/news/openai-launches-gpt-6-cyber-084819971.html>
- Gemini Omni 1.2 Flash — <https://www.marktechpost.com/2026/11/05/google-gemini-omni-1-2-flash-15-second-video/> ; <https://shattered.io/gemini-omni-1-2-flash-ga-15-second-video-0-07-per-second-2026/>
- Groq Qwen3.8 27B rate and catalogue changes — <https://www.maximem.ai/blog/groq-api-pricing-2026> ; <https://www.usagepricing.com/blueprint/activity/groq-2026-08-27-qwen-self-serve-pricing> ; <https://klymentiev.com/blog/groq-pricing>
- Qwen 3.7 Plus pricing — <https://www.usagepricing.com/blueprint/alibaba-cloud-model-studio> ; <https://openrouter.ai/qwen/qwen3.7-plus> ; <https://www.cloudzero.com/blog/qwen-api-pricing/>
- xAI Grok rates — <https://benchlm.ai/xai/api-pricing> ; <https://www.morphllm.com/grok-api-pricing>
- Chinese-lab price comparisons — <https://devtk.ai/en/blog/chinese-ai-models-api-pricing-2026/> ; <https://turiloop.com/blog/chinese-ai-model-api-pricing-2026>
- Release trackers (used only to generate candidates, never as a price source) — <https://llmgateway.io/timeline> ; <https://benchlm.ai/model-updates> ; <https://artificialwatch.com/releases/2026-11> ; <https://www.promptzone.com/ai-model-releases>

**Repo sources:**

- `packages/AI/Core/src/__tests__/modelConfiguration.test.ts` — the §0.6 gate and `DRIVERS_WITHOUT_TOOLS`
- `packages/AI/BaseAIEngine/src/BaseAIEngine.ts` — the cost-row selection predicate
- `packages/MetadataSync/src/lib/record-dependency-analyzer.ts` — push ordering for same-file `@lookup`s
- `packages/AI/Providers/**` — driver registrations (`@RegisterClass`)
- `reports/ai-model-research/ROUTINE_PROMPT.md` — §0.6 and §0.7, absent from the fired prompt
