import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError, LogStatus } from '@memberjunction/global';

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });

/**
 * Configuration schema for external API integrations used by Core Actions
 */
const apiIntegrationsSchema = z.object({
  /**
   * Perplexity AI API Key for AI-powered web search
   * Used by: Perplexity Search action
   * Get your API key from: https://www.perplexity.ai/settings/api
   */
  perplexityApiKey: z.string().optional(),

  /**
   * Gamma API Key for presentation generation
   * Used by: Gamma Generate Presentation action
   * Get your API key from: https://gamma.app/settings (requires Pro or higher account)
   * API keys follow format: sk-gamma-xxxxxxxx
   */
  gammaApiKey: z.string().optional(),

  /**
   * Google services configuration (nested structure)
   * Follows MJStorage pattern for better organization and scalability
   */
  google: z
    .object({
      /**
       * Google Custom Search configuration
       * Used by: Google Custom Search action
       * Get your API key from: https://developers.google.com/custom-search/v1/overview
       * Get your CX from: https://programmablesearchengine.google.com/
       */
      customSearch: z
        .object({
          /**
           * Google Custom Search API key
           */
          apiKey: z.string().optional(),
          /**
           * Google Custom Search engine identifier (CX)
           */
          cx: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Complete configuration schema for Core Actions package
 */
const coreActionsConfigSchema = z.object({
  /**
   * API integrations configuration for external services
   */
  apiIntegrations: apiIntegrationsSchema.optional().default({}),
});

export type CoreActionsConfig = z.infer<typeof coreActionsConfigSchema>;
export type ApiIntegrationsConfig = z.infer<typeof apiIntegrationsSchema>;

let _config: CoreActionsConfig | null = null;

/**
 * Gets the Core Actions configuration, loading it from mj.config.cjs if not already loaded
 * @returns The Core Actions configuration object
 */
export function getCoreActionsConfig(): CoreActionsConfig {
  if (_config) {
    return _config;
  }

  try {
    const result = explorer.search();
    if (!result || result.isEmpty) {
      LogStatus('No mj.config.cjs found, using default Core Actions configuration');
      _config = coreActionsConfigSchema.parse({});
      return _config;
    }

    // Extract only the fields relevant to Core Actions
    const rawConfig = {
      apiIntegrations: {
        perplexityApiKey: result.config?.perplexityApiKey || process.env.PERPLEXITY_API_KEY,
        gammaApiKey: result.config?.gammaApiKey || process.env.GAMMA_API_KEY,
        google: {
          customSearch: {
            apiKey:
              result.config?.google?.customSearch?.apiKey ||
              result.config?.googleCustomSearchApiKey || // Backwards compatibility
              process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
            cx:
              result.config?.google?.customSearch?.cx ||
              result.config?.googleCustomSearchCx || // Backwards compatibility
              process.env.GOOGLE_CUSTOM_SEARCH_CX,
          },
        },
      },
    };

    _config = coreActionsConfigSchema.parse(rawConfig);
    return _config;
  } catch (error) {
    LogError('Error loading Core Actions configuration', undefined, error);
    throw error;
  }
}

/**
 * Gets the API integrations configuration
 * @returns The API integrations configuration object
 */
export function getApiIntegrationsConfig(): ApiIntegrationsConfig {
  const config = getCoreActionsConfig();
  return config.apiIntegrations;
}

/**
 * Clears the cached configuration (useful for testing)
 */
export function clearCoreActionsConfig(): void {
  _config = null;
}
