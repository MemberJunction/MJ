import { describe, it, expect } from 'vitest';
import type { WorkMessage } from '@memberjunction/work-queue-core';
import { DatabaseTransportDriver, DefaultInstanceID } from '../transports/database/DatabaseTransportDriver';
import type { DatabaseTransportPublishOptions } from '../transports/database/DatabaseTransportDriver';
import { DatabaseTransportConsumer } from '../transports/database/DatabaseTransportConsumer';
import { DatabaseTransportOperator } from '../transports/database/DatabaseTransportOperator';
import { DATABASE_TRANSPORT_CAPABILITIES } from '../transports/database/databaseCapabilities';
import { RecordingExecutor, RecordingLogger, SubscriptionBindingFixture, TestDeps, TopicBindingFixture } from './fakes';

const MESSAGE: WorkMessage = {
    MessageID: 'CCCCCCCC-0000-0000-0000-000000000001',
    Topic: 'import.ready',
    PartitionKey: 'venue-42',
    Attributes: {},
    PublishedAt: '2026-01-01T00:00:00.000Z',
};

const INSERTED = { ID: MESSAGE.MessageID, PublishOrdinal: '17' };
const STORED = { ID: MESSAGE.MessageID, TopicID: 'AAAAAAAA-0000-0000-0000-000000000001', PartitionKey: 'venue-42', Attributes: '{}', Payload: null, PayloadRef: null, CorrelationID: null };

describe('DatabaseTransportDriver.Publish', () => {
    it('writes the message and deliveries in one transaction on an independent executor, and accepts', async () => {
        const source = new RecordingExecutor().QueueRows([INSERTED]).QueueRows([{ AffectedRows: 2 }]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const subs = [
            SubscriptionBindingFixture({ PartitionMode: 'None' }, { SubscriptionID: 'S-NONE' }),
            SubscriptionBindingFixture({ PartitionMode: 'Exclusive' }, { SubscriptionID: 'S-EXCL' }),
        ];
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], subs);
        expect(result).toEqual({ MessageID: MESSAGE.MessageID, Status: 'Accepted' });
        expect(source.Calls[0].SQL).toContain('[spWorkQueueInsertMessage]');
        expect(source.Calls[1].SQL).toContain('[spWorkQueueInsertDeliveries]');
        expect(JSON.parse(String(source.Calls[1].Params[0]))).toEqual([
            { MessageID: MESSAGE.MessageID, SubscriptionID: 'S-NONE', PartitionKey: null, OrderKey: 17 },
            { MessageID: MESSAGE.MessageID, SubscriptionID: 'S-EXCL', PartitionKey: 'venue-42', OrderKey: 17 },
        ]);
        expect(source.Events).toEqual(['independent', 'begin', 'commit', 'release']);
        expect(source.Calls.every(call => call.Executor === 'independent#1' && call.InTransaction)).toBe(true);
    });

    it('takes the publish-order lock first for Ordered subscriptions', async () => {
        const source = new RecordingExecutor().QueueRows([{ LockResult: 0 }]).QueueRows([INSERTED]).QueueRows([{ AffectedRows: 1 }]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        await driver.Publish(TopicBindingFixture(), [MESSAGE], [SubscriptionBindingFixture({ PartitionMode: 'Ordered' })]);
        expect(source.Calls[0].SQL).toContain('[spWorkQueueAcquirePublishOrderLock]');
        expect(source.Calls[0].Params).toEqual(['wq:aaaaaaaa-0000-0000-0000-000000000001:venue-42', 5000]);
        expect(source.Calls[1].SQL).toContain('[spWorkQueueInsertMessage]');
    });

    it('stores a message with no matching subscription without inserting deliveries', async () => {
        const source = new RecordingExecutor().QueueRows([INSERTED]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Status).toBe('Accepted');
        expect(source.Calls).toHaveLength(1);
    });

    it('reads the stored message in a separate statement and rolls back a duplicate', async () => {
        const source = new RecordingExecutor().QueueRows([]).QueueRows([STORED]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result).toEqual({ MessageID: MESSAGE.MessageID, Status: 'Duplicate' });
        expect(source.Calls[1].SQL).toContain('[spWorkQueueSelectMessage]');
        expect(source.Events).toContain('rollback');
    });

    it('treats a primary-key race on the message insert as an existing message', async () => {
        const race = Object.assign(new Error("Violation of PRIMARY KEY constraint 'PK_WorkQueueMessage'"), { number: 2627 });
        const source = new RecordingExecutor().QueueError(race).QueueRows([STORED]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Status).toBe('Duplicate');
    });

    it('rejects a MessageID already used with a different envelope', async () => {
        const source = new RecordingExecutor().QueueRows([]).QueueRows([{ ...STORED, PartitionKey: 'venue-7' }]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Error).toMatchObject({ Code: 'MessageIDConflict', Retryable: false });
    });

    it("writes on the caller's executor without managing a transaction", async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor().QueueRows([INSERTED]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const options: DatabaseTransportPublishOptions = { Kind: 'Database', Executor: caller, UserID: 'U1' };
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], [], options);
        expect(result.Status).toBe('Accepted');
        expect(source.Calls).toHaveLength(0);
        expect(source.Events).toEqual([]);
        expect(caller.Events).toEqual([]);
        expect(caller.Calls[0].Params[7]).toBe('U1');
    });

    it('lets every database error propagate when enlisted, so the caller can retry or roll back', async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor().QueueError(Object.assign(new Error('Transaction was deadlocked'), { number: 1205 }));
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const options: DatabaseTransportPublishOptions = { Kind: 'Database', Executor: caller };
        await expect(driver.Publish(TopicBindingFixture(), [MESSAGE], [], options)).rejects.toThrow('deadlocked');
    });

    it('turns infrastructure errors into retryable rejections and logs them when it owns the transaction', async () => {
        const source = new RecordingExecutor().QueueError(new Error('connection reset'));
        const deps = TestDeps(source);
        const driver = new DatabaseTransportDriver(source, deps);
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Error).toEqual({ Code: 'TransportUnavailable', Message: 'connection reset', Retryable: true });
        expect(deps.Log instanceof RecordingLogger && deps.Log.Lines[0]).toContain('ERROR');
    });

    it('retries a deadlocked publish in a fresh transaction', async () => {
        const source = new RecordingExecutor()
            .QueueError(Object.assign(new Error('Transaction was deadlocked'), { number: 1205 }))
            .QueueRows([INSERTED]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Status).toBe('Accepted');
        expect(source.Events).toEqual(['independent', 'begin', 'rollback', 'release', 'independent', 'begin', 'commit', 'release']);
    });
});

