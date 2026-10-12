import type { WorkJson, WorkMessage } from '../envelope';
import type { WorkContext, WorkHandler, WorkLogger, WorkOutcome, WorkProgress } from '../handler';
import type { DeliveryStatus, SubscriptionPolicy } from '../policy';
import type { ITransportConsumer, LeaseExtension, ReceivedDelivery, SettleResult } from '../transport';

export type ConsumerCall =
    | { Op: 'Receive'; Max: number; WaitSeconds: number }
    | { Op: 'ExtendLease'; DeliveryID: string; LeaseSeconds: number; Progress: WorkProgress | undefined }
    | { Op: 'Complete'; DeliveryID: string }
    | { Op: 'Retry'; DeliveryID: string; DelaySeconds: number; Error: string }
    | { Op: 'DeadLetter'; DeliveryID: string; Reason: string; Error: string | null }
    | { Op: 'Release'; DeliveryID: string }
    | { Op: 'AcknowledgeCancel'; DeliveryID: string }
    | { Op: 'Close' };

/** An ITransportConsumer that returns scripted batches and records every call. */
export class ScriptedConsumer implements ITransportConsumer {
    public readonly Calls: ConsumerCall[] = [];
    public readonly Batches: ReceivedDelivery[][] = [];
    public ReceiveImpl: ((max: number) => Promise<ReceivedDelivery[]>) | null = null;
    public ReceiveError: Error | null = null;
    public ExtendLeaseResult: LeaseExtension | Error = 'Held';
    /** Consumed in order before falling back to ExtendLeaseResult; lets a test script "fail, then succeed". */
    public ExtendLeaseSequence: (LeaseExtension | Error)[] = [];
    /** Overrides the scripted results entirely; lets a test return a promise it controls (or one that never settles). */
    public ExtendLeaseImpl: (() => Promise<LeaseExtension>) | null = null;
    public SettleError: Error | null = null;
    /** When true, Complete/Retry/DeadLetter/Release report LeaseLost (the fenced write changed no row). */
    public SettleLeaseLost = false;
    /** What AcknowledgeCancel reports: 'Discarded' = the delivery was cancelled and is now settled. */
    public AcknowledgeCancelStatus: 'Discarded' | 'LeaseLost' = 'LeaseLost';

    public async Receive(max: number, waitSeconds: number, _signal: AbortSignal): Promise<ReceivedDelivery[]> {
        this.Calls.push({ Op: 'Receive', Max: max, WaitSeconds: waitSeconds });
        if (this.ReceiveError !== null) {
            throw this.ReceiveError;
        }
        if (this.ReceiveImpl !== null) {
            return this.ReceiveImpl(max);
        }
        const batch = this.Batches.shift() ?? [];
        if (batch.length > max) {
            this.Batches.unshift(batch.slice(max));
            return batch.slice(0, max);
        }
        return batch;
    }

    public async ExtendLease(delivery: ReceivedDelivery, leaseSeconds: number, progress?: WorkProgress): Promise<LeaseExtension> {
        this.Calls.push({ Op: 'ExtendLease', DeliveryID: delivery.DeliveryID, LeaseSeconds: leaseSeconds, Progress: progress });
        if (this.ExtendLeaseImpl !== null) {
            return this.ExtendLeaseImpl();
        }
        const result = this.ExtendLeaseSequence.length > 0 ? this.ExtendLeaseSequence.shift() ?? this.ExtendLeaseResult : this.ExtendLeaseResult;
        if (result instanceof Error) {
            throw result;
        }
        return result;
    }

    public async Complete(delivery: ReceivedDelivery): Promise<SettleResult> {
        this.Calls.push({ Op: 'Complete', DeliveryID: delivery.DeliveryID });
        return this.settled(delivery, 'Completed');
    }

    public async Retry(delivery: ReceivedDelivery, delaySeconds: number, error: string): Promise<SettleResult> {
        this.Calls.push({ Op: 'Retry', DeliveryID: delivery.DeliveryID, DelaySeconds: delaySeconds, Error: error });
        return this.settled(delivery, 'Pending');
    }

