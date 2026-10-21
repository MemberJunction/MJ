import { describe, it, expect } from 'vitest';
import type {
    BindingValidationIssue, DatabasePublishOptions, ITransportConsumer, ITransportDriver, ITransportOperator,
    PublishResult, SubscriptionBinding, TopicBinding, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import { ResolveTopic } from '@memberjunction/work-queue-base';
import type { TopicRow, TransportRow } from '@memberjunction/work-queue-base';
import {
    SUBSCRIPTION_ROW_FIXTURE as SUBSCRIPTION_ROW, TOPIC_ROW_FIXTURE as TOPIC_ROW, TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW,
} from '@memberjunction/work-queue-base/testing';
import { WorkQueuePublishCoordinator } from '../publish/WorkQueuePublishCoordinator';
import type { LedgerOperations, PublishCoordinatorDeps } from '../publish/WorkQueuePublishCoordinator';
import type { LedgerReservation } from '../dedup/DeduplicationLedger';
import { Accepted, Rejected } from '../publish/publishResults';
import { DATABASE_TRANSPORT_CAPABILITIES } from '../transports/database/databaseCapabilities';
import { IsDatabaseTransportPublishOptions } from '../transports/database/DatabaseTransportDriver';
import type { WorkQueueSqlExecutor, WorkQueueTransactionalExecutor } from '../sql/WorkQueueSqlExecutor';
import { RecordingExecutor, RecordingLogger } from './fakes';

class FakeDriver implements ITransportDriver {
    public readonly Name = 'Fake';
    public readonly Capabilities = DATABASE_TRANSPORT_CAPABILITIES;
    public readonly Calls: { Messages: WorkMessage[]; Options?: DatabasePublishOptions }[] = [];
    public readonly LockCalls: { Keys: (string | undefined)[]; Executor: WorkQueueTransactionalExecutor }[] = [];
    public NextResults: PublishResult[] | Error | null = null;

    /** Satisfies PublishOrderLocker, like the Database driver. */
    public async AcquirePublishOrderLocks(_topic: TopicBinding, messages: WorkMessage[], _subscriptions: SubscriptionBinding[],
                                          executor: WorkQueueTransactionalExecutor): Promise<void> {
        this.LockCalls.push({ Keys: messages.map(m => m.PartitionKey), Executor: executor });
    }

    public async Publish(_topic: TopicBinding, messages: WorkMessage[], _subscriptions: SubscriptionBinding[], opts?: DatabasePublishOptions): Promise<PublishResult[]> {
        this.Calls.push({ Messages: messages, Options: opts });
        const next = this.NextResults;
        this.NextResults = null;
        if (next instanceof Error) {
            throw next;
        }
        return next ?? messages.map(m => Accepted(m.MessageID));
    }
    public OpenConsumer<TPayload extends WorkJson>(): ITransportConsumer<TPayload> { throw new Error('not used'); }
    public Operator(): ITransportOperator { throw new Error('not used'); }
    public async ValidateBindings(): Promise<BindingValidationIssue[]> { return []; }
}

class FakeLedger implements LedgerOperations {
    public readonly Events: string[] = [];
    public readonly Owners = new Map<string, string>();
    /** Keys another publish has Reserved but not Confirmed (F1). */
    public readonly PendingOwners = new Map<string, string>();

    public async Reserve(_topicID: string, key: string, messageID: string): Promise<LedgerReservation> {
        this.Events.push(`reserve:${key}`);
        const pending = this.PendingOwners.get(key);
        if (pending && pending !== messageID) {
            return { Kind: 'Pending', OwnerMessageID: pending };
        }
        const owner = this.Owners.get(key);
        return owner && owner !== messageID ? { Kind: 'Duplicate', OwnerMessageID: owner } : { Kind: 'Reserved' };
    }
    public async Confirm(_topicID: string, key: string): Promise<boolean> { this.Events.push(`confirm:${key}`); return true; }
    public async Release(_topicID: string, key: string): Promise<boolean> { this.Events.push(`release:${key}`); return true; }
}

const AWS_TRANSPORT = { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-dev', DriverClass: 'AWS' };

function Setup(topicOverrides: Partial<TopicRow> = {}, transport: TransportRow = TRANSPORT_ROW) {
    const executor = new RecordingExecutor();
    const driver = new FakeDriver();
    const ledger = new FakeLedger();
    const notified: string[] = [];
    const ledgerExecutors: WorkQueueSqlExecutor[] = [];
    let id = 0;
    const topic = { ...TOPIC_ROW, TransportID: transport.ID, ...topicOverrides };
    const snapshot = { Transports: [TRANSPORT_ROW, AWS_TRANSPORT], Topics: [topic], Subscriptions: [{ ...SUBSCRIPTION_ROW, PartitionMode: 'None' as const }] };
    const deps: PublishCoordinatorDeps = {
        ResolveTopic: name => ResolveTopic(snapshot, name),
        GetDriver: async () => driver,
        Executor: executor,
        CreateLedger: ledgerExecutor => { ledgerExecutors.push(ledgerExecutor); return ledger; },
        NewID: () => `00000000-0000-0000-0000-00000000000${++id}`,
        Now: () => new Date('2026-01-01T00:00:00Z'),
        NotifyPublished: name => notified.push(name),
        Log: new RecordingLogger(),
    };
    return { coordinator: new WorkQueuePublishCoordinator(deps), driver, ledger, executor, notified, ledgerExecutors };
}

const INTERNAL = { UserID: 'U1', External: false, CallerExecutor: null };

describe('WorkQueuePublishCoordinator topic rejections', () => {
    it('rejects every request for an unknown topic', async () => {
        const { coordinator } = Setup();
        const results = await coordinator.Publish('missing', [{}, {}], INTERNAL);
        expect(results.map(r => r.Error?.Code)).toEqual(['TopicNotFound', 'TopicNotFound']);
    });

    it('rejects disabled topics', async () => {
        const { coordinator } = Setup({ Status: 'Disabled' });
        expect((await coordinator.Publish('import.ready', [{}], INTERNAL))[0].Error?.Code).toBe('TopicDisabled');
    });

    it('rejects external publishes to topics that do not allow them', async () => {
        const { coordinator } = Setup();
        const external = await coordinator.Publish('import.ready', [{}], { ...INTERNAL, External: true });
        expect(external[0].Error?.Code).toBe('TopicNotExternallyPublishable');
        const internal = await coordinator.Publish('import.ready', [{}], INTERNAL);
        expect(internal[0].Status).toBe('Accepted');
    });

    it('rejects cloud topics that have no imported binding, as retryable', async () => {
        const { coordinator } = Setup({}, AWS_TRANSPORT);
        const [result] = await coordinator.Publish('import.ready', [{}], INTERNAL);
        expect(result.Error).toMatchObject({ Code: 'TopicUnbound', Retryable: true });
    });
});

describe('WorkQueuePublishCoordinator on the Database transport', () => {
    it('reserves, publishes on the transaction executor, confirms and commits', async () => {
        const { coordinator, driver, ledger, executor, notified } = Setup();
        const [result] = await coordinator.Publish('import.ready', [{ DeduplicationKey: ' k1 ', Payload: { a: 1 } }], INTERNAL);
        expect(result).toEqual({ MessageID: '00000000-0000-0000-0000-000000000001', Status: 'Accepted' });
        expect(ledger.Events).toEqual(['reserve:k1', 'confirm:k1']);
        const options = driver.Calls[0].Options;
        expect(IsDatabaseTransportPublishOptions(options) && options.Executor?.constructor === RecordingExecutor).toBe(true);
        expect(IsDatabaseTransportPublishOptions(options) && options.UserID).toBe('U1');
        expect(executor.Events).toEqual(['independent', 'begin', 'commit', 'release']);
        expect(notified).toEqual(['import.ready']);
    });

    it('returns Duplicate with the owning message and rolls back without publishing', async () => {
        const { coordinator, driver, ledger, executor, notified } = Setup();
        ledger.Owners.set('k1', 'OWNER');
        const [result] = await coordinator.Publish('import.ready', [{ DeduplicationKey: 'k1' }], INTERNAL);
        expect(result).toEqual({ MessageID: 'OWNER', Status: 'Duplicate' });
        expect(driver.Calls).toHaveLength(0);
        expect(executor.Events).toContain('rollback');
        expect(notified).toEqual([]);
    });

    it('rejects as retryable DeduplicationPending when another publish holds the key unconfirmed (F1)', async () => {
        const { coordinator, driver, ledger, executor } = Setup();
        ledger.PendingOwners.set('k1', 'OTHER');
        const [result] = await coordinator.Publish('import.ready', [{ DeduplicationKey: 'k1' }], INTERNAL);
        expect(result.Status).toBe('Rejected');
        expect(result.Error).toMatchObject({ Code: 'DeduplicationPending', Retryable: true });
        expect(driver.Calls).toHaveLength(0);
        expect(executor.Events).toContain('rollback');
    });

    it('rolls back when the driver rejects and keeps results aligned with invalid requests', async () => {
        const { coordinator, driver, executor } = Setup();
        driver.NextResults = [Rejected('x', 'MessageIDConflict', 'conflict', false)];
        const results = await coordinator.Publish('import.ready', [{ PartitionKey: '' }, { Payload: 1 }], INTERNAL);
        expect(results[0].Status).toBe('Rejected');
        expect(results[0].Error?.Code).toBe('InvalidPartitionKey');
        expect(results[1].Error?.Code).toBe('MessageIDConflict');
        expect(executor.Events).toContain('rollback');
    });

    it("uses the caller's executor when one is provided", async () => {
        const { coordinator, driver, executor } = Setup();
        const caller = new RecordingExecutor();
        await coordinator.Publish('import.ready', [{}], { ...INTERNAL, CallerExecutor: caller });
        const options = driver.Calls[0].Options;
        expect(IsDatabaseTransportPublishOptions(options) && options.Executor).toBe(caller);
        expect(executor.Events).toEqual([]);
        expect(caller.Events).toEqual(['begin', 'commit']);
    });

    it("asks the driver for the whole batch's publish-order locks before the first enlisted message", async () => {
        const { coordinator, driver } = Setup();
        const caller = new RecordingExecutor();
        await coordinator.Publish('import.ready', [{ PartitionKey: 'b' }, { PartitionKey: 'a' }], { ...INTERNAL, CallerExecutor: caller });
        expect(driver.LockCalls).toEqual([{ Keys: ['b', 'a'], Executor: caller }]);
        expect(driver.Calls).toHaveLength(2);
    });

    it('takes no batch locks when it manages its own per-message transactions', async () => {
        const { coordinator, driver } = Setup();
        await coordinator.Publish('import.ready', [{ PartitionKey: 'b' }, { PartitionKey: 'a' }], INTERNAL);
        expect(driver.LockCalls).toEqual([]);
    });

    it('lets database errors propagate to an enlisted caller instead of reporting TransportUnavailable', async () => {
        const { coordinator, driver } = Setup();
        const caller = new RecordingExecutor();
        driver.NextResults = Object.assign(new Error('Transaction was deadlocked'), { number: 1205 });
        await expect(coordinator.Publish('import.ready', [{}], { ...INTERNAL, CallerExecutor: caller })).rejects.toThrow('deadlocked');
        expect(caller.Events).toEqual(['begin', 'rollback']);
    });

    it('reports a retryable rejection when its own transaction fails', async () => {
        const { coordinator, driver } = Setup();
        driver.NextResults = new Error('connection reset');
        const [result] = await coordinator.Publish('import.ready', [{}], INTERNAL);
        expect(result.Error).toEqual({ Code: 'TransportUnavailable', Message: 'connection reset', Retryable: true });
    });
});

describe('WorkQueuePublishCoordinator on a cloud transport', () => {
    it('reserves keyed requests, sends one batch, confirms accepted and releases rejected keys', async () => {
        const { coordinator, driver, ledger } = Setup({ BindingConfig: '{"SnsTopicArn":"arn"}' }, AWS_TRANSPORT);
        driver.NextResults = [Accepted('m1'), Rejected('m2', 'TransportUnavailable', 'throttled', true), Accepted('m3')];
        const results = await coordinator.Publish('import.ready', [
            { MessageID: '11111111-1111-1111-1111-111111111111', DeduplicationKey: 'a' },
            { MessageID: '22222222-2222-2222-2222-222222222222', DeduplicationKey: 'b' },
            { MessageID: '33333333-3333-3333-3333-333333333333' },
        ], INTERNAL);
        expect(results.map(r => r.Status)).toEqual(['Accepted', 'Rejected', 'Accepted']);
        expect(driver.Calls).toHaveLength(1);
        expect(driver.Calls[0].Messages).toHaveLength(3);
        expect(driver.Calls[0].Options).toBeUndefined();
        expect(ledger.Events).toEqual(['reserve:a', 'reserve:b', 'confirm:a', 'release:b']);
    });

    it('runs the ledger on an independent executor it owns, and releases it on Close (F8)', async () => {
        const { coordinator, executor, ledgerExecutors } = Setup({ BindingConfig: '{"SnsTopicArn":"arn"}' }, AWS_TRANSPORT);
        await coordinator.Publish('import.ready', [{ DeduplicationKey: 'a' }], INTERNAL);
        await coordinator.Publish('import.ready', [{ DeduplicationKey: 'b' }], INTERNAL);
        expect(ledgerExecutors).toHaveLength(2);
        expect(ledgerExecutors[0]).not.toBe(executor);
        expect(ledgerExecutors[1]).toBe(ledgerExecutors[0]);
        expect(executor.Events).toEqual(['independent']);
        await coordinator.Close();
        expect(executor.Events).toEqual(['independent', 'release']);
    });

    it('rejects a key another publish holds unconfirmed, and still sends the rest of the batch', async () => {
        const { coordinator, driver, ledger } = Setup({ BindingConfig: '{"SnsTopicArn":"arn"}' }, AWS_TRANSPORT);
        ledger.PendingOwners.set('a', 'OTHER');
        const results = await coordinator.Publish('import.ready', [{ DeduplicationKey: 'a' }, { DeduplicationKey: 'b' }], INTERNAL);
        expect(results[0].Error).toMatchObject({ Code: 'DeduplicationPending', Retryable: true });
        expect(results[1].Status).toBe('Accepted');
        expect(driver.Calls[0].Messages).toHaveLength(1);
    });

    it('rejects and releases everything when the transport throws', async () => {
        const { coordinator, driver, ledger } = Setup({ BindingConfig: '{"SnsTopicArn":"arn"}' }, AWS_TRANSPORT);
        driver.NextResults = new Error('network down');
        const results = await coordinator.Publish('import.ready', [{ DeduplicationKey: 'a' }], INTERNAL);
        expect(results[0].Error).toEqual({ Code: 'TransportUnavailable', Message: 'network down', Retryable: true });
        expect(ledger.Events).toEqual(['reserve:a', 'release:a']);
    });
});
