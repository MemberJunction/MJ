import { BaseRemotableOperation } from '@memberjunction/core';
import type { ArtifactSynthesisTargetKind } from '../ArtifactSynthesisEngine';

/**
 * Stable operation key for synthesizing a governed Library artifact (`Presentation`,
 * `Markdown Document`, or `Excel Spreadsheet`) from one or more authorized source artifacts.
 */
export const ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY = 'Artifact.SynthesizeFromSources';

/**
 * Input payload for {@link SynthesizeArtifactFromSourcesOperation}.
 */
export interface SynthesizeArtifactFromSourcesInput {
    /** Output artifact format (`'presentation'`, `'document'`, `'spreadsheet'`). */
    TargetKind: ArtifactSynthesisTargetKind | string;
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

/**
 * Output payload returned on successful execution of {@link SynthesizeArtifactFromSourcesOperation}.
 */
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

/**
 * Typed, client-safe Remote Operation contract for Multi-Artifact Synthesis (`Artifact.SynthesizeFromSources`).
 *
 * Routed via `GraphQLDataProvider` (`ExecuteRemoteOperation` GraphQL mutation + `RemoteOperationProgress`
 * subscription) on the client and dispatched in-process on the server to `SynthesizeArtifactFromSourcesServerOperation`.
 */
export class SynthesizeArtifactFromSourcesOperation extends BaseRemotableOperation<
    SynthesizeArtifactFromSourcesInput,
    SynthesizeArtifactFromSourcesOutput
> {
    public readonly OperationKey = ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY;
    public readonly ExecutionMode = 'LongRunning' as const;
    public readonly RequiredScope = 'artifact:edit';
    public readonly RequiresSystemUser = false;
}