describe('DatabaseTransportDriver.AcquirePublishOrderLocks', () => {
    const ORDERED = [SubscriptionBindingFixture({ PartitionMode: 'Ordered' })];

    it('takes one lock per distinct key, in sorted key order', async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const messages = ['venue-9', 'venue-1', 'venue-9'].map(key => ({ ...MESSAGE, PartitionKey: key }));
        await driver.AcquirePublishOrderLocks(TopicBindingFixture(), messages, ORDERED, caller);
        expect(caller.Calls.every(call => call.SQL.includes('[spWorkQueueAcquirePublishOrderLock]'))).toBe(true);
        expect(caller.Calls.map(call => String(call.Params[0]).split(':').pop())).toEqual(['venue-1', 'venue-9']);
    });

    it('needs no per-transaction preparation on PostgreSQL: the timeout travels with each call', async () => {
        const source = new RecordingExecutor('postgresql');
        const caller = new RecordingExecutor('postgresql');
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        await driver.AcquirePublishOrderLocks(TopicBindingFixture(), [MESSAGE, { ...MESSAGE, PartitionKey: 'a' }], ORDERED, caller);
        expect(caller.Calls).toHaveLength(2);
        expect(caller.Calls[0].SQL).toBe('SELECT * FROM __mj."spWorkQueueAcquirePublishOrderLock"($1, $2)');
        expect(caller.Calls.map(call => call.Params[1])).toEqual([5000, 5000]);
    });

    it('does nothing when no Ordered subscription matches', async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        await driver.AcquirePublishOrderLocks(TopicBindingFixture(), [MESSAGE], [SubscriptionBindingFixture({ PartitionMode: 'Exclusive' })], caller);
        expect(caller.Calls).toHaveLength(0);
    });
});

describe('DatabaseTransportDriver surface', () => {
    it('declares the Database capabilities and name', () => {
        const source = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        expect(driver.Name).toBe('Database');
        expect(driver.Capabilities).toBe(DATABASE_TRANSPORT_CAPABILITIES);
        expect(DATABASE_TRANSPORT_CAPABILITIES).toMatchObject({ SupportsOrdered: true, SupportsExternalHosts: false, CancelPending: true, CancelInFlight: true, PeekDeadLetters: 'Full' });
        expect(DATABASE_TRANSPORT_CAPABILITIES.Filters.Operators).toEqual(['eq', 'neq', 'startswith', 'isnull', 'isnotnull']);
    });

    it('opens consumers and a cached operator, and closes the operator', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        expect(driver.OpenConsumer(SubscriptionBindingFixture())).toBeInstanceOf(DatabaseTransportConsumer);
        expect(driver.Operator()).toBeInstanceOf(DatabaseTransportOperator);
        expect(driver.Operator()).toBe(driver.Operator());
        await driver.Operator().Replay(SubscriptionBindingFixture(), 'EEEEEEEE-0000-0000-0000-000000000001', null, null);
        await driver.Close();
        expect(source.Events).toEqual(['independent', 'release']);
    });

    it('uses the injected instance ID, or host:pid:random by default', () => {
        const source = new RecordingExecutor();
        expect(new DatabaseTransportDriver(source, TestDeps(source)).InstanceID).toBe('test-host:1:abcd');
        expect(DefaultInstanceID()).toMatch(/^.+:\d+:[0-9a-f]{8}$/);
    });

    it('flags missing IDs and external hosts during binding validation', async () => {
        const source = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const external = { ...SubscriptionBindingFixture(), HostType: 'External' as const };
        const issues = await driver.ValidateBindings(TopicBindingFixture({ Config: {} }), [external]);
        expect(issues.map(i => i.Message)).toEqual([
            'Database topic binding is missing Config.TopicID',
            'External hosts cannot consume the Database transport',
        ]);
    });

    it('reports the backlog and the database prerequisites through its operator', async () => {
        const source = new RecordingExecutor().QueueRows([{ Claimable: 2, InFlight: 1 }]).QueueRows([{ SnapshotOn: 1 }]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        expect(await driver.GetBacklog(SubscriptionBindingFixture())).toEqual({ Claimable: 2, InFlight: 1, Capped: false });
        expect(await driver.CheckPrerequisites()).toEqual([]);
    });
});
