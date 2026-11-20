import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    EntityInfo,
    GetDataHooks,
    IMetadataProvider,
    IsPostRunViewProtectedEntity,
    PostRunViewHook,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import '../index';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';
const VIEWER_ID = '11111111-1111-4111-8111-111111111111';

const RECORD_CHANGES_ENTITY_ID = 'AAAAAAAA-0000-4000-8000-000000000001';
const HIDDEN_ENTITY_ID = 'AAAAAAAA-0000-4000-8000-000000000002';
const FILTERED_ENTITY_ID = 'AAAAAAAA-0000-4000-8000-000000000003';
const OPEN_ENTITY_ID = 'AAAAAAAA-0000-4000-8000-000000000004';

const OWN_RECORD_ID = 'BBBBBBBB-0000-4000-8000-000000000001';
const OTHER_RECORD_ID = 'BBBBBBBB-0000-4000-8000-000000000002';

interface EntityAccess {
    canRead: boolean;
    exemptFromRowFilter: boolean;
}

function makeUser(id: string): UserInfo {
    const user = new UserInfo(null, { ID: id, Email: `${id}@example.com`, Name: id, IsActive: true });
    Object.defineProperty(user, 'UserRoles', { value: [{ Role: 'UI' }], configurable: true });
    return user;
}

function makeEntity(id: string, name: string, access: EntityAccess): EntityInfo {
    const info = new EntityInfo({
        ID: id,
        Name: name,
        SchemaName: '__mj',
        BaseTable: name.replace(/[^A-Za-z0-9]/g, ''),
        BaseView: `vw${name.replace(/[^A-Za-z0-9]/g, '')}`,
        Fields: [
            { ID: `${id}-f1`, EntityID: id, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
            { ID: `${id}-f2`, EntityID: id, Name: 'Name', Type: 'nvarchar', Sequence: 2 },
        ],
    });
    vi.spyOn(info, 'GetUserPermisions').mockReturnValue({
        CanRead: access.canRead,
        CanCreate: false,
        CanUpdate: false,
        CanDelete: false,
    });
    vi.spyOn(info, 'UserExemptFromRowLevelSecurity').mockReturnValue(access.exemptFromRowFilter);
    return info;
}

/** A database provider double: only the target-entity read for the filtered entity returns rows. */
function makeProvider(entities: EntityInfo[], visibleRecordIDs: string[]): IMetadataProvider & { RunView: ReturnType<typeof vi.fn> } {
    const runView = vi.fn(async (params: RunViewParams): Promise<RunViewResult> => {
        const rows = params.EntityName === 'Filtered Things'
            ? visibleRecordIDs.map((id) => ({ ID: id }))
            : [];
        return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    });
    return {
        ProviderType: 'Database',
        Entities: entities,
        EntityByID: (id: string) => entities.find((e) => UUIDsEqual(e.ID, id)),
        EntityByName: (name: string) => entities.find((e) => e.Name.toLowerCase() === name.trim().toLowerCase()),
        RunView: runView,
    } as unknown as IMetadataProvider & { RunView: ReturnType<typeof vi.fn> };
}

function changeRow(id: string, entityID: string, recordID: string): Record<string, string> {
    return { ID: id, EntityID: entityID, RecordID: `ID|${recordID}`, FullRecordJSON: '{"Name":"marker"}' };
}

/** Runs every registered PostRunView hook in order, as the provider does after a read. */
async function runPostRunViewHooks(params: RunViewParams, result: RunViewResult, user: UserInfo): Promise<RunViewResult> {
    let current = result;
    for (const hook of GetDataHooks<PostRunViewHook>('PostRunView')) {
        current = await hook(params, current, user);
    }
    return current;
}

function resultOf(rows: Record<string, string>[]): RunViewResult {
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
}

describe('Record Changes read security', () => {
    const viewer = makeUser(VIEWER_ID);

    beforeEach(() => {
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation(
            (u) => Boolean(u && UUIDsEqual(u.ID, SYSTEM_USER_ID)),
        );
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(makeUser(SYSTEM_USER_ID));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function setup(): { provider: ReturnType<typeof makeProvider> } {
        const entities = [
            makeEntity(RECORD_CHANGES_ENTITY_ID, 'MJ: Record Changes', { canRead: true, exemptFromRowFilter: true }),
            makeEntity(HIDDEN_ENTITY_ID, 'Hidden Things', { canRead: false, exemptFromRowFilter: false }),
            makeEntity(FILTERED_ENTITY_ID, 'Filtered Things', { canRead: true, exemptFromRowFilter: false }),
            makeEntity(OPEN_ENTITY_ID, 'Open Things', { canRead: true, exemptFromRowFilter: true }),
        ];
        const provider = makeProvider(entities, [OWN_RECORD_ID]);
        Object.defineProperty(viewer, 'OwningProvider', { value: provider, configurable: true });
        return { provider };
    }

    it('is registered as a PostRunView-protected entity', () => {
        expect(IsPostRunViewProtectedEntity('MJ: Record Changes')).toBe(true);
    });

    it('drops change rows about an entity the caller cannot read', async () => {
        setup();
        const params: RunViewParams = { EntityName: 'MJ: Record Changes', ResultType: 'simple' };
        const result = await runPostRunViewHooks(
            params,
            resultOf([changeRow('C1', HIDDEN_ENTITY_ID, OTHER_RECORD_ID), changeRow('C2', OPEN_ENTITY_ID, OTHER_RECORD_ID)]),
            viewer,
        );
        expect((result.Results as Array<{ ID: string }>).map((r) => r.ID)).toEqual(['C2']);
    });

    it('keeps change rows of a row-filtered entity only for records the caller can read', async () => {
        const { provider } = setup();
        const params: RunViewParams = { EntityName: 'MJ: Record Changes', ResultType: 'simple' };
        const result = await runPostRunViewHooks(
            params,
            resultOf([changeRow('C1', FILTERED_ENTITY_ID, OWN_RECORD_ID), changeRow('C2', FILTERED_ENTITY_ID, OTHER_RECORD_ID)]),
            viewer,
        );
        expect((result.Results as Array<{ ID: string }>).map((r) => r.ID)).toEqual(['C1']);
        expect(result.RowCount).toBe(1);
        const targetCall = provider.RunView.mock.calls.find((c) => (c[0] as RunViewParams).EntityName === 'Filtered Things');
        expect(targetCall?.[1]).toBe(viewer);
    });
});
