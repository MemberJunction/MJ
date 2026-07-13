/**
 * @fileoverview User-View source — resolves a saved User View and yields its members (PKs only) in
 * offset-paginated batches. A view may carry an arbitrary OrderBy/filter that defeats keyset
 * pagination, so this source uses offset (StartRow) paging.
 * @module @memberjunction/record-set-processor-base
 */

import { EntityInfo, IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { IRecordSetSource, SourceDescriptor } from '../interfaces';
import { ProcessCursor, RecordBatch, RecordRef } from '../types';
import { serializeRecordId } from './sourceUtil';

/** A source backed by a saved User View. */
export class ViewSource implements IRecordSetSource {
    private entity?: EntityInfo;

    /** @param viewID - The `MJ: User Views` ID to iterate. */
    constructor(private readonly viewID: string) {}

    public Describe(): SourceDescriptor {
        return { SourceType: 'View', SourceID: this.viewID, EntityID: this.entity?.ID };
    }

    private async resolveEntity(provider?: IMetadataProvider): Promise<EntityInfo> {
        if (this.entity) {
            return this.entity;
        }
        const md = provider ?? Metadata.Provider;
        const entityName = await RunView.GetEntityNameFromRunViewParams({ ViewID: this.viewID }, provider ?? null);
        if (!entityName) {
            throw new Error(`ViewSource: could not determine the entity for view '${this.viewID}'`);
        }
        const entity = md.EntityByName(entityName);
        if (!entity) {
            throw new Error(`ViewSource: entity '${entityName}' not found in metadata`);
        }
        this.entity = entity;
        return entity;
    }

    public async NextBatch(cursor: ProcessCursor | undefined, batchSize: number, contextUser: UserInfo, provider?: IMetadataProvider): Promise<RecordBatch> {
        const entity = await this.resolveEntity(provider);
        const offset = cursor?.Offset ?? 0;
        const rv = new RunView();
        const result = await rv.RunView({
            ViewID: this.viewID,
            Fields: entity.PrimaryKeys.map((pk) => pk.Name),
            ResultType: 'simple',
            StartRow: offset,
            MaxRows: batchSize,
        }, contextUser);
        if (!result.Success) {
            throw new Error(`ViewSource: failed running view '${this.viewID}': ${result.ErrorMessage}`);
        }
        const rows = (result.Results ?? []) as Record<string, unknown>[];
        const records: RecordRef[] = rows.map((row) => ({
            EntityID: entity.ID,
            RecordID: serializeRecordId(entity, row),
            Record: row,
        }));
        return {
            Records: records,
            NextCursor: { Offset: offset + records.length },
            Exhausted: records.length < batchSize,
            TotalRowCount: result.TotalRowCount,
        };
    }
}
