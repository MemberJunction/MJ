# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-11-24
**Research Period**: 2026-11-16 → 2026-11-24
**Base Branch**: `next`
**Research Branch**: `claude/lucid-hamilton-rhmxjk`

> **Branch name.** The routine asks for `claude/ai-model-research-2026-11-24`. The harness for this
> session assigned `claude/lucid-hamilton-rhmxjk` and allows pushes only to that branch, so the
> assigned branch was used. Nothing else about the routine changed.

> **⚠ The fired prompt is still out of date against the repo copy, for the fourth week.** It is still
> missing `ROUTINE_PROMPT.md` §0.6 (`SupportsNativeToolCalling` on every LLM) and §0.7 (the standing
> decisions). It still says **"Do NOT include `primaryKey`"**, which contradicts `metadata/CLAUDE.md`
> §1. It still names three packages for the changeset where `.claude/rules/changesets.md` says
> `@memberjunction/core`. This run followed the repo copy on all of these, as last week's did. Only a
> human can fix the stored prompt, in the Routines UI. See Flagged item 9.

> **⚠ Revised after publication: the three new models were removed from this PR.** The previous day's
> run opened [#6854](https://github.com/MemberJunction/MJ/pull/6854) (*AI Model Research Report —
> 2026-11-23*), which is still open and already adds **GPT-6.2 Astra, GPT-6.2 Sol and Qwen4-Max**. Its
> records are at least as well sourced as this run's: for example, it gives Qwen4-Max a 991,808 input
> limit where this run used the 1M context size. If both PRs merged, `next` would have two records
> under each model name with different `primaryKey`s, and every `@lookup` on those names would become
> ambiguous. **This PR now changes only the Claude Opus 4.5 records**, which #6854 does not touch. The
> sections below on those three models are kept as an independent cross-check of #6854's figures, and
> they agree on every price and ID. **Nothing in this PR depends on which of the two PRs merges first.**
>
> *Why this run did not see #6854:* Step 1 of the routine reads `next` and the reports on `next`, and
> #6854 has not merged yet. **Suggestion for the routine:** before adding a model, also check open PRs
> titled "AI Model Research Report".

---

## Executive Summary

**OpenAI shipped GPT-6.2 Astra and GPT-6.2 Sol on 2026-11-17, and Alibaba made Qwen4-Max generally
available on 2026-11-16.** All three are added by the open PR #6854, not by this one (see the banner
above). Astra is a 20% price cut from GPT-6
Astra ($8/$40 instead of $10/$50). Sol keeps GPT-6.1 Sol's $2/$10 price. Qwen4-Max is about 25%
cheaper per token than Qwen 3.8 Max, at $1.50/$4.50.

**Anthropic deprecated Claude Opus 4.5 on 2026-11-23, the day before this run.** It retires on
2027-01-22. The deprecation is now recorded: the route is `Deprecated` and the price window closes at
the retirement date. The Anthropic cost row for this model also had a `Comments` field describing
Gemini 3 Pro, a copy-paste error, and that text has been corrected.

The Anthropic rate card was compared line by line with MJ again and still matches on every Claude
model. No price drift was found anywhere else MJ could check.

### Research access

The network restrictions have not changed. **`platform.claude.com` is still the only vendor site
this session can reach directly.** `developers.openai.com` failed with `ENOTFOUND` through
`WebFetch`, and `curl` returned no connection for OpenAI, OpenRouter, `ai.google.dev`, AWS docs,
Alibaba Cloud and Microsoft Learn. WebSearch, which fetches pages on the server side, was the only
way to read anything else. In practice:

- The Anthropic deprecation was read **directly from the vendor's own page**.
- The OpenAI and Qwen figures are **confirmed by several independent sources, but not read from the
  vendor's own page**. Every affected cost row says this in its `Comments`.

---

## Current Inventory Snapshot

After this run: **248 model records** (202 with `IsActive: true`), **723 vendor rows** and **353
cost rows**, across 31 vendors.

By model type: LLM 195, Realtime 18, Embeddings 12, Image Generator 12, TTS 5, Speech to Text 3,
Video 2, Reranker 1.

Since last week's report, three changes merged outside this routine: Gemini 4 Neon, a single Gemini 4
Hydrogen record, and GPT-Live 1.1 / AssemblyAI Voice. They account for the rest of the growth. Last
week's Flagged item 4 (Gemini 4 Hydrogen) is resolved by the Hydrogen record.

