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
   */
  perplexityApiKey: z.string().optional(),
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
        perplexityApiKey: result.config.perplexityApiKey || process.env.PERPLEXITY_API_KEY,
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