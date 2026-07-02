/**
 * Unit tests for the record-set source adapters and shared source utilities.
 * No database — the RunView static provider is mocked with a lightweight fake.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EntityInfo, IMetadataProvider, IRunViewProvider, RunView, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
    ArraySource,
    FilterSource,
    ListSource,
    RecordRef,
    canUseKeyset,
    serializeRecordId,
} from '../index';

// --- fakes -------------------------------------------------------------------------------------

function fakeEntity(pks: Array<{ Name: string; Type: string }>, name = 'Widgets', id = 'ENT-1'): EntityInfo {
    return { ID: id, Name: name, PrimaryKeys: pks, FirstPrimaryKey: pks[0] } as unknown as EntityInfo;
}

/** Captures RunView params and returns queued results, so tests can assert keyset vs offset. */
class FakeRunViewProvider {
    public readonly entities = new Map<string, EntityInfo>();
    public readonly calls: RunViewParams[] = [];
    public handler: (params: RunViewParams) => Partial<RunViewResult> = () => ({ Success: true, Results: [], TotalRowCount: 0 });

    public EntityByName(name: string): EntityInfo | undefined {
        return this.entities.get(name);
    }

    public async RunView<T = unknown>(params: RunViewParams, _contextUser?: UserInfo): Promise<RunViewResult<T>> {
        this.calls.push(params);
        return { Success: true, Results: [], TotalRowCount: 0, ...this.handler(params) } as RunViewResult<T>;
    }
}

const USER = {} as UserInfo;
const asProvider = (p: FakeRunViewProvider): IMetadataProvider => p as unknown as IMetadataProvider;

let fake: FakeRunViewProvider;
let previousProvider: IRunViewProvider;

beforeEach(() => {
    fake = new FakeRunViewProvider();
    previousProvider = RunView.Provider;
    RunView.Provider = fake as unknown as IRunViewProvider;
});

afterEach(() => {
    RunView.Provider = previousProvider;
});

// --- sourceUtil --------------------------------------------------------------------------------

describe('serializeRecordId', () => {
    it('returns the raw value for a single-PK entity', () => {
        const entity = fakeEntity([{ Name: 'ID', Type: 'uniqueidentifier' }]);
        expect(serializeRecordId(entity, { ID: 'abc-123' })).toBe('abc-123');
    });

    it('concatenates a composite key', () => {
        const entity = fakeEntity([
            { Name: 'CompanyID', Type: 'int' },
            { Name: 'ContactID', Type: 'int' },
        ]);
        const out = serializeRecordId(entity, { CompanyID: 5, ContactID: 9 });
        expect(out).toContain('CompanyID');
        expect(out).toContain('ContactID');
        expect(out).toContain('5');
        expect(out).toContain('9');
    });
});

describe('canUseKeyset', () => {
    it('allows a single orderable PK', () => {
        expect(canUseKeyset(fakeEntity([{ Name: 'ID', Type: 'uniqueidentifier' }]))).toBe(true);
        expect(canUseKeyset(fakeEntity([{ Name: 'ID', Type: 'nvarchar(450)' }]))).toBe(true);
    });

    it('rejects composite PKs', () => {
        expect(canUseKeyset(fakeEntity([
            { Name: 'A', Type: 'int' },
            { Name: 'B', Type: 'int' },
        ]))).toBe(false);
    });

    it('rejects unknown / unorderable PK types', () => {
        expect(canUseKeyset(fakeEntity([{ Name: 'ID', Type: 'geography' }]))).toBe(false);
    });
});

// --- ArraySource -------------------------------------------------------------------------------