| Vendor | Inference routes (total / Active) | Last touched by this routine |
|---|---|---|
| OpenRouter | 137 / 126 | **2026-11-24** (GPT-6.2 Astra, GPT-6.2 Sol, Qwen4 Max) |
| OpenAI | 53 / 45 | **2026-11-24** (GPT-6.2 Astra, GPT-6.2 Sol) |
| Google | 34 / 25 | 2026-11-16 |
| Azure | 30 / 29 | **2026-11-24** (GPT-6.2 Astra, GPT-6.2 Sol) |
| Anthropic | 28 / 13 | **2026-11-24** (Opus 4.5 → Deprecated) |
| Vertex AI | 27 / 21 | 2026-11-16 |
| Amazon Bedrock | 26 / 26 | 2026-11-16 |
| Groq | 18 / 9 | 2026-11-02 |
| x.ai / Fireworks.ai | 15 / 15 · 15 / 14 | 2026-10-26 / 2026-10-19 |
| Mistral AI | 14 / 11 | 2026-11-01 |
| Alibaba Cloud | 11 / 11 | **2026-11-24** (Qwen4 Max) |
| Cerebras | 11 / 1 | 2026-08-17 |
| LM Studio, Z.AI | 7 / 7 each | 2026-10-26 |
| LocalEmbeddings, Eleven Labs, Moonshot AI | 6 each | 2026-11-01 |
| MiniMax, Black Forest Labs, Inception Labs, DeepSeek, Cohere, AssemblyAI, others | 1–5 each | various |

---

## New Models Available

### 1. GPT-6.2 Astra — **added by #6854; withdrawn from this PR**

| Field | Value |
|---|---|
| API ID | `gpt-6.2-astra` |
| Released | 2026-11-17 (OpenAI API, Microsoft Foundry, Amazon Bedrock and OpenRouter on the same day) |
| Context / max input / max output | 1,050,000 / 922,000 / 128,000 |
| Reasoning effort | low, medium, high, xhigh, max (no `none`) |
| Price (Standard) | **$8 / $40** per 1M; cached input $0.40; 30-minute cache write $10 |
| Long-context tier | input over 272K re-rates the whole request at $16 / $60 (cache read $2). Recorded in `Comments`, not modelled (§0.7 decision 6) |
| Batch | $4 / $20 |

