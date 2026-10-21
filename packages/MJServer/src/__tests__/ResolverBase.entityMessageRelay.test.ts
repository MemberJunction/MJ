/**
 * The entity-message relay in `ResolverBase.ListenForEntityMessages`.
 *
 * There is one listener per entity name per process, and it relays to the session that created
 * it. So it must relay only events raised by an object that belongs to that session's user, and
 * never the record values a payload can carry: a delete's payload is the whole deleted row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { statusUpdates } = vi.hoisted(() => ({
    statusUpdates: [] as Array<{ sessionId: string; ownerUserId: string; message: string | undefined }>,
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({ SQLServerDataProvider: class {} }));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Users: [] } }));
vi.mock('cloudevents', () => ({
    CloudEvent: class {},
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
vi.mock('../generic/PushStatusResolver.js', () => ({
    PUSH_STATUS_UPDATES_TOPIC: 'test-push-topic',
    PublishStatusUpdate: (_pubSub: unknown, update: { sessionId: string; ownerUserId: string; message: string | undefined }) => {
        statusUpdates.push(update);
    },
}));
vi.mock('../generic/RunViewResolver.js', () => ({ RunViewByIDInput: class {}, RunViewByNameInput: class {}, RunDynamicViewInput: class {} }));
vi.mock('../generic/DeleteOptionsInput.js', () => ({ DeleteOptionsInput: class {} }));
vi.mock('../types.js', () => ({ RunViewGenericParams: class {} }));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogDebug: vi.fn() };
});

import { BaseEntity, BaseEntityEvent, EntityInfo, UserInfo } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import type { PubSubEngine } from 'type-graphql';
import { Subscription } from 'rxjs';
import { ResolverBase } from '../generic/ResolverBase';
import type { UserPayload } from '../types.js';
import { BuildUser, EmployeeEntity, FullWidthEmployeeRow, HR_ROLE_ID, SECRET_SALARY } from './fieldSecurityFixtures.js';

const SUBSCRIPTIONS_KEY = '___MJServer___ResolverBase___EventSubscriptions';

/** An entity object of `entityInfo` loaded by `owner`, holding the full row. */
function entityOwnedBy(entityInfo: EntityInfo, owner: UserInfo) {
    const row = FullWidthEmployeeRow();
    return {
        EntityInfo: entityInfo,
        ContextCurrentUser: owner,
        GetAll: () => ({ ...row }),
        PrimaryKey: { KeyValuePairs: [{ FieldName: 'ID', Value: row.ID }] },
        Fields: entityInfo.Fields.map(f => ({ Name: f.Name, Dirty: false })),
    };
}
type OwnedEntity = ReturnType<typeof entityOwnedBy>;

class TestResolver extends ResolverBase {
    public Listen(entity: OwnedEntity, sessionUser: UserInfo) {
        this.ListenForEntityMessages(entity as unknown as BaseEntity, {} as PubSubEngine, { sessionId: 'session-a', userRecord: sessionUser } as UserPayload);
    }
}

function raise(entity: OwnedEntity, type: BaseEntityEvent['type'], payload: unknown): void {
    const args = new BaseEntityEvent();
    args.type = type;
    args.payload = payload;
    args.baseEntity = entity as unknown as BaseEntity;
    MJGlobal.Instance.RaiseEvent({ component: null, event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode, args });
}

/** Lets the async listener run for every event raised so far. */
async function settle(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 10));
}

function resetListeners(): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    const subscriptions = store[SUBSCRIPTIONS_KEY] as Map<string, Subscription> | undefined;
    subscriptions?.forEach(s => s.unsubscribe());
    subscriptions?.clear();
}

let userA: UserInfo;
let userB: UserInfo;

beforeEach(() => {
    statusUpdates.length = 0;
    resetListeners();
    userA = BuildUser([HR_ROLE_ID], 'user-a');
    userB = BuildUser([HR_ROLE_ID], 'user-b');
});

describe('ResolverBase.ListenForEntityMessages: relay to the listening session', () => {
    it("REGRESSION: never relays another user's delete to the session that created the listener", async () => {
        const entityInfo = EmployeeEntity(false);
        new TestResolver().Listen(entityOwnedBy(entityInfo, userA), userA);

        raise(entityOwnedBy(entityInfo, userB), 'delete', { OldValues: FullWidthEmployeeRow() });
        await settle();

        expect(statusUpdates).toHaveLength(0);
    });

    it('REGRESSION: relays the session user\'s own delete with the key and type, never the deleted row', async () => {
        const entityInfo = EmployeeEntity(false);
        new TestResolver().Listen(entityOwnedBy(entityInfo, userA), userA);

        raise(entityOwnedBy(entityInfo, userA), 'delete', { OldValues: FullWidthEmployeeRow() });
        await settle();

        expect(statusUpdates).toHaveLength(1);
        const message = JSON.parse(statusUpdates[0].message!) as Record<string, unknown>;
        expect(message.entityName).toBe('Employees');
        expect(message.eventType).toBe('delete');
        expect(message.message).toBeUndefined();
        expect(statusUpdates[0].message).not.toContain(String(SECRET_SALARY));
    });

    it('REGRESSION: an entity under field security never relays a payload, even to its own user', async () => {
        const entityInfo = EmployeeEntity(true);
        new TestResolver().Listen(entityOwnedBy(entityInfo, userA), userA);

        raise(entityOwnedBy(entityInfo, userA), 'other', { Salary: SECRET_SALARY });
        await settle();

        expect(statusUpdates).toHaveLength(1);
        expect(JSON.parse(statusUpdates[0].message!).message).toBeUndefined();
    });

    it('REGRESSION: MJ: Record Changes never relays a payload', async () => {
        const recordChanges = new EntityInfo({ ID: 'rc', Name: 'MJ: Record Changes', SchemaName: '__mj', BaseTable: 'RecordChange', BaseView: 'vwRecordChanges', Fields: [] });
        new TestResolver().Listen(entityOwnedBy(recordChanges, userA), userA);

        raise(entityOwnedBy(recordChanges, userA), 'other', { ChangesJSON: `{"Salary":${SECRET_SALARY}}` });
        await settle();

        expect(statusUpdates).toHaveLength(1);
        expect(statusUpdates[0].message).not.toContain(String(SECRET_SALARY));
    });

    it("still relays a progress message from the session user's own object", async () => {
        const entityInfo = EmployeeEntity(false);
        new TestResolver().Listen(entityOwnedBy(entityInfo, userA), userA);

        raise(entityOwnedBy(entityInfo, userA), 'other', 'step 2 of 5');
        await settle();

        expect(statusUpdates).toHaveLength(1);
        expect(JSON.parse(statusUpdates[0].message!).message).toBe('step 2 of 5');
        expect(statusUpdates[0].ownerUserId).toBe('user-a');
    });
});
