import { RegisterClass, UUIDsEqual, NormalizeUUID } from "@memberjunction/global";
import { AutotagBase, AutotagProgressCallback } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams } from "../../Engine";
import { IMetadataProvider, UserInfo, Metadata, RunView, LogStatus, LogError, EntityInfo } from "@memberjunction/core";
import {
    MJContentSourceEntity, MJContentItemEntity, MJContentItemTagEntity,
    MJEntityDocumentEntity, MJEntityRecordDocumentEntity,
    MJTemplateEntityExtended, MJContentSourceEntity_IContentSourceConfiguration
} from "@memberjunction/core-entities";

/**
 * Re-export the CodeGen-generated type for convenience within this file.
 * This replaces the manual interface that was needed before CodeGen emitted the typed accessor.
 */
type IContentSourceConfiguration = MJContentSourceEntity_IContentSourceConfiguration;
import { EntityDocumentTemplateParser } from "@memberjunction/ai-vector-sync";
import { TemplateEngineServer } from "@memberjunction/templates";
import { TagEngine, TaxonomyMode } from "@memberjunction/tag-engine";
import { TagScopeContext } from "@memberjunction/tag-engine-base";
import { ScopeContextResolver } from "../../Engine/generic/ScopeContextResolver";
import { RunBudget } from "../../Engine/generic/RunBudget";

/**
 * Autotag provider for MJ entity records. Uses the EntityDocument template pipeline
 * to render records into text, creates EntityRecordDocument snapshots, links them
 * to ContentItems, and feeds the text through the LLM autotagging pipeline.
 *
 * Configuration is driven by ContentSource.EntityID and ContentSource.EntityDocumentID
 * rather than the legacy ContentSourceParam key/value approach.
 */
@RegisterClass(AutotagBase, 'AutotagEntity')
export class AutotagEntity extends AutotagBase {
    private contextUser!: UserInfo;
    private engine!: AutotagBaseEngine;
    protected contentSourceTypeID!: string;

    /** Cached content source configs keyed by normalized source ID for bridge callback */
    private sourceConfigMap = new Map<string, IContentSourceConfiguration>();
    /** Cached content source entities keyed by normalized source ID for ERD lookups */
    private contentSourceMap = new Map<string, MJContentSourceEntity>();
    /** Per-source scope context derived from TagRootID, keyed by normalized source ID */
    private sourceScopeContextMap = new Map<string, TagScopeContext | null>();
    /** Per-source budget tracker, keyed by normalized source ID */
    private sourceBudgetMap = new Map<string, RunBudget>();

    public async Autotag(contextUser: UserInfo, onProgress?: AutotagProgressCallback, contentSourceIDs?: string[], provider?: IMetadataProvider): Promise<number> {
        if (provider) this._provider = provider;
        this.contextUser = contextUser;
        this.engine = AutotagBaseEngine.Instance;
        this.contentSourceTypeID = this.engine.SetSubclassContentSourceType('Entity');

        let contentSources = await this.engine.getAllContentSources(contextUser, this.contentSourceTypeID);

        // Apply source ID filter if specified
        if (contentSourceIDs && contentSourceIDs.length > 0) {
            contentSources = contentSources.filter(s =>
                contentSourceIDs.some(id => UUIDsEqual(id, s.ID))
            );
        }

        // Cache content source configs and set up taxonomy
        await this.SetupTaxonomyAndBridge(contentSources, contextUser);

        const contentItemsToProcess = await this.SetContentItemsToProcess(contentSources);

        // Also pick up previously failed items — ContentItems that exist but have
        // no tags (LLM call failed due to rate limits, network errors, etc.)
        const retryItems = await this.GetUntaggedContentItems(contentSources);
        if (retryItems.length > 0) {
            LogStatus(`AutotagEntity: found ${retryItems.length} previously failed items to retry`);
        }

        // Merge new + retry items, deduplicating by ID
        const seen = new Set(contentItemsToProcess.map(ci => ci.ID));
        for (const item of retryItems) {
            if (!seen.has(item.ID)) {
                contentItemsToProcess.push(item);
                seen.add(item.ID);
            }
        }

        if (contentItemsToProcess.length > 0) {
            await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, contextUser, undefined, undefined, onProgress);
        } else {
            LogStatus('AutotagEntity: no new, modified, or failed entity records to process');
        }

