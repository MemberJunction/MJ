# @memberjunction/ai-provider-bundle

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/ai-anthropic@5.31.0
  - @memberjunction/ai-azure@5.31.0
  - @memberjunction/ai-bedrock@5.31.0
  - @memberjunction/ai-betty-bot@5.31.0
  - @memberjunction/ai-blackforestlabs@5.31.0
  - @memberjunction/ai-cerebras@5.31.0
  - @memberjunction/ai-cohere@5.31.0
  - @memberjunction/ai-elevenlabs@5.31.0
  - @memberjunction/ai-fireworks@5.31.0
  - @memberjunction/ai-gemini@5.31.0
  - @memberjunction/ai-groq@5.31.0
  - @memberjunction/ai-heygen@5.31.0
  - @memberjunction/ai-inception@5.31.0
  - @memberjunction/ai-lmstudio@5.31.0
  - @memberjunction/ai-llamacpp@5.31.0
  - @memberjunction/ai-local-embeddings@5.31.0
  - @memberjunction/ai-minimax@5.31.0
  - @memberjunction/ai-mistral@5.31.0
  - @memberjunction/ai-ollama@5.31.0
  - @memberjunction/ai-openai@5.31.0
  - @memberjunction/ai-openrouter@5.31.0
  - @memberjunction/ai-recommendations-rex@5.31.0
  - @memberjunction/ai-vertex@5.31.0
  - @memberjunction/ai-zhipu@5.31.0
  - @memberjunction/ai-xai@5.31.0
  - @memberjunction/ai-vectors-pinecone@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-anthropic@5.30.1
- @memberjunction/ai-azure@5.30.1
- @memberjunction/ai-bedrock@5.30.1
- @memberjunction/ai-betty-bot@5.30.1
- @memberjunction/ai-blackforestlabs@5.30.1
- @memberjunction/ai-cerebras@5.30.1
- @memberjunction/ai-cohere@5.30.1
- @memberjunction/ai-elevenlabs@5.30.1
- @memberjunction/ai-fireworks@5.30.1
- @memberjunction/ai-gemini@5.30.1
- @memberjunction/ai-groq@5.30.1
- @memberjunction/ai-heygen@5.30.1
- @memberjunction/ai-inception@5.30.1
- @memberjunction/ai-lmstudio@5.30.1
- @memberjunction/ai-llamacpp@5.30.1
- @memberjunction/ai-local-embeddings@5.30.1
- @memberjunction/ai-minimax@5.30.1
- @memberjunction/ai-mistral@5.30.1
- @memberjunction/ai-ollama@5.30.1
- @memberjunction/ai-openai@5.30.1
- @memberjunction/ai-openrouter@5.30.1
- @memberjunction/ai-recommendations-rex@5.30.1
- @memberjunction/ai-vertex@5.30.1
- @memberjunction/ai-zhipu@5.30.1
- @memberjunction/ai-xai@5.30.1
- @memberjunction/ai-vectors-pinecone@5.30.1

## 5.30.0

### Patch Changes

- 70c054d: Add `@memberjunction/ai-llamacpp` — a new AI provider that targets a local `llama-server` (llama.cpp) process via its OpenAI-compatible `/v1/chat/completions` endpoint. Implemented as a thin subclass of `OpenAILLM` following the same pattern as `xAILLM` and `OpenRouterLLM`. Defaults the base URL to `http://localhost:8080/v1` and supplies a placeholder API key since `llama-server` runs unauthenticated by default (callers can still pass a real key if `llama-server --api-key` is configured). Added to the provider bundle.
- 4e2da93: Add new Inception AI provider package with InceptionLLM driver and Mercury Coder model support, included in the AI providers bundle.
- Updated dependencies [70c054d]
- Updated dependencies [4e2da93]
  - @memberjunction/ai-llamacpp@5.30.0
  - @memberjunction/ai-inception@5.30.0
  - @memberjunction/ai-vectors-pinecone@5.30.0
  - @memberjunction/ai-recommendations-rex@5.30.0
  - @memberjunction/ai-anthropic@5.30.0
  - @memberjunction/ai-azure@5.30.0
  - @memberjunction/ai-bedrock@5.30.0
  - @memberjunction/ai-betty-bot@5.30.0
  - @memberjunction/ai-blackforestlabs@5.30.0
  - @memberjunction/ai-cerebras@5.30.0
  - @memberjunction/ai-cohere@5.30.0
  - @memberjunction/ai-elevenlabs@5.30.0
  - @memberjunction/ai-fireworks@5.30.0
  - @memberjunction/ai-gemini@5.30.0
  - @memberjunction/ai-groq@5.30.0
  - @memberjunction/ai-heygen@5.30.0
  - @memberjunction/ai-lmstudio@5.30.0
  - @memberjunction/ai-local-embeddings@5.30.0
  - @memberjunction/ai-minimax@5.30.0
  - @memberjunction/ai-mistral@5.30.0
  - @memberjunction/ai-ollama@5.30.0
  - @memberjunction/ai-openai@5.30.0
  - @memberjunction/ai-openrouter@5.30.0
  - @memberjunction/ai-vertex@5.30.0
  - @memberjunction/ai-zhipu@5.30.0
  - @memberjunction/ai-xai@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.29.0
- @memberjunction/ai-vectors-pinecone@5.29.0
- @memberjunction/ai-anthropic@5.29.0
- @memberjunction/ai-azure@5.29.0
- @memberjunction/ai-bedrock@5.29.0
- @memberjunction/ai-betty-bot@5.29.0
- @memberjunction/ai-blackforestlabs@5.29.0
- @memberjunction/ai-cerebras@5.29.0
- @memberjunction/ai-cohere@5.29.0
- @memberjunction/ai-elevenlabs@5.29.0
- @memberjunction/ai-fireworks@5.29.0
- @memberjunction/ai-gemini@5.29.0
- @memberjunction/ai-groq@5.29.0
- @memberjunction/ai-heygen@5.29.0
- @memberjunction/ai-lmstudio@5.29.0
- @memberjunction/ai-local-embeddings@5.29.0
- @memberjunction/ai-minimax@5.29.0
- @memberjunction/ai-mistral@5.29.0
- @memberjunction/ai-ollama@5.29.0
- @memberjunction/ai-openai@5.29.0
- @memberjunction/ai-openrouter@5.29.0
- @memberjunction/ai-vertex@5.29.0
- @memberjunction/ai-zhipu@5.29.0
- @memberjunction/ai-xai@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.28.0
- @memberjunction/ai-vectors-pinecone@5.28.0
- @memberjunction/ai-anthropic@5.28.0
- @memberjunction/ai-azure@5.28.0
- @memberjunction/ai-bedrock@5.28.0
- @memberjunction/ai-betty-bot@5.28.0
- @memberjunction/ai-blackforestlabs@5.28.0
- @memberjunction/ai-cerebras@5.28.0
- @memberjunction/ai-cohere@5.28.0
- @memberjunction/ai-elevenlabs@5.28.0
- @memberjunction/ai-fireworks@5.28.0
- @memberjunction/ai-gemini@5.28.0
- @memberjunction/ai-groq@5.28.0
- @memberjunction/ai-heygen@5.28.0
- @memberjunction/ai-lmstudio@5.28.0
- @memberjunction/ai-local-embeddings@5.28.0
- @memberjunction/ai-minimax@5.28.0
- @memberjunction/ai-mistral@5.28.0
- @memberjunction/ai-ollama@5.28.0
- @memberjunction/ai-openai@5.28.0
- @memberjunction/ai-openrouter@5.28.0
- @memberjunction/ai-vertex@5.28.0
- @memberjunction/ai-zhipu@5.28.0
- @memberjunction/ai-xai@5.28.0

## 5.27.1

### Patch Changes

