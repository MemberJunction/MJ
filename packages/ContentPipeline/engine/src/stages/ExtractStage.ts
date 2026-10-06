/**
 * @fileoverview {@link ExtractStage} — turning a located record into text.
 *
 * Runs over Content Item; ready when `ExtractionStatus = 'Pending'`. Fetches, resolves a file type,
 * selects a reader, reads, and proposes what it found — using the confidence mechanism throughout,
 * so a better finding wins on merit rather than by running last.
 *
 * Its core computation is a pure operation over a candidate's bytes rather than a database
 * operation, which is what makes a dry run possible without bolting it on afterwards.
 *
 * @module @memberjunction/content-pipeline
 */

import { CompositeKey, LogError, LogStatus } from '@memberjunction/core';
import { MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { RegisterClass } from '@memberjunction/global';
import {
    BasePipelineStage,
    ClassifyUnresolved,
    CheckContentTypeSignatures,
    FileTypeEvidenceConfidenceKey,
    ResolveConfidence,
    ResolvedConfidenceScale,
    ResolveTuning,
    DetectByteSignature,
    ContentBlock,
    FatalStageError,
    IsPlausibleText,
    Outcome,
    ResolveFileType,
    StageContext,
    StageDeclaration,
    StageOutcome,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import {
    BaseDurableCopyStore,
    ObjectKeyResolutionError,
    ResolveObjectKey,
} from '@memberjunction/content-pipeline-base';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';
import { ContentFetcher } from '../ContentFetcher.js';
import { SelectReader, SourceExtractorCandidate } from '../ReaderCascade.js';

/** The registered name. */
export const EXTRACT_STAGE = 'Extract';

/**
 * Fetches a record's bytes and reads them into text.
 *
 * Non-text content is not, by itself, a reason to skip: determining "this is an image, not a
 * document" is Extract doing its job. The genuine exception is a non-text record on a source with
 * multi-modal handling disabled — there is nothing further to do, so it is skipped and marked
 * complete.
 */
@RegisterClass(BasePipelineStage, EXTRACT_STAGE)
export class ExtractStage extends BasePipelineStage {
    public readonly Name = EXTRACT_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';

    public override get Declaration(): StageDeclaration {
        return {
            Reads: ['FileType'],
            Writes: ['Text', 'FileType', 'Title', 'Modality'],
            ReadsExtensions: [],
            WritesExtensions: [`${EXTRACT_STAGE}.extractorKey`, `${EXTRACT_STAGE}.isFallback`],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before extraction started');
        }
        const url = record.Identity.EphemeralID;
        if (!url) {
            throw new FatalStageError('Extract was handed a record with no URL to fetch');
        }

        const resolved = await this.resolveSource(record, context);
        // A record whose bytes were already kept reads them back rather than re-fetching its URL.
        // For an archive member that is the difference between extracting the member and extracting
        // the archive it came out of, which is what its URL still points at.
        const keptFileID = record.GetExtension<string>('Pipeline', 'fileID');
        const fetched = keptFileID
            ? await this.readKeptFile(keptFileID, context)
            : await this.fetch(url, resolved.ContentSourceID, resolved.Parameters, context);

        const confidence = ResolveConfidence(context.Configuration);
        const signature = DetectByteSignature(fetched.Content);
        const fileType = ResolveFileType({
            Declared: record.Get('FileType') as string | null,
            Signature: signature?.FileType ?? null,
            SignatureIsUnambiguous: signature?.Unambiguous ?? false,
            FileName: fetched.ResolvedURL ?? url,
        });
        if (fileType.FileType) {
            record.Propose(
                'FileType',
                fileType.FileType,
                confidence[FileTypeEvidenceConfidenceKey[fileType.Evidence ?? 'Extension']],
                `${EXTRACT_STAGE}.${fileType.Evidence}`,
            );
        }

        // Content type comes from the document's own structure. Every applicable signature is
        // checked against the same bytes and proposes at its own confidence, competing on the same
        // terms as anything Discover already proposed.
        for (const match of await CheckContentTypeSignatures({
            Content: fetched.Content,
            FileType: fileType.FileType ?? '',
            URL: url,
            Confidence: confidence,
        })) {
            record.Propose('ContentType', match.ContentType, match.Confidence, `${EXTRACT_STAGE}.Signature`);
        }

        const strategy = ClassifyUnresolved(fileType.FileType);
        if (strategy === 'MultiModal') {
            return this.handleNonText(record, fileType.FileType as string, resolved, fetched.Content, fetched.ContentType, context, confidence);
        }

        return this.read(record, context, fetched.Content, fileType.FileType ?? '', url, resolved, confidence);
    }

    /**
     * Read back bytes kept by an earlier run, through MJ Files.
     *
     * Deliberately not a fetch: the artifact may never have had a URL of its own, and where it does
     * that URL points at whatever contained it.
     */
    private async readKeptFile(fileID: string, context: StageContext) {
        const file = await context.Provider.GetEntityObject<MJFileEntity>('MJ: Files', context.ContextUser);
        if (!(await file.InnerLoad(CompositeKey.FromID(fileID)))) { // first-pk-ok: MJ core entity, single-column ID
            throw new FatalStageError(`The kept copy '${fileID}' for this record no longer exists`);
        }
        await FileStorageEngine.Instance.Config(false, context.ContextUser, context.Provider);
        const accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
        if (accounts.length === 0) {
            throw new FatalStageError(
                `No storage account is configured for provider '${file.ProviderID}', so '${fileID}' cannot be read`,
            );
        }
        const driver = await FileStorageEngine.Instance.GetDriver(accounts[0].ID, context.ContextUser);
        const bytes = await driver.GetObject({ fullPath: file.ProviderKey ?? file.Name });
        return {
            Content: new Uint8Array(bytes),
            ContentType: file.ContentType ?? undefined,
            ResolvedURL: file.ProviderKey ?? file.Name,
        };
    }

    /** Fetch, distinguishing a transport failure that might recover from one that will not. */
    private async fetch(
        url: string,
        contentSourceID: string,
        parameters: Readonly<Record<string, string>>,
        context: StageContext,
    ) {
        try {
            return await ContentFetcher.Resolve().Fetch({
                URL: url,
                ContentSourceID: contentSourceID,
                Parameters: parameters,
                Signal: context.Signal,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // A 4xx will never succeed; anything else might, so it is worth another attempt.
            if (/HTTP 4\d\d/.test(message)) {
                throw new FatalStageError(`Cannot fetch '${url}': ${message}`);
            }
            throw new TransientStageError(`Fetching '${url}' failed: ${message}`, { cause: error });
        }
    }

    /** Select a reader, read, and propose what came back. */
    private async read(
        record: WorkingRecord,
        context: StageContext,
        content: Uint8Array,
        fileType: string,
        url: string,
        resolved: ResolvedSource,
        confidence: ResolvedConfidenceScale,
    ): Promise<StageOutcome> {
        const selected = SelectReader({
            FileType: fileType,
            ExtractorKeyOverride: record.GetExtension<string>(EXTRACT_STAGE, 'keyOverride') ?? null,
            SourceCandidates: resolved.Extractors,
            SourceExtractorKey: resolved.SourceExtractorKey,
            ContentTypeExtractorKey: resolved.ContentTypeExtractorKey,
            FallbackExtractorKey: resolved.FallbackExtractorKey,
        });

        if (!selected) {
            return this.plainTextFallback(record, content, fileType, context, confidence);
        }

        const result = await selected.Reader.Read({
            Content: content,
            FileType: fileType,
            URL: url,
            Parameters: resolved.Parameters,
            Signal: context.Signal,
            ReportProgress: (m) => context.ReportProgress(m),
        });
        if (result.Blocks.length === 0) {
            return Outcome.Skipped(`${selected.Key} found no content in this ${fileType || 'file'}`);
        }

        record.SetExtension(EXTRACT_STAGE, 'extractorKey', selected.Key);
        record.SetExtension(EXTRACT_STAGE, 'isFallback', result.IsFallback === true);

        if (result.Blocks.length === 1) {
            // One block: this document's own text.
            this.applyBlock(record, result.Blocks[0], result.IsFallback === true, confidence);
            return Outcome.Complete(`read with ${selected.Key}`);
        }

        // Several blocks: this artifact EXPANDED into other documents. Every block becomes a child
        // item and the container keeps its own identity — overwriting it with the first block's
        // content would lose the container and silently mislabel one of its members as the whole.
        for (const block of result.Blocks) {
            const child = this.toChild(record, block, url, confidence);
            // A member that is not text needs its bytes kept now, while they are in hand. Its URL
            // points at the container, so nothing can fetch it again later.
            if (block.Content) {
                await this.keepChildBytes(child, block.Content, resolved, context);
            }
            record.AddChild(child);
        }
        return Outcome.Complete(`expanded into ${result.Blocks.length} item(s) with ${selected.Key}`);
    }

    /**
     * Keep an expanded member's bytes, and point the child at them.
     *
     * Best-effort: a member whose bytes could not be kept is still worth recording, and it will be
     * skipped by Extract rather than silently read as the container it came from. Failing the whole
     * archive because one member could not be stored would lose the other members too.
     */
    private async keepChildBytes(
        child: WorkingRecord,
        content: Uint8Array,
        resolved: ResolvedSource,
        context: StageContext,
    ): Promise<void> {
        try {
            const objectKey = await this.persistDurableCopy(child, resolved, content, undefined, context);
            if (!objectKey) {
                LogStatus(
                    `ExtractStage: '${child.Identity.EphemeralID}' is not text and this source keeps no ` +
                        'durable copies, so its bytes are not retained.',
                );
            }
        } catch (error) {
            LogError(
                `ExtractStage: could not keep bytes for '${child.Identity.EphemeralID}': ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * The last-resort plain-text read.
     *
     * Sanity-checked **before** committing: text that does not pass is a failure rather than
     * something to let propagate silently into tags, chunks and vectors, where it costs far more to
     * notice.
     */
    private plainTextFallback(
        record: WorkingRecord,
        content: Uint8Array,
        fileType: string,
        context: StageContext,
        confidence: ResolvedConfidenceScale,
    ): StageOutcome {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(content);
        if (!IsPlausibleText(text, ResolveTuning(context.Configuration).MinimumPrintableRatio)) {
            return Outcome.Fatal(
                `No reader handles '${fileType || 'unknown'}' and a plain-text read produced unreadable content`,
            );
        }
        record.Propose('Text', text, confidence.FallbackText, `${EXTRACT_STAGE}.PlainTextFallback`);
        record.SetExtension(EXTRACT_STAGE, 'isFallback', true);
        return Outcome.Complete(`read as plain text (no reader for '${fileType || 'unknown'}')`);
    }

    /**
     * Non-text content: multi-modal handling, or nothing further to do.
     *
     * Disabling multi-modal handling applies to the record **as a whole** — a caption riding
     * alongside an image is not split out and kept as independent text when the image itself is not
     * being embedded.
     */
    private async handleNonText(
        record: WorkingRecord,
        fileType: string,
        resolved: ResolvedSource,
        content: Uint8Array,
        contentType: string | undefined,
        context: StageContext,
        confidence: ResolvedConfidenceScale,
    ): Promise<StageOutcome> {
        record.Propose('Modality', this.modalityFor(fileType), confidence.Modality, `${EXTRACT_STAGE}.Signature`);
        if (!resolved.MultiModalEnabled) {
            // Nothing further for Extract to do, and no later stage should treat it as ready.
            record.MarkComplete();
            return Outcome.Skipped(`'${fileType}' is not text and multi-modal handling is disabled for this source`);
        }
        const copied = await this.persistDurableCopy(record, resolved, content, contentType, context);
        return Outcome.Complete(
            copied
                ? `'${fileType}' routed to multi-modal handling, bytes kept at ${copied}`
                : `'${fileType}' routed to multi-modal handling`,
        );
    }

    /**
     * Keep the bytes, if this source asks for durable copies.
     *
     * Written immediately, while the bytes are already in hand, rather than re-fetched later — a
     * second fetch would need the source to still be reachable and the artifact still valid.
     */
    private async persistDurableCopy(
        record: WorkingRecord,
        resolved: ResolvedSource,
        content: Uint8Array,
        contentType: string | undefined,
        context: StageContext,
    ): Promise<string | null> {
        if (!resolved.DurableCopyStoreKey || !resolved.ObjectKeyTemplate) {
            return null;
        }
        const store = BaseDurableCopyStore.Resolve(resolved.DurableCopyStoreKey);
        if (!store) {
            throw new FatalStageError(
                `Durable copy store '${resolved.DurableCopyStoreKey}' is not registered.`,
            );
        }

        let objectKey: string;
        try {
            objectKey = ResolveObjectKey(resolved.ObjectKeyTemplate, {
                ...resolved.ObjectKeyValues,
                ContentSourceID: resolved.ContentSourceID,
                RecordID: record.Identity.RecordID ?? record.Identity.EphemeralID,
                Name: (record.Get('Title') as string | null) ?? 'content',
            });
        } catch (error) {
            // Failing closed: writing a tenant's bytes to an unnamespaced path is worse than not
            // writing them.
            if (error instanceof ObjectKeyResolutionError) {
                throw new FatalStageError(error.message);
            }
            throw error;
        }

        const result = await store.Persist({
            Content: content,
            ObjectKey: objectKey,
            ContentType: contentType,
            ContextUser: context.ContextUser,
            Provider: context.Provider,
            Signal: context.Signal,
        });
        record.SetExtension(EXTRACT_STAGE, 'durableCopy', result);
        if (result.FileID) {
            // The item's reference to its kept bytes. A column rather than a proposal: there is
            // nothing for another stage to out-argue here.
            record.SetExtension('Pipeline', 'columns', {
                ...(record.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
                FileID: result.FileID,
            });
        }
        return result.ObjectKey;
    }

    /** The modality a recognized non-text format belongs to. */
    private modalityFor(fileType: string): string {
        if (['mp3', 'wav', 'ogg', 'flac'].includes(fileType)) {
            return 'audio';
        }
        if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(fileType)) {
            return 'video';
        }
        return 'image';
    }

    /** Put a block's findings on the record, each competing on confidence. */
    private applyBlock(
        record: WorkingRecord,
        block: ContentBlock,
        isFallback: boolean,
        confidence: ResolvedConfidenceScale,
    ): void {
        const setBy = `${EXTRACT_STAGE}${isFallback ? '.Fallback' : ''}`;
        record.Propose('Text', block.Text, isFallback ? confidence.FallbackText : confidence.ReaderText, setBy);
        if (block.Title) {
            record.Propose('Title', block.Title, block.TitleConfidence ?? confidence.ReaderTitle, setBy);
        }
    }

    /**
     * Turn an extra block into a **child** Content Item.
     *
     * A reader returning several blocks has found an artifact that EXPANDS into other items — a zip
     * extracting to files, a CSV whose rows become items of their own. Each child is a Content Item
     * in its own right, linked to the one it came out of by `ParentID`, which nests to arbitrary
     * depth so a zip inside a zip needs no special case.
     *
     * This is distinct from chunking: a chunk is a slice of *this* document, a child is a
     * *different* document this one contained.
     *
     * A child **inherits its parent's date**: the date representing a piece of content belongs to
     * the document, not to whenever Extract happened to open the archive.
     */
    private toChild(
        parent: WorkingRecord,
        block: ContentBlock,
        parentURL: string,
        confidence: ResolvedConfidenceScale,
    ): WorkingRecord {
        const url = block.Key ? `${parentURL}#${block.Key}` : `${parentURL}#block-${Date.now()}`;
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', url));
        if (block.Text) {
            child.Propose('Text', block.Text, confidence.ReaderText, EXTRACT_STAGE);
        } else if (block.Content) {
            // A member that is not text — a PDF or an image inside an archive. It gets the modality
            // its bytes imply and stays Pending for Extract rather than being committed as a
            // successful read of nothing, so the multi-modal path picks it up on its own turn.
            child.Propose(
                'Modality',
                this.modalityFor(block.FileType ?? ''),
                confidence.Modality,
                `${EXTRACT_STAGE}.Split`,
            );
            child.SetExtension(EXTRACT_STAGE, 'content', block.Content);
        }
        if (block.Title) {
            child.Propose('Title', block.Title, block.TitleConfidence ?? confidence.ReaderTitle, EXTRACT_STAGE);
        }
        const parentDate = parent.Get('Date');
        if (parentDate) {
            child.Propose('Date', parentDate, parent.GetConfidence('Date'), `${EXTRACT_STAGE}.InheritedFromParent`);
        }
        if (block.FileType) {
            child.Propose('FileType', block.FileType, confidence.FileTypeDeclared, `${EXTRACT_STAGE}.Split`);
        }
        if (block.ExtractorKeyOverride) {
            // A reader that knows what one of its own children is does not make the cascade work it
            // out again.
            child.SetExtension(EXTRACT_STAGE, 'keyOverride', block.ExtractorKeyOverride);
        }
        return child;
    }

    /** The source's settings, and the reader-cascade rungs that come from configuration. */
    private async resolveSource(record: WorkingRecord, context: StageContext): Promise<ResolvedSource> {
        const contentSourceID = record.GetExtension<string>('Pipeline', 'contentSourceID') ?? '';
        const resolver = new ContentSourceConfigurationResolver(context.Provider, context.ContextUser);
        const resolved = contentSourceID ? await resolver.Resolve(contentSourceID, context.ContextUser) : null;
        const settings = resolved?.Settings ?? {};
        return {
            ContentSourceID: contentSourceID,
            Parameters: resolved?.Parameters ?? {},
            Extractors: Array.isArray(settings.Extractors) ? (settings.Extractors as SourceExtractorCandidate[]) : [],
            SourceExtractorKey: (settings.ExtractorKey as string | undefined) ?? null,
            ContentTypeExtractorKey: (context.Configuration.ContentTypeExtractorKey as string | undefined) ?? null,
            FallbackExtractorKey: (context.Configuration.FallbackExtractorKey as string | undefined) ?? null,
            MultiModalEnabled: this.multiModalEnabled(settings, context),
            DurableCopyStoreKey: (settings.DurableCopyStoreKey as string | undefined)
                ?? (context.Configuration.DurableCopyStoreKey as string | undefined)
                ?? null,
            ObjectKeyTemplate: (settings.ObjectKeyTemplate as string | undefined)
                ?? (context.Configuration.ObjectKeyTemplate as string | undefined)
                ?? null,
            ObjectKeyValues: (context.Configuration.ObjectKeyValues as Record<string, string> | undefined) ?? {},
        };
    }

    /**
     * Whether to attempt multi-modal handling: the source type's default, which the source may
     * override.
     *
     * The same type-default-with-source-override shape used elsewhere. An unset source override
     * means "inherit", not "off" — which is why this cannot simply read the source's column.
     */
    private multiModalEnabled(settings: Readonly<Record<string, unknown>>, context: StageContext): boolean {
        if (typeof settings.MultiModalEnabled === 'boolean') {
            return settings.MultiModalEnabled;
        }
        return context.Configuration.SupportsMultiModal === true;
    }
}

/** What Extract needs to know about the source behind a record. */
interface ResolvedSource {
    ContentSourceID: string;
    Parameters: Readonly<Record<string, string>>;
    Extractors: readonly SourceExtractorCandidate[];
    SourceExtractorKey: string | null;
    ContentTypeExtractorKey: string | null;
    FallbackExtractorKey: string | null;
    MultiModalEnabled: boolean;
    DurableCopyStoreKey: string | null;
    /** e.g. `{TenantID}/{ContentSourceID}/{RecordID}-{Name}`. */
    ObjectKeyTemplate: string | null;
    /**
     * Values for template placeholders the pipeline does not itself know — a tenant id, which
     * typically lives on an entity above Content Source and is supplied by the layer that has it.
     */
    ObjectKeyValues: Readonly<Record<string, string>>;
}
