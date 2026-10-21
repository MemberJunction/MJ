/**
 * CloudEvents for an entity under field-level security carry the primary key and the names of the
 * fields the save changed, never values.
 *
 * Driven by a REAL `BaseEntity` save rather than a stand-in object with `Dirty` set: a completed
 * save rebases the object before it raises `save`, so nothing on it is dirty by the time a
 * listener runs. The names must come from the event, which captures them before the rebase.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { cloudEventInits } = vi.hoisted(() => ({
    cloudEventInits: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({ SQLServerDataProvider: class {} }));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Users: [] } }));
vi.mock('cloudevents', () => ({
    CloudEvent: class {
        constructor(init: Record<string, unknown>) {
            cloudEventInits.push(init);
            Object.assign(this, init);
        }
    },
    httpTransport: () => () => undefined,
    emitterFor: () => () => undefined,
}));
vi.mock('type-graphql', () => {
    const noop = () => () => undefined;
    return {
        Resolver: noop, Mutation: noop, Query: noop, Subscription: noop, Ctx: noop, Arg: noop, PubSub: noop,
        Root: noop, ObjectType: noop, InputType: noop, Field: noop, FieldResolver: noop,
        Int: undefined, Float: undefined, registerEnumType: () => undefined,
    };
});
vi.mock('graphql', () => ({ GraphQLError: class extends Error {} }));
vi.mock('mssql', () => ({}));
vi.mock('@memberjunction/api-keys', () => ({ GetAPIKeyEngine: vi.fn() }));
vi.mock('@memberjunction/encryption', () => ({ EncryptionEngine: { Instance: {} } }));
vi.mock('@memberjunction/graphql-dataprovider', () => ({ FieldMapper: class { MapFieldName(n: string) { return n; } ReverseMapFieldName(n: string) { return n; } } }));
vi.mock('../generic/PubSubManager.js', () => ({ PubSubManager: { Instance: { Publish: () => undefined } } }));
vi.mock('../generic/PushStatusResolver.js', () => ({ PUSH_STATUS_UPDATES_TOPIC: 'test-push-topic', PublishStatusUpdate: vi.fn() }));
vi.mock('../generic/RunViewResolver.js', () => ({ RunViewByIDInput: class {}, RunViewByNameInput: class {}, RunDynamicViewInput: class {} }));
vi.mock('../generic/DeleteOptionsInput.js', () => ({ DeleteOptionsInput: class {} }));
vi.mock('../types.js', () => ({ RunViewGenericParams: class {} }));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogDebug: vi.fn() };
});

import { BaseEntity, CompositeKey, EntityInfo, IEntityDataProvider, UserInfo } from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase';
import type { UserPayload } from '../types.js';
import { EmployeeEntityInit, FullWidthEmployeeRow, HRUser, SECRET_SALARY } from './fieldSecurityFixtures.js';

/** `Employees` with every field updatable through the API, so a real save can dirty them. */
function updatableEmployees(withFls: boolean): EntityInfo {
    const init = EmployeeEntityInit(withFls);
    const fields = (init.Fields as Record<string, unknown>[]).map(f => ({ ...f, AllowUpdateAPI: true, AllowsNull: true }));
    return new EntityInfo({ ...init, Fields: fields });
}

class Employee extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
}

/** A provider whose database holds one full-width employee row and whose Save returns the stored row. */
function makeProvider() {
    let stored = FullWidthEmployeeRow();
    return {
        CurrentUser: null as UserInfo | null,
        async Load(): Promise<Record<string, unknown>> { return { ...stored }; },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            stored = { ...stored, ...(entity.GetAll() as Record<string, unknown>) };
            return { ...stored };
        },
        SetCachedRecordName(): void { /* no-op */ },
        GetCachedRecordName(): string | undefined { return undefined; },
    };
}

class TestResolver extends ResolverBase {
    public Listen(entity: BaseEntity) {
        this.ListenForEntityMessages(entity, {} as PubSubEngine, { sessionId: 's' } as UserPayload);
    }
    public Payload(entity: BaseEntity, changed?: string[]): Record<string, unknown> {
        return this.EntityEventPayload(entity, changed);
    }
}

async function loadedEmployee(entityInfo: EntityInfo, user: UserInfo): Promise<Employee> {
    const e = new Employee(entityInfo, makeProvider() as unknown as IEntityDataProvider);
    e.ContextCurrentUser = user;
    await e.InnerLoad(CompositeKey.FromID('emp-1'));
    return e;
}

describe('ResolverBase CloudEvents: changed fields from a real save', () => {
    const emitterKey = '_emit';
    let previousEmitter: unknown;

    beforeEach(() => {
        cloudEventInits.length = 0;
        const statics = ResolverBase as unknown as Record<string, unknown>;
        previousEmitter = statics[emitterKey];
        statics[emitterKey] = async () => ({});
    });
    afterEach(() => {
        (ResolverBase as unknown as Record<string, unknown>)[emitterKey] = previousEmitter;
    });

    /** The data of the CloudEvent emitted for the completed save. */
    async function saveEventData(entity: Employee): Promise<Record<string, unknown>> {
        new TestResolver().Listen(entity);
        await expect(entity.Save()).resolves.toBe(true);
        await vi.waitFor(() => expect(cloudEventInits.some(c => String(c.type).endsWith('.save'))).toBe(true));
        return cloudEventInits.find(c => String(c.type).endsWith('.save'))!.data as Record<string, unknown>;
    }

    it('REGRESSION: names the fields the save changed, not an empty list', async () => {
        const entity = await loadedEmployee(updatableEmployees(true), HRUser());
        entity.Set('Notes', 'edited');
        entity.Set('Salary', 1);

        const data = await saveEventData(entity);

        expect(entity.Dirty).toBe(false);
        expect(data.PrimaryKey).toEqual([{ FieldName: 'ID', Value: 'emp-1' }]);
        expect([...(data.ChangedFields as string[])].sort()).toEqual(['Notes', 'Salary']);
        expect(JSON.stringify(data)).not.toContain(String(SECRET_SALARY));
    });

    it('an entity without field security still emits its row', async () => {
        const entity = await loadedEmployee(updatableEmployees(false), HRUser());
        entity.Set('Notes', 'edited');

        const data = await saveEventData(entity);

        expect(data).toMatchObject({ ID: 'emp-1', Notes: 'edited' });
    });

    it('a payload for a record still in raw mode does not build its field objects', async () => {
        const entity = new Employee(updatableEmployees(true), makeProvider() as unknown as IEntityDataProvider);
        entity.ContextCurrentUser = HRUser();
        await entity.LoadFromData(FullWidthEmployeeRow()); // a load_complete listener sees exactly this object
        const hydrated = () => (entity as unknown as { _fieldsHydrated: boolean })._fieldsHydrated;
        expect(hydrated()).toBe(false);

        const data = new TestResolver().Payload(entity);

        expect(data.ChangedFields).toEqual([]);
        expect(hydrated()).toBe(false);
    });
});
