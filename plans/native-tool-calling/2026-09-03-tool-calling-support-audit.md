# Tool-Calling Support Audit — AI Models × AI Model Vendors

**Date:** 2026-09-03 (web-verified as of this date; provider catalogs churn — recheck at integration time)
**Purpose:** Source data for seeding `ModelConfiguration.LLM.SupportsNativeToolCalling`
(and vendor-level overrides) in `metadata/ai-models/.ai-models.json` once the
`IAIModelConfiguration.LLM` interface extension lands (implementation plan §4.1).
**Scope:** All 126 **active** LLM-type models in the catalog (153 LLM total; the 27
inactive models were not researched — they are already retired/disabled and can be
flagged opportunistically). The 36 non-LLM models (embeddings, audio, video, rerankers)
are out of scope — tool calling is N/A.
**Method:** Catalog inventory extracted from `.ai-models.json`; support verified by
parallel web research against provider documentation, model pages, OpenRouter's
per-endpoint API, and issue trackers. Every verdict carries a confidence level;
sources are cited per section.

---

## 1. How to encode the results (for the metadata update)

1. **Model level** — set `ModelConfiguration.LLM.SupportsNativeToolCalling: true` on
   every model marked **Yes** in §3; set `false` only for the hard NOs (§2). Leave the
   property **absent** (inherit/unknown) for Unknown verdicts — absent ≠ false in the
   cascade, and absent is the honest value.
2. **Vendor level** — add an override **only where a specific serving path differs
   from the model verdict** (flagged ⚠ in §3): e.g. `false` on the Groq Compound row,
   or on an OpenRouter row whose providers don't expose `tools`.
3. **Retired vendor rows** (flagged ✝ in §3) should be fixed by updating `Status` /
   `IsActive`, not by tool-calling flags — the audit found substantial catalog staleness
   (§4) that is worth cleaning in the same metadata pass.
4. **`DefaultToNativeToolCalling`** — leave absent (= false) **everywhere** in this
   pass. Turning defaults on is gated by the test plan's stage gates (test plan §6.3),
   per provider, after N1 passes.
5. **Type level (`AIModelType.ModelConfiguration`)** — set nothing; the absent base
   already resolves to false.

---

## 2. Headline results

Native tool calling is **near-universal among active frontier models**. The exceptions
matter more than the rule:

**Hard NO (set `SupportsNativeToolCalling: false`):**

| Model | Why |
|---|---|
| o1-mini | Function calling not supported at all — model-level limitation on every vendor |
| Mercury Edit 2 (Inception) | Next-edit-prediction model on a custom `/v1/edit/completions` endpoint; no `tools` param — not a chat model |
| Mixtral 8x7B | No native function calling in its chat template (unlike 8x22B); also retired on La Plateforme ~3/2025 |
| Mistral Medium (legacy 23.12) | Predates Mistral's function-calling rollout; retired |
| Llama 2 70B / Groq | Predates Groq tool use; retired from Groq catalog |
| Groq Compound | ⚠ Built-in server-side tools only (web search, code exec, Wolfram); docs explicitly state custom user-provided tools are **not supported** — do not send a `tools` array |
| DeepSeek R1 Distill Llama 3.3 70B | Effectively unavailable: retired on Groq (10/2025, never in its tool-use list) and Cerebras (8/2025); sole remaining OpenRouter provider rejects `tools`; forced `<think>` prefix breaks tool output |

**Degraded / unreliable (supported on paper, flag with caution notes):**

