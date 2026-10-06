/**
 * @fileoverview {@link WorkingRecordHydrator} — builds a working record from what is persisted.
 *
 * One of the two places the pipeline touches a database. Neither belongs to any stage.
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseEntity, CompositeKey, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    FieldConfidenceMap,
    WellKnownField,
    WellKnownFields,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { GetEntityFieldMap, GetEntityName } from './EntityFieldMap.js';

/**
 * Builds working records from persisted rows.
 *
 * This is how every production stage gets its starting point, since each is handed a record
 * reference and nothing else.
 */
/**
 * Stored status columns republished into the working record's `Pipeline` extension space.
 *
 * These are read by gates rather than competed for by stages, so they are extensions rather than
 * well-known fields: nothing proposes them, and nothing resolves them on confidence.
 */
const PIPELINE_STATUS_EXTENSIONS: readonly (readonly [string, string])[] = [
    ['DeleteStatus', 'deleteStatus'],
    ['EmbeddingStatus', 'embeddingStatus'],
];

export class WorkingRecordHydrator {
    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
    ) {}

    /**
     * Load a record and build a working record from it.
     *
     * @param entity Which entity the record belongs to.
     * @param recordID The record's primary key.
     * @throws When the record does not exist — a stage handed a reference to a missing row is a
     *   fatal condition, not something to paper over with an empty record.
     */
    public async Hydrate(entity: WorkingRecordEntity, recordID: string): Promise<WorkingRecord> {
        const entityObject = await this.provider.GetEntityObject<BaseEntity>(
            GetEntityName(entity),
            this.contextUser,
        );
        const loaded = await entityObject.InnerLoad(CompositeKey.FromID(recordID)); // first-pk-ok: MJ core content entity, single-column ID
        if (!loaded) {
            throw new Error(`${GetEntityName(entity)} record '${recordID}' could not be loaded for hydration`);
        }
        return this.FromEntity(entity, entityObject);
    }

    /**
     * Build a working record from an entity object already in hand, skipping the load.
     *
     * Used when the caller has the row for other reasons, and by the tests.
     */
    public FromEntity(entity: WorkingRecordEntity, entityObject: BaseEntity): WorkingRecord {
        const url = this.readString(entityObject, 'URL') ?? '';
        const identity = new WorkingRecordIdentity(entity, url, entityObject.Get('ID') as string);
        const record = new WorkingRecord(identity);
        // Which source this belongs to, so a stage producing sibling items can put them on the same
        // source without looking it up again.
        const contentSourceID = entityObject.Get('ContentSourceID');
        if (typeof contentSourceID === 'string') {
            record.SetExtension('Pipeline', 'contentSourceID', contentSourceID);
        }
        // The stored statuses two gates read: the pending-delete skip in PipelineProcessor and the
        // metadata-only path in EmbedStage. Publishing them here is what makes those gates work on
        // a real row rather than only where a test set them by hand.
        for (const [column, key] of PIPELINE_STATUS_EXTENSIONS) {
            const value = this.readString(entityObject, column);
            if (value !== null) {
                record.SetExtension('Pipeline', key, value);
            }
        }
        const confidence = this.readConfidence(entityObject);
        const map = GetEntityFieldMap(entity);

        for (const field of WellKnownFields) {
            const mapping = map[field];
            if (!mapping) {
                continue;
            }
            const column =
                mapping.Kind === 'Lookup'
                    ? (mapping.ReadColumn ?? mapping.Column.replace(/ID$/, ''))
                    : mapping.Column;
            const raw = entityObject.Get(column);
            if (raw === null || raw === undefined) {
                continue;
            }
            const stored = confidence[field];
            // Restore rather than Propose: hydration is reinstating what storage already holds, not
            // competing with it, and it must not register the field as changed.
            record.Restore(
                field,
                mapping.Kind === 'Date' ? new Date(raw as string) : (raw as string),
                stored?.Score ?? 0,
                stored?.SetBy ?? 'Hydrate',
            );
        }
        return record;
    }

    /**
     * Read the `FieldConfidence` column, tolerating absence and malformed JSON.
     *
     * A record written before this column existed, or by something that put a non-object in it,
     * hydrates with zero confidence everywhere — which is correct: any stage's proposal then wins,
     * which is what we want for a value whose provenance we cannot establish.
     */
    private readConfidence(entityObject: BaseEntity): FieldConfidenceMap {
        const raw = this.readString(entityObject, 'FieldConfidence');
        if (!raw) {
            return {};
        }
        try {
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                return {};
            }
            return this.coerceConfidence(parsed as Record<string, unknown>);
        } catch {
            return {};
        }
    }

    /** Keep only entries that are shaped like a confidence entry, for a real well-known field. */
    private coerceConfidence(parsed: Record<string, unknown>): FieldConfidenceMap {
        const map: FieldConfidenceMap = {};
        for (const field of WellKnownFields) {
            const entry = parsed[field];
            if (typeof entry !== 'object' || entry === null) {
                continue;
            }
            const candidate = entry as Record<string, unknown>;
            if (typeof candidate.Score === 'number' && typeof candidate.SetBy === 'string') {
                map[field as WellKnownField] = { Score: candidate.Score, SetBy: candidate.SetBy };
            }
        }
        return map;
    }

    /** Read a string column, returning null when the entity does not have it. */
    private readString(entityObject: BaseEntity, column: string): string | null {
        if (!entityObject.Fields.some((f) => f.Name === column)) {
            return null;
        }
        const value = entityObject.Get(column);
        return typeof value === 'string' && value.length > 0 ? value : null;
    }
}
