# AI Model & Vendor Weekly Intelligence Report

**Generated**: 2026-11-01
**Research Period**: 2026-10-26 → 2026-11-01
**Base Branch**: `next`
**Research Branch**: `claude/ai-model-research-2026-11-01`

> Run by hand for the v6.2.0-edge.7 release (`DEPLOYMENT.md` Step 2): no research PR was open and the
> scheduled routine was not available. The branch name matches the routine template this time.

---

## Executive Summary

Two models are added, one price change is applied, and one route is added to a model MJ already
carries. **GPT-6.1 Terra** (OpenAI, 2026-10-26, $1/$5) is the main release in the window and is added
on OpenAI, Amazon Bedrock and OpenRouter. **Muse Wonder** (Meta, 2026-10-12), carried as an open item
last week, is added through OpenRouter now that the OpenRouter models API was reachable. **Mistral
Large 4** dropped to $0.70/$2.10 on 2026-10-29 when Mistral published its weights; the $1.36/$4.18 row
is expired at that date. **MiniMax-M3.1-Flash** gains its OpenRouter route.

No deprecation recipe was applied. A first-party read of Groq's deprecation page shows **six MJ Groq
routes past their shutdown dates** (between April and September 2026). They are flagged, not applied,
because `Qwen 3 32B` on Groq is the third rung of the integration-test agents' model ladder; changing
it on a release PR could redden the Integration Tier (item 6).

### Driver-registration check

Every route added here uses a driver class registered in this repo:
`@RegisterClass(BaseLLM, 'OpenAILLM')`, `'BedrockLLM'` and `'OpenRouterLLM'` in `packages/AI/Providers`.
No route uses `MoonshotLLM`, `KimiLLM`, `QwenLLM`, `DeepSeekLLM` or `ZAILLM`, which are named in
metadata but registered nowhere. These caused the Kimi K3.1 Pro failure fixed in `cc3dd7851a`. The
model's `DriverClass` comes from its highest-`Priority` Active inference route, so each new model
resolves to `OpenRouterLLM` (Priority 50).

### Research channels

| Channel | Status this run |
|---|---|
| `openrouter.ai/api/v1/models` and `/endpoints` | Full read. Used for the window sweep and route ids |
| `developers.openai.com` (model page, deprecations) | Full read |
| `platform.claude.com` (deprecations, models overview) | Full read |
| `docs.mistral.ai` (models overview, Large 4 page) | Full read |
| `console.groq.com/docs/*.md` (models, deprecations) | Full read |
| `openai.com/index/...` | 403 |
| `mistral.ai/pricing` | Reachable, does not list Large 4 |
| WebSearch | Used throughout |

---

## Current Inventory Snapshot

**229 models** (193 `IsActive`), **671 vendor rows**, **327 cost rows** after this run's edits
(227 / 664 / 325 before).

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
| LM Studio / Z.AI | 7 / 7 | 7 / 7 |
| Moonshot AI / Eleven Labs / LocalEmbeddings | 6 / 6 / 6 | 5 / 6 / 6 |
| MiniMax | 5 | 5 |
| Black Forest Labs | 4 | 4 |
| Inception Labs / DeepSeek / Cohere | 3 / 3 / 3 | 3 / 3 / 3 |
| 8 single-route vendors | 8 | 8 |

---

## New Models Available

### 1. GPT-6.1 Terra — **ADDED**

| | |
|---|---|
| Vendor / routes | OpenAI `gpt-6.1-terra` (`OpenAILLM`, Priority 1); Amazon Bedrock `openai.gpt-6.1-terra` (`BedrockLLM`, Priority 5); OpenRouter `openai/gpt-6.1-terra` (`OpenRouterLLM`, Priority 50) |
| Released | 2026-10-26 (Bedrock lifecycle start 2026-10-23) |
| Price (OpenAI) | **$1 in / $5 out**, cached input $0.05, cache write $1.25 (30-min retention) |
| Long-context tier | Above 272K input tokens the whole request is billed at 2x input and cache, 1.5x output ($2/$7.50). Recorded in `Comments`, not modelled (standing decision 6) |
| Context | 1,050,000 (922K max input), 128K max output |
| Effort | none, low, medium (default), high, xhigh, max |
| Ranks | PowerRank 23, SpeedRank 9, CostRank 3 |
| `PriorVersionID` | GPT 5.6-terra |
| Verification | First-party: OpenAI model page |

