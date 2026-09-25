/**
 * @file EffectiveOptions.ts
 * Resolves the options a clone plan actually runs with from the root entity's clone
 * configuration and the caller's request.
 *
 * - The entity's `Configuration.Clone` supplies every default.
 * - **Narrowing** scope (lower caps; excluding subtypes, soft links or the hierarchy subtree) is
 *   allowed when `UserEditable` is `'scope'` or `'all'` (the default), or for an override holder.
 * - **Widening** scope (higher caps; including what the configuration leaves out) needs the
 *   `Clone Records: Override Scope` authorization, whatever `UserEditable` says.
 * - Entity Actions fire by default and AI Actions are suppressed; the configuration's `Hooks`
 *   changes either. Changing that from a request, in either direction, needs
 *   `Clone Records: Fire Hooks`: suppressing automations is as consequential as firing them.
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

/** What the caller is authorized to do beyond the entity's configuration. */
export interface CloneOptionGrants {
    /** Holds `Clone Records: Fire Hooks`: may change whether Entity Actions / AI Actions run. */
    CanFireHooks: boolean;
    /** Holds `Clone Records: Override Scope`. */
    CanOverrideScope: boolean;
}

/** Built-in defaults when neither the entity nor the request says otherwise. */
export const DEFAULT_CLONE_MAX_DEPTH = 3;
export const DEFAULT_CLONE_MAX_RECORDS = 500;
/** Entity Actions on the cloned rows run, as they would for any create. */
export const DEFAULT_CLONE_ENTITY_ACTIONS: 'suppress' | 'fire' = 'fire';
/** AI Actions stay off unless configured: each can be a paid model call per cloned row. */
export const DEFAULT_CLONE_AI_ACTIONS: 'suppress' | 'fire' = 'suppress';

export interface EffectiveOptionsResult {
    Options: EffectiveCloneOptions;
    Warnings: CloneWarning[];
    /** Options changed beyond the configuration under an authorization (Override Scope, Fire Hooks); recorded on the clone log. */
    Overrides: string[];
}

/**
 * Merges the request's options onto the entity's configured defaults under the rules above.
 * @param config The root entity's clone configuration, or null when it has none.
 * @param request The options the caller sent.
 * @param grants What the caller is authorized to do beyond the configuration.
 */
export function ResolveEffectiveCloneOptions(
    config: EffectiveOptionsConfig | null | undefined,
    request: CloneRequestOptions | null | undefined,
    grants: CloneOptionGrants
): EffectiveOptionsResult {
    const warnings: CloneWarning[] = [];
    const overrides: string[] = [];
    const editable = config?.UserEditable ?? 'all';
    const mayNarrow = editable === 'scope' || editable === 'all' || grants.CanOverrideScope;

    const narrowIgnored = (option: string, value: unknown): void => {
        warnings.push({
            Code: 'OPTION_OVERRIDE_IGNORED',
            Severity: 'Warning',
            Field: option,
            Message: `${option} = ${String(value)} was ignored: this entity's clone configuration sets UserEditable to '${editable}'.`,
        });
    };
    const widenIgnored = (option: string, value: unknown, configured: unknown): void => {
        warnings.push({
            Code: 'SCOPE_OVERRIDE_FORBIDDEN',
            Severity: 'Warning',
            Field: option,
            Message: `${option} = ${String(value)} was ignored: going beyond the configured ${String(configured)} needs the 'Clone Records: Override Scope' authorization.`,
        });
    };

    /** A two-valued scope switch where `wide` copies more than the other value. */
    const scope = <T extends string>(option: string, requested: T | undefined, configured: T, wide: T): T => {
        if (requested === undefined || requested === configured) return configured;
        if (requested === wide) {
            if (grants.CanOverrideScope) {
                overrides.push(option);
                return requested;
            }
            widenIgnored(option, requested, configured);
            return configured;
        }
        if (mayNarrow) return requested;
        narrowIgnored(option, requested);
        return configured;
    };

    const cap = (option: 'MaxDepth' | 'MaxRecords', requested: number | undefined, configured: number): number => {
        if (requested === undefined || !Number.isFinite(requested) || Math.floor(requested) === configured) return configured;
        const value = Math.max(1, Math.floor(requested));
        if (value > configured) {
            if (grants.CanOverrideScope) {
                overrides.push(option);
                return value;
            }
            widenIgnored(option, requested, configured);
            return configured;
        }
        if (mayNarrow) return value;
        narrowIgnored(option, requested);
        return configured;
    };

    /** A choice that is neither wider nor narrower, governed by UserEditable alone. */
    const choice = <T>(option: string, requested: T | undefined, configured: T): T => {
        if (requested === undefined || requested === configured) return configured;
        if (mayNarrow) return requested;
        narrowIgnored(option, requested);
        return configured;
    };

    const hook = (option: 'EntityActions' | 'AIActions', requested: 'suppress' | 'fire' | undefined, configured: 'suppress' | 'fire'): 'suppress' | 'fire' => {
        if (requested === undefined || requested === configured) return configured;
        if (grants.CanFireHooks) {
            overrides.push(option);
            return requested;
        }
        warnings.push({
            Code: 'HOOKS_FORBIDDEN',
            Severity: 'Warning',
            Field: option,
            Message: `${option} = ${requested} was ignored: changing whether they run needs the 'Clone Records: Fire Hooks' authorization. They ${configured === 'fire' ? 'run' : 'stay suppressed'} as configured.`,
        });
        return configured;
    };

    const options: EffectiveCloneOptions = {
        MaxDepth: cap('MaxDepth', request?.MaxDepth, config?.MaxDepth ?? DEFAULT_CLONE_MAX_DEPTH),
        MaxRecords: cap('MaxRecords', request?.MaxRecords, config?.MaxRecords ?? DEFAULT_CLONE_MAX_RECORDS),
        Subtypes: scope('Subtypes', request?.Subtypes, config?.Subtypes ?? 'include', 'include'),
        Hierarchy: scope('Hierarchy', request?.Hierarchy, config?.Hierarchy ?? 'subtree', 'subtree'),
        SoftLinks: scope('SoftLinks', request?.SoftLinks, config?.SoftLinks ?? 'skip', 'include'),
        Embeddings: choice('Embeddings', request?.Embeddings, config?.Embeddings ?? 'copy'),
        EntityActions: hook('EntityActions', request?.EntityActions, config?.Hooks?.EntityActions ?? DEFAULT_CLONE_ENTITY_ACTIONS),
        AIActions: hook('AIActions', request?.AIActions, config?.Hooks?.AIActions ?? DEFAULT_CLONE_AI_ACTIONS),
    };

    return { Options: options, Warnings: warnings, Overrides: overrides };
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