- @memberjunction/ai-anthropic@5.27.1
- @memberjunction/ai-azure@5.27.1
- @memberjunction/ai-bedrock@5.27.1
- @memberjunction/ai-betty-bot@5.27.1
- @memberjunction/ai-blackforestlabs@5.27.1
- @memberjunction/ai-cerebras@5.27.1
- @memberjunction/ai-cohere@5.27.1
- @memberjunction/ai-elevenlabs@5.27.1
- @memberjunction/ai-fireworks@5.27.1
- @memberjunction/ai-gemini@5.27.1
- @memberjunction/ai-groq@5.27.1
- @memberjunction/ai-heygen@5.27.1
- @memberjunction/ai-lmstudio@5.27.1
- @memberjunction/ai-local-embeddings@5.27.1
- @memberjunction/ai-minimax@5.27.1
- @memberjunction/ai-mistral@5.27.1
- @memberjunction/ai-ollama@5.27.1
- @memberjunction/ai-openai@5.27.1
- @memberjunction/ai-openrouter@5.27.1
- @memberjunction/ai-recommendations-rex@5.27.1
- @memberjunction/ai-vertex@5.27.1
- @memberjunction/ai-zhipu@5.27.1
- @memberjunction/ai-xai@5.27.1
- @memberjunction/ai-vectors-pinecone@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai-anthropic@5.27.0
- @memberjunction/ai-azure@5.27.0
- @memberjunction/ai-bedrock@5.27.0
- @memberjunction/ai-betty-bot@5.27.0
- @memberjunction/ai-blackforestlabs@5.27.0
- @memberjunction/ai-cerebras@5.27.0
- @memberjunction/ai-cohere@5.27.0
- @memberjunction/ai-elevenlabs@5.27.0
- @memberjunction/ai-fireworks@5.27.0
- @memberjunction/ai-gemini@5.27.0
- @memberjunction/ai-groq@5.27.0
- @memberjunction/ai-heygen@5.27.0
- @memberjunction/ai-lmstudio@5.27.0
- @memberjunction/ai-local-embeddings@5.27.0
- @memberjunction/ai-minimax@5.27.0
- @memberjunction/ai-mistral@5.27.0
- @memberjunction/ai-ollama@5.27.0
- @memberjunction/ai-openai@5.27.0
- @memberjunction/ai-openrouter@5.27.0
- @memberjunction/ai-recommendations-rex@5.27.0
- @memberjunction/ai-vertex@5.27.0
- @memberjunction/ai-zhipu@5.27.0
- @memberjunction/ai-xai@5.27.0
- @memberjunction/ai-vectors-pinecone@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.26.0
- @memberjunction/ai-vectors-pinecone@5.26.0
- @memberjunction/ai-anthropic@5.26.0
- @memberjunction/ai-azure@5.26.0
- @memberjunction/ai-bedrock@5.26.0
- @memberjunction/ai-betty-bot@5.26.0
- @memberjunction/ai-blackforestlabs@5.26.0
- @memberjunction/ai-cerebras@5.26.0
- @memberjunction/ai-cohere@5.26.0
- @memberjunction/ai-elevenlabs@5.26.0
- @memberjunction/ai-fireworks@5.26.0
- @memberjunction/ai-gemini@5.26.0
- @memberjunction/ai-groq@5.26.0
- @memberjunction/ai-heygen@5.26.0
- @memberjunction/ai-lmstudio@5.26.0
- @memberjunction/ai-local-embeddings@5.26.0
- @memberjunction/ai-minimax@5.26.0
- @memberjunction/ai-mistral@5.26.0
- @memberjunction/ai-ollama@5.26.0
- @memberjunction/ai-openai@5.26.0
- @memberjunction/ai-openrouter@5.26.0
- @memberjunction/ai-vertex@5.26.0
- @memberjunction/ai-zhipu@5.26.0
- @memberjunction/ai-xai@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.25.0
- @memberjunction/ai-vectors-pinecone@5.25.0
- @memberjunction/ai-anthropic@5.25.0
- @memberjunction/ai-azure@5.25.0
- @memberjunction/ai-bedrock@5.25.0
- @memberjunction/ai-betty-bot@5.25.0
- @memberjunction/ai-blackforestlabs@5.25.0
- @memberjunction/ai-cerebras@5.25.0
- @memberjunction/ai-cohere@5.25.0
- @memberjunction/ai-elevenlabs@5.25.0
- @memberjunction/ai-fireworks@5.25.0
- @memberjunction/ai-gemini@5.25.0
- @memberjunction/ai-groq@5.25.0
- @memberjunction/ai-heygen@5.25.0
- @memberjunction/ai-lmstudio@5.25.0
- @memberjunction/ai-local-embeddings@5.25.0
- @memberjunction/ai-minimax@5.25.0
- @memberjunction/ai-mistral@5.25.0
- @memberjunction/ai-ollama@5.25.0
- @memberjunction/ai-openai@5.25.0
- @memberjunction/ai-openrouter@5.25.0
- @memberjunction/ai-vertex@5.25.0
- @memberjunction/ai-zhipu@5.25.0
- @memberjunction/ai-xai@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
  - @memberjunction/ai-vectors-pinecone@5.24.0
  - @memberjunction/ai-recommendations-rex@5.24.0
  - @memberjunction/ai-anthropic@5.24.0
  - @memberjunction/ai-azure@5.24.0
  - @memberjunction/ai-bedrock@5.24.0
  - @memberjunction/ai-betty-bot@5.24.0
  - @memberjunction/ai-blackforestlabs@5.24.0
  - @memberjunction/ai-cerebras@5.24.0
  - @memberjunction/ai-cohere@5.24.0
  - @memberjunction/ai-elevenlabs@5.24.0
  - @memberjunction/ai-fireworks@5.24.0
  - @memberjunction/ai-gemini@5.24.0
  - @memberjunction/ai-groq@5.24.0
  - @memberjunction/ai-heygen@5.24.0
  - @memberjunction/ai-lmstudio@5.24.0
  - @memberjunction/ai-local-embeddings@5.24.0
  - @memberjunction/ai-minimax@5.24.0
  - @memberjunction/ai-mistral@5.24.0
  - @memberjunction/ai-ollama@5.24.0
  - @memberjunction/ai-openai@5.24.0
  - @memberjunction/ai-openrouter@5.24.0
  - @memberjunction/ai-vertex@5.24.0
  - @memberjunction/ai-zhipu@5.24.0
  - @memberjunction/ai-xai@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [513b20c]
  - @memberjunction/ai-vectors-pinecone@5.23.0
  - @memberjunction/ai-recommendations-rex@5.23.0
  - @memberjunction/ai-anthropic@5.23.0
  - @memberjunction/ai-azure@5.23.0
  - @memberjunction/ai-bedrock@5.23.0
  - @memberjunction/ai-betty-bot@5.23.0
  - @memberjunction/ai-blackforestlabs@5.23.0
  - @memberjunction/ai-cerebras@5.23.0
  - @memberjunction/ai-cohere@5.23.0
  - @memberjunction/ai-elevenlabs@5.23.0
  - @memberjunction/ai-fireworks@5.23.0
  - @memberjunction/ai-gemini@5.23.0
  - @memberjunction/ai-groq@5.23.0
  - @memberjunction/ai-heygen@5.23.0
  - @memberjunction/ai-lmstudio@5.23.0
  - @memberjunction/ai-local-embeddings@5.23.0
  - @memberjunction/ai-minimax@5.23.0
  - @memberjunction/ai-mistral@5.23.0
  - @memberjunction/ai-ollama@5.23.0
  - @memberjunction/ai-openai@5.23.0
  - @memberjunction/ai-openrouter@5.23.0
  - @memberjunction/ai-vertex@5.23.0
  - @memberjunction/ai-zhipu@5.23.0
  - @memberjunction/ai-xai@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [a42aba6]
  - @memberjunction/ai-vectors-pinecone@5.22.0
  - @memberjunction/ai-recommendations-rex@5.22.0
  - @memberjunction/ai-anthropic@5.22.0
  - @memberjunction/ai-azure@5.22.0
  - @memberjunction/ai-bedrock@5.22.0
  - @memberjunction/ai-betty-bot@5.22.0
  - @memberjunction/ai-blackforestlabs@5.22.0
  - @memberjunction/ai-cerebras@5.22.0
  - @memberjunction/ai-cohere@5.22.0
  - @memberjunction/ai-elevenlabs@5.22.0
  - @memberjunction/ai-fireworks@5.22.0
  - @memberjunction/ai-gemini@5.22.0
  - @memberjunction/ai-groq@5.22.0
  - @memberjunction/ai-heygen@5.22.0
  - @memberjunction/ai-lmstudio@5.22.0
  - @memberjunction/ai-local-embeddings@5.22.0
  - @memberjunction/ai-minimax@5.22.0
  - @memberjunction/ai-mistral@5.22.0
  - @memberjunction/ai-ollama@5.22.0
  - @memberjunction/ai-openai@5.22.0
  - @memberjunction/ai-openrouter@5.22.0
  - @memberjunction/ai-vertex@5.22.0
  - @memberjunction/ai-zhipu@5.22.0
  - @memberjunction/ai-xai@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/ai-vectors-pinecone@5.21.0
  - @memberjunction/ai-recommendations-rex@5.21.0
  - @memberjunction/ai-anthropic@5.21.0
  - @memberjunction/ai-azure@5.21.0
  - @memberjunction/ai-bedrock@5.21.0
  - @memberjunction/ai-betty-bot@5.21.0
  - @memberjunction/ai-blackforestlabs@5.21.0
  - @memberjunction/ai-cerebras@5.21.0
  - @memberjunction/ai-cohere@5.21.0
  - @memberjunction/ai-elevenlabs@5.21.0
  - @memberjunction/ai-fireworks@5.21.0
  - @memberjunction/ai-gemini@5.21.0
  - @memberjunction/ai-groq@5.21.0
  - @memberjunction/ai-heygen@5.21.0
  - @memberjunction/ai-lmstudio@5.21.0
  - @memberjunction/ai-local-embeddings@5.21.0
  - @memberjunction/ai-minimax@5.21.0
  - @memberjunction/ai-mistral@5.21.0
  - @memberjunction/ai-ollama@5.21.0
  - @memberjunction/ai-openai@5.21.0
  - @memberjunction/ai-openrouter@5.21.0
  - @memberjunction/ai-vertex@5.21.0
  - @memberjunction/ai-zhipu@5.21.0
  - @memberjunction/ai-xai@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.20.0
- @memberjunction/ai-vectors-pinecone@5.20.0
- @memberjunction/ai-anthropic@5.20.0
- @memberjunction/ai-azure@5.20.0
- @memberjunction/ai-bedrock@5.20.0
- @memberjunction/ai-betty-bot@5.20.0
- @memberjunction/ai-blackforestlabs@5.20.0
- @memberjunction/ai-cerebras@5.20.0
- @memberjunction/ai-cohere@5.20.0
- @memberjunction/ai-elevenlabs@5.20.0
- @memberjunction/ai-fireworks@5.20.0
- @memberjunction/ai-gemini@5.20.0
- @memberjunction/ai-groq@5.20.0
- @memberjunction/ai-heygen@5.20.0
- @memberjunction/ai-lmstudio@5.20.0
- @memberjunction/ai-local-embeddings@5.20.0
- @memberjunction/ai-minimax@5.20.0
- @memberjunction/ai-mistral@5.20.0
- @memberjunction/ai-ollama@5.20.0
- @memberjunction/ai-openai@5.20.0
- @memberjunction/ai-openrouter@5.20.0
- @memberjunction/ai-vertex@5.20.0
- @memberjunction/ai-zhipu@5.20.0
- @memberjunction/ai-xai@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-anthropic@5.19.0
- @memberjunction/ai-azure@5.19.0
- @memberjunction/ai-bedrock@5.19.0
- @memberjunction/ai-betty-bot@5.19.0
- @memberjunction/ai-blackforestlabs@5.19.0
- @memberjunction/ai-cerebras@5.19.0
- @memberjunction/ai-cohere@5.19.0
- @memberjunction/ai-elevenlabs@5.19.0
- @memberjunction/ai-fireworks@5.19.0
- @memberjunction/ai-gemini@5.19.0
- @memberjunction/ai-groq@5.19.0
- @memberjunction/ai-heygen@5.19.0
- @memberjunction/ai-lmstudio@5.19.0
- @memberjunction/ai-local-embeddings@5.19.0
- @memberjunction/ai-minimax@5.19.0
- @memberjunction/ai-mistral@5.19.0
- @memberjunction/ai-ollama@5.19.0
- @memberjunction/ai-openai@5.19.0
- @memberjunction/ai-openrouter@5.19.0
- @memberjunction/ai-recommendations-rex@5.19.0
- @memberjunction/ai-vectors-pinecone@5.19.0
- @memberjunction/ai-vertex@5.19.0
- @memberjunction/ai-zhipu@5.19.0
- @memberjunction/ai-xai@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/ai-vectors-pinecone@5.18.0
- @memberjunction/ai-anthropic@5.18.0
- @memberjunction/ai-azure@5.18.0
- @memberjunction/ai-bedrock@5.18.0
- @memberjunction/ai-betty-bot@5.18.0
- @memberjunction/ai-blackforestlabs@5.18.0
- @memberjunction/ai-cerebras@5.18.0
- @memberjunction/ai-cohere@5.18.0
- @memberjunction/ai-elevenlabs@5.18.0
- @memberjunction/ai-fireworks@5.18.0
- @memberjunction/ai-gemini@5.18.0
- @memberjunction/ai-groq@5.18.0
- @memberjunction/ai-heygen@5.18.0
- @memberjunction/ai-lmstudio@5.18.0
- @memberjunction/ai-local-embeddings@5.18.0
- @memberjunction/ai-minimax@5.18.0
- @memberjunction/ai-mistral@5.18.0
- @memberjunction/ai-ollama@5.18.0
- @memberjunction/ai-openai@5.18.0
- @memberjunction/ai-openrouter@5.18.0
- @memberjunction/ai-recommendations-rex@5.18.0
- @memberjunction/ai-vertex@5.18.0
- @memberjunction/ai-zhipu@5.18.0
- @memberjunction/ai-xai@5.18.0

