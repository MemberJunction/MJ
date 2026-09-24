# AI Model & Vendor Weekly Intelligence Report
**Generated**: 2026-08-24
**Research Period**: 2026-08-17 → 2026-08-24
**Base Branch**: `next`
**Research Branch**: `claude/ai-model-research-2026-08-24`

---

## Executive Summary

Three notable moves this week: **Zhipu released GLM-5.3** (Aug 14) as the new Z.AI flagship — Coding Plan only, per-token API rate not yet posted; **Cerebras is retiring GLM-4.7** from its inference cloud (deprecation date Aug 17); and **OpenAI slashed GPT-5.6 Luna and Terra prices** on Jul 30 (Luna −80%, Terra −20%) — both already reflected in inventory. No new frontier releases from Anthropic, OpenAI, xAI, or Google since the Grok 4.6 launch on Aug 12 (already in inventory). Recommended actions are limited: mark the Cerebras/GLM-4.7 vendor row inactive, add a GLM-5.3 placeholder record, and audit two contradictory data points before touching prices.

---

## Current Inventory Snapshot

- **Total models**: 185 (in `metadata/ai-models/.ai-models.json`) + 4 (in `.cohere-reranker-models.json`) = **189 model records**
- **Active LLMs**: ~120
- **Active image / video / TTS / STT / realtime models**: ~25
- **Active embedding + reranker models**: ~15
- **Total vendors** (`metadata/ai-vendors/.ai-vendors.json`): 30

Coverage across major vendors:

| Vendor | Active Model Count (approx.) | Latest In-Inventory Model | Newest Cost Record |
|---|---:|---|---|
| Anthropic | 8 | Claude Opus 5 (Jul 24) | 2026-07-24 |
| OpenAI | 20 | GPT 5.6-luna (Jul 30 repricing) | 2026-07-30 |
| Google / Vertex AI | 12 | Gemini 3.7 Flash | 2026-08-xx |
| xAI | 8 | Grok 4.6 (Aug 12) | 2026-08-12 |
| Mistral AI | 8 | Mistral Medium 3.5, Magistral 1.2 | 2026 mid-year |
| DeepSeek | 2 | V4 Pro (Aug 16 cost record) | 2026-08-16 |
| Moonshot AI | 3 | Kimi K3 / K3 Fast (Jul 16 / 27) | 2026-07-27 |
| Alibaba Cloud (Qwen) | 12 | Qwen 3.8 Max (Aug 3) | 2026-08-03 |
| Z.AI (GLM) | 8 | GLM 5.2 (Jun 16) | 2026-06-16 |
| MiniMax | 4 | MiniMax-M3 | 2026-06-01 |
| Thinking Machines Lab | 2 | Inkling / Inkling Small | 2026 mid-year |
| NVIDIA | 3 | Nemotron 3 Ultra / Super / Nano | 2026 mid-year |
| Groq (inference) | many via passthroughs | Kimi K2.5, Qwen 3 32B, GPT-OSS-* | — |
| Cerebras (inference) | 3 direct: GPT-OSS-120B, Gemma 4 31B, GLM-4.7 | — | — |
| Fireworks.ai (inference) | many via passthroughs | GLM 5.2, Kimi K3, etc. | — |
| OpenRouter (gateway) | most models mirrored | — | — |
| Cohere | 1 embedding + 4 rerankers (separate file) | rerank-v4-pro / rerank-v4-fast | Dec 2025 |
| Black Forest Labs | 2 image gen | FLUX.2 Pro, FLUX 1.1 Pro | 2025-10-01 |
| Inception Labs | 2 diffusion LLM | Mercury 2, Mercury Edit 2 | — |
| MiniMax, Groq, others | — | — | — |

---

## New Models Available

### 1. Zhipu AI — **GLM-5.3** *(NEW — not in inventory)*

- **Released**: 2026-08-14
- **Vendor / Developer**: Z.AI (Zhipu AI) — already an existing vendor
- **Positioning**: New Z.AI flagship, successor to GLM-5.2. 743B base parameters. Claims CyberGym and AutomationBench leadership.
- **Availability today**: **GLM Coding Plan only** (starts at $18/mo) and Z.AI's ZCode agent. Public per-token API pricing has *not been posted* on the rate card as of 2026-08-24. Weights staged behind safety review.
- **Recommendation**: Add a placeholder model record with Z.AI as Model Developer and (once available) OpenRouter / Fireworks.ai as inference providers. Do not add a `MJ: AI Model Costs` row yet — flag pricing as TBD in the description. Suggested ranks: **PowerRank ≈ 23 · SpeedRank ≈ 6 · CostRank ≈ 5** (relative to GLM-5.2 at P=22, S=7, C=4).
- **Sources**:
  - <https://www.explainx.ai/blog/glm-5-3-launch-cyber-defense-benchmarks-august-2026>
  - <https://models.dev/models/zhipuai/glm-5.3/>
  - <https://emergent.sh/news/glm-53-officially-launched>

