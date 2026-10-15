/**
 * @fileoverview {@link ExtractStage} — turning a located record into text.
 *
 * Runs over Content Item; ready when `ExtractionStatus = 'Pending'`. Fetches, resolves a file type,
 * selects a extractor, reads, and proposes what it found — using the confidence mechanism throughout,
 * so a better finding wins on merit rather than by running last.
 *
 * Its core computation is a pure operation over a candidate's bytes rather than a database
 * operation, which is what makes a dry run possible without bolting it on afterwards.
 *
 * @module @memberjunction/content-pipeline
 */

import { CompositeKey, LogError, LogStatus } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { DetectionCatalog, DetectionRules } from '../DetectionCatalog.js';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseDiscoverDriver,
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
    ObjectKeyResolutionError,
    ResolveObjectKey,
} from '@memberjunction/content-pipeline-base';
import {
    ContentSourceConfigurationResolver,
    ResolvedSourceConfiguration,
} from '../ContentSourceConfigurationResolver.js';
import { ContentFetcher } from '../ContentFetcher.js';
import { SelectExtractor, SourceExtractorCandidate } from '../ExtractorCascade.js';

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
            : await this.fetch(url, resolved, context);

        const confidence = ResolveConfidence(context.Configuration);
        const rules = await this.detection(context).Rules();
        const signature = DetectByteSignature(fetched.Content, rules.Signatures);
        // A FileType is only a declaration when something said it about THIS item — a discover
        // driver reading the listing, a splitting extractor naming its member. One with no recorded
        // confidence was inherited from the source's default when the row was created, and a source
        // set to "HTML" holds the odd .txt or .xlsx: that must not outrank the item's own extension.
        const storedFileType = record.Get('FileType') as string | null;
        const declared = record.GetConfidence('FileType') > 0;
        const fileType = ResolveFileType({
            Declared: declared ? storedFileType : null,
            Signature: signature?.FileType ?? null,
            SignatureIsUnambiguous: signature?.Unambiguous ?? false,
            FileName: fetched.ResolvedURL ?? url,
            SourceDefault: declared ? null : storedFileType,
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

        // Metadata's word on what is text outranks the built-in lists.
        const strategy = ClassifyUnresolved(fileType.FileType, rules);
        if (strategy === 'MultiModal') {
            return this.handleNonText(record, fileType.FileType as string, resolved, fetched.Content, fetched.ContentType, context, confidence);
        }

        return this.read(
            record,
            context,
            fetched.Content,
            fileType.FileType ?? '',
            url,
            resolved,
            confidence,
            rules.ExtractorByFileType.get(fileType.FileType ?? '') ?? null,
        );
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

    /**
     * This run's detection rules.
     *
     * Held per run for the same reason the access resolver is: the rows behind it do not change
     * while a page of records is processed, and reading them per record would turn one lookup into
     * one per file.
     */
    private detection(context: StageContext): DetectionCatalog {
        this._detection ??= new DetectionCatalog(context.Provider, context.ContextUser);
        return this._detection;
    }
    private _detection?: DetectionCatalog;

    /**
     * Fetch, distinguishing a transport failure that might recover from one that will not.
     *
     * The source's own discover driver is asked first: it minted the locator, so it knows what one
     * is — a disk path, an object key in a storage account, a record id. Only a driver that does not
     * read its own locators falls through to HTTP, which is the only thing a plain URL fetch can do.
     */
    private async fetch(url: string, resolved: ResolvedSource, context: StageContext): Promise<FetchedBytes> {
        try {
            // Access opens the session; the fetcher moves the bytes. No resolved source means no
            // source configuration, so there is nothing to open a session against.
            const access = resolved.Resolved ? await context.ResolveAccess(resolved.ContentSourceID) : null;
            const driver = resolved.Resolved?.DriverClass ? BaseDiscoverDriver.Resolve(resolved.Resolved.DriverClass) : null;
            if (driver?.Fetch) {
                return await driver.Fetch({
                    URL: url,
                    ContentSourceID: resolved.ContentSourceID,
                    SourceURL: resolved.Resolved?.URL ?? '',
                    Parameters: resolved.Parameters,
                    Configuration: resolved.Resolved?.Configuration ?? {},
                    Access: access,
                    ContextUser: context.ContextUser,
                    Provider: context.Provider,
                    Signal: context.Signal,
                });
            }
            return await ContentFetcher.Resolve().Fetch({
                URL: url,
                ContentSourceID: resolved.ContentSourceID,
                SourceURL: resolved.Resolved?.URL,
                Parameters: resolved.Parameters,
                Access: access ?? undefined,
                Signal: context.Signal,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // A 4xx will never succeed, nor will a locator outside its source; anything else might.
            if (/HTTP 4\d\d|outside|not found|does not exist|ENOENT/i.test(message)) {
                throw new FatalStageError(`Cannot fetch '${url}': ${message}`);
            }
            throw new TransientStageError(`Fetching '${url}' failed: ${message}`, { cause: error });
        }
    }

    /** Select a extractor, read, and propose what came back. */
    private async read(
        record: WorkingRecord,
        context: StageContext,
        content: Uint8Array,
        fileType: string,
        url: string,
        resolved: ResolvedSource,
        confidence: ResolvedConfidenceScale,
        fileTypeExtractorKey: string | null,
    ): Promise<StageOutcome> {
        const selected = this.selectExtractor(record, fileType, resolved, fileTypeExtractorKey);
        if (!selected) {
            return this.plainTextFallback(record, content, fileType, context, confidence);
        }

        const result = await selected.Extractor.Extract({
            Content: content,
            FileType: fileType,
            URL: url,
            Parameters: resolved.Parameters,
            Tuning: ResolveTuning(context.Configuration),
            Signal: context.Signal,
            ReportProgress: (m) => context.ReportProgress(m),
        });
        if (result.Blocks.length === 0) {
            return Outcome.Skipped(`${selected.Key} found no content in this ${fileType || 'file'}`);
        }

        // The receipt of what actually ran, so a misrouted item can be found and corrected later.
        this.recordExtractor(record, selected.Key);
        record.SetExtension(EXTRACT_STAGE, 'isFallback', result.IsFallback === true);

        if (result.Blocks.length === 1) {
            // One block: this document's own text.
            this.applyBlock(record, result.Blocks[0], result.IsFallback === true, confidence);
            return Outcome.Complete(`read with ${selected.Key}`);
        }

        // Several blocks: this artifact EXPANDED into other documents. Every block becomes a child
        // item and the container keeps its own identity — overwriting it with the first block's
        // content would lose the container and silently mislabel one of its members as the whole.
        const rules = await this.detection(context).Rules();
        for (const block of result.Blocks) {
            const child = this.toChild(record, block, url, confidence);
            if (block.Content) {
                // A member handed back as bytes goes through Extract's own detection and cascade
                // now, while the bytes are in hand: its URL points at the container, so nothing can
                // fetch it again later.
                await this.extractMember(child, block, resolved, context, confidence, rules);
            }
            record.AddChild(child);
        }
        return Outcome.Complete(`expanded into ${result.Blocks.length} item(s) with ${selected.Key}`);
    }

    /**
     * Read one expanded member, exactly as Extract reads any document.
     *
     * Ends in one of three places, and never in a child left Pending with no bytes behind it — that
     * child's URL is the container's, so a later Extract would fetch the container and expand it
     * again underneath its own member:
     *   * text read now — the child is created Complete;
     *   * bytes kept as an MJ File — the child is created Pending and read from them on its turn
     *     (a non-text member for the multi-modal path, or one that itself expands, like a nested
     *     archive or a workbook);
     *   * neither possible — the child is recorded and marked complete with nothing to do.
     */
    private async extractMember(
        child: WorkingRecord,
        block: ContentBlock,
        resolved: ResolvedSource,
        context: StageContext,
        confidence: ResolvedConfidenceScale,
        rules: DetectionRules,
    ): Promise<void> {
        const bytes = block.Content!;
        const signature = DetectByteSignature(bytes, rules.Signatures);
        const fileType = ResolveFileType({
            Declared: null,
            Signature: signature?.FileType ?? null,
            SignatureIsUnambiguous: signature?.Unambiguous ?? false,
            FileName: block.Key ?? '',
        });
        const type = fileType.FileType ?? '';
        if (type) {
            child.Propose(
                'FileType',
                type,
                confidence[FileTypeEvidenceConfidenceKey[fileType.Evidence ?? 'Extension']],
                `${EXTRACT_STAGE}.Member`,
            );
        }

        if (ClassifyUnresolved(type || null, rules) === 'MultiModal') {
            child.Propose('Modality', this.modalityFor(type), confidence.Modality, `${EXTRACT_STAGE}.Member`);
            await this.keepOrComplete(child, bytes, resolved, context);
            return;
        }

        const selected = this.selectExtractor(child, type, resolved, rules.ExtractorByFileType.get(type) ?? null);
        if (!selected) {
            const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
            if (IsPlausibleText(text, ResolveTuning(context.Configuration).MinimumPrintableRatio)) {
                child.Propose('Text', text, confidence.FallbackText, `${EXTRACT_STAGE}.PlainTextFallback`);
            } else {
                child.MarkComplete();
            }
            return;
        }

        const result = await selected.Extractor.Extract({
            Content: bytes,
            FileType: type,
            URL: child.Identity.EphemeralID,
            Parameters: resolved.Parameters,
            Tuning: ResolveTuning(context.Configuration),
            Signal: context.Signal,
            ReportProgress: (m) => context.ReportProgress(m),
        });
        this.recordExtractor(child, selected.Key);
        if (result.Blocks.length === 1 && result.Blocks[0].Text) {
            this.applyBlock(child, result.Blocks[0], result.IsFallback === true, confidence);
            return;
        }
        if (result.Blocks.length > 1) {
            // The member itself expands. Its own turn does that, from its kept bytes, so its
            // children nest under it rather than flattening into this container.
            child.SetExtension('Pipeline', 'columns', {
                ...(child.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
                ExtractorKeyOverride: selected.Key,
            });
            await this.keepOrComplete(child, bytes, resolved, context);
            return;
        }
        // Nothing in it.
        child.MarkComplete();
    }

    /** Keep a member's bytes for its own turn, or — when they cannot be kept — close it out. */
    private async keepOrComplete(
        child: WorkingRecord,
        content: Uint8Array,
        resolved: ResolvedSource,
        context: StageContext,
    ): Promise<void> {
        if (!(await this.keepChildBytes(child, content, resolved, context))) {
            child.MarkComplete();
        }
    }

    /** The receipt of which extractor read a record. */
    private recordExtractor(record: WorkingRecord, key: string): void {
        record.SetExtension(EXTRACT_STAGE, 'extractorKey', key);
        record.SetExtension('Pipeline', 'columns', {
            ...(record.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
            ExtractorKey: key,
        });
    }

    /**
     * Keep an expanded member's bytes, and point the child at them.
     *
     * Best-effort: a member whose bytes could not be kept is still worth recording, and the caller
     * closes it out rather than leaving it to be read as the container it came from. Failing the
     * whole archive because one member could not be stored would lose the other members too.
     *
     * @returns Whether the bytes were kept.
     */
    private async keepChildBytes(
        child: WorkingRecord,
        content: Uint8Array,
        resolved: ResolvedSource,
        context: StageContext,
    ): Promise<boolean> {
        try {
            const objectKey = await this.persistDurableCopy(child, resolved, content, undefined, context);
            if (!objectKey) {
                LogStatus(
                    `ExtractStage: '${child.Identity.EphemeralID}' needs its bytes kept to be read on its ` +
                        'own turn, and this source keeps no durable copies, so it is recorded but not read.',
                );
            }
            return objectKey !== null;
        } catch (error) {
            LogError(
                `ExtractStage: could not keep bytes for '${child.Identity.EphemeralID}': ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    }

    /**
     * Walk the cascade to the extractor that should read these bytes.
     *
     * The stored override comes first — it outlives the run that set it, which is what lets an
     * operator correct a misrouted item — then one stamped by a splitting extractor earlier in this
     * same run, then the source's own choice, its content type's, its file type's, any extractor that
     * declares it reads this format, and finally the fallback.
     */
    private selectExtractor(
        record: WorkingRecord,
        fileType: string,
        resolved: ResolvedSource,
        fileTypeExtractorKey: string | null,
    ) {
        return SelectExtractor({
            FileType: fileType,
            ExtractorKeyOverride:
                record.GetExtension<string>('Pipeline', 'extractorKeyOverride') ??
                record.GetExtension<string>(EXTRACT_STAGE, 'keyOverride') ??
                null,
            SourceCandidates: resolved.Extractors,
            SourceExtractorKey: resolved.SourceExtractorKey,
            ContentTypeExtractorKey: resolved.ContentTypeExtractorKey,
            FileTypeExtractorKey: fileTypeExtractorKey,
            FallbackExtractorKey: resolved.FallbackExtractorKey,
        });
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
                `No extractor handles '${fileType || 'unknown'}' and a plain-text read produced unreadable content`,
            );
        }
        record.Propose('Text', text, confidence.FallbackText, `${EXTRACT_STAGE}.PlainTextFallback`);
        record.SetExtension(EXTRACT_STAGE, 'isFallback', true);
        return Outcome.Complete(`read as plain text (no extractor for '${fileType || 'unknown'}')`);
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
        if (!resolved.ObjectKeyTemplate) {
            // This source keeps no durable copies.
            return null;
        }

        const objectKey = this.objectKeyFor(record, resolved);

        // Straight to MJ Files — no driver contract in between. FileStorageBase is already the
        // registry of places a file can go, and a MJ: Files row is how every other part of MJ finds
        // one again. Bytes never land in this database.
        await FileStorageEngine.Instance.Config(false, context.ContextUser, context.Provider);
        const account = this.resolveStorageAccount(resolved);
        const driver = await FileStorageEngine.Instance.GetDriver(account.ID, context.ContextUser);
        if (!(await driver.PutObject(objectKey, Buffer.from(content), contentType))) {
            throw new TransientStageError(`Storage provider refused to write '${objectKey}'`);
        }

        // The row is written after the bytes, never before: a File row pointing at an object that
        // was never stored is worse than no row, because everything downstream trusts the reference.
        const file = await context.Provider.GetEntityObject<MJFileEntity>('MJ: Files', context.ContextUser);
        file.NewRecord();
        file.Name = objectKey.split('/').pop() ?? objectKey;
        file.ProviderID = account.ProviderID;
        file.ProviderKey = objectKey;
        file.ContentType = contentType ?? 'application/octet-stream';
        file.Status = 'Uploaded';
        if (!(await file.Save())) {
            throw new TransientStageError(
                `Stored '${objectKey}' but could not record its MJ: Files row: ` +
                    `${file.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }

        record.SetExtension(EXTRACT_STAGE, 'durableCopy', { FileID: file.ID, ObjectKey: objectKey });
        // The item's reference to its kept bytes. A column rather than a proposal: there is nothing
        // for another stage to out-argue here.
        record.SetExtension('Pipeline', 'columns', {
            ...(record.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
            FileID: file.ID,
        });
        return objectKey;
    }

    /**
     * Resolve the key these bytes are written under.
     *
     * Fails closed. Where several tenants share infrastructure the isolation is in the key itself,
     * so a placeholder that cannot be resolved stops the write rather than producing a path that is
     * missing part of its namespace.
     */
    private objectKeyFor(record: WorkingRecord, resolved: ResolvedSource): string {
        try {
            return ResolveObjectKey(resolved.ObjectKeyTemplate!, {
                ...resolved.ObjectKeyValues,
                ContentSourceID: resolved.ContentSourceID,
                RecordID: record.Identity.RecordID ?? record.Identity.EphemeralID,
                Name: (record.Get('Title') as string | null) ?? 'content',
            });
        } catch (error) {
            if (error instanceof ObjectKeyResolutionError) {
                throw new FatalStageError(error.message);
            }
            throw error;
        }
    }

    /**
     * The File Storage Account durable copies go to.
     *
     * A source names one when it has a reason to; otherwise the deployment's single configured
     * account is used. Having none at all is a configuration error, not a reason to quietly drop the
     * bytes the source asked to keep.
     */
    private resolveStorageAccount(resolved: ResolvedSource) {
        const engine = FileStorageEngine.Instance;
        const named = resolved.FileStorageAccountID;
        if (named) {
            const account = engine.GetAccountById(named) ?? engine.GetAccountByName(named);
            if (!account) {
                throw new FatalStageError(`No File Storage Account matches '${named}'`);
            }
            return account;
        }
        const accounts = engine.Accounts;
        if (accounts.length === 0) {
            throw new FatalStageError(
                'This source keeps durable copies but no File Storage Account is configured, so there ' +
                    'is nowhere to put them.',
            );
        }
        return accounts[0];
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
        record.Propose('Text', block.Text, isFallback ? confidence.FallbackText : confidence.ExtractorText, setBy);
        if (block.Title) {
            record.Propose('Title', block.Title, block.TitleConfidence ?? confidence.ExtractorTitle, setBy);
        }
    }

    /**
     * Turn an extra block into a **child** Content Item.
     *
     * A extractor returning several blocks has found an artifact that EXPANDS into other items — a zip
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
            child.Propose('Text', block.Text, confidence.ExtractorText, EXTRACT_STAGE);
        }
        // A member handed back as bytes gets its file type and modality from extractMember, which
        // reads the bytes — guessing here from the name alone labelled every unknown member an image.
        if (block.Title) {
            child.Propose('Title', block.Title, block.TitleConfidence ?? confidence.ExtractorTitle, EXTRACT_STAGE);
        }
        const parentDate = parent.Get('Date');
        if (parentDate) {
            child.Propose('Date', parentDate, parent.GetConfidence('Date'), `${EXTRACT_STAGE}.InheritedFromParent`);
        }
        if (block.FileType) {
            child.Propose('FileType', block.FileType, confidence.FileTypeDeclared, `${EXTRACT_STAGE}.Split`);
        }
        if (block.ExtractorKeyOverride) {
            // A extractor that knows what one of its own children is does not make the cascade work it
            // out again.
            child.SetExtension(EXTRACT_STAGE, 'keyOverride', block.ExtractorKeyOverride);
            // Committed as a column too: the child is created Pending, and Extract reaches it in a
            // later run where nothing from this one survives.
            child.SetExtension('Pipeline', 'columns', {
                ...(child.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
                ExtractorKeyOverride: block.ExtractorKeyOverride,
            });
        }
        return child;
    }

    /** The source's settings, and the extractor-cascade rungs that come from configuration. */
    private async resolveSource(record: WorkingRecord, context: StageContext): Promise<ResolvedSource> {
        const contentSourceID = record.GetExtension<string>('Pipeline', 'contentSourceID') ?? '';
        const resolver = new ContentSourceConfigurationResolver(context.Provider, context.ContextUser);
        const resolved = contentSourceID ? await resolver.Resolve(contentSourceID, context.ContextUser) : null;
        const settings = resolved?.Settings ?? {};
        return {
            ContentSourceID: contentSourceID,
            Resolved: resolved,
            Parameters: resolved?.Parameters ?? {},
            Extractors: Array.isArray(settings.Extractors) ? (settings.Extractors as SourceExtractorCandidate[]) : [],
            SourceExtractorKey: (settings.ExtractorKey as string | undefined) ?? null,
            // The content type's column, as the migration describes it. Reading it from run Options
            // made a per-type default per-run, and left it unset on the shipped process.
            ContentTypeExtractorKey: await this.contentTypeExtractorKey(contentSourceID, context),
            FallbackExtractorKey: (context.Configuration.FallbackExtractorKey as string | undefined) ?? null,
            MultiModalEnabled: this.multiModalEnabled(settings, context),
            FileStorageAccountID: (settings.FileStorageAccountID as string | undefined)
                ?? (context.Configuration.FileStorageAccountID as string | undefined)
                ?? null,
            ObjectKeyTemplate: (settings.ObjectKeyTemplate as string | undefined)
                ?? (context.Configuration.ObjectKeyTemplate as string | undefined)
                ?? null,
            ObjectKeyValues: (context.Configuration.ObjectKeyValues as Record<string, string> | undefined) ?? {},
        };
    }

    /** `ContentType.ExtractorKey` for the source's content type, from the cached metadata. */
    private async contentTypeExtractorKey(contentSourceID: string, context: StageContext): Promise<string | null> {
        if (!contentSourceID) {
            return null;
        }
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        await knowledge.Config(false, context.ContextUser, context.Provider);
        const source = knowledge.GetContentSourceByID(contentSourceID);
        const contentType = source?.ContentTypeID ? knowledge.GetContentTypeByID(source.ContentTypeID) : undefined;
        return contentType?.ExtractorKey ?? null;
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

/** Bytes in hand, wherever they came from. */
interface FetchedBytes {
    Content: Uint8Array;
    ContentType?: string;
    ResolvedURL?: string;
}

/** What Extract needs to know about the source behind a record. */
interface ResolvedSource {
    ContentSourceID: string;
    /**
     * The source's full resolved configuration, carried so anything needing more than the fields
     * below — Access, when deciding whether this source needs a session — does not re-read it.
     */
    Resolved: ResolvedSourceConfiguration | null;
    Parameters: Readonly<Record<string, string>>;
    Extractors: readonly SourceExtractorCandidate[];
    SourceExtractorKey: string | null;
    ContentTypeExtractorKey: string | null;
    FallbackExtractorKey: string | null;
    MultiModalEnabled: boolean;
    FileStorageAccountID: string | null;
    /** e.g. `{TenantID}/{ContentSourceID}/{RecordID}-{Name}`. */
    ObjectKeyTemplate: string | null;
    /**
     * Values for template placeholders the pipeline does not itself know — a tenant id, which
     * typically lives on an entity above Content Source and is supplied by the layer that has it.
     */
    ObjectKeyValues: Readonly<Record<string, string>>;
}
