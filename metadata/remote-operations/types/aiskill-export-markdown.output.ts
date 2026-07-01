/** Output of `AISkill.ExportMarkdown`. */
export interface AISkillExportMarkdownOutput {
    /** The portable SKILL.md document text. */
    markdown: string;
    /** The skill's Name, for the client to use as a suggested filename (e.g. `${name}.SKILL.md`). */
    suggestedFileName: string;
}