## 5.17.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.17.0
- @memberjunction/ai-vectors-pinecone@5.17.0
- @memberjunction/ai-anthropic@5.17.0
- @memberjunction/ai-azure@5.17.0
- @memberjunction/ai-bedrock@5.17.0
- @memberjunction/ai-betty-bot@5.17.0
- @memberjunction/ai-blackforestlabs@5.17.0
- @memberjunction/ai-cerebras@5.17.0
- @memberjunction/ai-cohere@5.17.0
- @memberjunction/ai-elevenlabs@5.17.0
- @memberjunction/ai-fireworks@5.17.0
- @memberjunction/ai-gemini@5.17.0
- @memberjunction/ai-groq@5.17.0
- @memberjunction/ai-heygen@5.17.0
- @memberjunction/ai-lmstudio@5.17.0
- @memberjunction/ai-local-embeddings@5.17.0
- @memberjunction/ai-minimax@5.17.0
- @memberjunction/ai-mistral@5.17.0
- @memberjunction/ai-ollama@5.17.0
- @memberjunction/ai-openai@5.17.0
- @memberjunction/ai-openrouter@5.17.0
- @memberjunction/ai-vertex@5.17.0
- @memberjunction/ai-zhipu@5.17.0
- @memberjunction/ai-xai@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.16.0
- @memberjunction/ai-vectors-pinecone@5.16.0
- @memberjunction/ai-anthropic@5.16.0
- @memberjunction/ai-azure@5.16.0
- @memberjunction/ai-bedrock@5.16.0
- @memberjunction/ai-betty-bot@5.16.0
- @memberjunction/ai-blackforestlabs@5.16.0
- @memberjunction/ai-cerebras@5.16.0
- @memberjunction/ai-cohere@5.16.0
- @memberjunction/ai-elevenlabs@5.16.0
- @memberjunction/ai-fireworks@5.16.0
- @memberjunction/ai-gemini@5.16.0
- @memberjunction/ai-groq@5.16.0
- @memberjunction/ai-heygen@5.16.0
- @memberjunction/ai-lmstudio@5.16.0
- @memberjunction/ai-local-embeddings@5.16.0
- @memberjunction/ai-minimax@5.16.0
- @memberjunction/ai-mistral@5.16.0
- @memberjunction/ai-ollama@5.16.0
- @memberjunction/ai-openai@5.16.0
- @memberjunction/ai-openrouter@5.16.0
- @memberjunction/ai-vertex@5.16.0
- @memberjunction/ai-zhipu@5.16.0
- @memberjunction/ai-xai@5.16.0

## 5.15.0

### Minor Changes

- c3e8b94: metadata updates and migration

### Patch Changes

- Updated dependencies [c3e8b94]
  - @memberjunction/ai-anthropic@5.15.0
  - @memberjunction/ai-azure@5.15.0
  - @memberjunction/ai-bedrock@5.15.0
  - @memberjunction/ai-betty-bot@5.15.0
  - @memberjunction/ai-blackforestlabs@5.15.0
  - @memberjunction/ai-cerebras@5.15.0
  - @memberjunction/ai-cohere@5.15.0
  - @memberjunction/ai-elevenlabs@5.15.0
  - @memberjunction/ai-fireworks@5.15.0
  - @memberjunction/ai-gemini@5.15.0
  - @memberjunction/ai-groq@5.15.0
  - @memberjunction/ai-heygen@5.15.0
  - @memberjunction/ai-lmstudio@5.15.0
  - @memberjunction/ai-local-embeddings@5.15.0
  - @memberjunction/ai-minimax@5.15.0
  - @memberjunction/ai-mistral@5.15.0
  - @memberjunction/ai-ollama@5.15.0
  - @memberjunction/ai-openai@5.15.0
  - @memberjunction/ai-openrouter@5.15.0
  - @memberjunction/ai-vectors-pinecone@5.15.0
  - @memberjunction/ai-vertex@5.15.0
  - @memberjunction/ai-zhipu@5.15.0
  - @memberjunction/ai-xai@5.15.0
  - @memberjunction/ai-recommendations-rex@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [140fc6d]
  - @memberjunction/ai-openai@5.14.0
  - @memberjunction/ai-recommendations-rex@5.14.0
  - @memberjunction/ai-vectors-pinecone@5.14.0
  - @memberjunction/ai-minimax@5.14.0
  - @memberjunction/ai-openrouter@5.14.0
  - @memberjunction/ai-zhipu@5.14.0
  - @memberjunction/ai-xai@5.14.0
  - @memberjunction/ai-anthropic@5.14.0
  - @memberjunction/ai-azure@5.14.0
  - @memberjunction/ai-bedrock@5.14.0
  - @memberjunction/ai-betty-bot@5.14.0
  - @memberjunction/ai-blackforestlabs@5.14.0
  - @memberjunction/ai-cerebras@5.14.0
  - @memberjunction/ai-cohere@5.14.0
  - @memberjunction/ai-elevenlabs@5.14.0
  - @memberjunction/ai-fireworks@5.14.0
  - @memberjunction/ai-gemini@5.14.0
  - @memberjunction/ai-groq@5.14.0
  - @memberjunction/ai-heygen@5.14.0
  - @memberjunction/ai-lmstudio@5.14.0
  - @memberjunction/ai-local-embeddings@5.14.0
  - @memberjunction/ai-mistral@5.14.0
  - @memberjunction/ai-ollama@5.14.0
  - @memberjunction/ai-vertex@5.14.0

## 5.13.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.13.0
- @memberjunction/ai-vectors-pinecone@5.13.0
- @memberjunction/ai-anthropic@5.13.0
- @memberjunction/ai-azure@5.13.0
- @memberjunction/ai-bedrock@5.13.0
- @memberjunction/ai-betty-bot@5.13.0
- @memberjunction/ai-blackforestlabs@5.13.0
- @memberjunction/ai-cerebras@5.13.0
- @memberjunction/ai-cohere@5.13.0
- @memberjunction/ai-elevenlabs@5.13.0
- @memberjunction/ai-fireworks@5.13.0
- @memberjunction/ai-gemini@5.13.0
- @memberjunction/ai-groq@5.13.0
- @memberjunction/ai-heygen@5.13.0
- @memberjunction/ai-lmstudio@5.13.0
- @memberjunction/ai-local-embeddings@5.13.0
- @memberjunction/ai-minimax@5.13.0
- @memberjunction/ai-mistral@5.13.0
- @memberjunction/ai-ollama@5.13.0
- @memberjunction/ai-openai@5.13.0
- @memberjunction/ai-openrouter@5.13.0
- @memberjunction/ai-vertex@5.13.0
- @memberjunction/ai-zhipu@5.13.0
- @memberjunction/ai-xai@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [c21c28c]
  - @memberjunction/ai-azure@5.12.0
  - @memberjunction/ai-bedrock@5.12.0
  - @memberjunction/ai-recommendations-rex@5.12.0
  - @memberjunction/ai-vectors-pinecone@5.12.0
  - @memberjunction/ai-anthropic@5.12.0
  - @memberjunction/ai-betty-bot@5.12.0
  - @memberjunction/ai-blackforestlabs@5.12.0
  - @memberjunction/ai-cerebras@5.12.0
  - @memberjunction/ai-cohere@5.12.0
  - @memberjunction/ai-elevenlabs@5.12.0
  - @memberjunction/ai-fireworks@5.12.0
  - @memberjunction/ai-gemini@5.12.0
  - @memberjunction/ai-groq@5.12.0
  - @memberjunction/ai-heygen@5.12.0
  - @memberjunction/ai-lmstudio@5.12.0
  - @memberjunction/ai-local-embeddings@5.12.0
  - @memberjunction/ai-minimax@5.12.0
  - @memberjunction/ai-mistral@5.12.0
  - @memberjunction/ai-ollama@5.12.0
  - @memberjunction/ai-openai@5.12.0
  - @memberjunction/ai-openrouter@5.12.0
  - @memberjunction/ai-vertex@5.12.0
  - @memberjunction/ai-zhipu@5.12.0
  - @memberjunction/ai-xai@5.12.0

## 5.11.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.11.0
- @memberjunction/ai-vectors-pinecone@5.11.0
- @memberjunction/ai-anthropic@5.11.0
- @memberjunction/ai-azure@5.11.0
- @memberjunction/ai-bedrock@5.11.0
- @memberjunction/ai-betty-bot@5.11.0
- @memberjunction/ai-blackforestlabs@5.11.0
- @memberjunction/ai-cerebras@5.11.0
- @memberjunction/ai-cohere@5.11.0
- @memberjunction/ai-elevenlabs@5.11.0
- @memberjunction/ai-fireworks@5.11.0
- @memberjunction/ai-gemini@5.11.0
- @memberjunction/ai-groq@5.11.0
- @memberjunction/ai-heygen@5.11.0
- @memberjunction/ai-lmstudio@5.11.0
- @memberjunction/ai-local-embeddings@5.11.0
- @memberjunction/ai-minimax@5.11.0
- @memberjunction/ai-mistral@5.11.0
- @memberjunction/ai-ollama@5.11.0
- @memberjunction/ai-openai@5.11.0
- @memberjunction/ai-openrouter@5.11.0
- @memberjunction/ai-vertex@5.11.0
- @memberjunction/ai-zhipu@5.11.0
- @memberjunction/ai-xai@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-anthropic@5.10.1
- @memberjunction/ai-azure@5.10.1
- @memberjunction/ai-bedrock@5.10.1
- @memberjunction/ai-betty-bot@5.10.1
- @memberjunction/ai-blackforestlabs@5.10.1
- @memberjunction/ai-cerebras@5.10.1
- @memberjunction/ai-cohere@5.10.1
- @memberjunction/ai-elevenlabs@5.10.1
- @memberjunction/ai-fireworks@5.10.1
- @memberjunction/ai-gemini@5.10.1
- @memberjunction/ai-groq@5.10.1
- @memberjunction/ai-heygen@5.10.1
- @memberjunction/ai-lmstudio@5.10.1
- @memberjunction/ai-local-embeddings@5.10.1
- @memberjunction/ai-minimax@5.10.1
- @memberjunction/ai-mistral@5.10.1
- @memberjunction/ai-ollama@5.10.1
- @memberjunction/ai-openai@5.10.1
- @memberjunction/ai-openrouter@5.10.1
- @memberjunction/ai-recommendations-rex@5.10.1
- @memberjunction/ai-vectors-pinecone@5.10.1
- @memberjunction/ai-vertex@5.10.1
- @memberjunction/ai-zhipu@5.10.1
- @memberjunction/ai-xai@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.10.0
- @memberjunction/ai-vectors-pinecone@5.10.0
- @memberjunction/ai-anthropic@5.10.0
- @memberjunction/ai-azure@5.10.0
- @memberjunction/ai-bedrock@5.10.0
- @memberjunction/ai-betty-bot@5.10.0
- @memberjunction/ai-blackforestlabs@5.10.0
- @memberjunction/ai-cerebras@5.10.0
- @memberjunction/ai-cohere@5.10.0
- @memberjunction/ai-elevenlabs@5.10.0
- @memberjunction/ai-fireworks@5.10.0
- @memberjunction/ai-gemini@5.10.0
- @memberjunction/ai-groq@5.10.0
- @memberjunction/ai-heygen@5.10.0
- @memberjunction/ai-lmstudio@5.10.0
- @memberjunction/ai-local-embeddings@5.10.0
- @memberjunction/ai-minimax@5.10.0
- @memberjunction/ai-mistral@5.10.0
- @memberjunction/ai-ollama@5.10.0
- @memberjunction/ai-openai@5.10.0
- @memberjunction/ai-openrouter@5.10.0
- @memberjunction/ai-vertex@5.10.0
- @memberjunction/ai-zhipu@5.10.0
- @memberjunction/ai-xai@5.10.0

