# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-11-02
**Research Period**: 2026-11-01 → 2026-11-02
**Base Branch**: `next`
**Research Branch**: `claude/magical-turing-m10ck4`

> **Branch-name note.** The routine template asks for `claude/ai-model-research-2026-11-02`. This
> session was assigned `claude/magical-turing-m10ck4` by its harness, which instructs that pushes go
> to that branch only. The assigned branch wins; nothing else about the routine changed.

> **⚠ The firing prompt is stale against the repo copy — a human needs to reconcile them.** The
> routine instructs that if the two disagree, this report says so. They do. `ROUTINE_PROMPT.md` in
> the repo carries **two sections the fired prompt does not**: **§0.6** (every LLM must set
> `ModelConfiguration.LLM.SupportsNativeToolCalling`, enforced by a test that fails the build) and
> **§0.7** (seven *standing decisions* dated 2026-10-20 that are to be applied, not re-flagged). The
> fired prompt's §0.6 is the repo's §0.8. **Both omissions changed this run's output**: §0.7's first
> standing decision is why Qwen 3.8 27B is applied below rather than flagged, and §0.6 is a
> build-gating requirement the fired prompt would have let a new LLM miss. The repo copy is the
> newer and more correct one; the trigger's stored prompt should be refreshed from it.

> **Window note.** The previous report is dated **2026-11-01** — it was run by hand, one day ago, for
> the v6.2.0-edge.7 release. The genuine research window for this run is therefore about 24 hours, not
> a week. Most of the value here is in re-checking the items prior weeks carried, not in new releases.

---

## Executive Summary

Two edits are applied. **Gemini 4 Argon's post-introductory price step-up** is now encoded as dated
cost rows on both Google and Vertex AI, so the $2/$10 → $4/$20 cutover happens automatically on
2026-12-01 with no further edit; this closes carried item 17, which had been open as "the Gemini 4
Argon output rate after 2026-12-01 is unconfirmed" — the Gemini Developer API pricing page now states
it plainly. And **Qwen 3.8 27B is added** with its Groq route seeded at `Preview`, per standing
decision 1, because Groq's own deprecations page names it as the replacement for `qwen/qwen3.6-27b`,
which MJ carries as a dead route.

Three further new items are flagged rather than applied: **Gemini 4 Carbon** (announced and priced,
but Google has published no API model identifier, so there is nothing to put in `APIName`),
**Nemotron 3.5 Transcribe** (real and priced, but MJ has no registered speech-to-text driver for its
host), and a new **OpenAI transcription-model shutdown date** that hits MJ's `whisper-1` route.
Anthropic's current list prices were re-verified against MJ and match on every model.

### Research-channel failure this run — read this before trusting the coverage

**Direct outbound HTTPS to every vendor documentation host was refused by the environment's network
policy.** `openrouter.ai` returned a 403 CONNECT from the egress proxy; `console.groq.com`,
`ai.google.dev`, `platform.claude.com`, `developers.openai.com`, `docs.mistral.ai`, `aws.amazon.com`
and `help.openai.com` all failed to resolve. The proxy status endpoint reported the openrouter refusal
as `connect_rejected` ("policy denial"). This is a change from 2026-11-01, when first-party reads of
Groq, OpenAI, Anthropic and Mistral docs all succeeded.

Research therefore ran **entirely through WebSearch**, which executes server-side and *did* reach
first-party pages (it quoted the Gemini pricing page, the Groq deprecations page and the Anthropic
deprecations page directly). That is a usable channel but a weaker one: it returns a synthesis rather
than the page, so figures cannot be cross-checked against surrounding context, and it cannot enumerate
a catalogue.

**The concrete consequence: there was no route sweep this run.** The OpenRouter models API is how
previous runs enumerated new models and route ids across every open-weight vendor at once. Without
it, this report cannot claim the window was swept — only that the vendors named below were queried by
name. **A human should allow these hosts in the session's network settings** (or confirm the policy
change was intentional) before the next run, otherwise coverage will keep degrading week over week.

