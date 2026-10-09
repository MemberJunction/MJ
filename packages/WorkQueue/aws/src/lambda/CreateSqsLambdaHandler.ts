import {
    ConsumerRuntime, type SettleResult, type SubscriptionBinding, type WorkHandler, type WorkJson, type WorkLogger,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig } from '../config';
import { SqsTransportConsumer } from '../consumer/SqsTransportConsumer';
import { CreateSqsClient } from '../gateway/sqsClient';
import { SdkSqsGateway } from '../gateway/SdkSqsGateway';
import type { SqsGateway } from '../gateway/SqsGateway';
import { ParseSubscriptionBindingEnv, SUBSCRIPTION_ENV_VAR } from './bindingEnv';
import { FormatEmfLine, type InvocationMetrics } from './emf';
import { ToSqsReceivedMessage, type LambdaContextLike, type SqsBatchResponse, type SqsLambdaEvent, type SqsLambdaRecord } from './lambdaTypes';

export interface SqsLambdaHandlerOptions {
    Binding?: SubscriptionBinding;
    Env?: Record<string, string | undefined>;
    Gateway?: SqsGateway;
    /** Message groups processed in parallel. Default 10. */
    Concurrency?: number;
    /** Stop starting records, and abort running ones, this long before the deadline. Default 10,000 ms. */
    TimeoutSafetyMs?: number;
    Log?: WorkLogger;
    EmitMetrics?: (line: string) => void;
    Now?: () => number;
}

export type SqsLambdaHandler = (event: SqsLambdaEvent, context: LambdaContextLike) => Promise<SqsBatchResponse>;

interface Initialized {
    Binding: SubscriptionBinding;
    Gateway: SqsGateway;
}

const JSON_LOGGER: WorkLogger = {
    Info: (message, data) => console.log(JSON.stringify({ level: 'info', message, ...data })),
    Warn: (message, data) => console.warn(JSON.stringify({ level: 'warn', message, ...data })),
    Error: (message, error, data) => console.error(JSON.stringify({ level: 'error', message, error: error?.message, ...data })),
};

function groupRecords(records: SqsLambdaRecord[]): SqsLambdaRecord[][] {
    const groups = new Map<string, SqsLambdaRecord[]>();
    for (const record of records) {
        const key = record.attributes.MessageGroupId ?? `record:${record.messageId}`;
        groups.set(key, [...(groups.get(key) ?? []), record]);
    }
    return [...groups.values()];
}

async function runLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const item = items[next++];
            await work(item);
        }
    });
    await Promise.all(workers);
}

/**
 * A record leaves the batch only when SQS no longer holds it: Settled Completed (deleted) or Settled DeadLettered
 * (copied to the DLQ, then deleted). Everything else — Settled Pending (retry or release), LeaseLost, Failed, or no
 * result at all — is reported as a batch item failure so it stays on the queue. No marker strings are inspected:
 * core's ProcessBatch returns the real SettleResult of every delivery, including ones it released (03 §3.2).
 */
function succeeded(result: SettleResult | undefined): boolean {
    return result?.Kind === 'Settled' && (result.Status === 'Completed' || result.Status === 'DeadLettered');
}

function tally(metrics: InvocationMetrics, result: SettleResult | undefined): void {
    metrics.Processed += 1;
    if (result?.Kind === 'Settled') {
        const key = result.Status === 'Completed' ? 'Completed' : result.Status === 'DeadLettered' ? 'DeadLettered' : 'Retried';
        metrics[key] += 1;
    } else {
        metrics.Failed += 1;
    }
}

export function CreateSqsLambdaHandler<TPayload extends WorkJson = WorkJson>(
    handlerFactory: () => WorkHandler<TPayload>,
    options: SqsLambdaHandlerOptions = {},
): SqsLambdaHandler {
    const now = options.Now ?? Date.now;
    const log = options.Log ?? JSON_LOGGER;
    const emit = options.EmitMetrics ?? ((line: string) => console.log(line));
    const safetyMs = options.TimeoutSafetyMs ?? 10_000;
    let initialized: Initialized | null = null;

    const initialize = (): Initialized => {
        if (initialized === null) {
            const binding = options.Binding ?? ParseSubscriptionBindingEnv((options.Env ?? process.env)[SUBSCRIPTION_ENV_VAR]);
            const region = ReadAwsSubscriptionConfig(binding.Config).Region;
            const gateway = options.Gateway ?? new SdkSqsGateway(CreateSqsClient({ Region: region, Endpoint: null }));
            initialized = { Binding: binding, Gateway: gateway };
        }
        return initialized;
    };

    return async (event, context) => {
        const { Binding: binding, Gateway: gateway } = initialize();
        const started = now();
        const queueUrl = ReadAwsSubscriptionConfig(binding.Config).QueueUrl;
        const consumer = new SqsTransportConsumer<TPayload>(gateway, binding, { Now: now });
        const runtime = new ConsumerRuntime<TPayload>(consumer, handlerFactory, binding.Policy,
            { Concurrency: options.Concurrency ?? 10, ReceiveBatchSize: 10, IdlePollMinMs: 0, IdlePollMaxMs: 0, ShutdownDrainMs: 0 }, log, now);
        const metrics: InvocationMetrics = { Processed: 0, Completed: 0, Retried: 0, DeadLettered: 0, Failed: 0, NotStarted: 0, DurationMs: 0 };
        const failures = new Set<string>();
        let stopping = false;
        const timer = setTimeout(() => {
            stopping = true;
            void runtime.Stop();
        }, Math.max(0, context.getRemainingTimeInMillis() - safetyMs));

        const release = async (records: SqsLambdaRecord[]): Promise<void> => {
            for (const record of records) {
                failures.add(record.messageId);
                metrics.NotStarted += 1;
                await gateway.ChangeVisibility(queueUrl, record.receiptHandle, 0).catch(() => false);
            }
        };

        const processGroup = async (group: SqsLambdaRecord[]): Promise<void> => {
            for (let i = 0; i < group.length; i++) {
                if (stopping || context.getRemainingTimeInMillis() < safetyMs) {
                    await release(group.slice(i));
                    return;
                }
                const record = group[i];
                try {
                    const delivery = await consumer.Adopt(ToSqsReceivedMessage(record));
                    if (delivery === null) {
                        metrics.DeadLettered += 1;
                        continue;
                    }
                    const [result] = await runtime.ProcessBatch([delivery]);
                    tally(metrics, result);
                    if (!succeeded(result)) {
                        failures.add(record.messageId);
                        await release(group.slice(i + 1));
                        return;
                    }
                } catch (error) {
                    log.Error('Record processing failed', error instanceof Error ? error : new Error(String(error)), { messageId: record.messageId });
                    failures.add(record.messageId);
                    metrics.Failed += 1;
                    await release(group.slice(i + 1));
                    return;
                }
            }
        };

        try {
            await runLimited(groupRecords(event.Records), options.Concurrency ?? 10, processGroup);
        } finally {
            clearTimeout(timer);
            metrics.DurationMs = now() - started;
            emit(FormatEmfLine(binding.Policy.SubscriptionName, metrics, now()));
        }
        return { batchItemFailures: event.Records.filter((r) => failures.has(r.messageId)).map((r) => ({ itemIdentifier: r.messageId })) };
    };
}