The mid tier of the GPT-6.1 series, at half the price of GPT-6.1 Sol and GPT 5.6-terra. PowerRank 23
places it below GPT-6.1 Sol (26) and level with Claude Sonnet 5.5. The record mirrors GPT-6.1 Sol: the
Bedrock row sets `SupportsNativeToolCalling: false` because `BedrockLLM` is in the guard test's
`DRIVERS_WITHOUT_TOOLS`.

Not added:
- **Bedrock cost row.** A Classmethod test write-up (2026-10-27) confirms the model id and GA, but the
  AWS model card was not published and one aggregator lists $1.10/$5.50. The route is added without a
  price (item 9).
- **Azure route.** OpenRouter lists an Azure EU endpoint at $1.20/$6, but there is no Microsoft
  announcement. Not modelled.
- **GPT-6.1 Terra Pro.** On OpenRouter this is the same model with `reasoning.mode` set to `pro`, not
  a separate OpenAI id (standing decision 2).

### 2. Muse Wonder — **ADDED** (carried item 16 from last week)

| | |
|---|---|
| Vendor / route | Meta (Model Developer); OpenRouter `meta/muse-wonder` (`OpenRouterLLM`, Priority 50) |
| Released | 2026-10-12. `muse-wonder-1.0` is Preview on Meta's Model API, public on OpenRouter |
| Meta price | $4 in / $0.20 cached / $20 out, no long-context premium |
| Context | 1,048,576. No published output cap, so `MaxOutputTokens` is omitted, as on Muse Spark Open |
| Tools | `tools` in OpenRouter `supported_parameters` → `SupportsNativeToolCalling: true` |
| Ranks | PowerRank 26, SpeedRank 6, CostRank 9 |

Meta's frontier model, above Muse Spark 1.3. On Meta's launch table it scores 52 on the Artificial
Analysis Index against GPT-6 Astra's 53 and Claude Opus 5.5's 58, so PowerRank 26 sits one below
those two (both 27). CostRank 9 matches Opus 5.5 at the same $4/$20 price. Neither the Meta vendor nor
OpenRouter gets a cost row: Meta has no MJ driver and so no inference route, and OpenRouter prices are
not tracked (standing decision 4). The Meta price is recorded in the `Description`. Muse Wonder Full
has no API id and is not modelled.

### Considered and not added

| Model | Why not |
|---|---|
| Particle-1 (Particle AI, 2026-10-28, OpenRouter $0.05/$0.50) | A coding fine-tune of DeepSeek V4.1 Flash from a new vendor with no first-party docs found |
| DeepSeek V4.1 Flash Cyber (2026-10-29) | A third-party abliterated derivative sold through LLM Gateway on enterprise plans. Not a DeepSeek release |
| Qwen Flash (Alibaba, 2026-10-28) | A floating alias (standing decision 2) |
| Kimi K3.1 Pro Highspeed route | Still not on OpenRouter; the model stays `IsActive: false` |
| Earlier-dated OpenRouter models (StepFun Step 5 Preview, Nemotron 3.5 Super VL, Reflection Beam 1.0, Ling 3.1 Flash, LFM 2.5) | Released before this window and outside the vendor list; not researched to the add standard this run |

---

## Pricing Changes Detected

| Model | Vendor | Previous (In / Cached / Out) | Current (In / Cached / Out) | Change | Applied |
|---|---|---|---|---|---|
| Mistral Large 4 | Mistral AI | $1.36 / $0.14 / $4.18 | **$0.70 / $0.07 / $2.10** | −48.5% in, −49.8% out | Yes |