| Channel | Status this run |
|---|---|
| WebSearch (standard + extended) | Working; reached first-party pages server-side. The only channel. |
| `openrouter.ai/api/v1/models` | **Blocked** — 403 CONNECT (proxy policy denial). No route sweep. |
| `ai.google.dev` pricing page | Blocked direct; **read via WebSearch** — Argon figures confirmed |
| `console.groq.com/docs/deprecations` | Blocked direct; **read via WebSearch** — six shutdowns re-confirmed |
| `platform.claude.com` deprecations | Blocked direct; **read via WebSearch** — prices + Sonnet 4.5 date confirmed |
| `developers.openai.com` deprecations | Blocked direct; **read via WebSearch** — transcription shutdown found |
| Alibaba Model Studio pricing | Not reached by either channel — item 10 stays open |
| AWS Bedrock model cards | Not reached by either channel — item 9 stays open |

### Driver-registration check

This run adds **one vendor route**: Qwen 3.8 27B on Groq, using `GroqLLM`, which is registered
(`@RegisterClass(BaseLLM, 'GroqLLM')` in `packages/AI/Providers`). `GroqLLM` is not in the
`DRIVERS_WITHOUT_TOOLS` list in `packages/AI/Core/src/__tests__/modelConfiguration.test.ts`, so the
model's `SupportsNativeToolCalling: true` is consistent with it. No new driver class is introduced.

Two observations from auditing the registry while assessing Nemotron:

- The **only** registered speech-to-text driver in the repo is `GroqAudioGenerator`
  (`@RegisterClass(BaseSpeechToText, 'GroqAudioGenerator')` and the same name against
  `BaseAudioGenerator`). MJ's `Whisper 1` and `OpenAI TTS` routes both name
  **`OpenAIAudioGenerator`, which is registered nowhere** — the same class of defect as carried item
  13, now confirmed to extend beyond LLM drivers.
- There is no registered DeepInfra or NVIDIA audio driver, which is why Nemotron 3.5 Transcribe is
  flagged below rather than added.

---

## Current Inventory Snapshot

**230 models** (194 `IsActive`), **673 vendor rows**, **329 cost rows** after this run's edits
(229 / 671 / 327 before — one model, two vendor rows and two cost rows added; nothing deleted). The
per-vendor table below is taken before the Qwen 3.8 27B route was added, so Groq reads 17/9 rather
than 18/9 — the new route is `Preview`, not `Active`.

| Vendor | Inference routes | of which Active |
|---|---|---|
| OpenRouter | 129 | 129 |
| OpenAI | 48 | 40 |
| Google | 29 | 21 |
| Azure | 28 | 27 |
| Amazon Bedrock | 25 | 25 |
| Anthropic | 24 | 13 |
| Vertex AI | 24 | 18 |
| Groq | 17 | 9 |
| x.ai | 15 | 15 |
| Fireworks.ai | 15 | 14 |
| Mistral AI | 14 | 11 |
| Cerebras | 11 | 1 |
| Alibaba Cloud | 10 | 10 |
| LM Studio | 7 | 7 |
| Z.AI | 7 | 7 |
| LocalEmbeddings | 6 | 6 |
| Eleven Labs | 6 | 6 |
| Moonshot AI | 6 | 5 |
| MiniMax | 5 | 5 |
| Black Forest Labs | 4 | 4 |
| Inception Labs | 3 | 3 |
| DeepSeek | 3 | 3 |
| Cohere | 3 | 3 |
| Tasio Labs / HeyGen / AssemblyAI / Inworld / Hugging Face / DeepInfra / SiliconFlow / MemberJunction | 1 each | 1 each |

---

## New Models Available

Nothing released inside the 24-hour window. Four models absent from MJ were assessed — three
released in the days just before the window, plus one Groq catalogue entry MJ had simply never
picked up. **One is applied** (Qwen 3.8 27B); the other three are flagged, each for a specific and
stated reason.

### Gemini 4 Carbon (Google, announced 2026-10-28) — NOT added

