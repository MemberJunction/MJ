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

    /** Open extension point for additional descriptor overrides. */
    [key: string]: unknown;
}
