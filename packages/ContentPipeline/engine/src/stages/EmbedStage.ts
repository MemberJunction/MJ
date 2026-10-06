/**
 * @fileoverview {@link EmbedStage} — turning a record's text into a stored vector.
 *
 * Runs over Content Item Chunk, or Content Item directly for the single-chunk case; ready when
 * `EmbeddingStatus = 'Pending'`. The per-record step is deliberately light — gather the text and
 * the metadata — and the finalize does the expensive part once for the whole page: one model call
 * to embed, one store call to upsert.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { AIEmbeddingRunner } from '@memberjunction/ai-prompts';
import { RecordMetadataValue } from '@memberjunction/ai-vectordb';
import {
    BasePipelineStage,
    FatalStageError,
    FinalizeResult,
    Outcome,
    StageContext,
    StageDeclaration,
    StageOutcome,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';
import { ResolvedVectorTarget, VectorTargetResolver } from '../VectorTarget.js';

/** The registered name. */
export const EMBED_STAGE = 'Embed';

/** The registered name of the Content Item variant. */
export const EMBED_ITEM_STAGE = 'EmbedContentItem';

/** Which operation a record needs. */
type EmbedOperation = 'Full' | 'MetadataOnly';

/**
 * Embeds a page of records in one model call and stores them in one store call.
 *
 * Which operation a record gets is decided by **its own hydrated status**, never by anything in a
 * queued message — so a stale message cannot trigger the wrong one.
 */
export abstract class BaseEmbedStage extends BasePipelineStage {
    public readonly StatusField = 'EmbeddingStatus';