| Model | Issue |
|---|---|
| o1-pro | Documented reports of describing function calls in prose instead of emitting tool calls — treat as unreliable |
| Qwen 3.5 Plus | Documented multi-step agent-loop degradation (reverts to raw text after a few successful calls) + tool hallucination (QwenLM issues #12/#15) |
| GLM 5.1 on OpenRouter | Default endpoint rejects `tools`; ~9 of its providers support tools, 2 don't — requires provider pinning |
| MiniMax-M3 on OpenRouter | Page FAQ claims no tools but endpoints API shows ~9/11 providers support them (avoid DeepInfra/Novita; MiniMax's own OR endpoint caps `tool_choice` at none/auto) — requires provider pinning |
| Qwen 3.6 open-weight (27B, 35B A3B) self-hosted | Community-reported regression (malformed/empty/silent calls, quant + template sensitive); hosted commercial endpoints unaffected |
| GPT 4.1 Nano | Snapshot bug duplicating parallel calls to the same tool — recommend `parallel_tool_calls: false` |
| GPT-OSS-20B | Occasionally misformats calls on complex multi-step tasks; host harmony-parser quality varies |

**Unknown (leave flag absent):** Betty Bot (Tasio Labs — proprietary association
chatbot, no public model API or tools documentation).

---

## 3. Per-model verdicts

Legend: ⚠ = vendor-level override needed · ✝ = stale/retired vendor row (fix Status
instead) · Confidence is *verified* unless noted.

### Anthropic Claude (vendors: Anthropic, Amazon Bedrock, OpenRouter)

| Model | Verdict | Notes |
|---|---|---|
| Claude 3.5 Sonnet | Yes (while live) | ✝ **Retired at Anthropic 10/28/2025** (404s); not carve-out-listed for Bedrock — deactivate |
| Claude 4.5 Sonnet / 4.5 Opus / Haiku 4.5 | Yes | Parallel default-on; forced `tool_choice` (`any`/`tool`) incompatible with extended thinking on this generation |
| Claude Sonnet 4.6 / Sonnet 5 / Opus 4.6 / 4.7 / 4.8 / Opus 5 | Yes | Full surface incl. `strict: true` and fine-grained tool streaming. ⚠ **Bedrock divergence (Sonnet 5 verified):** forced `tool_choice` requires `thinking: disabled` on Bedrock (not on 1P/Vertex). Anthropic server-side tools not on Bedrock; tool search on Bedrock is InvokeModel-only |
| Claude Opus 5 Fast | Yes | ⚠ **Claude API only** (research preview) — ✝ the catalog's OpenRouter vendor row is an error; not on Bedrock/Vertex/OpenRouter |
| Claude Fable 5 | Yes | Thinking always on (forced `tool_choice` inherits thinking-on path — test before relying on it); safety classifiers can end tool loops with `stop_reason: refusal`; requires 30-day retention |

### OpenAI (vendors: OpenAI, Azure, OpenRouter; GPT-OSS also Bedrock/Cerebras/Fireworks/Groq/LM Studio)

| Model | Verdict | Notes |
|---|---|---|
| GPT 4o / 4o-mini / 4.1 / 4.1-mini | Yes | Full parity incl. parallel across vendors |
| GPT 4.1 Nano | Yes | Duplicate-parallel-call snapshot bug (see §2) |
| GPT 5 / 5-mini / 5-nano | Yes | Freeform custom tools + CFG grammars are Responses-API features; 5-mini flakiness reports on Responses |
| GPT 5.1-codex-max / 5.1-codex-mini | Yes | ⚠ **Responses API only** (no Chat Completions) — driver must use the right surface |
| GPT 5.2 / 5.2-codex | Yes | 5.2-codex supports both Chat Completions and Responses |
| GPT 5.4 / 5.4-mini / 5.4-nano | Yes | 5.4 adds server-side `tool_search` |
| GPT 5.5 / 5.5 Instant / 5.5 Pro | Yes | 5.5 Pro ⚠ Responses-only; 5.5 Instant = moving `chat-latest` alias (pin gpt-5.5 for production) |
| GPT 5.6 / 5.6-luna / 5.6-terra | Yes | 5.6 adds programmatic tool calling (Responses-only). ✝ luna/terra catalog says OpenAI-only but both are live on OpenRouter **and** Amazon Bedrock — vendor rows missing |
| o1 | Yes | Non-preview o1 only |
| o1-mini | **No** | Hard model-level no (§2) |
| o1-pro | Unreliable | See §2; Responses-only |
| o3 / o3-mini / o4-mini | Yes | Reasoning persistence across tool calls needs Responses API; Azure reasoning caveat below |
| GPT-OSS-120B | Yes | Native (harmony format) on all six serving vendors. ⚠ Groq: **no parallel tool calls** for gpt-oss models; Cerebras: known tool-hallucination quirk (may call unspecified tools) |
| GPT-OSS-20B | Yes | Same, less reliable (§2) |

**Azure parity:** yes overall, with one systemic caveat — for reasoning models
(o-series, GPT-5 reasoning), Chat Completions can't combine function tools with
reasoning unless `reasoning_effort: none`; Microsoft recommends the Responses API for
tool calling on those models. Plus naming/region rollout lag.

### Google (vendors: Google, Vertex AI, OpenRouter)

Series-wide caveats: Gemini 3.x function calling uses **thought signatures that must be
echoed back** in multi-turn tool loops (SDKs handle it; raw HTTP/proxy paths can break);
Gemini 2.x cannot combine structured output with function calling in one request
(3.x can).

| Model | Verdict | Notes |
|---|---|---|
| Gemini 1.5 Flash / 1.5 Pro | N/A | ✝ **Retired 9/29/2025** on Gemini API and Vertex — all requests 404; deactivate |
| Gemini 2.5 Flash / 2.5 Pro | Yes | ✝ Deprecated — shutdown ~10/16/2026; replacements gemini-3.6-flash / 3.1-flash-lite |
| Gemini 2.5 Flash Preview / Pro Preview | N/A | ✝ Preview IDs **shut down 12/2/2025** — dead; deactivate |
| Gemini 3 Flash | Yes | ✝ Superseded/deprecated (off the current models page; Copilot removed it 7/2026) — this is Skip's current Query Writer model, reinforcing the migration pressure |
| Gemini 3.1 Flash-Lite | Yes | Shutdown announced 5/7/2027 |
| Gemini 3.1 Pro | Yes | Still a Preview ID — pin with care |
| Gemini 3.5 Flash / 3.5 Flash-Lite | Yes | 3.5 Flash: combined tool use with grounding/code-exec; no Computer Use |
| Gemini 3.6 Flash / 3.7 Flash | Yes | 3.7 Flash GA 8/13/2026. **Catalog gap:** Gemini 3.8 Flash (GA 9/2/2026) is now the top Flash model and absent from the catalog |
| Gemma 4 26B A4B / 31B Instruct | Yes | **Changed vs Gemma 3**: the Gemini API now accepts `tools` for Gemma 4 with official examples. Cerebras 31B: tools + parallel + `strict` (26B not on Cerebras). ⚠ Vertex self-deployed endpoints need vLLM parser flags — support depends on serving config. Prefer post-7/15/2026 weights (tool-call JSON fix) |

### x.ai Grok (vendors: x.ai, OpenRouter; Grok 4.6 also Bedrock)

| Model | Verdict | Notes |
|---|---|---|
| Grok 4.20 / 4.3 / 4.5 | Yes | API-wide function calling (parallel default-on; calls arrive whole in one streaming chunk). 4.3 has its own Bedrock model card. Confidence: inferred from API-wide docs (xAI docs are 4.6-centric) |
| Grok 4.6 | Yes | Verified on x.ai and Bedrock (Converse + OpenAI-compatible endpoints). ⚠ Bedrock: xAI server-side tools (web/X search) unavailable — client-side function calling only; encrypted reasoning content must round-trip |
| Grok Build 0.1 | Yes | Tool calling explicitly announced; public beta |

### Mistral (vendors: Mistral AI, some Amazon Bedrock, OpenRouter)

| Model | Verdict | Notes |
|---|---|---|
| Mistral Large 3 | Yes | Current flagship; `tool_choice` auto/any/none + `parallel_tool_calls` (default true) |
| Mistral Medium 3.5 / Small 4 / Codestral 2508 | Yes | Small 4 verdict inferred from line-level support (3.x on the official FC list) |
| Magistral Medium 1.2 / Small 1.2 | Yes | ✝ Deprecation window on La Plateforme ended 7/31/2026 — likely retired there; Bedrock rows may persist; verify |
| Mistral Large (legacy 24.11) | Yes | ✝ Retired on La Plateforme (2–5/2026); Bedrock Converse still supports tools |
| Mistral Medium (legacy) | **No** | §2 — predates function calling; retired |
| Mixtral 8x7B | **No** | §2 — no native FC in template; retired on La Plateforme |

### Meta Llama (vendors: Groq, Cerebras, OpenRouter)

Model-level: Llama 3.1+/4 support native function calling (Meta chat template);
Llama 3.0 supported Groq tool use while hosted. Vendor reality is mostly stale:

| Model | Verdict | Notes |
|---|---|---|
| Llama 3 70b | Yes (model) | ✝ Retired on Groq 8/2025; OpenRouter provider-dependent |
| Llama 3.1 405b | Yes (model) | ✝ Never GA on Groq (remove row); OpenRouter via Fireworks/DeepInfra etc. |
| Llama 3.1 8b | Yes incl. parallel | ✝ Groq shutdown 8/16/2026 (enterprise exempt); Cerebras deprecated 5/2026 |
| Llama 3.3 70B Versatile | Yes incl. parallel | ✝ Groq shutdown 8/16/2026 (→ gpt-oss-120b / qwen3.6-27b); Cerebras deprecated 2/2026; OpenRouter fine |
| Llama 4 Maverick | Yes (model) | ✝ Groq retired ~3/2026; Cerebras retired 10/2025 |
| Llama 4 Scout | Yes (model) | ✝ Groq retired 7/17/2026; Cerebras retired 11/2025 |

### Z.AI GLM (vendors: Z.AI, Cerebras, Fireworks.ai, OpenRouter)

Z.AI API quirks (all Z.AI-served rows): `tool_choice` supports **only `"auto"`** (no
forced/none); streaming tool calls require non-standard `tool_stream=True`; parallel
undocumented. Raw GLM output wraps calls in `<tool_call>` tags inside `<think>` —
third-party parser quality varies.

| Model | Verdict | Notes |
|---|---|---|
| GLM 4.6 | Yes | ✝ Cerebras deprecated 1/20/2026; Cerebras/Fireworks are NOT OpenRouter providers for it (direct APIs required) |
| GLM 4.7 | Yes | ✝ Cerebras deprecated 8/17/2026 (→ GLM 5.1). Fireworks `glm-4p7` yes — but its `glm-4p7-flash` variant does NOT support FC (not in our catalog; don't confuse) |
| GLM 5 | Yes | OpenRouter verified; Z.AI direct inferred (docs page removed) |
| GLM 5.1 | Yes ⚠ | OpenRouter default endpoint rejects tools — **pin a tools-capable provider** (StreamLake, Chutes, DeepInfra, SiliconFlow, Phala, AtlasCloud, Alibaba, Nebius, Friendli); Cerebras serves it in the large-model tier |
| GLM 5.2 | Yes | 30+ OR endpoints incl. Fireworks; a few lack tools (Ambient, SiliconFlow, GMICloud) — pin if needed |
| GLM 5.3 | Yes | Reasoning always on (cannot disable) — reasoning tokens alongside tool calls |
| GLM-5.3-Flash | Yes | Multimodal ~1.3M ctx; OR `response_format` not schema-enforced |
| GLM 5V Turbo | Yes | Vision-agent model; ⚠ only one OpenRouter provider (Z.ai) — no failover |

### Moonshot Kimi (vendors: Moonshot AI, Fireworks.ai, Groq, OpenRouter)

| Model | Verdict | Notes |
|---|---|---|
| Kimi K2 | Yes | ⚠ Groq expects historical tool-call IDs as `functions.func_name:idx` (breaks naive multi-turn loops); OR down to one provider (NovitaAI), no `response_format` |
| Kimi K2.5 | Yes | ✝ **Retired on Moonshot's own API 8/31/2026 (404)** — serve via Fireworks/OpenRouter or migrate to K3 |
| Kimi K2.6 | Yes | Parallel + streaming tools documented; strict tool_call_id sequencing |
| Kimi K2.7-Code | Yes | Moonshot ID is `kimi-k2.7-code-highspeed`; always thinking mode (harness must preserve reasoning) |
| Kimi K3 | Yes | Flagship, 1M ctx; parallel + streaming documented; function-name regex `^[a-zA-Z_][a-zA-Z0-9-_]{0,127}$` — **relevant to MJ's action-name sanitization** (impl plan §8.2) |
| Kimi K3 Fast | Yes | Fireworks-only speed router over K3 (+50% price); not a distinct Moonshot model |

### MiniMax (vendors: MiniMax, Fireworks.ai, OpenRouter)

Family-wide: raw output is XML-style tool calls (`<minimax:tool_call>`/`<invoke>`) with
interleaved `<think>` — hosted gateways translate to JSON; self-hosting needs
vLLM/SGLang parsers. Streaming+tools undocumented.

| Model | Verdict | Notes |
|---|---|---|
| MiniMax-M2.5 | Yes | OR: tools yes, no `response_format`; Fireworks: on-demand only (no serverless) |
| MiniMax-M2.5-highspeed | Yes | Same weights ~100 tok/s (MiniMax API) |
| MiniMax-M2.7 | Yes | OR adds structured outputs; Fireworks confirmed |
| MiniMax-M3 | Yes ⚠ | **Interleaved thinking is load-bearing** — full assistant response incl. reasoning must be preserved across tool turns or quality degrades. OR page FAQ wrongly says no tools; endpoints API shows ~9/11 providers support them — pin providers (avoid DeepInfra/Novita); MiniMax's own OR endpoint caps `tool_choice` at none/auto. Not on Fireworks |

### DeepSeek (vendors: DeepSeek, OpenRouter; distill: Cerebras/Groq/OpenRouter)

| Model | Verdict | Notes |
|---|---|---|
| DeepSeek V4 Flash / V4 Pro | Yes | **The historic "function calling unstable" warning is gone** — V4 documents native tools on OpenAI- and Anthropic-compatible surfaces + Responses API; strict schema mode via beta base_url (restricted keywords). OR: 29 providers, quality varies ("Exacto" routing prefers tool accuracy); Pro endpoint lacks schema enforcement |
| Deepseek R1 Distill Llama 3.3 70B | **No (effectively)** | §2 — all serving paths retired or tool-less |

### Alibaba Qwen (vendors: Alibaba Cloud, Cerebras, Groq, Fireworks.ai, LM Studio, OpenRouter)

Commercial (Model Studio): `parallel_tool_calls=True` supported; reasoning models need
`enable_thinking` set explicitly; **3.7-Max+ thinking+tools: `reasoning_content` must
be echoed back with tool results or accuracy degrades**.

| Model | Verdict | Notes |
|---|---|---|
| Qwen 3 235B | Yes | ✝ Cerebras retired (final variant 5/2026); Groq never listed (remove row); Fireworks on-demand only; OR fine |
| Qwen 3 32B | Yes | ✝ Cerebras retired 2/2026, Groq retired 7/17/2026; Fireworks on-demand only ("tool calling must be explicitly configured"); OR fine; hybrid thinking can interfere with parsing |
| Qwen 3 Coder 480B | Yes | ✝ Cerebras retired 11/2025 (→ GLM 4.7); Groq never listed; custom XML tool format — provider parsers convert, quality varies |
| Qwen 3 1.7B / 4B / 8B / 14B (LM Studio) | Yes | Hermes-style `<tool_call>` JSON parses natively; known LM Studio bugs with `<think>` tags breaking parsing — **disable thinking for agentic use**; reliability drops sharply below 8B |
| Qwen 3 Coder 30B (LM Studio) | Yes (format-fragile) | Custom XML format many OpenAI clients don't parse; needs recent LM Studio + fixed GGUF templates |
| Qwen 3.5 Plus | Yes (degraded) | §2 agent-loop degradation; OR slug is `qwen/qwen3.5-plus-02-15` |
| Qwen 3.6 27B / 35B A3B | Yes | Groq `qwen3.6-27b` has tools + parallel (one of Groq's current models); self-hosted/quantized regression reports (§2) don't affect hosted endpoints |
| Qwen 3.6 Flash / Plus / Max Preview | Yes | OR: single provider (Alibaba) for Flash/Plus — no failover; Max Preview subject to preview churn |
| Qwen 3.7 Flash / Max / Plus | Yes | reasoning_content echo requirement; 3.7 Plus is Alibaba's 1M-ctx flagship w/ built-in tools |
| Qwen 3.8 Max / Qwen3.8-Flash | Yes | Don't confuse commercial `qwen3.8-flash` with open-weight "Qwen3.8-Flash-Next" (Qwen4-arch preview) |

### Others

| Model | Verdict | Notes |
|---|---|---|
| Mercury 2 (Inception) | Yes | Tools + JSON-schema outputs on Inception API and OpenRouter; Azure Foundry tools inferred |
| Mercury Edit 2 | **No** | §2 — not a chat model |
| Nemotron 3 Nano / Super / Ultra (NVIDIA) | Yes | Tools + tool_choice on OpenRouter; Super/Ultra add JSON-schema structured outputs |
| Inkling / Inkling Small (Thinking Machines Lab) | Yes | Tools yes; `response_format` JSON **without** schema enforcement |
| Groq Compound | **No (user-defined)** | §2 — built-in server tools only |
| Betty Bot (Tasio Labs) | Unknown | Leave flag absent |

---

## 4. Catalog hygiene findings (fix alongside the flag pass)

Stale rows discovered during verification — worth a cleanup in the same metadata PR:

1. **Dead/retired models still active:** Gemini 1.5 Flash/Pro (retired 9/2025),
   Gemini 2.5 Preview variants (dead 12/2025), Claude 3.5 Sonnet (retired 10/2025).
2. **Dead/stale vendor rows:** all Groq + Cerebras rows for Llama 3.x/4 and Qwen 3
   large models; Cerebras GLM 4.6/4.7; Groq/Cerebras DeepSeek R1 Distill; Moonshot's
   own Kimi K2.5 row; Groq Llama 3.1 405b (never GA); Claude Opus 5 Fast's OpenRouter
   row (Claude API only).
3. **Missing vendor rows:** GPT 5.6-luna/terra on OpenRouter + Amazon Bedrock;
   GPT 5.5 Instant appearing in Azure Foundry.
4. **Missing models:** Gemini 3.8 Flash (GA 9/2/2026, now Google's top Flash model).
5. **Deprecation clocks ticking:** Gemini 2.5 Flash/Pro (~10/16/2026), Gemini 3 Flash
   (superseded — and it is Skip's current Query Writer model), Magistral 1.2 line on
   La Plateforme, Gemini 3.1 Flash-Lite (5/7/2027).

---

## 5. Per-vendor API semantics (for driver work and vendor-level flags)

| Vendor | Tools API | Key semantics |
|---|---|---|
| OpenAI | `tools` on Chat Completions + Responses | Some models Responses-only (5.1-codex-max/mini, 5.5 Pro, o1-pro); parallel default-on; strict mode available |
| Azure | Same as OpenAI | Reasoning models: tools + reasoning together require Responses API (or `reasoning_effort: none` on Chat Completions); region/naming lag |
| Anthropic | `tools` + `tool_use`/`tool_result` blocks | Parallel default-on (`disable_parallel_tool_use`); `strict: true`; forced `tool_choice` vs thinking interactions vary by generation |
| Google Gemini API | `tools`/`functionDeclarations` | 3.x: thought signatures must round-trip in tool loops; 3.x combines FC + structured output (2.x can't); forced mode via `function_calling_config.mode: ANY` |
| Vertex AI | Gemini/Claude parity | Self-deployed (Model Garden vLLM) tool support depends on serving config (parser flags) |
| Amazon Bedrock | Converse API `toolConfig` | Forced `toolChoice` only on documented models; Sonnet 5 forced-choice requires thinking off (diverges from 1P); no Anthropic server-side tools; Grok server-side tools unavailable |
| OpenRouter | OpenAI-shape passthrough | **Tools preserved only when routed to a supporting provider.** Soft preference routes `tools` to supporting backends, but set `require_parameters: true` or pin providers (`provider.only` + `allow_fallbacks: false`) for a hard guarantee; mid-conversation 5xx fallback can switch backends with different tool fidelity |
| Groq | OpenAI-compatible | "All hosted models support tool use"; parallel on llama-3.3-70b, llama-3.1-8b, qwen3.6-27b, minimax-m2.7 — **not** on gpt-oss models or qwen3.8-27b; Compound rejects user tools; heavy catalog churn |
| Cerebras | OpenAI-compatible | Strict mode (constrained decoding) + parallel at API level, per-model flags; **small rotating catalog (~5 serverless models)** — verify presence at integration time |
| Fireworks.ai | OpenAI-compatible | Per-model `supportsTools` flag; several catalog models are **on-demand only** (no serverless): Qwen 3 large, MiniMax M2.5; docs recommend temp 0.0–0.3 for tool selection |
| Mistral | `tools` + `tool_choice` auto/any/none | `parallel_tool_calls` default true |
| x.ai | `tools` API-wide | Parallel default-on; streaming delivers calls whole in one chunk; custom tools compose with server-side tools (1P only) |
| Alibaba Model Studio | OpenAI-compatible | `parallel_tool_calls=True`; `enable_thinking` per-request; reasoning_content echo requirement (3.7+) |
| Moonshot AI | OpenAI-compatible | Parallel + streaming documented; strict function-name regex; tool schemas count toward tokens |
| MiniMax | OpenAI + Anthropic-compatible | XML native format translated by gateway; reasoning preservation across tool turns is load-bearing (M3) |
| Z.AI | OpenAI-compatible | `tool_choice` **auto only**; streaming needs `tool_stream=True`; parallel undocumented |
| DeepSeek | OpenAI + Anthropic-compatible + Responses | Strict schema mode on beta base_url with keyword restrictions |
| Inception Labs | OpenAI-compatible (Mercury 2) | Mercury Edit 2 is a non-chat endpoint |
| LM Studio | OpenAI-compatible local | Template-dependent parsing; `<think>`-tag parser bugs; empty `tool_calls: []` can hang clients; small-model reliability warnings |
| Tasio Labs | Unknown | Proprietary; no public API docs |

---

## 6. Reconciled discrepancies

Where independent research passes disagreed, the deeper source won:

- **MiniMax-M3 on OpenRouter**: page FAQ says no tools; the per-endpoint API shows
  ~9/11 providers support them → verdict *provider-dependent, pin providers* (endpoints
  API is authoritative over page FAQ; same pattern as GLM 5.1).
- **DeepSeek R1 Distill on Groq**: one pass said "supported while live," the other
  found it absent from Groq's tool-use supported-models list → verdict *no*; either
  way the row is retired.
- **Cerebras Qwen/GLM presence**: official deprecation pages beat third-party claims →
  retired as listed above; Cerebras' catalog rotates aggressively, so treat any
  Cerebras row as verify-at-integration-time.

## 7. Cross-cutting observations for the implementation

1. **OpenRouter needs a driver-level decision**: with 106 of the catalog's model-vendor
   pairs on OpenRouter, whether the MJ OpenRouter driver sets `require_parameters: true`
   (or pins providers) when tools are passed is effectively the vendor-level
   support answer for a third of the catalog. Recommend: set it when
   `ChatParams.tools` is non-empty.
2. **Reasoning/thinking × tools is the recurring interaction**: thought-signature
   round-tripping (Gemini 3.x), reasoning_content echo (Qwen 3.7+), interleaved-thinking
   preservation (MiniMax, Kimi K2.7), forced-choice-vs-thinking rules (Anthropic,
   Bedrock). The Phase B BaseLLM matrix (test plan §6.2) should include a
   thinking-enabled column for exactly these families.
3. **Name constraints validate the §8.2 sanitization design**: Moonshot enforces
   `^[a-zA-Z_][a-zA-Z0-9-_]{0,127}$` — MJ's action-name sanitizer should target the
   intersection of provider constraints (alphanumeric + `_-`, ≤64 chars to satisfy
   OpenAI/Anthropic).
4. **Parallel tool calls are NOT uniform** even within one vendor (Groq per-model
   list; GPT 4.1 Nano bug) — `ChatParams.parallelToolCalls` must stay per-call and
   drivers must not assume support.