Google's frontier cybersecurity / long-horizon coding model. Announced pricing is **$2/1M input and
$10/1M output introductory, stepping to $4/$20** — the same schedule as Argon.

**Not added because Google has published no API model identifier for it.** Standing decision 1 (§0.7)
says a limited-availability model *is* added, with its Inference Provider route at `Preview` — so
restricted access alone would not have blocked this, and carried item 7 ("MJ has no convention for
limited-availability models") is **resolved by that decision and should stop being flagged**. What
blocks Carbon is narrower and harder: an Inference Provider row needs an `APIName`, and there is no
published id to put in it. Google's developer docs cover only `gemini-4-argon`; the launch post gives
no model id, context window or output limit; Carbon is absent from the Gemini Developer API pricing
page and the API changelog; and one reporter's paid-key model list from launch day showed Argon and no
Carbon. Third parties list a 1M context window and $4/$20, but no id that can be verified.

Add it the moment Google documents the identifier: model `IsActive: true`, Google (and Vertex AI if
listed) Inference Provider rows at `"Status": "Preview"`, and an `Active` cost row at the published
introductory rate.

### Nemotron 3.5 Transcribe (NVIDIA, released 2026-10-28) — NOT added

Open-weight (OpenMDW-1.1, commercial use permitted) 30B-A4B speech-augmented LM transcribing 40
languages; first among open-weight models on the HF Open ASR English leaderboard (5.33% WER, RTFx
462). Weights on Hugging Face and ModelScope. Hosted on **DeepInfra at $0.00200/minute** through an
OpenAI-compatible speech-to-text API, and on OpenRouter as a speech-to-text endpoint.

MJ has every piece of vocabulary this needs — an `NVIDIA` vendor (already the Model Developer on the
Nemotron 3 family), a `DeepInfra` vendor, a `Speech to Text` model type, and a `Per Minute` price unit
type in live use on `Whisper 1`. **So carried item 18 ("non-token billing units") is not in fact a
blocker** — that is a useful correction to several weeks of reports, and the item should be reframed.

**It is not added because there is no driver to carry the route.** The only registered speech-to-text
driver is `GroqAudioGenerator`; a DeepInfra or NVIDIA audio route would need a `DriverClass` that does
not exist, and inventing one violates routine guideline 4 and would add a 25th dead route to the
carried item 13 pile. This is a one-line decision for an engineer: either add the model with an
intentionally-dead DeepInfra route (consistent with how `Whisper 1` already carries an unregistered
`OpenAIAudioGenerator`), or write the driver first. Everything needed to apply it is above.

### Qwen 3.8 27B (Groq) — **ADDED**, route at `Preview`, no cost row

Groq's own deprecations page names `qwen/qwen3.8-27b` as the **replacement** for `qwen/qwen3.6-27b`,
which MJ carries as a route that shut down 2026-09-14. That id is therefore first-party confirmed,
and Groq's models page lists the model on its **Preview** tier.

Added per **standing decision 1**: model `IsActive: true`, `PowerRank` 15 / `SpeedRank` 8 /
`CostRank` 3 (calibrated against Qwen 3.6 27B at 13/8/2, one notch dearer at the reported rate),
`PriorVersionID` → Qwen 3.6 27B, `ModelConfiguration.LLM.SupportsNativeToolCalling: true` as §0.6
requires, an Alibaba Cloud Model Developer row, and a Groq Inference Provider row at
`"Status": "Preview"` with `qwen/qwen3.8-27b`, 131,072 max input and 16,384 max output. A `Preview`
route is never selected automatically, so this adds no routing risk; a customer with access flips it
to `Active`.

**No cost row was seeded**, and this is a deliberate departure from standing decision 1's "an `Active`
cost row with the published price". The reported $0.80/$4.00 (against $0.60/$3.00 for qwen3.6-27b)
comes only from third-party aggregators, which also disagree about free-tier status; Groq's own
pricing page was unreachable this run. Routine guideline 1 — "if unsure about a price, note it in the
report but don't edit the JSON" — is the narrower rule and wins on the price specifically. The figure
is recorded in the model's `Description` so whoever confirms it knows what to check. Everything else
about the record follows the standing decision.

This also matters for the **Groq cleanup PR (item 6)**: that PR has to repoint test and prompt
bindings at a live model before it can expire six dead routes, and this is Groq's nominated target,
now present in MJ as a `Preview` route ready to be promoted.

### DeepSeek "V4.1 Flash Cyber" — NOT added, probably not real as described

One aggregator lists `deepseek-v4.1-flash-1017-cyber` at $0.30/$1.00, 1M context, served by
Inference.net, dated 2026-10-26. No DeepSeek announcement corroborates it, and no other source names
the model. Treated as unverified. Guideline 1 applies.

---

## Pricing Changes Detected

| Model | Vendor | Previous (In/Out) | New (In/Out) | Change | Status |
|---|---|---|---|---|---|
| Gemini 4 Argon | Google | $2.00 / $10.00 | $4.00 / $20.00 from 2026-12-01 | +100% both | **Applied** |
| Gemini 4 Argon | Vertex AI | $2.00 / $10.00 | $4.00 / $20.00 from 2026-12-01 | +100% both | **Applied** (mirrored) |

**How it is encoded, and why this shape.** The two existing introductory rows keep
`"Status": "Active"` and gain `"EndedAt": "2026-12-01T00:00:00.000Z"`; two new `Active` rows start at
`2026-12-01` with $4/$20 and cached $0.20.

This is deliberately **not** the §0.2 deprecation recipe. §0.2 is for a route that has gone away; this
is a scheduled list-price change on a live route. Marking the current row `Expired` today would strip
Argon of any in-window price for four weeks and trip the "active model with no Active Realtime cost
row" warning in `ai-cost.checks.ts`. `Status: "Pending"` was also rejected: `AC3` skips Pending rows
and nothing in the file uses that value, so it would have been a novel pattern with no reader.

The shape used is the one `BaseAIEngine.GetModelCost` is actually written for — it filters
`Status === 'Active'` **and** `(!StartedAt || StartedAt <= now)` **and** `(!EndedAt || EndedAt > now)`.
Verified by evaluating that predicate against the edited file: today it selects $2/$10 and only
$2/$10; on 2026-12-15 it selects $4/$20 and only $4/$20. No gap, no overlap, no edit needed in
December. `AC3` and the orphan check both pass (all four rows are Active and resolve their
model/vendor/price-type/unit-type), and multiple concurrent Active rows per pair are already tolerated
— `DeepSeek V4 Pro` carries three overlapping ones today.

**Caveat, stated plainly:** no row in the repo previously combined `Status: "Active"` with an `EndedAt`
(0 of 327). The pattern is supported by the engine and by the CHECK constraints, but it is new to this
file, and a reviewer should look at it on that basis. The Vertex AI figure is **mirrored** from the
Gemini Developer API pricing page rather than independently read off the Vertex pricing page, which
was unreachable; MJ has carried this pair at parity since launch and both rows are annotated to say
so. The Developer API page also notes non-global endpoints run ~10% above global, which MJ does not
model.

### Verified, unchanged

Anthropic's current list prices match MJ exactly on every model checked, from the Anthropic models and
deprecations pages: Claude Fable 5.1 $10/$50, Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5
$0.10/$0.50. GPT-6.1 Terra's $1/$5 with $0.05 cached — added by last week's run — also re-confirms
against OpenAI's release notes.

---

## Model Updates & New Versions

Nothing to apply. One item worth recording for whoever picks up item 19:

MJ's `DeepSeek V4 Flash` Inference Provider route uses `APIName: "deepseek-v4-flash"`, while
`DeepSeek V4.1 Flash` uses `deepseek-flash`. A third-party source states `deepseek-v4-flash` and
`deepseek-v4-flash-vision-exp` were **retired** when `deepseek-flash` went live on 2026-09-10. If true,
MJ's V4 Flash DeepSeek route is dead and the §0.2 recipe applies to it. It is third-party sourced and
DeepSeek's own docs were unreachable, so it is recorded, not applied. The same source describes V4.1
Flash as peak/off-peak priced ($0.15/$0.60 off-peak, $0.30/$1.20 peak); MJ carries the off-peak figure
only, with no indication that it is one of two.

---

## Deprecated / Sunset Models

No deprecation recipe was applied this run.

### New this week

**OpenAI transcription models shut down 2027-02-26** — `whisper-1`, `gpt-4o-transcribe` and its
variants, with migration to `gpt-live-transcribe` or `gpt-transcribe`. **This hits MJ**: `Whisper 1`
carries an Active OpenAI route on `whisper-1` (plus a cost row at $0.006/minute that has no
`StartedAt` — one of the three in carried item 24). Neither replacement is in MJ. The date is ~16
weeks out, so the §0.2 recipe is not yet due; recorded as item 2 below.

### Re-confirmed, unchanged

**Six Groq routes remain past their published shutdown dates** — re-read off Groq's deprecations page
this run, identical to last week: `moonshotai/kimi-k2-instruct-0905` (2026-04-15), `qwen/qwen3-32b`
and `meta-llama/llama-4-scout-17b-16e-instruct` (2026-07-17), `llama-3.1-8b-instant` and
`llama-3.3-70b-versatile` (2026-08-16), `qwen/qwen3.6-27b` (2026-09-14). Groq's Supported Models page
still lists some of them, but that page's own age metadata reads 990 days and the deprecations page is
the newer source. Also noted: `groq/compound` was decommissioned 2026-09-21 — MJ does not carry it.

Still **not applied**, for the reason established last week: `Qwen 3 32B` is the third rung of the
integration-test agents' model ladder (15 bindings in
`metadata-optional/integration-test/ai-prompts/.it-agent-prompts.json`, plus
`rigs/it-agents-roster-probe.ts`), `Qwen 3.6 27B@GroqLLM` is named in
`native-tool-calling-live.checks.ts`, and `Qwen 3 32B` / `Llama 3.3 70B Versatile` are bound in the
agent-manager, database-designer and query-gen prompt files. Expiring these routes on a release PR
could redden the Integration Tier. It needs its own PR.

