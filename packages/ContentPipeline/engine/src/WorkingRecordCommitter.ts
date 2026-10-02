/**
 * @fileoverview {@link WorkingRecordCommitter} — writes a working record's changes back.
 *
 * The other of the two places the pipeline touches a database.
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseEntity, CompositeKey, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { WorkingRecord, WorkingRecordEntity } from '@memberjunction/content-pipeline-base';
import { GetEntityFieldMap, GetEntityName, GetStatusFields } from './EntityFieldMap.js';
import { LookupResolver, UnresolvedLookupPolicy } from './LookupResolver.js';

/** Columns a child record inherits from whatever produced it. */
export type ChildCommitDefaults = Readonly<Record<string, unknown>>;

/** What a commit did, for the run's detail row. */
export interface CommitResult {
    /** The record's primary key after the commit. */
    RecordID: string;
    /** The columns actually written. */
    ColumnsWritten: readonly string[];
    /** Whether a row was created rather than updated. */
    Created: boolean;
}

/**
 * Writes the well-known fields that actually changed back to the real entity, through the standard
 * save path, and advances the record's status for the stage that ran.
 *
 * **A commit is safe to repeat.** A worker whose claim expired can finish its work after another
 * worker has picked the same record up; the queue refuses the late settle, but a commit already
 * written still lands. Writing the same resolved fields and status twice leaves the record correct,
 * which is why nothing here depends on the record's prior state.
 */
