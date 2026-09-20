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
   * Serves two distinct products behind one key, selected by the action's `Mode` parameter:
   * `search` (default) calls Perplexity's raw `/search` endpoint, which returns structured
   * title/url/snippet results at a flat per-query price; `answer` calls the Sonar chat models,
   * which return prose plus citations and are billed per token.
   *
   * For a web-search role prefer `braveApiKey` below — an independent index with lower latency.
   * Use this when a synthesised answer is genuinely what the caller wants.
   */
  perplexityApiKey: z.string().optional(),

  /**
   * Brave Search API Key for independent web search
   * Used by: Brave Search action
   * Get your API key from: https://api-dashboard.search.brave.com/
   *
   * This is the recommended web-search credential for new deployments. Brave serves from its
   * own index rather than reselling Google's or Bing's, so it does not share a failure mode
   * with the SERP-proxy vendors or with `google.customSearch` below. It returns the same
   * title/url/snippet shape the Google action returns, which is what makes it a migration
   * rather than a rewrite.
   *
   * NOTE: Brave retired its free tier in early 2026. Keys now meter against a stored card
   * with no spending cap, so set a budget alert before pointing production traffic at it.
   */
  braveApiKey: z.string().optional(),

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
     * configure `braveApiKey` above instead — it is the only credential here that yields the same
     * title/url/snippet result shape from an index that is not Google's.
     *
     * Google's stated successor (Vertex AI Search, since renamed Agent Search) searches your own
     * indexed content or up to 50 verified domains rather than the public web, and yields neither
     * an API key nor a CX. Gemini's `google_search` grounding does reach the public index, but
     * returns expiring redirect URLs with no snippets, and its terms forbid caching or analysing
     * the results — so neither is a drop-in for this action. `perplexityApiKey` is a reasonable
     * fallback, but note its default mode is an answer engine rather than a search index.
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
        braveApiKey: fileConfig?.braveApiKey || process.env.BRAVE_SEARCH_API_KEY,
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