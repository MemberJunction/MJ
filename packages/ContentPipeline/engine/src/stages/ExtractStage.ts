/**
 * @fileoverview {@link ExtractStage} — turning a Content Item's bytes into text.
 *
 * Runs over Content Item; ready when `ExtractionStatus = 'Pending'`. Fetches, resolves a file type,
 * selects an extractor and proposes what it read. An archive member goes through the same
 * detect → cascade → extract path as any fetched document.
 *
 * @module @memberjunction/content-pipeline
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import { CompositeKey, LogError, LogStatus } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, MJFileEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { IsHttpError } from '@memberjunction/network-utils';
import { FileStorageEngine, IsSafeStorageObjectKey } from '@memberjunction/storage';
import {
    ArchiveBudget,
    BasePipelineStage,
    ContentBlock,
    DetectByteSignature,
    ExtractResult,
    FatalStageError,
    FileTypeEvidenceConfidenceKey,
    IsPlausibleText,
    ObjectKeyResolutionError,
    Outcome,
    ResolveConfidence,
    ResolvedConfidenceScale,
    ResolveFileType,
    ResolveObjectKey,
    ResolveTuning,
    Signature,
    StageContext,
    StageDeclaration,
    StageOutcome,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { ContentSourceConfigurationResolver, ResolvedSourceConfiguration } from '../ContentSourceConfigurationResolver.js';
import { FetchContent, FetchResponse } from '../ContentFetcher.js';
import { DetectionCatalog } from '../DetectionCatalog.js';
import { SelectExtractor } from '../ExtractorCascade.js';
import { ResolveSourceDriver } from './DiscoverStage.js';

/** The registered name. */
export const EXTRACT_STAGE = 'Extract';

interface ArchiveTreeState {
    Budget?: ArchiveBudget;
}

/**
 * Fetches a record's bytes and reads them into text. Non-text content is not a reason to skip —
 * "this is an image" is Extract doing its job — unless the source has multi-modal handling off.
 */