**`claude-sonnet-4-5-20250929` retires on the Anthropic API 2026-11-30** — re-confirmed on Anthropic's
deprecations page, 28 days out. Recipe is queued as item 1.

---

## New Vendors Worth Considering

None. Every vendor encountered this run already has a row in `metadata/ai-vendors/.ai-vendors.json`,
including `NVIDIA` and `DeepInfra`, the two that a Nemotron 3.5 Transcribe addition would need. No
`@lookup:` target was introduced by this run's edits.

---

## Recommended Actions

### Applied this run: 1 model, 1 price change, 2 vendor rows, 2 new cost rows, 2 rows window-closed, 0 deletions

1. **[Applied]** **Gemini 4 Argon post-introductory pricing.** Google and Vertex AI introductory rows
   window-closed at `2026-12-01` (kept `Active`, gained `EndedAt`); two new `Active` rows added at
   $4/$20 with $0.20 cached, starting `2026-12-01`. Cutover is automatic. Resolves carried item 17.
2. **[Applied]** **Qwen 3.8 27B added**, Groq route at `Preview`, per standing decision 1. No cost
   row — the rate is third-party only (see the section above).
3. **[Verified, no change]** Anthropic list prices — Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5 all
   match MJ. GPT-6.1 Terra's $1/$5/$0.05 re-confirms.
