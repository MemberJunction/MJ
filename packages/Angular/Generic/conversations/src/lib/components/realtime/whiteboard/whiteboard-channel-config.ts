/**
 * @fileoverview Parsing of the Whiteboard channel's per-channel configuration.
 *
 * The configuration is JSON an operator typed into the config cascade (`channels.config.Whiteboard`),
 * so nothing about its shape can be trusted. Each member is read independently and anything that is not valid
 * falls back to its default, reporting what was wrong so a typo is visible rather than silently ignored.
 *
 * ```json
 * { "realtime": { "channels": { "config": { "Whiteboard": { "widgetAccess": "inspect-only", "persistWidgetState": false } } } } }
 * ```
 *
 * @module @memberjunction/ng-conversations
 */

import type { JSONObject } from '@memberjunction/ai';
import { IsPlainObject } from '@memberjunction/global';
import type { WhiteboardWidgetAccess } from '@memberjunction/ng-whiteboard';

/** The Whiteboard channel's resolved configuration (typed fields PascalCase; JSON keys camelCase). */
export interface WhiteboardChannelConfig {
    /**
     * How far the agent may reach into live HTML widgets this session (JSON key `widgetAccess`):
     * `'full'` (inspect, operate, call), `'inspect-only'` or `'off'`. It can only LOWER what the channel
     * declares (`RealtimeWhiteboardChannel.MaxWidgetAccess`); a refused call returns `access_denied`.
     */
    WidgetAccess: WhiteboardWidgetAccess;
    /**
     * Whether widget runtime state (answers, progress) is saved with the session so it survives a resume
     * (JSON key `persistWidgetState`). `false` keeps it in memory only: it still survives scrolling and page
     * switches, but not a resumed session.
     */
    PersistWidgetState: boolean;
}

/** The configuration used when nothing (or nothing valid) was configured. */
export const DEFAULT_WHITEBOARD_CHANNEL_CONFIG: Readonly<WhiteboardChannelConfig> = {
    WidgetAccess: 'full',
    PersistWidgetState: true,
};

/** The outcome of {@link ParseWhiteboardChannelConfig}. */
export interface ParsedWhiteboardChannelConfig {
    /** The resolved configuration: defaults for anything absent or invalid. */
    Config: WhiteboardChannelConfig;
    /** One sentence per member that was present but invalid (empty when the configuration was clean). */
    Problems: string[];
}

const WIDGET_ACCESS_VALUES: readonly WhiteboardWidgetAccess[] = ['full', 'inspect-only', 'off'];

/** Reads a widget-access level, recording a problem when the value is present but not one of the levels. */
function readWidgetAccess(raw: JSONObject, key: string, fallback: WhiteboardWidgetAccess, problems: string[]): WhiteboardWidgetAccess {
    const value = raw[key];
    if (value === undefined) {
        return fallback;
    }
    const match = WIDGET_ACCESS_VALUES.find(level => level === value);
    if (match) {
        return match;
    }
    problems.push(`"${key}" must be one of ${WIDGET_ACCESS_VALUES.map(v => `"${v}"`).join(', ')}; using "${fallback}".`);
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
 * Resolves the Whiteboard channel's configuration from the JSON the cascade supplied. Unknown keys are ignored.
 *
 * @param raw The channel's resolved `config` bag (`RealtimeChannelContext.ChannelConfig`), or nothing.
 */
export function ParseWhiteboardChannelConfig(raw: Readonly<JSONObject> | undefined | null): ParsedWhiteboardChannelConfig {
    const defaults = DEFAULT_WHITEBOARD_CHANNEL_CONFIG;
    if (!IsPlainObject(raw)) {
        return { Config: { ...defaults }, Problems: [] };
    }
    const bag = raw as JSONObject;
    const problems: string[] = [];
    const config: WhiteboardChannelConfig = {
        WidgetAccess: readWidgetAccess(bag, 'widgetAccess', defaults.WidgetAccess, problems),
        PersistWidgetState: readBoolean(bag, 'persistWidgetState', defaults.PersistWidgetState, problems),
    };
    return { Config: config, Problems: problems };
}
