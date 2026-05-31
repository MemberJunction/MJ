# @memberjunction/ai-llamacpp

## 5.37.0

### Patch Changes

- @memberjunction/ai@5.37.0
- @memberjunction/ai-openai@5.37.0
- @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/ai@5.36.0
- @memberjunction/ai-openai@5.36.0
- @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [ac4b9a5]
  - @memberjunction/global@5.35.0
  - @memberjunction/ai@5.35.0
  - @memberjunction/ai-openai@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/ai@5.34.1
- @memberjunction/ai-openai@5.34.1
- @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [389d356]
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0
  - @memberjunction/ai-openai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [5cc5326]
  - @memberjunction/global@5.33.0
  - @memberjunction/ai@5.33.0
  - @memberjunction/ai-openai@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/ai@5.32.0
- @memberjunction/ai-openai@5.32.0
- @memberjunction/global@5.32.0

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