Mistral cut the price on **2026-10-29**, the day it published the open weights. The new rate is on
Mistral's model page (`docs.mistral.ai/models/mistral-large-4-0`) and matches the Mistral-served
endpoints on OpenRouter. No end date is stated. The $1.36/$4.18 row is `Expired` with
`EndedAt: 2026-10-29`, a new `Active` row starts that day, and the model `Description` records both
changes. This also settles last week's caveat that the 2026-10-20 row might have started early: a
2026-10-22 snapshot confirms the launch sale had ended.

Checked and not applied:

| Model | Vendor | MJ today | Reported | Why not |
|---|---|---|---|---|
| Qwen 3.7 Plus | Alibaba Cloud | $0.40 / $1.16 | $0.40 / $1.60 (pricing dataset, 2026-10-28); $0.32 / $1.28 (Alibaba endpoint on OpenRouter) | Three figures and no first-party page read. Item 10 |
| MiniMax-M3.1-Flash | MiniMax | $0.15 / $0.60 | OpenRouter's MiniMax endpoint bills $0.075 / $0.30 from 15:00 to 01:00 UTC and $0.15 / $0.60 otherwise | MJ's row is the peak rate. MJ cannot model time-of-day pricing (same issue as DeepSeek). Recorded here only |

---

## Model Updates & New Versions

- **MiniMax-M3.1-Flash — OpenRouter route added** (`minimax/minimax-m3.1-flash`, Priority 50, no cost
  row). This was carried item 16. `MaxOutputTokens` is 131,072 to match the first-party row, although
  OpenRouter's MiniMax endpoint reports 524,288.
- **Mistral Large 4** — the `Description` now records the open-weight release and the price history.
  `MaxOutputTokens` remains unset; OpenRouter reports 262,144 but Mistral publishes no figure.

---

## Deprecated / Sunset Models

**No §0.2 recipe applied this run.**

| Model / route | Source | Date | Status in MJ | Action |
|---|---|---|---|---|
| `claude-sonnet-4-5-20250929` / Anthropic | platform.claude.com (first-party) | Retires **2026-11-30** | Vendor row `Deprecated`, cost row `Active` | Apply §0.2 on the run nearest 2026-11-30 (item 1) |
| `claude-opus-4-5-20251101` / Anthropic | platform.claude.com | Not sooner than 2026-11-24 (a floor, not a date) | `Active` | Watch |
| `mistral-large-2512` (Mistral Large 3), `mistral-medium-3-5` (Mistral Medium 3.5) / Mistral AI | docs.mistral.ai models overview (first-party) | Deprecated 2026-10-31, retire **2027-04-30** | `Active` | Item 7 |
| Six Groq routes | console.groq.com deprecations (first-party) | Shutdowns 2026-04-15 to 2026-09-14 | Five `Active`, one `Deprecated` | Item 6 |
| `kimi-k2.6`, `kimi-k2.7-code` / Moonshot AI | Third-party pricing dataset only | "Active → deprecated" 2026-10-29, no shutdown date | `Active`, `MoonshotLLM` (unregistered; OpenRouter is the effective driver) | Item 8 |
| GPT-4o / GPT-4.1 family / OpenAI | developers.openai.com (first-party) | Shutdown **2027-01-14** | `Active` | Carried (item 11) |

---

## New Vendors Worth Considering

**None added.** Particle AI is the only new name in the window: one model, a fine-tune of DeepSeek
V4.1 Flash, available only through OpenRouter.

---

## Recommended Actions

### Applied this run: 2 models, 1 route, 1 price change, 11 new records, 0 deletions

1. **[Applied]** **GPT-6.1 Terra added.** 4 vendor rows (developer, OpenAI, Bedrock, OpenRouter) and 1
   OpenAI cost row at $1/$5, cached $0.05, cache write $1.25.
2. **[Applied]** **Muse Wonder added.** 2 vendor rows (Meta developer, OpenRouter). No cost row.
3. **[Applied]** **Mistral Large 4 price cut.** The $1.36/$4.18 row is expired at 2026-10-29 and a
   $0.70/$2.10 row (cached $0.07) is added.
