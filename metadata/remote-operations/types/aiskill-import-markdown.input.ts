/** Input for `AISkill.ImportMarkdown`. */
export interface AISkillImportMarkdownInput {
    /** The SKILL.md document text to import. */
    markdownText: string;
    /**
     * When provided, updates this existing skill (and resyncs its Action/sub-agent bundling)
     * instead of creating a new one. Caller must confirm the current user may edit it.
     */
    updateSkillID?: string;
}
