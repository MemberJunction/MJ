---
"@memberjunction/ai": minor
---

Add the **Gemini 3.6 Flash** (`gemini-3.6-flash`) and **Gemini 3.5 Flash-Lite** (`gemini-3.5-flash-lite`) AI models to the model catalog metadata.

Both shipped GA/Stable on July 21, 2026 and are driven by the existing `GeminiLLM` / `VertexLLM` / `OpenRouterLLM` drivers. Each is registered with Google and Vertex AI as Model Developer + Inference Provider plus an OpenRouter inference row, and chained via `PriorVersionID` to its predecessor.

- **Gemini 3.6 Flash** (`PriorVersionID` → Gemini 3.5 Flash) — a token-efficiency refresh, not a new capability tier; the model card states it "is based on Gemini 3.5 Flash" and defers architecture, training data, and safety policy to the 3.5 Flash card. 1,048,576 input / 65,536 output tokens, thinking supported, knowledge cutoff March 2026. Output drops to `$7.50`/1M from 3.5 Flash's `$9.00` while emitting ~17% fewer output tokens; input is unchanged at `$1.50`/1M. Cache read `$0.15`/1M (0.1× input, Gemini Family A), no cache-write charge. Leads on computer use (OSWorld-Verified 83.0), chart reasoning, and long-context recall; trails frontier models on SWE-Bench Pro and Terminal-bench 2.1. Live API and image/audio generation are not supported.
- **Gemini 3.5 Flash-Lite** (`PriorVersionID` → Gemini 3.1 Flash-Lite) — cost-optimized tier at `$0.30`/`$2.50` per 1M, cache read `$0.03`/1M (0.1× input). Same 1M/64K token envelope with configurable thinking levels; 74.0 on OSWorld-Verified. Prices text, image, video **and** audio input at one unified rate — a departure from Gemini 2.5 Flash and 3.1 Flash-Lite, which charged an audio premium. Google is the only real inference host: OpenRouter is a router whose upstreams resolve to Google AI Studio and Vertex only, so there is no third-party failover path.

Neither model is context-length tiered — both are flat-rate across the full 1M window, unlike the Pro line.

Two notes carried in the cost-row `Comments` for whoever reads this later:

- **Do not route Gemini 3.6 Flash via the `gemini-flash-latest` alias.** The Gemini API changelog only ever repointed that alias to `gemini-3.5-flash` (May 19, 2026); the July 21 entry does not repoint it. Traffic assuming otherwise silently lands on 3.5 Flash at `$9.00`/1M output — a 20% overspend. Pin the explicit id.
- **Same-day-launch recency.** Specs and pricing were verified against primary Google sources (per-model `ai.google.dev` pages, the pricing page, the launch blog, the API changelog, and the DeepMind model card PDFs) on the launch date itself, 2026-07-21. Same-day docs are the least stable kind — re-verify before these figures back a contractual cost model. LiteLLM's `model_prices_and_context_window.json` does not yet carry either model, so LiteLLM-based cost tracking will not price them correctly until that map updates.

Delivered as declarative metadata only (`.ai-models.json`: 2 models + 10 vendor rows + 4 cost rows, CLI-`uuidgen` primaryKeys, no sync blocks) — the consolidated metadata-sync migration is generated at release time by the build engineer's `mj sync push` against a clean last-release DB, per the release workflow documented in `metadata/CLAUDE.md`.
