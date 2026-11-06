/**
 * @fileoverview {@link TagStage} — deciding what a record is about.
 *
 * Runs over Content Item; ready when `TaggingStatus = 'Pending'`. Classification itself is
 * delegated to a registered {@link BaseContentClassifier} resolved through the pipeline's unified
 * precedence (`Item override → Run Configuration → Content Source → Content Source Type / Content Type → 'ManagedPrompt'`),
 * and saves the result to `MJ: Content Item Tags`, promoting each new keyword into the governed
 * taxonomy through the tag engine's bridge.
 *
 * @module @memberjunction/content-pipeline
 */

import { LogError, RunView } from '@memberjunction/core';
import { ContentItemTagBridge } from '@memberjunction/tag-engine';
import {
    KnowledgeHubMetadataEngine,
    MJContentItemAttributeEntity,
    MJContentItemChunkEntity,
    MJContentItemTagEntity,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseContentClassifier,
    BasePipelineStage,
    ClassifiedTag,
    ClassifyResult,
    FatalStageError,
    Outcome,
    StageContext,
    StageDeclaration,
    StageOutcome,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';
import { MANAGED_PROMPT_CLASSIFIER, ManagedPromptClassifier } from '../ManagedPromptClassifier.js';
import { WhereEqual } from '../Filters.js';

void ManagedPromptClassifier;

/** The registered name. */
export const TAG_STAGE = 'Tag';

/** Classifies a record. Independent of Segment: both read the same text, in either order. */
@RegisterClass(BasePipelineStage, TAG_STAGE)
export class TagStage extends BasePipelineStage {
    public readonly Name = TAG_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'TaggingStatus';

    public override get Declaration(): StageDeclaration {
        return {
            Reads: ['Text', 'Title'],
            Writes: [],
            ReadsExtensions: ['Pipeline.contentSourceID', 'Pipeline.classifierKeyOverride'],
            WritesExtensions: [`${TAG_STAGE}.tags`, `${TAG_STAGE}.classifierKey`],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before tagging started');
        }
        const text = record.Get('Text');
        if (typeof text !== 'string' || text.trim().length === 0) {
            return Outcome.Skipped('no text to classify');
        }

        const classifier = await this.resolveClassifier(record, context);
        const result = await this.classify(classifier, record, text, context);
        record.SetExtension(TAG_STAGE, 'tags', result.Tags);
        record.SetExtension(TAG_STAGE, 'classifierKey', classifier.Key);
        for (const [key, value] of Object.entries(result.Extensions ?? {})) {
            record.SetExtension(`${TAG_STAGE}.${classifier.Key}`, key, value);
        }
        if (result.Tags.length === 0) {
            // Nothing concluded is not "no tags apply": replacing the item's tags with an empty set
            // would wipe good tags whenever a model call came back thin.
            const why = result.IsValidContent !== false ? 'returned no tags' : 'judged this not to be the configured content type';
            return Outcome.Skipped(`${classifier.Key} ${why}; existing tags kept`);
        }

        const changes = await this.persistTags(record, result, context);
        await this.persistAttributes(record, result, context);
        if (changes.Changed) {
            // Tags ride in the vector's metadata; an embedded record needs that refreshed, not re-embedded.
            await this.flagMetadataRefresh(record, context);
        }
        context.ReportProgress(`classified into ${result.Tags.length} tag(s)`);
        return Outcome.Complete(
            `${result.Tags.length} tag(s) via ${classifier.Key}: ${changes.Added} added, ${changes.Removed} removed`,
        );
    }

    /** Run the classifier; a failure reached a model or a service, so it is retried unless it says it is fatal. */
    private async classify(
        classifier: BaseContentClassifier,
        record: WorkingRecord,
        text: string,
        context: StageContext,
    ): Promise<ClassifyResult> {
        try {
            return await classifier.Classify({
                Text: text,
                Title: (record.Get('Title') as string | null) ?? null,
                RecordID: record.Identity.RecordID,
                ContentSourceID: record.GetExtension<string>('Pipeline', 'contentSourceID') ?? null,
                Parameters: (context.Configuration.Parameters as Record<string, string>) ?? {},
                ContextUser: context.ContextUser,
                Provider: context.Provider,
                Signal: context.Signal,
                ReportProgress: (m) => context.ReportProgress(m),
            });
        } catch (error) {
            if (error instanceof FatalStageError) {
                throw error;
            }
            throw new TransientStageError(
                `Classifying with '${classifier.Key}' failed: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
            );
        }
    }

    /**
     * Unified precedence order:
     * Item override → Run `Configuration.ClassifierKey` → Content Source `Configuration.ClassifierKey` →
     * Content Source Type / Content Type `Configuration.ClassifierKey` → `'ManagedPrompt'`.
     */
    private async resolveClassifier(record: WorkingRecord, context: StageContext): Promise<BaseContentClassifier> {
        const key = await this.classifierKey(record, context);
        const classifier = BaseContentClassifier.Resolve(key);
        if (!classifier) {
            throw new FatalStageError(
                `Classifier '${key}' is not registered. Check that the package registering it has been loaded.`,
            );
        }
        return classifier;
    }

    private async classifierKey(record: WorkingRecord, context: StageContext): Promise<string> {
        const itemColumns = record.GetExtension<Record<string, unknown>>('Pipeline', 'columns');
        const fromItem =
            itemColumns?.ClassifierKeyOverride ??
            record.GetExtension<string>('Pipeline', 'classifierKeyOverride') ??
            record.GetExtension<string>(TAG_STAGE, 'classifierKeyOverride');
        if (typeof fromItem === 'string' && fromItem.trim().length > 0) {
            return fromItem.trim();
        }
        const fromRun = context.Configuration.ClassifierKey;
        if (typeof fromRun === 'string' && fromRun.trim().length > 0) {
            return fromRun.trim();
        }
        const contentSourceID = record.GetExtension<string>('Pipeline', 'contentSourceID');
        if (contentSourceID) {
            return (await this.sourceClassifierKey(contentSourceID, context)) ?? MANAGED_PROMPT_CLASSIFIER;
        }
        return MANAGED_PROMPT_CLASSIFIER;
    }

    private async sourceClassifierKey(contentSourceID: string, context: StageContext): Promise<string | null> {
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        await knowledge.Config(false, context.ContextUser, context.Provider);
        let source = knowledge.GetContentSourceByID(contentSourceID);
        if (!source) {
            await knowledge.Config(true, context.ContextUser, context.Provider);
            source = knowledge.GetContentSourceByID(contentSourceID);
        }
        const sourceConfig = source?.ConfigurationObject as Record<string, unknown> | undefined;
        const sourceSettings = (sourceConfig?.SourceSpecificConfiguration as Record<string, unknown> | undefined) ?? {};
        const fromSource = sourceConfig?.ClassifierKey ?? sourceSettings.ClassifierKey;
        if (typeof fromSource === 'string' && fromSource.trim().length > 0) {
            return fromSource.trim();
        }
        const contentType = source?.ContentTypeID ? knowledge.GetContentTypeByID(source.ContentTypeID) : undefined;
        const fromContentType = (
            contentType as unknown as { ConfigurationObject?: Record<string, unknown> } | undefined
        )?.ConfigurationObject?.ClassifierKey;
        if (typeof fromContentType === 'string' && fromContentType.trim().length > 0) {
            return fromContentType.trim();
        }
        const sourceType = source?.ContentSourceTypeID
            ? knowledge.GetContentSourceTypeByID(source.ContentSourceTypeID)
            : undefined;
        const fromSourceType = (sourceType?.ConfigurationObject as Record<string, unknown> | undefined)?.ClassifierKey;
        return typeof fromSourceType === 'string' && fromSourceType.trim().length > 0 ? fromSourceType.trim() : null;
    }

    /**
     * Make `MJ: Content Item Tags` match the classification. A diff, not delete-then-insert: a
     * surviving tag keeps its row and its taxonomy link. A tag that fails to save is logged rather
     * than failing the record — not worth re-running the model call that produced the rest.
     */
    private async persistTags(
        record: WorkingRecord,
        result: ClassifyResult,
        context: StageContext,
    ): Promise<{ Changed: boolean; Added: number; Removed: number }> {
        const itemID = record.Identity.RecordID;
        if (!itemID || context.IsTest) {
            // A test run computes everything and commits nothing.
            return { Changed: false, Added: 0, Removed: 0 };
        }
        const existing = await this.existingTags(itemID, context);
        const wanted = new Map(result.Tags.map((tag) => [tag.Name.trim().toLowerCase(), tag]));

        let added = 0;
        const bridge = new ContentItemTagBridge(context.Provider);
        for (const [name, tag] of wanted) {
            const kept = existing.get(name);
            const weight = this.weightOf(tag);
            if (kept) {
                if (weight !== null && kept.Weight !== weight) {
                    kept.Weight = weight;
                    await this.save(kept, itemID);
                }
                continue;
            }
            const entity = await this.newTag(itemID, tag, result.PromptRunID ?? null, context);
            if (await this.save(entity, itemID)) {
                added++;
                await bridge.Bridge(entity, tag.Parent ?? null, context.ContextUser);
            }
        }

        let removed = 0;
        for (const [name, row] of existing) {
            if (!wanted.has(name)) {
                if (await row.Delete()) {
                    removed++;
                } else {
                    LogError(
                        `TagStage: failed to delete Content Item Tag '${row.Tag}' for '${itemID}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    );
                }
            }
        }
        return { Changed: added > 0 || removed > 0, Added: added, Removed: removed };
    }

    /** A new tag row, with the prompt run that produced it and the model's reasoning, as the autotagger records them. */
    private async newTag(
        itemID: string,
        tag: ClassifiedTag,
        promptRunID: string | null,
        context: StageContext,
    ): Promise<MJContentItemTagEntity> {
        const entity = await context.Provider.GetEntityObject<MJContentItemTagEntity>(
            'MJ: Content Item Tags',
            context.ContextUser,
        );
        entity.NewRecord();
        entity.ItemID = itemID;
        entity.Tag = tag.Name;
        const weight = this.weightOf(tag);
        if (weight !== null) {
            entity.Weight = weight;
        }
        if (promptRunID) {
            entity.AIPromptRunID = promptRunID;
        }
        if (tag.Reasoning) {
            entity.Reasoning = tag.Reasoning;
        }
        return entity;
    }

    private weightOf(tag: ClassifiedTag): number | null {
        return typeof tag.Score === 'number' ? Math.max(0, Math.min(1, tag.Score)) : null;
    }

    private async save(tag: MJContentItemTagEntity, itemID: string): Promise<boolean> {
        const saved = await tag.Save();
        if (!saved) {
            LogError(
                `TagStage: could not save tag '${tag.Tag}' for content item '${itemID}': ${tag.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return saved;
    }

    /** The item's current tags, by lower-cased name. */
    private async existingTags(itemID: string, context: StageContext): Promise<Map<string, MJContentItemTagEntity>> {
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJContentItemTagEntity>(
            { EntityName: 'MJ: Content Item Tags', ExtraFilter: WhereEqual({ ItemID: itemID }), ResultType: 'entity_object' },
            context.ContextUser,
        );
        if (!result.Success) {
            // Without knowing what is there, a diff would delete nothing and duplicate everything.
            throw new TransientStageError(`Reading the existing tags for '${itemID}' failed: ${result.ErrorMessage}`);
        }
        return new Map(result.Results.map((row) => [row.Tag.trim().toLowerCase(), row]));
    }

    /** Upsert any custom Content Type Attributes returned by the classifier in `Extensions.attributes`. */
    private async persistAttributes(record: WorkingRecord, result: ClassifyResult, context: StageContext): Promise<void> {
        const itemID = record.Identity.RecordID;
        const rawAttributes = result.Extensions?.attributes;
        if (!itemID || context.IsTest || !rawAttributes || typeof rawAttributes !== 'object') {
            return;
        }
        const entries = Object.entries(rawAttributes as Record<string, unknown>).filter(
            ([key, val]) => key.trim().length > 0 && val != null,
        );
        if (entries.length === 0) {
            return;
        }
        const existing = await this.existingAttributes(itemID, context);
        for (const [name, rawValue] of entries) {
            const value = typeof rawValue === 'string' ? rawValue : String(rawValue);
            const current = existing.get(name.trim().toLowerCase());
            if (current) {
                if (current.Value !== value) {
                    current.Value = value;
                    await this.saveAttribute(current, itemID);
                }
                continue;
            }
            const attr = await context.Provider.GetEntityObject<MJContentItemAttributeEntity>(
                'MJ: Content Item Attributes',
                context.ContextUser,
            );
            attr.NewRecord();
            attr.ContentItemID = itemID;
            attr.Name = name.trim();
            attr.Value = value;
            await this.saveAttribute(attr, itemID);
        }
    }

    private async existingAttributes(
        itemID: string,
        context: StageContext,
    ): Promise<Map<string, MJContentItemAttributeEntity>> {
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJContentItemAttributeEntity>(
            {
                EntityName: 'MJ: Content Item Attributes',
                ExtraFilter: WhereEqual({ ContentItemID: itemID }),
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );
        if (!result.Success) {
            throw new TransientStageError(
                `Reading the existing attributes for '${itemID}' failed: ${result.ErrorMessage}`,
            );
        }
        return new Map(result.Results.map((row) => [row.Name.trim().toLowerCase(), row]));
    }

    private async saveAttribute(attribute: MJContentItemAttributeEntity, itemID: string): Promise<boolean> {
        const saved = await attribute.Save();
        if (!saved) {
            LogError(
                `TagStage: could not save attribute '${attribute.Name}' for content item '${itemID}': ${attribute.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return saved;
    }

    /**
     * Ask Embed to refresh the stored metadata of everything already embedded for this item. Only
     * where embedding is `Complete`: a Pending record gets the new tags anyway, a Failed one has no
     * vector. The item's status rides on its commit; its chunks are written here.
     */
    private async flagMetadataRefresh(record: WorkingRecord, context: StageContext): Promise<void> {
        if (record.GetExtension<string>('Pipeline', 'embeddingStatus') === 'Complete') {
            record.SetExtension('Pipeline', 'columns', {
                ...(record.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
                EmbeddingStatus: 'MetadataOnly',
            });
        }
        const itemID = record.Identity.RecordID;
        if (!itemID) {
            return;
        }
        const chunks = await RunView.FromMetadataProvider(context.Provider).RunView<MJContentItemChunkEntity>(
            {
                EntityName: 'MJ: Content Item Chunks',
                ExtraFilter: WhereEqual({ ContentItemID: itemID, EmbeddingStatus: 'Complete', DeleteStatus: null }),
                ResultType: 'entity_object',
            },
            context.ContextUser,
        );
        if (!chunks.Success) {
            LogError(`TagStage: could not flag the chunks of '${itemID}' for a metadata refresh: ${chunks.ErrorMessage}`);
            return;
        }
        for (const chunk of chunks.Results) {
            chunk.EmbeddingStatus = 'MetadataOnly';
            if (!(await chunk.Save())) {
                LogError(`TagStage: could not flag chunk '${chunk.ID}' for a metadata refresh`);
            }
        }
    }
}
