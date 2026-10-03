/**
 * @fileoverview Parsing of the Interactive Component channel's per-channel configuration.
 *
 * The configuration is JSON an operator typed into the config cascade (`channels.config.InteractiveComponent`),
 * so nothing about its shape can be trusted. Each member is read independently and anything that is not valid
 * falls back to its default, reporting what was wrong so a typo is visible rather than silently ignored.
 *
 * @module @memberjunction/ng-conversations
 */

import type { JSONObject } from '@memberjunction/ai';
import { IsPlainObject } from '@memberjunction/global';
import { DEFAULT_INTERACTIVE_COMPONENT_CONFIG, MAX_INSTANCES_CEILING, type InteractiveComponentConfig } from './interactive-component-types';

/** The outcome of {@link ParseInteractiveComponentConfig}. */
export interface ParsedInteractiveComponentConfig {
    /** The resolved configuration: defaults for anything absent or invalid. */
    Config: InteractiveComponentConfig;
    /** One sentence per member that was present but invalid (empty when the configuration was clean). */
    Problems: string[];
}

/** Reads an integer in `[min, max]`, recording a problem when the value is present but unusable. */
function readBoundedInteger(
    raw: JSONObject,
    key: string,
    fallback: number,
    min: number,
    max: number,
    problems: string[]
): number {
    const value = raw[key];
    if (value === undefined) {
        return fallback;
    }
    if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) {
        return value;
    }
    problems.push(`"${key}" must be a whole number from ${min} to ${max}; using ${fallback}.`);
    return fallback;
}

/** Reads a boolean, recording a problem when the value is present but not one. */
function readBoolean(raw: JSONObject, key: string, fallback: boolean, problems: string[]): boolean {
    const value = raw[key];
    if (value === undefined) {
        return fallback;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    problems.push(`"${key}" must be true or false; using ${fallback}.`);
    return fallback;
}

/**
 * Resolves the channel's configuration from the JSON the cascade supplied.
 *
 * @param raw The channel's resolved `config` bag (`RealtimeChannelContext.ChannelConfig`), or nothing.
 */
export function ParseInteractiveComponentConfig(raw: Readonly<JSONObject> | undefined | null): ParsedInteractiveComponentConfig {
    const defaults = DEFAULT_INTERACTIVE_COMPONENT_CONFIG;
    if (!IsPlainObject(raw)) {
        return { Config: { ...defaults }, Problems: [] };
    }
    const bag = raw as JSONObject;
    const problems: string[] = [];
    const config: InteractiveComponentConfig = {
        AutoOpenDelegatedComponents: readBoolean(bag, 'autoOpenDelegatedComponents', defaults.AutoOpenDelegatedComponents, problems),
        SwapToNewerVersions: readBoolean(bag, 'swapToNewerVersions', defaults.SwapToNewerVersions, problems),
        MaxInstances: readBoundedInteger(bag, 'maxInstances', defaults.MaxInstances, 1, MAX_INSTANCES_CEILING, problems),
        MaxStateRows: readBoundedInteger(bag, 'maxStateRows', defaults.MaxStateRows, 1, 500, problems),
        MaxStateChars: readBoundedInteger(bag, 'maxStateChars', defaults.MaxStateChars, 500, 50000, problems),
    };
    return { Config: config, Problems: problems };
}