## 5.9.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.9.0
- @memberjunction/ai-anthropic@5.9.0
- @memberjunction/ai-azure@5.9.0
- @memberjunction/ai-bedrock@5.9.0
- @memberjunction/ai-betty-bot@5.9.0
- @memberjunction/ai-blackforestlabs@5.9.0
- @memberjunction/ai-cerebras@5.9.0
- @memberjunction/ai-cohere@5.9.0
- @memberjunction/ai-elevenlabs@5.9.0
- @memberjunction/ai-fireworks@5.9.0
- @memberjunction/ai-gemini@5.9.0
- @memberjunction/ai-groq@5.9.0
- @memberjunction/ai-heygen@5.9.0
- @memberjunction/ai-lmstudio@5.9.0
- @memberjunction/ai-local-embeddings@5.9.0
- @memberjunction/ai-minimax@5.9.0
- @memberjunction/ai-mistral@5.9.0
- @memberjunction/ai-ollama@5.9.0
- @memberjunction/ai-openai@5.9.0
- @memberjunction/ai-openrouter@5.9.0
- @memberjunction/ai-vectors-pinecone@5.9.0
- @memberjunction/ai-vertex@5.9.0
- @memberjunction/ai-zhipu@5.9.0
- @memberjunction/ai-xai@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.8.0
- @memberjunction/ai-vectors-pinecone@5.8.0
- @memberjunction/ai-anthropic@5.8.0
- @memberjunction/ai-azure@5.8.0
- @memberjunction/ai-bedrock@5.8.0
- @memberjunction/ai-betty-bot@5.8.0
- @memberjunction/ai-blackforestlabs@5.8.0
- @memberjunction/ai-cerebras@5.8.0
- @memberjunction/ai-cohere@5.8.0
- @memberjunction/ai-elevenlabs@5.8.0
- @memberjunction/ai-fireworks@5.8.0
- @memberjunction/ai-gemini@5.8.0
- @memberjunction/ai-groq@5.8.0
- @memberjunction/ai-heygen@5.8.0
- @memberjunction/ai-lmstudio@5.8.0
- @memberjunction/ai-local-embeddings@5.8.0
- @memberjunction/ai-minimax@5.8.0
- @memberjunction/ai-mistral@5.8.0
- @memberjunction/ai-ollama@5.8.0
- @memberjunction/ai-openai@5.8.0
- @memberjunction/ai-openrouter@5.8.0
- @memberjunction/ai-vertex@5.8.0
- @memberjunction/ai-zhipu@5.8.0
- @memberjunction/ai-xai@5.8.0

## 5.7.0

### Patch Changes

- @memberjunction/ai-anthropic@5.7.0
- @memberjunction/ai-azure@5.7.0
- @memberjunction/ai-bedrock@5.7.0
- @memberjunction/ai-betty-bot@5.7.0
- @memberjunction/ai-blackforestlabs@5.7.0
- @memberjunction/ai-cerebras@5.7.0
- @memberjunction/ai-cohere@5.7.0
- @memberjunction/ai-elevenlabs@5.7.0
- @memberjunction/ai-fireworks@5.7.0
- @memberjunction/ai-gemini@5.7.0
- @memberjunction/ai-groq@5.7.0
- @memberjunction/ai-heygen@5.7.0
- @memberjunction/ai-lmstudio@5.7.0
- @memberjunction/ai-local-embeddings@5.7.0
- @memberjunction/ai-minimax@5.7.0
- @memberjunction/ai-mistral@5.7.0
- @memberjunction/ai-ollama@5.7.0
- @memberjunction/ai-openai@5.7.0
- @memberjunction/ai-openrouter@5.7.0
- @memberjunction/ai-recommendations-rex@5.7.0
- @memberjunction/ai-vertex@5.7.0
- @memberjunction/ai-zhipu@5.7.0
- @memberjunction/ai-xai@5.7.0
- @memberjunction/ai-vectors-pinecone@5.7.0

## 5.6.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.6.0
- @memberjunction/ai-vectors-pinecone@5.6.0
- @memberjunction/ai-anthropic@5.6.0
- @memberjunction/ai-azure@5.6.0
- @memberjunction/ai-bedrock@5.6.0
- @memberjunction/ai-betty-bot@5.6.0
- @memberjunction/ai-blackforestlabs@5.6.0
- @memberjunction/ai-cerebras@5.6.0
- @memberjunction/ai-cohere@5.6.0
- @memberjunction/ai-elevenlabs@5.6.0
- @memberjunction/ai-fireworks@5.6.0
- @memberjunction/ai-gemini@5.6.0
- @memberjunction/ai-groq@5.6.0
- @memberjunction/ai-heygen@5.6.0
- @memberjunction/ai-lmstudio@5.6.0
- @memberjunction/ai-local-embeddings@5.6.0
- @memberjunction/ai-minimax@5.6.0
- @memberjunction/ai-mistral@5.6.0
- @memberjunction/ai-ollama@5.6.0
- @memberjunction/ai-openai@5.6.0
- @memberjunction/ai-openrouter@5.6.0
- @memberjunction/ai-vertex@5.6.0
- @memberjunction/ai-zhipu@5.6.0
- @memberjunction/ai-xai@5.6.0

## 5.5.0

### Patch Changes

- a1648c5: Add MiniMax AI provider package, add MiniMax and Gemini 3.1 Pro models to AI model catalog, fix ng-conversations to prevent client from overwriting server-completed conversation details, and align metadata files with SQL logger output to prevent phantom mj-sync updates
- df2457c: no migration, just small code changes
- Updated dependencies [a1648c5]
- Updated dependencies [df2457c]
  - @memberjunction/ai-minimax@5.5.0
  - @memberjunction/ai-anthropic@5.5.0
  - @memberjunction/ai-azure@5.5.0
  - @memberjunction/ai-bedrock@5.5.0
  - @memberjunction/ai-betty-bot@5.5.0
  - @memberjunction/ai-blackforestlabs@5.5.0
  - @memberjunction/ai-cerebras@5.5.0
  - @memberjunction/ai-cohere@5.5.0
  - @memberjunction/ai-elevenlabs@5.5.0
  - @memberjunction/ai-fireworks@5.5.0
  - @memberjunction/ai-gemini@5.5.0
  - @memberjunction/ai-groq@5.5.0
  - @memberjunction/ai-heygen@5.5.0
  - @memberjunction/ai-lmstudio@5.5.0
  - @memberjunction/ai-local-embeddings@5.5.0
  - @memberjunction/ai-mistral@5.5.0
  - @memberjunction/ai-ollama@5.5.0
  - @memberjunction/ai-openai@5.5.0
  - @memberjunction/ai-openrouter@5.5.0
  - @memberjunction/ai-recommendations-rex@5.5.0
  - @memberjunction/ai-vectors-pinecone@5.5.0
  - @memberjunction/ai-vertex@5.5.0
  - @memberjunction/ai-zhipu@5.5.0
  - @memberjunction/ai-xai@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai-anthropic@5.4.1
- @memberjunction/ai-azure@5.4.1
- @memberjunction/ai-bedrock@5.4.1
- @memberjunction/ai-betty-bot@5.4.1
- @memberjunction/ai-blackforestlabs@5.4.1
- @memberjunction/ai-cerebras@5.4.1
- @memberjunction/ai-cohere@5.4.1
- @memberjunction/ai-elevenlabs@5.4.1
- @memberjunction/ai-fireworks@5.4.1
- @memberjunction/ai-gemini@5.4.1
- @memberjunction/ai-groq@5.4.1
- @memberjunction/ai-heygen@5.4.1
- @memberjunction/ai-lmstudio@5.4.1
- @memberjunction/ai-local-embeddings@5.4.1
- @memberjunction/ai-mistral@5.4.1
- @memberjunction/ai-ollama@5.4.1
- @memberjunction/ai-openai@5.4.1
- @memberjunction/ai-openrouter@5.4.1
- @memberjunction/ai-recommendations-rex@5.4.1
- @memberjunction/ai-vectors-pinecone@5.4.1
- @memberjunction/ai-vertex@5.4.1
- @memberjunction/ai-zhipu@5.4.1
- @memberjunction/ai-xai@5.4.1

## 5.4.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.4.0
- @memberjunction/ai-vectors-pinecone@5.4.0
- @memberjunction/ai-anthropic@5.4.0
- @memberjunction/ai-azure@5.4.0
- @memberjunction/ai-bedrock@5.4.0
- @memberjunction/ai-betty-bot@5.4.0
- @memberjunction/ai-blackforestlabs@5.4.0
- @memberjunction/ai-cerebras@5.4.0
- @memberjunction/ai-cohere@5.4.0
- @memberjunction/ai-elevenlabs@5.4.0
- @memberjunction/ai-fireworks@5.4.0
- @memberjunction/ai-gemini@5.4.0
- @memberjunction/ai-groq@5.4.0
- @memberjunction/ai-heygen@5.4.0
- @memberjunction/ai-lmstudio@5.4.0
- @memberjunction/ai-local-embeddings@5.4.0
- @memberjunction/ai-mistral@5.4.0
- @memberjunction/ai-ollama@5.4.0
- @memberjunction/ai-openai@5.4.0
- @memberjunction/ai-openrouter@5.4.0
- @memberjunction/ai-vertex@5.4.0
- @memberjunction/ai-zhipu@5.4.0
- @memberjunction/ai-xai@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-anthropic@5.3.1
- @memberjunction/ai-azure@5.3.1
- @memberjunction/ai-bedrock@5.3.1
- @memberjunction/ai-betty-bot@5.3.1
- @memberjunction/ai-blackforestlabs@5.3.1
- @memberjunction/ai-cerebras@5.3.1
- @memberjunction/ai-cohere@5.3.1
- @memberjunction/ai-elevenlabs@5.3.1
- @memberjunction/ai-fireworks@5.3.1
- @memberjunction/ai-gemini@5.3.1
- @memberjunction/ai-groq@5.3.1
- @memberjunction/ai-heygen@5.3.1
- @memberjunction/ai-lmstudio@5.3.1
- @memberjunction/ai-local-embeddings@5.3.1
- @memberjunction/ai-mistral@5.3.1
- @memberjunction/ai-ollama@5.3.1
- @memberjunction/ai-openai@5.3.1
- @memberjunction/ai-openrouter@5.3.1
- @memberjunction/ai-recommendations-rex@5.3.1
- @memberjunction/ai-vectors-pinecone@5.3.1
- @memberjunction/ai-vertex@5.3.1
- @memberjunction/ai-zhipu@5.3.1
- @memberjunction/ai-xai@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.3.0
- @memberjunction/ai-vectors-pinecone@5.3.0
- @memberjunction/ai-anthropic@5.3.0
- @memberjunction/ai-azure@5.3.0
- @memberjunction/ai-bedrock@5.3.0
- @memberjunction/ai-betty-bot@5.3.0
- @memberjunction/ai-blackforestlabs@5.3.0
- @memberjunction/ai-cerebras@5.3.0
- @memberjunction/ai-cohere@5.3.0
- @memberjunction/ai-elevenlabs@5.3.0
- @memberjunction/ai-fireworks@5.3.0
- @memberjunction/ai-gemini@5.3.0
- @memberjunction/ai-groq@5.3.0
- @memberjunction/ai-heygen@5.3.0
- @memberjunction/ai-lmstudio@5.3.0
- @memberjunction/ai-local-embeddings@5.3.0
- @memberjunction/ai-mistral@5.3.0
- @memberjunction/ai-ollama@5.3.0
- @memberjunction/ai-openai@5.3.0
- @memberjunction/ai-openrouter@5.3.0
- @memberjunction/ai-vertex@5.3.0
- @memberjunction/ai-zhipu@5.3.0
- @memberjunction/ai-xai@5.3.0

