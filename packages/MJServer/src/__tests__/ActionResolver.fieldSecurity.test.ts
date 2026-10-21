// type-graphql decorators call `Reflect.getMetadata`; the polyfill must load before the resolver.
import 'reflect-metadata';

/**
 * Field-level security and identity on `RunEntityAction`.
 *
 * - **Identity.** The record an entity action runs on is loaded for the CALLER. Loaded with no
 *   user, it fell back to the provider's current user (the system user on a server), which is
 *   full width and ignores the caller's row-level security as well.
 * - **Output.** `ResultData` echoes the run's parameters back to the caller. The record bound as
 *   `'Entity Object Data'` (a plain copy of its field values) and any entity object among the
 *   parameters are projected for the caller; values of unknown shape are left alone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
        ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
        Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
        Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
        createUnionType: () => class {},
        AuthorizationError: class AuthorizationError extends Error {},
        Float: class {}, Int: class {}, ID: class {},
    };
});

const hoisted = vi.hoisted(() => ({
    runEntityAction: vi.fn(),
    entityActions: [] as unknown[],
    actionParams: [] as unknown[],
}));

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: { Instance: { get ActionParams() { return hoisted.actionParams; }, Actions: [] } },
    EntityActionEngineServer: {
        Instance: {
            Config: vi.fn(async () => undefined),
            get EntityActions() { return hoisted.entityActions; },
            RunEntityAction: hoisted.runEntityAction,
        },
    },
}));

import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { ActionResolver, type EntityActionInput } from '../resolvers/ActionResolver.js';
import type { AppContext } from '../types.js';
import { EMPLOYEES_ENTITY_ID, EmployeeEntity, FullWidthEmployeeRow, Intern, SECRET_SALARY } from './fieldSecurityFixtures.js';

const ENTITY_ACTION_ID = 'EA000000-0000-4000-8000-000000000001';
const RECORD_PARAM_ID = 'AP000000-0000-4000-8000-000000000001';

class EmployeeObject extends BaseEntity {}

/** An entity object holding every column: what a load with no user produces on a server. */
async function fullWidthEntityObject(entityInfo: EntityInfo): Promise<BaseEntity> {
    const entity = new EmployeeObject(entityInfo);
    await entity.LoadFromData(FullWidthEmployeeRow());
    return entity;
}

function context(entityInfo: EntityInfo, getEntityObject: ReturnType<typeof vi.fn>): AppContext {
    const provider = { Entities: [entityInfo], EntityByID: () => undefined, GetEntityObject: getEntityObject };
    return {
        providers: [{ type: 'Read-Only', provider }],
        userPayload: { userRecord: Intern(), email: 'intern-1@test.com' },
    } as unknown as AppContext;
}

const input = (): EntityActionInput => ({
    EntityActionID: ENTITY_ACTION_ID,
    InvocationType: 'SingleRecord',
    EntityName: 'Employees',
    PrimaryKey: { KeyValuePairs: [{ Key: 'ID', Value: 'emp-1' }] },
} as unknown as EntityActionInput);

let entityInfo: EntityInfo;
let getEntityObject: ReturnType<typeof vi.fn>;

beforeEach(async () => {
    vi.clearAllMocks();
    entityInfo = EmployeeEntity();
    getEntityObject = vi.fn(async () => ({ InnerLoad: vi.fn(async () => true) }));
    hoisted.entityActions.length = 0;
    hoisted.entityActions.push({
        ID: ENTITY_ACTION_ID,
        EntityID: EMPLOYEES_ENTITY_ID,
        Params: [{ ActionParamID: RECORD_PARAM_ID, ValueType: 'Entity Object Data' }],
    });
    hoisted.actionParams.length = 0;
    hoisted.actionParams.push({ ID: RECORD_PARAM_ID, Name: 'Record' });
    hoisted.runEntityAction.mockResolvedValue({ Success: true, Message: 'ok', Params: [] });
});

describe('RunEntityAction: the record is loaded for the caller', () => {
    it('REGRESSION: loads the bound record with the caller as its user', async () => {
        await new ActionResolver().RunEntityAction(input(), context(entityInfo, getEntityObject));
        expect(getEntityObject).toHaveBeenCalledWith('Employees', expect.objectContaining({ ID: 'intern-1' }));
    });

    it('refuses to run on a record the caller cannot load, with no hint whether it exists', async () => {
        getEntityObject.mockResolvedValue({ InnerLoad: vi.fn(async () => false) });
        const result = await new ActionResolver().RunEntityAction(input(), context(entityInfo, getEntityObject));
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('Record not found or access denied');
        expect(hoisted.runEntityAction).not.toHaveBeenCalled();
    });
});

describe('RunEntityAction: echoed parameters are projected for the caller', () => {
    it("REGRESSION: the 'Entity Object Data' parameter never carries a denied value", async () => {
        const params = [{ Name: 'Record', Value: FullWidthEmployeeRow(), Type: 'Input' }];
        hoisted.runEntityAction.mockResolvedValue({ Success: true, Message: 'ok', Params: params, RunParams: { Params: params } });

        const result = await new ActionResolver().RunEntityAction(input(), context(entityInfo, getEntityObject));

        expect(result.Success).toBe(true);
        expect(result.ResultData).not.toContain(String(SECRET_SALARY));
        expect(JSON.parse(result.ResultData!).Params[0].Value).toEqual({ ID: 'emp-1', Name: 'Ada', Notes: 'n' });
    });

    it('REGRESSION: an entity object among the parameters is sent as its projected field values', async () => {
        const params = [{ Name: 'Entity', Value: await fullWidthEntityObject(entityInfo), Type: 'Input' }];
        hoisted.runEntityAction.mockResolvedValue({ Success: true, Message: 'ok', Params: params, RunParams: { Params: params } });

        const result = await new ActionResolver().RunEntityAction(input(), context(entityInfo, getEntityObject));

        expect(result.ResultData).not.toContain(String(SECRET_SALARY));
        expect(JSON.parse(result.ResultData!).Params[0].Value).toMatchObject({ ID: 'emp-1', Name: 'Ada' });
    });

    it('leaves a parameter of unknown shape alone', async () => {
        const params = [{ Name: 'Other', Value: { Salary: 1 }, Type: 'Output' }];
        hoisted.runEntityAction.mockResolvedValue({ Success: true, Message: 'ok', Params: params });

        const result = await new ActionResolver().RunEntityAction(input(), context(entityInfo, getEntityObject));

        expect(JSON.parse(result.ResultData!).Params[0].Value).toEqual({ Salary: 1 });
    });
});