export class WorkingRecordCommitter {
    private readonly lookups: LookupResolver;

    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
        unresolvedLookupPolicy: UnresolvedLookupPolicy = 'Skip',
    ) {
        this.lookups = new LookupResolver(provider, contextUser, unresolvedLookupPolicy);
    }

    /**
     * Write a working record's changes.
     *
     * @param record The record to commit.
     * @param statusField The status column for the stage that just ran.
     * @param status What to set it to.
     */
    public async Commit(record: WorkingRecord, statusField: string, status: string): Promise<CommitResult> {
        const entityObject = await this.load(record);
        const created = !record.Identity.IsPersisted;
        const written = await this.applyChangedFields(record, entityObject);

        entityObject.Set(statusField, status);
        written.push(statusField);

        this.applyConfidence(record, entityObject, written);
        this.applyCompletionSignal(record, entityObject, statusField, written);

        if (!(await entityObject.Save())) {
            throw new Error(
                `Failed to commit ${GetEntityName(record.Entity)} '${record.Identity.Key}': ` +
                    this.describeFailure(entityObject),
            );
        }

        const recordID = entityObject.Get('ID') as string;
        record.Identity.RecordID = recordID;
        record.ClearChanged();
        return { RecordID: recordID, ColumnsWritten: written, Created: created };
    }

    /**
     * Commit a record produced by working on another one — Discover's found items, a splitting
     * reader's blocks.
     *
     * Differs from {@link Commit} only in what it links: a child carries whatever columns tie it to
     * the record that produced it — a discovered item its source, an expanded item its parent item,
     * a chunk its item.
     */
    public async CommitChild(
        child: WorkingRecord,
        parentDefaults: ChildCommitDefaults,
        statusField: string,
        status: string,
    ): Promise<CommitResult> {
        // Re-discovery and re-extraction produce the same records again. Matching by URL is what
        // turns that into an update rather than a duplicate — and what lets an unchanged record be
        // a genuine no-op instead of a fresh row with a new identity, new chunks and new vectors.
        await this.matchExisting(child, parentDefaults);
        const created = !child.Identity.IsPersisted;
        const entityObject = await this.load(child);
        if (created) {
            const defaults = {
                ...parentDefaults,
                ...(await this.inheritedColumns(child, parentDefaults)),
                // Columns only the producing stage knows — a chunk's Sequence, say.
                ...(child.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}),
            };
            for (const [column, value] of Object.entries(defaults)) {
                if (value !== undefined && value !== null && entityObject.Fields.some((f) => f.Name === column)) {
                    entityObject.Set(column, value);
                }
            }
        }
        const written = await this.applyChangedFields(child, entityObject);

        // An existing record whose content is unchanged is a no-op: re-running every downstream
        // stage over identical content would burn a model call and a vector write to arrive at
        // what is already stored.
        const changed = this.contentChanged(child, entityObject);
        if (!changed && !created) {
            return { RecordID: entityObject.Get('ID') as string, ColumnsWritten: [], Created: false };
        }
        entityObject.Set(statusField, status);
        written.push(statusField);
        if (changed && !created) {
            // Content moved on, so every downstream stage has to redo its work. Reset is flat, and
            // reaches each stage's own status field directly.
            written.push(...this.resetDownstream(child, entityObject, statusField));
        }
        this.applyConfidence(child, entityObject, written);
        this.applyCompletionSignal(child, entityObject, statusField, written);

        if (!(await entityObject.Save())) {
            throw new Error(
                `Failed to commit child ${GetEntityName(child.Entity)} '${child.Identity.Key}': ` +
                    this.describeFailure(entityObject),
            );
        }
        const recordID = entityObject.Get('ID') as string;
        child.Identity.RecordID = recordID;
        child.ClearChanged();
        return { RecordID: recordID, ColumnsWritten: written, Created: true };
    }

    /**
     * Whether a produced record's content differs from what is stored.
     *
     * Compares the text, which is what every downstream stage actually consumes. A record with no
     * text yet — discovered but not extracted — counts as changed, so it proceeds.
     */
    private contentChanged(child: WorkingRecord, entityObject: BaseEntity): boolean {
        const proposed = child.Get('Text');
        if (typeof proposed !== 'string' || proposed.length === 0) {
            return true;
        }
        return entityObject.Get('Text') !== proposed;
    }

    /**
     * Put every stage after this one back to `Pending`.
     *
     * Flat, not propagated: nothing guarantees each intermediate stage runs, and resetting a field
     * nobody acts on is harmless while relying on a stage that never runs leaves the record stuck.
     */
    private resetDownstream(child: WorkingRecord, entityObject: BaseEntity, statusField: string): string[] {
        const fields = GetStatusFields(child.Entity);
        const from = fields.indexOf(statusField);
        const written: string[] = [];
        for (const field of fields.slice(from + 1)) {
            if (entityObject.Fields.some((f) => f.Name === field)) {
                entityObject.Set(field, 'Pending');
                written.push(field);
            }
        }
        return written;
    }

    /**
     * Say what actually went wrong.
     *
     * `LatestResult.Message` is frequently empty while `Errors` holds the per-field validation
     * failures, so reporting only the former turns every validation failure into 'unknown error'.
     */
    private describeFailure(entityObject: BaseEntity): string {
        const result = entityObject.LatestResult;
        const errors = (result?.Errors ?? [])
            .map((e) => (typeof e === 'string' ? e : `${e.Source ?? 'record'}: ${e.Message ?? String(e)}`))
            .join('; ');
        return errors || result?.Message || result?.CompleteMessage || 'unknown error';
    }

    /**
     * Point a produced record at the row it already has, if it has one.
     *
     * Matching is by URL, used as an effectively unique identifier for a source-and-location
     * combination even where it is not a literal URL. The hard requirement this places on whatever
     * produced the record is that the identifier is **stable across re-runs** — an identifier
     * derived from a timestamp or an array position makes every re-run look like a full churn.
     */
    private async matchExisting(child: WorkingRecord, parentDefaults: ChildCommitDefaults): Promise<void> {
        if (child.Identity.IsPersisted || !child.Identity.EphemeralID) {
            return;
        }
        const filter = this.matchFilter(child, parentDefaults);
        if (!filter) {
            return;
        }
        const rv = RunView.FromMetadataProvider(this.provider);
        const result = await rv.RunView<{ ID: string }>(
            { EntityName: GetEntityName(child.Entity), ExtraFilter: filter, MaxRows: 1 },
            this.contextUser,
        );
        if (result.Success && result.Results.length > 0) {
            child.Identity.RecordID = result.Results[0].ID;
        }
    }

    /**
     * How a produced record is recognized as one that already exists.
     *
     * Each entity has its own stable identity, and neither is a free choice:
     *
     * - A **Content Item** is identified by its URL within its source. A URL from one source must
     *   never match a record from another, hence the scope.
     * - A **Content Item Chunk** has no URL at all; it is identified by its position within its
     *   item. Re-segmenting the same text yields the same sequence numbers, so chunk N updates
     *   chunk N rather than minting a replacement — which would orphan the old chunk's vector.
     */
    private matchFilter(child: WorkingRecord, parentDefaults: ChildCommitDefaults): string | null {
        if (child.Entity === 'Content Item Chunk') {
            const itemID = parentDefaults.ContentItemID;
            const sequence = (child.GetExtension<Record<string, unknown>>('Pipeline', 'columns') ?? {}).Sequence;
            return typeof itemID === 'string' && typeof sequence === 'number'
                ? `ContentItemID='${itemID}' AND Sequence=${sequence}`
                : null;
        }
        const sourceID = parentDefaults.ContentSourceID;
        if (typeof sourceID !== 'string' || !child.Identity.EphemeralID) {
            return null;
        }
        return `ContentSourceID='${sourceID}' AND URL='${child.Identity.EphemeralID.replace(/'/g, "''")}'`;
    }

    /** Load the existing row, or start a new one for a record Discover has only just produced. */
    private async load(record: WorkingRecord): Promise<BaseEntity> {
        const entityObject = await this.provider.GetEntityObject<BaseEntity>(
            GetEntityName(record.Entity),
            this.contextUser,
        );
        if (record.Identity.IsPersisted) {
            const recordID = record.Identity.RecordID as string;
            if (!(await entityObject.InnerLoad(CompositeKey.FromID(recordID)))) { // first-pk-ok: MJ core content entity, single-column ID
                throw new Error(
                    `${GetEntityName(record.Entity)} record '${record.Identity.RecordID}' vanished before commit`,
                );
            }
        } else {
            entityObject.NewRecord();
            if (record.Identity.EphemeralID && entityObject.Fields.some((f) => f.Name === 'URL')) {
                entityObject.Set('URL', record.Identity.EphemeralID);
            }
        }
        return entityObject;
    }

    /**
     * Columns a new child must carry that only its parent knows.
     *
     * A Content Item is required to name a content type, a source type and a file type, and the
     * sensible default for all three is whatever its Content Source says — a stage producing items
     * has no opinion about them and should not be made to invent one.
     */
    private async inheritedColumns(
        child: WorkingRecord,
        parentDefaults: ChildCommitDefaults,
    ): Promise<Record<string, unknown>> {
        const contentSourceID = parentDefaults.ContentSourceID;
        if (child.Entity !== 'Content Item' || typeof contentSourceID !== 'string') {
            return {};
        }
        const source = await this.provider.GetEntityObject<BaseEntity>(
            GetEntityName('Content Source'),
            this.contextUser,
        );
        if (!(await source.InnerLoad(CompositeKey.FromID(contentSourceID)))) { // first-pk-ok: MJ core content entity, single-column ID
            throw new Error(`Content Source '${contentSourceID}' could not be loaded to seed its items`);
        }
        return {
            ContentTypeID: source.Get('ContentTypeID'),
            ContentSourceTypeID: source.Get('ContentSourceTypeID'),
            ContentFileTypeID: source.Get('ContentFileTypeID'),
        };
    }

    /** Write only the well-known fields whose values changed, through the declared column map. */
    private async applyChangedFields(record: WorkingRecord, entityObject: BaseEntity): Promise<string[]> {
        const map = GetEntityFieldMap(record.Entity);
        const written: string[] = [];
        for (const field of record.ChangedFields) {
            const mapping = map[field];
            if (!mapping) {
                // The field has no column on this entity. Not an error: a stage may legitimately
                // propose a field that only persists on a different entity.
                continue;
            }
            if (mapping.Kind === 'Lookup') {
                // The working record carries a name; the column wants a foreign key. Resolve it,
                // under whatever policy the deployment set for a name that matches nothing.
                const id = await this.lookups.Resolve(
                    mapping.LookupEntity ?? '',
                    String(record.Get(field) ?? ''),
                );
                if (id) {
                    entityObject.Set(mapping.Column, id);
                    written.push(mapping.Column);
                }
                continue;
            }
            entityObject.Set(mapping.Column, record.Get(field));
            written.push(mapping.Column);
        }
        return written;
    }

    /** Persist the provenance of every resolved field alongside the values. */
    private applyConfidence(record: WorkingRecord, entityObject: BaseEntity, written: string[]): void {
        if (!entityObject.Fields.some((f) => f.Name === 'FieldConfidence')) {
            return;
        }
        entityObject.Set('FieldConfidence', JSON.stringify(record.ToFieldConfidence()));
        written.push('FieldConfidence');
    }

    /**
     * Honour the completion signal: set every downstream status so no later stage treats this
     * record as ready.
     *
     * Only statuses still `Pending` are touched — a stage that genuinely ran and recorded `Failed`
     * keeps that result, because the completion signal means "nothing further need happen", not
     * "pretend everything succeeded".
     */
    private applyCompletionSignal(
        record: WorkingRecord,
        entityObject: BaseEntity,
        statusField: string,
        written: string[],
    ): void {
        if (!record.IsComplete) {
            return;
        }
        for (const field of GetStatusFields(record.Entity)) {
            if (field === statusField || !entityObject.Fields.some((f) => f.Name === field)) {
                continue;
            }
            if (entityObject.Get(field) === 'Pending') {
                entityObject.Set(field, 'Skipped');
                written.push(field);
            }
        }
    }
}
