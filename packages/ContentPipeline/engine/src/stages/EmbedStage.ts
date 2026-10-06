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
import {
    BasePipelineStage,
    BaseVectorWriter,
    FatalStageError,
    FinalizeResult,
    Outcome,
    StageContext,
    StageDeclaration,
    StageOutcome,
    VectorMetadataUpdate,
    VectorRecord,
    VectorWriteOutcome,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';

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
        const writer = this.resolveWriter(context);
        const full: WorkingRecord[] = [];
        const metadataOnly: WorkingRecord[] = [];
        for (const record of records) {
            const operation = record.GetExtension<EmbedOperation>(EMBED_STAGE, 'operation') ?? 'Full';
            // A full embed wins when both could apply: its upsert writes the metadata anyway.
            (operation === 'MetadataOnly' && writer.UpdateMetadata ? metadataOnly : full).push(record);
        }

        const outcomes: FinalizeResult[] = [];
        if (full.length > 0) {
            context.ReportProgress(`embedding ${full.length} record(s)`);
            const payload: VectorRecord[] = full.map((r) => ({
                RecordID: r.Identity.Key,
                Text: (r.Get('Text') as string) ?? '',
                Metadata: this.metadataFor(r),
            }));
            outcomes.push(...this.toResults(await this.write(() => writer.Upsert(payload, this.writeContext(context)))));
        }
        if (metadataOnly.length > 0) {
            context.ReportProgress(`updating metadata for ${metadataOnly.length} record(s)`);
            const payload: VectorMetadataUpdate[] = metadataOnly.map((r) => ({
                RecordID: r.Identity.Key,
                Metadata: this.metadataFor(r),
            }));
            outcomes.push(
                ...this.toResults(
                    await this.write(() => writer.UpdateMetadata!(payload, this.writeContext(context))),
                ),
            );
        }
        return outcomes;
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
     * Modality is a well-known field, so it is whatever the best-informed stage decided — a reader
     * that knows it unpacked a JPEG outranks a discover driver guessing from a file extension.
     */
    private isNonTextModality(record: WorkingRecord): boolean {
        const modality = record.Get('Modality');
        return typeof modality === 'string' && modality !== 'text' && modality.length > 0;
    }

    /** What rides alongside the vector. */
    private metadataFor(record: WorkingRecord): Record<string, unknown> {
        const metadata: Record<string, unknown> = { RecordID: record.Identity.Key };
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

    /** Run a bulk write, turning a throw into a page-wide transient failure. */
    private async write(run: () => Promise<VectorWriteOutcome[]>): Promise<VectorWriteOutcome[]> {
        try {
            return await run();
        } catch (error) {
            // A bulk call that threw tells us nothing about any individual record in it, so the
            // whole page fails together — which is Record Set Processing's contract for a batch.
            throw new Error(
                `Vector write failed for the page: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /** Turn the writer's per-record outcomes into finalize results. */
    private toResults(outcomes: readonly VectorWriteOutcome[]): FinalizeResult[] {
        return outcomes.map((o) => ({
            Key: o.RecordID,
            Outcome: o.Success
                ? Outcome.Complete()
                : o.IsTransient
                  ? Outcome.Retry(o.Message ?? 'vector write failed')
                  : Outcome.Fatal(o.Message ?? 'vector write failed'),
        }));
    }

    /** The slice of the stage context a writer needs. */
    private writeContext(context: StageContext) {
        return {
            ContextUser: context.ContextUser,
            Provider: context.Provider,
            Configuration: context.Configuration,
            Signal: context.Signal,
            ReportProgress: (m: string) => context.ReportProgress(m),
        };
    }

    /** The vector writer this run uses. */
    private resolveWriter(context: StageContext): BaseVectorWriter {
        const key = context.Configuration.VectorWriterKey;
        if (typeof key !== 'string' || key.length === 0) {
            throw new FatalStageError(
                "No vector writer is configured. Set VectorWriterKey in the Record Process's Options.",
            );
        }
        const writer = BaseVectorWriter.Resolve(key);
        if (!writer) {
            throw new FatalStageError(
                `Vector writer '${key}' is not registered. Check that the package registering it has been loaded.`,
            );
        }
        return writer;
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
