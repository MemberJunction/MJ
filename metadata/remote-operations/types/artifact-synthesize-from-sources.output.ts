/** Output payload returned on successful execution of `Artifact.SynthesizeFromSources`. */
export interface SynthesizeArtifactFromSourcesOutput {
    /** Created `MJ: Artifacts` ID. */
    ArtifactID: string;
    /** Created initial `MJ: Artifact Versions` ID (`v1`). */
    VersionID: string;
    /** Version number created (`1`). */
    VersionNumber: number;
    /** Final resolved artifact title. */
    Title: string;
    /** Resolved `MJ: Artifact Types` name (`Presentation`, `Markdown Document`, or `Excel Spreadsheet`). */
    ArtifactTypeName: string;
    /** Count of verified live chart/range embeds included in the synthesized artifact. */
    LinkedChartCount: number;
    /** Number of source artifacts combined. */
    SourceCount: number;
    /** Non-fatal synthesis/sanitization warnings. */
    Warnings: string[];
    /** True when deterministic fallback synthesis was used instead of a structured LLM response. */
    UsedFallback: boolean;
    /** `MJ: AIAgentRuns` ID when authored via a named agent handle. */
    AgentRunID?: string | null;
    /** Agent name when authored via a named agent handle. */
    AgentName?: string | null;
}
