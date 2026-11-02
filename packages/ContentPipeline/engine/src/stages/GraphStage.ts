/**
 * @fileoverview The `Graph` stage of the content pipeline.
 *
 * Runs as an opt-in GraphRAG / Canon overlay after `Segment`, `Tag`, and `Embed`:
 *   1. Resolves {@link ResolvedGraphOverlayConfig} from `ContentSource.Configuration.GraphOverlay`
 *      and stage options.
 *   2. Collects the item's `MJ: Content Item Chunks` and `MJ: Content Item Tags` (from working-record
 *      extensions when chained in-memory, or via `RunView` / {@link IGraphOverlayStore} when run standalone).
 *   3. Deterministically clusters chunks, headings, and tags into {@link ConceptSeedCluster}s via
 *      {@link ClusterContentIntoConceptSeeds}, including cross-chunk authority conflict detection.
 *   4. Synthesizes `MJ: Graph Concepts` and `MJ: Graph Edges` via {@link BaseConceptSynthesizer}.
 *   5. Persists or updates concepts and edges via {@link IGraphOverlayStore} (when not in dry-run/test mode)
 *      and attaches the full {@link GraphStageExecutionSummary} to `record.SetExtension('graphOverlay', ...)`.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJContentItemChunkEntity, MJContentItemTagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseConceptSynthesizer,
    BasePipelineStage,
    ChunkConceptInput,
    ClassifiedTag,
    ClusterContentIntoConceptSeeds,
    ConceptSeedCluster,
    ConceptSynthesizeResult,
    ExistingGraphConceptSummary,
    FatalStageError,
    GraphAuthorityTier,
    ResolvedGraphOverlayConfig,
    ResolveGraphOverlayConfig,
    SchemaGroundingCandidate,
    StageContext,
    StageResult,
    SynthesizedGraphConcept,
    SynthesizedGraphEdge,
    TagConceptInput,
    WorkingRecord,
} from '@memberjunction/content-pipeline-base';
import { ResolveConfigurationForItem } from '../ContentSourceConfigurationResolver.js';
import { CONTENT_ITEM } from '../EntityFieldMap.js';
import { MANAGED_PROMPT_CONCEPT_SYNTHESIZER } from '../ManagedPromptConceptSynthesizer.js';

/** Stage registration key for the Graph overlay stage. */
export const GRAPH_STAGE = 'Graph';

/**
 * Strongly-typed persistence & lookup adapter for `MJ: Graph Concepts` and `MJ: Graph Edges`.
 *
 * Decouples `GraphStage` from direct `BaseEntity.Get()` / `.Set()` calls before or after CodeGen
 * and allows deterministic in-memory stores in unit tests and dry runs.
 */