4. **[Corrected]** Carried item 18 ("non-token billing units blocks six models") is **wrong as
   written** — `Per Minute` and `Per Hour` unit types and a `Speech to Text` model type all exist and
   are in live use (`Whisper 1` at $0.006/minute, `Whisper Large v3` at $0.111/hour, `Grok Voice 3.0`
   at $0.08/minute). Standing decision 3 already settles the rule. The real blocker for audio models
   is the missing driver, not the billing unit. Retired as an open item.
5. **[Corrected]** Carried item 7 ("no convention for limited-availability models") is **resolved by
   standing decision 1** and should stop being flagged. Applied to Qwen 3.8 27B this run.

### Flagged, not applied

1. **[Flagged — deadline 2026-11-30, 28 days]** `claude-sonnet-4-5-20250929` retires on the Anthropic
   API. On the first run on or after that date: Anthropic route → `Inactive`, its cost row →
   `Expired` with `EndedAt: 2026-11-30T00:00:00.000Z`. Bedrock and OpenRouter routes stay `Active`;
   model-level `IsActive` stays `true`.
2. **[Flagged — NEW, deadline 2027-02-26]** OpenAI retires `whisper-1` and the `gpt-4o-transcribe`
   family. MJ's `Whisper 1` OpenAI route is affected. Replacements `gpt-transcribe` /
   `gpt-live-transcribe` are not in MJ and would need an audio driver (see item 4).
