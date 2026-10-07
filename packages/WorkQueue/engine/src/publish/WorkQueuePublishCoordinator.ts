import { BuildWorkMessage, ValidatePublishRequest } from '@memberjunction/work-queue-core';
import type {
    ITransportDriver, PublishError, PublishRequest, PublishResult, SubscriptionBinding, TopicBinding, WorkJson, WorkLogger, WorkMessage,
} from '@memberjunction/work-queue-core';
import { DATABASE_DRIVER_CLASS } from '@memberjunction/work-queue-base';
import type { ResolvedTopic } from '@memberjunction/work-queue-base';
import type { DeduplicationLedger, LedgerReservation } from '../dedup/DeduplicationLedger';
import { ErrorText } from '../sql/sqlExecution';
import type { WorkQueueExecutorSource, WorkQueueSqlExecutor, WorkQueueTransactionalExecutor } from '../sql/WorkQueueSqlExecutor';
import { OwnedExecutor } from '../transports/OwnedExecutor';
import { RetryTransient, RunInWorkQueueTransaction } from '../transaction/RunInWorkQueueTransaction';
import type { DatabaseTransportPublishOptions } from '../transports/database/DatabaseTransportDriver';
import { Duplicate, Rejected } from './publishResults';

export type LedgerOperations = Pick<DeduplicationLedger, 'Reserve' | 'Confirm' | 'Release'>;

export interface PublishCoordinatorDeps {
    /** Returns undefined for an unknown topic; throws WorkQueueConfigurationError for a misconfigured one. */
    ResolveTopic(topicName: string): ResolvedTopic | undefined;
    GetDriver(transportID: string): Promise<ITransportDriver>;
    Executor: WorkQueueExecutorSource;
    CreateLedger(executor: WorkQueueSqlExecutor): LedgerOperations;
    NewID(): string;
    Now(): Date;
    NotifyPublished(topicName: string): void;
    Log: WorkLogger;
}

export interface CoordinatorPublishOptions {
    UserID: string | null;
    External: boolean;
    CallerExecutor: WorkQueueTransactionalExecutor | null;
}

/** A driver that can take a batch's publish-order locks up front, in sorted key order (the Database driver, Task 9). */
export interface PublishOrderLocker {
    AcquirePublishOrderLocks(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[],
                             executor: WorkQueueTransactionalExecutor): Promise<void>;
}

function IsPublishOrderLocker(driver: ITransportDriver): driver is ITransportDriver & PublishOrderLocker {
    return 'AcquirePublishOrderLocks' in driver && typeof driver.AcquirePublishOrderLocks === 'function';
}

interface PreparedPublish {
    Index: number;
    Message: WorkMessage;
    DedupKey: string | null;
    TTLSeconds: number;
}

/**
 * Owns publish validation and the deduplication ledger protocol for every transport (03 §2.1, §1.1): topic lookup →
 * topic rejections → per-request validation → envelope → transport. Results stay aligned with requests.
 *
 * Database transport: per message, in one transaction (the caller's when given, else an independent one with
 * transient retry): Reserve → driver.Publish → Confirm → commit only when accepted. Enlisted publishes take every
 * publish-order lock up front in sorted key order and let every database error propagate to the caller.
 * Cloud transport: Reserve each keyed request → one driver.Publish for the batch → Confirm accepted, Release the rest,
 * with the ledger on an independent executor the coordinator owns (F8).
 */
export class WorkQueuePublishCoordinator {
    /** The cloud-path ledger's independent executor (03 §11, F8): minted on first use, released by Close(). */
    private readonly cloudLedgerExecutor: OwnedExecutor;

    constructor(private readonly deps: PublishCoordinatorDeps) {
        this.cloudLedgerExecutor = new OwnedExecutor(deps.Executor);
    }

    public Close(): Promise<void> {
        return this.cloudLedgerExecutor.Release();
    }

    public async Publish<TPayload extends WorkJson>(topicName: string, requests: PublishRequest<TPayload>[],
                                                    options: CoordinatorPublishOptions): Promise<PublishResult[]> {
        let resolved: ResolvedTopic | undefined;
        try {
            resolved = this.deps.ResolveTopic(topicName);
        } catch (error) {
            return RejectAll(requests, { Code: 'TransportUnavailable', Message: ErrorText(error), Retryable: true });
        }
        if (!resolved) {
            return RejectAll(requests, { Code: 'TopicNotFound', Message: `Topic '${topicName}' does not exist`, Retryable: false });
        }
        const topicError = TopicRejection(resolved, options.External);
        if (topicError) {
            return RejectAll(requests, topicError);
        }
        const results: PublishResult[] = new Array<PublishResult>(requests.length);
        const prepared = this.prepare(resolved, requests, results);
        if (prepared.length > 0) {
            await this.deliver(resolved, prepared, options, results);
        }
        if (results.some(r => r.Status === 'Accepted')) {
            this.deps.NotifyPublished(resolved.Topic.Name);
        }
        return results;
    }