## 5.2.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@5.2.0
- @memberjunction/ai-vectors-pinecone@5.2.0
- @memberjunction/ai-anthropic@5.2.0
- @memberjunction/ai-azure@5.2.0
- @memberjunction/ai-bedrock@5.2.0
- @memberjunction/ai-betty-bot@5.2.0
- @memberjunction/ai-blackforestlabs@5.2.0
- @memberjunction/ai-cerebras@5.2.0
- @memberjunction/ai-cohere@5.2.0
- @memberjunction/ai-elevenlabs@5.2.0
- @memberjunction/ai-fireworks@5.2.0
- @memberjunction/ai-gemini@5.2.0
- @memberjunction/ai-groq@5.2.0
- @memberjunction/ai-heygen@5.2.0
- @memberjunction/ai-lmstudio@5.2.0
- @memberjunction/ai-local-embeddings@5.2.0
- @memberjunction/ai-mistral@5.2.0
- @memberjunction/ai-ollama@5.2.0
- @memberjunction/ai-openai@5.2.0
- @memberjunction/ai-openrouter@5.2.0
- @memberjunction/ai-vertex@5.2.0
- @memberjunction/ai-zhipu@5.2.0
- @memberjunction/ai-xai@5.2.0

## 5.1.0

### Patch Changes

- @memberjunction/ai-anthropic@5.1.0
- @memberjunction/ai-azure@5.1.0
- @memberjunction/ai-bedrock@5.1.0
- @memberjunction/ai-betty-bot@5.1.0
- @memberjunction/ai-blackforestlabs@5.1.0
- @memberjunction/ai-cerebras@5.1.0
- @memberjunction/ai-cohere@5.1.0
- @memberjunction/ai-elevenlabs@5.1.0
- @memberjunction/ai-fireworks@5.1.0
- @memberjunction/ai-gemini@5.1.0
- @memberjunction/ai-groq@5.1.0
- @memberjunction/ai-heygen@5.1.0
- @memberjunction/ai-lmstudio@5.1.0
- @memberjunction/ai-local-embeddings@5.1.0
- @memberjunction/ai-mistral@5.1.0
- @memberjunction/ai-ollama@5.1.0
- @memberjunction/ai-openai@5.1.0
- @memberjunction/ai-openrouter@5.1.0
- @memberjunction/ai-recommendations-rex@5.1.0
- @memberjunction/ai-vectors-pinecone@5.1.0
- @memberjunction/ai-vertex@5.1.0
- @memberjunction/ai-zhipu@5.1.0
- @memberjunction/ai-xai@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [4aa1b54]
  - @memberjunction/ai-anthropic@5.0.0
  - @memberjunction/ai-azure@5.0.0
  - @memberjunction/ai-bedrock@5.0.0
  - @memberjunction/ai-betty-bot@5.0.0
  - @memberjunction/ai-blackforestlabs@5.0.0
  - @memberjunction/ai-cerebras@5.0.0
  - @memberjunction/ai-cohere@5.0.0
  - @memberjunction/ai-elevenlabs@5.0.0
  - @memberjunction/ai-fireworks@5.0.0
  - @memberjunction/ai-gemini@5.0.0
  - @memberjunction/ai-groq@5.0.0
  - @memberjunction/ai-heygen@5.0.0
  - @memberjunction/ai-lmstudio@5.0.0
  - @memberjunction/ai-local-embeddings@5.0.0
  - @memberjunction/ai-mistral@5.0.0
  - @memberjunction/ai-ollama@5.0.0
  - @memberjunction/ai-openai@5.0.0
  - @memberjunction/ai-openrouter@5.0.0
  - @memberjunction/ai-recommendations-rex@5.0.0
  - @memberjunction/ai-vectors-pinecone@5.0.0
  - @memberjunction/ai-vertex@5.0.0
  - @memberjunction/ai-zhipu@5.0.0
  - @memberjunction/ai-xai@5.0.0

## 4.4.0

### Patch Changes

- 3bab2cd: Add @memberjunction/ai-zhipu package for Z.AI GLM models including GLM 5 support
- Updated dependencies [3bab2cd]
  - @memberjunction/ai-zhipu@4.4.0
  - @memberjunction/ai-recommendations-rex@4.4.0
  - @memberjunction/ai-vectors-pinecone@4.4.0
  - @memberjunction/ai-anthropic@4.4.0
  - @memberjunction/ai-azure@4.4.0
  - @memberjunction/ai-bedrock@4.4.0
  - @memberjunction/ai-betty-bot@4.4.0
  - @memberjunction/ai-blackforestlabs@4.4.0
  - @memberjunction/ai-cerebras@4.4.0
  - @memberjunction/ai-cohere@4.4.0
  - @memberjunction/ai-elevenlabs@4.4.0
  - @memberjunction/ai-fireworks@4.4.0
  - @memberjunction/ai-gemini@4.4.0
  - @memberjunction/ai-groq@4.4.0
  - @memberjunction/ai-heygen@4.4.0
  - @memberjunction/ai-lmstudio@4.4.0
  - @memberjunction/ai-local-embeddings@4.4.0
  - @memberjunction/ai-mistral@4.4.0
  - @memberjunction/ai-ollama@4.4.0
  - @memberjunction/ai-openai@4.4.0
  - @memberjunction/ai-openrouter@4.4.0
  - @memberjunction/ai-vertex@4.4.0
  - @memberjunction/ai-xai@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-anthropic@4.3.1
- @memberjunction/ai-azure@4.3.1
- @memberjunction/ai-bedrock@4.3.1
- @memberjunction/ai-betty-bot@4.3.1
- @memberjunction/ai-blackforestlabs@4.3.1
- @memberjunction/ai-cerebras@4.3.1
- @memberjunction/ai-cohere@4.3.1
- @memberjunction/ai-elevenlabs@4.3.1
- @memberjunction/ai-fireworks@4.3.1
- @memberjunction/ai-gemini@4.3.1
- @memberjunction/ai-groq@4.3.1
- @memberjunction/ai-heygen@4.3.1
- @memberjunction/ai-lmstudio@4.3.1
- @memberjunction/ai-local-embeddings@4.3.1
- @memberjunction/ai-mistral@4.3.1
- @memberjunction/ai-ollama@4.3.1
- @memberjunction/ai-openai@4.3.1
- @memberjunction/ai-openrouter@4.3.1
- @memberjunction/ai-recommendations-rex@4.3.1
- @memberjunction/ai-vectors-pinecone@4.3.1
- @memberjunction/ai-vertex@4.3.1
- @memberjunction/ai-xai@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [7b39671]
  - @memberjunction/ai-local-embeddings@4.3.0
  - @memberjunction/ai-recommendations-rex@4.3.0
  - @memberjunction/ai-vectors-pinecone@4.3.0
  - @memberjunction/ai-anthropic@4.3.0
  - @memberjunction/ai-azure@4.3.0
  - @memberjunction/ai-bedrock@4.3.0
  - @memberjunction/ai-betty-bot@4.3.0
  - @memberjunction/ai-blackforestlabs@4.3.0
  - @memberjunction/ai-cerebras@4.3.0
  - @memberjunction/ai-cohere@4.3.0
  - @memberjunction/ai-elevenlabs@4.3.0
  - @memberjunction/ai-fireworks@4.3.0
  - @memberjunction/ai-gemini@4.3.0
  - @memberjunction/ai-groq@4.3.0
  - @memberjunction/ai-heygen@4.3.0
  - @memberjunction/ai-lmstudio@4.3.0
  - @memberjunction/ai-mistral@4.3.0
  - @memberjunction/ai-ollama@4.3.0
  - @memberjunction/ai-openai@4.3.0
  - @memberjunction/ai-openrouter@4.3.0
  - @memberjunction/ai-vertex@4.3.0
  - @memberjunction/ai-xai@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-anthropic@4.2.0
- @memberjunction/ai-azure@4.2.0
- @memberjunction/ai-bedrock@4.2.0
- @memberjunction/ai-betty-bot@4.2.0
- @memberjunction/ai-blackforestlabs@4.2.0
- @memberjunction/ai-cerebras@4.2.0
- @memberjunction/ai-cohere@4.2.0
- @memberjunction/ai-elevenlabs@4.2.0
- @memberjunction/ai-fireworks@4.2.0
- @memberjunction/ai-gemini@4.2.0
- @memberjunction/ai-groq@4.2.0
- @memberjunction/ai-heygen@4.2.0
- @memberjunction/ai-lmstudio@4.2.0
- @memberjunction/ai-local-embeddings@4.2.0
- @memberjunction/ai-mistral@4.2.0
- @memberjunction/ai-ollama@4.2.0
- @memberjunction/ai-openai@4.2.0
- @memberjunction/ai-openrouter@4.2.0
- @memberjunction/ai-recommendations-rex@4.2.0
- @memberjunction/ai-vectors-pinecone@4.2.0
- @memberjunction/ai-vertex@4.2.0
- @memberjunction/ai-xai@4.2.0

