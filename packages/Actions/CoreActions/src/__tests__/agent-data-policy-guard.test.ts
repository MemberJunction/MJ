import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CompositeKey,
    DatabaseProviderBase,
    EntityFieldInfo,
    EntityInfo,
    IMetadataProvider,
    QueryEntityInfo,
    QueryInfo,
    RowLevelSecurityFilterInfo,
    UserInfo,
} from '@memberjunction/core';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import type { MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';

const {
    runViewMock,
    runQueryMock,
    adhocAuthorizerMock,
    readOnlyProviderRunQueryMock,
} = vi.hoisted(() => ({
    runViewMock: vi.fn(),
    runQueryMock: vi.fn(),
    adhocAuthorizerMock: vi.fn(),
    readOnlyProviderRunQueryMock: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: object) => target,
}));

vi.mock('@memberjunction/actions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/actions')>();
    return {
        ...actual,
        ActionEngineServer: {
            Instance: {
                get AdhocSQLAuthorizer() {
                    return {
                        Authorize: (...args: unknown[]) => adhocAuthorizerMock(...args),
                        ClampTimeoutSeconds: (sec?: number) => sec ?? 30,
                    };
                },
                GetReadOnlyProvider: async () => mockReadOnlyProvider,
            },
        },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        public static FromMetadataProvider(): MockRunView {
            return new MockRunView();
        }
        public RunView(...args: unknown[]): Promise<unknown> {
            return runViewMock(...args);
        }
    }
    class MockRunQuery {
        public RunQuery(...args: unknown[]): Promise<unknown> {
            return runQueryMock(...args);
        }
    }
    return {
        ...actual,
        LogError: vi.fn(),
        RunView: MockRunView,
        RunQuery: MockRunQuery,
    };
});

import { GetRecordAction } from '../custom/crud/get-record.action';
import { GetRecordsAction } from '../custom/crud/get-records.action';
import { CreateRecordAction } from '../custom/crud/create-record.action';
import { UpdateRecordAction } from '../custom/crud/update-record.action';
import { DeleteRecordAction } from '../custom/crud/delete-record.action';
import { WriteEntityFieldsAction } from '../custom/crud/write-entity-fields.action';
import { RunStoredQueryAction } from '../custom/data/run-stored-query.action';
import { RunAdhocQueryAction } from '../custom/data/run-adhoc-query.action';

interface TestableAction {
    InternalRunAction(params: RunActionParams): Promise<ActionResultSimple>;
}

function invokeAction(action: object, params: RunActionParams): Promise<ActionResultSimple> {
    return (action as TestableAction).InternalRunAction(params);
}

const AGENT_ID = '11111111-2222-4333-8444-555555555555';
const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const EMPLOYEES_ENTITY_ID = '99999999-8888-4777-8666-555555555555';
const AUDIT_ENTITY_ID = '77777777-6666-4555-8444-333333333333';
const RLS_FILTER_ID = '22222222-3333-4444-8555-666666666666';

function makeField(name: string, isPrimaryKey = false, readOnly = false): EntityFieldInfo {
    return {
        Name: name,
        IsPrimaryKey: isPrimaryKey,
        ReadOnly: readOnly,
        AllowUpdateAPI: !readOnly,
        AutoIncrement: false,
    } as unknown as EntityFieldInfo;
}

function makeEntityInfo(
    id: string,
    name: string,
    schemaName: string,
    baseTable: string,
    baseView: string,
    fields: EntityFieldInfo[]
): EntityInfo {
    return {
        ID: id,
        Name: name,
        SchemaName: schemaName,
        BaseTable: baseTable,
        BaseView: baseView,
        AlternateBaseViews: [],
        Fields: fields,
        PrimaryKeys: fields.filter((f) => f.IsPrimaryKey),
        GetUserPermisions: () => ({ CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true }),
        GetEffectiveRowFilterWhereClause: () => '',
        GetDeniedReadFields: () => new Set<string>(),
    } as unknown as EntityInfo;
}

const employeesEntity = makeEntityInfo(
    EMPLOYEES_ENTITY_ID,
    'Employees',
    '__mj',
    'Employee',
    'vwEmployees',
    [
        makeField('ID', true, true),
        makeField('Name'),
        makeField('Department'),
        makeField('Status'),
        makeField('Salary'),
        makeField('InternalNotes'),
    ]
);

