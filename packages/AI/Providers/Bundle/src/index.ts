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
import { LoadOpenAILLM, LoadOpenAIEmbedding, LoadOpenAIImageGenerator } from '@memberjunction/ai-openai';
import { LoadAnthropicLLM } from '@memberjunction/ai-anthropic';
import { LoadAzureLLM, LoadAzureEmbedding } from '@memberjunction/ai-azure';
import { LoadBedrockLLM, LoadBedrockEmbedding } from '@memberjunction/ai-bedrock';
import { LoadBettyBotLLM } from '@memberjunction/ai-betty-bot';
import { LoadCerebrasLLM } from '@memberjunction/ai-cerebras';
import { LoadElevenLabsAudioGenerator } from '@memberjunction/ai-elevenlabs';
import { LoadGeminiLLM, LoadGeminiImageGenerator } from '@memberjunction/ai-gemini';
import { LoadGroqLLM } from '@memberjunction/ai-groq';
import { LoadHeyGenVideoGenerator } from '@memberjunction/ai-heygen';
import { LoadLMStudioLLM } from '@memberjunction/ai-lmstudio';
import { LoadLocalEmbedding } from '@memberjunction/ai-local-embeddings';
import { LoadMistralLLM, LoadMistralEmbedding } from '@memberjunction/ai-mistral';
import { LoadOllamaLLM, LoadOllamaEmbedding } from '@memberjunction/ai-ollama';
import { LoadOpenRouterLLM } from '@memberjunction/ai-openrouter';
import { LoadRexRecommendationsProvider } from '@memberjunction/ai-recommendations-rex';
import { LoadPineconeVectorDB } from '@memberjunction/ai-vectors-pinecone';
import { LoadVertexLLM } from '@memberjunction/ai-vertex';
import { LoadxAILLM } from '@memberjunction/ai-xai';
import { LoadFLUXImageGenerator } from '@memberjunction/ai-blackforestlabs';

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
    // LLM Providers
    LoadOpenAILLM();
    LoadAnthropicLLM();
    LoadAzureLLM();
    LoadBedrockLLM();
    LoadBettyBotLLM();
    LoadCerebrasLLM();
    LoadGeminiLLM();
    LoadGroqLLM();
    LoadLMStudioLLM();
    LoadMistralLLM();
    LoadOllamaLLM();
    LoadOpenRouterLLM();
    LoadVertexLLM();
    LoadxAILLM();

    // Embedding Providers
    LoadOpenAIEmbedding();
    LoadAzureEmbedding();
    LoadBedrockEmbedding();
    LoadLocalEmbedding();
    LoadMistralEmbedding();
    LoadOllamaEmbedding();
    // Note: LoadVertexEmbedding() removed - deprecated SDK, will be re-added when @google/genai supports embeddings

    // Audio/Video Providers
    LoadElevenLabsAudioGenerator();
    LoadHeyGenVideoGenerator();

    // Image Generation Providers
    LoadOpenAIImageGenerator();
    LoadGeminiImageGenerator();
    LoadFLUXImageGenerator();

    // Specialized Providers
    LoadRexRecommendationsProvider();
    LoadPineconeVectorDB();
}
