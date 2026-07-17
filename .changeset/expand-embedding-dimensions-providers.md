---
"@memberjunction/ai-cohere": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-mistral": patch
"@memberjunction/ai-azure": patch
"@memberjunction/ai-bedrock": patch
---

Expand optional embedding `dimensions` support to the remaining drivers whose underlying APIs support output-dimension control. `params.dimensions` (added to `EmbedTextParams`/`EmbedTextsParams`/`EmbedContentParams` in `@memberjunction/ai`) is opt-in everywhere: when unset, prior behavior is unchanged.

- **`@memberjunction/ai-cohere`** — forwarded as `outputDimension` on the v2 embed API (`EmbedText`, `embedBatch`, and multimodal `EmbedContent`). Supported by `embed-v4.0` (256/512/1024/1536).
- **`@memberjunction/ai-gemini`** — forwarded as `config.outputDimensionality` (`EmbedText`, the per-text concurrent `EmbedTexts` path, and multimodal `EmbedContent`).
- **`@memberjunction/ai-mistral`** — forwarded as `outputDimension`; only effective on models supporting output truncation (e.g. `codestral-embed`).
- **`@memberjunction/ai-azure`** — the REST body previously hardcoded `dimensions: 1536` on every request; `dimensions` is now sent only when the caller explicitly provides it. This fixes a latent bug: older models (e.g. `text-embedding-ada-002`, the driver's default) don't accept the parameter, and models with larger native outputs (e.g. `text-embedding-3-large` at 3072) were being silently truncated to 1536. Omitting it lets the selected model produce its native dimensionality. Note: deployments that relied on the implicit 1536 truncation with `text-embedding-3-*` models should now set the dimension explicitly via `VectorIndex.Dimensions`.
- **`@memberjunction/ai-bedrock`** — forwarded as `dimensions` for `amazon.titan-embed*` models (supported by Titan Embed Text V2: 256/512/1024; V1 rejects it, so it is only sent on explicit opt-in). Also threaded through the per-text batch fallback loop.

Not applicable (unchanged): Ollama (no output-dimension API parameter) and LocalEmbeddings (transformers.js has no output truncation).
