# Weekly AI Model Research Report — 2026-04-20

**Scope of research window:** ~2026-02-13 through 2026-04-20 (since last inventory refresh on 2026-04-18).

**Current MJ inventory snapshot:**
- `metadata/ai-models/.ai-models.json`: 109 models
- `metadata/ai-models/.cohere-reranker-models.json`: 2 reranker models
- `metadata/ai-vendors/.ai-vendors.json`: 23 vendors

The inventory was last refreshed on 2026-04-18 and is very current. Flagship pricing (GPT 5.4 at $2.50/$15, Grok 4.20 at $2/$6, Claude Opus 4.7 at $5/$25) all matches present market rates, so this cycle focused on incremental additions over the past ~10 weeks and newly-released open-weights models.

---

## Summary of Recommended Changes

| Category | Count | Action |
|---|---|---|
| New models to add | 5 | JSON edits |
| Pricing changes | 0 | None verified |
| Updated models (metadata) | 0 | None verified |
| Deprecations (recommended) | 4 | Report-only, awaiting human review |
| New vendors | 0 | All relevant vendors already present |
| Flagged for human review | 7 | Report-only, no JSON changes |

---

## 1. New Models (JSON edits this PR)

### 1.1 GLM 5.1 (Z.AI / Zhipu AI)
- **Release:** 2026-04-07 (announcement), API GA on Z.AI and OpenRouter.
- **Architecture:** 744B total / 40B active MoE, 203K input context, 66K output tokens.
- **License:** MIT (open weights).
- **Pricing (Z.AI direct):** $0.95 / $3.15 per 1M tokens (input/output); cached input ~$0.19/1M.
- **Positioning:** Incremental refresh of GLM 5 (2026-02-11). Notable gains on SWE-bench Verified and AIME 2026 II vs GLM 5; same “Deep Thinking” mode.
- **Action:** Add new model row with `PriorVersionID = GLM 5`. Both Model Developer and Inference Provider vendor rows use `VendorID = Z.AI`.
- **PowerRank:** 21 (slightly above GLM 5 which is 20).

### 1.2 Gemma 4 31B Instruct (Google)
- **Release:** 2026-04-02.
- **Architecture:** Dense 31B, 256K context, multilingual (140+ languages), vision-in/text-out.
- **License:** Gemma Terms of Use (open weights).
- **Pricing (Vertex AI / third-party hosts average):** $0.13 / $0.38 per 1M tokens. (Most hosts price this identically; we attribute to Google as Model Developer and Vertex AI as Inference Provider.)
- **Action:** Add new model. `PriorVersionID` omitted — Gemma 3 lineage is not in inventory. PowerRank 8, SpeedRank 7, CostRank 4.

### 1.3 Gemma 4 26B A4B Instruct (Google)
- **Release:** 2026-04-02.
- **Architecture:** 26B total / 4B active MoE (A4B). Optimized for fast inference at lower cost. 256K context.
- **License:** Gemma Terms of Use (open weights).
- **Pricing (Vertex AI):** $0.08 / $0.35 per 1M tokens.
- **Action:** Add new model. PowerRank 7, SpeedRank 8, CostRank 3.

### 1.4 Cohere Rerank 4 Pro
- **Release:** 2025-12-16 (GA on Cohere API; missed in earlier cycles).
- **Context:** 32K tokens per document, 100+ languages.
- **Pricing:** $2.50 per 1K search units (Cohere standard rerank pricing).
- **Action:** Add to `.cohere-reranker-models.json`. Drives `CohereReranker` class, API name `rerank-v4-pro`. PowerRank 110 (above v3.5).
- **Note:** No `MJ: AI Model Costs` record is being added. The existing rerankers (`rerank-v3.5`, `rerank-multilingual-v3.0`) also have no cost records, and the current `AIModelPriceUnitType` seed only contains `Per 1M Tokens`, `Per 1K Tokens`, `Per 100K Tokens`, `Per Image` — none of which fit per-search-unit rerank pricing. Pricing is documented in the model's `Description` field instead. A future migration could introduce a `Per 1K Searches` unit type.

### 1.5 Cohere Rerank 4 Fast
- **Release:** 2025-12-16.
- **Context:** 16K tokens per document, 100+ languages; distilled/faster variant of Rerank 4.
- **Pricing:** $1.50 per 1K search units.
- **Action:** Add to `.cohere-reranker-models.json`. API name `rerank-v4-fast`. PowerRank 90.
- **Note:** Same cost-record caveat as Rerank 4 Pro above.

---

## 2. Pricing Changes

**None verified this cycle.** All pricing checked against provider docs or reputable trackers on 2026-04-19 matches what is already in MJ. Notable checks:

