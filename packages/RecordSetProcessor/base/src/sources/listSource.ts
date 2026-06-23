/**
 * @fileoverview List source — yields the members of an `MJ: Lists` record (read from `MJ: List
 * Details`) in offset-paginated batches. List Details already store a composite-key-safe `RecordID`.
 * @module @memberjunction/record-set-processor-base
 */

import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { IRecordSetSource, SourceDescriptor } from '../interfaces';
import { ProcessCursor, RecordBatch, RecordRef } from '../types';

/** A source backed by a List (its members, via List Details). */
export class ListSource implements IRecordSetSource {
    private entityID?: string;

    /** @param listID - The `MJ: Lists` ID whose members to iterate. */
    constructor(private readonly listID: string) {}

    public Describe(): SourceDescriptor {
        return { SourceType: 'List', SourceID: this.listID, EntityID: this.entityID };
    }

    private async resolveEntityID(contextUser: UserInfo): Promise<string> {
        if (this.entityID) {
            return this.entityID;
        }
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'MJ: Lists',
            ExtraFilter: `ID='${this.listID}'`,
            Fields: ['EntityID'],
            ResultType: 'simple',
            MaxRows: 1,
        }, contextUser);
        if (!result.Success) {
            throw new Error(`ListSource: failed loading list '${this.listID}': ${result.ErrorMessage}`);
        }
        const row = (result.Results ?? [])[0] as { EntityID?: string } | undefined;
        if (!row?.EntityID) {
            throw new Error(`ListSource: list '${this.listID}' not found`);
        }
        this.entityID = row.EntityID;
        return this.entityID;
    }

    public async NextBatch(cursor: ProcessCursor | undefined, batchSize: number, contextUser: UserInfo, _provider?: IMetadataProvider): Promise<RecordBatch> {
        const entityID = await this.resolveEntityID(contextUser);
        const offset = cursor?.Offset ?? 0;
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'MJ: List Details',
            ExtraFilter: `ListID='${this.listID}'`,
            Fields: ['RecordID'],
            OrderBy: 'ID',
            ResultType: 'simple',
            StartRow: offset,
            MaxRows: batchSize,
        }, contextUser);
        if (!result.Success) {
            throw new Error(`ListSource: failed loading members for list '${this.listID}': ${result.ErrorMessage}`);
        }
        const rows = (result.Results ?? []) as { RecordID: string }[];
        const records: RecordRef[] = rows.map((row) => ({ EntityID: entityID, RecordID: String(row.RecordID) }));
        return {
            Records: records,
            NextCursor: { Offset: offset + records.length },
            Exhausted: records.length < batchSize,
            TotalRowCount: result.TotalRowCount,
        };
    }
}