    public async DeadLetter(delivery: ReceivedDelivery, reason: string, error: string | null): Promise<SettleResult> {
        this.Calls.push({ Op: 'DeadLetter', DeliveryID: delivery.DeliveryID, Reason: reason, Error: error });
        return this.settled(delivery, 'DeadLettered');
    }

    public async Release(delivery: ReceivedDelivery): Promise<SettleResult> {
        this.Calls.push({ Op: 'Release', DeliveryID: delivery.DeliveryID });
        return this.settled(delivery, 'Pending');
    }

    public async AcknowledgeCancel(delivery: ReceivedDelivery): Promise<SettleResult> {
        this.Calls.push({ Op: 'AcknowledgeCancel', DeliveryID: delivery.DeliveryID });
        if (this.AcknowledgeCancelStatus === 'Discarded') {
            return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Discarded' };
        }
        return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
    }

    public async Close(): Promise<void> {
        this.Calls.push({ Op: 'Close' });
    }

    public Count(op: ConsumerCall['Op']): number {
        return this.Calls.filter((call) => call.Op === op).length;
    }

    public CallsOf<K extends ConsumerCall['Op']>(op: K): Extract<ConsumerCall, { Op: K }>[] {
        return this.Calls.filter((call): call is Extract<ConsumerCall, { Op: K }> => call.Op === op);
    }

    private settled(delivery: ReceivedDelivery, status: DeliveryStatus): SettleResult {
        if (this.SettleError !== null) {
            throw this.SettleError;
        }
        if (this.SettleLeaseLost) {
            return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        }
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: status };
    }
}

export interface LogEntry {
    Level: 'Info' | 'Warn' | 'Error';
    Message: string;
    Data: Record<string, WorkJson> | undefined;
}

export class RecordingLogger implements WorkLogger {
    public readonly Entries: LogEntry[] = [];

    public Info(message: string, data?: Record<string, WorkJson>): void {
        this.Entries.push({ Level: 'Info', Message: message, Data: data });
    }

    public Warn(message: string, data?: Record<string, WorkJson>): void {
        this.Entries.push({ Level: 'Warn', Message: message, Data: data });
    }

    public Error(message: string, _error?: Error, data?: Record<string, WorkJson>): void {
        this.Entries.push({ Level: 'Error', Message: message, Data: data });
    }

    public Has(level: LogEntry['Level'], fragment: string): boolean {
        return this.Entries.some((entry) => entry.Level === level && entry.Message.includes(fragment));
    }
}

export interface Deferred<T> {
    Promise: Promise<T>;
    Resolve(value: T): void;
    Reject(error: Error): void;
}

export function CreateDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { Promise: promise, Resolve: resolve, Reject: reject };
}

export function MakePolicy(overrides: Partial<SubscriptionPolicy> = {}): SubscriptionPolicy {
    return {
        SubscriptionName: 'test.subscription',
        TopicName: 'test.topic',
        PartitionMode: 'None',
        MaxAttempts: 5,
        BackoffBaseSeconds: 10,
        BackoffMaxSeconds: 900,
        LeaseSeconds: 60,
        HeartbeatMode: 'Auto',
        ...overrides,
    };
}

export function MakeDelivery(id: string, overrides: Partial<ReceivedDelivery> = {}): ReceivedDelivery {
    return {
        Message: { MessageID: `msg-${id}`, Topic: 'test.topic', Attributes: {}, PublishedAt: '2026-01-01T00:00:00.000Z' },
        DeliveryID: id,
        LeaseToken: `token-${id}`,
        Attempt: 1,
        IsReplay: false,
        // Relative to the (possibly faked) clock: DeliveryExecution enforces the lease horizon on a real timer.
        LeaseExpiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    };
}

export function WithPartitionKey(delivery: ReceivedDelivery, partitionKey: string): ReceivedDelivery {
    return { ...delivery, Message: { ...delivery.Message, PartitionKey: partitionKey } };
}

export function HandlerFrom<TPayload extends WorkJson = WorkJson>(
    handle: (message: WorkMessage<TPayload>, context: WorkContext) => Promise<WorkOutcome>,
): () => WorkHandler<TPayload> {
    return () => ({ Handle: handle });
}
