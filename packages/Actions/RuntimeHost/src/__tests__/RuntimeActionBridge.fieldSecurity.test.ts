/**
 * The Runtime action bridge's entity handlers return `GetAll()` to sandboxed code. After a save
 * the provider re-reads the WHOLE row (a save procedure's `SELECT *`), so the returned record must
 * still be the caller's width: a field the caller may not read never reaches the sandbox, whether
 * the record was loaded, created, updated or upserted.
 *
 * The provider here behaves like a database that does not narrow: Load and Save both return the
 * full stored row. The only thing between the denied value and the sandbox is the entity object's
 * own narrowing, at load and at the post-save rehydration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: {} } }));
vi.mock('@memberjunction/ai-agents', () => ({ AgentRunner: class {} }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: {} } }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('@memberjunction/ai-core-plus', () => ({ AIPromptParams: class {} }));

import { BaseEntity, CompositeKey, UserInfo } from '@memberjunction/core';
import type { BridgeContext } from '@memberjunction/actions-base';
import { BuildRuntimeActionBridgeHandlers } from '../RuntimeActionBridge';
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

const entityInfo = EmployeeEntityInfo();

/** A provider that stores full rows, and whose Load and Save return the FULL stored row. */
function makeProvider() {
    const rows = new Map<string, Record<string, unknown>>([[EMPLOYEE_ROW_ID, FullEmployeeRow()]]);
    const provider = {
        rows,
        CurrentUser: null as UserInfo | null,
        Entities: [entityInfo],
        EntityByID: (id: string) => (id === EMPLOYEE_ENTITY_ID ? entityInfo : undefined),
        EntityByName: (name: string) => (name === 'Employees' ? entityInfo : undefined),
        get SupportsEntityTransactions() { return false; },
        get IsInTransaction() { return false; },
        async GetEntityObject<T extends BaseEntity>(_name: string, user?: UserInfo): Promise<T> {
            const entity = new EmployeeEntity(entityInfo, provider as never);
            if (user) entity.ContextCurrentUser = user;
            return entity as unknown as T;
        },
        async Load(_entity: BaseEntity, key: CompositeKey): Promise<Record<string, unknown> | null> {
            const row = rows.get(String(key.KeyValuePairs?.[0]?.Value ?? ''));
            return row ? { ...row } : null;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            const own = entity.GetAll() as Record<string, unknown>;
            const id = String(own.ID);
            const stored: Record<string, unknown> = { ...(rows.get(id) ?? {}), ...own, ID: id };
            // A new row gets the column's default, which the INSERT's SELECT * then returns.
            stored.Salary ??= SALARY;
            rows.set(id, stored);
            return { ...stored };
        },
        async Delete(): Promise<boolean> { return true; },
        SetCachedRecordName(): void { /* no-op */ },
        GetCachedRecordName(): string | undefined { return undefined; },
    };
    return provider;
}

function contextFor(user: UserInfo, provider: ReturnType<typeof makeProvider>): BridgeContext {
    return {
        action: { Name: 'Test Runtime', ID: 'runtime-action' },
        config: { permissions: { allowedActions: [], allowedAgents: [], allowedEntities: [{ id: EMPLOYEE_ENTITY_ID, name: 'Employees' }] } },
        contextUser: user,
        provider,
    } as unknown as BridgeContext;
}

type EntityResult = { Success: boolean; Record: Record<string, unknown> | null; ErrorMessage: string | null };

const calls: Array<[string, (handler: string) => Record<string, unknown>]> = [
    ['entity.Load', () => ({ entityName: 'Employees', id: EMPLOYEE_ROW_ID })],
    ['entity.Create', () => ({ entityName: 'Employees', data: { Name: 'Grace', Notes: 'new' } })],
    ['entity.Update', () => ({ entityName: 'Employees', id: EMPLOYEE_ROW_ID, data: { Notes: 'edited' } })],
    ['entity.Save', () => ({ entityName: 'Employees', data: { ID: EMPLOYEE_ROW_ID, Notes: 'upserted' } })],
];

async function callAs(user: UserInfo, handler: string, args: Record<string, unknown>): Promise<EntityResult> {
    const provider = makeProvider();
    const handlers = BuildRuntimeActionBridgeHandlers(contextFor(user, provider));
    return (await handlers[handler](args)) as EntityResult;
}

describe.each(calls)('%s field security', (handler, args) => {
    let intern: UserInfo;
    let hr: UserInfo;
    beforeEach(() => {
        intern = BuildUser([INTERN_ROLE_ID], 'intern-1');
        hr = BuildUser([HR_ROLE_ID], 'hr-1');
    });

    it('returns no value the caller may not read', async () => {
        const result = await callAs(intern, handler, args(handler));
        expect(result.Success, result.ErrorMessage ?? '').toBe(true);
        expect(result.Record).toMatchObject({ ID: expect.any(String) });
        expect('Salary' in (result.Record ?? {})).toBe(false);
        expect(JSON.stringify(result)).not.toContain(String(SALARY));
    });

    it('returns every field to a caller who may read it', async () => {
        const result = await callAs(hr, handler, args(handler));
        expect(result.Success, result.ErrorMessage ?? '').toBe(true);
        expect(result.Record?.Salary).toBe(SALARY);
    });
});
