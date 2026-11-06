/**
 * @fileoverview {@link WorkingRecordCommitter} — writes a working record's changes back. With the hydrator,
 * the only place the pipeline touches the database.
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseEntity, CompositeKey, IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, MJContentFileTypeEntity, MJContentSourceEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { FieldConfidenceMap, PipelineStageRequest, WellKnownField, WorkingRecord } from '@memberjunction/content-pipeline-base';
import { GetEntityFieldMap, GetEntityName, GetStatusFields } from './EntityFieldMap.js';
import { WhereEqual } from './Filters.js';

/** Columns a child record inherits from whatever produced it. */
export type ChildCommitDefaults = Readonly<Record<string, unknown>>;

/** What a commit did, for the run's detail row. */
export interface CommitResult {
    RecordID: string;
    ColumnsWritten: readonly string[];
    /** Whether a row was created rather than updated. */
    Created: boolean;
}

/**
 * Columns owned by the pipeline framework or mapped from well-known fields. A driver or extractor may
 * not overwrite these through `DiscoveredItem.Columns` / `ExtractResult.Columns` / `ContentBlock.Columns`.
 */
const FRAMEWORK_OWNED_COLUMNS: ReadonlySet<string> = new Set([
    'ID',
    'ContentSourceID',
    'ContentItemID',
    'ParentID',
    'URL',
    'Checksum',
    'FieldConfidence',
    'ExtractionStatus',
    'TaggingStatus',
    'SegmentationStatus',
    'EmbeddingStatus',
    'DeleteStatus',
    'LastExtractedAt',
    'LastTaggedAt',
    'LastSegmentedAt',
    'LastEmbeddedAt',
    'LastDiscoveredAt',
    'LastSyncedAt',
    'VectorRecordID',
    'FileID',
    'StorageObjectKey',
    'ExtractorKey',
    'ExtractorKeyOverride',
    'EmbeddingModelID',
    'Sequence',
    'ForceDiscovery',
    'Name',
    'Text',
    'Date',
    'Modality',
    'Decorator',
    'ContentTypeID',
    'ContentSourceTypeID',
    'ContentFileTypeID',
]);

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * Writes the well-known fields that changed, plus the stage's status, through the standard save path.
 * A commit is safe to repeat: nothing here depends on the record's prior state.
 */
