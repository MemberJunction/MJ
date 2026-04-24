---
"@memberjunction/ai-llamacpp": patch
"@memberjunction/ai-provider-bundle": patch
---

Add `@memberjunction/ai-llamacpp` — a new AI provider that targets a local `llama-server` (llama.cpp) process via its OpenAI-compatible `/v1/chat/completions` endpoint. Implemented as a thin subclass of `OpenAILLM` following the same pattern as `xAILLM` and `OpenRouterLLM`. Defaults the base URL to `http://localhost:8080/v1` and supplies a placeholder API key since `llama-server` runs unauthenticated by default (callers can still pass a real key if `llama-server --api-key` is configured). Added to the provider bundle.
