/**
 * @fileoverview List source — yields the members of an `MJ: Lists` record (read from `MJ: List
 * Details`) in keyset-paginated batches (seek over `ListDetail.ID`, O(log N) per page at any
 * depth). List Details already store a composite-key-safe `RecordID`.
 * @module @memberjunction/record-set-processor-base
 */

import { CompositeKey, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
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
        const rv = new RunView();

        // Keyset (seek) pagination over ListDetail.ID (single uniqueidentifier
        // PK). A legacy Offset cursor — persisted by a run started before this
        // change — is honored for its one resume batch, then the returned
        // cursor converts to keyset. BypassCache matches the other sweep
        // sources: single-use pages should never pollute the local cache.
        const legacyOffset = cursor?.Key == null && (cursor?.Offset ?? 0) > 0 ? cursor!.Offset! : undefined;
        const result = await rv.RunView({
            EntityName: 'MJ: List Details',
            ExtraFilter: `ListID='${this.listID}'`,
            Fields: ['ID', 'RecordID'],
            OrderBy: 'ID',
            ResultType: 'simple',
            MaxRows: batchSize,
            BypassCache: true,
            ...(legacyOffset != null
                ? { StartRow: legacyOffset }
                : { AfterKey: cursor?.Key != null ? CompositeKey.FromKeyValuePair('ID', cursor.Key) : undefined }),
        }, contextUser);
        if (!result.Success) {
            throw new Error(`ListSource: failed loading members for list '${this.listID}': ${result.ErrorMessage}`);
        }
        const rows = (result.Results ?? []) as { ID?: string; RecordID: string }[];
        const records: RecordRef[] = rows.map((row) => ({ EntityID: entityID, RecordID: String(row.RecordID) }));
        const lastRowId = rows.length > 0 ? rows[rows.length - 1].ID : undefined;
        const lastId = lastRowId != null ? String(lastRowId) : cursor?.Key;
        return {
            Records: records,
            NextCursor: lastId != null ? { Key: lastId } : { Offset: (legacyOffset ?? 0) + records.length },
            Exhausted: records.length < batchSize,
            TotalRowCount: result.TotalRowCount,
        };
    }
}