    private prepare<TPayload extends WorkJson>(resolved: ResolvedTopic, requests: PublishRequest<TPayload>[], results: PublishResult[]): PreparedPublish[] {
        const prepared: PreparedPublish[] = [];
        requests.forEach((request, index) => {
            const error = ValidatePublishRequest(resolved.Binding, request);
            if (error) {
                results[index] = { MessageID: request.MessageID ?? '', Status: 'Rejected', Error: error };
                return;
            }
            const key = request.DeduplicationKey?.trim();
            prepared.push({
                Index: index,
                Message: BuildWorkMessage(resolved.Topic.Name, request, this.deps.Now(), () => this.deps.NewID()),
                DedupKey: key ? key : null,
                TTLSeconds: request.DeduplicationTTLSeconds ?? resolved.Topic.DefaultDeduplicationTTLSeconds,
            });
        });
        return prepared;
    }

    private async deliver(resolved: ResolvedTopic, prepared: PreparedPublish[], options: CoordinatorPublishOptions, results: PublishResult[]): Promise<void> {
        let driver: ITransportDriver;
        try {
            driver = await this.deps.GetDriver(resolved.Transport.ID);
        } catch (error) {
            for (const item of prepared) {
                results[item.Index] = Rejected(item.Message.MessageID, 'TransportUnavailable', ErrorText(error), true);
            }
            return;
        }
        if (resolved.Transport.DriverClass === DATABASE_DRIVER_CLASS) {
            if (options.CallerExecutor && IsPublishOrderLocker(driver)) {
                // One caller transaction for the whole batch: every lock first, in sorted key order (03 §7).
                await driver.AcquirePublishOrderLocks(resolved.Binding, prepared.map(p => p.Message), resolved.Subscriptions, options.CallerExecutor);
            }
            for (const item of prepared) {
                results[item.Index] = await this.publishDatabaseOne(resolved, driver, item, options);
            }
        } else {
            await this.publishCloud(resolved, driver, prepared, results);
        }
    }

    private async publishDatabaseOne(resolved: ResolvedTopic, driver: ITransportDriver, item: PreparedPublish,
                                     options: CoordinatorPublishOptions): Promise<PublishResult> {
        const messageID = item.Message.MessageID;
        const work = () => RunInWorkQueueTransaction(this.deps.Executor, async tx => {
            const ledger = this.deps.CreateLedger(tx);
            if (item.DedupKey) {
                const refusal = ReservationRefusal(await ledger.Reserve(resolved.Topic.ID, item.DedupKey, messageID), messageID, item.DedupKey);
                if (refusal) {
                    return { Commit: false, Value: refusal };
                }
            }
            const publishOptions: DatabaseTransportPublishOptions = { Kind: 'Database', Executor: tx, UserID: options.UserID ?? undefined };
            const [result] = await driver.Publish(resolved.Binding, [item.Message], resolved.Subscriptions, publishOptions);
            const outcome = result ?? Rejected(messageID, 'TransportUnavailable', 'The transport returned no publish result', true);
            if (outcome.Status !== 'Accepted') {
                return { Commit: false, Value: outcome };
            }
            if (item.DedupKey && !(await ledger.Confirm(resolved.Topic.ID, item.DedupKey, messageID, item.TTLSeconds))) {
                throw new Error(`Deduplication key '${item.DedupKey}' could not be confirmed`);
            }
            return { Commit: true, Value: outcome };
        }, options.CallerExecutor);
        if (options.CallerExecutor) {
            // Enlisted: the caller owns the transaction, so every database error is the caller's to see (03 §11).
            return work();
        }
        try {
            return await RetryTransient(work);
        } catch (error) {
            this.deps.Log.Error(`Publish of message ${messageID} to '${resolved.Topic.Name}' failed`, error instanceof Error ? error : undefined);
            return Rejected(messageID, 'TransportUnavailable', ErrorText(error), true);
        }
    }