export class WorkingRecordCommitter {
    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
    ) {}

    /**
     * Write a working record's changes and set `statusField` to `status`. Columns a stage set directly
     * (`Pipeline.columns`) are always written; `Pipeline.completionColumns` only when the stage succeeded.
     */
    public async Commit(record: WorkingRecord, statusField: string | null, status: string, succeeded = true): Promise<CommitResult> {
        const entityObject = await this.load(record);
        const created = !record.Identity.IsPersisted;
        const storedChecksum = this.readString(entityObject, 'Checksum');
        const { written, unresolved, changedNonTextFields } = await this.applyChangedFields(record, entityObject);
        const customWritten = this.applyCustomColumns(record, entityObject);
        written.push(...customWritten);
        written.push(...this.applyColumns(record, entityObject));
        if (succeeded) {
            written.push(...this.applyColumns(record, entityObject, 'completionColumns'));
        }
        const resetConfidence = await this.reconcileExtractedContent(
            record,
            entityObject,
            statusField,
            status,
            storedChecksum,
            changedNonTextFields.length > 0 || customWritten.length > 0,
            written,
        );
        if (statusField && this.hasField(entityObject, statusField)) {
            this.writeColumn(entityObject, statusField, status);
            written.push(statusField);
        }
        this.applyConfidence(record, entityObject, written, resetConfidence, unresolved);
        this.applyCompletionSignal(record, entityObject, statusField, written);
        return this.save(record, entityObject, written, created);
    }

    /**
     * Commit a record another one produced (a discovered item, an archive member, a chunk). Re-runs
     * produce the same records again, so a child is matched to its existing row by URL; an unchanged
     * existing child is a no-op, and a changed one resets every downstream stage.
     */
    public async CommitChild(
        child: WorkingRecord,
        parentDefaults: ChildCommitDefaults,
        statusField: string,
        status: string,
    ): Promise<CommitResult> {
        await this.matchExisting(child, parentDefaults);
        const created = !child.Identity.IsPersisted;
        const entityObject = await this.load(child);
        const wasPendingDelete = !created && this.readColumn(entityObject, 'DeleteStatus') === 'Pending';
        const storedDateBefore = this.readColumn(entityObject, 'Date');
        const storedConfidence = created || wasPendingDelete ? {} : this.parseConfidence(this.readString(entityObject, 'FieldConfidence'));
        if (created) {
            await this.seedCreatedChild(child, entityObject, parentDefaults);
        }
        const { written, unresolved } = await this.applyChangedFields(child, entityObject, storedConfidence);
        written.push(...this.applyCustomColumns(child, entityObject));
        if (wasPendingDelete) {
            this.writeColumn(entityObject, 'DeleteStatus', null);
            written.push('DeleteStatus');
        }
        return this.finalizeChildCommit(
            child,
            entityObject,
            statusField,
            status,
            created,
            wasPendingDelete,
            storedDateBefore,
            written,
            unresolved,
            storedConfidence,
        );
    }

    private async seedCreatedChild(child: WorkingRecord, entityObject: BaseEntity, parentDefaults: ChildCommitDefaults): Promise<void> {
        this.applyValues(entityObject, {
            ...parentDefaults,
            ...(await this.inheritedColumns(child, parentDefaults)),
            ...(child.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
        });
        const extractedHash = child.GetExtension<string>('Pipeline', 'checksum');
        if (extractedHash) {
            this.applyValues(entityObject, { Checksum: extractedHash });
        }
    }

    /** Reconcile status transitions and downstream resets for a child record before saving. */
    private async finalizeChildCommit(
        child: WorkingRecord,
        entityObject: BaseEntity,
        statusField: string,
        status: string,
        created: boolean,
        wasPendingDelete: boolean,
        storedDateBefore: unknown,
        written: string[],
        unresolved: ReadonlySet<WellKnownField>,
        storedConfidence: FieldConfidenceMap,
    ): Promise<CommitResult> {
        const request = child.GetExtension<PipelineStageRequest>('Pipeline', 'request');
        if (created) {
            this.writeColumn(entityObject, statusField, status);
            written.push(statusField);
            if (request === 'MetadataChanged' && this.hasField(entityObject, 'EmbeddingStatus')) {
                this.writeColumn(entityObject, 'EmbeddingStatus', 'MetadataOnly');
                written.push('EmbeddingStatus');
            }
            this.applyConfidence(child, entityObject, written, false, unresolved);
            this.applyCompletionSignal(child, entityObject, statusField, written);
            return this.save(child, entityObject, written, true);
        }
        if (!this.hasContentSignal(child)) {
            return this.commitDiscoveredExistingChild(
                child,
                entityObject,
                statusField,
                status,
                wasPendingDelete,
                storedDateBefore,
                request,
                written,
                unresolved,
                storedConfidence,
            );
        }
        return this.commitContentBearingExistingChild(
            child,
            entityObject,
            statusField,
            status,
            wasPendingDelete,
            request,
            written,
            unresolved,
            storedConfidence,
        );
    }

    /** Commit an existing child yielded by Discover without inline text or checksum. */
    private async commitDiscoveredExistingChild(
        child: WorkingRecord,
        entityObject: BaseEntity,
        statusField: string,
        status: string,
        wasPendingDelete: boolean,
        storedDateBefore: unknown,
        request: PipelineStageRequest | undefined,
        written: string[],
        unresolved: ReadonlySet<WellKnownField>,
        storedConfidence: FieldConfidenceMap,
    ): Promise<CommitResult> {
        if (wasPendingDelete || request === 'Reprocess') {
            return this.resetAndSaveDiscoveredChild(child, entityObject, statusField, status, wasPendingDelete, written, unresolved);
        }
        if (request === 'MetadataChanged') {
            await this.promoteEmbeddingToMetadataOnly(entityObject, written);
            this.applyConfidence(child, entityObject, written, false, unresolved, storedConfidence);
            return this.save(child, entityObject, written, false);
        }
        const isSyncWalk = child.GetExtension<boolean>('Pipeline', 'syncWalk') === true;
        const hasDateProposal = child.ChangedFields.includes('Date');
        const dateChanged = hasDateProposal && !this.datesEqual(storedDateBefore, child.Get('Date'));
        const dateUnchanged = hasDateProposal && !dateChanged;
        const nonDateMetadataChanged = written.some((c) => c !== 'Date');
        const currentStatus = this.readColumn(entityObject, statusField);
        if ((isSyncWalk || dateUnchanged) && request !== 'Reextract' && (currentStatus === 'Complete' || currentStatus === 'Skipped')) {
            if (nonDateMetadataChanged) {
                await this.promoteEmbeddingToMetadataOnly(entityObject, written);
            }
            if (dateChanged) {
                this.writeColumn(entityObject, statusField, status);
                written.push(statusField);
            } else if (written.length === 0) {
                return { RecordID: this.readColumn(entityObject, 'ID') as string, ColumnsWritten: [], Created: false };
            }
            this.applyConfidence(child, entityObject, written, false, unresolved, storedConfidence);
            return this.save(child, entityObject, written, false);
        }
        if (nonDateMetadataChanged) {
            await this.promoteEmbeddingToMetadataOnly(entityObject, written);
        }
        this.writeColumn(entityObject, statusField, status);
        written.push(statusField);
        this.applyConfidence(child, entityObject, written, false, unresolved, storedConfidence);
        this.applyCompletionSignal(child, entityObject, statusField, written);
        return this.save(child, entityObject, written, false);
    }

    private async resetAndSaveDiscoveredChild(
        child: WorkingRecord,
        entityObject: BaseEntity,
        statusField: string,
        status: string,
        clearChecksum: boolean,
        written: string[],
        unresolved: ReadonlySet<WellKnownField>,
    ): Promise<CommitResult> {
        if (clearChecksum && this.hasField(entityObject, 'Checksum') && this.readColumn(entityObject, 'Checksum') != null) {
            this.writeColumn(entityObject, 'Checksum', null);
            written.push('Checksum');
        }
        this.writeColumn(entityObject, statusField, status);
        written.push(statusField, ...this.resetDownstream(child, entityObject, statusField));
        this.applyConfidence(child, entityObject, written, true, unresolved);
        this.applyCompletionSignal(child, entityObject, statusField, written);
        return this.save(child, entityObject, written, false);
    }

    /** Commit an existing child that carries inline checksum or text (e.g. Entity driver, archive member). */
    private async commitContentBearingExistingChild(
        child: WorkingRecord,
        entityObject: BaseEntity,
        statusField: string,
        status: string,
        wasPendingDelete: boolean,
        request: PipelineStageRequest | undefined,
        written: string[],
        unresolved: ReadonlySet<WellKnownField>,
        storedConfidence: FieldConfidenceMap,
    ): Promise<CommitResult> {
        const changed = this.contentChanged(child, entityObject);
        const forceReprocess = request === 'Reprocess';
        if (!changed && !forceReprocess && !wasPendingDelete && request !== 'Reextract') {
            if (written.length === 0 && request !== 'MetadataChanged') {
                return { RecordID: this.readColumn(entityObject, 'ID') as string, ColumnsWritten: [], Created: false };
            }
            await this.promoteEmbeddingToMetadataOnly(entityObject, written);
            this.applyConfidence(child, entityObject, written, false, unresolved, storedConfidence);
            return this.save(child, entityObject, written, false);
        }
        this.writeColumn(entityObject, statusField, status);
        written.push(statusField);
        const resetAll = changed || forceReprocess || wasPendingDelete;
        if (resetAll) {
            written.push(...this.resetDownstream(child, entityObject, statusField));
            written.push(...this.applyColumns(child, entityObject));
            const extractedHash = child.GetExtension<string>('Pipeline', 'checksum');
            if (extractedHash) {
                written.push(...this.applyValues(entityObject, { Checksum: extractedHash }));
            }
        }
        this.applyConfidence(child, entityObject, written, resetAll, unresolved, storedConfidence);
        this.applyCompletionSignal(child, entityObject, statusField, written);
        return this.save(child, entityObject, written, false);
    }

    /**
     * Compare the SHA-256 checksum produced by Extract against `ContentItem.Checksum`.
     * Same hash leaves `TaggingStatus`/`SegmentationStatus` untouched (and promotes `EmbeddingStatus` to
     * `MetadataOnly` when metadata changed); a changed hash writes `Checksum` and resets downstream stages.
     * A stored `Checksum` that is null or not a 64-character SHA-256 hex digest is replaced with the
     * extracted content hash without resetting downstream stages.
     */
    private async reconcileExtractedContent(
        record: WorkingRecord,
        entityObject: BaseEntity,
        statusField: string | null,
        status: string,
        storedChecksum: string | null,
        metadataChanged: boolean,
        written: string[],
    ): Promise<boolean> {
        const request = record.GetExtension<PipelineStageRequest>('Pipeline', 'request');
        if (record.Entity !== 'Content Item' || statusField !== 'ExtractionStatus' || status !== 'Complete') {
            if (request === 'MetadataChanged') {
                await this.promoteEmbeddingToMetadataOnly(entityObject, written);
            }
            return false;
        }
        const extractedChecksum = record.GetExtension<string>('Pipeline', 'checksum');
        if (!extractedChecksum) {
            return false;
        }
        const isValidStoredHash = storedChecksum !== null && SHA256_HEX_PATTERN.test(storedChecksum);
        if (!isValidStoredHash) {
            written.push(...this.applyValues(entityObject, { Checksum: extractedChecksum }));
            if (request === 'Reprocess') {
                written.push(...this.resetDownstream(record, entityObject, statusField));
                return true;
            }
            if (metadataChanged || request === 'MetadataChanged') {
                await this.promoteEmbeddingToMetadataOnly(entityObject, written);
            }
            return false;
        }
        if (extractedChecksum === storedChecksum && request !== 'Reprocess') {
            if (metadataChanged || request === 'MetadataChanged') {
                await this.promoteEmbeddingToMetadataOnly(entityObject, written);
            }
            return false;
        }
        written.push(...this.applyValues(entityObject, { Checksum: extractedChecksum }));
        written.push(...this.resetDownstream(record, entityObject, statusField));
        return true;
    }

    /** Set `EmbeddingStatus = 'MetadataOnly'` on the item and any live embedded chunks when metadata changed. */
    private async promoteEmbeddingToMetadataOnly(entityObject: BaseEntity, written: string[]): Promise<void> {
        if (this.hasField(entityObject, 'EmbeddingStatus') && this.readColumn(entityObject, 'EmbeddingStatus') === 'Complete') {
            this.writeColumn(entityObject, 'EmbeddingStatus', 'MetadataOnly');
            written.push('EmbeddingStatus');
        }
        const itemID = this.hasField(entityObject, 'ExtractionStatus') ? this.readString(entityObject, 'ID') : null;
        if (!itemID || typeof (this.provider as { RunView?: unknown })?.RunView !== 'function') {
            return;
        }
        const chunks = await RunView.FromMetadataProvider(this.provider).RunView<BaseEntity>(
            {
                EntityName: 'MJ: Content Item Chunks',
                ExtraFilter: WhereEqual({ ContentItemID: itemID, EmbeddingStatus: 'Complete', DeleteStatus: null }),
                ResultType: 'entity_object',
            },
            this.contextUser,
        );
        if (!chunks.Success) {
            LogError(`WorkingRecordCommitter: could not query chunks of '${itemID}' for MetadataOnly promotion: ${chunks.ErrorMessage}`);
            return;
        }
        for (const chunk of chunks.Results) {
            this.writeColumn(chunk, 'EmbeddingStatus', 'MetadataOnly');
            if (!(await chunk.Save())) {
                LogError(`WorkingRecordCommitter: could not mark chunk of '${itemID}' MetadataOnly: ${chunk.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
    }

    private async save(record: WorkingRecord, entityObject: BaseEntity, written: string[], created: boolean): Promise<CommitResult> {
        const existingID = this.readString(entityObject, 'ID');
        if (!created && written.length === 0 && existingID) {
            record.ClearChanged();
            return { RecordID: existingID, ColumnsWritten: [], Created: false };
        }
        if (!(await entityObject.Save())) {
            throw new Error(`Failed to commit ${GetEntityName(record.Entity)} '${record.Identity.Key}': ${this.describeFailure(entityObject)}`);
        }
        const recordID = this.readColumn(entityObject, 'ID') as string;
        record.Identity.RecordID = recordID;
        record.ClearChanged();
        return { RecordID: recordID, ColumnsWritten: written, Created: created };
    }

    /** True when the child carries inline content or a framework-computed checksum to compare against stored values. */
    private hasContentSignal(child: WorkingRecord): boolean {
        const pipelineChecksum = child.GetExtension<string>('Pipeline', 'checksum');
        const text = child.Get('Text');
        return (
            (typeof pipelineChecksum === 'string' && pipelineChecksum.length > 0) ||
            (typeof text === 'string' && text.length > 0)
        );
    }

    /**
     * Whether a produced record's content differs from what is stored. The SHA-256 checksum computed by
     * Discover (for inline text) or Extract is the primary signal; text is the fallback for records
     * produced with text but no checksum. Neither means nothing says the content moved.
     */
    private contentChanged(child: WorkingRecord, entityObject: BaseEntity): boolean {
        const checksum = child.GetExtension<string>('Pipeline', 'checksum');
        if (typeof checksum === 'string' && checksum.length > 0) {
            return this.readColumn(entityObject, 'Checksum') !== checksum;
        }
        const text = child.Get('Text');
        return typeof text === 'string' && text.length > 0 && this.readColumn(entityObject, 'Text') !== text;
    }

    /** Put every later stage back to Pending — flat, so it never relies on an intermediate stage running. */
    private resetDownstream(child: WorkingRecord, entityObject: BaseEntity, statusField: string): string[] {
        const fields = GetStatusFields(child.Entity);
        const later = fields.slice(fields.indexOf(statusField) + 1);
        return this.applyValues(entityObject, Object.fromEntries(later.map((f) => [f, 'Pending'])));
    }

    /** `LatestResult.Message` is often empty while `Errors` holds the per-field failures. */
    private describeFailure(entityObject: BaseEntity): string {
        const result = entityObject.LatestResult;
        const errors = (result?.Errors ?? [])
            .map((e) => (typeof e === 'string' ? e : `${e.Source ?? 'record'}: ${e.Message ?? String(e)}`))
            .join('; ');
        return errors || result?.Message || result?.CompleteMessage || 'unknown error';
    }

    /**
     * Point a produced Content Item at its existing row: first live (`DeleteStatus IS NULL`), then pending
     * deletion (`DeleteStatus = 'Pending'`, so an item returning before Delete runs is revived rather than
     * duplicated). A row with `DeleteStatus = 'Deleted'` is a tombstone and is never matched.
     */
    private async matchExisting(child: WorkingRecord, parentDefaults: ChildCommitDefaults): Promise<void> {
        const filter = child.Identity.IsPersisted ? null : this.matchFilter(child, parentDefaults);
        if (!filter) {
            return;
        }
        const liveID = await this.findMatchingID(child.Entity, filter);
        if (liveID) {
            child.Identity.RecordID = liveID;
            return;
        }
        const pendingFilter = this.pendingDeleteMatchFilter(child, parentDefaults);
        if (pendingFilter) {
            const pendingID = await this.findMatchingID(child.Entity, pendingFilter);
            if (pendingID) {
                child.Identity.RecordID = pendingID;
            }
        }
    }

    private async findMatchingID(entity: WorkingRecord['Entity'], extraFilter: string): Promise<string | null> {
        const result = await RunView.FromMetadataProvider(this.provider).RunView<{ ID: string }>(
            {
                EntityName: GetEntityName(entity),
                ExtraFilter: extraFilter,
                OrderBy: '__mj_CreatedAt',
                Fields: ['ID'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            this.contextUser,
        );
        if (!result.Success) {
            throw new Error(`Failed to match existing ${GetEntityName(entity)}: ${result.ErrorMessage}`);
        }
        return result.Results[0]?.ID ?? null;
    }

    private matchFilter(child: WorkingRecord, parentDefaults: ChildCommitDefaults): string | null {
        const sourceID = parentDefaults.ContentSourceID;
        if (child.Entity === 'Content Item Chunk' || typeof sourceID !== 'string' || !child.Identity.EphemeralID) {
            return null;
        }
        return WhereEqual({ ContentSourceID: sourceID, URL: child.Identity.EphemeralID, DeleteStatus: null });
    }

    private pendingDeleteMatchFilter(child: WorkingRecord, parentDefaults: ChildCommitDefaults): string | null {
        const sourceID = parentDefaults.ContentSourceID;
        if (child.Entity === 'Content Item Chunk' || typeof sourceID !== 'string' || !child.Identity.EphemeralID) {
            return null;
        }
        return WhereEqual({ ContentSourceID: sourceID, URL: child.Identity.EphemeralID, DeleteStatus: 'Pending' });
    }

    private applyColumns(record: WorkingRecord, entityObject: BaseEntity, extension: 'columns' | 'completionColumns' = 'columns'): string[] {
        return this.applyValues(entityObject, record.GetExtension<Record<string, unknown>>('Pipeline', extension) ?? {});
    }

    /**
     * Validate and write custom columns from `Pipeline.customColumns`. Rejects framework-owned columns
     * and unknown fields; returns only the columns whose stored value actually changed.
     */
    private applyCustomColumns(record: WorkingRecord, entityObject: BaseEntity): string[] {
        const custom = record.GetExtension<Record<string, unknown>>('Pipeline', 'customColumns');
        if (!custom) {
            return [];
        }
        const written: string[] = [];
        for (const [column, value] of Object.entries(custom)) {
            if (FRAMEWORK_OWNED_COLUMNS.has(column) || column.startsWith('__mj_')) {
                throw new Error(
                    `Column '${column}' on ${GetEntityName(record.Entity)} is owned by the pipeline framework and cannot be set via Columns`,
                );
            }
            if (entityObject.Fields.length > 0 && !this.hasField(entityObject, column)) {
                throw new Error(`Column '${column}' does not exist on ${GetEntityName(record.Entity)}`);
            }
            const previous = this.readColumn(entityObject, column);
            const changed = value instanceof Date ? !this.datesEqual(previous, value) : previous !== value;
            if (value !== undefined && changed) {
                this.writeColumn(entityObject, column, value);
                written.push(column);
            }
        }
        return written;
    }

    /** Set each non-null value whose column this entity has; returns the columns written. */
    private applyValues(entityObject: BaseEntity, values: Record<string, unknown>): string[] {
        const written: string[] = [];
        for (const [column, value] of Object.entries(values)) {
            if (value !== undefined && value !== null && this.hasField(entityObject, column)) {
                this.writeColumn(entityObject, column, value);
                written.push(column);
            }
        }
        return written;
    }

    /** Load the existing row, or start a new one for a record that has only just been produced. */
    private async load(record: WorkingRecord): Promise<BaseEntity> {
        const entityObject = await this.provider.GetEntityObject<BaseEntity>(GetEntityName(record.Entity), this.contextUser);
        if (record.Identity.RecordID) {
            if (!(await entityObject.InnerLoad(CompositeKey.FromID(record.Identity.RecordID)))) { // first-pk-ok: MJ core content entity, single-column ID
                throw new Error(`${GetEntityName(record.Entity)} record '${record.Identity.RecordID}' vanished before commit`);
            }
        } else {
            entityObject.NewRecord();
            this.applyValues(entityObject, { URL: record.Identity.EphemeralID || null });
        }
        return entityObject;
    }

    /** A new Content Item takes its content type, source type and file type from its source. */
    private async inheritedColumns(child: WorkingRecord, parentDefaults: ChildCommitDefaults): Promise<Record<string, unknown>> {
        const contentSourceID = parentDefaults.ContentSourceID;
        if (child.Entity !== 'Content Item' || typeof contentSourceID !== 'string') {
            return {};
        }
        const source = await this.contentSource(contentSourceID);
        return {
            ContentTypeID: source.ContentTypeID,
            ContentSourceTypeID: source.ContentSourceTypeID,
            ContentFileTypeID: source.ContentFileTypeID,
        };
    }

    private async contentSource(contentSourceID: string): Promise<MJContentSourceEntity> {
        const engine = KnowledgeHubMetadataEngine.Instance;
        await engine.Config(false, this.contextUser, this.provider);
        let source = engine.GetContentSourceByID(contentSourceID);
        if (!source) {
            await engine.Config(true, this.contextUser, this.provider);
            source = engine.GetContentSourceByID(contentSourceID);
        }
        if (!source) {
            throw new Error(`Content Source '${contentSourceID}' could not be loaded to seed its items`);
        }
        return source;
    }

    /**
     * Write the changed well-known fields through the column map. Returns the columns written, any
     * non-Text columns whose stored value changed, and the lookup fields whose name matched no row.
     */
    private async applyChangedFields(
        record: WorkingRecord,
        entityObject: BaseEntity,
        storedConfidence: FieldConfidenceMap = {},
    ): Promise<{ written: string[]; unresolved: Set<WellKnownField>; changedNonTextFields: string[] }> {
        const map = GetEntityFieldMap(record.Entity);
        const written: string[] = [];
        const changedNonTextFields: string[] = [];
        const unresolved = new Set<WellKnownField>();
        for (const field of record.ChangedFields) {
            const mapping = map[field];
            const priorConfidence = storedConfidence[field];
            const currentField = record.GetField(field);
            const sameStage =
                priorConfidence != null &&
                currentField != null &&
                priorConfidence.SetBy.split('.')[0] === currentField.SetBy.split('.')[0];
            if (!mapping || (priorConfidence && !sameStage && priorConfidence.Score > record.GetConfidence(field))) {
                continue; // no column on this entity, or an existing higher-confidence stage already owns the field
            }
            const value = mapping.Kind === 'Lookup' ? await this.lookupID(mapping.LookupEntity, String(record.Get(field) ?? '')) : record.Get(field);
            if (mapping.Kind === 'Lookup' && !value) {
                unresolved.add(field);
                continue;
            }
            const previous = this.readColumn(entityObject, mapping.Column);
            const valueChanged =
                mapping.Kind === 'Date'
                    ? !this.datesEqual(previous, value)
                    : mapping.Kind === 'Lookup' && typeof previous === 'string' && typeof value === 'string'
                      ? !UUIDsEqual(previous, value)
                      : previous !== value;
            this.writeColumn(entityObject, mapping.Column, value);
            if (valueChanged) {
                written.push(mapping.Column);
                if (field !== 'Text') {
                    changedNonTextFields.push(mapping.Column);
                }
            }
        }
        return { written, unresolved, changedNonTextFields };
    }

    /** A Content Type / Content File Type name or extension → its id (case-insensitive), refreshing once on cache miss. */
    private async lookupID(entityName: string | undefined, name: string): Promise<string | null> {
        const key = name.trim().toLowerCase();
        if (!key) {
            return null;
        }
        const engine = KnowledgeHubMetadataEngine.Instance;
        await engine.Config(false, this.contextUser, this.provider);
        let id = this.findLookupMatch(engine, entityName, key);
        if (!id) {
            await engine.Config(true, this.contextUser, this.provider);
            id = this.findLookupMatch(engine, entityName, key);
        }
        if (!id) {
            LogStatus(`WorkingRecordCommitter: no '${entityName}' row named '${name}'; leaving the column unset.`);
        }
        return id;
    }

    private findLookupMatch(engine: KnowledgeHubMetadataEngine, entityName: string | undefined, key: string): string | null {
        if (entityName === 'MJ: Content Types') {
            return engine.ContentTypes.find((r) => r.Name.trim().toLowerCase() === key)?.ID ?? null;
        }
        const bareKey = key.replace(/^\./, '');
        const match = engine.ContentFileTypes.find((r: MJContentFileTypeEntity) => {
            if (r.Name.trim().toLowerCase() === key || r.Name.trim().toLowerCase() === bareKey) {
                return true;
            }
            const ext = r.FileExtension?.trim().replace(/^\./, '').toLowerCase();
            return ext === bareKey;
        });
        return match?.ID ?? null;
    }

    /**
     * Persist each resolved field's provenance. Content that moved on clears it, so stages re-propose into an
     * empty map rather than tying with — and losing to — their own stale result.
     */
    private applyConfidence(
        record: WorkingRecord,
        entityObject: BaseEntity,
        written: string[],
        reset = false,
        unresolved: ReadonlySet<WellKnownField> = new Set(),
        storedConfidence: FieldConfidenceMap = {},
    ): void {
        if (!this.hasField(entityObject, 'FieldConfidence')) {
            return;
        }
        if (reset) {
            this.writeColumn(entityObject, 'FieldConfidence', null);
            written.push('FieldConfidence');
            return;
        }
        const merged: FieldConfidenceMap = { ...storedConfidence };
        for (const [field, entry] of Object.entries(record.ToFieldConfidence()) as [WellKnownField, NonNullable<FieldConfidenceMap[WellKnownField]>][]) {
            if (unresolved.has(field)) {
                continue;
            }
            const prior = merged[field];
            const sameStage = prior != null && prior.SetBy.split('.')[0] === entry.SetBy.split('.')[0];
            if (!prior || sameStage || entry.Score >= prior.Score) {
                merged[field] = entry;
            }
        }
        const serialized = JSON.stringify(merged);
        if (this.readColumn(entityObject, 'FieldConfidence') !== serialized) {
            this.writeColumn(entityObject, 'FieldConfidence', serialized);
            written.push('FieldConfidence');
        }
    }

    private parseConfidence(raw: string | null): FieldConfidenceMap {
        if (!raw) {
            return {};
        }
        try {
            const parsed: unknown = JSON.parse(raw);
            return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as FieldConfidenceMap) : {};
        } catch {
            return {};
        }
    }

    /**
     * The completion signal: every other status still Pending (or unset) becomes Skipped so no later stage
     * picks the record up. A stage that ran and recorded Failed or Complete keeps that.
     */
    private applyCompletionSignal(record: WorkingRecord, entityObject: BaseEntity, statusField: string | null, written: string[]): void {
        if (!record.IsComplete) {
            return;
        }
        const pending = GetStatusFields(record.Entity).filter((f) => {
            if (f === statusField || !this.hasField(entityObject, f)) {
                return false;
            }
            const current = this.readColumn(entityObject, f);
            return current === 'Pending' || current == null;
        });
        written.push(...this.applyValues(entityObject, Object.fromEntries(pending.map((f) => [f, 'Skipped']))));
    }

    private hasField(entityObject: BaseEntity, column: string): boolean {
        return entityObject.Fields.some((f) => f.Name === column);
    }

    private readColumn(entityObject: BaseEntity, column: string): unknown {
        return (entityObject as unknown as Record<string, unknown>)[column];
    }

    private readString(entityObject: BaseEntity, column: string): string | null {
        const value = this.hasField(entityObject, column) ? this.readColumn(entityObject, column) : null;
        return typeof value === 'string' && value.length > 0 ? value : null;
    }

    private writeColumn(entityObject: BaseEntity, column: string, value: unknown): void {
        (entityObject as unknown as Record<string, unknown>)[column] = value;
    }

    private datesEqual(a: unknown, b: unknown): boolean {
        const toMs = (v: unknown): number | null => {
            if (v instanceof Date) return v.getTime();
            if (typeof v === 'string' && v.length > 0) {
                const n = new Date(v).getTime();
                return Number.isNaN(n) ? null : n;
            }
            return null;
        };
        const msA = toMs(a);
        const msB = toMs(b);
        return msA !== null && msB !== null && msA === msB;
    }
}
