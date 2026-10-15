/**
 * @fileoverview {@link EmbedStage} — turning a record's text into a stored vector.
 *
 * Runs over Content Item Chunk, or Content Item directly for the single-chunk case; ready when
 * `EmbeddingStatus = 'Pending'` (or `'MetadataOnly'`). The per-record step is deliberately light —
 * decide the operation and check there is something to embed — and the finalize does the expensive
 * part once per page: one model call per index, one store call per index.
 *
 * @module @memberjunction/content-pipeline
 */

import { LogError, RunView } from '@memberjunction/core';
import { NormalizeUUID, RegisterClass } from '@memberjunction/global';
import { AIEmbeddingRunner } from '@memberjunction/ai-prompts';
import { RecordMetadataValue } from '@memberjunction/ai-vectordb';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { ContentVectorMetadataBuilder, ResolveContentVectorStorageConfig } from '@memberjunction/content-autotagging';
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
import { IsRouteFailure, OwningItemID, VectorRecordRouter, VectorRoute } from '../VectorRouting.js';
import { WhereAnyOf } from '../Filters.js';

/** The registered name. */
export const EMBED_STAGE = 'Embed';

/** The registered name of the Content Item variant. */
export const EMBED_ITEM_STAGE = 'EmbedContentItem';

/** Which operation a record needs. */
type EmbedOperation = 'Full' | 'MetadataOnly';

/** One vector's worth of payload. */
interface VectorPayload {
    id: string;
    values: number[];
    metadata: Record<string, RecordMetadataValue>;
    providerTemporaryDirectives?: Record<string, unknown>;
}

/** A record together with where its vector goes. */
interface RoutedRecord {
    Record: WorkingRecord;
    Route: VectorRoute;
}