4. **[Applied]** **MiniMax-M3.1-Flash OpenRouter route added.**
5. **[Verified, no change]** Anthropic models overview and deprecations page: no new models or
   deprecations in the window, and every current list price matches MJ.

### Flagged, not applied

1. **[Flagged — deadline 2026-11-30]** `claude-sonnet-4-5-20250929` retires on the Anthropic API on
   2026-11-30. On the next run on or after that date: set the Anthropic route `Inactive` and its cost
   row `Expired` with `EndedAt: 2026-11-30T00:00:00.000Z`. The Bedrock and OpenRouter routes stay.
6. **[Flagged — NEW, needs an engineer]** **Six Groq routes are past their published shutdown dates**
   (Groq deprecations page, first-party):

   | MJ model | Groq id | Shutdown | MJ route / cost row |
   |---|---|---|---|
   | Kimi K2 | `moonshotai/kimi-k2-instruct-0905` | 2026-04-15 | `Deprecated` / `Active` |
   | Qwen 3 32B | `qwen/qwen3-32b` | 2026-07-17 | `Active` / `Active` |
   | Llama 4 Scout | `meta-llama/llama-4-scout-17b-16e-instruct` | 2026-07-17 | `Active` / `Active` |
   | Llama 3.1 8b | `llama-3.1-8b-instant` | 2026-08-16 | `Active` / `Active` |
   | Llama 3.3 70B Versatile | `llama-3.3-70b-versatile` | 2026-08-16 | `Active` / `Active` |
   | Qwen 3.6 27B | `qwen/qwen3.6-27b` | 2026-09-14 | `Active` / none |

   Groq says these deprecations apply to free and developer tiers and that enterprise contracts are
   not affected. Its models page still lists Llama 3.1 8B and 3.3 70B, but only as "Enterprise /
   Contact Sales". The §0.2 recipe fits each one. **It was not applied** because these models are
   wired into the test suite and into shipped prompts:
   - `Qwen 3 32B` is the third rung of the integration-test agents' model ladder
     (`metadata-optional/integration-test/ai-prompts/.it-agent-prompts.json`, 15 bindings) and of
     `rigs/it-agents-roster-probe.ts`.
   - `Qwen 3.6 27B@GroqLLM` is listed in `native-tool-calling-live.checks.ts`.
   - `Qwen 3 32B` is also bound in `.agent-manager-prompts.json` and `.database-designer-prompts.json`,
     and `Llama 3.3 70B Versatile` in `.query-gen-prompts.json`.

   The fix belongs in a separate PR that moves those bindings to a live model (Groq suggests
   `openai/gpt-oss-120b`, already in MJ, or `qwen/qwen3.8-27b`) and then applies §0.2. Groq's
   replacement `qwen/qwen3.8-27b` ($0.80/$4.00, Preview on Groq) is not in MJ.
7. **[Flagged — NEW]** **Mistral deprecated Mistral Large 3 (`mistral-large-2512`) and Mistral Medium
   3.5 (`mistral-medium-3-5`) on 2026-10-31, with retirement on 2027-04-30.** Both still work. Setting
   the routes to `Deprecated` now would drop them from routing six months early. Both have only the
   Mistral route, so the models would lose their driver. Apply §0.2 on 2027-04-30. Voxtral TTS and
   Voxtral Mini Transcribe 2 are on the same schedule; MJ does not carry them.
8. **[Flagged — NEW, low]** Kimi K2.6 and Kimi K2.7-Code are reported deprecated on Moonshot as of
   2026-10-29, with no shutdown date. One reseller expects a shutdown around the end of December. MJ's
   Moonshot routes on these models use the unregistered `MoonshotLLM` and OpenRouter is the effective
   driver, so there is no runtime exposure. Apply §0.2 when Moonshot publishes a date.
9. **[Flagged — NEW]** **GPT-6.1 Terra Bedrock price.** The route is added without a cost row. Add
   one when the AWS model card (`model-card-openai-gpt-6-1-terra`) publishes. GPT-6.1 Sol's card set
   the global endpoint at OpenAI list price, which would be $1/$5 here.
