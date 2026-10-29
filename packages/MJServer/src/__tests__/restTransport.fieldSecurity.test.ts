/**
 * Field-level security on the REST transport (rest/EntityCRUDHandler.ts, rest/ViewOperationsHandler.ts).
 *
 * Output: every record and every view row is projected for the caller. The entity objects and
 * view results here are deliberately FULL WIDTH, standing in for any value not narrowed at its
 * source; the response must still omit what the caller may not read.
 *
 * Input: a restricted caller's create or update body is refused when it names a field the caller
 * may not read, or a key that names no field, with the same message for both.
 *
 * Views: callers may not ask for `entity_object` results, whose serialization would send an
 * entity object's internal state rather than its projected fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetEntityObject, mockRunViewFn, mockRunViewsFn, mockEntityList } = vi.hoisted(() => ({
    mockGetEntityObject: vi.fn(),
    mockRunViewFn: vi.fn(),
    mockRunViewsFn: vi.fn(),
    mockEntityList: [] as unknown[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockMetadata {
        public get Entities() { return mockEntityList; }
        public EntityByID() { return undefined; }
        public GetEntityObject(entityName: string, contextUser?: unknown): Promise<unknown> {
            return mockGetEntityObject(entityName, contextUser);
        }
    }
    class MockRunView {
        public RunView(params: unknown, contextUser?: unknown): Promise<unknown> { return mockRunViewFn(params, contextUser); }
        public RunViews(params: unknown[], contextUser?: unknown): Promise<unknown> { return mockRunViewsFn(params, contextUser); }
    }
    return { ...actual, Metadata: MockMetadata, RunView: MockRunView, LogError: vi.fn() };
});

vi.mock('@memberjunction/generic-database-provider', () => ({
    ClientClauseScreen: { ScreenViewClauses: vi.fn(), DialectFor: vi.fn() },
}));

import { EntityInfo, RunViewParams } from '@memberjunction/core';
import { EntityCRUDHandler } from '../rest/EntityCRUDHandler.js';
import { ViewOperationsHandler } from '../rest/ViewOperationsHandler.js';
import { EmployeeEntity, FullWidthEmployeeRow, HRUser, Intern, RefusalFor, SECRET_SALARY } from './fieldSecurityFixtures.js';

function fullWidthEntity(entityInfo: EntityInfo) {
    return {
        EntityInfo: entityInfo,
        Dirty: true,
        LatestResult: null,
        CheckPermissions: vi.fn(() => true),
        NewRecord: vi.fn(),
        Set: vi.fn(),
        Validate: vi.fn(() => ({ Success: true, Errors: [] })),
        Save: vi.fn(async () => true),
        InnerLoad: vi.fn(async () => true),
        GetDataObject: vi.fn(async () => FullWidthEmployeeRow()),
    };
}

let entity: ReturnType<typeof fullWidthEntity>;

beforeEach(() => {
    vi.clearAllMocks();
    entity = fullWidthEntity(EmployeeEntity());
    mockGetEntityObject.mockImplementation(async () => entity);
    mockEntityList.length = 0;
    mockEntityList.push(EmployeeEntity());
    mockRunViewFn.mockResolvedValue({ Success: true, Results: [FullWidthEmployeeRow()] });
    mockRunViewsFn.mockResolvedValue([{ Success: true, Results: [FullWidthEmployeeRow()] }]);
});

describe('REST entity CRUD: responses are projected for the caller', () => {
    it('REGRESSION: GetEntity omits a denied field from a full-width record', async () => {
        const result = await EntityCRUDHandler.GetEntity('Employees', 'emp-1', null, Intern());
        expect(result.entity).toEqual({ ID: 'emp-1', Name: 'Ada', Notes: 'n' });
    });

    it('REGRESSION: CreateEntity and UpdateEntity omit a denied field from the saved record', async () => {
        const created = await EntityCRUDHandler.CreateEntity('Employees', { Name: 'Ada' }, Intern());
        const updated = await EntityCRUDHandler.UpdateEntity('Employees', 'emp-1', { Notes: 'x' }, Intern());
        expect(JSON.stringify([created, updated])).not.toContain(String(SECRET_SALARY));
        expect(created.entity).toMatchObject({ ID: 'emp-1', Name: 'Ada' });
    });

    it('a caller who may read the field still receives it', async () => {
        const result = await EntityCRUDHandler.GetEntity('Employees', 'emp-1', null, HRUser());
        expect(result.entity).toMatchObject({ Salary: SECRET_SALARY });
    });
});

describe('REST entity CRUD: client input is gated for a restricted caller', () => {
    it.each([
        ['a denied field', 'Salary'],
        ['a key that names no field', 'Bogus'],
    ])('REGRESSION: CreateEntity refuses %s with the same message, before anything is set', async (_label, key) => {
        const result = await EntityCRUDHandler.CreateEntity('Employees', { Name: 'Ada', [key]: 1 }, Intern());
        expect(result).toMatchObject({ success: false, error: RefusalFor(key) });
        expect(entity.Set).not.toHaveBeenCalled();
        expect(entity.Save).not.toHaveBeenCalled();
    });

    it.each([
        ['a denied field', 'Salary'],
        ['a key that names no field', 'Bogus'],
    ])('REGRESSION: UpdateEntity refuses %s with the same message, before anything is set', async (_label, key) => {
        const result = await EntityCRUDHandler.UpdateEntity('Employees', 'emp-1', { Notes: 'x', [key]: 1 }, Intern());
        expect(result).toMatchObject({ success: false, error: RefusalFor(key) });
        expect(entity.Set).not.toHaveBeenCalled();
    });

    it('accepts the save-options key and readable fields', async () => {
        const result = await EntityCRUDHandler.UpdateEntity('Employees', 'emp-1', { Notes: 'x', options: { SkipEntityActions: true } }, Intern());
        expect(result.success).toBe(true);
        expect(entity.Set).toHaveBeenCalledWith('Notes', 'x');
    });
});

describe('REST views: rows are projected and entity objects never cross the wire', () => {
    it('REGRESSION: RunView omits a denied field from full-width rows', async () => {
        const outcome = await ViewOperationsHandler.RunView({ EntityName: 'Employees' }, Intern());
        expect(outcome.result?.Results).toEqual([{ ID: 'emp-1', Name: 'Ada', Notes: 'n' }]);
    });

    it('REGRESSION: RunViews omits a denied field from every result set', async () => {
        const outcome = await ViewOperationsHandler.RunViews([{ EntityName: 'Employees' }], Intern());
        expect(JSON.stringify(outcome.results)).not.toContain(String(SECRET_SALARY));
    });

    it('REGRESSION: ListEntities omits a denied field from full-width rows', async () => {
        const result = await ViewOperationsHandler.ListEntities({ EntityName: 'Employees' }, Intern());
        expect(JSON.stringify(result)).not.toContain(String(SECRET_SALARY));
    });

    it('REGRESSION: a caller-chosen entity_object ResultType is forced to simple, singly and in a batch', async () => {
        await ViewOperationsHandler.RunView({ EntityName: 'Employees', ResultType: 'entity_object' }, Intern());
        await ViewOperationsHandler.RunViews([{ EntityName: 'Employees', ResultType: 'entity_object' }], Intern());
        expect((mockRunViewFn.mock.calls[0][0] as RunViewParams).ResultType).toBe('simple');
        expect((mockRunViewsFn.mock.calls[0][0] as RunViewParams[])[0].ResultType).toBe('simple');
    });

    it('a caller who may read the field still receives it', async () => {
        const outcome = await ViewOperationsHandler.RunView({ EntityName: 'Employees' }, HRUser());
        expect(outcome.result?.Results[0]).toMatchObject({ Salary: SECRET_SALARY });
    });
});
