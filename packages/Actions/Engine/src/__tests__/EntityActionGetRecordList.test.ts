/**
 * Unit tests for the View/List fan-out (GetRecordList) on EntityActionInvocationMultipleRecords —
 * the previously-stubbed seam that resolves a View or List into entity objects to process.
 * No database — the RunView + Metadata static providers are mocked.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    BaseEntity,
    EntityInfo,
    IMetadataProvider,
    IRunViewProvider,
    Metadata,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import { EntityActionInvocationParams } from '@memberjunction/actions-base';
import { EntityActionInvocationMultipleRecords } from '../entity-actions/EntityActionInvocationTypes';

/** Exposes the protected GetRecordList for testing. */
class TestInvocation extends EntityActionInvocationMultipleRecords {
    public run(params: EntityActionInvocationParams): Promise<BaseEntity[]> {
        return this.GetRecordList(params);
    }
}

function fakeEntity(pks: Array<{ Name: string; Type: string }>, name = 'Widgets', id = 'ENT-1'): EntityInfo {
    return { ID: id, Name: name, PrimaryKeys: pks, FirstPrimaryKey: pks[0] } as unknown as EntityInfo;
}

class FakeProvider {
    public readonly entities = new Map<string, EntityInfo>();
    public readonly calls: RunViewParams[] = [];
    public handler: (params: RunViewParams) => Partial<RunViewResult> = () => ({ Success: true, Results: [], TotalRowCount: 0 });
    public EntityByID(id: string): EntityInfo | undefined { return this.entities.get(id); }
    public EntityByName(): EntityInfo | undefined { return undefined; }
    public async RunView<T = unknown>(params: RunViewParams): Promise<RunViewResult<T>> {
        this.calls.push(params);
        return { Success: true, Results: [], TotalRowCount: 0, ...this.handler(params) } as RunViewResult<T>;
    }
}

const USER = {} as UserInfo;
const params = (over: Partial<EntityActionInvocationParams> & { invo: string }): EntityActionInvocationParams =>
    ({ InvocationType: { Name: over.invo }, ContextUser: USER, ...over } as unknown as EntityActionInvocationParams);

let fake: FakeProvider;
let prevRV: IRunViewProvider;
let prevMD: IMetadataProvider;

beforeEach(() => {
    fake = new FakeProvider();
    prevRV = RunView.Provider;
    prevMD = Metadata.Provider;
    RunView.Provider = fake as unknown as IRunViewProvider;
    Metadata.Provider = fake as unknown as IMetadataProvider;
});

afterEach(() => {
    RunView.Provider = prevRV;
    Metadata.Provider = prevMD;
});

describe('EntityActionInvocationMultipleRecords.GetRecordList', () => {
    it('loads a View as entity objects', async () => {
        const objs = [{ id: 1 }, { id: 2 }] as unknown as BaseEntity[];
        fake.handler = (p) => (p.ViewID === 'V1' ? { Success: true, Results: objs } : { Success: false });
        const result = await new TestInvocation().run(params({ invo: 'View', ViewID: 'V1' }));
        expect(result).toBe(objs);
        expect(fake.calls[0].ResultType).toBe('entity_object');
    });

    it('loads List members as entity objects via an IN filter', async () => {
        fake.entities.set('ENT-1', fakeEntity([{ Name: 'ID', Type: 'uniqueidentifier' }]));
        const objs = [{ k: 'a' }, { k: 'b' }] as unknown as BaseEntity[];
        fake.handler = (p) => {
            if (p.EntityName === 'MJ: List Details') return { Success: true, Results: [{ RecordID: 'a' }, { RecordID: 'b' }] };
            return { Success: true, Results: objs };
        };
        const result = await new TestInvocation().run(params({ invo: 'List', ListID: 'L1', EntityAction: { EntityID: 'ENT-1' } } as never));
        expect(result).toBe(objs);
        const memberCall = fake.calls.find((c) => c.EntityName === 'MJ: List Details');
        expect(memberCall?.ExtraFilter).toBe("ListID='L1'");
        const entityCall = fake.calls.find((c) => c.EntityName === 'Widgets');
        expect(entityCall?.ExtraFilter).toBe("ID IN ('a','b')");
        expect(entityCall?.ResultType).toBe('entity_object');
    });

    it('does not quote numeric primary keys in the IN filter', async () => {
        fake.entities.set('ENT-1', fakeEntity([{ Name: 'ID', Type: 'int' }]));
        fake.handler = (p) => {
            if (p.EntityName === 'MJ: List Details') return { Success: true, Results: [{ RecordID: '7' }, { RecordID: '9' }] };
            return { Success: true, Results: [] };
        };
        await new TestInvocation().run(params({ invo: 'List', ListID: 'L1', EntityAction: { EntityID: 'ENT-1' } } as never));
        const entityCall = fake.calls.find((c) => c.EntityName === 'Widgets');
        expect(entityCall?.ExtraFilter).toBe('ID IN (7,9)');
    });

    it('returns empty when a List has no members', async () => {
        fake.entities.set('ENT-1', fakeEntity([{ Name: 'ID', Type: 'uniqueidentifier' }]));
        fake.handler = () => ({ Success: true, Results: [] });
        const result = await new TestInvocation().run(params({ invo: 'List', ListID: 'L1', EntityAction: { EntityID: 'ENT-1' } } as never));
        expect(result).toEqual([]);
    });

    it('throws for a composite-PK entity on List invocation', async () => {
        fake.entities.set('ENT-1', fakeEntity([{ Name: 'A', Type: 'int' }, { Name: 'B', Type: 'int' }]));
        await expect(new TestInvocation().run(params({ invo: 'List', ListID: 'L1', EntityAction: { EntityID: 'ENT-1' } } as never)))
            .rejects.toThrow(/composite key/);
    });
});
