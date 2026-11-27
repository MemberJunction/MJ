import type { MJAIAgentEntity } from '@memberjunction/core-entities';

/**
 * Strongly-typed instantiation mode derived directly from the generated `MJAIAgentEntity`
 * column union (`'None' | 'Optional' | 'Required'`). Always derive from the entity rather
 * than re-declaring the literal union by hand.
 */
export type AgentInstantiationMode = MJAIAgentEntity['InstantiationMode'];

/**
 * Maximum prototype-inheritance depth allowed along the `AIAgent.BaseAgentID` chain
 * (5 hops covers Platform -> Enterprise -> Division -> Department -> Team -> User).
 */
export const MAX_AGENT_INHERITANCE_DEPTH = 5;

/**
 * Recursive JSON value types used for strictly-typed configuration merging
 * (avoids `any` / `unknown` in JSON bag helpers).
 */
export type AgentConfigJsonPrimitive = string | number | boolean | null;
export type AgentConfigJsonValue = AgentConfigJsonPrimitive | AgentConfigJsonObject | AgentConfigJsonValue[];
export interface AgentConfigJsonObject {
    [key: string]: AgentConfigJsonValue;
}

/**
 * Named communication-style preset displayed in agent-instantiation UX and onboarding prompts.
 */
export interface IAgentPersonalityPreset {
    label: string;
    tone: string;
    speakingStyle: string;
    description?: string;
}

/**
 * Optional UX hints authored under `AIAgent.TypeConfiguration.instantiation` on agents
 * with `InstantiationMode` of `'Optional'` or `'Required'`.
 */
export interface IAgentInstantiationConfig {
    suggestedNames?: string[];
    suggestedIcons?: string[];
    suggestedPersonaNames?: string[];
    maxInstancesPerUser?: number;
    onboardingGreeting?: string;
    personalityPresets?: IAgentPersonalityPreset[];
}