## 4.1.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@4.1.0
- @memberjunction/ai-vectors-pinecone@4.1.0
- @memberjunction/ai-anthropic@4.1.0
- @memberjunction/ai-azure@4.1.0
- @memberjunction/ai-bedrock@4.1.0
- @memberjunction/ai-betty-bot@4.1.0
- @memberjunction/ai-blackforestlabs@4.1.0
- @memberjunction/ai-cerebras@4.1.0
- @memberjunction/ai-cohere@4.1.0
- @memberjunction/ai-elevenlabs@4.1.0
- @memberjunction/ai-fireworks@4.1.0
- @memberjunction/ai-gemini@4.1.0
- @memberjunction/ai-groq@4.1.0
- @memberjunction/ai-heygen@4.1.0
- @memberjunction/ai-lmstudio@4.1.0
- @memberjunction/ai-local-embeddings@4.1.0
- @memberjunction/ai-mistral@4.1.0
- @memberjunction/ai-ollama@4.1.0
- @memberjunction/ai-openai@4.1.0
- @memberjunction/ai-openrouter@4.1.0
- @memberjunction/ai-vertex@4.1.0
- @memberjunction/ai-xai@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ai-anthropic@4.0.0
  - @memberjunction/ai-azure@4.0.0
  - @memberjunction/ai-bedrock@4.0.0
  - @memberjunction/ai-betty-bot@4.0.0
  - @memberjunction/ai-blackforestlabs@4.0.0
  - @memberjunction/ai-cerebras@4.0.0
  - @memberjunction/ai-cohere@4.0.0
  - @memberjunction/ai-elevenlabs@4.0.0
  - @memberjunction/ai-fireworks@4.0.0
  - @memberjunction/ai-gemini@4.0.0
  - @memberjunction/ai-groq@4.0.0
  - @memberjunction/ai-heygen@4.0.0
  - @memberjunction/ai-lmstudio@4.0.0
  - @memberjunction/ai-local-embeddings@4.0.0
  - @memberjunction/ai-mistral@4.0.0
  - @memberjunction/ai-ollama@4.0.0
  - @memberjunction/ai-openai@4.0.0
  - @memberjunction/ai-openrouter@4.0.0
  - @memberjunction/ai-recommendations-rex@4.0.0
  - @memberjunction/ai-vectors-pinecone@4.0.0
  - @memberjunction/ai-vertex@4.0.0
  - @memberjunction/ai-xai@4.0.0

## 3.4.0

### Patch Changes

- d596467: Add Fireworks.ai LLM provider package with Kimi K2.5 model support, fix AI prompts failover bug, and add Jest testing infrastructure
- Updated dependencies [d596467]
  - @memberjunction/ai-fireworks@3.4.0
  - @memberjunction/ai-recommendations-rex@3.4.0
  - @memberjunction/ai-vectors-pinecone@3.4.0
  - @memberjunction/ai-anthropic@3.4.0
  - @memberjunction/ai-azure@3.4.0
  - @memberjunction/ai-bedrock@3.4.0
  - @memberjunction/ai-betty-bot@3.4.0
  - @memberjunction/ai-blackforestlabs@3.4.0
  - @memberjunction/ai-cerebras@3.4.0
  - @memberjunction/ai-cohere@3.4.0
  - @memberjunction/ai-elevenlabs@3.4.0
  - @memberjunction/ai-gemini@3.4.0
  - @memberjunction/ai-groq@3.4.0
  - @memberjunction/ai-heygen@3.4.0
  - @memberjunction/ai-lmstudio@3.4.0
  - @memberjunction/ai-local-embeddings@3.4.0
  - @memberjunction/ai-mistral@3.4.0
  - @memberjunction/ai-ollama@3.4.0
  - @memberjunction/ai-openai@3.4.0
  - @memberjunction/ai-openrouter@3.4.0
  - @memberjunction/ai-vertex@3.4.0
  - @memberjunction/ai-xai@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@3.3.0
- @memberjunction/ai-vectors-pinecone@3.3.0
- @memberjunction/ai-anthropic@3.3.0
- @memberjunction/ai-azure@3.3.0
- @memberjunction/ai-bedrock@3.3.0
- @memberjunction/ai-betty-bot@3.3.0
- @memberjunction/ai-blackforestlabs@3.3.0
- @memberjunction/ai-cerebras@3.3.0
- @memberjunction/ai-cohere@3.3.0
- @memberjunction/ai-elevenlabs@3.3.0
- @memberjunction/ai-gemini@3.3.0
- @memberjunction/ai-groq@3.3.0
- @memberjunction/ai-heygen@3.3.0
- @memberjunction/ai-lmstudio@3.3.0
- @memberjunction/ai-local-embeddings@3.3.0
- @memberjunction/ai-mistral@3.3.0
- @memberjunction/ai-ollama@3.3.0
- @memberjunction/ai-openai@3.3.0
- @memberjunction/ai-openrouter@3.3.0
- @memberjunction/ai-vertex@3.3.0
- @memberjunction/ai-xai@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [cbd2714]
  - @memberjunction/ai-gemini@3.2.0
  - @memberjunction/ai-recommendations-rex@3.2.0
  - @memberjunction/ai-vertex@3.2.0
  - @memberjunction/ai-vectors-pinecone@3.2.0
  - @memberjunction/ai-anthropic@3.2.0
  - @memberjunction/ai-azure@3.2.0
  - @memberjunction/ai-bedrock@3.2.0
  - @memberjunction/ai-betty-bot@3.2.0
  - @memberjunction/ai-blackforestlabs@3.2.0
  - @memberjunction/ai-cerebras@3.2.0
  - @memberjunction/ai-elevenlabs@3.2.0
  - @memberjunction/ai-groq@3.2.0
  - @memberjunction/ai-heygen@3.2.0
  - @memberjunction/ai-lmstudio@3.2.0
  - @memberjunction/ai-local-embeddings@3.2.0
  - @memberjunction/ai-mistral@3.2.0
  - @memberjunction/ai-ollama@3.2.0
  - @memberjunction/ai-openai@3.2.0
  - @memberjunction/ai-openrouter@3.2.0
  - @memberjunction/ai-xai@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai-anthropic@3.1.1
- @memberjunction/ai-azure@3.1.1
- @memberjunction/ai-bedrock@3.1.1
- @memberjunction/ai-betty-bot@3.1.1
- @memberjunction/ai-blackforestlabs@3.1.1
- @memberjunction/ai-cerebras@3.1.1
- @memberjunction/ai-elevenlabs@3.1.1
- @memberjunction/ai-gemini@3.1.1
- @memberjunction/ai-groq@3.1.1
- @memberjunction/ai-heygen@3.1.1
- @memberjunction/ai-lmstudio@3.1.1
- @memberjunction/ai-local-embeddings@3.1.1
- @memberjunction/ai-mistral@3.1.1
- @memberjunction/ai-ollama@3.1.1
- @memberjunction/ai-openai@3.1.1
- @memberjunction/ai-openrouter@3.1.1
- @memberjunction/ai-recommendations-rex@3.1.1
- @memberjunction/ai-vectors-pinecone@3.1.1
- @memberjunction/ai-vertex@3.1.1
- @memberjunction/ai-xai@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai-anthropic@3.0.0
- @memberjunction/ai-azure@3.0.0
- @memberjunction/ai-bedrock@3.0.0
- @memberjunction/ai-betty-bot@3.0.0
- @memberjunction/ai-cerebras@3.0.0
- @memberjunction/ai-elevenlabs@3.0.0
- @memberjunction/ai-gemini@3.0.0
- @memberjunction/ai-groq@3.0.0
- @memberjunction/ai-heygen@3.0.0
- @memberjunction/ai-lmstudio@3.0.0
- @memberjunction/ai-local-embeddings@3.0.0
- @memberjunction/ai-mistral@3.0.0
- @memberjunction/ai-ollama@3.0.0
- @memberjunction/ai-openai@3.0.0
- @memberjunction/ai-openrouter@3.0.0
- @memberjunction/ai-recommendations-rex@3.0.0
- @memberjunction/ai-vectors-pinecone@3.0.0
- @memberjunction/ai-vertex@3.0.0
- @memberjunction/ai-xai@3.0.0

## 2.133.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@2.133.0
- @memberjunction/ai-vectors-pinecone@2.133.0
- @memberjunction/ai-anthropic@2.133.0
- @memberjunction/ai-azure@2.133.0
- @memberjunction/ai-bedrock@2.133.0
- @memberjunction/ai-betty-bot@2.133.0
- @memberjunction/ai-cerebras@2.133.0
- @memberjunction/ai-elevenlabs@2.133.0
- @memberjunction/ai-gemini@2.133.0
- @memberjunction/ai-groq@2.133.0
- @memberjunction/ai-heygen@2.133.0
- @memberjunction/ai-lmstudio@2.133.0
- @memberjunction/ai-local-embeddings@2.133.0
- @memberjunction/ai-mistral@2.133.0
- @memberjunction/ai-ollama@2.133.0
- @memberjunction/ai-openai@2.133.0
- @memberjunction/ai-openrouter@2.133.0
- @memberjunction/ai-vertex@2.133.0
- @memberjunction/ai-xai@2.133.0

## 2.132.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@2.132.0
- @memberjunction/ai-vectors-pinecone@2.132.0
- @memberjunction/ai-anthropic@2.132.0
- @memberjunction/ai-azure@2.132.0
- @memberjunction/ai-bedrock@2.132.0
- @memberjunction/ai-betty-bot@2.132.0
- @memberjunction/ai-cerebras@2.132.0
- @memberjunction/ai-elevenlabs@2.132.0
- @memberjunction/ai-gemini@2.132.0
- @memberjunction/ai-groq@2.132.0
- @memberjunction/ai-heygen@2.132.0
- @memberjunction/ai-lmstudio@2.132.0
- @memberjunction/ai-local-embeddings@2.132.0
- @memberjunction/ai-mistral@2.132.0
- @memberjunction/ai-ollama@2.132.0
- @memberjunction/ai-openai@2.132.0
- @memberjunction/ai-openrouter@2.132.0
- @memberjunction/ai-vertex@2.132.0
- @memberjunction/ai-xai@2.132.0

## 2.131.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@2.131.0
- @memberjunction/ai-vectors-pinecone@2.131.0
- @memberjunction/ai-anthropic@2.131.0
- @memberjunction/ai-azure@2.131.0
- @memberjunction/ai-bedrock@2.131.0
- @memberjunction/ai-betty-bot@2.131.0
- @memberjunction/ai-cerebras@2.131.0
- @memberjunction/ai-elevenlabs@2.131.0
- @memberjunction/ai-gemini@2.131.0
- @memberjunction/ai-groq@2.131.0
- @memberjunction/ai-heygen@2.131.0
- @memberjunction/ai-lmstudio@2.131.0
- @memberjunction/ai-local-embeddings@2.131.0
- @memberjunction/ai-mistral@2.131.0
- @memberjunction/ai-ollama@2.131.0
- @memberjunction/ai-openai@2.131.0
- @memberjunction/ai-openrouter@2.131.0
- @memberjunction/ai-vertex@2.131.0
- @memberjunction/ai-xai@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai-anthropic@2.130.1
- @memberjunction/ai-azure@2.130.1
- @memberjunction/ai-bedrock@2.130.1
- @memberjunction/ai-betty-bot@2.130.1
- @memberjunction/ai-cerebras@2.130.1
- @memberjunction/ai-elevenlabs@2.130.1
- @memberjunction/ai-gemini@2.130.1
- @memberjunction/ai-groq@2.130.1
- @memberjunction/ai-heygen@2.130.1
- @memberjunction/ai-lmstudio@2.130.1
- @memberjunction/ai-local-embeddings@2.130.1
- @memberjunction/ai-mistral@2.130.1
- @memberjunction/ai-ollama@2.130.1
- @memberjunction/ai-openai@2.130.1
- @memberjunction/ai-openrouter@2.130.1
- @memberjunction/ai-recommendations-rex@2.130.1
- @memberjunction/ai-vectors-pinecone@2.130.1
- @memberjunction/ai-vertex@2.130.1
- @memberjunction/ai-xai@2.130.1

## 2.130.0

### Minor Changes