const auditEntity = makeEntityInfo(
    AUDIT_ENTITY_ID,
    'MJ: Audit Logs',
    '__mj',
    'AuditLog',
    'vwAuditLogs',
    [makeField('ID', true, true), makeField('Description')]
);

let mockReadOnlyProvider: DatabaseProviderBase;

function makeUser(): UserInfo {
    const u = new UserInfo();
    u.ID = USER_ID;
    u.Name = 'Alice Dev';
    u.Email = 'alice@bluecypress.io';
    u.IsActive = true;
    return u;
}

function makePolicy(overrides: Partial<MJAIAgentUserPolicyEntity>): MJAIAgentUserPolicyEntity {
    return {
        ID: 'pol-1',
        AgentID: AGENT_ID,
        UserID: USER_ID,
        Status: 'Active',
        DefaultDataAccessMode: 'UserCeiling',
        RequireApprovalForDestructiveActions: false,
        EntityAccessRulesObject: [],
        ActionPolicyRulesObject: [],
        ...overrides,
    } as unknown as MJAIAgentUserPolicyEntity;
}

interface MockRecordOptions {
    initialValues?: Record<string, unknown>;
    loadSuccess?: boolean;
    saveSuccess?: boolean;
    deleteSuccess?: boolean;
}

function makeProvider(options: MockRecordOptions = {}, queries: QueryInfo[] = [], rlsFilters: RowLevelSecurityFilterInfo[] = []): {
    provider: IMetadataProvider;
    entityState: Record<string, unknown>;
    saveMock: ReturnType<typeof vi.fn>;
    deleteMock: ReturnType<typeof vi.fn>;
} {
    const entityState: Record<string, unknown> = {
        ID: 'emp-1',
        Name: 'Jane Doe',
        Department: 'Engineering',
        Status: 'Active',
        Salary: 185000,
        InternalNotes: 'Confidential comp review',
        ...(options.initialValues ?? {}),
    };
    const saveMock = vi.fn(async () => options.saveSuccess ?? true);
    const deleteMock = vi.fn(async () => options.deleteSuccess ?? true);

    const allEntities = [employeesEntity, auditEntity];
    const provider = {
        Entities: allEntities,
        Queries: queries,
        RowLevelSecurityFilters: rlsFilters,
        EntityByName: (name: string) =>
            allEntities.find((e) => e.Name.trim().toLowerCase() === name.trim().toLowerCase()),
        GetEntityObject: vi.fn(async (entityName: string) => {
            const info = allEntities.find((e) => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase());
            if (!info) return null;
            return {
                EntityInfo: info,
                Fields: info.Fields.map((f) => ({ Name: f.Name, ReadOnly: f.ReadOnly })),
                LatestResult: { CompleteMessage: 'Simulated entity error' },
                NewRecord: vi.fn(() => {
                    for (const key of Object.keys(entityState)) {
                        if (key !== 'ID') delete entityState[key];
                    }
                }),
                InnerLoad: vi.fn(async (_key: CompositeKey) => options.loadSuccess ?? true),
                Get: (fieldName: string) => entityState[fieldName],
                Set: (fieldName: string, val: unknown) => {
                    entityState[fieldName] = val;
                },
                GetAll: () => ({ ...entityState }),
                Save: saveMock,
                Delete: deleteMock,
            };
        }),
    } as unknown as IMetadataProvider;

    return { provider, entityState, saveMock, deleteMock };
}

