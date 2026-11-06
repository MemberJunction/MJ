/**
 * App-scoped agent configuration.
 *
 * Stored as a JSON object in the `AgentSettings` column of the `Applications` entity.
 * CodeGen emits a strongly-typed `AgentSettingsObject` accessor on `ApplicationEntity`
 * that returns `IAgentSettings | null`.
 *
 * Read by the conversations default-agent resolver (for the app's default/lead agent)
 * and by the realtime co-agent cascade (relevant agents, app-scoped client tools, and
 * realtime persona/disclosure overrides). Every field is optional — an app opts into
 * exactly what it needs.
 *
 * Disclosure values ('silent' | 'mention' | 'hand-voice') mirror the RealtimeDisclosurePolicy
 * union declared in @memberjunction/ai-agents.
 *
 * **Lockstep contract**: this interface is mirrored, field for field, by `IAgentSettings` in
 * `packages/AI/CorePlus/src/agent-settings.ts` (`@memberjunction/ai-core-plus`). Runtime code parses
 * the column with that mirror (`ParseAgentSettings`) rather than the CodeGen-generated
 * `AgentSettingsObject` accessor, so a field added here is usable at runtime before CodeGen next
 * regenerates the inline copy. Edit both in the same commit.
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
            /**
             * Exposure levels that need a zero-data-retention model. When the session model's configuration
             * does not declare `Privacy.ZeroDataRetention: true`, exposure is lowered to below the lowest level
             * listed, and the agent is told why. Applies to every channel in the session.
             */
            RequireZeroDataRetentionFor?: Array<'state' | 'pixels'> | null;
        } | null;
    } | null;
}