/**
 * Embeds a page of records and stores them.
 *
 * Which operation a record gets is decided by **its own hydrated status**, never by anything in a
 * queued message — so a stale message cannot trigger the wrong one.
 *
 * Where each vector goes is decided **per record**, by {@link VectorRecordRouter}. A page is not
 * guaranteed to belong to one source — the Embed filter does not split by source — so resolving one
 * target from the first record wrote a page holding two organizations' chunks into the first one's
 * index and namespace.
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

    /**
     * Light per-record step: decide the operation and check there is something to embed.
     *
     * The real work waits for {@link Finalize}, so that fifty records cost one model call rather
     * than fifty.
     */
    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before embedding started');
        }
        const operation = this.operationFor(record);
        if (operation === 'Full' && this.textFor(record).trim().length === 0) {
            // The embedding call is text-in. An image, audio or video record with no text would be
            // embedded from an empty string, and every one of them would get the same vector —
            // equally "similar" to every query. Skipped honestly until a multi-modal embedder is
            // configured, rather than written as noise.
            return Outcome.Skipped(
                this.isNonTextModality(record)
                    ? `'${String(record.Get('Modality'))}' content has no text, and embedding is text-only`
                    : 'no text to embed',
            );
        }
        record.SetExtension(EMBED_STAGE, 'operation', operation);
        return Outcome.Complete();
    }

    /**
     * Route, embed and store the whole page.
     *
     * A record that cannot be routed fails alone. The rest are grouped by index, because one model
     * call has to produce vectors for one index's model, and one store call writes to one index.
     */
    public override async Finalize(
        records: readonly WorkingRecord[],
        context: StageContext,
    ): Promise<FinalizeResult[]> {
        const outcomes: FinalizeResult[] = [];
        const routes = await VectorRecordRouter.Create(context.Provider, context.ContextUser).Route(records);
        const tags = await this.loadTags(records, context);

        const byIndex = new Map<string, RoutedRecord[]>();
        for (const record of records) {
            const route = routes.get(record.Identity.Key) ?? { Error: 'no route was resolved' };
            if (IsRouteFailure(route)) {
                // A misconfigured index or a provider rejecting the record will not change on retry.
                outcomes.push({ Key: record.Identity.Key, Outcome: Outcome.Fatal(route.Error) });
                continue;
            }
            const indexKey = NormalizeUUID(route.Target.Index.ID);
            byIndex.set(indexKey, [...(byIndex.get(indexKey) ?? []), { Record: record, Route: route }]);
        }

        for (const group of byIndex.values()) {
            const full = group.filter((r) => this.plannedOperation(r.Record) === 'Full');
            const metadataOnly = group.filter((r) => this.plannedOperation(r.Record) === 'MetadataOnly');
            if (full.length > 0) {
                context.ReportProgress(`embedding ${full.length} record(s) into ${group[0].Route.Target.IndexName}`);
                outcomes.push(...(await this.embedAndStore(full, tags, context)));
            }
            if (metadataOnly.length > 0) {
                context.ReportProgress(`updating metadata for ${metadataOnly.length} record(s)`);
                outcomes.push(...(await this.updateMetadata(metadataOnly, tags, context)));
            }
        }
        return outcomes;
    }

    /** Embed a group in one model call, then store it in one provider call. */
    private async embedAndStore(
        group: readonly RoutedRecord[],
        tags: ReadonlyMap<string, string[]>,
        context: StageContext,
    ): Promise<FinalizeResult[]> {
        const target = group[0].Route.Target;
        const embedding = await new AIEmbeddingRunner().RunEmbedding({
            Texts: group.map((r) => this.textFor(r.Record)),
            // Named explicitly: these vectors are compared against stored vectors, so every one has
            // to come from the same model rather than whichever the prompt happened to fall back to.
            ModelID: target.EmbeddingModelID ?? undefined,
            Dimensions: target.Dimensions ?? undefined,
            ContextUser: context.ContextUser,
            Provider: context.Provider,
            Description: 'Content pipeline Embed stage',
        });
        if (!embedding.Success) {
            // The texts are unchanged, so a retry is the right answer rather than marking every
            // record permanently failed over one call.
            return group.map((r) => ({
                Key: r.Record.Identity.Key,
                Outcome: Outcome.Retry(embedding.ErrorMessage ?? 'embedding failed'),
            }));
        }
        const payload = group.map((r, i) => this.payloadFor(r, tags, embedding.Vectors[i], context));
        try {
            const response = await target.Database.CreateRecords(payload, target.IndexName, target.ProviderConfig);
            if (response.success === false) {
                throw new Error(response.message || 'the vector store rejected the batch');
            }
        } catch (error) {
            // A bulk call that threw tells us nothing about any individual record in it, so the
            // whole group fails together — which is Record Set Processing's contract for a batch.
            const message = error instanceof Error ? error.message : String(error);
            return group.map((r) => ({ Key: r.Record.Identity.Key, Outcome: Outcome.Retry(`vector write failed: ${message}`) }));
        }
        return this.recordReceipts(group, payload, embedding.ModelID ?? target.EmbeddingModelID, context);
    }

    /**
     * Replace the stored metadata of vectors whose text has not changed — no model call.
     *
     * Through the provider's own update, which leaves the stored values exactly as they are. An
     * upsert with empty values would either be rejected or overwrite the vector with nothing.
     *
     * A provider that cannot update metadata in place is not a reason to leave stale metadata: the
     * group is re-embedded instead, which costs a model call and arrives at the same result.
     */
    private async updateMetadata(
        group: readonly RoutedRecord[],
        tags: ReadonlyMap<string, string[]>,
        context: StageContext,
    ): Promise<FinalizeResult[]> {
        const target = group[0].Route.Target;
        const updates = group.map((r) => ({
            id: this.vectorIdFor(r.Record),
            metadata: this.BuildVectorMetadata(r.Record, r.Route, tags.get(NormalizeUUID(r.Route.Item.ID)) ?? [], context),
            ...(r.Route.Directives ? { providerTemporaryDirectives: r.Route.Directives } : {}),
        }));
        try {
            const response = await target.Database.UpdateRecords(updates, target.IndexName, target.ProviderConfig);
            if (response.success === false) {
                throw new Error(response.message || 'the provider refused the update');
            }
        } catch (error) {
            LogError(
                `EmbedStage: metadata-only update on '${target.IndexName}' was not possible ` +
                    `(${error instanceof Error ? error.message : String(error)}); re-embedding instead.`,
            );
            return this.embedAndStore(group, tags, context);
        }
        return this.recordReceipts(
            group,
            updates.map((u) => ({ id: u.id })),
            null,
            context,
        );
    }

    /**
     * Record the receipt on each record.
     *
     * The receipt matters as much as the write: without VectorRecordID nothing can later delete the
     * vector this row produced, which is how orphaned vectors stay searchable after their content
     * is gone.
     */
    private recordReceipts(
        group: readonly RoutedRecord[],
        payload: readonly { id: string }[],
        modelID: string | null,
        context: StageContext,
    ): FinalizeResult[] {
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

    /** One vector, with the routing the provider derived for its record. */
    private payloadFor(
        routed: RoutedRecord,
        tags: ReadonlyMap<string, string[]>,
        values: number[],
        context: StageContext,
    ): VectorPayload {
        return {
            id: this.vectorIdFor(routed.Record),
            values,
            metadata: this.BuildVectorMetadata(
                routed.Record,
                routed.Route,
                tags.get(NormalizeUUID(routed.Route.Item.ID)) ?? [],
                context,
            ),
            ...(routed.Route.Directives ? { providerTemporaryDirectives: routed.Route.Directives } : {}),
        };
    }

    /**
     * What rides alongside the vector.
     *
     * Built by the same {@link ContentVectorMetadataBuilder} the autotagger uses, from the same
     * metadata — `Configuration.VectorMetadata` on the Content Source, falling back to its Content
     * Type — so retrieval cannot tell which of the two wrote a vector. Field strategy, truncation,
     * coercion and the Entity-key omission rule all come from there; none of it is decided here.
     * Protected so a deployment can still subclass the stage and adjust the result.
     */
    protected BuildVectorMetadata(
        record: WorkingRecord,
        route: VectorRoute,
        tags: readonly string[],
        context: StageContext,
    ): Record<string, RecordMetadataValue> {
        const item = route.Item;
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        const config = ResolveContentVectorStorageConfig(
            knowledge.GetContentSourceByID(item.ContentSourceID),
            knowledge.GetContentTypeByID(item.ContentTypeID),
        );
        const isChunk = record.Entity === 'Content Item Chunk';
        return this.metadataBuilder(context).Build(
            {
                Item: item,
                IsItemLevel: !isChunk,
                ChunkID: isChunk ? record.Identity.Key : undefined,
                ChunkIndex: isChunk ? record.GetExtension<number>('Pipeline', 'sequence') : undefined,
                Text: (record.Get('Text') as string | null) ?? undefined,
            },
            tags,
            config,
            context.Provider.EntityByName('MJ: Content Items'),
        );
    }

    /** One builder per stage instance, so a refused declaration is reported once, not per vector. */
    private metadataBuilder(context: StageContext): ContentVectorMetadataBuilder {
        this._metadataBuilder ??= new ContentVectorMetadataBuilder(context.Provider);
        return this._metadataBuilder;
    }
    private _metadataBuilder?: ContentVectorMetadataBuilder;

    /** Every owning item's tags, in one query. */
    private async loadTags(records: readonly WorkingRecord[], context: StageContext): Promise<Map<string, string[]>> {
        const tags = new Map<string, string[]>();
        const itemIDs = [...new Set(records.map(OwningItemID).filter((id): id is string => !!id))];
        if (itemIDs.length === 0) {
            return tags;
        }
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<{ ItemID: string; Tag: string }>(
            {
                EntityName: 'MJ: Content Item Tags',
                ExtraFilter: WhereAnyOf('ItemID', itemIDs),
                Fields: ['ItemID', 'Tag'],
                ResultType: 'simple',
            },
            context.ContextUser,
        );
        if (!result.Success) {
            // Missing tags make a vector less filterable, not wrong; the next metadata refresh adds them.
            LogError(`EmbedStage: could not load tags for this page: ${result.ErrorMessage}`);
            return tags;
        }
        for (const row of result.Results) {
            const key = NormalizeUUID(row.ItemID);
            tags.set(key, [...(tags.get(key) ?? []), row.Tag]);
        }
        return tags;
    }

    /**
     * The vector's id.
     *
     * Reuses whatever this record was stored under before, so a re-embed replaces its vector rather
     * than leaving the old one behind under a different id.
     */
    private vectorIdFor(record: WorkingRecord): string {
        return record.GetExtension<string>('Pipeline', 'vectorRecordID') || record.Identity.Key;
    }

    /** The text to embed — the decorator first, so a chunk still reads in context. */
    private textFor(record: WorkingRecord): string {
        const text = (record.Get('Text') as string | null) ?? '';
        const decorator = record.Get('Decorator');
        return typeof decorator === 'string' && decorator.length > 0 ? `${decorator}\n\n${text}` : text;
    }

    /**
     * Which operation this record needs, from the status it hydrated with.
     *
     * Deliberately not from anything passed in: a queued message can be stale, a hydrated status
     * cannot. A metadata refresh for a record that has no vector yet becomes a full embed — there is
     * nothing stored to update.
     */
    private operationFor(record: WorkingRecord): EmbedOperation {
        const wantsMetadata = record.GetExtension<string>('Pipeline', 'embeddingStatus') === 'MetadataOnly';
        return wantsMetadata && record.GetExtension<string>('Pipeline', 'vectorRecordID') ? 'MetadataOnly' : 'Full';
    }

    /** The operation {@link Run} settled on. */
    private plannedOperation(record: WorkingRecord): EmbedOperation {
        return record.GetExtension<EmbedOperation>(EMBED_STAGE, 'operation') ?? 'Full';
    }

    /**
     * Whether this record's content is something other than text.
     *
     * Modality is a well-known field, so it is whatever the best-informed stage decided — an
     * extractor that knows it unpacked a JPEG outranks a discover driver guessing from a file
     * extension.
     */
    private isNonTextModality(record: WorkingRecord): boolean {
        const modality = record.Get('Modality');
        return typeof modality === 'string' && modality !== 'text' && modality.length > 0;
    }
}

/**
 * Embed over Content Item Chunk — the usual case, where an item was segmented first.
 */
@RegisterClass(BasePipelineStage, EMBED_STAGE)
export class EmbedStage extends BaseEmbedStage {
    public readonly Name = EMBED_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item Chunk';
}

/**
 * Embed over Content Item directly.
 *
 * Segmenting is not a precondition of embedding. An item that fits a model's context in one piece —
 * an abstract, a product description, a short page — is embedded as it stands, and MJ embeds
 * content items directly elsewhere for exactly that reason. Requiring a chunk per item would mean
 * manufacturing a one-chunk row for every such record purely to satisfy this stage.
 *
 * A pipeline runs one or the other, not both: whichever is configured decides what carries the
 * vector.
 */
@RegisterClass(BasePipelineStage, EMBED_ITEM_STAGE)
export class EmbedContentItemStage extends BaseEmbedStage {
    public readonly Name = EMBED_ITEM_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
}