describe('AgentDataPolicyGuard — Runtime Data-Access Narrowing across CRUD & Query Actions', () => {
    beforeEach(() => {
        AgentUserPolicyEngine.Instance.ClearCache();
        runViewMock.mockReset();
        runQueryMock.mockReset();
        adhocAuthorizerMock.mockReset().mockReturnValue(null);
        readOnlyProviderRunQueryMock.mockReset();
        mockReadOnlyProvider = {
            PlatformKey: 'sqlserver',
            Entities: [employeesEntity, auditEntity],
            RunQuery: (...args: unknown[]) => readOnlyProviderRunQueryMock(...args),
        } as unknown as DatabaseProviderBase;
    });

    it('GetRecordAction denies non-allow-listed entities under AllowListOnly and masks deniedFields on allowed entities', async () => {
        const user = makeUser();
        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                DefaultDataAccessMode: 'AllowListOnly',
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'Employees',
                        access: 'Full',
                        flsNarrowing: {
                            deniedFields: ['Salary', 'Internal*'],
                        },
                    },
                ],
            })
        );

        const hiredDate = new Date('2025-05-01T00:00:00.000Z');
        const { provider } = makeProvider({ initialValues: { HiredAt: hiredDate } });

        // 1. Audit Logs is NOT allow-listed -> PERMISSION_DENIED
        const deniedRes = await invokeAction(new GetRecordAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'MJ: Audit Logs' },
                { Name: 'PrimaryKey', Type: 'Input', Value: { ID: 'aud-1' } },
            ],
        });
        expect(deniedRes.Success).toBe(false);
        expect(deniedRes.ResultCode).toBe('PERMISSION_DENIED');

        // 2. Employees IS allow-listed -> Salary & InternalNotes masked, allowed Date field preserved
        const params: RunActionParams = {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'PrimaryKey', Type: 'Input', Value: { ID: 'emp-1' } },
            ],
        };
        const allowedRes = await invokeAction(new GetRecordAction(), params);
        expect(allowedRes.Success).toBe(true);
        const rec = params.Params.find((p: ActionParam) => p.Name === 'Record')?.Value as Record<string, unknown>;
        expect(rec['Name']).toBe('Jane Doe');
        expect(rec['HiredAt']).toBe(hiredDate);
        expect('Salary' in rec).toBe(false);
        expect('InternalNotes' in rec).toBe(false);
    });

    it('GetRecordsAction composes inline whereClause + rowLevelSecurityFilterId into ExtraFilter, filters by recordConditionExpression, and masks rows', async () => {
        const user = makeUser();
        const rlsFilter = new RowLevelSecurityFilterInfo({
            ID: RLS_FILTER_ID,
            Name: 'OwnEmailFilter',
            FilterText: "OwnerID = '{{UserID}}'",
        });
        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'Employees',
                        access: 'Full',
                        rlsNarrowing: {
                            whereClause: "Department = 'Engineering'",
                            rowLevelSecurityFilterId: RLS_FILTER_ID,
                            recordConditionExpression: 'record.Status === "Active"',
                        },
                        flsNarrowing: {
                            deniedFields: ['Salary'],
                        },
                    },
                ],
            })
        );

        runViewMock.mockResolvedValueOnce({
            Success: true,
            TotalRowCount: 2,
            Results: [
                { ID: 'emp-1', Name: 'Jane', Status: 'Active', Salary: 190000 },
                { ID: 'emp-2', Name: 'Bob', Status: 'Terminated', Salary: 150000 },
            ],
        });

        const { provider } = makeProvider({}, [], [rlsFilter]);
        const res = await invokeAction(new GetRecordsAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'Filter', Type: 'Input', Value: "Name LIKE 'J%'" },
            ],
        });

        expect(res.Success).toBe(true);
        const calledRunViewParams = runViewMock.mock.calls[0][0] as { ExtraFilter: string };
        expect(calledRunViewParams.ExtraFilter).toBe(
            `(Name LIKE 'J%') AND ((Department = 'Engineering') AND (OwnerID = '${ USER_ID }'))`
        );
        const rows = res.Params?.find((p: ActionParam) => p.Name === 'Records')?.Value as Array<Record<string, unknown>>;
        expect(rows).toEqual([{ ID: 'emp-1', Name: 'Jane', Status: 'Active' }]);
    });

    it('CreateRecordAction, UpdateRecordAction, WriteEntityFieldsAction, and DeleteRecordAction enforce ReadOnly, readOnlyFields, requireApprovalFields, and RequireApprovalForDestructiveActions', async () => {
        const user = makeUser();

        // 1. ReadOnly mode blocks CreateRecordAction before Save()
        AgentUserPolicyEngine.Instance.SetCachedPolicy(makePolicy({ DefaultDataAccessMode: 'ReadOnly' }));
        const createRig = makeProvider();
        const createBlocked = await invokeAction(new CreateRecordAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: createRig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'Fields', Type: 'Input', Value: { Name: 'New Hire' } },
            ],
        });
        expect(createBlocked.Success).toBe(false);
        expect(createBlocked.ResultCode).toBe('PERMISSION_DENIED');
        expect(createRig.saveMock).not.toHaveBeenCalled();

        // 2. readOnlyFields blocks mutating Salary while allowing Status on UpdateRecordAction & WriteEntityFieldsAction
        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'Employees',
                        access: 'Full',
                        flsNarrowing: {
                            readOnlyFields: ['Salary'],
                        },
                    },
                ],
            })
        );
        const updateRig = makeProvider();
        const salaryBlocked = await invokeAction(new UpdateRecordAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: updateRig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'PrimaryKey', Type: 'Input', Value: { ID: 'emp-1' } },
                { Name: 'Fields', Type: 'Input', Value: { Salary: 250000 } },
            ],
        });
        expect(salaryBlocked.Success).toBe(false);
        expect(salaryBlocked.ResultCode).toBe('PERMISSION_DENIED');
        expect(updateRig.saveMock).not.toHaveBeenCalled();

        const writeFieldsBlocked = await invokeAction(new WriteEntityFieldsAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: updateRig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'PrimaryKey', Type: 'Input', Value: { ID: 'emp-1' } },
                { Name: 'Fields', Type: 'Input', Value: { Salary: 250000 } },
            ],
        });
        expect(writeFieldsBlocked.Success).toBe(false);
        expect(writeFieldsBlocked.ResultCode).toBe('PERMISSION_DENIED');

        const statusAllowed = await invokeAction(new UpdateRecordAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: updateRig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'PrimaryKey', Type: 'Input', Value: { ID: 'emp-1' } },
                { Name: 'Fields', Type: 'Input', Value: { Status: 'On Leave' } },
            ],
        });
        expect(statusAllowed.Success).toBe(true);
        expect(updateRig.saveMock).toHaveBeenCalledTimes(1);

        // 3. RequireApprovalForDestructiveActions on Delete maps to APPROVAL_REQUIRED without deleting
        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                RequireApprovalForDestructiveActions: true,
            })
        );
        const deleteRig = makeProvider();
        const delRes = await invokeAction(new DeleteRecordAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: deleteRig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'PrimaryKey', Type: 'Input', Value: { ID: 'emp-1' } },
            ],
        });
        expect(delRes.Success).toBe(false);
        expect(delRes.ResultCode).toBe('APPROVAL_REQUIRED');
        expect(deleteRig.deleteMock).not.toHaveBeenCalled();
    });

    it('RunStoredQueryAction masks deniedFields on allowed queries and blocks queries referencing row-filtered entities', async () => {
        const user = makeUser();
        const empQuery = {
            ID: 'q-emp-1',
            Name: 'Active Employees Directory',
            SQL: 'SELECT ID, Name, Salary FROM __mj.vwEmployees',
            Entities: [{ QueryID: 'q-emp-1', EntityID: EMPLOYEES_ENTITY_ID, Entity: 'Employees' } as QueryEntityInfo],
        } as unknown as QueryInfo;
        const { provider } = makeProvider({}, [empQuery]);

        // 1. Denied fields masked on stored query output + formatted JSON
        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'Employees',
                        access: 'Full',
                        flsNarrowing: {
                            deniedFields: ['Salary'],
                        },
                    },
                ],
            })
        );
        runQueryMock.mockResolvedValueOnce({
            Success: true,
            ExecutionTime: 12,
            Results: [{ ID: 'emp-1', Name: 'Jane Doe', Salary: 185000 }],
        });

        const params: RunActionParams = {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [
                { Name: 'QueryName', Type: 'Input', Value: 'Active Employees Directory' },
                { Name: 'DataFormat', Type: 'Input', Value: 'json' },
            ],
        };
        const okRes = await invokeAction(new RunStoredQueryAction(), params);
        expect(okRes.Success).toBe(true);
        const outRows = params.Params.find((p: ActionParam) => p.Name === 'Results')?.Value as Array<Record<string, unknown>>;
        expect(outRows).toEqual([{ ID: 'emp-1', Name: 'Jane Doe' }]);
        const formatted = params.Params.find((p: ActionParam) => p.Name === 'FormattedResults')?.Value as string;
        expect(formatted).not.toContain('Salary');
        expect(formatted).not.toContain('185000');

        // 2. Stored query refused when agent policy adds row-level narrowing on Employees
        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'Employees',
                        access: 'Full',
                        rlsNarrowing: {
                            whereClause: "Department = 'Engineering'",
                        },
                    },
                ],
            })
        );
        const rowFilteredRes = await invokeAction(new RunStoredQueryAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [{ Name: 'QueryName', Type: 'Input', Value: 'Active Employees Directory' }],
        });
        expect(rowFilteredRes.Success).toBe(false);
        expect(rowFilteredRes.ResultCode).toBe('PERMISSION_DENIED');
    });

    it('RunAdhocQueryAction masks deniedFields on SELECT *, refuses explicit references/aliases to denied fields, and refuses row-filtered or non-allow-listed entities', async () => {
        const user = makeUser();
        const { provider } = makeProvider();

        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                DefaultDataAccessMode: 'AllowListOnly',
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'Employees',
                        access: 'Full',
                        flsNarrowing: {
                            deniedFields: ['Salary'],
                        },
                    },
                ],
            })
        );

        // 1. SELECT * FROM __mj.vwEmployees -> allowed, and Salary stripped from results + CSV
        readOnlyProviderRunQueryMock.mockResolvedValueOnce({
            Success: true,
            TotalRowCount: 1,
            RowCount: 1,
            Results: [{ ID: 'emp-1', Name: 'Jane Doe', Department: 'Engineering', Salary: 185000 }],
        });
        const starParams: RunActionParams = {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [
                { Name: 'Query', Type: 'Input', Value: 'SELECT * FROM __mj.vwEmployees' },
                { Name: 'DataFormat', Type: 'Input', Value: 'csv' },
            ],
        };
        const starRes = await invokeAction(new RunAdhocQueryAction(), starParams);
        expect(starRes.Success).toBe(true);
        const adhocRows = starParams.Params.find((p: ActionParam) => p.Name === 'Results')?.Value as Array<Record<string, unknown>>;
        expect(adhocRows).toEqual([{ ID: 'emp-1', Name: 'Jane Doe', Department: 'Engineering' }]);

        // 2. Explicit column alias or WHERE predicate naming Salary -> refused before SQL executes!
        const aliasRes = await invokeAction(new RunAdhocQueryAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [{ Name: 'Query', Type: 'Input', Value: 'SELECT Name, Salary AS Compensation FROM __mj.vwEmployees' }],
        });
        expect(aliasRes.Success).toBe(false);
        expect(aliasRes.ResultCode).toBe('PERMISSION_DENIED');
        expect(readOnlyProviderRunQueryMock).toHaveBeenCalledTimes(1);

        // 3. Non-allow-listed entity (MJ: Audit Logs) -> refused!
        const auditRes = await invokeAction(new RunAdhocQueryAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [{ Name: 'Query', Type: 'Input', Value: 'SELECT ID FROM __mj.vwAuditLogs' }],
        });
        expect(auditRes.Success).toBe(false);
        expect(auditRes.ResultCode).toBe('PERMISSION_DENIED');
    });

    it('fails closed on policy lookup error, refuses 1=1) OR (1=1 paren breakouts, and refuses Filter/OrderBy referencing denied fields', async () => {
        const user = makeUser();
        const { provider } = makeProvider();

        // 1. Policy lookup error (Success: false) fails closed instead of running unnarrowed
        runViewMock.mockResolvedValueOnce({
            Success: false,
            Results: [],
            ErrorMessage: 'Simulated policy DB error',
        });
        const lookupFailRes = await invokeAction(new GetRecordsAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [{ Name: 'EntityName', Type: 'Input', Value: 'Employees' }],
        });
        expect(lookupFailRes.Success).toBe(false);
        expect(lookupFailRes.ResultCode).toBe('PERMISSION_DENIED');
        expect(lookupFailRes.Message).toMatch(/Simulated policy DB error/i);

        // 2. Paren breakout in Filter is refused before RunView executes
        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'Employees',
                        access: 'ReadOnly',
                        rlsNarrowing: { whereClause: "Department = 'Engineering'" },
                        flsNarrowing: { deniedFields: ['Salary'] },
                    },
                ],
            })
        );
        runViewMock.mockClear();

        const breakoutRes = await invokeAction(new GetRecordsAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'Filter', Type: 'Input', Value: '1=1) OR (1=1' },
            ],
        });
        expect(breakoutRes.Success).toBe(false);
        expect(runViewMock).not.toHaveBeenCalled();

        // 3. Filter and OrderBy referencing denied field Salary are refused
        const deniedFilterRes = await invokeAction(new GetRecordsAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'Filter', Type: 'Input', Value: 'Salary > 150000' },
            ],
        });
        expect(deniedFilterRes.Success).toBe(false);
        expect(deniedFilterRes.ResultCode).toBe('PERMISSION_DENIED');

        const deniedOrderRes = await invokeAction(new GetRecordsAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'OrderBy', Type: 'Input', Value: 'Salary DESC' },
            ],
        });
        expect(deniedOrderRes.Success).toBe(false);
        expect(deniedOrderRes.ResultCode).toBe('PERMISSION_DENIED');
        expect(runViewMock).not.toHaveBeenCalled();
    });

    it('refuses stored queries that alias/aggregate denied fields, use CTE positional renames, or read non-allow-listed SQL tables missing from QueryEntities', async () => {
        const user = makeUser();
        const aliasedQuery = {
            ID: 'q-alias',
            Name: 'Aliased Salary Query',
            SQL: 'SELECT ID, Salary AS TotalComp FROM __mj.vwEmployees',
            Entities: [{ QueryID: 'q-alias', EntityID: EMPLOYEES_ENTITY_ID, Entity: 'Employees' } as QueryEntityInfo],
        } as Partial<QueryInfo> as QueryInfo;
        const ctePositionalQuery = {
            ID: 'q-cte',
            Name: 'CTE Positional Query',
            SQL: 'WITH c(a, b, c_col, d, e, f) AS (SELECT * FROM __mj.vwEmployees) SELECT a, e FROM c',
            Entities: [{ QueryID: 'q-cte', EntityID: EMPLOYEES_ENTITY_ID, Entity: 'Employees' } as QueryEntityInfo],
        } as Partial<QueryInfo> as QueryInfo;
        const unindexedAuditQuery = {
            ID: 'q-unindexed-audit',
            Name: 'Unindexed Audit Query',
            SQL: 'SELECT ID, Description FROM __mj.vwAuditLogs',
            Entities: [], // Stale/empty QueryEntities metadata!
        } as Partial<QueryInfo> as QueryInfo;

        const { provider } = makeProvider({}, [aliasedQuery, ctePositionalQuery, unindexedAuditQuery]);

        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                DefaultDataAccessMode: 'AllowListOnly',
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'Employees',
                        access: 'ReadOnly',
                        flsNarrowing: { deniedFields: ['Salary'] },
                    },
                ],
            })
        );

        for (const queryName of ['Aliased Salary Query', 'CTE Positional Query', 'Unindexed Audit Query']) {
            const res = await invokeAction(new RunStoredQueryAction(), {
                Action: {} as RunActionParams['Action'],
                ContextUser: user,
                Context: { AgentID: AGENT_ID },
                Provider: provider,
                Filters: [],
                Params: [{ Name: 'QueryName', Type: 'Input', Value: queryName }],
            });
            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('PERMISSION_DENIED');
        }
        expect(runQueryMock).not.toHaveBeenCalled();
    });

    it('enforces policy whereClause on CreateRecordAction and post-mutation UpdateRecordAction, and redacts UpdatedFields.oldValue on read-denied fields', async () => {
        const user = makeUser();

        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'Employees',
                        access: 'ReadWrite',
                        rlsNarrowing: { whereClause: "Department = 'Engineering'" },
                        flsNarrowing: { deniedFields: ['InternalNotes'] },
                    },
                ],
            })
        );

        // 1. CreateRecordAction creating a row in Sales (outside Department = 'Engineering') is refused before Save()
        const createRig = makeProvider();
        const createDenied = await invokeAction(new CreateRecordAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: createRig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'Fields', Type: 'Input', Value: { Name: 'Bob', Department: 'Sales', Status: 'Active' } },
            ],
        });
        expect(createDenied.Success).toBe(false);
        expect(createDenied.ResultCode).toBe('PERMISSION_DENIED');
        expect(createRig.saveMock).not.toHaveBeenCalled();

        // 2. UpdateRecordAction moving an Engineering row out of scope to Finance is refused before Save()
        const moveOutRig = makeProvider({ initialValues: { ID: 'emp-1', Department: 'Engineering' } });
        runViewMock.mockResolvedValueOnce({ Success: true, Results: [{ ID: 'emp-1' }], RowCount: 1 });
        const updateOutRes = await invokeAction(new UpdateRecordAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: moveOutRig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'PrimaryKey', Type: 'Input', Value: { ID: 'emp-1' } },
                { Name: 'Fields', Type: 'Input', Value: { Department: 'Finance' } },
            ],
        });
        expect(updateOutRes.Success).toBe(false);
        expect(updateOutRes.ResultCode).toBe('PERMISSION_DENIED');
        expect(moveOutRig.saveMock).not.toHaveBeenCalled();

        // 3. Updating a write-allowed but read-denied field omits UpdatedFields.oldValue and avoids a NO_CHANGES equality oracle
        const flsReadDeniedEntity = makeEntityInfo(
            EMPLOYEES_ENTITY_ID,
            'Employees',
            '__mj',
            'Employee',
            'vwEmployees',
            [makeField('ID', true, true), makeField('Name'), makeField('Department'), makeField('Salary')]
        );
        (flsReadDeniedEntity as { GetDeniedReadFields?: () => Set<string> }).GetDeniedReadFields = () =>
            new Set<string>(['Salary']);

        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                EntityAccessRulesObject: [{ entityPattern: 'Employees', access: 'ReadWrite' }],
            })
        );
        const flsRig = makeProvider({ initialValues: { ID: 'emp-1', Department: 'Engineering', Salary: 185000 } });
        (flsRig.provider as { Entities: EntityInfo[]; EntityByName: (n: string) => EntityInfo | undefined }).Entities = [
            flsReadDeniedEntity,
        ];
        (
            flsRig.provider as { Entities: EntityInfo[]; EntityByName: (n: string) => EntityInfo | undefined }
        ).EntityByName = () => flsReadDeniedEntity;
        const origGetEntityObj = flsRig.provider.GetEntityObject.bind(flsRig.provider);
        flsRig.provider.GetEntityObject = (async <T>(name: string): Promise<T> => {
            const obj = (await origGetEntityObj(name)) as T & { EntityInfo: EntityInfo };
            if (obj) {
                obj.EntityInfo = flsReadDeniedEntity;
            }
            return obj;
        }) as IMetadataProvider['GetEntityObject'];

        const updateParams: RunActionParams = {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: flsRig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'PrimaryKey', Type: 'Input', Value: { ID: 'emp-1' } },
                { Name: 'Fields', Type: 'Input', Value: { Salary: 195000 } },
            ],
        };
        const flsUpdateRes = await invokeAction(new UpdateRecordAction(), updateParams);
        expect(flsUpdateRes.Success).toBe(true);
        const updatedFields = updateParams.Params.find((p: ActionParam) => p.Name === 'UpdatedFields')?.Value as Record<
            string,
            { oldValue?: string | number; newValue: string | number }
        >;
        expect('oldValue' in (updatedFields['Salary'] ?? {})).toBe(false);
        expect(updatedFields['Salary']?.oldValue).toBeUndefined();
        expect(updatedFields['Salary']?.newValue).toBe(195000);

        // Same-value update on read-denied Salary must NOT short-circuit with NO_CHANGES (prevents equality oracle)
        const sameValRig = makeProvider({ initialValues: { ID: 'emp-1', Department: 'Engineering', Salary: 185000 } });
        (sameValRig.provider as { Entities: EntityInfo[]; EntityByName: (n: string) => EntityInfo | undefined }).Entities = [
            flsReadDeniedEntity,
        ];
        (
            sameValRig.provider as { Entities: EntityInfo[]; EntityByName: (n: string) => EntityInfo | undefined }
        ).EntityByName = () => flsReadDeniedEntity;
        const origSameValGetObj = sameValRig.provider.GetEntityObject.bind(sameValRig.provider);
        sameValRig.provider.GetEntityObject = (async <T>(name: string): Promise<T> => {
            const obj = (await origSameValGetObj(name)) as T & { EntityInfo: EntityInfo };
            if (obj) {
                obj.EntityInfo = flsReadDeniedEntity;
            }
            return obj;
        }) as IMetadataProvider['GetEntityObject'];

        const sameValRes = await invokeAction(new UpdateRecordAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: sameValRig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'PrimaryKey', Type: 'Input', Value: { ID: 'emp-1' } },
                { Name: 'Fields', Type: 'Input', Value: { Salary: 185000 } },
            ],
        });
        expect(sameValRes.Success).toBe(true);
        expect(sameValRes.ResultCode).not.toBe('NO_CHANGES');
        expect(sameValRig.saveMock).toHaveBeenCalledTimes(1);
    });

    it('unconditionally refuses generic CRUD writes to MJ: AI Agent User Policies from an agent context and blocks whole-row / ordinal clauses on GetRecords', async () => {
        const user = makeUser();
        const policyEntityInfo = makeEntityInfo(
            '99999999-0000-4000-8000-000000000099',
            'MJ: AI Agent User Policies',
            '__mj',
            'AIAgentUserPolicy',
            'vwAIAgentUserPolicies',
            [makeField('ID', true, true), makeField('RequireApprovalForExternalComms'), makeField('EmailChannelMode')]
        );
        const rig = makeProvider({
            initialValues: {
                ID: 'policy-1',
                RequireApprovalForExternalComms: true,
                EmailChannelMode: 'Disabled',
            },
        });
        const existingEntities = (rig.provider as { Entities: EntityInfo[] }).Entities;
        existingEntities.push(policyEntityInfo);

        // Even under UserCeiling with full access, generic CRUD actions cannot write to MJ: AI Agent User Policies
        AgentUserPolicyEngine.Instance.SetCachedPolicy(
            makePolicy({
                DefaultDataAccessMode: 'UserCeiling',
                EntityAccessRulesObject: [
                    {
                        entityPattern: '*',
                        access: 'ReadWrite',
                    },
                    {
                        entityPattern: 'Employees',
                        access: 'ReadOnly',
                        flsNarrowing: { deniedFields: ['Salary'] },
                    },
                ],
            })
        );

        const updatePolicyRes = await invokeAction(new UpdateRecordAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: rig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'MJ: AI Agent User Policies' },
                { Name: 'PrimaryKey', Type: 'Input', Value: { ID: 'policy-1' } },
                {
                    Name: 'Fields',
                    Type: 'Input',
                    Value: { RequireApprovalForExternalComms: false, EmailChannelMode: 'SendAsUser' },
                },
            ],
        });
        expect(updatePolicyRes.Success).toBe(false);
        expect(updatePolicyRes.ResultCode).toBe('PERMISSION_DENIED');
        expect(updatePolicyRes.Message).toMatch(/Configure Agent User Policy/);
        expect(rig.saveMock).not.toHaveBeenCalled();

        // Ordinal OrderBy and whole-row Filter constructs on Employees (which has denied field Salary) are refused
        const ordinalOrderRes = await invokeAction(new GetRecordsAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: rig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'OrderBy', Type: 'Input', Value: '2 DESC' },
            ],
        });
        expect(ordinalOrderRes.Success).toBe(false);
        expect(ordinalOrderRes.ResultCode).toBe('PERMISSION_DENIED');

        const jsonbFilterRes = await invokeAction(new GetRecordsAction(), {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: rig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                { Name: 'Filter', Type: 'Input', Value: "to_jsonb(vwEmployees)::text LIKE '%185000%'" },
            ],
        });
        expect(jsonbFilterRes.Success).toBe(false);
        expect(jsonbFilterRes.ResultCode).toBe('PERMISSION_DENIED');

        // PostgreSQL provider GetRecords with denied field Salary allows valid PG filter and EXISTS (SELECT * ...)
        (rig.provider as { PlatformKey?: string }).PlatformKey = 'postgresql';
        runViewMock.mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: 'emp-1', Name: 'Jane', Department: 'Engineering', Salary: 185000 }],
            RowCount: 1,
        });
        const pgGetRecordsParams: RunActionParams = {
            Action: {} as RunActionParams['Action'],
            ContextUser: user,
            Context: { AgentID: AGENT_ID },
            Provider: rig.provider,
            Filters: [],
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'Employees' },
                {
                    Name: 'Filter',
                    Type: 'Input',
                    Value: `"Department" = 'Engineering' AND EXISTS (SELECT * FROM "__mj"."vwEmployees" e2 WHERE e2."ID" = "ID")`,
                },
                { Name: 'OrderBy', Type: 'Input', Value: `"Name" ASC` },
            ],
        };
        const pgRes = await invokeAction(new GetRecordsAction(), pgGetRecordsParams);
        expect(pgRes.Success).toBe(true);
        const pgRecords = pgRes.Params?.find((p: ActionParam) => p.Name === 'Records')?.Value as Array<
            Record<string, unknown>
        >;
        expect(pgRecords).toHaveLength(1);
        expect(pgRecords[0]['Salary']).toBeUndefined();
    });
});
