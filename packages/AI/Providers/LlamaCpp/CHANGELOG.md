# @memberjunction/ai-llamacpp

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-openai@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/ai-openai@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- 70c054d: Add `@memberjunction/ai-llamacpp` — a new AI provider that targets a local `llama-server` (llama.cpp) process via its OpenAI-compatible `/v1/chat/completions` endpoint. Implemented as a thin subclass of `OpenAILLM` following the same pattern as `xAILLM` and `OpenRouterLLM`. Defaults the base URL to `http://localhost:8080/v1` and supplies a placeholder API key since `llama-server` runs unauthenticated by default (callers can still pass a real key if `llama-server --api-key` is configured). Added to the provider bundle.
  - @memberjunction/ai@5.30.0
  - @memberjunction/ai-openai@5.30.0
  - @memberjunction/global@5.30.0