        // Clean up engine state
        this.engine.TaxonomyContext = null;
        this.engine.OnContentItemTagSaved = null;

        return contentItemsToProcess.length;
    }

    /**
     * Initialize the TagEngine, inject taxonomy into the prompt, and set up the
     * bridge callback that links ContentItemTags to formal Tag + TaggedItem records.
     */
    private async SetupTaxonomyAndBridge(
        contentSources: MJContentSourceEntity[],
        contextUser: UserInfo
    ): Promise<void> {
        // Cache source configs for bridge callback — use CodeGen-generated typed accessor
        for (const source of contentSources) {
            const normalizedID = NormalizeUUID(source.ID);
            this.contentSourceMap.set(normalizedID, source);
            const config = source.ConfigurationObject;
            if (config) {
                this.sourceConfigMap.set(normalizedID, config);
            }
        }

        // Initialize TagEngine (loads tags + generates embeddings)
        try {
            await TagEngine.Instance.Config(false, contextUser);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`AutotagEntity: TagEngine initialization failed, taxonomy features disabled: ${msg}`);
            return;
        }

        // Derive scope context + budgets per source — used by the bridge callback.
        let unionScope: TagScopeContext | null = null;
        for (const source of contentSources) {
            const normalizedID = NormalizeUUID(source.ID);
            const ctx = ScopeContextResolver.deriveScopeContext(source);
            this.sourceScopeContextMap.set(normalizedID, ctx);
            unionScope = ScopeContextResolver.union(unionScope, ctx);

            const cfg = source.ConfigurationObject;
            this.sourceBudgetMap.set(normalizedID, new RunBudget({
                MaxItemsPerRun: cfg?.MaxItemsPerRun ?? null,
                MaxNewTagsPerRun: cfg?.MaxNewTagsPerRun ?? null,
                MaxNewTagsPerItem: cfg?.MaxNewTagsPerItem ?? null,
                MaxTokensPerRun: cfg?.MaxTokensPerRun ?? null,
                MaxCostPerRun: cfg?.MaxCostPerRun ?? null,
            }));
        }

        // Inject taxonomy context into the prompt (if any source has ShareTaxonomyWithLLM enabled)
        const shouldShareTaxonomy = Array.from(this.sourceConfigMap.values()).some(
            c => c.ShareTaxonomyWithLLM !== false // default true
        );
        if (shouldShareTaxonomy && TagEngine.Instance.Tags.length > 0) {
            // Determine the narrowest taxonomy root across all sources
            const rootIDs = Array.from(this.sourceConfigMap.values())
                .map(c => c.TagRootID)
                .filter((id): id is string => id != null);
            const taxonomyRoot = rootIDs.length === 1 ? rootIDs[0] : undefined;
            // Apply union of per-source scope contexts so the LLM only sees
            // tags visible in at least one of the running tenants.
            const tree = TagEngine.Instance.GetTaxonomyTree(taxonomyRoot, unionScope ?? undefined);
            // Strip IDs from the tree before injecting into the LLM prompt.
            // The LLM occasionally returns UUIDs as tag names when it sees them.
            this.engine.TaxonomyContext = JSON.stringify(tree, (key, value) => key === 'ID' ? undefined : value, 2);
            const tagsShared = this.countTreeNodes(tree);
            LogStatus(`AutotagEntity: shared ${tagsShared} taxonomy node(s) with the LLM (scope=${unionScope ? 'narrowed' : 'global'}).`);
        }

        // Set up the bridge callback for tag taxonomy linking
        this.engine.OnContentItemTagSaved = async (
            contentItemTag: MJContentItemTagEntity,
            parentTagName: string | null,
            ctxUser: UserInfo
        ) => {
            await this.BridgeContentItemTagToTaxonomy(contentItemTag, parentTagName, ctxUser);
        };

        // Per-batch budget gate — pause the run when any source's budget is exceeded.
        // Tally items per source first so MaxItemsPerRun ticks; then check all budgets.
        this.engine.OnAfterBatch = async (batch, _totalProcessed) => {
            const perSourceCounts = new Map<string, number>();
            for (const item of batch) {
                if (!item.ContentSourceID) continue;
                const id = NormalizeUUID(item.ContentSourceID);
                perSourceCounts.set(id, (perSourceCounts.get(id) ?? 0) + 1);
            }
            for (const [id, count] of perSourceCounts) {
                const budget = this.sourceBudgetMap.get(id);
                if (!budget) continue;
                budget.recordItemsProcessed(count);
                const verdict = budget.checkBudgets();
                if (!verdict.ok) {
                    return { continue: false, reason: `${verdict.reason}: ${verdict.details ?? ''}` };
                }
            }
            return { continue: true };
        };
    }

    /**
     * Bridge a ContentItemTag to the formal MJ Tag taxonomy.
     * Uses TagEngine.ResolveTag() for semantic matching with mode/threshold from source config.
     * Creates a TaggedItem linking the resolved Tag to the source entity record.
     */
    private async BridgeContentItemTagToTaxonomy(
        contentItemTag: MJContentItemTagEntity,
        parentTagName: string | null,
        contextUser: UserInfo
    ): Promise<void> {
        // Find the source config for this content item
        const rv = new RunView();
        const ciResult = await rv.RunView<{ ID: string; ContentSourceID: string; EntityRecordDocumentID: string | null }>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `ID='${contentItemTag.ItemID}'`,
            Fields: ['ID', 'ContentSourceID', 'EntityRecordDocumentID'],
            ResultType: 'simple',
            MaxRows: 1
        }, contextUser);

        if (!ciResult.Success || ciResult.Results.length === 0) return;
        const ci = ciResult.Results[0];
        const erdID = ci.EntityRecordDocumentID;
        if (!erdID) return; // not entity-sourced

        const sourceID = ci.ContentSourceID;
        const normalizedSourceID = NormalizeUUID(sourceID);
        const config = this.sourceConfigMap.get(normalizedSourceID);
        const mode = (config?.TagTaxonomyMode ?? 'auto-grow') as TaxonomyMode;
        const rootID = config?.TagRootID ?? null;
        const threshold = config?.TagMatchThreshold ?? 0.9;
        const suggestThreshold = config?.SuggestThreshold;
        const scopeContext = this.sourceScopeContextMap.get(normalizedSourceID) ?? null;
        const budget = this.sourceBudgetMap.get(normalizedSourceID);

        // Per-item budget — when exhausted, route remaining new tags from
        // this item to the suggestion queue with reason 'MaxItemTagsExceeded'
        // instead of creating them.
        const itemBudgetExhausted = budget?.itemTagBudgetExhausted() ?? false;
        const effectiveMode: TaxonomyMode = itemBudgetExhausted && (mode === 'auto-grow' || mode === 'free-flow')
            ? 'hybrid'
            : mode;

        // If parent tag is suggested by LLM, resolve it through the mutex too
        // to prevent duplicate parent tags from concurrent batch processing.
        // ResolveTag handles find-or-create atomically.
        if (parentTagName && effectiveMode !== 'constrained') {
            await TagEngine.Instance.ResolveTag(
                parentTagName, 0, effectiveMode, rootID, threshold, contextUser, {
                    scopeContext,
                    suggestThreshold,
                    sourceContentItemID: contentItemTag.ItemID,
                    sourceContentSourceID: sourceID,
                    onTagCreated: () => budget?.recordTagCreated(),
                }
            );
        }

        // Resolve the tag to a formal Tag record
        const formalTag = await TagEngine.Instance.ResolveTag(
            contentItemTag.Tag,
            contentItemTag.Weight,
            effectiveMode,
            rootID,
            threshold,
            contextUser,
            {
                scopeContext,
                suggestThreshold,
                sourceContentItemID: contentItemTag.ItemID,
                sourceContentSourceID: sourceID,
                sourceText: contentItemTag.Tag,
                onTagCreated: () => budget?.recordTagCreated(),
            }
        );

        if (!formalTag) return; // constrained / hybrid / governance-blocked / suggestion enqueued

        // Link ContentItemTag to formal Tag
        contentItemTag.TagID = formalTag.ID;
        await contentItemTag.Save();

        // Load ERD to get source entity info
        const erdResult = await rv.RunView<{ ID: string; EntityID: string; RecordID: string }>({
            EntityName: 'MJ: Entity Record Documents',
            ExtraFilter: `ID='${erdID}'`,
            Fields: ['ID', 'EntityID', 'RecordID'],
            ResultType: 'simple',
            MaxRows: 1
        }, contextUser);

        if (!erdResult.Success || erdResult.Results.length === 0) return;
        const erd = erdResult.Results[0];

        // Create TaggedItem linking formal Tag to source entity record
        await TagEngine.Instance.CreateTaggedItem(
            formalTag.ID,
            erd.EntityID,
            erd.RecordID,
            contentItemTag.Weight,
            contextUser
        );
    }

    /**
     * Count nodes in a TagTreeNode forest (recursive). Used for telemetry on
     * how much taxonomy was shared with the LLM after scope filtering.
     */
    private countTreeNodes(forest: { Children?: unknown[] }[]): number {
        let count = 0;
        const stack: Array<{ Children?: unknown[] }> = [...forest];
        while (stack.length > 0) {
            const node = stack.pop()!;
            count++;
            if (Array.isArray(node.Children)) {
                for (const child of node.Children as Array<{ Children?: unknown[] }>) {
                    stack.push(child);
                }
            }
        }
        return count;
    }

    /**
     * Public accessor used by the autotag engine's per-batch pause loop —
     * returns the budget for the supplied source if known.
     */
    public GetRunBudget(sourceID: string): RunBudget | undefined {
        return this.sourceBudgetMap.get(NormalizeUUID(sourceID));
    }

    /**
     * Mark the start of processing a new ContentItem so per-item budget
     * counters reset. Called by the engine's per-item loop.
     */
    public StartContentItem(sourceID: string): void {
        this.sourceBudgetMap.get(NormalizeUUID(sourceID))?.startItem();
    }

    /**
     * Find ContentItems that exist for these sources but have no ContentItemTag records.
     * These are items where the LLM tagging failed on a previous run (rate limits, network errors, etc.).
     */
    private async GetUntaggedContentItems(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]> {
        if (contentSources.length === 0) return [];

        const sourceIDs = contentSources.map(s => `'${s.ID}'`).join(',');
        const rv = new RunView();
        const result = await rv.RunView<MJContentItemEntity>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `ContentSourceID IN (${sourceIDs}) AND NOT EXISTS (SELECT 1 FROM [__mj].vwContentItemTags cit WHERE cit.ItemID = [__mj].vwContentItems.ID)`,
            ResultType: 'entity_object'
        }, this.contextUser);

        if (result.Success) {
            return result.Results;
        }
        return [];
    }

    public async SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]> {
        const contentItemsToProcess: MJContentItemEntity[] = [];

        for (const contentSource of contentSources) {
            try {
                const items = await this.ProcessContentSource(contentSource);
                contentItemsToProcess.push(...items);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`AutotagEntity: failed to process content source "${contentSource.Name}": ${msg}`);
            }
        }

        return contentItemsToProcess;
    }

    /**
     * Process a single entity-type ContentSource: load entity records modified since last run,
     * render via EntityDocument template, create/update ERD and ContentItem records.
     */
    private async ProcessContentSource(contentSource: MJContentSourceEntity): Promise<MJContentItemEntity[]> {
        const entityID = contentSource.EntityID;
        const entityDocumentID = contentSource.EntityDocumentID;

        if (!entityID || !entityDocumentID) {
            LogError(`AutotagEntity: content source "${contentSource.Name}" is missing EntityID or EntityDocumentID`);
            return [];
        }

        // Load the EntityDocument
        const entityDocument = await this.LoadEntityDocument(entityDocumentID);
        if (!entityDocument) {
            LogError(`AutotagEntity: EntityDocument ${entityDocumentID} not found for source "${contentSource.Name}"`);
            return [];
        }

        const templateText = await this.GetTemplateText(entityDocument);
        if (!templateText) {
            LogError(`AutotagEntity: no template content found for EntityDocument "${entityDocument.Name}"`);
            return [];
        }

        // Resolve the entity name from metadata
        const md = this.ProviderToUse;
        const entityInfo = md.EntityByID(entityID);
        if (!entityInfo) {
            LogError(`AutotagEntity: entity with ID ${entityID} not found in metadata`);
            return [];
        }

        // Get records modified since last run
        const lastRunDate = await this.engine.getContentSourceLastRunDate(contentSource.ID, this.contextUser);
        const modifiedRecords = await this.GetModifiedRecords(entityInfo.Name, lastRunDate);

        if (modifiedRecords.length === 0) {
            LogStatus(`AutotagEntity: no modified records for entity "${entityInfo.Name}" since ${lastRunDate.toISOString()}`);
            return [];
        }

        LogStatus(`AutotagEntity: processing ${modifiedRecords.length} modified records for entity "${entityInfo.Name}"`);

        // Load existing ERD records for this entity document to enable upsert
        const existingERDs = await this.LoadExistingERDs(entityDocumentID, entityID);

        // Load existing ContentItems for this source to enable upsert
        const existingContentItems = await this.LoadExistingContentItems(contentSource.ID);

        // Process each record: render template → create/update ERD → create/update ContentItem
        const contentItems: MJContentItemEntity[] = [];
        const parser = EntityDocumentTemplateParser.CreateInstance();
        const pkFieldName = entityInfo.FirstPrimaryKey.Name;

        for (const record of modifiedRecords) {
            const recordID = String(record[pkFieldName] ?? '');
            try {
                const recordName = this.buildContentItemName(entityInfo, record);
                const contentItem = await this.ProcessSingleRecord(
                    record, recordID, recordName, contentSource, entityDocument,
                    templateText, parser, existingERDs, existingContentItems
                );
                if (contentItem) {
                    contentItems.push(contentItem);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`AutotagEntity: failed to process record ${recordID} for entity "${entityInfo.Name}": ${msg}`);
            }
        }

        return contentItems;
    }

    /**
     * Build the Content Item name for an entity record from the entity's name
     * field(s). Uses every `IsNameField` in Sequence order (e.g. FirstName +
     * LastName → "Sarah Chen"), falling back to the single `NameField`, then a
     * literal `Name` column, then empty. Prevents Content Items from inheriting a
     * generic/LLM-derived title when the source entity has a real name field.
     */
    private buildContentItemName(entityInfo: EntityInfo, record: Record<string, unknown>): string {
        const val = (fieldName: string | undefined): string => {
            if (!fieldName) return '';
            const v = record[fieldName];
            return v == null ? '' : String(v).trim();
        };

        // Combine all IsNameField fields in Sequence order.
        const nameFields = entityInfo.Fields
            .filter(f => f.IsNameField)
            .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));
        if (nameFields.length > 0) {
            const parts = nameFields.map(f => val(f.Name)).filter(p => p.length > 0);
            if (parts.length > 0) return parts.join(' ');
        }

        // Single NameField fallback, then a literal Name column.
        const single = val(entityInfo.NameField?.Name);
        if (single) return single;
        return val('Name');
    }

    /**
     * Load an EntityDocument by ID using RunView.
     */
    private async LoadEntityDocument(entityDocumentID: string): Promise<MJEntityDocumentEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<MJEntityDocumentEntity>({
            EntityName: 'MJ: Entity Documents',
            ExtraFilter: `ID='${entityDocumentID}'`,
            ResultType: 'entity_object',
            MaxRows: 1
        }, this.contextUser);

        if (result.Success && result.Results.length > 0) {
            return result.Results[0];
        }
        return null;
    }

    /**
     * Retrieves the template text from the EntityDocument's linked Template.
     * Ensures TemplateEngineServer is configured before accessing Templates.
     */
    private async GetTemplateText(entityDocument: MJEntityDocumentEntity): Promise<string | null> {
        if (!entityDocument.TemplateID) return null;

        // Ensure engine is loaded (no-op if already configured)
        await TemplateEngineServer.Instance.Config(false, this.contextUser);

        const template = TemplateEngineServer.Instance.Templates.find(
            (t: MJTemplateEntityExtended) => UUIDsEqual(t.ID, entityDocument.TemplateID)
        );
        if (!template || template.Content.length === 0) {
            return null;
        }
        return template.Content[0].TemplateText;
    }

    /**
     * Query entity records modified since lastRunDate using __mj_UpdatedAt.
     */
    private async GetModifiedRecords(entityName: string, lastRunDate: Date): Promise<Record<string, unknown>[]> {
        const rv = new RunView();
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: entityName,
            ExtraFilter: `__mj_UpdatedAt > '${lastRunDate.toISOString()}'`,
            ResultType: 'simple'
        }, this.contextUser);

        if (result.Success) {
            return result.Results;
        }
        return [];
    }

    /**
     * Load existing EntityRecordDocument records for this entity document,
     * keyed by normalized RecordID for fast lookup.
     */
    private async LoadExistingERDs(
        entityDocumentID: string,
        entityID: string
    ): Promise<Map<string, MJEntityRecordDocumentEntity>> {
        const rv = new RunView();
        const result = await rv.RunView<MJEntityRecordDocumentEntity>({
            EntityName: 'MJ: Entity Record Documents',
            ExtraFilter: `EntityDocumentID='${entityDocumentID}' AND EntityID='${entityID}'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        const map = new Map<string, MJEntityRecordDocumentEntity>();
        if (result.Success) {
            for (const erd of result.Results) {
                map.set(erd.RecordID, erd);
            }
        }
        return map;
    }

    /**
     * Load existing ContentItems for this content source, keyed by normalized
     * EntityRecordDocumentID for fast lookup during upsert.
     */
    private async LoadExistingContentItems(
        contentSourceID: string
    ): Promise<Map<string, MJContentItemEntity>> {
        const rv = new RunView();
        const result = await rv.RunView<MJContentItemEntity>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `ContentSourceID='${contentSourceID}'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        const map = new Map<string, MJContentItemEntity>();
        if (result.Success) {
            for (const ci of result.Results) {
                if (ci.EntityRecordDocumentID) {
                    map.set(NormalizeUUID(ci.EntityRecordDocumentID), ci);
                }
            }
        }
        return map;
    }

    /**
     * Process a single entity record: render template, create/update ERD, create/update ContentItem.
     */
    private async ProcessSingleRecord(
        record: Record<string, unknown>,
        recordID: string,
        recordName: string,
        contentSource: MJContentSourceEntity,
        entityDocument: MJEntityDocumentEntity,
        templateText: string,
        parser: EntityDocumentTemplateParser,
        existingERDs: Map<string, MJEntityRecordDocumentEntity>,
        existingContentItems: Map<string, MJContentItemEntity>
    ): Promise<MJContentItemEntity | null> {
        const entityID = contentSource.EntityID!;

        // 1. Render the template for this record
        const renderedText = await parser.Parse(templateText, entityID, record, this.contextUser);

        if (!renderedText || renderedText.trim().length === 0) {
            LogStatus(`AutotagEntity: empty rendered text for record ${recordID}, skipping`);
            return null;
        }

        // 2. Create or update EntityRecordDocument
        const erd = await this.UpsertEntityRecordDocument(
            entityID, recordID, entityDocument, renderedText, existingERDs
        );

        // 3. Compute checksum to detect content changes
        const checksum = await this.engine.getChecksumFromText(renderedText);

        // 4. Create or update ContentItem linked to ERD
        const contentItem = await this.UpsertContentItem(
            contentSource, erd, renderedText, checksum, record, recordName, existingContentItems
        );

        return contentItem;
    }

    /**
     * Create or update an EntityRecordDocument snapshot.
     */
    private async UpsertEntityRecordDocument(
        entityID: string,
        recordID: string,
        entityDocument: MJEntityDocumentEntity,
        documentText: string,
        existingERDs: Map<string, MJEntityRecordDocumentEntity>
    ): Promise<MJEntityRecordDocumentEntity> {
        const md = this.ProviderToUse;
        let erd = existingERDs.get(recordID);

        if (erd) {
            // Update existing
            erd.DocumentText = documentText;
            erd.EntityRecordUpdatedAt = new Date();
        } else {
            // Create new
            erd = await md.GetEntityObject<MJEntityRecordDocumentEntity>('MJ: Entity Record Documents', this.contextUser);
            erd.NewRecord();
            erd.EntityID = entityID;
            erd.RecordID = recordID;
            erd.EntityDocumentID = entityDocument.ID;
            erd.DocumentText = documentText;
            erd.VectorIndexID = entityDocument.VectorIndexID;
            erd.EntityRecordUpdatedAt = new Date();
        }

        const saved = await erd.Save();
        if (!saved) {
            throw new Error(`Failed to save EntityRecordDocument for record ${recordID}`);
        }

        // Update cache for subsequent lookups in this batch
        existingERDs.set(recordID, erd);
        return erd;
    }

    /**
     * Create or update a ContentItem linked to the EntityRecordDocument.
     * Only creates a new ContentItem if the checksum changed (content actually changed)
     * or if no ContentItem exists yet for this ERD.
     */
    private async UpsertContentItem(
        contentSource: MJContentSourceEntity,
        erd: MJEntityRecordDocumentEntity,
        text: string,
        checksum: string,
        record: Record<string, unknown>,
        recordName: string,
        existingContentItems: Map<string, MJContentItemEntity>
    ): Promise<MJContentItemEntity | null> {
        const md = this.ProviderToUse;
        const erdNormalizedID = NormalizeUUID(erd.ID);
        const existing = existingContentItems.get(erdNormalizedID);

        // If content hasn't changed, skip
        if (existing && existing.Checksum === checksum) {
            return null;
        }

        const contentSourceParams: ContentSourceParams = {
            contentSourceID: contentSource.ID,
            name: contentSource.Name ?? '',
            ContentTypeID: contentSource.ContentTypeID,
            ContentFileTypeID: contentSource.ContentFileTypeID,
            ContentSourceTypeID: contentSource.ContentSourceTypeID,
            URL: contentSource.URL
        };

        let contentItem: MJContentItemEntity;
        if (existing) {
            // Update existing content item
            contentItem = existing;
        } else {
            // Create new content item
            contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
            contentItem.NewRecord();
            contentItem.ContentSourceID = contentSourceParams.contentSourceID;
            contentItem.ContentTypeID = contentSourceParams.ContentTypeID;
            contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID;
            contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID;
            contentItem.URL = contentSourceParams.URL;
        }

        // Set/update fields. Prefer the entity's name-field value(s) (computed by
        // buildContentItemName); fall back to the content source name only when the
        // record has no usable name. This keeps Content Item names like "GPT-4"
        // instead of inheriting a generic/LLM-derived title.
        contentItem.Name = recordName && recordName.length > 0 ? recordName : contentSourceParams.name;
        contentItem.Description = this.engine.GetContentItemDescription(contentSourceParams);
        contentItem.Text = text;
        contentItem.Checksum = checksum;
        contentItem.EntityRecordDocumentID = erd.ID;

        const saved = await contentItem.Save();
        if (!saved) {
            throw new Error(`Failed to save ContentItem for ERD ${erd.ID}`);
        }

        // Update cache
        existingContentItems.set(erdNormalizedID, contentItem);
        return contentItem;
    }
}
