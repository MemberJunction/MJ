/**
 * @fileoverview The `Graph` stage of the content pipeline (`GraphStage`).
 *
 * Runs as an opt-in GraphRAG / Canon overlay after `Segment`, `Tag`, and `Embed`:
 *   1. Resolves {@link ResolvedGraphOverlayConfig} from `ContentSource.Configuration` (`GraphOverlay`)
 *      and `context.Configuration`.
 *   2. Collects the item's `MJ: Content Item Chunks` and `MJ: Content Item Tags` (from `record.Children`
 *      and `record.GetExtension('Tag', 'tags')` when chained in-memory, or via `RunView` /
 *      {@link IGraphOverlayStore} when run standalone).
 *   3. Deterministically clusters chunks, headings, and tags into {@link ConceptSeedCluster}s via
 *      {@link ClusterContentIntoConceptSeeds}, including cross-chunk authority conflict detection.
 *   4. Synthesizes `MJ: Graph Concepts` and `MJ: Graph Edges` via {@link BaseConceptSynthesizer}.
 *   5. Persists or updates concepts and edges via {@link IGraphOverlayStore} (when not in dry-run/test mode)
 *      and attaches the full {@link GraphStageExecutionSummary} to `record.SetExtension('Graph', 'summary', ...)`.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
    KnowledgeHubMetadataEngine,
    MJContentItemChunkEntity,
    MJContentItemTagEntity,
    type MJGraphConceptEntity,
    type MJGraphEdgeEntity,
} from '@memberjunction/core-entities';
import { RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import {
    BaseConceptSynthesizer,
    BasePipelineStage,
    ClassifiedTag,
    ClusterContentIntoConceptSeeds,
    ConceptClusteringResult,
    ContentChunkSeedInput,
    ExistingGraphConceptSeed,
    FatalStageError,
    GraphAuthorityTier,
    GraphAuthorityTierDescriptor,
    GraphConceptTypeDescriptor,
    Outcome,
    ResolvedGraphOverlayConfig,
    ResolveGraphOverlayConfig,
    SchemaGroundingTarget,
    StageContext,
    StageDeclaration,
    StageOutcome,
    SynthesizeConceptResult,
    SynthesizedGraphConcept,
    SynthesizedGraphEdge,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';
import { WhereEqual } from '../Filters.js';
import {
    DETERMINISTIC_CONCEPT_SYNTHESIZER,
    DeterministicConceptSynthesizer,
    ManagedPromptConceptSynthesizer,
} from '../ManagedPromptConceptSynthesizer.js';
import { EntityGraphOverlayStore } from './EntityGraphOverlayStore.js';
import { TAG_STAGE } from './TagStage.js';

void DeterministicConceptSynthesizer;
void ManagedPromptConceptSynthesizer;

/** Stage registration key for the Graph overlay stage. */
export const GRAPH_STAGE = 'Graph';

/**
 * Governance lifecycle status shared by synthesized `MJ: Graph Concepts` and `MJ: Graph Edges`,
 * derived directly from the generated entity field types (`MJGraphConceptEntity['Status']` and `MJGraphEdgeEntity['Status']`).
 */
export type GraphStageUpsertStatus = Extract<MJGraphConceptEntity['Status'], MJGraphEdgeEntity['Status']>;

/**
 * Strongly-typed persistence & lookup adapter for `MJ: Graph Concepts` and `MJ: Graph Edges`.
 *
 * Decouples `GraphStage` from direct `BaseEntity.Get()` / `.Set()` calls and allows deterministic
 * in-memory stores in unit tests and dry runs.
 */
