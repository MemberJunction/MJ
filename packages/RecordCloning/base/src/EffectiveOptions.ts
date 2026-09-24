/**
 * @file EffectiveOptions.ts
 * Resolves the options a clone plan actually runs with from the root entity's clone
 * configuration and the caller's request.
 *
 * - The entity's `Configuration.Clone` supplies every default.
 * - `UserEditable` decides how much of that a request may change (plan §4.1, §9.4):
 *   `'none'` / `'fields'` keep the configured scope; `'scope'` lets a request change the
 *   toggles and lower the caps; `'all'` (the default) also lets it raise the caps.
 * - Firing Entity Actions or AI Actions needs the `Clone Records: Fire Hooks` authorization;
 *   without it hooks stay suppressed.
 *
 * Every ignored request value produces a warning, so the review shows what was not applied.
 *
 * @see plans/record-cloning/README.md §4.1, §9.4
 */

import type { CloneRequestOptions, ClonePlan, CloneWarning } from './types';

/** The subset of `IEntityCloneConfiguration` this resolver reads. */
export interface EffectiveOptionsConfig {
    MaxDepth?: number;
    MaxRecords?: number;
    Subtypes?: 'include' | 'exclude';
    Hierarchy?: 'subtree' | 'node';
    SoftLinks?: 'skip' | 'include';
    Embeddings?: 'copy' | 'regenerate';
    UserEditable?: 'none' | 'fields' | 'scope' | 'all';
    Hooks?: { EntityActions?: 'suppress' | 'fire'; AIActions?: 'suppress' | 'fire' };
}

export type EffectiveCloneOptions = ClonePlan['EffectiveOptions'];

/** Built-in defaults when neither the entity nor the request says otherwise. */
export const DEFAULT_CLONE_MAX_DEPTH = 3;
export const DEFAULT_CLONE_MAX_RECORDS = 500;

export interface EffectiveOptionsResult {
    Options: EffectiveCloneOptions;
    Warnings: CloneWarning[];
}

/**
 * Merges the request's options onto the entity's configured defaults under the rules above.
 * @param config The root entity's clone configuration, or null when it has none.
 * @param request The options the caller sent.
 * @param canFireHooks Whether the caller holds `Clone Records: Fire Hooks`.
 */
export function ResolveEffectiveCloneOptions(
    config: EffectiveOptionsConfig | null | undefined,
    request: CloneRequestOptions | null | undefined,
    canFireHooks: boolean
): EffectiveOptionsResult {
    const warnings: CloneWarning[] = [];
    const editable = config?.UserEditable ?? 'all';
    const mayChangeScope = editable === 'scope' || editable === 'all';
    const mayRaiseCaps = editable === 'all';

    const ignored = (option: string, value: unknown, why: string): void => {
        warnings.push({
            Code: 'OPTION_OVERRIDE_IGNORED',
            Severity: 'Warning',
            Field: option,
            Message: `${option} = ${String(value)} was ignored: ${why}.`,
        });
    };

    const choose = <T>(option: string, requested: T | undefined, configured: T): T => {
        if (requested === undefined || requested === configured) return configured;
        if (mayChangeScope) return requested;
        ignored(option, requested, `this entity's clone configuration sets UserEditable to '${editable}'`);
        return configured;
    };

    const cap = (option: 'MaxDepth' | 'MaxRecords', requested: number | undefined, configured: number): number => {
        if (requested === undefined || !Number.isFinite(requested) || requested === configured) return configured;
        if (requested < configured) {
            if (mayChangeScope) return Math.max(1, Math.floor(requested));
            ignored(option, requested, `this entity's clone configuration sets UserEditable to '${editable}'`);
            return configured;
        }
        if (mayRaiseCaps) return Math.floor(requested);
        ignored(option, requested, `raising it above the configured ${configured} needs UserEditable 'all'`);
        return configured;
    };

    const hook = (option: 'EntityActions' | 'AIActions', requested: 'suppress' | 'fire' | undefined, configured: 'suppress' | 'fire'): 'suppress' | 'fire' => {
        const wanted = requested ?? configured;
        if (wanted !== 'fire' || canFireHooks) return wanted;
        warnings.push({
            Code: 'HOOKS_FORBIDDEN',
            Severity: 'Warning',
            Field: option,
            Message: `${option} stay suppressed: firing them needs the 'Clone Records: Fire Hooks' authorization.`,
        });
        return 'suppress';
    };

    const options: EffectiveCloneOptions = {
        MaxDepth: cap('MaxDepth', request?.MaxDepth, config?.MaxDepth ?? DEFAULT_CLONE_MAX_DEPTH),
        MaxRecords: cap('MaxRecords', request?.MaxRecords, config?.MaxRecords ?? DEFAULT_CLONE_MAX_RECORDS),
        Subtypes: choose('Subtypes', request?.Subtypes, config?.Subtypes ?? 'include'),
        Hierarchy: choose('Hierarchy', request?.Hierarchy, config?.Hierarchy ?? 'subtree'),
        SoftLinks: choose('SoftLinks', request?.SoftLinks, config?.SoftLinks ?? 'skip'),
        Embeddings: choose('Embeddings', request?.Embeddings, config?.Embeddings ?? 'copy'),
        EntityActions: hook('EntityActions', request?.EntityActions, config?.Hooks?.EntityActions ?? 'suppress'),
        AIActions: hook('AIActions', request?.AIActions, config?.Hooks?.AIActions ?? 'suppress'),
    };

    return { Options: options, Warnings: warnings };
}

/** A preset in the documented `Clone.Presets` array shape. */
export interface NormalizedClonePreset {
    Key: string;
    Label: string;
    Description?: string;
    Options?: CloneRequestOptions;
    Relationships?: Record<string, { Policy: 'Deep' | 'Reference' | 'Skip' }>;
}

/**
 * Reads `Clone.Presets` defensively. The documented shape is an array of `{ Key, Label, ... }`;
 * the legacy keyed-object form (`{ "<key>": { Description, Relationships } }`) is still accepted,
 * with the object key as `Key`. Anything else yields no presets rather than an exception.
 */
export function NormalizeClonePresets(presets: unknown): NormalizedClonePreset[] {
    const toPreset = (raw: unknown, fallbackKey?: string): NormalizedClonePreset | null => {
        if (!raw || typeof raw !== 'object') return null;
        const p = raw as Record<string, unknown>;
        const key = typeof p.Key === 'string' && p.Key ? p.Key : typeof p.Name === 'string' && p.Name ? p.Name : fallbackKey;
        if (!key) return null;
        return {
            Key: key,
            Label: typeof p.Label === 'string' && p.Label ? p.Label : key,
            Description: typeof p.Description === 'string' ? p.Description : undefined,
            Options: p.Options && typeof p.Options === 'object' ? (p.Options as CloneRequestOptions) : undefined,
            Relationships: p.Relationships && typeof p.Relationships === 'object'
                ? (p.Relationships as NormalizedClonePreset['Relationships'])
                : undefined,
        };
    };
    if (Array.isArray(presets)) {
        return presets.map((p) => toPreset(p)).filter((p): p is NormalizedClonePreset => p !== null);
    }
    if (presets && typeof presets === 'object') {
        return Object.entries(presets as Record<string, unknown>)
            .map(([key, p]) => toPreset(p, key))
            .filter((p): p is NormalizedClonePreset => p !== null);
    }
    return [];
}
