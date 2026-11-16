/**
 * @fileoverview {@link WorkingRecordHydrator} — builds a working record from a persisted row. With the
 * committer, the only place the pipeline touches the database.
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseEntity, CompositeKey, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    FieldConfidenceMap,
    WellKnownFields,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { GetEntityFieldMap, GetEntityName } from './EntityFieldMap.js';

/**
 * Columns republished into the `Pipeline` extension space. Gates and stages read them; nothing competes for
 * them on confidence, so they are not well-known fields.
 */
const PIPELINE_COLUMN_EXTENSIONS: readonly (readonly [string, string])[] = [
    ['ContentSourceID', 'contentSourceID'],
    ['ContentItemID', 'contentItemID'],
    ['DeleteStatus', 'deleteStatus'],
    ['EmbeddingStatus', 'embeddingStatus'],
    ['FileID', 'fileID'], // kept bytes, for a record whose URL no longer yields them (an archive member)
    ['ExtractorKey', 'extractorKey'],
    ['ExtractorKeyOverride', 'extractorKeyOverride'],
    ['VectorRecordID', 'vectorRecordID'], // the receipt Delete and a re-embed need
];

/** Builds working records from persisted rows. */
export class WorkingRecordHydrator {
    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
    ) {}

    public async Hydrate(entity: WorkingRecordEntity, recordID: string): Promise<WorkingRecord> {
        const entityObject = await this.provider.GetEntityObject<BaseEntity>(GetEntityName(entity), this.contextUser);
        if (!(await entityObject.InnerLoad(CompositeKey.FromID(recordID)))) { // first-pk-ok: MJ core content entity, single-column ID
            throw new Error(`${GetEntityName(entity)} record '${recordID}' could not be loaded for hydration`);
        }
        return this.FromEntity(entity, entityObject);
    }

    /** Build a working record from an already-loaded row. */
    public FromEntity(entity: WorkingRecordEntity, entityObject: BaseEntity): WorkingRecord {
        const identity = new WorkingRecordIdentity(
            entity,
            this.readString(entityObject, 'URL') ?? '',
            this.readColumn(entityObject, 'ID') as string,
        );
        const record = new WorkingRecord(identity);
        for (const [column, key] of PIPELINE_COLUMN_EXTENSIONS) {
            const value = this.readString(entityObject, column);
            if (value !== null) {
                record.SetExtension('Pipeline', key, value);
            }
        }
        const lastDiscoveredAt = this.readDate(entityObject, 'LastDiscoveredAt');
        if (lastDiscoveredAt !== null) {
            record.SetExtension('Pipeline', 'lastDiscoveredAt', lastDiscoveredAt);
        }
        const lastSyncedAt = this.readDate(entityObject, 'LastSyncedAt');
        if (lastSyncedAt !== null) {
            record.SetExtension('Pipeline', 'lastSyncedAt', lastSyncedAt);
        }
        const sequence = this.hasField(entityObject, 'Sequence') ? this.readColumn(entityObject, 'Sequence') : null;
        if (typeof sequence === 'number') {
            record.SetExtension('Pipeline', 'sequence', sequence);
        }
        this.restoreFields(record, entity, entityObject);
        return record;
    }

    /** Restore each mapped well-known field with the confidence it was stored at (0 when none was recorded). */
    private restoreFields(record: WorkingRecord, entity: WorkingRecordEntity, entityObject: BaseEntity): void {
        const confidence = this.readConfidence(entityObject);
        const map = GetEntityFieldMap(entity);
        for (const field of WellKnownFields) {
            const mapping = map[field];
            if (!mapping) {
                continue;
            }
            const raw = this.readColumn(entityObject, mapping.Kind === 'Lookup' ? (mapping.ReadColumn ?? mapping.Column) : mapping.Column);
            if (raw === null || raw === undefined) {
                continue;
            }
            const stored = confidence[field];
            const value = mapping.Kind === 'Date' ? new Date(raw as string) : (raw as string);
            record.Restore(field, value, stored?.Score ?? 0, stored?.SetBy ?? 'Hydrate');
        }
    }

    /** The `FieldConfidence` column, keeping only well-formed entries; malformed JSON reads as empty. */
    private readConfidence(entityObject: BaseEntity): FieldConfidenceMap {
        const raw = this.readString(entityObject, 'FieldConfidence');
        let parsed: unknown;
        try {
            parsed = raw ? JSON.parse(raw) : null;
        } catch {
            return {};
        }
        const map: FieldConfidenceMap = {};
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return map;
        }
        for (const field of WellKnownFields) {
            const entry = (parsed as Record<string, { Score?: unknown; SetBy?: unknown } | undefined>)[field];
            if (typeof entry?.Score === 'number' && typeof entry.SetBy === 'string') {
                map[field] = { Score: entry.Score, SetBy: entry.SetBy };
            }
        }
        return map;
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

    private readDate(entityObject: BaseEntity, column: string): Date | null {
        const value = this.hasField(entityObject, column) ? this.readColumn(entityObject, column) : null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value;
        }
        if (typeof value === 'string' && value.length > 0) {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        return null;
    }
}