- 83ae347: migrations

### Patch Changes

- Updated dependencies [83ae347]
  - @memberjunction/ai-anthropic@2.130.0
  - @memberjunction/ai-azure@2.130.0
  - @memberjunction/ai-bedrock@2.130.0
  - @memberjunction/ai-betty-bot@2.130.0
  - @memberjunction/ai-cerebras@2.130.0
  - @memberjunction/ai-elevenlabs@2.130.0
  - @memberjunction/ai-gemini@2.130.0
  - @memberjunction/ai-groq@2.130.0
  - @memberjunction/ai-heygen@2.130.0
  - @memberjunction/ai-lmstudio@2.130.0
  - @memberjunction/ai-local-embeddings@2.130.0
  - @memberjunction/ai-mistral@2.130.0
  - @memberjunction/ai-ollama@2.130.0
  - @memberjunction/ai-openai@2.130.0
  - @memberjunction/ai-openrouter@2.130.0
  - @memberjunction/ai-recommendations-rex@2.130.0
  - @memberjunction/ai-vertex@2.130.0
  - @memberjunction/ai-xai@2.130.0
  - @memberjunction/ai-vectors-pinecone@2.130.0

## 2.129.0

### Minor Changes

- c7e38aa: migration

### Patch Changes

- 7a39231: Add Vertex AI provider with Google GenAI SDK integration, resolve database connection timeout, and improve conversation UI
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/ai-anthropic@2.129.0
  - @memberjunction/ai-azure@2.129.0
  - @memberjunction/ai-bedrock@2.129.0
  - @memberjunction/ai-betty-bot@2.129.0
  - @memberjunction/ai-openai@2.129.0
  - @memberjunction/ai-vectors-pinecone@2.129.0
  - @memberjunction/ai-vertex@2.129.0
  - @memberjunction/ai-recommendations-rex@2.129.0
  - @memberjunction/ai-cerebras@2.129.0
  - @memberjunction/ai-elevenlabs@2.129.0
  - @memberjunction/ai-gemini@2.129.0
  - @memberjunction/ai-groq@2.129.0
  - @memberjunction/ai-heygen@2.129.0
  - @memberjunction/ai-lmstudio@2.129.0
  - @memberjunction/ai-local-embeddings@2.129.0
  - @memberjunction/ai-mistral@2.129.0
  - @memberjunction/ai-ollama@2.129.0
  - @memberjunction/ai-openrouter@2.129.0
  - @memberjunction/ai-xai@2.129.0

## 2.128.0

### Minor Changes

- 5f70858: migration

### Patch Changes

- Updated dependencies [0863f85]
  - @memberjunction/ai-gemini@2.128.0
  - @memberjunction/ai-recommendations-rex@2.128.0
  - @memberjunction/ai-vectors-pinecone@2.128.0
  - @memberjunction/ai-anthropic@2.128.0
  - @memberjunction/ai-azure@2.128.0
  - @memberjunction/ai-bedrock@2.128.0
  - @memberjunction/ai-betty-bot@2.128.0
  - @memberjunction/ai-cerebras@2.128.0
  - @memberjunction/ai-elevenlabs@2.128.0
  - @memberjunction/ai-groq@2.128.0
  - @memberjunction/ai-heygen@2.128.0
  - @memberjunction/ai-lmstudio@2.128.0
  - @memberjunction/ai-local-embeddings@2.128.0
  - @memberjunction/ai-mistral@2.128.0
  - @memberjunction/ai-ollama@2.128.0
  - @memberjunction/ai-openai@2.128.0
  - @memberjunction/ai-openrouter@2.128.0
  - @memberjunction/ai-vertex@2.128.0
  - @memberjunction/ai-xai@2.128.0

## 2.127.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@2.127.0
- @memberjunction/ai-vectors-pinecone@2.127.0
- @memberjunction/ai-anthropic@2.127.0
- @memberjunction/ai-azure@2.127.0
- @memberjunction/ai-bedrock@2.127.0
- @memberjunction/ai-betty-bot@2.127.0
- @memberjunction/ai-cerebras@2.127.0
- @memberjunction/ai-elevenlabs@2.127.0
- @memberjunction/ai-gemini@2.127.0
- @memberjunction/ai-groq@2.127.0
- @memberjunction/ai-heygen@2.127.0
- @memberjunction/ai-lmstudio@2.127.0
- @memberjunction/ai-local-embeddings@2.127.0
- @memberjunction/ai-mistral@2.127.0
- @memberjunction/ai-ollama@2.127.0
- @memberjunction/ai-openai@2.127.0
- @memberjunction/ai-openrouter@2.127.0
- @memberjunction/ai-vertex@2.127.0
- @memberjunction/ai-xai@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai-anthropic@2.126.1
- @memberjunction/ai-azure@2.126.1
- @memberjunction/ai-bedrock@2.126.1
- @memberjunction/ai-betty-bot@2.126.1
- @memberjunction/ai-cerebras@2.126.1
- @memberjunction/ai-elevenlabs@2.126.1
- @memberjunction/ai-gemini@2.126.1
- @memberjunction/ai-groq@2.126.1
- @memberjunction/ai-heygen@2.126.1
- @memberjunction/ai-lmstudio@2.126.1
- @memberjunction/ai-local-embeddings@2.126.1
- @memberjunction/ai-mistral@2.126.1
- @memberjunction/ai-ollama@2.126.1
- @memberjunction/ai-openai@2.126.1
- @memberjunction/ai-openrouter@2.126.1
- @memberjunction/ai-recommendations-rex@2.126.1
- @memberjunction/ai-vectors-pinecone@2.126.1
- @memberjunction/ai-vertex@2.126.1
- @memberjunction/ai-xai@2.126.1

## 2.126.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@2.126.0
- @memberjunction/ai-vectors-pinecone@2.126.0
- @memberjunction/ai-anthropic@2.126.0
- @memberjunction/ai-azure@2.126.0
- @memberjunction/ai-bedrock@2.126.0
- @memberjunction/ai-betty-bot@2.126.0
- @memberjunction/ai-cerebras@2.126.0
- @memberjunction/ai-elevenlabs@2.126.0
- @memberjunction/ai-gemini@2.126.0
- @memberjunction/ai-groq@2.126.0
- @memberjunction/ai-heygen@2.126.0
- @memberjunction/ai-lmstudio@2.126.0
- @memberjunction/ai-local-embeddings@2.126.0
- @memberjunction/ai-mistral@2.126.0
- @memberjunction/ai-ollama@2.126.0
- @memberjunction/ai-openai@2.126.0
- @memberjunction/ai-openrouter@2.126.0
- @memberjunction/ai-vertex@2.126.0
- @memberjunction/ai-xai@2.126.0

## 2.125.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@2.125.0
- @memberjunction/ai-vectors-pinecone@2.125.0
- @memberjunction/ai-anthropic@2.125.0
- @memberjunction/ai-azure@2.125.0
- @memberjunction/ai-bedrock@2.125.0
- @memberjunction/ai-betty-bot@2.125.0
- @memberjunction/ai-cerebras@2.125.0
- @memberjunction/ai-elevenlabs@2.125.0
- @memberjunction/ai-gemini@2.125.0
- @memberjunction/ai-groq@2.125.0
- @memberjunction/ai-heygen@2.125.0
- @memberjunction/ai-lmstudio@2.125.0
- @memberjunction/ai-local-embeddings@2.125.0
- @memberjunction/ai-mistral@2.125.0
- @memberjunction/ai-ollama@2.125.0
- @memberjunction/ai-openai@2.125.0
- @memberjunction/ai-openrouter@2.125.0
- @memberjunction/ai-vertex@2.125.0
- @memberjunction/ai-xai@2.125.0

## 2.124.0

### Patch Changes

- @memberjunction/ai-recommendations-rex@2.124.0
- @memberjunction/ai-vectors-pinecone@2.124.0
- @memberjunction/ai-anthropic@2.124.0
- @memberjunction/ai-azure@2.124.0
- @memberjunction/ai-bedrock@2.124.0
- @memberjunction/ai-betty-bot@2.124.0
- @memberjunction/ai-cerebras@2.124.0
- @memberjunction/ai-elevenlabs@2.124.0
- @memberjunction/ai-gemini@2.124.0
- @memberjunction/ai-groq@2.124.0
- @memberjunction/ai-heygen@2.124.0
- @memberjunction/ai-lmstudio@2.124.0
- @memberjunction/ai-local-embeddings@2.124.0
- @memberjunction/ai-mistral@2.124.0
- @memberjunction/ai-ollama@2.124.0
- @memberjunction/ai-openai@2.124.0
- @memberjunction/ai-openrouter@2.124.0
- @memberjunction/ai-vertex@2.124.0
- @memberjunction/ai-xai@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-anthropic@2.123.1
- @memberjunction/ai-azure@2.123.1
- @memberjunction/ai-bedrock@2.123.1
- @memberjunction/ai-betty-bot@2.123.1
- @memberjunction/ai-cerebras@2.123.1
- @memberjunction/ai-elevenlabs@2.123.1
- @memberjunction/ai-gemini@2.123.1
- @memberjunction/ai-groq@2.123.1
- @memberjunction/ai-heygen@2.123.1
- @memberjunction/ai-lmstudio@2.123.1
- @memberjunction/ai-local-embeddings@2.123.1
- @memberjunction/ai-mistral@2.123.1
- @memberjunction/ai-ollama@2.123.1
- @memberjunction/ai-openai@2.123.1
- @memberjunction/ai-openrouter@2.123.1
- @memberjunction/ai-recommendations-rex@2.123.1
- @memberjunction/ai-vectors-pinecone@2.123.1
- @memberjunction/ai-vertex@2.123.1
- @memberjunction/ai-xai@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/ai-vectors-pinecone@2.123.0
- @memberjunction/ai-anthropic@2.123.0
- @memberjunction/ai-azure@2.123.0
- @memberjunction/ai-bedrock@2.123.0
- @memberjunction/ai-betty-bot@2.123.0
- @memberjunction/ai-cerebras@2.123.0
- @memberjunction/ai-elevenlabs@2.123.0
- @memberjunction/ai-gemini@2.123.0
- @memberjunction/ai-groq@2.123.0
- @memberjunction/ai-heygen@2.123.0
- @memberjunction/ai-lmstudio@2.123.0
- @memberjunction/ai-local-embeddings@2.123.0
- @memberjunction/ai-mistral@2.123.0
- @memberjunction/ai-ollama@2.123.0
- @memberjunction/ai-openai@2.123.0
- @memberjunction/ai-openrouter@2.123.0
- @memberjunction/ai-recommendations-rex@2.123.0
- @memberjunction/ai-vertex@2.123.0
- @memberjunction/ai-xai@2.123.0

## 2.122.2

### Patch Changes