10. **[Flagged — NEW]** **Qwen 3.7 Plus has three prices.** MJ has $0.40/$1.16, a 2026-10-28 pricing
    dataset gives $0.40/$1.60, and OpenRouter's Alibaba endpoint charges $0.32/$1.28. One read of
    Alibaba Model Studio's pricing page settles it.
11. **[Flagged — carried, deadline 2027-01-14]** GPT-4o, GPT-4o mini, GPT-4.1 and GPT-4.1 mini leave
    the OpenAI API on 2027-01-14 (replacement `gpt-6-luna`). Also from the 2026-10-01 notice:
    `gpt-5.1`, `gpt-5.4-nano` and `gpt-5.3-codex` shut down 2027-04-01, and `tts-1`, `tts-1-hd` and
    `gpt-4o-mini-tts` on 2027-01-06.
12. **[Flagged — carried, code]** Anthropic API version `2026-10-21` removes `temperature`, `top_p` and
    `top_k` (400 error). This affects the `AnthropicLLM` driver and any prompt that sets a temperature,
    once MJ moves to that API version. It is still on the deprecations page.
13. **[Flagged — carried, unregistered drivers]** `MoonshotLLM`, `KimiLLM`, `QwenLLM`, `DeepSeekLLM`
    and `ZAILLM` appear on 24 first-party routes (23 `Active`) and are registered nowhere. Every active model
    among them also has a higher-`Priority` route on a registered driver, usually OpenRouter, so it
    still resolves, but the first-party route can never be used. A driver package or a cleanup pass would close this.
14. **[Flagged — carried]** Still open from 2026-10-26, unchanged by this run: MiniMax-M3's
    $0.60/$2.40 against reported $0.30/$1.20 (item 14 there); Cohere Command A+ pricing (15); the
    Gemini 4 Argon output rate after 2026-12-01 (17); non-token billing units (18); DeepSeek V4 cost
    rows (19); the three cost rows without `StartedAt` (24); Claude Opus 4.1's model-level
    `IsActive: false` while routes are live (26); and `gpt-image-2.5-sunburst` / `-flare`, now
    unblocked by standing decision 3 but not priced this run (13).

---

## Research Sources

- OpenAI GPT-6.1 Terra model page: https://developers.openai.com/api/docs/models/gpt-6.1-terra
- OpenAI announcement: https://openai.com/index/introducing-gpt-6-1-terra/ (403 here; cited by every secondary source)
- OpenAI deprecations: https://developers.openai.com/api/docs/deprecations
- GPT-6.1 Terra on Bedrock (Classmethod, 2026-10-27): https://dev.classmethod.jp/en/articles/bedrock-openai-gpt61-terra/
- OpenRouter models API: https://openrouter.ai/api/v1/models and `/api/v1/models/<id>/endpoints` for `openai/gpt-6.1-terra`, `openai/gpt-6.1-terra-pro`, `meta/muse-wonder`, `minimax/minimax-m3.1-flash`, `mistralai/mistral-large-4-0`, `qwen/qwen3.7-plus`
- Muse Wonder overview: https://www.eesel.ai/blog/meta-muse-wonder
- Mistral Large 4 model page: https://docs.mistral.ai/models/mistral-large-4-0
- Mistral models overview (deprecations): https://docs.mistral.ai/getting-started/models/models_overview/
- Mistral Large 4 price cut: https://tokencost.app/blog/mistral-large-4-open-weights-price-cut ; https://mistral.ai/news/mistral-large-4-oss/
- Anthropic deprecations: https://platform.claude.com/docs/en/about-claude/model-deprecations
- Anthropic models overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Groq deprecations: https://console.groq.com/docs/deprecations
- Groq models: https://console.groq.com/docs/models
- AI API pricing dataset, October 2026: https://github.com/aicostbudget/ai-api-pricing-data/releases/tag/dataset-2026-10
- Kimi K2 retirement (secondary): https://qcode.cc/kimi-k2-retirement-2026
- DeepSeek V4.1 Flash Cyber listing: https://llmgateway.io/models/deepseek-v4.1-flash-cyber
