/**
 * AI Provider Bundle
 *
 * This package loads all standard MemberJunction AI providers to prevent tree shaking
 * in production builds. By importing this bundle, consuming applications ensure that
 * all provider classes are registered and available at runtime.
 *
 * Architecture Note:
 * This bundle package separates provider-specific loading logic from the core AI Engine
 * architecture, maintaining clean separation of concerns between lower-level infrastructure
 * (Core, Engine, EngineBase) and provider implementations.
 */

// Import all AI provider loaders
import { LoadOpenAILLM } from '@memberjunction/ai-openai';
import { LoadAnthropicLLM } from '@memberjunction/ai-anthropic';
import { LoadGroqLLM } from '@memberjunction/ai-groq';
import { LoadCerebrasLLM } from '@memberjunction/ai-cerebras';
import { LoadMistralLLM } from '@memberjunction/ai-mistral';
import { LoadLMStudioLLM } from '@memberjunction/ai-lmstudio';
import { LoadOpenRouterLLM } from '@memberjunction/ai-openrouter';
import { LoadOllamaLLM } from '@memberjunction/ai-ollama';
import { LoadxAILLM } from '@memberjunction/ai-xai';
import { LoadLocalEmbedding } from '@memberjunction/ai-local-embeddings';

/**
 * Loads all standard AI providers to prevent tree shaking.
 * Call this function early in your application startup (e.g., in index.ts or main server file)
 * to ensure all AI providers are available throughout the application lifecycle.
 *
 * @example
 * ```typescript
 * // In your application's entry point
 * import { LoadAIProviders } from '@memberjunction/ai-provider-bundle';
 *
 * // Load all providers at startup
 * LoadAIProviders();
 * ```
 */
export function LoadAIProviders(): void {
    LoadOpenAILLM();
    LoadAnthropicLLM();
    LoadGroqLLM();
    LoadCerebrasLLM();
    LoadMistralLLM();
    LoadLMStudioLLM();
    LoadOpenRouterLLM();
    LoadOllamaLLM();
    LoadxAILLM();
    LoadLocalEmbedding();
}