    public override get Declaration(): StageDeclaration {
        return {
            Reads: ['Text', 'Title', 'Modality'],
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
        if (operation === 'Full') {
            const text = record.Get('Text');
            const hasText = typeof text === 'string' && text.trim().length > 0;
            // Text is not the only embeddable thing. An image, an audio file or a video is embedded
            // from the artifact itself by a multi-modal model, and has no text by nature — skipping
            // it for "no text" would make the whole non-text corpus silently unsearchable.
            if (!hasText && !this.isNonTextModality(record)) {
                return Outcome.Skipped('no text to embed');
            }
        }
        record.SetExtension(EMBED_STAGE, 'operation', operation);
        return Outcome.Complete();
    }

    /**
     * Embed and store the whole page.
     *
     * Split by operation: a metadata-only update leaves the stored vector alone and replaces only
     * its metadata, which costs no model call at all.
     */
    public override async Finalize(
        records: readonly WorkingRecord[],
        context: StageContext,
    ): Promise<FinalizeResult[]> {
        const target = await this.resolveTarget(records, context);
        const full: WorkingRecord[] = [];
        const metadataOnly: WorkingRecord[] = [];
        for (const record of records) {
            const operation = record.GetExtension<EmbedOperation>(EMBED_STAGE, 'operation') ?? 'Full';
            (operation === 'MetadataOnly' ? metadataOnly : full).push(record);
        }

        const outcomes: FinalizeResult[] = [];
        if (full.length > 0) {
            context.ReportProgress(`embedding ${full.length} record(s)`);
            outcomes.push(...(await this.embedAndStore(full, target, context)));
        }
        if (metadataOnly.length > 0) {
            // Metadata without values is a metadata update to MJ's providers, so the model call that
            // would reproduce an identical vector is skipped.
            context.ReportProgress(`updating metadata for ${metadataOnly.length} record(s)`);
            outcomes.push(
                ...(await this.store(
                    metadataOnly,
                    metadataOnly.map((r) => ({ id: this.vectorIdFor(r), values: [], metadata: this.metadataFor(r) })),
                    target,
                    null,
                    context,
                )),
            );
        }
        return outcomes;
    }

    /** Embed a page in one model call, then store it in one provider call. */
    private async embedAndStore(
        records: readonly WorkingRecord[],
        target: ResolvedVectorTarget,
        context: StageContext,
    ): Promise<FinalizeResult[]> {
        const embedding = await new AIEmbeddingRunner().RunEmbedding({
            Texts: records.map((r) => this.textFor(r)),
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
            return records.map((r) => ({
                Key: r.Identity.Key,
                Outcome: Outcome.Retry(embedding.ErrorMessage ?? 'embedding failed'),
            }));
        }
        const payload = records.map((record, i) => ({
            id: this.vectorIdFor(record),
            values: embedding.Vectors[i],
            metadata: this.metadataFor(record),
        }));
        return this.store(records, payload, target, embedding.ModelID ?? target.EmbeddingModelID, context);
    }

    /**
     * Hand the batch to the provider and record the receipt on each record.
     *
     * The receipt matters as much as the write: without VectorRecordID nothing can later delete the
     * vector this row produced, which is how orphaned vectors stay searchable after their content
     * is gone.
     */
    private async store(
        records: readonly WorkingRecord[],
        payload: { id: string; values: number[]; metadata: Record<string, RecordMetadataValue> }[],
        target: ResolvedVectorTarget,
        modelID: string | null,
        context: StageContext,
    ): Promise<FinalizeResult[]> {
        if (target.Database.IsReadOnly) {
            return records.map((r) => ({
                Key: r.Identity.Key,
                Outcome: Outcome.Fatal('the configured vector database is read-only'),
            }));
        }
        try {
            const response = await target.Database.CreateRecords(payload, target.IndexName, target.ProviderConfig);
            if (response.success === false) {
                throw new Error(response.message ?? 'the vector store rejected the batch');
            }
        } catch (error) {
            // A bulk call that threw tells us nothing about any individual record in it, so the
            // whole page fails together — which is Record Set Processing's contract for a batch.
            const message = error instanceof Error ? error.message : String(error);
            return records.map((r) => ({ Key: r.Identity.Key, Outcome: Outcome.Retry(`vector write failed: ${message}`) }));
        }

        const now = new Date();
        for (const [i, record] of records.entries()) {
            record.SetExtension('Pipeline', 'columns', {
                ...(record.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
                VectorRecordID: payload[i].id,
                LastEmbeddedAt: now,
                ...(modelID ? { EmbeddingModelID: modelID } : {}),
            });
        }
        context.ReportProgress(`stored ${payload.length} vector(s)`);
        return records.map((r) => ({ Key: r.Identity.Key, Outcome: Outcome.Complete() }));
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
     * cannot.
     */
    private operationFor(record: WorkingRecord): EmbedOperation {
        return record.GetExtension<string>('Pipeline', 'embeddingStatus') === 'MetadataOnly'
            ? 'MetadataOnly'
            : 'Full';
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

    /** What rides alongside the vector, narrowed to what a store will accept. */
    private metadataFor(record: WorkingRecord): Record<string, RecordMetadataValue> {
        const metadata: Record<string, RecordMetadataValue> = { RecordID: record.Identity.Key };
        const title = record.Get('Title');
        const modality = record.Get('Modality');
        if (typeof title === 'string') {
            metadata.Title = title;
        }
        if (typeof modality === 'string') {
            metadata.Modality = modality;
        }
        return metadata;
    }

    /**
     * The index this page writes to.
     *
     * Every record in a page belongs to one content source, so the target is resolved once. A page
     * spanning sources would be a bug in the source query rather than something to paper over here.
     */
    private async resolveTarget(
        records: readonly WorkingRecord[],
        context: StageContext,
    ): Promise<ResolvedVectorTarget> {
        const contentSourceID = records
            .map((r) => r.GetExtension<string>('Pipeline', 'contentSourceID'))
            .find((id): id is string => typeof id === 'string' && id.length > 0);
        if (!contentSourceID) {
            throw new FatalStageError('Embed was handed records with no Content Source to resolve an index from');
        }
        try {
            return await new VectorTargetResolver(context.Provider, context.ContextUser).Resolve(contentSourceID);
        } catch (error) {
            // A misconfigured index will not start being configured on a retry.
            throw new FatalStageError(error instanceof Error ? error.message : String(error));
        }
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
