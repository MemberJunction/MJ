/** Output of `AISkill.ImportMarkdown`. */
export interface AISkillImportMarkdownOutput {
    /** The created/updated `MJ: AI Skills` ID. */
    skillID: string;
    /** The skill's Name, for UI confirmation messaging. */
    skillName: string;
    /** Action/sub-agent names from the SKILL.md that couldn't be resolved in this instance — non-fatal. */
    warnings: string[];
}
