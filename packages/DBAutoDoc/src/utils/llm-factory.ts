/**
 * LLM Factory - Shared utility for creating LLM instances
 *
 * Centralizes the provider-to-driver class mapping to avoid duplication
 * across PromptEngine and LLMSanityChecker.
 */

import { BaseLLM } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

/**
 * Provider name to LLM driver class name mapping
 */
const PROVIDER_TO_DRIVER_CLASS: Record<string, string> = {
  'gemini': 'GeminiLLM',
  'openai': 'OpenAILLM',
  'anthropic': 'AnthropicLLM',
  'groq': 'GroqLLM',
  'mistral': 'MistralLLM',
  'vertex': 'VertexLLM',
  'azure': 'AzureLLM',
  'cerebras': 'CerebrasLLM',
  'openrouter': 'OpenRouterLLM',
  'xai': 'xAILLM',
  'bedrock': 'BedrockLLM'
};

/**
 * Create an LLM instance from a provider name
 *
 * @param provider - Provider name (e.g., 'vertex', 'openai', 'anthropic')
 * @param apiKey - API key or credentials JSON string
 * @returns BaseLLM instance
 * @throws Error if provider is unknown or instance creation fails
 */
export function createLLMInstance(provider: string, apiKey: string): BaseLLM {
  const driverClass = PROVIDER_TO_DRIVER_CLASS[provider.toLowerCase()];

  if (!driverClass) {
    const supportedProviders = Object.keys(PROVIDER_TO_DRIVER_CLASS).join(', ');
    throw new Error(
      `Unknown provider: ${provider}. Supported providers: ${supportedProviders}`
    );
  }

  const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
    BaseLLM,
    driverClass,
    apiKey
  );

  if (!llm) {
    throw new Error(
      `Failed to create LLM instance for provider: ${provider} (driver class: ${driverClass}). Check that the provider is installed.`
    );
  }

  return llm;
}

/**
 * Get the driver class name for a provider
 *
 * @param provider - Provider name
 * @returns Driver class name or undefined if not found
 */
export function getDriverClassName(provider: string): string | undefined {
  return PROVIDER_TO_DRIVER_CLASS[provider.toLowerCase()];
}

/**
 * Get list of supported provider names
 */
export function getSupportedProviders(): string[] {
  return Object.keys(PROVIDER_TO_DRIVER_CLASS);
}
