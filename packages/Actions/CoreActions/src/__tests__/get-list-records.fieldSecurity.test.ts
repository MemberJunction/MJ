/**
 * Get List Records with `IncludeRecordDetails` loads the member records as `entity_object` and
 * returns their `GetAll()` as `RecordDetails`. The values must be the caller's width: a field the
 * caller may not read never reaches the output.
 *
 * The provider here returns FULL-width rows, as a database does, and builds the entity objects the
 * way the real provider does (`TransformSimpleObjectToEntityObject` with the caller as the user),
 * so the only thing between the denied value and the output is the entity object's own narrowing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    BaseEntity,
    IMetadataProvider,
    IRunViewProvider,
    Metadata,
    RunView,
    RunViewParams,
    RunViewResult,
    TransformSimpleObjectToEntityObject,
    UserInfo,
} from '@memberjunction/core';
import {
    BuildUser,
    EMPLOYEE_ENTITY_ID,
    EMPLOYEE_ROW_ID,
    EmployeeEntity,
    EmployeeEntityInfo,
    FullEmployeeRow,
    HR_ROLE_ID,
    INTERN_ROLE_ID,
    SALARY,
} from './fieldSecurityFixture';

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));

import { GetListRecordsAction } from '../custom/lists/get-list-records.action';

const entityInfo = EmployeeEntityInfo();
const LIST_ID = 'list-1';

/**
 * A provider that serves full-width rows. `buildAs` decides which user the member entity objects
 * are built for; the real provider uses the caller, and a test can override it to show what an
 * object of the wrong width would leak.
 */
class FullWidthProvider {
    public buildAs: (caller: UserInfo | undefined) => UserInfo | undefined = (caller) => caller;
    public readonly Entities = [entityInfo];
    public CurrentUser: UserInfo | null = null;
    public EntityByID(id: string) { return id === EMPLOYEE_ENTITY_ID ? entityInfo : undefined; }
    public EntityByName(name: string) { return name === 'Employees' ? entityInfo : undefined; }
    public async GetEntityObject<T extends BaseEntity>(_name: string, user?: UserInfo): Promise<T> {
        const entity = new EmployeeEntity(entityInfo, null);
        if (user) entity.ContextCurrentUser = user;
        return entity as unknown as T;
    }
    public async RunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        const ok = (Results: unknown[]) => ({ Success: true, Results, TotalRowCount: Results.length, RowCount: Results.length } as unknown as RunViewResult<T>);
        if (params.EntityName === 'MJ: Lists') {
            return ok([{ ID: LIST_ID, Name: 'Staff', Entity: 'Employees' }]);
        }
        if (params.EntityName === 'MJ: List Details') {
            return ok([{ ID: 'ld-1', RecordID: EMPLOYEE_ROW_ID, Sequence: 1, Status: 'Active', AdditionalData: null }]);
        }
        const objects = await TransformSimpleObjectToEntityObject(this as unknown as IMetadataProvider, 'Employees', [FullEmployeeRow()], this.buildAs(contextUser));
        return ok(objects);
    }
}

let provider: FullWidthProvider;
let prevRV: IRunViewProvider;
let prevMD: IMetadataProvider;

beforeEach(() => {
    provider = new FullWidthProvider();
    prevRV = RunView.Provider;
    prevMD = Metadata.Provider;
    RunView.Provider = provider as unknown as IRunViewProvider;
    Metadata.Provider = provider as unknown as IMetadataProvider;
});

afterEach(() => {
    RunView.Provider = prevRV;
    Metadata.Provider = prevMD;
});

type Param = { Name: string; Type: string; Value: unknown };

async function recordsFor(caller: UserInfo): Promise<Array<{ RecordDetails?: Record<string, unknown> }>> {
    const params = {
        Params: [
            { Name: 'ListID', Type: 'Input', Value: LIST_ID },
            { Name: 'IncludeRecordDetails', Type: 'Input', Value: true },
        ] as Param[],
        ContextUser: caller,
        Provider: provider,
    };
    const result = await (new GetListRecordsAction() as unknown as { InternalRunAction(p: unknown): Promise<{ Success: boolean; Message: string }> })
        .InternalRunAction(params);
    expect(result.Success, result.Message).toBe(true);
    return params.Params.find((p) => p.Name === 'Records')?.Value as Array<{ RecordDetails?: Record<string, unknown> }>;
}

describe('Get List Records field security', () => {
    it('RecordDetails carries no value the caller may not read', async () => {
        const records = await recordsFor(BuildUser([INTERN_ROLE_ID], 'intern-1'));
        expect(records[0].RecordDetails).toMatchObject({ ID: EMPLOYEE_ROW_ID, Name: 'Ada' });
        expect(records[0].RecordDetails && 'Salary' in records[0].RecordDetails).toBe(false);
        expect(JSON.stringify(records)).not.toContain(String(SALARY));
    });

    it('RecordDetails keeps every field for a caller who may read it', async () => {
        const records = await recordsFor(BuildUser([HR_ROLE_ID], 'hr-1'));
        expect(records[0].RecordDetails?.Salary).toBe(SALARY);
    });
});
