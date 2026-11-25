/**
 * Field-level security on ResolverBase's own transports, other than the GraphQL field mapping:
 *
 * - **Create input.** A restricted caller's create payload is refused when it names a field the
 *   caller may not read, or a key that names no field, with the same message for both.
 * - **Cache-invalidation broadcast.** The event reaches every signed-in session unprojected, so an
 *   entity under field security never carries its row, whatever the allowlist says.
 * - **CloudEvents and their debug log.** The sink is external and has no reader identity to
 *   project for, so an entity under field security emits only its key and the names of changed
 *   fields, and the same goes for the debug log of the event.
 *
 * The entity objects here return FULL-WIDTH rows, standing in for an object saved by the system
 * user (server-internal saves fire the same events) or otherwise not narrowed at its source.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { published, logDebugCalls, emitted, cloudEventInits } = vi.hoisted(() => ({
    published: [] as Array<{ topic: string; payload: Record<string, unknown> }>,
    logDebugCalls: [] as string[],
    emitted: [] as unknown[],
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
vi.mock('../generic/PubSubManager.js', () => ({
    PubSubManager: {
        Instance: {
            Publish: (topic: string, payload: Record<string, unknown>) => { published.push({ topic, payload }); },
        },
    },
}));
vi.mock('../generic/PushStatusResolver.js', () => ({
    PUSH_STATUS_UPDATES_TOPIC: 'test-push-topic',
    PublishStatusUpdate: vi.fn(),
}));
vi.mock('../generic/RunViewResolver.js', () => ({ RunViewByIDInput: class {}, RunViewByNameInput: class {}, RunDynamicViewInput: class {} }));
vi.mock('../generic/DeleteOptionsInput.js', () => ({ DeleteOptionsInput: class {} }));
vi.mock('../types.js', () => ({ RunViewGenericParams: class {} }));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: (msg: string) => { logDebugCalls.push(String(msg)); },
        LogDebug: (msg: string) => { logDebugCalls.push(String(msg)); },
    };
});

import { BaseEntity, BaseEntityEvent, EntityInfo, UserInfo } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase';
import { ConfigureRecordDataBroadcast } from '../generic/CacheInvalidationResolver.js';
import type { UserPayload } from '../types.js';
import { EmployeeEntity, FullWidthEmployeeRow, HRUser, Intern, RefusalFor, SECRET_SALARY } from './fieldSecurityFixtures.js';

/** An entity object that holds a full-width row: system-saved, or not narrowed at its source. */
function fullWidthEntity(entityInfo: EntityInfo, dirty: string[] = ['Notes']) {
    const row = FullWidthEmployeeRow();
    return {
        EntityInfo: entityInfo,
        GetAll: () => ({ ...row }),
        PrimaryKey: { KeyValuePairs: [{ FieldName: 'ID', Value: row.ID }] },
        PrimaryKeys: [],
        Fields: entityInfo.Fields.map(f => ({ Name: f.Name, Dirty: dirty.includes(f.Name) })),
        Get: (name: string) => (row as Record<string, unknown>)[name],
        GetDirtyFieldNames: () => entityInfo.Fields.filter(f => dirty.includes(f.Name)).map(f => f.Name),
        SetManyCalls: [] as Array<Record<string, unknown>>,
        NewRecord(): boolean { return true; },
        SetMany(values: Record<string, unknown>): void { this.SetManyCalls.push(values); },
        Save: async () => true,
    };
}
type FullWidthEntity = ReturnType<typeof fullWidthEntity>;

class TestResolver extends ResolverBase {
    public Create(entity: FullWidthEntity, input: Record<string, unknown>, user: UserInfo) {
        const provider = { GetEntityObject: async () => entity };
        return this.CreateRecord('Employees', input, provider as never, { userRecord: user } as UserPayload, {} as PubSubEngine);
    }
    public Broadcast(entity: FullWidthEntity) {
        this.PublishCacheInvalidation(entity as unknown as BaseEntity, 'save', { sessionId: 's' } as UserPayload);
    }
    public Emit(entity: FullWidthEntity) {
        const args = new BaseEntityEvent();
        args.type = 'save';
        args.baseEntity = entity as unknown as BaseEntity;
        return this.EmitCloudEvent({ component: null, event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode, args });
    }
    public Listen(entity: FullWidthEntity) {
        this.ListenForEntityMessages(entity as unknown as BaseEntity, {} as PubSubEngine, { sessionId: 's' } as UserPayload);
    }
}