- Anthropic: Opus 4.7 $5/$25; Sonnet 4.6 $3/$15 — unchanged.
- OpenAI: GPT 5.4 $2.50/$15; GPT 5.4-mini $0.40/$2; GPT 5.4-nano $0.10/$0.40 — unchanged.
- xAI: Grok 4.20 $2/$6 — unchanged.
- Google: Gemini 3.1 Pro, 3.1 Flash, 3.1 Flash-Lite — unchanged.
- MiniMax: M2.7 $0.30/$1.20 on Fireworks — unchanged.

---

## 3. Updated Models (Metadata Changes)

**None recommended this cycle.** No architecture, context window, or capability changes identified for existing models that weren't already captured.

---

## 4. Deprecated / Retired Models (Report-only, no JSON change)

Per provider documentation reviewed this week, the following models on Anthropic have entered retirement windows. **No `IsActive=false` flips in this PR** — flagged for human review because MJ inventory may still want them available for historical/pinning use.

| Model | MJ ID Reference | Provider Status | Recommendation |
|---|---|---|---|
| Claude Sonnet 3.7 | present | Retirement scheduled by Anthropic for Q3 2026 | Leave active; consider flipping when Anthropic removes from API |
| Claude Opus 3 | present | Retired on api.anthropic.com effective 2026-03 | Consider `IsActive=false` after human review |
| Claude Sonnet 4 | present | Superseded by Sonnet 4.6; still served | Leave active |
| Claude Opus 4 | present | Superseded by Opus 4.6 / 4.7; still served | Leave active |

Also noted but already historical:
- Gemini 1.5 Pro: Google's successor models (3.x) fully dominant, 1.5 still served via Vertex. No change recommended.

---

## 5. New Vendors

**None this cycle.** All vendors that surfaced in research are already present in `.ai-vendors.json` (confirmed: Z.AI, Google, Cohere, Black Forest Labs, MiniMax, Fireworks.ai, OpenRouter, Cerebras, Alibaba Cloud, Moonshot AI).

---

## 6. Flagged for Human Review (No JSON changes)

Items encountered during research that are ambiguous, gated, or otherwise not ready to be ingested as structured metadata:

1. **"Claude Mythos"** — Appeared in third-party leak blogs in early April as Anthropic's rumored next-gen model. No official Anthropic page, no API availability. **Do not add.**
2. **DeepSeek V4** — Announcement-only from DeepSeek on 2026-03-28; API availability window was unstable/inconsistent during research. Context length and final pricing differed between the announcement and community trackers. **Wait for stable GA + pricing confirmation.**
3. **Meta "Muse Spark"** — Announced by Meta on 2026-04-05 as a consumer product; no developer API, not a candidate for MJ. **Do not add.**
4. **Kimi K2.6 Preview (Moonshot AI)** — Listed as preview/beta on platform.moonshot.ai; pricing was placeholder only ("preview — free during beta"). **Wait for GA pricing.**
5. **Qwen 3.6 Plus (Alibaba)** — Listed on DashScope as "free preview"; no committed commercial pricing yet. **Wait for GA pricing.** (Note: `Qwen 3.6 35B A3B` is already in inventory from the 2026-04-18 update.)
6. **Mistral Voxtral TTS** — Niche speech model, $0.003/minute. Not clear whether MJ's model schema handles per-minute audio pricing well enough to add without a separate migration path. **Defer.**
7. **"GPT-6" / "Project Atlas" rumors** — Persistent rumor from unofficial sources. No OpenAI confirmation, no API surface. **Do not add.**

---

## 7. Research Notes & Methodology

- **Primary sources:** anthropic.com/news, platform.openai.com/docs/models, ai.google.dev/gemini-api/docs, docs.x.ai, docs.mistral.ai, z.ai/blog, cohere.com/models, mistral.ai/news, bedrock.aws, fireworks.ai/models, openrouter.ai/models, docs.moonshot.ai, alibabacloud.com/help/en/dashscope.
- **Fallback sources:** pricepertoken.com, llm-stats.com, openrouter.ai pricing pages, model provider Twitter/X announcements, community trackers.
- **Several provider doc sites (OpenAI, xAI, Google, Cohere pricing) returned 403s to WebFetch**, so supplementary sources were used. Pricing for items added to JSON was cross-checked on at least 2 sources.
- **Conservative posture:** When in doubt, the item was moved to §6 (human review) rather than added.

---

## 8. Files Changed This PR

- `reports/ai-model-research/2026-04-20-weekly-report.md` — this report (new)
- `metadata/ai-models/.ai-models.json` — added GLM 5.1, Gemma 4 31B Instruct, Gemma 4 26B A4B Instruct
- `metadata/ai-models/.cohere-reranker-models.json` — added Cohere Rerank 4 Pro, Cohere Rerank 4 Fast

No `primaryKey`, `sync`, or timestamp fields are included in the new records — `mj sync push` will generate them on merge.