Ranked `PowerRank` 28 (one above GPT-6 Astra's 27, level with Claude Fable 5.2 and Gemini 4 Carbon),
`SpeedRank` 7 and `CostRank` 10, the same as GPT-6 Astra. `PriorVersionID` points to GPT-6 Astra.

Routes:
- **OpenAI**: `Active`, with a cost row.
- **Azure**: `Active`, no cost row. Microsoft's own GA announcement confirms it. The row sets
  `SupportsNativeToolCalling: false` because `AzureLLM` is on the driver list that cannot send tools,
  the same as every other Azure route.
- **OpenRouter**: `Active`, no cost row (§0.7 decision 4).
- **Amazon Bedrock: not added.** The Bedrock model card exists, but no source available to this
  session gives the exact ID for Astra (Flagged item 2).

### 2. GPT-6.2 Sol — **added by #6854; withdrawn from this PR**

| Field | Value |
|---|---|
| API ID | `gpt-6.2-sol` (Foundry version `2026-11-17`) |
| Released | 2026-11-17 |
| Context / max input / max output | 1,050,000 / 922,000 / 128,000; knowledge cutoff 2026-06-01, per OpenAI's model page as quoted in search |
| Price (Standard) | **$2 / $10** per 1M (unchanged from GPT-6.1 Sol); cached input $0.10; cache write $2.50 |
| Long-context tier | Some sources report $4 / $15 above 272K, and others could not confirm it for 6.2. Noted only |

Ranked `PowerRank` 27, `SpeedRank` 8 and `CostRank` 5, one rank above GPT-6.1 Sol. `PriorVersionID`
points to GPT-6.1 Sol. The routes are the same as Astra's: OpenAI is priced, Azure and OpenRouter are
unpriced, and Bedrock is deferred.

### 3. Qwen4 Max — **added by #6854; withdrawn from this PR**

| Field | Value |
|---|---|
| API ID | `qwen4-max` (Alibaba Model Studio); `qwen/qwen4-max` (OpenRouter) |
| GA | 2026-11-16 (Token Plan preview from 2026-11-11) |
| Architecture | sparse MoE, about 2.4T total / about 71B active parameters, native vision, no open weights |
| Context / max output | 1M / 131,072; reasoning is on by default and billed as output |
| Price | **$1.50 / $4.50** per 1M (international/Singapore list price); cached $0.075; flat across the full 1M context |
| Other regions | $1.413 / $4.24 (Beijing, HK, Frankfurt, Virginia, Tokyo), recorded in `Comments` |

Ranked `PowerRank` 23 (Qwen 3.8 Max is 21), `SpeedRank` 6 and `CostRank` 6 (one below Qwen 3.8 Max's
7, reflecting the lower price). `PriorVersionID` points to Qwen 3.8 Max. Routes: Alibaba Cloud
(`QwenLLM`, priced, with a vendor-level `SupportsNativeToolCalling: false` copied from Qwen 3.8 Max's
Alibaba row) and OpenRouter (unpriced).

**`MaxInputTokens` is set to 1,000,000**, the context size OpenRouter lists. Alibaba publishes a
smaller input cap for Qwen 3.8 Max (991.8K), and no first-party cap for Qwen4 Max could be reached.
The Alibaba route uses `QwenLLM`, which is still not registered as a driver (carried item 13), so in
practice the model is reachable through OpenRouter. That is the same situation as every other Qwen
record.

---

## Pricing Changes Detected

| Model | Vendor | Previous (In/Out) | Current (In/Out) | Change | Action |
|---|---|---|---|---|---|
| GPT-6.2 Astra vs GPT-6 Astra | OpenAI | $10 / $50 | $8 / $40 | −20% | New model row; GPT-6 Astra's price is unchanged, so its row stays as it is |
| GPT-6.2 Sol vs GPT-6.1 Sol | OpenAI | $2 / $10 | $2 / $10 | 0% | New model row |
| Qwen4 Max vs Qwen 3.8 Max | Alibaba Cloud | $2 / $6 | $1.50 / $4.50 | −25% | New model row |
| Claude 4.5 Opus | Anthropic | $5 / $25 | $5 / $25 until 2027-01-22 | n/a | **Price window closes at retirement** |

No existing model's price changed. Every Anthropic list price in MJ matches the first-party table read
today, including the Opus 5.5 and Sonnet 5.5 0.05x cache multiplier, the Fable/Mythos 5.1+ 0.025x
multiplier, the Haiku 5.5 >100K tier (in `Comments`) and Sonnet 5's permanent $2/$10.

---

## Model Updates & New Versions

- **Gemini 4 Neon and Gemini 4 Hydrogen** were added on `next` this week by another change, which
  closes last week's Flagged item 4.
- **Grok**: nothing new on the public API. Grok 4.7 Fast is still only available in Cursor and Grok
  Build. Grok 5 is rumoured for late 2026, with no announcement.
- **Mistral, DeepSeek, MiniMax**: nothing released in the research window. MiniMax H3 Image
  (2026-11-10) is image-only and was not checked in enough detail to add.
- **Kimi K3.1 Pro Prime** (reportedly 2026-11-20) appears in one tracker only, with no API ID or
  price. Not added. Re-check next week.
- **Gemini Decision 1** (`gemini-decision-1`, Gemini Decisions API, 2026-11-11) is not a chat LLM.
  MJ has no `Decision` model type (carried item 15). Not added.

---

## Deprecated / Sunset Models

### Claude Opus 4.5 (Anthropic) — **retirement started**, confirmed on Anthropic's own page

| API model name | State | Deprecated | Retirement | Replacement |
|---|---|---|---|---|
| `claude-opus-4-5-20251101` (and undated `claude-opus-4-5`) | Deprecated | **2026-11-23** | **2027-01-22** | `claude-opus-5-5` |

This uses the same two-step approach as Claude Sonnet 4.5. The model is still served and billed for
another 59 days, so the full §0.2 recipe cannot be applied today without breaking routing:

- **Anthropic Inference Provider route: `Active` → `Deprecated`**, a valid `CK_AIModelVendor_Status`
  value.
- **Anthropic cost row: `EndedAt: 2027-01-22`, `Status` left `Active`.** Checked against the
  `BaseAIEngine` selection predicate: $5/$25 is selected on 2026-11-24 and on 2027-01-21, and nothing
  is selected from 2027-01-22. The row's `Comments` were wrong (they described Gemini 3 Pro) and have
  been rewritten to describe this model.
- **Bedrock and OpenRouter routes: not changed.** Partner platforms set their own retirement dates.
- **Model `IsActive`: still `true`.**

**The first run after 2027-01-22 needs to finish this**: set the route to `Inactive` and the cost row
to `Expired` (its `EndedAt` is already correct). This is Flagged item 3.

### Claude Sonnet 4.5 (Anthropic) — retires 2026-11-30, six days from now

Anthropic's page still shows retirement on 2026-11-30. This run made no change, because flipping the
route now would break routing six days early. The price window already closes at 2026-11-30 (set last
week). **The 2026-12-01 run should flip the Anthropic route to `Inactive` and the cost row to
`Expired`.** This is Flagged item 1.

### Gemini 2.5 Pro / 2.5 Flash (Google) — conflicting reports, not applied

A third-party post says Google will reroute `gemini-2.5-pro` and `gemini-2.5-flash` on 2026-12-01.
Cached copies of Google's own deprecations page instead give a 2026-10-16 shutdown, and some
localized copies say "no shutdown date". The sources contradict each other and the official page
could not be reached, so nothing was changed. This is Flagged item 4. MJ still has `Active` Google
and Vertex routes for both models.

---

## New Vendors Worth Considering

None. Every vendor referenced this week (`OpenAI`, `Azure`, `OpenRouter`, `Alibaba Cloud`,
`Anthropic`) already exists in `.ai-vendors.json`. This was checked mechanically.

---

## Recommended Actions

### Applied this run: 1 deprecation started (1 vendor row, 1 cost row), 1 corrupted comment fixed, 0 deletions

1. **[Withdrawn — duplicate of open PR #6854]** **GPT-6.2 Astra.** Figures below match #6854: `gpt-6.2-astra`, 922K/128K, OpenAI (priced at $8/$40), Azure
   and OpenRouter routes.
2. **[Withdrawn — duplicate of open PR #6854]** **GPT-6.2 Sol.** Figures below match #6854: `gpt-6.2-sol`, 922K/128K, OpenAI (priced at $2/$10), Azure and
   OpenRouter routes.
3. **[Withdrawn — duplicate of open PR #6854]** **Qwen4 Max.** Figures below match #6854, except that #6854 has the better-sourced 991,808 input limit: `qwen4-max`, 1M/131K, Alibaba Cloud (priced at $1.50/$4.50) and
   OpenRouter routes.
4. **[Applied]** **Claude Opus 4.5 deprecation recorded.** Anthropic route set to `Deprecated`; cost
   row closes at 2027-01-22. Source: Anthropic's own page.
5. **[Applied]** **The Claude 4.5 Opus Anthropic cost-row `Comments` corrected.** The old text
   described Gemini 3 Pro (`gemini-3-pro-preview`, "1M token input context") and was plainly wrong.
   This is an allowed exception to "preserve existing data", which permits correcting clear errors.
   No price field changed.
6. **[Verified, no change]** The Anthropic list-price table matches MJ on every Claude model.

### Flagged, not applied

1. **[Flagged — NEW, deadline 2026-11-30, for the 2026-12-01 run]** **Finish the Sonnet 4.5
   retirement.** Set the Anthropic route to `Inactive` and the Anthropic cost row to `Expired`
   (`EndedAt` is already 2026-11-30). Do not touch Bedrock or OpenRouter.
2. **[Flagged — NEW]** **GPT-6.2 Astra / Sol on Amazon Bedrock.** AWS has published model cards, and
   other sources give `openai.gpt-6.2-sol` for Sol, but there is no first-party ID for Astra and no
   Bedrock price. Add both routes once the AWS model card can be read. Related: the Azure routes for
   both models have no cost row, because Foundry prices could not be reached.
3. **[Flagged — NEW, for the first run after 2027-01-22]** **Finish the Opus 4.5 retirement.** Set
   the Anthropic route to `Inactive` and the cost row to `Expired`.
4. **[Flagged — NEW, conflicting sources]** **Gemini 2.5 Pro / 2.5 Flash shutdown date.** Is it
   2026-10-16, 2026-12-01, or not yet announced? One read of
   `ai.google.dev/gemini-api/docs/deprecations` settles it. If 2026-12-01 is right, the next run
   applies §0.2 to the Google and Vertex routes.
5. **[Flagged — NEW, needs a first-party read]** The OpenAI and Qwen4 Max prices are confirmed by
   several independent sources but were not read from the vendors' own pages. Checking
   `developers.openai.com/api/docs/pricing` and the Alibaba Model Studio pricing page would take two
   minutes. GPT-6.2 Sol's long-context tier (whether it has one at all) is also open.
6. **[Flagged — carried]** Claude Fable 5.2 Bedrock price, Gemini 4 Carbon `MaxOutputTokens`, GPT
   Image 2.6 `MaxInputTokens`, Kimi K3.1 Pro on Bedrock and the GPT-6.1 Terra Bedrock price. All of
   these are still blocked by the same network restrictions.
7. **[Flagged — carried, fifth week]** **Qwen 3.7 Plus output price.** MJ has $0.40/**$1.16**; the
   best-sourced figure is $0.40/**$1.60**, and 1.16 looks like a digit transposition. Still only
   third-party sources, so still not corrected.
8. **[Flagged — carried, environment]** **Vendor documentation sites are blocked** (OpenAI, Google,
   AWS, Alibaba, Microsoft Learn and the OpenRouter models API). Only `platform.claude.com` works.
   Unblocking would turn most flagged items into one-read fixes and would allow a full OpenRouter
   sweep for models nobody thought to search for.
9. **[Flagged — carried, meta, highest severity]** **The stored Routine prompt is out of date** (see
   the banner at the top). A human needs to copy `ROUTINE_PROMPT.md` into the Routines UI.
10. **[Flagged — carried]** OpenAI's next shutdown wave is **2026-12-11** (`gpt-5`, `gpt-5-mini`,
    `gpt-5-nano`, `o3`), and MJ has `Active` OpenAI routes for all four. Apply §0.2 on the first run
    after 2026-12-11, once OpenAI's page confirms it. Also still open: GPT-4o / 4o-mini / 4.1 /
    4.1-mini (2027-01-14), `tts-1` / `gpt-4o-mini-tts` (2027-01-06), `whisper-1` (2027-02-26).
11. **[Flagged — carried, code]** Anthropic API version `2026-10-21` removes `temperature`, `top_p` and
    `top_k`, which now return a 400 error. Confirmed again on Anthropic's page today. This affects
    `AnthropicLLM` once MJ moves to that API version.
12. **[Flagged — carried, needs an engineer]** Six Groq routes are past their shutdown dates. They need
    their own PR, because test and prompt bindings must be repointed first.
13. **[Flagged — carried, unregistered drivers]** `MoonshotLLM`, `KimiLLM`, `QwenLLM`, `DeepSeekLLM`
    and `ZAILLM` are not registered. This week's Qwen4 Max Alibaba route adds one more route that uses
    `QwenLLM`. It follows the existing pattern, and OpenRouter provides a working route.
14. **[Flagged — carried, needs a driver]** Gemini Omni 1.2 Flash (video) and Nemotron 3.5 Transcribe
    (audio).
15. **[Flagged — carried, still open]** MiniMax-M3 price ($0.60/$2.40 in MJ vs a reported $0.30/$1.20);
    Cohere Command A+ pricing; DeepSeek V4 Pro / V4 Flash have several concurrent `Active` cost rows;
    three cost rows have no `StartedAt` (the Whisper models); Claude Opus 4.1's model-level `IsActive:
    false` (Anthropic's table confirms it is still served on Bedrock and Google-managed Cloud, so MJ's
    shape is defensible and this item can probably be closed); Vertex `gemini-2.0-flash-001` /
    `-lite-001`; a `Decision` model type (now also relevant to Gemini Decision 1); Mistral Large 3 /
    Medium 3.5 retire on 2027-04-30; Kimi K2.6 / K2.7-Code have no shutdown date; and `Active`
    non-OpenRouter routes with no open cost row now number **46**, measured on this branch. That is 44
    on `next` before this run plus the two new Azure routes (Flagged item 2). The rise from last
    week's 43 to 44 came from changes merged separately on `next`.

### Settled by §0.7 — not raised again

Standing decisions 1–7 were applied as written. In particular: OpenRouter routes added this week have
no cost row (decision 4); long-context tiers are recorded in `Comments` (decision 6); and new models
are ranked against their nearest neighbours (decision 5).

---

## Verification performed on this branch

These checks were re-run after the three duplicate models were removed. The diff against `next` is
now **4 insertions and 3 deletions**, all in the Claude 4.5 Opus record.

- **§0.3 pre-flight check: run, printed `OK`.** The only vendor-status change is `Active` →
  `Deprecated`, which is valid for `CK_AIModelVendor_Status`. The only cost-row change adds an
  `EndedAt` that falls after its `StartedAt`, and `Status` stays `Active`. **No cost row anywhere uses
  `Inactive`.**
- **`primaryKey`: no new records**, so no new IDs. Every existing key is unchanged.
- **§0.6 `SupportsNativeToolCalling` check: unaffected.** No LLM record or driver class changed.
- **Cost-row selection: checked against the real predicate** (`Status === 'Active'`, `StartedAt <=
  now`, `!EndedAt || EndedAt > now`). For Claude 4.5 Opus, Anthropic's $5/$25 is selected up to and
  including 2027-01-21, and nothing is selected from 2027-01-22. Bedrock's $5/$25 stays selected
  throughout.
- **Overlap with #6854: checked.** #6854 does not modify the Claude 4.5 Opus record, so the two PRs
  touch different records. Both append to or edit `.ai-models.json`, so whichever merges second may
  need a merge of `next`, but there is no conflicting content.
- **CI history:** the first Integration Tier run on this PR's original head failed only the PB18
  performance-timing gate (1.62x baseline). A single re-run with no change passed. The metadata push
  passed both times.
- **`mj sync validate`: not run**, because it needs a database.

---

## Research Sources

**First-party, read directly:**

- Anthropic model deprecations: <https://platform.claude.com/docs/en/about-claude/model-deprecations>
- Anthropic pricing: <https://platform.claude.com/docs/en/about-claude/pricing>

**First-party, seen only through search results (the sites themselves are blocked):**

- OpenAI GPT-6.2 Sol model page: <https://developers.openai.com/api/docs/models/gpt-6.2-sol.md>
- Microsoft Azure GA announcement (GPT-6.2 Astra and Sol in Foundry): <https://x.com/Azure/status/2122779469274378305>
- Foundry region availability: <https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability>
- AWS Bedrock GPT-6.2 Astra model card: <https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-2-astra.html>
- Gemini API deprecations (cached copies): <https://ai.google.dev/gemini-api/docs/deprecations>
- OpenRouter model pages: <https://openrouter.ai/openai/gpt-6.2-astra> ; <https://openrouter.ai/openai/gpt-6.2-sol> ; <https://openrouter.ai/qwen/qwen4-max>

**Secondary sources, used to confirm figures or for items flagged rather than applied:**

- GPT-6.2 pricing and limits: <https://www.datastudios.org/post/openai-gpt-6-2-astra-sol-launch-api-pricing-chatgpt-codex> ; <https://aitokenprice.com/news/gpt-6-2-pricing> ; <https://www.layer3labs.io/guides/gpt-6-2-pricing> ; <https://betanews.com/article/gpt-6-2-astra-api-pricing/> ; <https://atomicagent.io/blog/gpt-6-2/> ; <https://runelab.ai/en/blog/post/what-is-gpt-6-2-astra-and-sol> ; <https://www.epifive.com/blog/gpt-6-2-astra-sol-api-pricing-limits> ; <https://llm-stats.com/models/gpt-6.2-astra> ; <https://dev.classmethod.jp/en/articles/openai-gpt-6-2-astra-sol-bedrock/> ; <https://github.com/Portkey-AI/models/pull/1044>
- Qwen4-Max: <https://routerplus.com/news/qwen4-max-generally-available-api-pricing> ; <https://neurohive.io/en/news/qwen4-max/> ; <https://datanorth.ai/news/qwen4-max-api-cost-per-task> ; <https://models.litellm.ai/models/qwen4-max> ; <https://tecadmin.net/alibaba-qwen4-max-released/> ; <https://github.com/HarnessRouter/harnessrouter/pull/735>
- Gemini November releases and deprecations: <https://dev.to/yardphantom/new-google-ai-models-oct-nov-2026-guide-2ie2> ; <https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/> ; <https://www.datastudios.org/post/gemini-api-reroutes-gemini-2-5-pro-2-5-flash-december-1-3-8-flash-3-5-flash-lite> ; <https://www.layer3labs.io/guides/gemini-model-deprecations>
- xAI: <https://docs.x.ai/release-notes>
- Release trackers (used only to find candidates): <https://llmgateway.io/timeline> ; <https://opper.ai/model-releases> ; <https://models.litellm.ai/models> ; <https://www.morphllm.com/llm-api>

**Repo sources:** `metadata/CLAUDE.md` §1; `.claude/rules/changesets.md`;
`packages/AI/Core/src/__tests__/modelConfiguration.test.ts` (`DRIVERS_WITHOUT_TOOLS`);
`reports/ai-model-research/ROUTINE_PROMPT.md` §0.6–§0.7.
