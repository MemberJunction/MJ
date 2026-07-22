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
 * Disclosure values ('silent' | 'mention' | 'hand-voice') mirror the AgentDisclosurePolicy
 * union declared in @memberjunction/ai-core-plus. Keep the two in lockstep.
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
    } | null;
}
