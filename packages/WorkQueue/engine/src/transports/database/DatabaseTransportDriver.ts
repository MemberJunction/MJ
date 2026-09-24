import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { DATABASE_DRIVER_CLASS } from '@memberjunction/work-queue-base';
import type {
    BindingValidationIssue, DatabasePublishOptions, ITransportConsumer, ITransportDriver, ITransportOperator,
    PublishResult, SubscriptionBinding, TopicBinding, TransportCapabilities, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import { DELIVERY_INSERT_CHUNK, MESSAGE_PRIMARY_KEY, PUBLISH_LOCK_TIMEOUT_MS } from '../../constants';
import { Accepted, Rejected } from '../../publish/publishResults';
import { CreateWorkQueueSqlBuilder } from '../../sql/CreateWorkQueueSqlBuilder';
import type { ExistingMessageRow, LockResultRow, MessageInsertedRow, MessageInsertRow } from '../../sql/rows';
import { ErrorText, ExecuteRows, ExecuteWrite, IsUniqueViolation, ToNumber } from '../../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../../sql/WorkQueueSqlBuilder';
import type { WorkQueueExecutorSource, WorkQueueTransactionalExecutor } from '../../sql/WorkQueueSqlExecutor';
import { RetryTransient, RunInWorkQueueTransaction } from '../../transaction/RunInWorkQueueTransaction';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { ReadTopicID } from './bindingIds';
import { DATABASE_TRANSPORT_CAPABILITIES } from './databaseCapabilities';
import { DatabaseTransportConsumer } from './DatabaseTransportConsumer';
import { DatabaseTransportOperator } from './DatabaseTransportOperator';
import type { SubscriptionBacklog } from './DatabaseTransportOperator';
import type { DeliveryPlan } from './deliveryPlan';
import { BuildDeliveryPlan, PublishOrderKeys, ResolveExistingMessage, ToDeliveryRows, ToMessageInsertRow } from './deliveryPlan';

/** Database-specific publish options (03 §11): enlist in the caller's transaction and stamp the publisher. */
export interface DatabaseTransportPublishOptions extends DatabasePublishOptions {
    Kind: 'Database';
    Executor?: WorkQueueTransactionalExecutor;
    UserID?: string;
}

export function IsDatabaseTransportPublishOptions(options: DatabasePublishOptions | undefined): options is DatabaseTransportPublishOptions {
    return options !== undefined && options.Kind === 'Database';
}

export function DefaultInstanceID(): string {
    return `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
}

/**
 * The Database transport (03 §2.1, §7, §11). Each message is written in its own transaction on a fresh independent
 * executor with transient retry, or inside the caller's transaction when the publish options carry an executor — in
 * which case the caller commits and every database error propagates to it.
 */
export class DatabaseTransportDriver implements ITransportDriver {
    public readonly Name = DATABASE_DRIVER_CLASS;
    public readonly Capabilities: TransportCapabilities = DATABASE_TRANSPORT_CAPABILITIES;
    private readonly sql: WorkQueueSqlBuilder;
    private readonly instanceID: string;
    private operator: DatabaseTransportOperator | null = null;

    constructor(private readonly source: WorkQueueExecutorSource, private readonly deps: TransportDriverDeps) {
        this.sql = CreateWorkQueueSqlBuilder(source);
        this.instanceID = deps.InstanceID ?? DefaultInstanceID();
    }

    public get InstanceID(): string {
        return this.instanceID;
    }

    public async Publish(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[],
                         opts?: DatabasePublishOptions): Promise<PublishResult[]> {
        const topicID = ReadTopicID(topic);
        const options = IsDatabaseTransportPublishOptions(opts) ? opts : null;
        if (options?.Executor) {
            // One caller transaction for the whole batch: take every lock up front, in sorted key order (03 §7).
            await this.AcquirePublishOrderLocks(topic, messages, subscriptions, options.Executor);
        }
        const results: PublishResult[] = [];
        for (const message of messages) {
            results.push(await this.publishOne(topic, topicID, message, subscriptions, options));
        }
        return results;
    }

    /**
     * Takes the publish-order locks a batch needs, in sorted key order, inside the caller's transaction. Two callers
     * publishing the same keys in opposite orders therefore wait for each other instead of deadlocking. Re-acquiring a
     * lock the transaction already holds is a no-op on both platforms, so `writeMessage` may ask again.
     */
    public async AcquirePublishOrderLocks(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[],
                                          executor: WorkQueueTransactionalExecutor): Promise<void> {
        const keys = PublishOrderKeys(messages, subscriptions);
        if (keys.length === 0) {
            return;
        }
        const topicID = ReadTopicID(topic);
        await this.preparePublishOrderLock(executor);
        for (const key of keys) {
            await ExecuteRows<LockResultRow>(
                executor, this.sql.Publish.AcquirePublishOrderLock(topicID, key, PUBLISH_LOCK_TIMEOUT_MS), this.deps.ContextUser);
        }
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        return new DatabaseTransportConsumer<TPayload>(this.source, this.sql, subscription, this.deps, this.instanceID);
    }

    public Operator(): ITransportOperator {
        return this.databaseOperator();
    }

    public GetBacklog(subscription: SubscriptionBinding): Promise<SubscriptionBacklog> {
        return this.databaseOperator().GetBacklog(subscription);
    }

    /** Database prerequisites (READ_COMMITTED_SNAPSHOT on SQL Server), reported once per transport by ValidateTopology. */
    public CheckPrerequisites(): Promise<BindingValidationIssue[]> {
        return this.databaseOperator().CheckPrerequisites();
    }

    public async ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        const issues: BindingValidationIssue[] = [];
        if (!HasText(topic.Config['TopicID'])) {
            issues.push({ Severity: 'Error', Subject: topic.TopicName, Message: 'Database topic binding is missing Config.TopicID' });
        }
        for (const subscription of subscriptions) {
            const name = subscription.Policy.SubscriptionName;
            if (!HasText(subscription.Config['SubscriptionID'])) {
                issues.push({ Severity: 'Error', Subject: name, Message: 'Database subscription binding is missing Config.SubscriptionID' });
            }
            if (subscription.HostType === 'External') {
                issues.push({ Severity: 'Error', Subject: name, Message: 'External hosts cannot consume the Database transport' });
            }
        }
        return issues;
    }

    /** Releases the operator's independent executor. Consumers are closed by the runtime that opened them. */
    public async Close(): Promise<void> {
        const operator = this.operator;
        this.operator = null;
        await operator?.Close();
    }

    private databaseOperator(): DatabaseTransportOperator {
        this.operator ??= new DatabaseTransportOperator(this.source, this.deps);
        return this.operator;
    }

    private async publishOne(topic: TopicBinding, topicID: string, message: WorkMessage, subscriptions: SubscriptionBinding[],
                             options: DatabaseTransportPublishOptions | null): Promise<PublishResult> {
        const plan = BuildDeliveryPlan(message, subscriptions);
        const userID = options?.UserID ?? null;
        if (options?.Executor) {
            // Enlisted: the caller owns the transaction, so every database error is the caller's to see (03 §11).
            return this.writeMessage(options.Executor, topicID, message, plan, userID);
        }
        try {
            return await RetryTransient(() => RunInWorkQueueTransaction(this.source, async tx => {
                const result = await this.writeMessage(tx, topicID, message, plan, userID);
                return { Commit: result.Status === 'Accepted', Value: result };
            }));
        } catch (error) {
            this.deps.Log.Error(`Publish of message ${message.MessageID} to '${topic.TopicName}' failed`, error instanceof Error ? error : undefined);
            return Rejected(message.MessageID, 'TransportUnavailable', ErrorText(error), true);
        }
    }

    private async writeMessage(executor: WorkQueueTransactionalExecutor, topicID: string, message: WorkMessage,
                               plan: DeliveryPlan, userID: string | null): Promise<PublishResult> {
        const user = this.deps.ContextUser;
        if (plan.NeedsPublishOrderLock && message.PartitionKey !== undefined) {
            await this.lockKey(executor, topicID, message.PartitionKey);
        }
        const inserted = await this.insertMessage(executor, ToMessageInsertRow(message, topicID, userID));
        if (!inserted) {
            const existing = await ExecuteRows<ExistingMessageRow>(executor, this.sql.Publish.SelectMessage(message.MessageID), user);
            return ResolveExistingMessage(existing[0], message, topicID);
        }
        const publishOrdinal = ToNumber(inserted.PublishOrdinal);
        if (publishOrdinal === null) {
            throw new Error(`Message ${message.MessageID} was inserted without a PublishOrdinal`);
        }
        const rows = ToDeliveryRows(message, plan, publishOrdinal);
        for (let start = 0; start < rows.length; start += DELIVERY_INSERT_CHUNK) {
            await ExecuteWrite(executor, this.sql.Publish.InsertDeliveries(rows.slice(start, start + DELIVERY_INSERT_CHUNK)), user);
        }
        return Accepted(message.MessageID);
    }

    private async lockKey(executor: WorkQueueTransactionalExecutor, topicID: string, partitionKey: string): Promise<void> {
        await this.preparePublishOrderLock(executor);
        await ExecuteRows<LockResultRow>(
            executor, this.sql.Publish.AcquirePublishOrderLock(topicID, partitionKey, PUBLISH_LOCK_TIMEOUT_MS), this.deps.ContextUser);
    }

    /** Per-transaction lock setup, when the platform needs any (none under CD9: the timeout is a procedure argument). */
    private async preparePublishOrderLock(executor: WorkQueueTransactionalExecutor): Promise<void> {
        const prepare = this.sql.Publish.PreparePublishOrderLock(PUBLISH_LOCK_TIMEOUT_MS);
        if (prepare) {
            await ExecuteRows<Record<string, string>>(executor, prepare, this.deps.ContextUser);
        }
    }

    /** Undefined means "a message with this ID already exists": the procedure inserted nothing, or the primary key raced. */
    private async insertMessage(executor: WorkQueueTransactionalExecutor, row: MessageInsertRow): Promise<MessageInsertedRow | undefined> {
        try {
            const rows = await ExecuteRows<MessageInsertedRow>(executor, this.sql.Publish.InsertMessage(row), this.deps.ContextUser);
            return rows[0];
        } catch (error) {
            if (IsUniqueViolation(error, MESSAGE_PRIMARY_KEY)) {
                return undefined;
            }
            throw error;
        }
    }
}

function HasText(value: WorkJson | undefined): boolean {
    return typeof value === 'string' && value.trim() !== '';
}