export interface IGraphOverlayStore {
    /** Load existing concepts in the target graph for deduplication and hierarchy resolution. */
    LoadExistingConcepts(
        graphID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<ExistingGraphConceptSeed[]>;

    /** Optional loader for active `MJ: Graph Concept Types` (`__mj.GraphConceptType`) to resolve `ConceptTypeID` and rank order. */
    LoadConceptTypes?(
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<GraphConceptTypeDescriptor[]>;

    /** Optional loader for active `MJ: Graph Authority Tiers` (`__mj.GraphAuthorityTier`) to resolve `AuthorityTierID` and rank order. */
    LoadAuthorityTiers?(
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<GraphAuthorityTierDescriptor[]>;

    /** Load candidate MJ schema/operational targets for grounding edges (`Describes`, `Defines`, `Measures`, `Implements`). */
    LoadGroundingTargets?(
        groundingMode: ResolvedGraphOverlayConfig['GroundingMode'],
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<SchemaGroundingTarget[]>;

    /** Optional override for loading chunks when not present on `record.Children`. */
    LoadItemChunks?(
        contentItemID: string,
        contentSourceID: string,
        contentItemTitle: string | null,
        tags: readonly string[],
        authorityTier: GraphAuthorityTier,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<ContentChunkSeedInput[]>;

    /** Optional override for loading tag names when not present on `record.GetExtension('Tag', 'tags')`. */
    LoadItemTags?(
        contentItemID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string[]>;

    /** Upsert a synthesized concept into the target graph and return its persisted record ID. */
    UpsertConcept(
        graphID: string,
        concept: SynthesizedGraphConcept,
        status: GraphStageUpsertStatus,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string>;

    /** Upsert synthesized edges anchored at the persisted concept ID. */
    UpsertEdges(
        graphID: string,
        conceptID: string,
        edges: readonly SynthesizedGraphEdge[],
        status: GraphStageUpsertStatus,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<number>;
}

/**
 * Summary attached to `record.SetExtension('Graph', 'summary', summary)` after `GraphStage` executes.
 */
export interface GraphStageExecutionSummary {
    GraphID: string;
    OverlayConfig: ResolvedGraphOverlayConfig;
    ClusteringResult: ConceptClusteringResult;
    SynthesizedResults: Array<{
        ConceptID: string;
        Status: MJGraphConceptEntity['Status'];
        EdgeStatus: GraphStageUpsertStatus;
        Concept: SynthesizedGraphConcept;
        Edges: readonly SynthesizedGraphEdge[];
        PromptRunID: string | null;
    }>;
    PersistedConceptCount: number;
    PersistedEdgeCount: number;
}

/**
 * The `Graph` stage of the content pipeline.
 */
@RegisterClass(BasePipelineStage, GRAPH_STAGE)
export class GraphStage extends BasePipelineStage {
    public readonly Name = GRAPH_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField: string | null = null;

    private static _defaultStore: IGraphOverlayStore | null = null;

    /** Register or clear a process-wide default {@link IGraphOverlayStore}. */
    public static SetDefaultStore(store: IGraphOverlayStore | null): void {
        GraphStage._defaultStore = store;
    }

    /** Return the currently registered default {@link IGraphOverlayStore}, if any. */
    public static GetDefaultStore(): IGraphOverlayStore | null {
        return GraphStage._defaultStore;
    }

    public override get Declaration(): StageDeclaration {
        return {
            Reads: ['Text', 'Title', 'Decorator'],
            Writes: [],
            ReadsExtensions: ['Pipeline.contentSourceID', `${TAG_STAGE}.tags`],
            WritesExtensions: [`${GRAPH_STAGE}.summary`],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before graph overlay started');
        }

        const sourceID = record.GetExtension<string>('Pipeline', 'contentSourceID') ?? null;
        const { explicitGraphID, sourceConfig } = await this.resolveSourceConfiguration(sourceID, context);
        const overlayConfig = ResolveGraphOverlayConfig(explicitGraphID, sourceConfig, context.Configuration);

        if (!overlayConfig.EnableGraphOverlay) {
            return Outcome.Skipped('Graph overlay is disabled for this content source');
        }

        if (!overlayConfig.GraphID) {
            return Outcome.Skipped('Graph overlay is enabled but no GraphID is configured');
        }

        const targetGraphID = overlayConfig.GraphID;
        const synthesizerKey = overlayConfig.SynthesizerKey || DETERMINISTIC_CONCEPT_SYNTHESIZER;
        const synthesizer = BaseConceptSynthesizer.Resolve(synthesizerKey);
        if (!synthesizer) {
            throw new FatalStageError(`Concept synthesizer '${synthesizerKey}' is not registered`);
        }

        const store = this.resolveStore(context.Configuration, context.IsTest);
        const tagNames = await this.loadTagsForRecord(record, store, context);
        const chunks = await this.loadChunksForRecord(
            record,
            sourceID ?? 'unscoped-source',
            tagNames,
            overlayConfig.AuthorityTier,
            store,
            context,
        );
        if (chunks.length === 0) {
            return Outcome.Skipped('Content Item has no chunks to build graph concepts from');
        }

        const existingConcepts = store
            ? await store.LoadExistingConcepts(targetGraphID, context.ContextUser, context.Provider)
            : [];
        const conceptTypes = store?.LoadConceptTypes
            ? await store.LoadConceptTypes(context.ContextUser, context.Provider)
            : [];
        const authorityTiers = store?.LoadAuthorityTiers
            ? await store.LoadAuthorityTiers(context.ContextUser, context.Provider)
            : [];
        const groundingTargets =
            store?.LoadGroundingTargets && overlayConfig.GroundingMode !== 'none'
                ? await store.LoadGroundingTargets(
                      overlayConfig.GroundingMode,
                      context.ContextUser,
                      context.Provider,
                  )
                : [];

        const clusteringResult = ClusterContentIntoConceptSeeds(chunks, existingConcepts, {
            taxonomyMode: overlayConfig.ConceptTaxonomyMode,
            conceptMatchThreshold: overlayConfig.ConceptMatchThreshold,
            maxNewConcepts: overlayConfig.MaxNewConceptsPerRun,
            groundingTargets: groundingTargets,
            conceptTypes: conceptTypes,
            authorityTiers: authorityTiers,
        });

        if (clusteringResult.Clusters.length === 0) {
            return Outcome.Skipped('No concept seed clusters matched or met the clustering criteria');
        }

        const synthesizedResults: GraphStageExecutionSummary['SynthesizedResults'] = [];
        let persistedConceptCount = 0;
        let persistedEdgeCount = 0;

        const targetStatus: GraphStageUpsertStatus =
            overlayConfig.ConceptTaxonomyMode === 'propose-only' ? 'Proposed' : 'Approved';

        for (const cluster of clusteringResult.Clusters) {
            if (context.Signal.aborted) {
                return Outcome.Retry('cancelled during concept synthesis');
            }

            const synthResult: SynthesizeConceptResult = await synthesizer.SynthesizeCluster({
                GraphID: targetGraphID,
                OverlayConfig: overlayConfig,
                SeedCluster: cluster,
                ContextUser: context.ContextUser,
                Provider: context.Provider,
                Signal: context.Signal,
                ReportProgress: (m) => context.ReportProgress(m),
            });

            if (!synthResult.Concept) {
                continue;
            }

            // Preserve existing concept's status when matched; never silently promote Proposed/Deprecated/Draft to Approved
            const existingStatus = synthResult.Concept.ExistingStatus ?? cluster.MatchedExistingConcept?.Status;
            const conceptStatus: MJGraphConceptEntity['Status'] = synthResult.Concept.ExistingConceptID
                ? (existingStatus ?? targetStatus)
                : targetStatus;
            const upsertConceptStatus: GraphStageUpsertStatus =
                conceptStatus === 'Approved' ? 'Approved' : 'Proposed';
            // New edges synthesized in propose-only mode always start as Proposed regardless of whether the concept already existed
            const edgeStatus: GraphStageUpsertStatus = targetStatus;

            let conceptID =
                synthResult.Concept.ExistingConceptID ??
                `ephemeral-concept:${targetGraphID}:${synthResult.Concept.Name.toLowerCase().replace(/\s+/g, '-')}`;

            if (!context.IsTest && store) {
                conceptID = await store.UpsertConcept(
                    targetGraphID,
                    synthResult.Concept,
                    upsertConceptStatus,
                    context.ContextUser,
                    context.Provider,
                );
                persistedConceptCount++;

                const savedEdges = await store.UpsertEdges(
                    targetGraphID,
                    conceptID,
                    synthResult.Edges,
                    edgeStatus,
                    context.ContextUser,
                    context.Provider,
                );
                persistedEdgeCount += savedEdges;
            }

            synthesizedResults.push({
                ConceptID: conceptID,
                Status: conceptStatus,
                EdgeStatus: edgeStatus,
                Concept: synthResult.Concept,
                Edges: synthResult.Edges,
                PromptRunID: synthResult.PromptRunID ?? null,
            });
        }

        const summary: GraphStageExecutionSummary = {
            GraphID: targetGraphID,
            OverlayConfig: overlayConfig,
            ClusteringResult: clusteringResult,
            SynthesizedResults: synthesizedResults,
            PersistedConceptCount: persistedConceptCount,
            PersistedEdgeCount: persistedEdgeCount,
        };

        record.SetExtension(GRAPH_STAGE, 'summary', summary);
        context.ReportProgress(
            `synthesized ${synthesizedResults.length} concept(s) into graph '${targetGraphID}'`,
        );

        return Outcome.Complete(
            `synthesized ${synthesizedResults.length} concept(s) (${persistedConceptCount} persisted, ${persistedEdgeCount} edge(s))`,
        );
    }

    private resolveStore(configuration: Record<string, unknown>, isTest: boolean): IGraphOverlayStore | null {
        const configStore = configuration['GraphOverlayStore'];
        if (configStore && typeof configStore === 'object' && 'UpsertConcept' in configStore) {
            return configStore as IGraphOverlayStore;
        }
        if (GraphStage._defaultStore) {
            return GraphStage._defaultStore;
        }
        if (!isTest) {
            return new EntityGraphOverlayStore();
        }
        return null;
    }

    private async resolveSourceConfiguration(
        contentSourceID: string | null,
        context: StageContext,
    ): Promise<{ explicitGraphID: string | null; sourceConfig: Record<string, unknown> | undefined }> {
        if (!contentSourceID) {
            return { explicitGraphID: null, sourceConfig: undefined };
        }
        try {
            const knowledge = KnowledgeHubMetadataEngine.Instance;
            await knowledge.Config(false, context.ContextUser, context.Provider);
            const source = knowledge.ContentSources.find((c) => UUIDsEqual(c.ID, contentSourceID));
            if (!source) {
                return { explicitGraphID: null, sourceConfig: undefined };
            }
            const parsedConfig = source.Configuration
                ? (SafeJSONParse<Record<string, unknown>>(source.Configuration) ?? undefined)
                : undefined;
            return {
                explicitGraphID: source.GraphID ?? null,
                sourceConfig: parsedConfig,
            };
        } catch (err) {
            LogError(
                `GraphStage.resolveSourceConfiguration failed for ContentSourceID '${contentSourceID}': ${err instanceof Error ? err.message : String(err)}`,
            );
            return { explicitGraphID: null, sourceConfig: undefined };
        }
    }

    private async loadChunksForRecord(
        record: WorkingRecord,
        contentSourceID: string,
        tags: readonly string[],
        authorityTier: GraphAuthorityTier,
        store: IGraphOverlayStore | null,
        context: StageContext,
    ): Promise<ContentChunkSeedInput[]> {
        const itemID = record.Identity.RecordID ?? record.Identity.EphemeralID;
        const itemTitle = (record.Get('Title') as string | null) ?? null;
        const itemDecorator = (record.Get('Decorator') as string | null) ?? itemTitle;

        // 1. Check in-memory child chunk WorkingRecords (populated when chained after SegmentStage)
        const childChunks = record.Children.filter((child) => child.Identity.Entity === 'Content Item Chunk');
        if (childChunks.length > 0) {
            return childChunks
                .map((child, idx) => {
                    const text = (child.Get('Text') as string | null) ?? '';
                    const decorator = (child.Get('Decorator') as string | null) ?? itemDecorator;
                    const cols = child.GetExtension<Record<string, unknown>>('Pipeline', 'columns');
                    const seq = typeof cols?.Sequence === 'number' ? cols.Sequence : idx;
                    return {
                        ChunkID: child.Identity.RecordID ?? child.Identity.EphemeralID,
                        ContentItemID: itemID,
                        ContentSourceID: contentSourceID,
                        ContentItemTitle: itemTitle,
                        Text: text,
                        HeadingPath: decorator,
                        Sequence: seq,
                        Tags: tags,
                        AuthorityTier: authorityTier,
                    };
                })
                .filter((c) => c.Text.trim().length > 0);
        }

        // 2. Delegate to store if it provides a custom chunk loader
        if (store?.LoadItemChunks && record.Identity.RecordID) {
            return store.LoadItemChunks(
                record.Identity.RecordID,
                contentSourceID,
                itemTitle,
                tags,
                authorityTier,
                context.ContextUser,
                context.Provider,
            );
        }

        // 3. Query persisted MJ: Content Item Chunks via RunView when a RecordID is present
        if (record.Identity.RecordID) {
            const rv = RunView.FromMetadataProvider(context.Provider);
            const res = await rv.RunView<MJContentItemChunkEntity>(
                {
                    EntityName: 'MJ: Content Item Chunks',
                    ExtraFilter: WhereEqual({ ContentItemID: record.Identity.RecordID }),
                    OrderBy: 'Sequence ASC',
                    ResultType: 'simple',
                    IgnoreMaxRows: true,
                },
                context.ContextUser,
            );
            if (res.Success && Array.isArray(res.Results) && res.Results.length > 0) {
                return res.Results.map((row, idx) => ({
                    ChunkID: row.ID,
                    ContentItemID: row.ContentItemID,
                    ContentSourceID: contentSourceID,
                    ContentItemTitle: itemTitle,
                    Text: row.Text,
                    HeadingPath: itemDecorator,
                    Sequence: typeof row.Sequence === 'number' ? row.Sequence : idx,
                    Tags: tags,
                    AuthorityTier: authorityTier,
                }));
            }
        }

        // 4. Fallback: if the record has extracted Text on it directly, treat it as a single chunk
        const rawText = (record.Get('Text') as string | null) ?? null;
        if (rawText && rawText.trim().length > 0) {
            return [
                {
                    ChunkID: `${itemID}#chunk-0`,
                    ContentItemID: itemID,
                    ContentSourceID: contentSourceID,
                    ContentItemTitle: itemTitle,
                    Text: rawText,
                    HeadingPath: itemDecorator,
                    Sequence: 0,
                    Tags: tags,
                    AuthorityTier: authorityTier,
                },
            ];
        }

        return [];
    }

    private async loadTagsForRecord(
        record: WorkingRecord,
        store: IGraphOverlayStore | null,
        context: StageContext,
    ): Promise<string[]> {
        // 1. Check in-memory tags extension placed by TagStage ('Tag', 'tags')
        const extensionTags = record.GetExtension<ClassifiedTag[]>(TAG_STAGE, 'tags');
        if (Array.isArray(extensionTags) && extensionTags.length > 0) {
            return extensionTags.map((t) => t.Name);
        }

        // 2. Delegate to store if it provides a custom tag loader
        if (store?.LoadItemTags && record.Identity.RecordID) {
            return store.LoadItemTags(record.Identity.RecordID, context.ContextUser, context.Provider);
        }

        // 3. Query persisted MJ: Content Item Tags via RunView
        if (record.Identity.RecordID) {
            const rv = RunView.FromMetadataProvider(context.Provider);
            const res = await rv.RunView<MJContentItemTagEntity>(
                {
                    EntityName: 'MJ: Content Item Tags',
                    ExtraFilter: WhereEqual({ ItemID: record.Identity.RecordID }),
                    ResultType: 'simple',
                },
                context.ContextUser,
            );
            if (res.Success && Array.isArray(res.Results)) {
                return res.Results.map((row) => row.Tag);
            }
        }

        return [];
    }
}
