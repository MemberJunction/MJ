/**
 * @fileoverview The package-side mirror of `Application.AgentSettings` and a tolerant parser for it.
 *
 * `Application.AgentSettings` is a JSONType column: its shape is authored in
 * `metadata/entities/JSONType-interfaces/IAgentSettings.ts` and CodeGen copies that text into the
 * entity layer as the typed `AgentSettingsObject` accessor. That copy is regenerated only when a
 * CodeGen pass runs, so a field added to the interface is invisible to code that reads the
 * generated accessor until then.
 *
 * Runtime code therefore reads the **raw column** through {@link ParseAgentSettings} and this
 * mirror instead — the new field works the moment the code that reads it ships, and a routine
 * `mj sync push` + `mj codegen` later refreshes the generated copy without anything depending on it.
 *
 * **Lockstep contract.** {@link IAgentSettings} is the metadata interface, field for field. Edit
 * both in the same commit; a reviewer should be able to diff the two bodies and see no difference.
 *
 * @module @memberjunction/ai-core-plus
 */

import { IsPlainObject } from '@memberjunction/global';

/**
 * App-scoped agent configuration, stored as JSON in the `AgentSettings` column of `MJ: Applications`.
 * Every field is optional — an app opts into exactly what it needs.
 */
export interface IAgentSettings {
    /** The app's default/lead agent (conversational default AND realtime lead identity). Agent ID. */
    DefaultAgentID?: string | null;

    /**
     * Agents relevant to this app — the static allowed-target set for the co-agent.
     * Union-accumulated at runtime with agent-type defaults and dynamic (channel) registrations.
     */
    RelevantAgents?: Array<{
        /** Agent ID (loop or flow — transparent to the co-agent). */
        AgentID: string;
        /** Optional friendly label for the capability manifest / disclosure ("Skip", "Query Builder"). */
        Label?: string | null;
        /** Per-target disclosure override; falls back to the effective default disclosure. */
        Disclosure?: 'silent' | 'mention' | 'hand-voice' | null;
        /** If true, surfaced in pickers / proactively offered; if false, available but not advertised. */
        Advertised?: boolean | null;
    }>;

    /**
     * App-scoped static client tools, by tool-definition reference.
     * Surfaced to every agent acting in this app and resolved by the unified client-tool resolver.
     */
    ClientTools?: Array<{
        /** References MJ: AI Client Tool Definitions by ID (preferred) or Name. */
        ClientToolDefinitionID?: string | null;
        Name?: string | null;
        /** Optional app-level priority for first-match-wins resolution. */
        Priority?: number | null;
    }>;

    /**
     * Realtime co-agent overrides that layer into the config cascade above the agent's own
     * TypeConfiguration (and below runtime overrides). Only keys set here override; unset keys
     * fall through to the agent / type defaults.
     */
    Realtime?: {
        /** Default delegation disclosure for this app's co-agent. */
        Disclosure?: 'silent' | 'mention' | 'hand-voice' | null;
        /** Persona override folded into the session system prompt at mint. */
        Persona?: {
            Tone?: string | null;
            SpeakingStyle?: string | null;
        } | null;
        /** Model preference override (AI Models Name or ID). */
        ModelPreference?: string | null;
        /**
         * Which interactive realtime channels (Whiteboard, Remote Browser, an Open App's own widget, …)
         * this app's sessions get. Layers into the same per-channel scoping cascade as the agent's own
         * `realtime.channels` configuration (see `@memberjunction/ai-core-plus` `ResolveRealtimeChannelScope`):
         * a layer's `Include` turns a channel on (the only way to get an `opt-in` channel), its `Exclude`
         * turns one off, and the MOST SPECIFIC layer to mention a channel wins; within one layer `Exclude`
         * beats `Include`. A channel's registry row `IsActive = false` remains a master kill switch that
         * nothing here can override. Channel keys match the channel's name, case-insensitively.
         */
        Channels?: {
            /** Channel keys to turn ON (required for `opt-in` channels; a no-op for `all-sessions` ones). */
            Include?: string[] | null;
            /** Channel keys to turn OFF. Beats `Include` within the same layer. */
            Exclude?: string[] | null;
            /** Per-channel opaque configuration, keyed by channel key; delivered to the channel at session start. */
            Config?: { [channelKey: string]: { [key: string]: unknown } } | null;
            /** Per-channel display override, keyed by channel key. */
            DisplayPolicy?: { [channelKey: string]: 'open-on-start' | 'on-demand' | 'headless' } | null;
        } | null;
    } | null;
}

/**
 * Tolerantly parses the raw `AgentSettings` column.
 *
 * Returns `null` — never throws — for an absent, blank, malformed or non-object payload, because an
 * app with no usable settings is simply an app with no app layer. Members of the right *container*
 * type are passed through untouched (this is a typed view of stored JSON, not a validator): the
 * consumers that interpret a member (`NormalizeRealtimeChannelsConfig`, the client-tool resolver)
 * each re-validate what they read, so a hand-edited column degrades per-field instead of per-app.
 *
 * Arrays-valued members that arrive as a different type are dropped rather than coerced, so
 * `settings.ClientTools` is always either absent or an array.
 *
 * @param json The raw column value (a JSON string), or `null`/`undefined`.
 * @returns The parsed settings, or `null` when there are none.
 */
export function ParseAgentSettings(json: string | null | undefined): IAgentSettings | null {
    if (typeof json !== 'string' || json.trim().length === 0) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (!IsPlainObject(parsed)) {
        return null;
    }
    const settings: IAgentSettings = { ...(parsed as IAgentSettings) };
    if (settings.RelevantAgents !== undefined && !Array.isArray(settings.RelevantAgents)) {
        delete settings.RelevantAgents;
    }
    if (settings.ClientTools !== undefined && !Array.isArray(settings.ClientTools)) {
        delete settings.ClientTools;
    }
    if (settings.Realtime !== undefined && settings.Realtime !== null && !IsPlainObject(settings.Realtime)) {
        delete settings.Realtime;
    }
    return settings;
}
