/**
 * Prompt execution helpers with model/vendor override support
 */

import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { UserInfo } from '@memberjunction/core';
import { AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { QueryGenConfig } from '../cli/config';

/**
 * Execute a prompt with optional model/vendor overrides from QueryGenConfig
 *
 * Uses AIPromptParams.override parameter to apply runtime model/vendor overrides.
 * If config specifies modelOverride or vendorOverride, looks up their IDs from
 * the AIEngine cache and passes them to the prompt execution.
 *
 * @param prompt - The AI prompt to execute (from AIEngine.Instance.Prompts)
 * @param data - Data to pass to the prompt template
 * @param contextUser - User context for server-side operations
 * @param config - QueryGen configuration (for model/vendor overrides)
 * @returns Promise resolving to the prompt result
 */
export async function executePromptWithOverrides<T>(
  prompt: AIPromptEntityExtended,
  data: Record<string, unknown>,
  contextUser: UserInfo,
  config: QueryGenConfig
): Promise<{ success: boolean; result?: T; errorMessage?: string }> {
  const promptParams = new AIPromptParams();
  promptParams.prompt = prompt;
  promptParams.data = data;
  promptParams.contextUser = contextUser;
  promptParams.skipValidation = false;

  // Apply model/vendor overrides using built-in AIPromptParams.override
  if (config.modelOverride || config.vendorOverride) {
    const overrideIds = resolveModelVendorOverrides(config);
    if (overrideIds.modelId || overrideIds.vendorId) {
      promptParams.override = overrideIds;
    }
  }

  const runner = new AIPromptRunner();
  return await runner.ExecutePrompt<T>(promptParams);
}

/**
 * Resolve model/vendor names to IDs for AIPromptParams.override
 *
 * Looks up model and vendor by name in the AIEngine cache (already loaded).
 *
 * @param config - QueryGen configuration with modelOverride/vendorOverride names
 * @returns Object with modelId and/or vendorId, or empty object if none found
 */
function resolveModelVendorOverrides(
  config: QueryGenConfig
): { modelId?: string; vendorId?: string } {
  const result: { modelId?: string; vendorId?: string } = {};

  // Look up model ID from AIEngine cache if modelOverride is set
  if (config.modelOverride) {
    const model = AIEngine.Instance.Models.find(m => m.Name === config.modelOverride);
    if (model && model.ID) {
      result.modelId = model.ID;
    }
  }

  // Look up vendor ID from AIEngine cache if vendorOverride is set
  if (config.vendorOverride) {
    const vendor = AIEngine.Instance.Vendors.find(v => v.Name === config.vendorOverride);
    if (vendor && vendor.ID) {
      result.vendorId = vendor.ID;
    }
  }

  return result;
}