- Updated dependencies [81f0c44]
  - @memberjunction/ai-heygen@2.122.2
  - @memberjunction/ai-recommendations-rex@2.122.2
  - @memberjunction/ai-vectors-pinecone@2.122.2
  - @memberjunction/ai-anthropic@2.122.2
  - @memberjunction/ai-azure@2.122.2
  - @memberjunction/ai-bedrock@2.122.2
  - @memberjunction/ai-betty-bot@2.122.2
  - @memberjunction/ai-cerebras@2.122.2
  - @memberjunction/ai-elevenlabs@2.122.2
  - @memberjunction/ai-gemini@2.122.2
  - @memberjunction/ai-groq@2.122.2
  - @memberjunction/ai-lmstudio@2.122.2
  - @memberjunction/ai-local-embeddings@2.122.2
  - @memberjunction/ai-mistral@2.122.2
  - @memberjunction/ai-ollama@2.122.2
  - @memberjunction/ai-openai@2.122.2
  - @memberjunction/ai-openrouter@2.122.2
  - @memberjunction/ai-vertex@2.122.2
  - @memberjunction/ai-xai@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai-anthropic@2.122.1
- @memberjunction/ai-cerebras@2.122.1
- @memberjunction/ai-groq@2.122.1
- @memberjunction/ai-lmstudio@2.122.1
- @memberjunction/ai-local-embeddings@2.122.1
- @memberjunction/ai-mistral@2.122.1
- @memberjunction/ai-ollama@2.122.1
- @memberjunction/ai-openai@2.122.1
- @memberjunction/ai-openrouter@2.122.1
- @memberjunction/ai-xai@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6e65496]
  - @memberjunction/ai-anthropic@2.122.0
  - @memberjunction/ai-openai@2.122.0
  - @memberjunction/ai-openrouter@2.122.0
  - @memberjunction/ai-xai@2.122.0
  - @memberjunction/ai-cerebras@2.122.0
  - @memberjunction/ai-groq@2.122.0
  - @memberjunction/ai-lmstudio@2.122.0
  - @memberjunction/ai-local-embeddings@2.122.0
  - @memberjunction/ai-mistral@2.122.0
  - @memberjunction/ai-ollama@2.122.0

## 2.121.0

### Patch Changes

- @memberjunction/ai-anthropic@2.121.0
- @memberjunction/ai-cerebras@2.121.0
- @memberjunction/ai-groq@2.121.0
- @memberjunction/ai-lmstudio@2.121.0
- @memberjunction/ai-local-embeddings@2.121.0
- @memberjunction/ai-mistral@2.121.0
- @memberjunction/ai-ollama@2.121.0
- @memberjunction/ai-openai@2.121.0
- @memberjunction/ai-openrouter@2.121.0
- @memberjunction/ai-xai@2.121.0

## 2.120.0

### Patch Changes

- @memberjunction/ai-anthropic@2.120.0
- @memberjunction/ai-cerebras@2.120.0
- @memberjunction/ai-groq@2.120.0
- @memberjunction/ai-lmstudio@2.120.0
- @memberjunction/ai-local-embeddings@2.120.0
- @memberjunction/ai-mistral@2.120.0
- @memberjunction/ai-ollama@2.120.0
- @memberjunction/ai-openai@2.120.0
- @memberjunction/ai-openrouter@2.120.0
- @memberjunction/ai-xai@2.120.0

## 2.119.0

### Patch Changes

- @memberjunction/ai-anthropic@2.119.0
- @memberjunction/ai-cerebras@2.119.0
- @memberjunction/ai-groq@2.119.0
- @memberjunction/ai-lmstudio@2.119.0
- @memberjunction/ai-local-embeddings@2.119.0
- @memberjunction/ai-mistral@2.119.0
- @memberjunction/ai-ollama@2.119.0
- @memberjunction/ai-openai@2.119.0
- @memberjunction/ai-openrouter@2.119.0
- @memberjunction/ai-xai@2.119.0

## 2.118.0

### Patch Changes

- @memberjunction/ai-anthropic@2.118.0
- @memberjunction/ai-cerebras@2.118.0
- @memberjunction/ai-groq@2.118.0
- @memberjunction/ai-lmstudio@2.118.0
- @memberjunction/ai-local-embeddings@2.118.0
- @memberjunction/ai-mistral@2.118.0
- @memberjunction/ai-ollama@2.118.0
- @memberjunction/ai-openai@2.118.0
- @memberjunction/ai-openrouter@2.118.0
- @memberjunction/ai-xai@2.118.0

## 2.117.0

### Patch Changes

- @memberjunction/ai-anthropic@2.117.0
- @memberjunction/ai-cerebras@2.117.0
- @memberjunction/ai-groq@2.117.0
- @memberjunction/ai-lmstudio@2.117.0
- @memberjunction/ai-local-embeddings@2.117.0
- @memberjunction/ai-mistral@2.117.0
- @memberjunction/ai-ollama@2.117.0
- @memberjunction/ai-openai@2.117.0
- @memberjunction/ai-openrouter@2.117.0
- @memberjunction/ai-xai@2.117.0

## 2.116.0

### Patch Changes

- @memberjunction/ai-anthropic@2.116.0
- @memberjunction/ai-cerebras@2.116.0
- @memberjunction/ai-groq@2.116.0
- @memberjunction/ai-lmstudio@2.116.0
- @memberjunction/ai-local-embeddings@2.116.0
- @memberjunction/ai-mistral@2.116.0
- @memberjunction/ai-ollama@2.116.0
- @memberjunction/ai-openai@2.116.0
- @memberjunction/ai-openrouter@2.116.0
- @memberjunction/ai-xai@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/ai-anthropic@2.115.0
- @memberjunction/ai-cerebras@2.115.0
- @memberjunction/ai-groq@2.115.0
- @memberjunction/ai-lmstudio@2.115.0
- @memberjunction/ai-local-embeddings@2.115.0
- @memberjunction/ai-mistral@2.115.0
- @memberjunction/ai-ollama@2.115.0
- @memberjunction/ai-openai@2.115.0
- @memberjunction/ai-openrouter@2.115.0
- @memberjunction/ai-xai@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ai-anthropic@2.114.0
- @memberjunction/ai-cerebras@2.114.0
- @memberjunction/ai-groq@2.114.0
- @memberjunction/ai-lmstudio@2.114.0
- @memberjunction/ai-local-embeddings@2.114.0
- @memberjunction/ai-mistral@2.114.0
- @memberjunction/ai-ollama@2.114.0
- @memberjunction/ai-openai@2.114.0
- @memberjunction/ai-openrouter@2.114.0
- @memberjunction/ai-xai@2.114.0

## 2.113.2

### Patch Changes

- @memberjunction/ai-anthropic@2.113.2
- @memberjunction/ai-cerebras@2.113.2
- @memberjunction/ai-groq@2.113.2
- @memberjunction/ai-lmstudio@2.113.2
- @memberjunction/ai-local-embeddings@2.113.2
- @memberjunction/ai-mistral@2.113.2
- @memberjunction/ai-ollama@2.113.2
- @memberjunction/ai-openai@2.113.2
- @memberjunction/ai-openrouter@2.113.2
- @memberjunction/ai-xai@2.113.2

## 2.112.0

### Patch Changes

- @memberjunction/ai-anthropic@2.112.0
- @memberjunction/ai-cerebras@2.112.0
- @memberjunction/ai-groq@2.112.0
- @memberjunction/ai-lmstudio@2.112.0
- @memberjunction/ai-local-embeddings@2.112.0
- @memberjunction/ai-mistral@2.112.0
- @memberjunction/ai-ollama@2.112.0
- @memberjunction/ai-openai@2.112.0
- @memberjunction/ai-openrouter@2.112.0
- @memberjunction/ai-xai@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai-anthropic@2.110.1
- @memberjunction/ai-cerebras@2.110.1
- @memberjunction/ai-groq@2.110.1
- @memberjunction/ai-lmstudio@2.110.1
- @memberjunction/ai-local-embeddings@2.110.1
- @memberjunction/ai-mistral@2.110.1
- @memberjunction/ai-ollama@2.110.1
- @memberjunction/ai-openai@2.110.1
- @memberjunction/ai-openrouter@2.110.1
- @memberjunction/ai-xai@2.110.1

## 2.110.0

### Patch Changes

- @memberjunction/ai-anthropic@2.110.0
- @memberjunction/ai-cerebras@2.110.0
- @memberjunction/ai-groq@2.110.0
- @memberjunction/ai-lmstudio@2.110.0
- @memberjunction/ai-local-embeddings@2.110.0
- @memberjunction/ai-mistral@2.110.0
- @memberjunction/ai-ollama@2.110.0
- @memberjunction/ai-openai@2.110.0
- @memberjunction/ai-openrouter@2.110.0
- @memberjunction/ai-xai@2.110.0

## 2.109.0

### Patch Changes

- @memberjunction/ai-anthropic@2.109.0
- @memberjunction/ai-cerebras@2.109.0
- @memberjunction/ai-groq@2.109.0
- @memberjunction/ai-lmstudio@2.109.0
- @memberjunction/ai-local-embeddings@2.109.0
- @memberjunction/ai-mistral@2.109.0
- @memberjunction/ai-ollama@2.109.0
- @memberjunction/ai-openai@2.109.0
- @memberjunction/ai-openrouter@2.109.0
- @memberjunction/ai-xai@2.109.0

## 2.108.0

### Patch Changes

- @memberjunction/ai-anthropic@2.108.0
- @memberjunction/ai-cerebras@2.108.0
- @memberjunction/ai-groq@2.108.0
- @memberjunction/ai-lmstudio@2.108.0
- @memberjunction/ai-local-embeddings@2.108.0
- @memberjunction/ai-mistral@2.108.0
- @memberjunction/ai-ollama@2.108.0
- @memberjunction/ai-openai@2.108.0
- @memberjunction/ai-openrouter@2.108.0
- @memberjunction/ai-xai@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai-anthropic@2.107.0
- @memberjunction/ai-cerebras@2.107.0
- @memberjunction/ai-groq@2.107.0
- @memberjunction/ai-lmstudio@2.107.0
- @memberjunction/ai-local-embeddings@2.107.0
- @memberjunction/ai-mistral@2.107.0
- @memberjunction/ai-ollama@2.107.0
- @memberjunction/ai-openai@2.107.0
- @memberjunction/ai-openrouter@2.107.0
- @memberjunction/ai-xai@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai-anthropic@2.106.0
- @memberjunction/ai-cerebras@2.106.0
- @memberjunction/ai-groq@2.106.0
- @memberjunction/ai-lmstudio@2.106.0
- @memberjunction/ai-local-embeddings@2.106.0
- @memberjunction/ai-mistral@2.106.0
- @memberjunction/ai-ollama@2.106.0
- @memberjunction/ai-openai@2.106.0
- @memberjunction/ai-openrouter@2.106.0
- @memberjunction/ai-xai@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.
  - @memberjunction/ai-anthropic@2.105.0
  - @memberjunction/ai-cerebras@2.105.0
  - @memberjunction/ai-groq@2.105.0
  - @memberjunction/ai-lmstudio@2.105.0
  - @memberjunction/ai-local-embeddings@2.105.0
  - @memberjunction/ai-mistral@2.105.0
  - @memberjunction/ai-ollama@2.105.0
  - @memberjunction/ai-openai@2.105.0
  - @memberjunction/ai-openrouter@2.105.0
  - @memberjunction/ai-xai@2.105.0
