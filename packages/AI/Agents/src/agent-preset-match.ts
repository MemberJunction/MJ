import type { MJAIAgentConfigurationEntity } from '@memberjunction/core-entities';

/**
 * Minimal shape required by {@link MatchAgentConfigurationPreset} so callers can pass either full
 * {@link MJAIAgentConfigurationEntity} instances or lightweight preset descriptors in tests and
 * pure mappers.
 */
export type AgentConfigurationPresetCandidate = Pick<
    MJAIAgentConfigurationEntity,
    'Name' | 'DisplayName'
> & {
    Status?: MJAIAgentConfigurationEntity['Status'] | string | null;
};

/**
 * Matches a preset by `Name` (preferred) or `DisplayName` (fallback), trimmed and
 * case-insensitively, skipping any preset whose `Status` is explicitly not `'Active'`.
 *
 * Shared by sub-agent preset resolution in {@link BaseAgent} and the `Produce Video` action's
 * `PowerLevel` lookup.
 */
export function MatchAgentConfigurationPreset<T extends AgentConfigurationPresetCandidate>(
    presets: readonly T[],
    name: string | null | undefined,
): T | undefined {
    const target = name?.trim().toLowerCase();
    if (!target) {
        return undefined;
    }

    const active = presets.filter(
        (p) => p != null && (p.Status == null || p.Status === 'Active'),
    );

    const byName = active.find((p) => p.Name?.trim().toLowerCase() === target);
    if (byName) {
        return byName;
    }

    return active.find((p) => p.DisplayName?.trim().toLowerCase() === target);
}
