import { AIEngine } from '@memberjunction/aiengine';
import { GroupByUUID, UUIDsEqual } from '@memberjunction/global';
import type { MJAIPromptModelEntity } from '@memberjunction/core-entities';

/**
 * Predicts the primary model ID that `BaseModelRunner` will pick for a given
 * prompt and optional AI configuration.
 *
 * Applies the same configuration-chain -> null-configuration fallback rule as
 * `BaseModelRunner.getPromptModelsForConfiguration` over
 * `AIEngine.Instance.PromptModels`:
 * 1. Keep only rows matching `promptId` with `Status === 'Active'` or `'Preview'`.
 * 2. When `configurationId` is provided, walk `AIEngine.Instance.GetConfigurationChain(configurationId)`
 *    (child -> parent -> ...) and pick the first configuration with matching rows.
 * 3. If no chain configuration matches (or `configurationId` is omitted), fall back
 *    to rows with a null/empty `ConfigurationID`.
 * 4. Return the `ModelID` of the highest-`Priority` matching row, or `null` if none exist.
 *
 * ponytail: This helper predicts only the first candidate from `AIPromptModels`
 * (it does not replicate strategy-based pool selection when no `AIPromptModels`
 * rows exist, nor runtime failover to a secondary model). Runtime failover to a
 * non-video model is still covered by `stripUnsupportedMediaBlocks` in
 * `AIPromptRunner`. Once VS-UX-3 lands a public `PreviewModelSelection(prompt, configurationId?)`
 * method on `BaseModelRunner` (Wave 7), UX-3 should switch this call to delegate directly to it.
 */
export function ResolvePromptPrimaryModelId(
    promptId: string,
    configurationId?: string,
): string | null {
    const trimmedPromptId = promptId?.trim();
    if (!trimmedPromptId) {
        return null;
    }

    const promptModels = selectPromptModelsForConfiguration(trimmedPromptId, configurationId);
    if (promptModels.length === 0) {
        return null;
    }

    const sorted = [...promptModels].sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));
    return sorted[0]?.ModelID ?? null;
}

function selectPromptModelsForConfiguration(
    promptId: string,
    configurationId?: string,
): MJAIPromptModelEntity[] {
    const eligibleForPrompt = AIEngine.Instance.PromptModels.filter(
        (pm) => UUIDsEqual(pm.PromptID, promptId) && isEligiblePromptModelStatus(pm.Status),
    );
    const byConfiguration = GroupByUUID(eligibleForPrompt, (pm) => pm.ConfigurationID);

    const trimmedConfigId = configurationId?.trim();
    if (trimmedConfigId) {
        const chain = AIEngine.Instance.GetConfigurationChain(trimmedConfigId);
        for (const config of chain) {
            const matches = byConfiguration.Get(config.ID);
            if (matches && matches.length > 0) {
                return matches;
            }
        }
    }

    return byConfiguration.Get(null) ?? [];
}

function isEligiblePromptModelStatus(status: string | null | undefined): boolean {
    return status === 'Active' || status === 'Preview';
}
