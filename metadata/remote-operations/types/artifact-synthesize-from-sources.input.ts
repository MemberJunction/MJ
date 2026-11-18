/** Input payload for `Artifact.SynthesizeFromSources`. */
export interface SynthesizeArtifactFromSourcesInput {
    /** Output artifact format (`'presentation'`, `'document'`, `'spreadsheet'`). */
    TargetKind: 'presentation' | 'document' | 'spreadsheet' | (string & {});
    /** Synthesis prompt / goal describing how sources should be combined. */
    Goal: string;
    /** Explicit source artifact IDs to read (`CanRead` required on each). */
    SourceArtifactIds?: string[];
    /** Optional collection to save the synthesized artifact into (`CanEdit` required). */
    CollectionId?: string | null;
    /** Optional title override for the newly created artifact. */
    Title?: string | null;
    /** Optional `@handle` of an active MJ AI Agent to author the synthesis. */
    AgentHandle?: string | null;
    /** When true (default), preserves live `Artifact` chart/range embeds from Spreadsheet sources. */
    LinkChartsAndRanges?: boolean;
}
