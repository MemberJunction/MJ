/**
 * @fileoverview Filter source — iterates an entity's rows matching an ad-hoc WHERE clause. Uses
 * keyset (seek) pagination when the entity has a single orderable PK, otherwise offset.
 * @module @memberjunction/record-set-processor-base
 */

import { EntityInfo, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { IRecordSetSource, SourceDescriptor } from '../interfaces';
import { ProcessCursor, RecordBatch } from '../types';
import { pageEntityByFilter } from './sourceUtil';

/** A source backed by an entity + ad-hoc filter. */
export class FilterSource implements IRecordSetSource {
    private entity?: EntityInfo;

    /**
     * @param entityName - The target entity name.
     * @param filter - Optional WHERE clause (no leading `WHERE`).
     */
    constructor(private readonly entityName: string, private readonly filter?: string) {}

    public Describe(): SourceDescriptor {
        return { SourceType: 'Filter', SourceFilter: this.filter, EntityID: this.entity?.ID };
    }

    protected resolveEntity(provider?: IMetadataProvider): EntityInfo {
        if (this.entity) {
            return this.entity;
        }
        const md = provider ?? Metadata.Provider;
        const entity = md.EntityByName(this.entityName);
        if (!entity) {
            throw new Error(`FilterSource: entity '${this.entityName}' not found in metadata`);
        }
        this.entity = entity;
        return entity;
    }

    public async NextBatch(cursor: ProcessCursor | undefined, batchSize: number, contextUser: UserInfo, provider?: IMetadataProvider): Promise<RecordBatch> {
        const entity = this.resolveEntity(provider);
        return pageEntityByFilter({ entity, filter: this.filter, cursor, batchSize, contextUser, preferKeyset: true });
    }
}
