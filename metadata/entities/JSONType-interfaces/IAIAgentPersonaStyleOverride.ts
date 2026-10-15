/**
 * Agent-specific presentation style overrides for an assigned AI Persona.
 *
 * Stored as JSON in `MJ: AI Agent Personas.StyleOverride`. CodeGen emits a typed
 * `StyleOverrideObject` accessor on `MJAIAgentPersonaEntity` returning `IAIAgentPersonaStyleOverride | null`.
 *
 * Allows an agent to fine-tune a catalog persona (e.g. "Aria, but more formal and authoritative")
 * without minting an entirely separate persona record.
 */
export interface IAIAgentPersonaStyleOverride {
    /** Optional override for the persona's core Tone. */
    Tone?: string;

    /** Optional override for the persona's SpeakingStyle. */
    SpeakingStyle?: string;

    /**
     * Optional override for the persona's Visual: how the agent's video shows in the call. A member set here wins over
     * the persona's.
     */
    Visual?: {
        /** How much of the avatar the tile frames. */
        Framing?: 'head' | 'shoulders' | 'waist';
        /** The accent of the ring that frames the tile while the agent speaks: a design-token name, never a color value. */
        AccentToken?: string;
    };

    /** Open extension point for additional descriptor overrides. */
    [key: string]: unknown;
}
