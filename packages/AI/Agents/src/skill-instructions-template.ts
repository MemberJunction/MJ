/**
 * Opt-in marker for AI Skill instructions that are a Nunjucks template.
 *
 * When a skill's `Instructions` start with this marker, the agent renders them with the run's data
 * when the skill activates. Without it the text is used exactly as stored, so a skill that mentions
 * `{{ }}` literally (for example the `{{query:"Category/Name"}}` composition syntax) is never parsed.
 *
 * The marker is a Nunjucks comment, so it renders to nothing.
 */
export const SKILL_INSTRUCTIONS_TEMPLATE_MARKER = '{# mj:template #}';

/**
 * True when skill instructions opt in to template rendering: the text, ignoring leading whitespace,
 * starts with {@link SKILL_INSTRUCTIONS_TEMPLATE_MARKER}.
 *
 * @param instructions the skill's stored `Instructions` (null/undefined is treated as plain text)
 */
export function IsTemplatedSkillInstructions(instructions: string | null | undefined): boolean {
    return !!instructions && instructions.trimStart().startsWith(SKILL_INSTRUCTIONS_TEMPLATE_MARKER);
}
