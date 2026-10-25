/**
 * @fileoverview {@link EmbedStage} — turning a record's text into a stored vector.
 *
 * Runs over Content Item Chunk, or Content Item directly for the single-chunk case; ready when
 * `EmbeddingStatus = 'Pending'` (or `'MetadataOnly'`). The per-record step only decides the
 * operation; the finalize does the expensive part once per page: one model call and one store call
 * per (embedding model, index).
 *
 * @module @memberjunction/content-pipeline
 */

import { LogError } from '@memberjunction/core';
import { NormalizeUUID, RegisterClass } from '@memberjunction/global';
import { AIEmbeddingRunner } from '@memberjunction/ai-prompts';
import { RecordMetadataValue, VectorRecord } from '@memberjunction/ai-vectordb';
import { KnowledgeHubMetadataEngine, MJContentItemEntity } from '@memberjunction/core-entities';
import {
    ContentVectorInfrastructure,
    ContentVectorMetadataBuilder,
    LoadContentItemTags,
    ResolveContentVectorID,
    ResolveContentVectorStorageConfig,
    ResolvedVectorStorageConfig,
    UpsertVectorRecords,
} from '@memberjunction/content-autotagging';
import {
    BasePipelineStage,
    FinalizeResult,
    Outcome,
    StageContext,
    StageDeclaration,
    StageOutcome,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';
import { IsRouteFailure, OwningItemID, RouteVectorRecords, VectorRoute } from '../VectorRouting.js';

/** The registered name. */
export const EMBED_STAGE = 'Embed';

/** The registered name of the Content Item variant. */
export const EMBED_ITEM_STAGE = 'EmbedContentItem';

/** Which operation a record needs. */
type EmbedOperation = 'Full' | 'MetadataOnly';

/** A record together with where its vector goes. */
interface RoutedRecord {
    Record: WorkingRecord;
    Route: VectorRoute;
}

/**
 * Embeds a page of records and stores them.
 *
 * The operation comes from the record's own hydrated status, never a queued message, so a stale
 * message cannot trigger the wrong one. Where each vector goes is decided per record: a page can
 * hold several organizations' chunks.
 */
export abstract class BaseEmbedStage extends BasePipelineStage {
    public readonly StatusField = 'EmbeddingStatus';

    public override get Declaration(): StageDeclaration {
        return {
            Reads: ['Text', 'Title', 'Modality', 'Decorator'],
            Writes: [],
            ReadsExtensions: [],
            WritesExtensions: [`${EMBED_STAGE}.operation`],
        };
    }

    /** Decide the operation and check there is something to embed; the work waits for {@link Finalize}. */
    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before embedding started');
        }
        const operation = this.operationFor(record);
        if (operation === 'Full' && this.textFor(record).trim().length === 0) {
            // Embedding is text-in: an image with no text would get the vector of '', equally
            // "similar" to every query.
            return Outcome.Skipped(
                this.isNonTextModality(record)
                    ? `'${String(record.Get('Modality'))}' content has no text, and embedding is text-only`
                    : 'no text to embed',
            );
        }
        record.SetExtension(EMBED_STAGE, 'operation', operation);
        return Outcome.Complete();
    }

    /** Route, embed and store the whole page. A record that cannot be routed fails alone. */
    public override async Finalize(records: readonly WorkingRecord[], context: StageContext): Promise<FinalizeResult[]> {
        if (context.IsTest) {
            return records.map((record) => ({ Key: record.Identity.Key, Outcome: Outcome.Complete() }));
        }
        const outcomes: FinalizeResult[] = [];
        const routes = await RouteVectorRecords(records, this.infrastructure(context), context.Provider, context.ContextUser);
        const itemIDs = records.map(OwningItemID).filter((id): id is string => !!id);
        const tags = await LoadContentItemTags(itemIDs, context.Provider, context.ContextUser);

        const groups = new Map<string, RoutedRecord[]>();
        for (const record of records) {
            const route = routes.get(record.Identity.Key) ?? { Error: 'no route was resolved' };
            if (IsRouteFailure(route)) {
                // A misconfigured index or a provider rejecting the record will not change on retry.
                outcomes.push({ Key: record.Identity.Key, Outcome: Outcome.Fatal(route.Error) });
                continue;
            }
            groups.set(route.GroupKey, [...(groups.get(route.GroupKey) ?? []), { Record: record, Route: route }]);
        }

        for (const group of groups.values()) {
            const full = group.filter((r) => this.plannedOperation(r.Record) === 'Full');
            const metadataOnly = group.filter((r) => this.plannedOperation(r.Record) === 'MetadataOnly');
            if (full.length > 0) {
                context.ReportProgress(`embedding ${full.length} record(s) into ${group[0].Route.Infrastructure.indexName}`);
                outcomes.push(...(await this.embedAndStore(full, tags, context)));
            }
            if (metadataOnly.length > 0) {
                context.ReportProgress(`updating metadata for ${metadataOnly.length} record(s)`);
                outcomes.push(...(await this.updateMetadata(metadataOnly, tags, context)));
            }
        }
        return outcomes;
    }

    /** Embed a group in one model call, then store it. */
    private async embedAndStore(group: readonly RoutedRecord[], tags: ReadonlyMap<string, string[]>, context: StageContext): Promise<FinalizeResult[]> {
        const infra = group[0].Route.Infrastructure;
        const embedding = await new AIEmbeddingRunner().RunEmbedding({
            Texts: group.map((r) => this.textFor(r.Record)),
            // Pinned: these vectors are compared against stored ones, so all must come from one model.
            ModelID: infra.embeddingModelID,
            Dimensions: infra.dimensions,
            ContextUser: context.ContextUser,
            Provider: context.Provider,
            Description: 'Content pipeline Embed stage',
        });
        if (!embedding.Success) {
            // The texts are unchanged, so retry rather than fail every record over one call.
            return group.map((r) => ({ Key: r.Record.Identity.Key, Outcome: Outcome.Retry(embedding.ErrorMessage ?? 'embedding failed') }));
        }
        const payload: VectorRecord[] = group.map((r, i) => ({
            id: this.vectorIdFor(r.Record, r.Route.Item),
            values: embedding.Vectors[i],
            metadata: this.BuildVectorMetadata(r.Record, r.Route, this.tagsOf(r, tags), context),
            ...(r.Route.Directives ? { providerTemporaryDirectives: r.Route.Directives } : {}),
        }));
        try {
            const response = await UpsertVectorRecords(payload, infra);
            if (!response.success) {
                throw new Error(response.message || 'the vector store rejected the batch');
            }
        } catch (error) {
            // A failed bulk call says nothing about any one record, so the group fails together.
            const message = error instanceof Error ? error.message : String(error);
            return group.map((r) => ({ Key: r.Record.Identity.Key, Outcome: Outcome.Retry(`vector write failed: ${message}`) }));
        }
        return this.recordReceipts(group, payload, embedding.ModelID ?? infra.embeddingModelID, context);
    }

    /**
     * Replace the stored metadata of vectors whose text has not changed, through the provider's own
     * update (no model call, values untouched). A provider that cannot update in place gets a re-embed.
     */
    private async updateMetadata(group: readonly RoutedRecord[], tags: ReadonlyMap<string, string[]>, context: StageContext): Promise<FinalizeResult[]> {
        const infra = group[0].Route.Infrastructure;
        const updates = group.map((r) => ({
            id: this.vectorIdFor(r.Record, r.Route.Item),
            metadata: this.BuildVectorMetadata(r.Record, r.Route, this.tagsOf(r, tags), context),
            ...(r.Route.Directives ? { providerTemporaryDirectives: r.Route.Directives } : {}),
        }));
        try {
            const response = await infra.vectorDB.UpdateRecords(updates, infra.indexName, infra.providerConfig);
            if (response.success === false) {
                throw new Error(response.message || 'the provider refused the update');
            }
        } catch (error) {
            LogError(
                `EmbedStage: metadata-only update on '${infra.indexName}' was not possible ` +
                    `(${error instanceof Error ? error.message : String(error)}); re-embedding instead.`,
            );
            return this.embedAndStore(group, tags, context);
        }
        return this.recordReceipts(group, updates, null, context);
    }

    /** Record the receipt. Without VectorRecordID nothing can later delete the vector this row produced. */
    private recordReceipts(group: readonly RoutedRecord[], payload: readonly { id: string }[], modelID: string | null, context: StageContext): FinalizeResult[] {
        const now = new Date();
        for (const [i, { Record: record }] of group.entries()) {
            record.SetExtension('Pipeline', 'columns', {
                ...(record.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
                VectorRecordID: payload[i].id,
                LastEmbeddedAt: now,
                ...(modelID ? { EmbeddingModelID: modelID } : {}),
            });
        }
        context.ReportProgress(`stored ${payload.length} vector(s)`);
        return group.map((r) => ({ Key: r.Record.Identity.Key, Outcome: Outcome.Complete() }));
    }

    /**
     * What rides alongside the vector — built by the autotagger's {@link ContentVectorMetadataBuilder}
     * from the source's `VectorMetadata` config, so retrieval cannot tell the two writers apart.
     * Protected so a deployment can subclass the stage and adjust the result.
     */
    protected BuildVectorMetadata(
        record: WorkingRecord,
        route: Pick<VectorRoute, 'Item'>,
        tags: readonly string[],
        context: StageContext,
    ): Record<string, RecordMetadataValue> {
        const isChunk = record.Entity === 'Content Item Chunk';
        return this.metadataBuilder(context).Build(
            {
                Item: route.Item,
                IsItemLevel: !isChunk,
                ChunkID: isChunk ? record.Identity.Key : undefined,
                ChunkIndex: isChunk ? record.GetExtension<number>('Pipeline', 'sequence') : undefined,
                Text: (record.Get('Text') as string | null) ?? undefined,
            },
            tags,
            this.storageConfig(route.Item),
            context.Provider.EntityByName('MJ: Content Items'),
        );
    }

    /**
     * The vector's id: whatever this record was stored under before, so a re-embed replaces its
     * vector; otherwise the same id the autotagger derives for the source's `VectorIDStrategy`.
     */
    private vectorIdFor(record: WorkingRecord, item: MJContentItemEntity): string {
        const stored = record.GetExtension<string>('Pipeline', 'vectorRecordID');
        if (stored) {
            return stored;
        }
        const isChunk = record.Entity === 'Content Item Chunk';
        const sequence = record.GetExtension<number>('Pipeline', 'sequence') ?? 0;
        return ResolveContentVectorID(this.storageConfig(item), item.ID, !isChunk, sequence, record.Identity.Key);
    }

    private storageConfig(item: MJContentItemEntity): ResolvedVectorStorageConfig {
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        return ResolveContentVectorStorageConfig(knowledge.GetContentSourceByID(item.ContentSourceID), knowledge.GetContentTypeByID(item.ContentTypeID));
    }

    private tagsOf(routed: RoutedRecord, tags: ReadonlyMap<string, string[]>): string[] {
        return tags.get(NormalizeUUID(routed.Route.Item.ID)) ?? [];
    }

    /** One builder per stage instance, so a refused declaration is reported once, not per vector. */
    private metadataBuilder(context: StageContext): ContentVectorMetadataBuilder {
        this._metadataBuilder ??= new ContentVectorMetadataBuilder(context.Provider);
        return this._metadataBuilder;
    }
    private _metadataBuilder?: ContentVectorMetadataBuilder;

    /** One resolver per stage instance (a run), so each index's database and credential resolve once. */
    private infrastructure(context: StageContext): ContentVectorInfrastructure {
        this._infrastructure ??= new ContentVectorInfrastructure(context.Provider, context.ContextUser);
        return this._infrastructure;
    }
    private _infrastructure?: ContentVectorInfrastructure;

    /** The text to embed — the decorator first, so a chunk still reads in context. */
    private textFor(record: WorkingRecord): string {
        const text = (record.Get('Text') as string | null) ?? '';
        const decorator = record.Get('Decorator');
        return typeof decorator === 'string' && decorator.length > 0 ? `${decorator}\n\n${text}` : text;
    }

    /**
     * The operation, from the status the record hydrated with. A metadata refresh for a record with
     * no vector yet becomes a full embed: there is nothing stored to update.
     */
    private operationFor(record: WorkingRecord): EmbedOperation {
        const wantsMetadata = record.GetExtension<string>('Pipeline', 'embeddingStatus') === 'MetadataOnly';
        return wantsMetadata && record.GetExtension<string>('Pipeline', 'vectorRecordID') ? 'MetadataOnly' : 'Full';
    }

    /** The operation {@link Run} settled on. */
    private plannedOperation(record: WorkingRecord): EmbedOperation {
        return record.GetExtension<EmbedOperation>(EMBED_STAGE, 'operation') ?? 'Full';
    }

    /** Whether the content is something other than text, as the best-informed stage decided. */
    private isNonTextModality(record: WorkingRecord): boolean {
        const modality = record.Get('Modality');
        return typeof modality === 'string' && modality !== 'text' && modality.length > 0;
    }
}

/** Embed over Content Item Chunk — the usual case, where an item was segmented first. */
@RegisterClass(BasePipelineStage, EMBED_STAGE)
export class EmbedStage extends BaseEmbedStage {
    public readonly Name = EMBED_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item Chunk';
}

/**
 * Embed over Content Item directly, for an item that fits a model's context in one piece. A pipeline
 * runs one or the other; whichever is configured carries the vector.
 */
@RegisterClass(BasePipelineStage, EMBED_ITEM_STAGE)
export class EmbedContentItemStage extends BaseEmbedStage {
    public readonly Name = EMBED_ITEM_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
}