describe('ResolverBase.CreateRecord: client input is gated for a restricted caller', () => {
    it.each([
        ['a denied field', 'Salary'],
        ['a key that names no field', 'Bogus'],
    ])('REGRESSION: refuses %s with the same message, before anything is applied', async (_label, key) => {
        const entity = fullWidthEntity(EmployeeEntity());
        await expect(new TestResolver().Create(entity, { ID: 'emp-1', Name: 'Ada', [key]: 1 }, Intern()))
            .rejects.toThrow(RefusalFor(key));
        expect(entity.SetManyCalls).toHaveLength(0);
    });

    it('applies a well-behaved restricted client\'s create', async () => {
        const entity = fullWidthEntity(EmployeeEntity());
        // The response mapping needs metadata this unit test does not stand up; reaching it means the gate passed.
        await new TestResolver().Create(entity, { ID: 'emp-1', Name: 'Ada', RestoreContext___: { SourceChangeID: 'x' } }, Intern()).catch(() => undefined);
        expect(entity.SetManyCalls).toEqual([{ ID: 'emp-1', Name: 'Ada' }]);
    });

    it('does not gate a caller who is denied nothing', async () => {
        const entity = fullWidthEntity(EmployeeEntity());
        await new TestResolver().Create(entity, { ID: 'emp-1', Salary: 5 }, HRUser()).catch(() => undefined);
        expect(entity.SetManyCalls).toEqual([{ ID: 'emp-1', Salary: 5 }]);
    });
});

describe('ResolverBase.PublishCacheInvalidation: no row data for entities under field security', () => {
    beforeEach(() => { published.length = 0; });
    afterEach(() => ConfigureRecordDataBroadcast([]));

    it("REGRESSION: an FLS entity's row never rides along, even under an explicit '*'", () => {
        ConfigureRecordDataBroadcast(['*']);
        new TestResolver().Broadcast(fullWidthEntity(EmployeeEntity(true)));

        expect(published).toHaveLength(1);
        expect(published[0].payload.recordData).toBeUndefined();
        expect(published[0].payload.entityName).toBe('Employees');
    });

    it('an allowlisted entity without field security still carries its row', () => {
        ConfigureRecordDataBroadcast(['*']);
        new TestResolver().Broadcast(fullWidthEntity(EmployeeEntity(false)));

        expect(JSON.parse(String(published[0].payload.recordData))).toMatchObject({ ID: 'emp-1' });
    });
});

describe('ResolverBase CloudEvents: no field values for entities under field security', () => {
    const emitterKey = '_emit';
    let previousEmitter: unknown;

    beforeEach(() => {
        cloudEventInits.length = 0;
        emitted.length = 0;
        logDebugCalls.length = 0;
        const statics = ResolverBase as unknown as Record<string, unknown>;
        previousEmitter = statics[emitterKey];
        statics[emitterKey] = async (event: unknown) => { emitted.push(event); return {}; };
    });
    afterEach(() => {
        (ResolverBase as unknown as Record<string, unknown>)[emitterKey] = previousEmitter;
    });

    it('REGRESSION: emits only the key and the changed-field names', async () => {
        await new TestResolver().Emit(fullWidthEntity(EmployeeEntity(true), ['Notes', 'Salary']));

        expect(cloudEventInits).toHaveLength(1);
        expect(cloudEventInits[0].data).toEqual({
            PrimaryKey: [{ FieldName: 'ID', Value: 'emp-1' }],
            ChangedFields: ['Salary', 'Notes'],
        });
        expect(logDebugCalls.join('\n')).not.toContain(String(SECRET_SALARY));
    });

    it('an entity without field security still emits its row', async () => {
        await new TestResolver().Emit(fullWidthEntity(EmployeeEntity(false)));
        expect(cloudEventInits[0].data).toMatchObject({ ID: 'emp-1', Name: 'Ada' });
    });

    it('REGRESSION: a Record Changes row emits only its key and changed-field names', async () => {
        // The audit trail has no field security of its own, but its payload columns hold other
        // entities' values, so its rows must not ride along to the sink either.
        const recordChanges = EmployeeEntity(false);
        recordChanges.Name = 'MJ: Record Changes';
        await new TestResolver().Emit(fullWidthEntity(recordChanges, ['Notes']));
        expect(cloudEventInits[0].data).toEqual({
            PrimaryKey: [{ FieldName: 'ID', Value: 'emp-1' }],
            ChangedFields: ['Notes'],
        });
    });

    it('REGRESSION: the entity-event debug log carries no field values for an FLS entity', async () => {
        const entity = fullWidthEntity(EmployeeEntity(true));
        new TestResolver().Listen(entity);
        const args = new BaseEntityEvent();
        args.type = 'save';
        args.baseEntity = entity as unknown as BaseEntity;
        MJGlobal.Instance.RaiseEvent({ component: null, event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode, args });
        await vi.waitFor(() => expect(logDebugCalls.some(m => m.includes('Received Event'))).toBe(true));

        expect(logDebugCalls.join('\n')).not.toContain(String(SECRET_SALARY));
        expect(logDebugCalls.join('\n')).toContain('emp-1');
    });
});