3. **[Flagged — NEW, blocked on an upstream identifier]** **Gemini 4 Carbon.** $2/$10 intro →
   $4/$20, per Google's announcement. Not addable until Google publishes the API model id — standing
   decision 1 handles the restricted access, but not a missing `APIName`. Recipe in the section above.
4. **[Flagged — NEW, needs one engineer decision]** **Nemotron 3.5 Transcribe.** Fully specified
   above: `Speech to Text`, NVIDIA developer row, DeepInfra route, $0.002 `Per Minute` (standing
   decision 3 confirms the per-minute unit is correct here). Needs either a registered
   DeepInfra/NVIDIA audio driver or a decision to add an intentionally-dead route. This and item 2
   both resolve if MJ gains a real audio-driver story.
5. **[Flagged — NEW, price only]** **Qwen 3.8 27B's Groq rate.** The model is added; confirm
   $0.80/$4.00 against Groq's pricing page and seed the cost row.
6. **[Flagged — carried, needs an engineer]** **Six Groq routes past shutdown.** Re-confirmed
   first-party this run. Belongs in its own PR that first repoints the test/prompt bindings. Full list
   and binding sites in "Deprecated / Sunset Models" above.
7. **[Flagged — NEW, low]** **DeepSeek V4 Flash's `deepseek-v4-flash` route may be dead** since
   2026-09-10 (third-party sourced). Worth one first-party check alongside item 19.
8. **[Flagged — NEW, environment, blocks future runs]** **Vendor documentation hosts are blocked by
   the network policy.** `openrouter.ai` (403 CONNECT), `console.groq.com`, `ai.google.dev`,
   `platform.claude.com`, `developers.openai.com`, `docs.mistral.ai`, `aws.amazon.com`,
   `help.openai.com` — all unreachable, a regression from 2026-11-01. Without the OpenRouter models
   API there is no route sweep, so weekly coverage degrades to "vendors we thought to ask about".
   Either allow these hosts or confirm the restriction is intended.
9. **[Flagged — carried]** **GPT-6.1 Terra Bedrock price.** Route still has no cost row. Needs the AWS
   model card (`model-card-openai-gpt-6-1-terra`); AWS was unreachable this run.