function isJsonObject(value: AgentConfigJsonValue | undefined): value is AgentConfigJsonObject {
    return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(raw: string | null | undefined): AgentConfigJsonObject | null {
    if (!raw || raw.trim().length === 0) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as AgentConfigJsonValue;
        return isJsonObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function toStringArray(value: AgentConfigJsonValue | undefined): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const items = value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map(item => item.trim());
    return items.length > 0 ? items : undefined;
}

function toPersonalityPresets(value: AgentConfigJsonValue | undefined): IAgentPersonalityPreset[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const presets: IAgentPersonalityPreset[] = [];
    for (const item of value) {
        if (!isJsonObject(item)) {
            continue;
        }
        const label = typeof item['label'] === 'string' ? item['label'].trim() : '';
        const tone = typeof item['tone'] === 'string' ? item['tone'].trim() : '';
        const speakingStyle = typeof item['speakingStyle'] === 'string' ? item['speakingStyle'].trim() : '';
        const description = typeof item['description'] === 'string' ? item['description'].trim() : undefined;
        if (label.length > 0 && (tone.length > 0 || speakingStyle.length > 0)) {
            presets.push({
                label,
                tone,
                speakingStyle,
                ...(description ? { description } : {}),
            });
        }
    }
    return presets.length > 0 ? presets : undefined;
}

/**
 * Parses `TypeConfiguration.instantiation` from an agent's raw `TypeConfiguration` JSON string.
 * Returns `null` when absent, malformed, or not an object.
 */
export function ParseAgentInstantiationConfig(
    typeConfigJson: string | null | undefined
): IAgentInstantiationConfig | null {
    const root = parseJsonObject(typeConfigJson);
    if (!root) {
        return null;
    }
    const rawInstantiation = root['instantiation'];
    if (!isJsonObject(rawInstantiation)) {
        return null;
    }

    const result: IAgentInstantiationConfig = {};
    const suggestedNames = toStringArray(rawInstantiation['suggestedNames']);
    if (suggestedNames) {
        result.suggestedNames = suggestedNames;
    }

    const suggestedIcons = toStringArray(rawInstantiation['suggestedIcons']);
    if (suggestedIcons) {
        result.suggestedIcons = suggestedIcons;
    }

    const suggestedPersonaNames = toStringArray(rawInstantiation['suggestedPersonaNames']);
    if (suggestedPersonaNames) {
        result.suggestedPersonaNames = suggestedPersonaNames;
    }

    const rawMax = rawInstantiation['maxInstancesPerUser'];
    if (typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax > 0) {
        result.maxInstancesPerUser = Math.floor(rawMax);
    }

    const rawGreeting = rawInstantiation['onboardingGreeting'];
    if (typeof rawGreeting === 'string' && rawGreeting.trim().length > 0) {
        result.onboardingGreeting = rawGreeting.trim();
    }

    const personalityPresets = toPersonalityPresets(rawInstantiation['personalityPresets']);
    if (personalityPresets) {
        result.personalityPresets = personalityPresets;
    }

    return result;
}

/**
 * Deep-merges two JSON objects (child overrides parent per key; nested plain objects merge recursively;
 * arrays and primitives replace cleanly). Neither input is mutated.
 */
export function DeepMergeAgentConfigObjects(
    base: AgentConfigJsonObject,
    override: AgentConfigJsonObject
): AgentConfigJsonObject {
    const merged: AgentConfigJsonObject = {};
    for (const key of Object.keys(base)) {
        merged[key] = base[key];
    }
    for (const key of Object.keys(override)) {
        const baseVal = merged[key];
        const overVal = override[key];
        if (isJsonObject(baseVal) && isJsonObject(overVal)) {
            merged[key] = DeepMergeAgentConfigObjects(baseVal, overVal);
        } else {
            merged[key] = overVal;
        }
    }
    return merged;
}

/**
 * Strongly-typed entry inside `AIAgent.Configuration.helperPlugins` (or `TypeConfiguration.helperPlugins`)
 * configuring a per-agent pluggable `BaseAgent*Helper` seam override (Extension Point #3).
 */
export interface AgentHelperPluginEntry {
    /** Canonical seam key (e.g. `'messaging'`, `'payload'`, `'compaction'`, `'prompt'`, `'actions'`). */
    seam: string;
    /** Registered `@RegisterClass(BaseAgent<Seam>Helper, driverClass)` key. */
    driverClass: string;
    /** Optional precedence weight when merging multiple plugin lists (higher wins). */
    priority?: number;
}

/**
 * Lowercased helper seam names that are strictly **code-only** — metadata overrides via
 * `helperPlugins` are rejected both at entity save time (`ValidateAgentInheritanceAndSandbox`)
 * and at runtime (`AgentHelperCache.ResetForRun` / `ResolveAgentHelper`).
 */
export const FORBIDDEN_METADATA_HELPER_SEAMS: ReadonlySet<string> = new Set<string>([
    'limits',
    'actionpolicy',
    'policy',
    'permissions',
    'permission',
]);

/**
 * Returns `true` when `seam` identifies a code-only security/limits/policy seam that cannot
 * be replaced via agent metadata `helperPlugins`.
 */
export function IsForbiddenMetadataHelperSeam(seam: string | null | undefined): boolean {
    if (typeof seam !== 'string') {
        return false;
    }
    const normalized = seam.trim().toLowerCase().replace(/[-_\s]/g, '');
    return FORBIDDEN_METADATA_HELPER_SEAMS.has(normalized);
}

/**
 * Tolerantly parses `helperPlugins` from an agent configuration JSON string (`Configuration` or
 * `TypeConfiguration`). Returns an empty array when absent, malformed, or not an array.
 */
export function ParseAgentHelperPlugins(configJson: string | null | undefined): AgentHelperPluginEntry[] {
    const root = parseJsonObject(configJson);
    if (!root) {
        return [];
    }
    const rawPlugins = root['helperPlugins'];
    if (!Array.isArray(rawPlugins)) {
        return [];
    }
    const parsed: AgentHelperPluginEntry[] = [];
    for (const item of rawPlugins) {
        if (!isJsonObject(item)) {
            continue;
        }
        const seam = typeof item['seam'] === 'string' ? item['seam'].trim() : '';
        const driverClass = typeof item['driverClass'] === 'string' ? item['driverClass'].trim() : '';
        if (!seam || !driverClass) {
            continue;
        }
        const rawPriority = item['priority'];
        const entry: AgentHelperPluginEntry = { seam, driverClass };
        if (typeof rawPriority === 'number' && Number.isFinite(rawPriority)) {
            entry.priority = rawPriority;
        }
        parsed.push(entry);
    }
    return parsed;
}

/**
 * Parses a raw JSON object string (such as `TypeConfiguration` or `AgentTypePromptParams`).
 * Returns `null` when empty, invalid JSON, or not a plain object.
 */
export function ParseAgentConfigJsonObject(
    raw: string | null | undefined
): AgentConfigJsonObject | null {
    return parseJsonObject(raw);
}
