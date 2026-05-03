import { BaseAction } from "@memberjunction/actions";
import { MJGlobal, RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { AutotagBase, AutotagBaseEngine, AutotagProgressCallback, VectorizeResult } from '@memberjunction/content-autotagging';
import { ActionParam, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from "@memberjunction/core";
import {
    MJContentItemEntity,
    MJContentProcessRunDetailEntity,
    MJContentProcessRunPromptRunEntity,
    MJContentSourceEntity,
    KnowledgeHubMetadataEngine
} from "@memberjunction/core-entities";
import { EntityVectorSyncer } from "@memberjunction/ai-vector-sync";

/**
 * Params:
 *  * Autotag: Bit, if set to 1, will autotag content from all source types.
 *  * Vectorize: Bit, if set to 1, will embed tagged content items directly into the vector index.
 *
 * Uses plugin architecture: iterates all ContentSourceType records and resolves
 * providers dynamically via ClassFactory using the DriverClass field.
 */
@RegisterClass(BaseAction, "__AutotagAndVectorizeContent")
export class AutotagAndVectorizeContentAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const autotagParam: ActionParam | undefined = params.Params.find(p => p.Name === 'Autotag');
        const vectorizeParam: ActionParam | undefined = params.Params.find(p => p.Name === 'Vectorize');

        if (!autotagParam || !vectorizeParam) {
            throw new Error('Autotag and Vectorize params are required.');
        }

        // Extract optional progress callback from params (injected by resolver)
        const progressParam = params.Params.find(p => p.Name === '__progressCallback');
        const onProgress = progressParam?.Value as AutotagProgressCallback | undefined;

        // Optional: filter to specific content source IDs (comma-separated or array)
        const sourceFilterParam = params.Params.find(p => p.Name === 'ContentSourceIDs');
        const contentSourceIDs: string[] | undefined = sourceFilterParam?.Value
            ? (Array.isArray(sourceFilterParam.Value)
                ? sourceFilterParam.Value as string[]
                : String(sourceFilterParam.Value).split(',').map(s => s.trim()).filter(s => s.length > 0))
            : undefined;

        // Optional: force reprocessing of existing content items (skip checksum comparison)
        const forceReprocessParam = params.Params.find(p => p.Name === 'ForceReprocess');
        const forceReprocess = forceReprocessParam?.Value === 1 || forceReprocessParam?.Value === true;

        // Optional: ContentProcessRunID to link detail records for per-source tracking
        const processRunParam = params.Params.find(p => p.Name === 'ContentProcessRunID');
        const contentProcessRunID = processRunParam?.Value ? String(processRunParam.Value) : undefined;

        try {
            // Initialize the autotagging engine (loads cached metadata)
            await AutotagBaseEngine.Instance.Config(false, params.ContextUser);

            LogStatus(`[AutotagAction] Autotag=${autotagParam.Value}, Vectorize=${vectorizeParam.Value}`);

            // When the resolver is managing the ContentProcessRun, suppress the
            // legacy saveProcessRun() in the engine to avoid phantom run records.
            AutotagBaseEngine.Instance.ExternalRunTrackingActive = !!contentProcessRunID;

            // Phase 1: Run autotag providers to create/update ContentItems in the DB.
            // Providers use checksum comparison to skip unchanged items.
            let hasNewItems = false;
            if (autotagParam.Value === 1) {
                // Initialize the taxonomy bridge BEFORE providers run so ALL providers
                // (RSS, Entity, Website, CloudStorage) get tag taxonomy bridging
                LogStatus(`[AutotagAction] Initializing taxonomy bridge...`);
                await AutotagBaseEngine.Instance.InitializeTaxonomyBridge(params.ContextUser);

                LogStatus(`[AutotagAction] Phase 1: Running providers to create/update content items...`);
                if (contentSourceIDs) {
                    LogStatus(`[AutotagAction] Filtering to source IDs: ${contentSourceIDs.join(', ')}`);
                }
                if (forceReprocess) {
                    LogStatus(`[AutotagAction] Force reprocess enabled — skipping checksum comparison`);
                }
                hasNewItems = await this.RunAutotagProviders(params, onProgress, contentSourceIDs, forceReprocess);
                LogStatus(`[AutotagAction] Phase 1 complete — providers finished (hasNewItems=${hasNewItems})`);

                // Clean up the bridge
                AutotagBaseEngine.Instance.CleanupTaxonomyBridge();
            }

            // Phase 2: Vectorization. Content item vectorization runs when new tags
            // were created. Entity vector sync only runs when forceReprocess is set,
            // since entity records don't change during tagging — their vectors were
            // already synced when first ingested via the Vectors dashboard.
            if (vectorizeParam.Value === 1) {
                const tasks: Promise<void>[] = [];

                if (hasNewItems) {
                    tasks.push(this.RunDirectVectorization(params, contentProcessRunID));
                }

                if (forceReprocess) {
                    tasks.push(this.SyncEntitySourceVectors(params, contentSourceIDs));
                }

                if (tasks.length > 0) {
                    LogStatus(`[AutotagAction] Phase 2: Running ${tasks.length} vectorization task(s)...`);
                    await Promise.all(tasks);
                } else {
                    LogStatus(`[AutotagAction] Phase 2: Skipping vectorization — no new content items and not force-reprocessing`);
                }
            }
            LogStatus(`[AutotagAction] All tasks completed`);

            return { Success: true, ResultCode: "SUCCESS" };
        } catch (error) {
            return {
                Success: false,
                Message: error instanceof Error ? error.message : String(error),
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Dynamically resolves and runs all autotag providers using ClassFactory.
     * Iterates all ContentSourceType records that have a DriverClass set,
     * instantiates the provider via ClassFactory, and runs autotagging for
     * any sources configured for that type.
     *
     * @returns true if any content items were processed (new, modified, or retried)
     */
    private async RunAutotagProviders(
        params: RunActionParams,
        onProgress?: AutotagProgressCallback,
        contentSourceIDs?: string[],
        forceReprocess?: boolean
    ): Promise<boolean> {
        const engine = AutotagBaseEngine.Instance;
        const sourceTypes = engine.ContentSourceTypes;

        // Pass forceReprocess to the engine so providers can check it
        engine.ForceReprocess = forceReprocess ?? false;

        let totalItemsProcessed = 0;

        for (const sourceType of sourceTypes) {
            if (!sourceType.DriverClass) {
                LogStatus(`Content source type "${sourceType.Name}" has no DriverClass, skipping`);
                continue;
            }

            // Check if any sources are configured for this type before instantiating
            let sources = await engine.GetAllContentSourcesSafe(params.ContextUser, sourceType.ID);

            // Apply source ID filter if specified
            if (contentSourceIDs && contentSourceIDs.length > 0) {
                sources = sources.filter(s => contentSourceIDs.some(id => UUIDsEqual(id, s.ID)));
            }

            if (sources.length === 0) {
                LogStatus(`Content source type "${sourceType.Name}": no sources configured, skipping`);
                continue;
            }

            const provider = MJGlobal.Instance.ClassFactory.CreateInstance<AutotagBase>(
                AutotagBase,
                sourceType.DriverClass
            );
            if (!provider) {
                LogError(`No provider registered for DriverClass "${sourceType.DriverClass}" (source type: ${sourceType.Name}). Ensure the provider class has @RegisterClass(AutotagBase, '${sourceType.DriverClass}').`);
                continue;
            }

            try {
                const sourceIDsForProvider = sources.map(s => s.ID);
                LogStatus(`[AutotagAction] >>> Running provider "${sourceType.Name}" (${sourceType.DriverClass}) with ${sources.length} source(s)...`);
                const itemCount = await provider.Autotag(params.ContextUser, onProgress, contentSourceIDs ? sourceIDsForProvider : undefined);
                totalItemsProcessed += itemCount;
                LogStatus(`[AutotagAction] <<< Provider "${sourceType.Name}" (${sourceType.DriverClass}) completed — ${itemCount} items processed`);
            } catch (providerError) {
                const msg = providerError instanceof Error ? providerError.message : String(providerError);
                LogError(`Autotag provider "${sourceType.Name}" (${sourceType.DriverClass}) failed: ${msg}`);
            }
        }

        LogStatus(`Autotagging complete. ${totalItemsProcessed} items processed across all providers.`);
        return totalItemsProcessed > 0;
    }

    /**
     * Embed all content items directly into the vector index. When a ContentProcessRunID
     * is provided, creates ContentProcessRunDetail records per-source and links
     * AIPromptRun records via the ContentProcessRunPromptRun junction table.
     *
     * @param params - action run params with ContextUser
     * @param contentProcessRunID - optional parent run ID for detail tracking
     */
    private async RunDirectVectorization(
        params: RunActionParams,
        contentProcessRunID?: string
    ): Promise<void> {
        // Resolve the per-request provider once and thread it down the call stack so
        // every BaseEntity / RunView operation in this action runs against the caller's
        // connection (multi-tenant correctness; do not fall through to the global default).
        const provider = (params.Provider ?? new Metadata()) as unknown as IMetadataProvider;

        // Load all content items, then exclude Entity-sourced items.
        // Entity sources get their vectors via EntityVectorSyncer (Phase 2b),
        // not through content item vectorization.
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJContentItemEntity>({
            EntityName: 'MJ: Content Items',
            ResultType: 'entity_object'
        }, params.ContextUser);

        if (!result.Success) {
            LogError('VectorizeContentItems: failed to load content items');
            return;
        }

        // Filter out Entity-sourced content items — those entities are vectorized
        // directly via EntityVectorSyncer, not as content items.
        await KnowledgeHubMetadataEngine.Instance.Config(false, params.ContextUser);
        const khEngine = KnowledgeHubMetadataEngine.Instance;
        const entitySourceType = khEngine.ContentSourceTypes.find(st => st.Name === 'Entity');
        const entitySourceIDs = entitySourceType
            ? new Set(khEngine.ContentSources
                .filter(cs => UUIDsEqual(cs.ContentSourceTypeID, entitySourceType.ID))
                .map(cs => cs.ID.toLowerCase()))
            : new Set<string>();

        const items = entitySourceIDs.size > 0
            ? result.Results.filter(ci => !entitySourceIDs.has(ci.ContentSourceID.toLowerCase()))
            : result.Results;

        LogStatus(`VectorizeContentItems: ${items.length} content items loaded for vectorization (${result.Results.length - items.length} entity-sourced items excluded)`);

        if (!contentProcessRunID) {
            // No run tracking — simple vectorization
            const stats = await AutotagBaseEngine.Instance.VectorizeContentItems(items, params.ContextUser);
            LogStatus(`VectorizeContentItems: ${stats.vectorized} vectorized, ${stats.skipped} skipped`);
            return;
        }

        // Group items by ContentSourceID for per-source detail tracking
        const sourceGroups = this.groupItemsBySource(items);

        for (const [sourceID, sourceItems] of sourceGroups) {
            await this.vectorizeSourceWithTracking(
                sourceID, sourceItems, contentProcessRunID, params.ContextUser, provider
            );
        }
    }

    /**
     * Group content items by their ContentSourceID for per-source processing.
     */
    private groupItemsBySource(
        items: MJContentItemEntity[]
    ): Map<string, MJContentItemEntity[]> {
        const groups = new Map<string, MJContentItemEntity[]>();
        for (const item of items) {
            const key = item.ContentSourceID;
            const group = groups.get(key) ?? [];
            group.push(item);
            groups.set(key, group);
        }
        return groups;
    }

    /**
     * Vectorize items for a single content source with full ContentProcessRunDetail tracking.
     * Creates a detail record, runs vectorization, updates counts, and links prompt runs.
     *
     * @param sourceID - ContentSource ID being processed
     * @param items - content items belonging to this source
     * @param contentProcessRunID - parent ContentProcessRun ID
     * @param contextUser - current user for entity operations
     */
    private async vectorizeSourceWithTracking(
        sourceID: string,
        items: MJContentItemEntity[],
        contentProcessRunID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<void> {
        const detail = await this.createRunDetail(sourceID, contentProcessRunID, contextUser, provider);
        if (!detail) {
            // Fall back to untracked vectorization
            LogError(`[AutotagAction] Failed to create detail record for source ${sourceID}, proceeding without tracking`);
            await AutotagBaseEngine.Instance.VectorizeContentItems(items, contextUser);
            return;
        }

        try {
            const stats = await AutotagBaseEngine.Instance.VectorizeContentItems(items, contextUser);
            await this.completeRunDetail(detail, stats, contextUser);

            // Link AIPromptRun records to this detail via junction table
            await this.linkPromptRuns(detail.ID, stats.promptRunIDs, 'Embed', contextUser, provider);

            LogStatus(`[AutotagAction] Source ${sourceID}: ${stats.vectorized} vectorized, ${stats.skipped} skipped, ${stats.promptRunIDs.length} prompt runs linked`);
        } catch (error) {
            await this.failRunDetail(detail, error, contextUser);
        }
    }

    /**
     * Create a ContentProcessRunDetail record for a content source before processing begins.
     *
     * @param sourceID - ContentSource ID being processed
     * @param contentProcessRunID - parent ContentProcessRun ID
     * @param contextUser - current user for entity creation
     * @returns the saved detail entity, or null if creation failed
     */
    private async createRunDetail(
        sourceID: string,
        contentProcessRunID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<MJContentProcessRunDetailEntity | null> {
        try {
            const detail = await provider.GetEntityObject<MJContentProcessRunDetailEntity>(
                'MJ: Content Process Run Details', contextUser
            );
            detail.NewRecord();
            detail.ContentProcessRunID = contentProcessRunID;
            detail.ContentSourceID = sourceID;
            detail.ContentSourceTypeID = await this.resolveSourceTypeID(sourceID, contextUser);
            detail.Status = 'Running';
            detail.StartTime = new Date();
            detail.ItemsProcessed = 0;
            detail.ItemsTagged = 0;
            detail.ItemsVectorized = 0;
            detail.TagsCreated = 0;
            detail.ErrorCount = 0;
            detail.TotalTokensUsed = 0;
            detail.TotalCost = 0;

            const saved = await detail.Save();
            if (!saved) {
                LogError(`[AutotagAction] Failed to save ContentProcessRunDetail for source ${sourceID}`);
                return null;
            }
            return detail;
        } catch (error) {
            LogError(`[AutotagAction] Error creating ContentProcessRunDetail: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Resolve the ContentSourceTypeID for a given ContentSource using KH engine cached data.
     */
    private resolveSourceTypeID(
        sourceID: string,
        _contextUser: UserInfo
    ): string {
        const source = KnowledgeHubMetadataEngine.Instance.ContentSources.find(
            s => UUIDsEqual(s.ID, sourceID)
        );
        if (source) {
            return source.ContentSourceTypeID;
        }
        LogError(`[AutotagAction] Could not resolve ContentSourceTypeID for source ${sourceID}`);
        return '';
    }

    /**
     * Update a ContentProcessRunDetail record with final counts and mark as Completed.
     *
     * @param detail - the detail entity to update
     * @param stats - vectorization result with counts and prompt run IDs
     * @param contextUser - current user
     */
    private async completeRunDetail(
        detail: MJContentProcessRunDetailEntity,
        stats: VectorizeResult,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            detail.Status = 'Completed';
            detail.EndTime = new Date();
            detail.ItemsProcessed = stats.vectorized + stats.skipped;
            detail.ItemsVectorized = stats.vectorized;
            await detail.Save();
        } catch (error) {
            LogError(`[AutotagAction] Error completing ContentProcessRunDetail: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Mark a ContentProcessRunDetail as Failed with error information.
     *
     * @param detail - the detail entity to update
     * @param error - the error that caused the failure
     * @param contextUser - current user
     */
    private async failRunDetail(
        detail: MJContentProcessRunDetailEntity,
        error: unknown,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            detail.Status = 'Failed';
            detail.EndTime = new Date();
            detail.ErrorCount = (detail.ErrorCount ?? 0) + 1;
            await detail.Save();
            LogError(`[AutotagAction] Source processing failed: ${error instanceof Error ? error.message : String(error)}`);
        } catch (saveError) {
            LogError(`[AutotagAction] Error saving failed detail: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
        }
    }

    /**
     * Create ContentProcessRunPromptRun junction records linking a detail record
     * to its AIPromptRun records for cost/token analytics.
     *
     * @param detailID - ContentProcessRunDetail ID
     * @param promptRunIDs - AIPromptRun IDs to link
     * @param runType - whether these runs are for 'Tag' or 'Embed'
     * @param contextUser - current user for entity creation
     */
    private async linkPromptRuns(
        detailID: string,
        promptRunIDs: string[],
        runType: 'Tag' | 'Embed',
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<void> {
        if (promptRunIDs.length === 0) return;

        for (const promptRunID of promptRunIDs) {
            try {
                const junction = await provider.GetEntityObject<MJContentProcessRunPromptRunEntity>(
                    'MJ: Content Process Run Prompt Runs', contextUser
                );
                junction.NewRecord();
                junction.ContentProcessRunDetailID = detailID;
                junction.AIPromptRunID = promptRunID;
                junction.RunType = runType;
                const saved = await junction.Save();
                if (!saved) {
                    LogError(`[AutotagAction] Failed to save prompt run junction: detail=${detailID}, promptRun=${promptRunID}`);
                }
            } catch (error) {
                LogError(`[AutotagAction] Error linking prompt run: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * For Entity-type content sources, trigger EntityVectorSyncer to sync the
     * source entity's own vectors. This ensures entity records (e.g., Products)
     * are directly searchable in the vector index — not just their Content Item shadows.
     *
     * If the entity doc has already been synced and nothing changed, this is a no-op.
     * If records were modified by tagging, the vectors get updated.
     */
    private async SyncEntitySourceVectors(
        params: RunActionParams,
        contentSourceIDs?: string[]
    ): Promise<void> {
        try {
            await KnowledgeHubMetadataEngine.Instance.Config(false, params.ContextUser);
            const engine = KnowledgeHubMetadataEngine.Instance;

            // Find Entity-type source type
            const entitySourceType = engine.ContentSourceTypes.find(st => st.Name === 'Entity');
            if (!entitySourceType) return;

            // Get entity sources (filtered if source IDs specified)
            let entitySources = engine.ContentSources.filter(
                cs => UUIDsEqual(cs.ContentSourceTypeID, entitySourceType.ID)
            );

            if (contentSourceIDs && contentSourceIDs.length > 0) {
                entitySources = entitySources.filter(
                    cs => contentSourceIDs.some(id => UUIDsEqual(id, cs.ID))
                );
            }

            if (entitySources.length === 0) return;

            const syncer = new EntityVectorSyncer();
            await syncer.Config(false, params.ContextUser);

            for (const source of entitySources) {
                if (!source.EntityID || !source.EntityDocumentID) continue;

                try {
                    LogStatus(`[AutotagAction] Syncing entity vectors for "${source.Name}" (Entity: ${source.EntityID}, Doc: ${source.EntityDocumentID})`);
                    await syncer.VectorizeEntity(
                        { entityID: source.EntityID, entityDocumentID: source.EntityDocumentID },
                        params.ContextUser
                    );
                    LogStatus(`[AutotagAction] Entity vector sync complete for "${source.Name}"`);
                } catch (syncError) {
                    const msg = syncError instanceof Error ? syncError.message : String(syncError);
                    LogError(`[AutotagAction] Entity vector sync failed for "${source.Name}": ${msg}`);
                    // Non-fatal — continue with other sources
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[AutotagAction] SyncEntitySourceVectors failed: ${msg}`);
        }
    }
}