export interface IGraphOverlayStore {
    /** Load existing concepts in the target graph for deduplication and hierarchy resolution. */
    LoadExistingConcepts(
        graphID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<ExistingGraphConceptSummary[]>;

    /** Load candidate MJ schema/operational targets for grounding edges (`Describes`, `Defines`, `Measures`, `Implements`). */
    LoadGroundingCandidates?(
        groundingMode: ResolvedGraphOverlayConfig['GroundingMode'],
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<SchemaGroundingCandidate[]>;

    /** Optional override for loading chunks when not present on the working record. */
    LoadItemChunks?(
        contentItemID: string,
        contentSourceID: string | null,
        authorityTier: GraphAuthorityTier,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<ChunkConceptInput[]>;

    /** Optional override for loading tags when not present on the working record. */
    LoadItemTags?(
        contentItemID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<TagConceptInput[]>;

    /** Upsert a synthesized concept into the target graph and return its persisted record ID. */
    UpsertConcept(
        graphID: string,
        concept: SynthesizedGraphConcept,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string>;

    /** Upsert synthesized edges anchored at the persisted concept ID. */
    UpsertEdges(
        graphID: string,
        conceptID: string,
        edges: SynthesizedGraphEdge[],
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<number>;
}

/**
 * Summary attached to `record.SetExtension('graphOverlay', summary)` after `GraphStage` executes.
 */
export interface GraphStageExecutionSummary {
    GraphID: string;
    OverlayConfig: ResolvedGraphOverlayConfig;
    SeedClusters: ConceptSeedCluster[];
    SynthesizedResults: Array<{
        ConceptID: string;
        Concept: SynthesizedGraphConcept;
        Edges: SynthesizedGraphEdge[];
        PromptRunID: string | null;
    }>;
    SkippedLockedClusters: string[];
    PersistedConceptCount: number;
    PersistedEdgeCount: number;
}

/** Shape of an in-memory segment placed on `record.GetExtension('segments')` by `SegmentStage`. */
interface WorkingSegmentExtensionItem {
    ID?: string;
    Index?: number;
    Text?: string;
    Decorator?: string | null;
}

/**
 * The `Graph` stage of the content pipeline.
 */
@RegisterClass(BasePipelineStage, GRAPH_STAGE)
export class GraphStage extends BasePipelineStage {
    public readonly Name = GRAPH_STAGE;

    private static _defaultStore: IGraphOverlayStore | null = null;

    /** Register or clear a process-wide default {@link IGraphOverlayStore}. */
    public static SetDefaultStore(store: IGraphOverlayStore | null): void {
        GraphStage._defaultStore = store;
    }

    /** Return the currently registered default {@link IGraphOverlayStore}, if any. */
    public static GetDefaultStore(): IGraphOverlayStore | null {
        return GraphStage._defaultStore;
    }

    public async Execute(record: WorkingRecord, context: StageContext): Promise<StageResult> {
        const sourceID = (record.Current(CONTENT_ITEM.ContentSource) as string | undefined) ?? null;
        const sourceConfig = await ResolveConfigurationForItem(record, context.Provider, context.ContextUser);
        const overlayConfig = ResolveGraphOverlayConfig(sourceConfig, context.Configuration);

        if (!overlayConfig.Enabled) {
            return {
                Skipped: true,
                SkipReason: 'Graph overlay is disabled for this content source',
            };
        }

        if (!overlayConfig.TargetGraphID) {
            return {
                Skipped: true,
                SkipReason: 'Graph overlay is enabled but no TargetGraphID is configured',
            };
        }

        const synthesizerKey = overlayConfig.SynthesizerKey || MANAGED_PROMPT_CONCEPT_SYNTHESIZER;
        const synthesizer = BaseConceptSynthesizer.Resolve(synthesizerKey);
        if (!synthesizer) {
            throw new FatalStageError(`Concept synthesizer '${synthesizerKey}' is not registered`);
        }

        const store = this.resolveStore(context.Configuration);
        const chunks = await this.loadChunksForRecord(
            record,
            sourceID,
            overlayConfig.SourceAuthorityTier,
            store,
            context,
        );
        if (chunks.length === 0) {
            return {
                Skipped: true,
                SkipReason: 'Content Item has no chunks to build graph concepts from',
            };
        }

        const tags = await this.loadTagsForRecord(record, store, context);
        const existingConcepts = store
            ? await store.LoadExistingConcepts(overlayConfig.TargetGraphID, context.ContextUser, context.Provider)
            : [];
        const groundingCandidates =
            store?.LoadGroundingCandidates && overlayConfig.GroundingMode !== 'none'
                ? await store.LoadGroundingCandidates(
                      overlayConfig.GroundingMode,
                      context.ContextUser,
                      context.Provider,
                  )
                : [];

        const seedClusters = ClusterContentIntoConceptSeeds({
            Chunks: chunks,
            Tags: tags,
            ExistingConcepts: existingConcepts,
            MinSeedConfidence: overlayConfig.MinConceptConfidence,
        });

        if (seedClusters.length === 0) {
            return {
                Skipped: true,
                SkipReason: 'No concept seed clusters met the minimum confidence threshold',
            };
        }

        const synthesizedResults: GraphStageExecutionSummary['SynthesizedResults'] = [];
        const skippedLockedClusters: string[] = [];
        let persistedConceptCount = 0;
        let persistedEdgeCount = 0;

        // Maintain a live view of concepts so child clusters within the same batch can resolve parents
        const liveExistingConcepts: ExistingGraphConceptSummary[] = [...existingConcepts];

        for (const cluster of seedClusters) {
            if (context.Signal.aborted) {
                break;
            }

            if (overlayConfig.ConceptTaxonomyMode === 'locked' && !cluster.MatchedExistingConceptID) {
                skippedLockedClusters.push(cluster.CanonicalName);
                continue;
            }

            const synthResult: ConceptSynthesizeResult = await synthesizer.Synthesize({
                Cluster: cluster,
                OverlayConfig: overlayConfig,
                ExistingConcepts: liveExistingConcepts,
                GroundingCandidates: groundingCandidates,
                ContextUser: context.ContextUser,
                Provider: context.Provider,
                Parameters: overlayConfig.SynthesisParameters,
            });

            let conceptID =
                synthResult.Concept.ExistingConceptID ??
                `ephemeral-concept:${overlayConfig.TargetGraphID}:${ synthResult.Concept.Name.toLowerCase().replace(/\s+/g, '-') }`;

            if (!context.IsTest && store) {
                conceptID = await store.UpsertConcept(
                    overlayConfig.TargetGraphID,
                    synthResult.Concept,
                    context.ContextUser,
                    context.Provider,
                );
                persistedConceptCount++;

                const savedEdges = await store.UpsertEdges(
                    overlayConfig.TargetGraphID,
                    conceptID,
                    synthResult.Edges,
                    context.ContextUser,
                    context.Provider,
                );
                persistedEdgeCount += savedEdges;
            }

            // Make newly synthesized/updated concept visible to subsequent clusters in this run
            const existingIdx = liveExistingConcepts.findIndex((c) => c.ID === conceptID);
            const summaryEntry: ExistingGraphConceptSummary = {
                ID: conceptID,
                GraphID: overlayConfig.TargetGraphID,
                Name: synthResult.Concept.Name,
                ConceptType: synthResult.Concept.ConceptType,
                Synonyms: synthResult.Concept.Synonyms,
                AuthorityTier: synthResult.Concept.AuthorityTier,
                Status: synthResult.Concept.Status,
                Description: synthResult.Concept.Description,
                Specification: synthResult.Concept.Specification,
            };
            if (existingIdx >= 0) {
                liveExistingConcepts[existingIdx] = summaryEntry;
            } else {
                liveExistingConcepts.push(summaryEntry);
            }

            synthesizedResults.push({
                ConceptID: conceptID,
                Concept: synthResult.Concept,
                Edges: synthResult.Edges,
                PromptRunID: synthResult.PromptRunID,
            });
        }

        const summary: GraphStageExecutionSummary = {
            GraphID: overlayConfig.TargetGraphID,
            OverlayConfig: overlayConfig,
            SeedClusters: seedClusters,
            SynthesizedResults: synthesizedResults,
            SkippedLockedClusters: skippedLockedClusters,
            PersistedConceptCount: persistedConceptCount,
            PersistedEdgeCount: persistedEdgeCount,
        };

        record.SetExtension('graphOverlay', summary);
        context.ReportProgress(1, 1);

        return {
            Skipped: false,
        };
    }

    private resolveStore(configuration: Record<string, unknown>): IGraphOverlayStore | null {
        const configStore = configuration['GraphOverlayStore'];
        if (configStore && typeof configStore === 'object' && 'UpsertConcept' in configStore) {
            return configStore as IGraphOverlayStore;
        }
        return GraphStage._defaultStore;
    }

    private async loadChunksForRecord(
        record: WorkingRecord,
        contentSourceID: string | null,
        authorityTier: GraphAuthorityTier,
        store: IGraphOverlayStore | null,
        context: StageContext,
    ): Promise<ChunkConceptInput[]> {
        const itemID = record.Identity.ExistingRecordID ?? record.Identity.SourceKey;
        const itemName = (record.Current(CONTENT_ITEM.Name) as string | undefined) ?? null;

        // 1. Check in-memory segments extension (when chained right after SegmentStage)
        const extensionSegments = record.GetExtension<WorkingSegmentExtensionItem[]>('segments');
        if (Array.isArray(extensionSegments) && extensionSegments.length > 0) {
            return extensionSegments
                .filter((seg) => typeof seg.Text === 'string' && seg.Text.trim().length > 0)
                .map((seg, idx) => ({
                    ChunkID: seg.ID ?? `${itemID}:chunk:${seg.Index ?? idx}`,
                    ContentItemID: itemID,
                    ContentSourceID: contentSourceID,
                    Text: seg.Text ?? '',
                    HeadingText: seg.Decorator ?? itemName,
                    AuthorityTier: authorityTier,
                    ChunkIndex: seg.Index ?? idx,
                }));
        }

        // 2. Delegate to store if it provides a custom chunk loader
        if (store?.LoadItemChunks && record.Identity.ExistingRecordID) {
            return store.LoadItemChunks(
                record.Identity.ExistingRecordID,
                contentSourceID,
                authorityTier,
                context.ContextUser,
                context.Provider,
            );
        }

        // 3. Query persisted MJ: Content Item Chunks via RunView when an ExistingRecordID is present
        if (record.Identity.ExistingRecordID) {
            const rv = new RunView(context.Provider as never);
            const escapedID = record.Identity.ExistingRecordID.replace(/'/g, "''");
            const res = await rv.RunView<MJContentItemChunkEntity>(
                {
                    EntityName: 'MJ: Content Item Chunks',
                    ExtraFilter: `ContentItemID = '${escapedID}'`,
                    OrderBy: 'ItemSequence ASC',
                    ResultType: 'simple',
                },
                context.ContextUser,
            );
            if (res.Success && Array.isArray(res.Results) && res.Results.length > 0) {
                return res.Results.map((row, idx) => ({
                    ChunkID: row.ID,
                    ContentItemID: row.ContentItemID,
                    ContentSourceID: contentSourceID,
                    Text: row.Text,
                    HeadingText: row.Decorator ?? itemName,
                    AuthorityTier: authorityTier,
                    ChunkIndex: row.ItemSequence ?? idx,
                }));
            }
        }

        // 4. Fallback: if the record has extracted Text on it directly, treat it as a single chunk
        const rawText = (record.Current(CONTENT_ITEM.Text) as string | undefined) ?? null;
        if (rawText && rawText.trim().length > 0) {
            return [
                {
                    ChunkID: `${itemID}:chunk:0`,
                    ContentItemID: itemID,
                    ContentSourceID: contentSourceID,
                    Text: rawText,
                    HeadingText: itemName,
                    AuthorityTier: authorityTier,
                    ChunkIndex: 0,
                },
            ];
        }

        return [];
    }

    private async loadTagsForRecord(
        record: WorkingRecord,
        store: IGraphOverlayStore | null,
        context: StageContext,
    ): Promise<TagConceptInput[]> {
        const itemID = record.Identity.ExistingRecordID ?? record.Identity.SourceKey;

        // 1. Check in-memory tags extension placed by TagStage
        const extensionTags = record.GetExtension<ClassifiedTag[]>('tags');
        if (Array.isArray(extensionTags) && extensionTags.length > 0) {
            return extensionTags.map((t) => ({
                ContentItemID: itemID,
                TagName: t.Name,
                Weight: t.Score,
                ParentTagName: t.Parent ?? null,
            }));
        }

        // 2. Delegate to store if it provides a custom tag loader
        if (store?.LoadItemTags && record.Identity.ExistingRecordID) {
            return store.LoadItemTags(record.Identity.ExistingRecordID, context.ContextUser, context.Provider);
        }

        // 3. Query persisted MJ: Content Item Tags via RunView
        if (record.Identity.ExistingRecordID) {
            const rv = new RunView(context.Provider as never);
            const escapedID = record.Identity.ExistingRecordID.replace(/'/g, "''");
            const res = await rv.RunView<MJContentItemTagEntity>(
                {
                    EntityName: 'MJ: Content Item Tags',
                    ExtraFilter: `ItemID = '${escapedID}'`,
                    ResultType: 'simple',
                },
                context.ContextUser,
            );
            if (res.Success && Array.isArray(res.Results)) {
                return res.Results.map((row) => ({
                    ContentItemID: row.ItemID,
                    TagName: row.Tag,
                    Weight: row.Weight ?? 0.7,
                }));
            }
        }

        return [];
    }
}