10. **[Flagged — carried]** **Qwen 3.7 Plus has three prices.** MJ holds $0.40/$1.16. Sources this run
    give $0.40/$1.60 list "with a limited-time 20% off" (which would be $0.32/$1.28, matching
    OpenRouter's Alibaba endpoint), and tiering above 256K input to $1.20/$4.80. **MJ's $1.16 output
    matches none of them.** One read of Alibaba Model Studio's pricing page settles it; that page was
    not reachable by either channel.
11. **[Flagged — carried, deadline 2027-01-14]** GPT-4o, GPT-4o mini, GPT-4.1 and GPT-4.1 mini leave
    the OpenAI API (replacement `gpt-6-luna`); `gpt-5.1`, `gpt-5.4-nano`, `gpt-5.3-codex` on
    2027-04-01; `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` on 2027-01-06. Re-confirmed this run except the
    TTS dates, which did not appear in this run's read.
12. **[Flagged — carried, code]** Anthropic API version `2026-10-21` removes `temperature`, `top_p`
    and `top_k` (400 error) — affects `AnthropicLLM` and any prompt setting a temperature, once MJ
    moves to that version.
13. **[Flagged — carried, unregistered drivers, now wider]** `MoonshotLLM`, `KimiLLM`, `QwenLLM`,
    `DeepSeekLLM`, `ZAILLM` on 24 first-party routes, registered nowhere. **Add `OpenAIAudioGenerator`
    to that list** — `Whisper 1` and `OpenAI TTS` both name it and it is registered nowhere either.
    Every affected active model still resolves via a higher-`Priority` registered route (usually
    OpenRouter), so the symptom is a permanently unusable first-party route, not an outage.
14. **[Flagged — carried, still genuinely open]** MiniMax-M3 $0.60/$2.40 vs reported $0.30/$1.20
    (item 14 of 2026-10-26); Cohere Command A+ possibly unpriceable at all (15); DeepSeek V4 Pro's
    three concurrent Active cost rows and V4 Flash's two (19); the three cost rows with no
    `StartedAt` — Whisper Large v3, Whisper Large v3 Turbo, Whisper 1 (24); Claude Opus 4.1
    model-level `IsActive: false` while its routes are live (26); Claude 3.5 Sonnet's unexpirable
    Anthropic row (25); Vertex `gemini-2.0-flash-001` / `-lite-001` (27); a `Decision` model type
    (23); `gpt-image-2.5-sunburst` / `-flare` still unpriced — standing decision 3 unblocked the
    unit question, so this is now just work to do (13 of 2026-10-26); Mistral Large 3 / Medium 3.5
    deprecated 2026-10-31 with retirement 2027-04-30, apply §0.2 then (7 of 2026-11-01); Kimi K2.6 /
    K2.7-Code deprecated on Moonshot with no shutdown date (8 of 2026-11-01).
15. **[Retired by §0.7 — stop carrying these]** Several long-carried items are settled by the
    2026-10-20 standing decisions and are dropped from this report's open list: the
    limited-availability convention (decision 1), pinned versions vs floating aliases (decision 2,
    item 22), non-token billing units (decision 3, item 18), OpenRouter routes missing cost rows
    (decision 4), CostRank/SpeedRank scale overflow (decision 5, item 20), request-size and
    long-context price tiers plus the Anthropic tokenizer discontinuity (decision 6), and the eight
    duplicate `primaryKey` UUIDs (decision 7). **Item 21 is narrowed rather than retired**: of 121
    Active inference routes on active models with no Active cost row, 79 are OpenRouter and are
    correctly unpriced under decision 4. The remaining **42 are not** — OpenAI 7, LM Studio 7,
    LocalEmbeddings 6, Eleven Labs 6, Amazon Bedrock 3, Google 2, and 11 others with one each. The
    LM Studio and LocalEmbeddings routes are local and legitimately free; the OpenAI, Bedrock,
    Google, Azure, Groq, Mistral and x.ai ones are real gaps.

---

## Verification performed on this branch

Stated precisely, because one of these is a replication rather than a real run:

- **§0.3 pre-flight check — run, prints `OK`.** Both metadata files parse; every vendor `Status` and
  cost `Status` is in its entity's allowed set; no `Expired` row lacks `EndedAt`; no `EndedAt` is at
  or before its `StartedAt`.
- **`primaryKey` / `sync` hygiene — run, passes.** Every record and nested child in
  `.ai-models.json` has a `primaryKey`; the five records added this run carry `uuidgen`-class UUIDs
  and **no** `sync` block, per `metadata/CLAUDE.md` §1.
- **`@lookup:` targets — checked.** The only lookups introduced resolve to `Alibaba Cloud`, `Groq`,
  `Qwen 3.6 27B`, `Google`, `Vertex AI`, the `Tokens` price type, the `Per 1M Tokens` unit type and
  the two vendor-type definitions. All pre-exist. No new vendor was needed.
- **Cost-row selection — verified by evaluating `GetModelCost`'s predicate against the edited file.**
  For Gemini 4 Argon: at 2026-11-02 it selects the $2/$10 rows and only those; at 2026-12-15 it
  selects the $4/$20 rows and only those. No gap and no ambiguous overlap at any point.
- **§0.6 `SupportsNativeToolCalling` gate — assertions replicated, both pass; the test itself was
  NOT run.** `packages/AI/Core` has no `node_modules` in this environment and `npx vitest` fails with
  `ERR_MODULE_NOT_FOUND`; a workspace install was out of proportion to a metadata change. The two
  assertions in `modelConfiguration.test.ts` read `.ai-models.json` directly, so they were
  re-implemented against the edited file: all **181** LLM records state the flag as a boolean (none
  missing), and no `Active` vendor row resolves `true` on a driver in `DRIVERS_WITHOUT_TOOLS`.
  `GroqLLM` is not in that list. This is strong evidence, not a test run — **the Integration Tier and
  unit-test workflows on the PR are the real gate, and should be read before merge** (§0.4).
- **`mj sync validate` — not run**, as the routine notes: it needs a database connection, which this
  environment does not have.

---

## Research Sources

**Read first-party via WebSearch (direct fetch blocked):**

- Gemini Developer API pricing — https://ai.google.dev/gemini-api/docs/pricing (Argon intro period
  end date, $4/$20 standard, $0.20 cached, batch/priority tiers, no Carbon entry)