### 2. Anthropic — **Claude Mythos 5** *(NEW — restricted access)*

- **Released**: 2026-06-09 (same day as Fable 5)
- **Vendor / Developer**: Anthropic
- **Positioning**: Same weights as Fable 5, but with safeguards removed in specific categories (cybersecurity, biology research). Anthropic pricing published at $10 / $50 per 1M — identical to Fable 5.
- **Availability**: Restricted-access program — small pool of vetted partners only. Not a general-availability model.
- **Recommendation**: **Do not add to inventory** at this time — this is not a general-availability API model, and there is no `claude-mythos-5` API identifier reachable by ordinary API keys. Flag here for awareness. Reconsider if Anthropic broadens access.
- **Sources**:
  - <https://www.anthropic.com/claude/mythos>
  - <https://yellow.com/news/claude-mythos-token-pricing-ai-model>

### 3. Black Forest Labs — **FLUX.2 Klein / Flex / Max** *(potential gaps)*

- **Status**: FLUX.2 catalog on bfl.ai now lists **Klein 4B** ($0.014/image), **Klein 9B** ($0.015), **Pro** ($0.03), **Flex** ($0.05), and **Max** ($0.07). Inventory has only **FLUX.2 Pro** and legacy **FLUX 1.1 Pro**.
- **Recommendation**: Consider adding Klein (budget), Flex (mid), and Max (premium) tiers as separate models — but they are all image-generation with per-image pricing (not per-1M-tokens), and the existing FLUX.2 Pro record already uses `OutputPricePerUnit` = `$0.03` with a null unit. Deferring here because the FLUX.2 Pro record itself was last touched **2025-10-01** and has a stale `StartedAt`; the whole FLUX.2 family probably wants a coordinated refresh rather than piecemeal additions.
- **Sources**:
  - <https://bfl.ai/pricing?category=flux.2>
  - <https://pricepertoken.com/flux-pricing>

---

## Pricing Changes Detected

| Model | Vendor | Previous (In / Out per 1M) | Current (In / Out per 1M) | Status in Inventory |
|---|---|---:|---:|---|
| GPT 5.6-terra | OpenAI | $2.50 / $15 | **$2.00 / $12** | ✅ **Already reflected** — cost record dated 2026-07-30 |
| GPT 5.6-luna | OpenAI | $1.00 / $6.00 | **$0.20 / $1.20** | ✅ **Already reflected** — cost record dated 2026-07-30 |
| Claude Sonnet 5 | Anthropic | Was set to revert to $3 / $15 on 2026-09-01 | **$2 / $10 permanent** (announced 2026-08-11) | ⚠️ **Minor semantic drift** — inventory carries a duplicate `$2/$10` cost record with `StartedAt=2026-09-01` that presumably anticipated the revert; the values are correct but the second record is now redundant. Safe to leave or consolidate. |
| DeepSeek V4 Pro | DeepSeek direct | multiple historical | **Off-peak $0.435 / $0.87, Peak $1.32 / $3.96** (per official docs Aug 2026) | ⚠️ **Contradiction** — inventory's newest DeepSeek cost record dated 2026-08-16 is `$0.66 / $1.98`, which doesn't match either published tier. Recommend the human owner reconcile against <https://deepseek.ai/pricing> before touching. |

Not a pricing change but worth flagging:

- **GPT-5.6 Sol pricing conflict** — search results disagree on whether `gpt-5.6-sol` currently bills at $5 / $30 (unchanged) or at a promotional $4 / $20 through Nov 21, 2026. Inventory has "GPT 5.6" at `gpt-5.6` (which aliases to Sol per OpenAI's docs) priced at **$5 / $30 starting 2026-07-10**. Do not adjust until this resolves against openai.com's own rate card.

---

## Model Updates & New Versions

### DeepSeek V4-Pro-0813 checkpoint (GA 2026-08-13)

- **What changed**: DeepSeek shipped a new V4 Pro checkpoint (`0813`) with DSpark speculative decoding, reasoning-effort levels (low/high/max) on both Pro and Flash, a native OpenAI Responses API, and published concurrency limits (500 Pro / 2,500 Flash). Same `deepseek-v4-pro` API name.
- **Inventory impact**: The existing `DeepSeek V4 Pro` model row (`APIName: deepseek-v4-pro`) still applies. The description should be updated to note DSpark + effort levels + Responses API support — and `SupportsEffortLevel` should likely be flipped to `true` on the DeepSeek and OpenRouter vendor rows.
- **Recommendation**: Human-review the `SupportsEffortLevel` change; agents that dispatch prompts may switch behavior once it's set. Not applied here.

### Grok 4.6 (already in inventory, no changes)

- Released 2026-08-12. Inventory has it correctly at `$2 / $6` per 1M with 500K context and 128K max output. No action.

### Qwen 3.8 Max (already in inventory, no changes)

- Released 2026-08-03. Inventory has correct pricing ($2 / $6) and context (1M in / 128K out). No action.

### Kimi K3 (already in inventory, no changes)

- Released 2026-07-16 (Moonshot API), open weights 2026-07-27. Inventory has correct pricing and both Moonshot AI direct and Fireworks.ai passthrough rows.

---

## Deprecated / Sunset Models

### GLM-4.7 on Cerebras — deprecating 2026-08-17

- Cerebras announced GLM-4.7 as **Preview only**, with deprecation date **2026-08-17** (already past as of this report on 2026-08-24). Cerebras' current supported production model is **GPT-OSS-120B**; Gemma 4 31B remains Preview.
- **Inventory impact**: `GLM 4.7` has three inference-provider vendor rows: OpenRouter (`z-ai/glm-4.7`), Cerebras (`zai-glm-4.7`), and Fireworks.ai (`accounts/fireworks/models/glm-4p7`). **Only the Cerebras row needs deactivation** — OpenRouter and Fireworks.ai continue to serve GLM-4.7 traffic normally.
- **Recommendation**: Change the Cerebras vendor row `Status` from `"Active"` to `"Inactive"` and also `Status` on the Cerebras-side cost record. **Applied in this PR** — see `metadata/ai-models/.ai-models.json`, `GLM 4.7` entry.
- **Sources**:
  - <https://inference-docs.cerebras.ai/models/overview>
  - <https://www.explainx.ai/blog/glm-5-3-launch-cyber-defense-benchmarks-august-2026> (references the Cerebras GLM-4.7 deprecation timeline)

### `rerank-v3.5` migration to `rerank-v4-fast` — 2026-08-01

- Already correctly noted in inventory (`.cohere-reranker-models.json`). No changes needed.

---

## New Vendors Worth Considering

None identified this week. The current vendor set of 30 covers every major frontier model developer, mainstream inference provider (Groq, Cerebras, Fireworks.ai, OpenRouter), and hyperscaler AI gateway (Azure, Amazon Bedrock, Vertex AI).

**Watchlist** for future weeks:
- **Meta / Llama 5** — Meta CEO signaled a "resume open-source" plan; no dated release, no API surface as of 2026-08-24. Add if / when it ships.
- **Together AI** — used by several teams as a Llama / Qwen / DeepSeek serverless provider; no MJ vendor row exists. Adding it is optional and would primarily give an alternative Priority target on existing open-weight models.

---

## Recommended Actions

Ranked by confidence and impact:

1. **[Applied]** Mark the Cerebras vendor row on `GLM 4.7` as `Status: "Inactive"` — well-documented deprecation dated 2026-08-17. Leave OpenRouter and Fireworks.ai vendor rows Active.
2. **[Applied]** Add a `GLM-5.3` model record with Z.AI as Model Developer and OpenRouter as Inference Provider (`z-ai/glm-5.3`). Include the "pricing TBD" note in Description and defer the `MJ: AI Model Costs` array — Zhipu has not yet posted a per-token rate.
3. **[Flagged, not applied]** Reconcile `DeepSeek V4 Pro` cost record dated `2026-08-16` ($0.66 / $1.98) against DeepSeek's official price page — this rate doesn't map to either the current off-peak ($0.435 / $0.87) or peak ($1.32 / $3.96) tier.
4. **[Flagged, not applied]** Confirm the `GPT 5.6` (Sol) cost record — the reports are conflicting, and OpenAI's own pricing page should be the tiebreaker before we touch the Jul 10 record.
5. **[Flagged, not applied]** Consider adding FLUX.2 Klein / Flex / Max as separate model records — the whole FLUX.2 family's `StartedAt` metadata is stale (2025-10-01) and would benefit from a coordinated refresh rather than a one-off addition.
6. **[Flagged, not applied]** Update `DeepSeek V4 Pro` and `DeepSeek V4 Flash` descriptions to reference the 0813 checkpoint, DSpark speculative decoding, and reasoning-effort levels; consider flipping `SupportsEffortLevel: true` on the DeepSeek vendor rows once the agent runtime is verified to handle it.
7. **[Flagged, not applied]** Consolidate the redundant Claude Sonnet 5 `$2 / $10` cost row dated `2026-09-01` now that Anthropic has made those rates permanent (announced 2026-08-11).

---

## Research Sources

Anthropic / Claude:
- <https://www.anthropic.com/news/claude-opus-5>
- <https://www.anthropic.com/claude/mythos>
- <https://platform.claude.com/docs/en/about-claude/pricing>
- <https://www.tldl.io/resources/anthropic-api-pricing>
- <https://benchlm.ai/anthropic/api-pricing>

OpenAI / GPT:
- <https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/>
- <https://openai.com/index/previewing-gpt-5-6-sol/>
- <https://openai.com/index/gpt-5-6/>
- <https://developers.openai.com/api/docs/models/gpt-5.6-sol>
- <https://www.cnbc.com/2026/07/30/open-ai-price-cut-gpt.html>
- <https://explainx.ai/blog/openai-gpt-5-6-luna-terra-price-cuts-july-2026>
- <https://www.morphllm.com/openai-api-pricing>

Google / Gemini:
- <https://ai.google.dev/gemini-api/docs/pricing>
- <https://benchlm.ai/google/api-pricing>
- <https://ai.google.dev/gemini-api/docs/changelog>

xAI / Grok:
- <https://benchlm.ai/xai/api-pricing>
- <https://www.grizzlypeaksoftware.com/articles/p/grok-api-pricing-explained-every-model-every-cost-and-how-it-compares-2026-f1p7dvdu>

Mistral:
- <https://www.aipricing.guru/mistral-ai-pricing/>
- <https://benchlm.ai/mistral/api-pricing>

DeepSeek:
- <https://deepseek.ai/pricing>
- <https://codersera.com/blog/deepseek-v4-complete-guide-2026/>
- <https://benchlm.ai/deepseek/api-pricing>

Alibaba / Qwen:
- <https://www.alibabacloud.com/help/en/model-studio/model-pricing>
- <https://datanorth.ai/news/alibaba-releases-qwen3-8-max>
- <https://openrouter.ai/qwen/qwen3.8-max>
- <https://www.developersdigest.tech/blog/qwen-3-8-max-release-2026>

Moonshot / Kimi:
- <https://codersera.com/blog/kimi-k3-complete-guide-2026/>
- <https://benchlm.ai/moonshot/api-pricing>

Groq:
- <https://www.cloudzero.com/blog/groq-pricing/>
- <https://www.eesel.ai/blog/groq-pricing>

Cerebras:
- <https://inference-docs.cerebras.ai/models/overview>
- <https://llm-stats.com/providers/cerebras>

Fireworks.ai:
- <https://www.spheron.network/blog/fireworks-ai-pricing-2026-inference-api/>

Zhipu / GLM:
- <https://emergent.sh/news/glm-53-officially-launched>
- <https://models.dev/models/zhipuai/glm-5.3/>
- <https://www.explainx.ai/blog/glm-5-3-launch-cyber-defense-benchmarks-august-2026>
- <https://glm-5.org/>

MiniMax:
- <https://artificialanalysis.ai/models/minimax-m3>
- <https://openrouter.ai/minimax/minimax-m3>

Cohere:
- <https://openrouter.ai/cohere/rerank-4-pro>
- <https://openrouter.ai/cohere/rerank-4-fast>
- <https://docs.cohere.com/docs/deprecations>

Black Forest Labs:
- <https://bfl.ai/pricing?category=flux.2>
- <https://docs.bfl.ai/quick_start/pricing>

NVIDIA / Nemotron:
- <https://research.nvidia.com/labs/nemotron/Nemotron-3-Ultra/>
- <https://nvidianews.nvidia.com/news/nvidia-debuts-nemotron-3-family-of-open-models>

Meta / Llama:
- <https://manifold.markets/winged_one/when-will-meta-release-llama-5>
- <https://aipricing.org/brands/meta-llama>