@RegisterClass(BasePipelineStage, EXTRACT_STAGE)
export class ExtractStage extends BasePipelineStage {
    public readonly Name = EXTRACT_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';
    private _detection?: DetectionCatalog;

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
        const source = await this.resolveSource(record, context);
        // Kept bytes are read back, not refetched: an archive member's URL points at the archive.
        const keptFileID = record.GetExtension<string>('Pipeline', 'fileID');
        const fetched = keptFileID ? await this.readKeptFile(keptFileID, context) : await this.fetch(url, source, context);
        const archiveState: ArchiveTreeState = {};
        const read = await this.detectAndRead(record, fetched.Content, fetched.ResolvedURL ?? url, source, context, archiveState, 0);
        switch (read.Kind) {
            case 'NonText':
                return this.handleNonText(record, read.FileType, source, fetched, context);
            case 'NoExtractor':
                return this.fallbackText(record, fetched.Content, source.Confidence, context)
                    ? Outcome.Complete(`read as plain text (no extractor for '${read.FileType || 'unknown'}')`)
                    : Outcome.Fatal(`No extractor handles '${read.FileType || 'unknown'}' and a plain-text read is unreadable`);
            case 'Read':
                return this.applyResult(record, read, url, source, context, archiveState, 0, fetched.Content);
        }
    }

    /** Detect the file type, then route the bytes: multi-modal, an extractor, or no extractor at all. */
    private async detectAndRead(
        record: WorkingRecord,
        content: Uint8Array,
        nameHint: string,
        source: ResolvedSource,
        context: StageContext,
        archiveState: ArchiveTreeState,
        archiveDepth: number,
    ): Promise<ReadOutcome> {
        const rules = await this.detection(context).Rules();
        const fileType = this.resolveFileType(record, content, nameHint, rules.Signatures, source.Confidence);
        if (rules.NonTextFileTypes.has(fileType)) {
            record.Propose('Modality', this.modalityFor(fileType), source.Confidence.Modality, `${EXTRACT_STAGE}.Signature`);
            return { Kind: 'NonText', FileType: fileType };
        }
        const lowerFileType = fileType.toLowerCase();
        const selected = SelectExtractor({
            FileType: fileType,
            ExtractorKeyOverride: record.GetExtension<string>('Pipeline', 'extractorKeyOverride'),
            RunExtractorKey: source.RunExtractors?.[lowerFileType] ?? source.RunExtractorKey,
            SourceExtractorKey: source.SourceExtractors?.[lowerFileType] ?? source.SourceExtractorKey,
            ContentTypeExtractorKey: source.TypeExtractors?.[lowerFileType] ?? source.ContentTypeExtractorKey,
            FileTypeExtractorKey: rules.ExtractorByFileType.get(fileType),
        });
        if (!selected) {
            return { Kind: 'NoExtractor', FileType: fileType };
        }
        const tuning = ResolveTuning(
            source.Resolved?.TypeConfiguration,
            source.Resolved?.Configuration,
            source.Resolved?.Settings,
            context.Configuration,
        );
        const isArchive = selected.Key === 'Archive';
        const budget = isArchive ? this.prepareArchiveBudget(archiveState, source.Parameters, tuning, archiveDepth + 1) : archiveState.Budget;
        const result = await selected.Extractor.Extract({
            Content: content,
            FileType: fileType,
            URL: record.Identity.EphemeralID,
            Parameters: source.Parameters,
            Tuning: tuning,
            Confidence: source.Confidence,
            ArchiveBudget: budget,
            Signal: context.Signal,
            ReportProgress: (m) => context.ReportProgress(m),
        });
        // The receipt of what ran, so a misrouted item can be found and corrected.
        record.SetExtension(EXTRACT_STAGE, 'extractorKey', selected.Key);
        this.setColumns(record, { ExtractorKey: selected.Key });
        return { Kind: 'Read', FileType: fileType, Key: selected.Key, Result: result, IsArchive: isArchive };
    }

    /** Prepare or advance the shared tree-wide archive budget when an Archive extractor is about to run. */
    private prepareArchiveBudget(
        archiveState: ArchiveTreeState,
        parameters: Readonly<Record<string, string>>,
        tuning: ReturnType<typeof ResolveTuning>,
        nextDepth: number,
    ): ArchiveBudget | undefined {
        if (archiveState.Budget) {
            archiveState.Budget.CurrentDepth = nextDepth;
            return archiveState.Budget;
        }
        const fromSource = (value: string | undefined) => {
            const n = Number(value);
            return value !== undefined && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
        };
        const maxMembers = fromSource(parameters.MaxArchiveMembers) ?? tuning.MaxArchiveMembers;
        const maxBytes = fromSource(parameters.MaxArchiveBytes) ?? tuning.MaxArchiveBytes;
        if (maxMembers === null || maxBytes === null) {
            return undefined;
        }
        const maxDepth = fromSource(parameters.MaxArchiveDepth) ?? tuning.MaxArchiveDepth;
        archiveState.Budget = {
            RemainingMembers: maxMembers,
            RemainingBytes: maxBytes,
            CurrentDepth: nextDepth,
            MaxDepth: maxDepth,
        };
        return archiveState.Budget;
    }

    /** Resolve and propose the file type. Returns '' when nothing resolved one. */
    private resolveFileType(
        record: WorkingRecord,
        content: Uint8Array,
        nameHint: string,
        signatures: readonly Signature[],
        scale: ResolvedConfidenceScale,
    ): string {
        const signature = DetectByteSignature(content, signatures);
        // Only a FileType proposed at FileTypeDeclared or higher counts as an explicit declaration.
        // Lower-confidence proposals (source default, or split/extension hints) yield to byte signatures.
        const stored = record.Get('FileType') as string | null;
        const confidence = record.GetConfidence('FileType');
        const declared = confidence >= scale.FileTypeDeclared;
        const extensionFallback = !declared && confidence >= scale.FileTypeExtension && stored ? `.${stored}` : null;
        const resolved = ResolveFileType({
            Declared: declared ? stored : null,
            Signature: signature?.FileType ?? null,
            SignatureIsUnambiguous: signature?.Unambiguous ?? false,
            FileName: nameHint || extensionFallback,
            SourceDefault: !declared && confidence < scale.FileTypeExtension ? stored : null,
        });
        if (resolved.FileType && resolved.Evidence) {
            const resolvedConfidence = scale[FileTypeEvidenceConfidenceKey[resolved.Evidence]];
            record.Propose('FileType', resolved.FileType, resolvedConfidence, `${EXTRACT_STAGE}.${resolved.Evidence}`);
        }
        return resolved.FileType ?? '';
    }

    /** One text block is this document's text; blocks carrying bytes (including a 1-member archive) or multiple blocks become children. */
    private async applyResult(
        record: WorkingRecord,
        read: ReadResult,
        url: string,
        source: ResolvedSource,
        context: StageContext,
        archiveState: ArchiveTreeState,
        archiveDepth: number,
        fetchedContent: Uint8Array,
    ): Promise<StageOutcome> {
        const blocks = read.Result.Blocks;
        if (blocks.length === 0) {
            return Outcome.Skipped(`${read.Key} found no content in this ${read.FileType || 'file'}`);
        }
        record.SetExtension(EXTRACT_STAGE, 'isFallback', read.Result.IsFallback === true);
        this.applyExtractExtensions(record, read.Result.Columns, read.Result.Request);
        if (blocks.length === 1 && !blocks[0].Content) {
            this.applyBlock(record, blocks[0], read.Result.IsFallback === true, source.Confidence);
            return Outcome.Complete(`read with ${read.Key}`);
        }
        record.SetExtension('Pipeline', 'checksum', this.sha256Bytes(fetchedContent));
        record.MarkComplete();
        const memberDepth = read.IsArchive ? archiveDepth + 1 : archiveDepth;
        // The container keeps its own identity; writing the first block onto it would mislabel a member as the whole.
        for (const [index, block] of blocks.entries()) {
            const child = this.toChild(record, block, `${url}#${block.Key ?? `block-${index}`}`, source.Confidence);
            if (block.Content) {
                // Read now, while the bytes are in hand: the child's URL is the container's.
                await this.extractMember(child, block.Content, block.Key ?? '', source, context, archiveState, memberDepth);
            }
            record.AddChild(child);
        }
        return Outcome.Complete(`expanded into ${blocks.length} item(s) with ${read.Key}`);
    }

    /**
     * Read one archive member through the same path as any document. It ends read (Complete), kept
     * as an MJ File for its own turn (Pending), or closed out — never Pending with nothing behind it,
     * since a later fetch of its URL would expand the container again.
     */
    private async extractMember(
        child: WorkingRecord,
        bytes: Uint8Array,
        name: string,
        source: ResolvedSource,
        context: StageContext,
        archiveState: ArchiveTreeState,
        archiveDepth: number,
    ): Promise<void> {
        const read = await this.detectAndRead(child, bytes, name, source, context, archiveState, archiveDepth);
        if (read.Kind === 'NonText') {
            return this.keepOrComplete(child, bytes, source, context);
        }
        if (read.Kind === 'NoExtractor') {
            if (!this.fallbackText(child, bytes, source.Confidence, context)) {
                child.MarkComplete();
            }
            return;
        }
        this.applyExtractExtensions(child, read.Result.Columns, read.Result.Request);
        const blocks = read.Result.Blocks;
        if (blocks.length === 1 && !blocks[0].Content) {
            if (blocks[0].Text) {
                this.applyBlock(child, blocks[0], read.Result.IsFallback === true, source.Confidence);
            } else {
                child.MarkComplete();
            }
        } else if (blocks.length > 0) {
            const nextDepth = read.IsArchive ? archiveDepth + 1 : archiveDepth;
            const childUrl = child.Identity.EphemeralID;
            for (const [index, block] of blocks.entries()) {
                const grandChild = this.toChild(child, block, `${childUrl}#${block.Key ?? `block-${index}`}`, source.Confidence);
                if (block.Content) {
                    await this.extractMember(grandChild, block.Content, block.Key ?? '', source, context, archiveState, nextDepth);
                }
                child.AddChild(grandChild);
            }
            child.MarkComplete();
        } else {
            child.MarkComplete();
        }
    }

    /** Keep a member's bytes for its own turn; when they cannot be kept, close it out. One bad member must not fail the archive. */
    private async keepOrComplete(child: WorkingRecord, content: Uint8Array, source: ResolvedSource, context: StageContext): Promise<void> {
        if (!source.MultiModalEnabled) {
            child.MarkComplete();
            return;
        }
        try {
            if (await this.persistDurableCopy(child, source, content, undefined, context)) {
                child.SetExtension('Pipeline', 'checksum', this.sha256Bytes(content));
                return;
            }
            LogStatus(`ExtractStage: '${child.Identity.EphemeralID}' is recorded but not read: this source keeps no durable copies`);
        } catch (error) {
            LogError(`ExtractStage: could not keep bytes for '${child.Identity.EphemeralID}': ${messageOf(error)}`);
        }
        child.MarkComplete();
    }

    /** The last-resort plain-text read, sanity-checked so mojibake never reaches tags, chunks and vectors. */
    private fallbackText(record: WorkingRecord, content: Uint8Array, confidence: ResolvedConfidenceScale, context: StageContext): boolean {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(content);
        if (!IsPlausibleText(text, ResolveTuning(context.Configuration).MinimumPrintableRatio)) {
            return false;
        }
        record.Propose('Text', text, confidence.FallbackText, `${EXTRACT_STAGE}.PlainTextFallback`);
        record.SetExtension(EXTRACT_STAGE, 'isFallback', true);
        record.SetExtension('Pipeline', 'checksum', this.sha256Text(text));
        return true;
    }

    /** Non-text content: keep it for multi-modal handling, or — with that off for the source — finish it. */
    private async handleNonText(
        record: WorkingRecord,
        fileType: string,
        source: ResolvedSource,
        fetched: FetchResponse,
        context: StageContext,
    ): Promise<StageOutcome> {
        if (!source.MultiModalEnabled) {
            record.MarkComplete();
            return Outcome.Skipped(`'${fileType}' is not text and multi-modal handling is disabled for this source`);
        }
        record.SetExtension('Pipeline', 'checksum', this.sha256Bytes(fetched.Content));
        const copied = await this.persistDurableCopy(record, source, fetched.Content, fetched.ContentType, context);
        return Outcome.Complete(`'${fileType}' routed to multi-modal handling${copied ? `, bytes kept at ${copied}` : ''}`);
    }

    /** Read back bytes an earlier run kept, through MJ Files and the caller's storage access. */
    private async readKeptFile(fileID: string, context: StageContext): Promise<FetchResponse> {
        const file = await context.Provider.GetEntityObject<MJFileEntity>('MJ: Files', context.ContextUser);
        if (!(await file.InnerLoad(CompositeKey.FromID(fileID)))) { // first-pk-ok: MJ core entity, single-column ID
            throw new FatalStageError(`The kept copy '${fileID}' for this record no longer exists`);
        }
        const resolved = await FileStorageEngine.Instance.ResolveFileObject(file, context.ContextUser, 'Read', context.Provider);
        if (!resolved) {
            throw new FatalStageError(`No storage account is configured for provider '${file.ProviderID}', so '${fileID}' cannot be read`);
        }
        const bytes = await resolved.Driver.GetObject({ fullPath: resolved.ObjectKey });
        return { Content: new Uint8Array(bytes), ContentType: file.ContentType ?? undefined, ResolvedURL: resolved.ObjectKey };
    }

    /** Fetch through the source's driver when it reads its own locators, else over HTTP. */
    private async fetch(url: string, source: ResolvedSource, context: StageContext): Promise<FetchResponse> {
        try {
            const resolved = source.Resolved;
            const access = resolved ? await context.ResolveAccess(source.ContentSourceID) : null;
            const driver = resolved?.DriverClass ? ResolveSourceDriver(resolved.DriverClass) : null;
            if (resolved && driver?.Fetch) {
                return await driver.Fetch({
                    URL: url,
                    ContentSourceID: source.ContentSourceID,
                    SourceURL: resolved.URL,
                    Parameters: source.Parameters,
                    Configuration: resolved.Configuration,
                    Access: access,
                    ContextUser: context.ContextUser,
                    Provider: context.Provider,
                    Signal: context.Signal,
                });
            }
            return await FetchContent({ URL: url, SourceURL: resolved?.URL, Access: access, Signal: context.Signal });
        } catch (error) {
            throw this.classifyFetchError(url, error);
        }
    }

    /** A 4xx, an unregistered driver or a locator outside its source will never succeed; anything else might. */
    private classifyFetchError(url: string, error: unknown): Error {
        if (error instanceof FatalStageError) {
            return error;
        }
        const message = messageOf(error);
        const clientError = IsHttpError(error) && error.Status >= 400 && error.Status < 500;
        if (clientError || /outside|not found|does not exist|ENOENT/i.test(message)) {
            return new FatalStageError(`Cannot fetch '${url}': ${message}`);
        }
        return new TransientStageError(`Fetching '${url}' failed: ${message}`, { cause: error });
    }

    /** Keep the bytes through MJ Files when the source asks for durable copies; returns the stored key. */
    private async persistDurableCopy(
        record: WorkingRecord,
        source: ResolvedSource,
        content: Uint8Array,
        contentType: string | undefined,
        context: StageContext,
    ): Promise<string | null> {
        if (!source.ObjectKeyTemplate || context.IsTest || record.GetExtension<string>('Pipeline', 'fileID')) {
            return null;
        }
        const objectKey = this.objectKeyFor(record, source, source.ObjectKeyTemplate);
        const prefix = path.posix.dirname(objectKey);
        // UploadFile sanitises the path, refuses to overwrite an object the user cannot read, and writes the MJ: Files row.
        const uploaded = await FileStorageEngine.Instance.UploadFile({
            content: Buffer.from(content),
            fileName: path.posix.basename(objectKey),
            pathPrefix: prefix === '.' ? '' : prefix,
            mimeType: contentType ?? 'application/octet-stream',
            contextUser: context.ContextUser,
            provider: context.Provider,
            storageAccountId: source.FileStorageAccountID ?? undefined,
        }).catch((error: unknown) => {
            throw new TransientStageError(`Keeping '${objectKey}' failed: ${messageOf(error)}`, { cause: error });
        });
        record.SetExtension(EXTRACT_STAGE, 'durableCopy', { FileID: uploaded.FileID, ObjectKey: uploaded.StoragePath });
        this.setColumns(record, { FileID: uploaded.FileID });
        return uploaded.StoragePath;
    }

    /** The key the bytes go under. Fails closed: a key missing part of its tenant namespace is never written. */
    private objectKeyFor(record: WorkingRecord, source: ResolvedSource, template: string): string {
        try {
            const key = ResolveObjectKey(template, {
                ...source.ObjectKeyValues,
                ContentSourceID: source.ContentSourceID,
                RecordID: record.Identity.RecordID ?? record.Identity.EphemeralID,
                Name: (record.Get('Title') as string | null) ?? 'content',
            });
            if (!IsSafeStorageObjectKey(key)) {
                throw new ObjectKeyResolutionError(`Object key '${key}' is not a safe storage key`);
            }
            return key;
        } catch (error) {
            throw new FatalStageError(messageOf(error));
        }
    }

    /** The modality a non-text format belongs to. */
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
    private applyBlock(record: WorkingRecord, block: ContentBlock, isFallback: boolean, confidence: ResolvedConfidenceScale): void {
        const setBy = `${EXTRACT_STAGE}${isFallback ? '.Fallback' : ''}`;
        record.Propose('Text', block.Text, isFallback ? confidence.FallbackText : confidence.ExtractorText, setBy);
        record.SetExtension('Pipeline', 'checksum', this.sha256Text(block.Text));
        if (block.Title) {
            record.Propose('Title', block.Title, block.TitleConfidence ?? confidence.ExtractorTitle, setBy);
        }
        this.applyExtractExtensions(record, block.Columns, block.Request);
    }

    /**
     * An expanded block as a child Content Item (linked by `ParentID` on commit). A child is a
     * different document this one contained — not a chunk — and inherits its parent's date.
     */
    private toChild(parent: WorkingRecord, block: ContentBlock, url: string, confidence: ResolvedConfidenceScale): WorkingRecord {
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', url));
        if (block.Text) {
            child.Propose('Text', block.Text, confidence.ExtractorText, EXTRACT_STAGE);
            child.SetExtension('Pipeline', 'checksum', this.sha256Text(block.Text));
        }
        if (block.Title) {
            child.Propose('Title', block.Title, block.TitleConfidence ?? confidence.ExtractorTitle, EXTRACT_STAGE);
        }
        const parentDate = parent.Get('Date');
        if (parentDate) {
            child.Propose('Date', parentDate, parent.GetConfidence('Date'), `${EXTRACT_STAGE}.InheritedFromParent`);
        }
        if (block.FileType) {
            child.Propose('FileType', block.FileType, confidence.FileTypeExtension, `${EXTRACT_STAGE}.Split`);
        }
        if (block.ExtractorKeyOverride) {
            // For this run, and as a column for the child's own turn in a later one.
            child.SetExtension('Pipeline', 'extractorKeyOverride', block.ExtractorKeyOverride);
            this.setColumns(child, { ExtractorKeyOverride: block.ExtractorKeyOverride });
        }
        this.applyExtractExtensions(child, block.Columns, block.Request);
        return child;
    }

    /** Attach custom columns and downstream pipeline requests returned by an extractor or block. */
    private applyExtractExtensions(
        record: WorkingRecord,
        columns: Record<string, unknown> | undefined,
        request: string | undefined,
    ): void {
        if (columns && Object.keys(columns).length > 0) {
            const existing = record.GetExtension<Record<string, unknown>>('Pipeline', 'customColumns') ?? {};
            record.SetExtension('Pipeline', 'customColumns', { ...existing, ...columns });
        }
        if (request) {
            record.SetExtension('Pipeline', 'request', request);
        }
    }

    /** SHA-256 hex digest of extracted text. */
    private sha256Text(text: string): string {
        return createHash('sha256').update(text, 'utf8').digest('hex');
    }

    /** SHA-256 hex digest of raw content bytes. */
    private sha256Bytes(bytes: Uint8Array): string {
        return createHash('sha256').update(bytes).digest('hex');
    }

    /** Merge columns the committer writes directly — values nothing competes for on confidence. */
    private setColumns(record: WorkingRecord, columns: Record<string, unknown>): void {
        const existing = record.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {};
        record.SetExtension('Pipeline', 'columns', { ...existing, ...columns });
    }

    /** This run's detection rules, loaded once. */
    private detection(context: StageContext): DetectionCatalog {
        this._detection ??= new DetectionCatalog(context.Provider, context.ContextUser);
        return this._detection;
    }

    /**
     * The source's settings and the extractor-cascade rungs that come from configuration.
     * Precedence across settings: Item override → Run Configuration → Content Source → Content Source Type / Content Type → File Type / Default.
     */
    private async resolveSource(record: WorkingRecord, context: StageContext): Promise<ResolvedSource> {
        const contentSourceID = record.GetExtension<string>('Pipeline', 'contentSourceID') ?? '';
        const resolver = new ContentSourceConfigurationResolver(context.Provider, context.ContextUser);
        const resolved = contentSourceID ? await resolver.Resolve(contentSourceID, context.ContextUser) : null;
        const typeConfig = resolved?.TypeConfiguration ?? {};
        const sourceConfig = resolved?.Configuration ?? {};
        const settings = resolved?.Settings ?? {};
        const configured = (key: string) =>
            (context.Configuration[key] as string | undefined) ??
            (sourceConfig[key] as string | undefined) ??
            (settings[key] as string | undefined) ??
            (typeConfig[key] as string | undefined) ??
            null;
        const runExtractors = context.Configuration.Extractors as Record<string, string> | undefined;
        const sourceExtractors = {
            ...(settings.Extractors as Record<string, string> | undefined),
            ...(sourceConfig.Extractors as Record<string, string> | undefined),
        };
        const typeExtractors = typeConfig.Extractors as Record<string, string> | undefined;
        return {
            ContentSourceID: contentSourceID,
            Resolved: resolved,
            Parameters: resolved?.Parameters ?? {},
            Confidence: ResolveConfidence(resolved?.Confidence, context.Configuration),
            RunExtractors: runExtractors && Object.keys(runExtractors).length > 0 ? runExtractors : undefined,
            RunExtractorKey: (context.Configuration.ExtractorKey as string | undefined) ?? null,
            SourceExtractors: Object.keys(sourceExtractors).length > 0 ? sourceExtractors : undefined,
            SourceExtractorKey:
                (sourceConfig.ExtractorKey as string | undefined) ?? (settings.ExtractorKey as string | undefined) ?? null,
            TypeExtractors: typeExtractors && Object.keys(typeExtractors).length > 0 ? typeExtractors : undefined,
            ContentTypeExtractorKey:
                (await this.contentTypeExtractorKey(contentSourceID, context)) ?? (typeConfig.ExtractorKey as string | undefined) ?? null,
            MultiModalEnabled:
                typeof context.Configuration.MultiModalEnabled === 'boolean'
                    ? context.Configuration.MultiModalEnabled
                    : typeof sourceConfig.MultiModalEnabled === 'boolean'
                      ? sourceConfig.MultiModalEnabled
                      : typeof settings.MultiModalEnabled === 'boolean'
                        ? settings.MultiModalEnabled
                        : typeof typeConfig.MultiModalEnabled === 'boolean'
                          ? typeConfig.MultiModalEnabled
                          : context.Configuration.SupportsMultiModal === true || typeConfig.SupportsMultiModal === true,
            FileStorageAccountID: configured('FileStorageAccountID'),
            ObjectKeyTemplate: configured('ObjectKeyTemplate'),
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
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** An extractor ran. */
interface ReadResult {
    Kind: 'Read';
    FileType: string;
    Key: string;
    Result: ExtractResult;
    IsArchive?: boolean;
}

/** Where detection sent the bytes. */
type ReadOutcome = { Kind: 'NonText'; FileType: string } | { Kind: 'NoExtractor'; FileType: string } | ReadResult;

/** What Extract needs to know about the source behind a record. */
interface ResolvedSource {
    ContentSourceID: string;
    /** The full resolved configuration; null when the record names no source. */
    Resolved: ResolvedSourceConfiguration | null;
    Parameters: Readonly<Record<string, string>>;
    Confidence: ResolvedConfidenceScale;
    RunExtractors: Readonly<Record<string, string>> | undefined;
    RunExtractorKey: string | null;
    SourceExtractors: Readonly<Record<string, string>> | undefined;
    SourceExtractorKey: string | null;
    TypeExtractors: Readonly<Record<string, string>> | undefined;
    ContentTypeExtractorKey: string | null;
    MultiModalEnabled: boolean;
    FileStorageAccountID: string | null;
    /** e.g. `{TenantID}/{ContentSourceID}/{RecordID}-{Name}`. */
    ObjectKeyTemplate: string | null;
    /** Values for placeholders the pipeline does not know itself, such as a tenant id. */
    ObjectKeyValues: Readonly<Record<string, string>>;
}
