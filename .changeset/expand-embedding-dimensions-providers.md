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
- **`@memberjunction/ai-azure`** — the previously hardcoded `dimensions: 1536` in the REST body is now `params.dimensions ?? 1536` (caller override, historical default preserved).
- **`@memberjunction/ai-bedrock`** — forwarded as `dimensions` for `amazon.titan-embed*` models (supported by Titan Embed Text V2: 256/512/1024; V1 rejects it, so it is only sent on explicit opt-in). Also threaded through the per-text batch fallback loop.

Not applicable (unchanged): Ollama (no output-dimension API parameter) and LocalEmbeddings (transformers.js has no output truncation).
