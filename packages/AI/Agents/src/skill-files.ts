/**
 * @fileoverview Progressive disclosure for multi-file skills. When a skill that has
 * `MJ: AI Skill Files` activates, its files are NOT injected: the activation message lists their
 * paths and the run gains the `Read Skill File` action, so the agent reads a file only when it
 * needs it (the MJ counterpart of an Anthropic skill's "read references/x.md" step).
 *
 * @module @memberjunction/ai-agents
 */

/** Name of the action that returns one skill file's content (CoreActions `ReadSkillFileAction`). */
export const READ_SKILL_FILE_ACTION_NAME = 'Read Skill File';

/** A skill file as listed on activation: which skill, and its path. Content is fetched on demand. */
export interface SkillFileRef {
    SkillID: string;
    Path: string;
}

/**
 * The section appended to the skill-activation message for skills that have files. Empty string when
 * none of the activated skills has a file, so a skill without files reads exactly as before.
 */
export function FormatSkillFileListing(skills: ReadonlyArray<{ ID: string; Name: string }>, files: readonly SkillFileRef[]): string {
    const sections: string[] = [];
    for (const skill of skills) {
        const paths = files.filter(f => f.SkillID.toUpperCase() === skill.ID.toUpperCase()).map(f => `- ${f.Path}`);
        if (paths.length > 0) {
            sections.push(`### Files of skill "${skill.Name}"\n${paths.join('\n')}`);
        }
    }
    if (sections.length === 0) {
        return '';
    }
    return `\n\n## Skill files\n\nThese skills have additional files. They are NOT loaded yet. When the instructions ` +
        `refer to one, or you need it, call the "${READ_SKILL_FILE_ACTION_NAME}" action with Skill (the skill name) ` +
        `and Path (exactly as listed):\n\n${sections.join('\n\n')}`;
}
