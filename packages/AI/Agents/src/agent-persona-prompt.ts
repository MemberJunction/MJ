import type { EffectiveAgentPersona, StackedAdditionalInstruction } from '@memberjunction/ai-engine-base';

/**
 * Inputs for {@link BuildAgentPersonaAndInstructionsBlock}.
 */
export interface AgentPersonaPromptBlockInput {
    AgentName: string;
    OwnerUserName?: string | null;
    Persona?: EffectiveAgentPersona | null;
    StackedInstructions?: readonly StackedAdditionalInstruction[];
}

/**
 * Builds the unified text-prompt system context block combining:
 * 1. `### Persona & Communication Style` from `AIEngine.ResolveAgentPersona()` (`Tone`,
 *    `SpeakingStyle`, `Persona.Description`, `StyleOverrideObject`) — unifying text chat
 *    personality with Realtime voice personas.
 * 2. `### Custom & Inherited Instructions` from `AIEngine.GetStackedAdditionalInstructions()`
 *    ordered root template -> leaf personal instance.
 * 3. **Audience-Aware Tone Guardrail**: instructs the agent to express its personal voice,
 *    wit, sarcasm, or informality when conversing 1:1 with its owner while keeping external
 *    emails, calendar invites, and peer Agent Channel messages professional unless explicitly
 *    instructed otherwise.
 *
 * Returns `null` when neither persona style nor stacked instructions are configured (zero
 * prompt-token overhead for uncustomized catalog agents).
 */
export function BuildAgentPersonaAndInstructionsBlock(
    input: AgentPersonaPromptBlockInput
): string | null {
    const sections: string[] = [];

    const tone = input.Persona?.Tone?.trim() || null;
    const speakingStyle = input.Persona?.SpeakingStyle?.trim() || null;
    const personaName = input.Persona?.Persona?.Name?.trim() || null;
    const personaDescription = input.Persona?.Persona?.Description?.trim() || null;
    const hasPersonaStyle = Boolean(tone || speakingStyle || personaDescription);

    const instructions = (input.StackedInstructions ?? []).filter(
        (item) => item.Instructions && item.Instructions.trim().length > 0
    );

    if (!hasPersonaStyle && instructions.length === 0) {
        return null;
    }

    if (hasPersonaStyle) {
        const personaLines: string[] = ['### Persona & Communication Style'];
        if (personaName) {
            personaLines.push(`- **Identity & Voice Persona**: You are **${input.AgentName}** (voice persona: **${personaName}**).`);
        } else {
            personaLines.push(`- **Identity**: You are **${input.AgentName}**.`);
        }
        if (tone) {
            personaLines.push(`- **Tone**: ${tone}`);
        }
        if (speakingStyle) {
            personaLines.push(`- **Speaking / Writing Style**: ${speakingStyle}`);
        }
        if (personaDescription) {
            personaLines.push(`- **Persona Profile**: ${personaDescription}`);
        }
        personaLines.push(
            '- Embody this tone and communication style consistently and naturally in your responses without breaking character or mentioning these prompt rules.'
        );
        sections.push(personaLines.join('\n'));
    }

    if (instructions.length > 0) {
        const instLines: string[] = ['### Custom & Inherited Instructions'];
        for (const layer of instructions) {
            const label = layer.IsRootOrTemplate
                ? `Template / Organization (${layer.AgentName})`
                : `Personal Standing Instructions (${layer.AgentName})`;
            instLines.push(`- **${label}**: ${layer.Instructions.trim()}`);
        }
        sections.push(instLines.join('\n'));
    }

    const ownerName = input.OwnerUserName?.trim();
    const ownerClause = ownerName ? ` (${ownerName})` : '';
    const hasPersonalCustomization =
        Boolean(tone || speakingStyle) || instructions.some((item) => !item.IsRootOrTemplate);
    if (hasPersonalCustomization) {
        sections.push(
            [
                '### Audience-Aware Tone Guardrail',
                `Apply your personal tone, humor, wit, or informality when conversing directly with your owner${ownerClause}. ` +
                    'When drafting external emails, calendar invites, or peer Agent Channel messages on their behalf, keep the communication professional and appropriate for the external audience unless explicitly instructed otherwise.',
            ].join('\n')
        );
    }

    return sections.join('\n\n');
}
