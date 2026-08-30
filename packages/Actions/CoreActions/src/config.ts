import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError, LogStatus } from '@memberjunction/core';

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });

/**
 * Configuration schema for external API integrations used by Core Actions
 */
const apiIntegrationsSchema = z.object({
  /**
   * Perplexity AI API Key for AI-powered web search
   * Used by: Perplexity Search action
   * Get your API key from: https://www.perplexity.ai/settings/api
   *
   * This is the recommended web-search credential for new deployments — a single key with no
   * engine ID, and open to new customers. See `google.customSearch` below for why.
   */
  perplexityApiKey: z.string().optional(),

  /**
   * Tavily API Key for search built for LLM consumption
   * Used by: Tavily Search action
   * Get your API key from: https://app.tavily.com (keys are prefixed `tvly-`)
   */
  tavilyApiKey: z.string().optional(),

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
  google: z.object({
    /**
     * Google Custom Search configuration
     * Used by: Google Custom Search action
     * Get your API key from: https://developers.google.com/custom-search/v1/overview
     * Get your CX from: https://programmablesearchengine.google.com/
     *
     * NOTE: the Custom Search JSON API is CLOSED TO NEW CUSTOMERS. Projects that already have it
     * enabled are served until 2027-01-01, when the API is discontinued. New deployments should
     * configure `perplexityApiKey` above instead — Google's stated successor (Vertex AI Search)
     * searches your own indexed content rather than the public web and yields neither an API key
     * nor a CX, so it is not a drop-in for this action.
     */
    customSearch: z.object({
      /**
       * Google Custom Search API key
       */
      apiKey: z.string().optional(),
      /**
       * Google Custom Search engine identifier (CX)
       */
      cx: z.string().optional(),
    }).optional(),

    /**
     * Google Geocoding and Address Validation configuration
     * Used by: Postal Code Lookup, Geocode Address, Reverse Geocode, Validate Address actions
     * Get your API key from: https://console.cloud.google.com/apis/credentials
     * Enable: Geocoding API and Address Validation API
     */
    geocoding: z.object({
      /**
       * Google Maps/Geocoding API key
       */
      apiKey: z.string().optional(),
    }).optional(),
  }).optional(),
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
      LogStatus('No mj.config.cjs found; reading Core Actions API keys from the environment only');
    }

    // Extract only the fields relevant to Core Actions.
    //
    // This runs whether or not a config file was found. Every key below documents
    // an environment-variable fallback, and until this was hoisted out of the
    // no-config early return, a deployment that set only environment variables
    // silently got an empty config and every action reported its key as missing.
    const fileConfig = result?.config;
    const rawConfig = {
      apiIntegrations: {
        perplexityApiKey: fileConfig?.perplexityApiKey || process.env.PERPLEXITY_API_KEY,
        tavilyApiKey: fileConfig?.tavilyApiKey || process.env.TAVILY_API_KEY,
        gammaApiKey: fileConfig?.gammaApiKey || process.env.GAMMA_API_KEY,
        google: {
          customSearch: {
            apiKey: fileConfig?.google?.customSearch?.apiKey ||
                    fileConfig?.googleCustomSearchApiKey ||  // Backwards compatibility
                    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
            cx: fileConfig?.google?.customSearch?.cx ||
                fileConfig?.googleCustomSearchCx ||  // Backwards compatibility
                process.env.GOOGLE_CUSTOM_SEARCH_CX,
          },
          geocoding: {
            apiKey: fileConfig?.google?.geocoding?.apiKey ||
                    process.env.GOOGLE_GEOCODING_API_KEY ||
                    process.env.GOOGLE_MAPS_API_KEY,
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