- Gemini 4 Carbon announcement — https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-carbon/
  (intro $2/$10 → $4/$20; no API model id, context window or output limit stated)
- Gemini 4 getting-started / Argon developer guide — https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/get-started-with-gemini-4
  and .../models/guides/gemini-4-argon (documents `gemini-4-argon` only — no Carbon id)
- Groq model deprecations — https://console.groq.com/docs/deprecations (six shutdown dates,
  `qwen3.8-27b` as replacement, `groq/compound` decommission)
- Groq supported models — https://console.groq.com/docs/models (Preview tier membership)
- Anthropic model deprecations — https://platform.claude.com/docs/en/about-claude/model-deprecations
  (Sonnet 4.5 retirement 2026-11-30, lifecycle framework)
- Anthropic model overviews — https://platform.claude.com/docs/en/models/opus-5-5/overview and
  siblings (current list prices)
- OpenAI deprecations — https://developers.openai.com/api/docs/deprecations (transcription shutdown
  2027-02-26, GPT-5.x removals 2027-04-01)
- OpenAI model release notes — https://help.openai.com/en/articles/9624314-model-release-notes
  (GPT-6.1 Terra $1/$5/$0.05)

**Third-party, used only for leads and explicitly not for JSON edits:**

- Nemotron 3.5 Transcribe — https://huggingface.co/blog/nvidia/nemotron-transcribe-granary,
  https://deepinfra.com/blog/nvidia-nemotron-3-5-transcribe-release ($0.002/minute)
- Qwen 3.7 Plus pricing spread — https://www.cloudzero.com/blog/qwen-api-pricing/,
  https://www.eesel.ai/blog/qwen-pricing, https://openrouter.ai/qwen/qwen3.7-plus
- Qwen 3.8 27B on Groq — https://www.usagepricing.com/blueprint/groq, https://freellm.net/models/groq/qwen-qwen3-8-27b
- DeepSeek naming / peak-off-peak — https://www.morphllm.com/deepseek-api, https://coworker.ai/blog/deepseek-api-pricing
- "V4.1 Flash Cyber" single-source listing — https://www.respan.ai/models/deepseek-v4.1-flash-1017-cyber
- Window sweeps — https://llmgateway.io/timeline, https://opper.ai/model-releases,
  https://patmcguinness.substack.com/p/ai-week-in-review-261031

**Repo sources for the engine-behaviour claims:**

- `packages/AI/BaseAIEngine/src/BaseAIEngine.ts` — `GetModelCost` status + date-window predicate
- `packages/TestingFramework/integration-test-suite/src/checks/ai-cost.checks.ts` — AC3, orphan and
  coverage checks
- `packages/AI/Providers/**` — `@RegisterClass` driver registrations
