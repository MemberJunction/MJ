/**
 * An entity action invoked on a View or List loads its records as `entity_object` and binds each
 * record's `GetAll()` as the `'Entity Object Data'` parameter. That parameter is echoed back to the
 * caller and saved to the action log, so it must be the caller's width.
 *
 * The provider here returns FULL-width rows and builds the entity objects the way the real provider
 * does (`TransformSimpleObjectToEntityObject` with the caller as the user), so the only thing
 * between the denied value and the parameter is the entity object's own narrowing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { MJActionParamEntity, MJEntityActionParamEntity } from '@memberjunction/core-entities';
import { EntityActionInvocationParams } from '@memberjunction/actions-base';
import { EntityActionInvocationMultipleRecords } from '../entity-actions/EntityActionInvocationTypes';
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

/** Exposes the protected record-set resolution. */
class TestInvocation extends EntityActionInvocationMultipleRecords {
    public records(params: EntityActionInvocationParams): Promise<BaseEntity[]> {
        return this.GetRecordList(params);
    }
}

const entityInfo = EmployeeEntityInfo();

/** Serves full-width rows; member objects are built for the user RunView was called with. */
class FullWidthProvider {
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
        if (params.EntityName === 'MJ: List Details') {
            return ok([{ RecordID: EMPLOYEE_ROW_ID }]);
        }
        return ok(await TransformSimpleObjectToEntityObject(this as unknown as IMetadataProvider, 'Employees', [FullEmployeeRow()], contextUser));
    }
}

const ACTION_PARAM = { ID: 'ap-data', Name: 'Record', Type: 'Input' } as unknown as MJActionParamEntity;
const DATA_BINDING = { ID: 'eap-data', ActionParamID: 'ap-data', ValueType: 'Entity Object Data', Value: null } as unknown as MJEntityActionParamEntity;

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

/** The `'Entity Object Data'` value bound for each record of a `invocation` run by `caller`. */
async function boundDataFor(invocation: 'View' | 'List', caller: UserInfo): Promise<Record<string, unknown>[]> {
    const params = {
        InvocationType: { Name: invocation },
        ViewID: 'view-1',
        ListID: 'list-1',
        EntityAction: { EntityID: EMPLOYEE_ENTITY_ID },
        ContextUser: caller,
    } as unknown as EntityActionInvocationParams;
    const invoker = new TestInvocation();
    const records = await invoker.records(params);
    expect(records).toHaveLength(1);
    const bound = await Promise.all(records.map((r) => invoker.MapParams([ACTION_PARAM], [DATA_BINDING], r)));
    return bound.map((p) => p[0].Value as Record<string, unknown>);
}

describe.each(['View', 'List'] as const)("'Entity Object Data' on a %s invocation", (invocation) => {
    it('carries no value the caller may not read', async () => {
        const [data] = await boundDataFor(invocation, BuildUser([INTERN_ROLE_ID], 'intern-1'));
        expect(data).toMatchObject({ ID: EMPLOYEE_ROW_ID, Name: 'Ada' });
        expect('Salary' in data).toBe(false);
        expect(JSON.stringify(data)).not.toContain(String(SALARY));
    });

    it('keeps every field for a caller who may read it', async () => {
        const [data] = await boundDataFor(invocation, BuildUser([HR_ROLE_ID], 'hr-1'));
        expect(data.Salary).toBe(SALARY);
    });
});
