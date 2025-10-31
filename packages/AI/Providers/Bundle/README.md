# @memberjunction/ai-provider-bundle

AI Provider Bundle for MemberJunction - automatically loads all standard AI providers to prevent tree shaking in production builds.

## Purpose

This package solves a critical issue in production builds where aggressive tree shaking can remove AI provider classes that are registered dynamically at runtime. By explicitly importing and loading all standard providers, this bundle ensures they remain available throughout the application lifecycle.

## Architecture

This bundle package maintains clean separation of concerns by keeping provider-specific loading logic separate from the core AI Engine infrastructure. Lower-level packages like `@memberjunction/ai`, `@memberjunction/aiengine`, and `@memberjunction/ai-engine-base` remain focused on core functionality without coupling to specific provider implementations.

## Usage

Call `LoadAIProviders()` early in your application startup:

```typescript
import { LoadAIProviders } from '@memberjunction/ai-provider-bundle';

// In your application's entry point (index.ts, server.ts, etc.)
LoadAIProviders();
```

## Included Providers

This bundle loads the following AI providers:

- **OpenAI** - GPT models and embeddings
- **Anthropic** - Claude models
- **Groq** - High-performance inference
- **Cerebras** - Fast inference models
- **Mistral** - Open-source LLMs
- **LMStudio** - Local model hosting
- **OpenRouter** - Multi-provider routing
- **Ollama** - Local model management
- **xAI** - Grok models
- **LocalEmbeddings** - Local embedding generation

## When to Use

Use this package in any MemberJunction application that:

1. Uses production builds with optimization/tree shaking enabled
2. Dynamically selects AI providers at runtime based on configuration
3. Needs all standard providers available without explicit imports

## When Not to Use

If your application only uses a specific subset of providers, you can manually import and load only those providers instead of using this bundle to reduce bundle size.

## See Also

- [@memberjunction/aiengine](../Engine/README.md) - Core AI Engine functionality
- [@memberjunction/ai](../../Core/README.md) - Base AI types and interfaces
