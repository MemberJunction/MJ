/**
 * @fileoverview Keyset source — like {@link FilterSource} but explicitly requires keyset (seek)
 * pagination, asserting the entity has a single orderable PK. Preferred for large background sweeps
 * where deep offset pagination would degrade. Reports `SourceType: 'Keyset'`.
 * @module @memberjunction/record-set-processor-base
 */

import { EntityInfo, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { IRecordSetSource, SourceDescriptor } from '../interfaces';
import { ProcessCursor, RecordBatch } from '../types';
import { canUseKeyset, pageEntityByFilter } from './sourceUtil';

/** A source backed by an entity + ad-hoc filter, paginated strictly via keyset. */
export class KeysetSource implements IRecordSetSource {
    private entity?: EntityInfo;

    /**
     * @param entityName - The target entity name (must have a single orderable PK).
     * @param filter - Optional WHERE clause (no leading `WHERE`).
     */
    constructor(private readonly entityName: string, private readonly filter?: string) {}

    public Describe(): SourceDescriptor {
        return { SourceType: 'Keyset', SourceFilter: this.filter, EntityID: this.entity?.ID };
    }

    private resolveEntity(provider?: IMetadataProvider): EntityInfo {
        if (this.entity) {
            return this.entity;
        }
        const md = provider ?? Metadata.Provider;
        const entity = md.EntityByName(this.entityName);
        if (!entity) {
            throw new Error(`KeysetSource: entity '${this.entityName}' not found in metadata`);
        }
        if (!canUseKeyset(entity)) {
            throw new Error(`KeysetSource: entity '${this.entityName}' lacks a single orderable PK; use FilterSource instead`);
        }
        this.entity = entity;
        return entity;
    }

    public async NextBatch(cursor: ProcessCursor | undefined, batchSize: number, contextUser: UserInfo, provider?: IMetadataProvider): Promise<RecordBatch> {
        const entity = this.resolveEntity(provider);
        return pageEntityByFilter({ entity, filter: this.filter, cursor, batchSize, contextUser, preferKeyset: true });
    }
}