describe('ArraySource', () => {
    const records: RecordRef[] = Array.from({ length: 5 }, (_, i) => ({ EntityID: 'ENT-1', RecordID: `r${i}` }));

    it('pages through the array and advances the offset cursor', async () => {
        const src = new ArraySource(records, 'ENT-1');
        const first = await src.NextBatch(undefined, 2, USER);
        expect(first.Records.map((r) => r.RecordID)).toEqual(['r0', 'r1']);
        expect(first.NextCursor.Offset).toBe(2);
        expect(first.Exhausted).toBe(false);
        expect(first.TotalRowCount).toBe(5);

        const second = await src.NextBatch(first.NextCursor, 2, USER);
        expect(second.Records.map((r) => r.RecordID)).toEqual(['r2', 'r3']);

        const third = await src.NextBatch(second.NextCursor, 2, USER);
        expect(third.Records.map((r) => r.RecordID)).toEqual(['r4']);
        expect(third.Exhausted).toBe(true);
    });

    it('describes itself with the supplied entity ID', () => {
        expect(new ArraySource(records, 'ENT-1').Describe()).toEqual({ SourceType: 'Array', EntityID: 'ENT-1' });
    });
});

// --- FilterSource ------------------------------------------------------------------------------

describe('FilterSource', () => {
    it('keyset-paginates a single-PK entity and advances the key cursor to the last row', async () => {
        fake.entities.set('Widgets', fakeEntity([{ Name: 'ID', Type: 'uniqueidentifier' }]));
        fake.handler = () => ({ Success: true, Results: [{ ID: 'k1' }, { ID: 'k2' }], TotalRowCount: 42 });

        const src = new FilterSource('Widgets', "Status='Active'");
        const batch = await src.NextBatch(undefined, 2, USER, asProvider(fake));

        expect(batch.Records).toEqual([
            { EntityID: 'ENT-1', RecordID: 'k1', Record: { ID: 'k1' } },
            { EntityID: 'ENT-1', RecordID: 'k2', Record: { ID: 'k2' } },
        ]);
        expect(batch.NextCursor.Key).toBe('k2');
        expect(batch.TotalRowCount).toBe(42);
        // it ordered by PK and applied the filter (keyset path)
        const params = fake.calls[0];
        expect(params.OrderBy).toBe('ID');
        expect(params.ExtraFilter).toBe("Status='Active'");
        expect(params.BypassCache).toBe(true);
    });

    it('falls back to offset pagination for a composite-PK entity', async () => {
        fake.entities.set('Bridge', fakeEntity([
            { Name: 'AID', Type: 'int' },
            { Name: 'BID', Type: 'int' },
        ], 'Bridge'));
        fake.handler = () => ({ Success: true, Results: [{ AID: 1, BID: 2 }], TotalRowCount: 1 });

        const src = new FilterSource('Bridge');
        const batch = await src.NextBatch({ Offset: 10 }, 5, USER, asProvider(fake));

        expect(batch.NextCursor.Offset).toBe(11); // 10 + 1 returned
        expect(batch.NextCursor.Key).toBeUndefined();
        expect(fake.calls[0].StartRow).toBe(10);
        expect(fake.calls[0].OrderBy).toBeUndefined();
    });

    it('throws when the entity is unknown', async () => {
        const src = new FilterSource('Missing');
        await expect(src.NextBatch(undefined, 5, USER, asProvider(fake))).rejects.toThrow(/not found/);
    });
});

// --- ListSource --------------------------------------------------------------------------------

describe('ListSource', () => {
    it('resolves the list entity then pages List Details, mapping RecordID', async () => {
        fake.handler = (params) => {
            if (params.EntityName === 'MJ: Lists') {
                return { Success: true, Results: [{ EntityID: 'ENT-9' }], TotalRowCount: 1 };
            }
            // MJ: List Details
            return { Success: true, Results: [{ RecordID: 'a' }, { RecordID: 'b' }], TotalRowCount: 2 };
        };

        const src = new ListSource('LIST-1');
        const batch = await src.NextBatch(undefined, 50, USER, asProvider(fake));

        expect(batch.Records).toEqual([
            { EntityID: 'ENT-9', RecordID: 'a' },
            { EntityID: 'ENT-9', RecordID: 'b' },
        ]);
        // first call resolved the list, second paged the details filtered by ListID
        const detailCall = fake.calls.find((c) => c.EntityName === 'MJ: List Details');
        expect(detailCall?.ExtraFilter).toBe("ListID='LIST-1'");
        expect(batch.Exhausted).toBe(true);
    });
});