    private async publishCloud(resolved: ResolvedTopic, driver: ITransportDriver, prepared: PreparedPublish[], results: PublishResult[]): Promise<void> {
        let ledger: LedgerOperations;
        try {
            ledger = this.deps.CreateLedger(await this.cloudLedgerExecutor.Get());
        } catch (error) {
            for (const item of prepared) {
                results[item.Index] = Rejected(item.Message.MessageID, 'TransportUnavailable', ErrorText(error), true);
            }
            return;
        }
        const toSend = await this.reserveCloudKeys(resolved, ledger, prepared, results);
        if (toSend.length === 0) {
            return;
        }
        let sent: PublishResult[];
        try {
            sent = await driver.Publish(resolved.Binding, toSend.map(i => i.Message), resolved.Subscriptions);
        } catch (error) {
            sent = toSend.map(i => Rejected(i.Message.MessageID, 'TransportUnavailable', ErrorText(error), true));
        }
        for (let position = 0; position < toSend.length; position++) {
            const item = toSend[position];
            const outcome = sent[position] ?? Rejected(item.Message.MessageID, 'TransportUnavailable', 'The transport returned no publish result', true);
            results[item.Index] = outcome;
            if (item.DedupKey) {
                await this.settleCloudReservation(ledger, resolved.Topic.ID, item, outcome);
            }
        }
    }

    private async reserveCloudKeys(resolved: ResolvedTopic, ledger: LedgerOperations, prepared: PreparedPublish[],
                                   results: PublishResult[]): Promise<PreparedPublish[]> {
        const toSend: PreparedPublish[] = [];
        for (const item of prepared) {
            if (!item.DedupKey) {
                toSend.push(item);
                continue;
            }
            try {
                const reservation = await ledger.Reserve(resolved.Topic.ID, item.DedupKey, item.Message.MessageID);
                const refusal = ReservationRefusal(reservation, item.Message.MessageID, item.DedupKey);
                if (refusal) {
                    results[item.Index] = refusal;
                } else {
                    toSend.push(item);
                }
            } catch (error) {
                results[item.Index] = Rejected(item.Message.MessageID, 'TransportUnavailable', ErrorText(error), true);
            }
        }
        return toSend;
    }

    private async settleCloudReservation(ledger: LedgerOperations, topicID: string, item: PreparedPublish, outcome: PublishResult): Promise<void> {
        const key = item.DedupKey ?? '';
        try {
            if (outcome.Status === 'Accepted') {
                if (!(await ledger.Confirm(topicID, key, item.Message.MessageID, item.TTLSeconds))) {
                    this.deps.Log.Warn(`Deduplication key '${key}' reservation expired before it was confirmed`);
                }
            } else {
                await ledger.Release(topicID, key, item.Message.MessageID);
            }
        } catch (error) {
            this.deps.Log.Error(`Deduplication ledger update for key '${key}' failed`, error instanceof Error ? error : undefined);
        }
    }
}

/** 03 §2.1 (F1): only a Confirmed row is a duplicate; someone else's unconfirmed reservation is a retryable rejection. */
function ReservationRefusal(reservation: LedgerReservation, messageID: string, key: string): PublishResult | null {
    switch (reservation.Kind) {
        case 'Reserved':
            return null;
        case 'Duplicate':
            return Duplicate(reservation.OwnerMessageID);
        case 'Pending':
            return Rejected(messageID, 'DeduplicationPending',
                `Deduplication key '${key}' is reserved by message ${reservation.OwnerMessageID}, which has not been confirmed yet; retry`, true);
    }
}

function RejectAll<TPayload extends WorkJson>(requests: PublishRequest<TPayload>[], error: PublishError): PublishResult[] {
    return requests.map(r => ({ MessageID: r.MessageID ?? '', Status: 'Rejected', Error: error }));
}

function TopicRejection(resolved: ResolvedTopic, external: boolean): PublishError | null {
    const { Topic: topic, Transport: transport } = resolved;
    if (topic.Status !== 'Active') {
        return { Code: 'TopicDisabled', Message: `Topic '${topic.Name}' is disabled`, Retryable: false };
    }
    if (transport.Status !== 'Active') {
        return { Code: 'TopicDisabled', Message: `Transport '${transport.Name}' for topic '${topic.Name}' is disabled`, Retryable: false };
    }
    if (external && !topic.AllowExternalPublish) {
        return { Code: 'TopicNotExternallyPublishable', Message: `Topic '${topic.Name}' does not accept external publishes`, Retryable: false };
    }
    if (transport.DriverClass !== DATABASE_DRIVER_CLASS && (topic.BindingConfig ?? '').trim() === '') {
        return { Code: 'TopicUnbound', Message: `Topic '${topic.Name}' has no imported ${transport.DriverClass} binding yet`, Retryable: true };
    }
    return null;
}
