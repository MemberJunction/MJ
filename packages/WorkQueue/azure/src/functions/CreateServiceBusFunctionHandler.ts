import {
    ConsumerRuntime,
    type SettleResult,
    type SubscriptionBinding,
    type WorkHandler,
    type WorkJson,
    type WorkLogger,
} from '@memberjunction/work-queue-core';
import { ReadAzureSubscriptionConfig } from '../config';
import { ServiceBusTransportConsumer } from '../consumer/ServiceBusTransportConsumer';
import type {
    ServiceBusDeadLetterRequest,
    ServiceBusGateway,
    ServiceBusOutgoingMessage,
    ServiceBusReceivedRecord,
    ServiceBusScheduleRequest,
    ServiceBusSendEntryResult,
    ServiceBusSettleRequest,
} from '../gateway/ServiceBusGateway';
import { CreateServiceBusClient, type AzureCredentialsOption } from '../gateway/serviceBusClient';
import { ParseAzureSubscriptionBindingEnv, SUBSCRIPTION_ENV_VAR } from './bindingEnv';
import {
    ToServiceBusReceivedRecord,
    type AzureFunctionBatchResponse,
    type AzureFunctionInvocationContext,
    type AzureFunctionMessageActions,
    type AzureFunctionServiceBusMessage,
} from './functionsTypes';
import { FormatTelemetryLine, type InvocationMetrics } from './telemetry';

export interface ServiceBusFunctionHandlerOptions {
    Binding?: SubscriptionBinding;
    Env?: Record<string, string | undefined>;
    Gateway?: ServiceBusGateway;
    Credentials?: AzureCredentialsOption;
    /** Env var holding a Service Bus connection string when scheduling delayed retries directly. Default 'AzureWebJobsServiceBus'. */
    ConnectionStringEnvVar?: string;
    /** Session/message groups processed in parallel. Default 10. */
    Concurrency?: number;
    /** Stop starting records and abort running ones this long before the deadline. Default 10,000 ms. */
    TimeoutSafetyMs?: number;
    /** Fallback timeout budget when context.getRemainingTimeInMillis is unavailable. Default 300,000 ms. */
    DefaultInvocationTimeoutMs?: number;
    /**
     * When invoked with a single message (non-array) and no batch failure handling is used, throw if the
     * message settled as Retry/Pending or Failed so the Azure Functions host abandons and redelivers it. Default true.
     */
    ThrowOnSingleMessageFailure?: boolean;
    Log?: WorkLogger;
    EmitMetrics?: (line: string) => void;
    Now?: () => number;
    /** Optional ServiceBusClient factory override for lazy schedule client caching and testing. */
    CreateClient?: typeof CreateServiceBusClient;
}

export type ServiceBusFunctionHandler = ((
    input: AzureFunctionServiceBusMessage | AzureFunctionServiceBusMessage[] | unknown,
    context?: AzureFunctionInvocationContext,
) => Promise<AzureFunctionBatchResponse>) & {
    Close(): Promise<void>;
};

interface TriggerSettlementDeps {
    Records: Map<string, AzureFunctionServiceBusMessage>;
    Actions?: AzureFunctionMessageActions;
    TopicSenderGateway?: ServiceBusGateway;
}

const JSON_LOGGER: WorkLogger = {
    Info: (message, data) => console.log(JSON.stringify({ level: 'info', message, ...data })),
    Warn: (message, data) => console.warn(JSON.stringify({ level: 'warn', message, ...data })),
    Error: (message, error, data) => console.error(JSON.stringify({ level: 'error', message, error: error?.message, ...data })),
};

/**
 * Lightweight ServiceBusGateway backed by Azure Functions trigger settlement actions (or pure trigger mode
 * when autoCompleteMessages is enabled). Never pulls ServiceBusAdministrationClient into the Functions bundle.
 */
class TriggerContextGateway implements ServiceBusGateway {
    constructor(private readonly deps: TriggerSettlementDeps) {}

    public async SendBatch(topicName: string, messages: ServiceBusOutgoingMessage[]): Promise<ServiceBusSendEntryResult[]> {
        if (this.deps.TopicSenderGateway) {
            return this.deps.TopicSenderGateway.SendBatch(topicName, messages);
        }
        return messages.map((m) => ({ Id: m.MessageId, Kind: 'Published' }));
    }

    public async Send(topicName: string, message: ServiceBusOutgoingMessage): Promise<string> {
        if (this.deps.TopicSenderGateway) {
            return this.deps.TopicSenderGateway.Send(topicName, message);
        }
        return message.MessageId;
    }

    public async Schedule(request: ServiceBusScheduleRequest): Promise<string> {
        if (this.deps.TopicSenderGateway) {
            return this.deps.TopicSenderGateway.Schedule(request);
        }
        throw new Error('Delayed retry scheduling requires a configured ServiceBusGateway or connection/namespace');
    }

    public async Receive(): Promise<ServiceBusReceivedRecord[]> {
        return [];
    }

    public async Complete(request: ServiceBusSettleRequest): Promise<boolean> {
        const msg = this.deps.Records.get(request.LockToken);
        if (msg && this.deps.Actions?.completeMessage) {
            await this.deps.Actions.completeMessage(msg);
        }
        return true;
    }

    public async Abandon(request: ServiceBusSettleRequest): Promise<boolean> {
        const msg = this.deps.Records.get(request.LockToken);
        if (msg && this.deps.Actions?.abandonMessage) {
            await this.deps.Actions.abandonMessage(msg, request.PropertiesToModify);
        }
        return true;
    }

    public async DeadLetter(request: ServiceBusDeadLetterRequest): Promise<boolean> {
        const msg = this.deps.Records.get(request.LockToken);
        if (msg && this.deps.Actions?.deadLetterMessage) {
            await this.deps.Actions.deadLetterMessage(msg, {
                deadLetterReason: request.Reason,
                deadLetterErrorDescription: request.ErrorDescription,
            });
        }
        return true;
    }

    public async RenewLock(request: ServiceBusSettleRequest): Promise<Date | null> {
        const msg = this.deps.Records.get(request.LockToken);
        if (msg && this.deps.Actions?.renewMessageLock) {
            const renewed = await this.deps.Actions.renewMessageLock(msg);
            return renewed instanceof Date ? renewed : new Date(Date.now() + 60_000);
        }
        return new Date(Date.now() + 60_000);
    }

    public async PeekDeadLetters(): Promise<ServiceBusReceivedRecord[]> {
        return [];
    }

    public async ReceiveDeadLetters(): Promise<ServiceBusReceivedRecord[]> {
        return [];
    }

    public async CompleteDeadLetter(): Promise<boolean> {
        return false;
    }

    public async AbandonDeadLetter(): Promise<boolean> {
        return false;
    }

    public async Close(): Promise<void> {
        if (this.deps.TopicSenderGateway) {
            await this.deps.TopicSenderGateway.Close();
        }
    }
}

interface NormalizedRecordItem {
    Raw: AzureFunctionServiceBusMessage;
    Record: ServiceBusReceivedRecord;
}

function groupBySession(items: NormalizedRecordItem[]): NormalizedRecordItem[][] {
    const groups = new Map<string, NormalizedRecordItem[]>();
    for (const item of items) {
        const key = item.Record.SessionId ?? `msg:${item.Record.MessageId}:${item.Record.LockToken}`;
        groups.set(key, [...(groups.get(key) ?? []), item]);
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

function createLazyScheduleGateway(
    binding: SubscriptionBinding,
    options: ServiceBusFunctionHandlerOptions,
    env: Record<string, string | undefined>,
    getOrCreateClient: () => ReturnType<typeof CreateServiceBusClient> | undefined,
): ServiceBusGateway | undefined {
    const connKey = options.ConnectionStringEnvVar ?? 'AzureWebJobsServiceBus';
    const conn = env[connKey] ?? env['MJ_WQ_AZURE_CONNECTION_STRING'];
    const subConfig = ReadAzureSubscriptionConfig(binding.Config);
    if (!conn && !subConfig.Namespace) {
        return undefined;
    }
    return {
        SendBatch: async () => [],
        Send: async () => '',
        Schedule: async (request) => {
            const client = getOrCreateClient();
            if (!client) {
                throw new Error('Service Bus client could not be initialized for scheduling.');
            }
            const sender = client.createSender(request.TopicName);
            try {
                const seqs = await sender.scheduleMessages({
                    messageId: request.Message.MessageId,
                    body: request.Message.Body,
                    contentType: request.Message.ContentType ?? 'application/json',
                    applicationProperties: { ...request.Message.ApplicationProperties },
                    ...(request.Message.SessionId ? { sessionId: request.Message.SessionId } : {}),
                    ...(request.Message.CorrelationId ? { correlationId: request.Message.CorrelationId } : {}),
                }, request.ScheduledEnqueueTimeUtc);
                return seqs[0]?.toString() ?? '0';
            } finally {
                await sender.close();
            }
        },
        Receive: async () => [],
        Complete: async () => false,
        Abandon: async () => false,
        DeadLetter: async () => false,
        RenewLock: async () => null,
        PeekDeadLetters: async () => [],
        ReceiveDeadLetters: async () => [],
        CompleteDeadLetter: async () => false,
        AbandonDeadLetter: async () => false,
        Close: () => Promise.resolve(),
    };
}

/**
 * Creates an Azure Functions Service Bus trigger handler supporting both single-message and batch invocations.
 * Returns `{ batchItemFailures }` for partial-batch reporting and emits structured invocation telemetry.
 */
export function CreateServiceBusFunctionHandler<TPayload extends WorkJson = WorkJson>(
    handlerFactory: () => WorkHandler<TPayload>,
    options: ServiceBusFunctionHandlerOptions = {},
): ServiceBusFunctionHandler {
    const now = options.Now ?? Date.now;
    const log = options.Log ?? JSON_LOGGER;
    const emit = options.EmitMetrics ?? ((line: string) => console.log(line));
    const safetyMs = options.TimeoutSafetyMs ?? 10_000;
    const defaultTimeoutMs = options.DefaultInvocationTimeoutMs ?? 300_000;
    const throwOnSingle = options.ThrowOnSingleMessageFailure ?? true;

    let cachedBinding: SubscriptionBinding | null = null;
    let cachedClient: ReturnType<typeof CreateServiceBusClient> | null = null;
    const resolveBinding = (): SubscriptionBinding => {
        if (cachedBinding === null) {
            const env = options.Env ?? process.env;
            cachedBinding = options.Binding ?? ParseAzureSubscriptionBindingEnv(env[SUBSCRIPTION_ENV_VAR]);
        }
        return cachedBinding;
    };
    const getOrCreateScheduleClient = (
        binding: SubscriptionBinding,
        env: Record<string, string | undefined>,
    ): ReturnType<typeof CreateServiceBusClient> | undefined => {
        if (cachedClient) {
            return cachedClient;
        }
        const connKey = options.ConnectionStringEnvVar ?? 'AzureWebJobsServiceBus';
        const conn = env[connKey] ?? env['MJ_WQ_AZURE_CONNECTION_STRING'];
        const subConfig = ReadAzureSubscriptionConfig(binding.Config);
        if (!conn && !subConfig.Namespace) {
            return undefined;
        }
        const clientFactory = options.CreateClient ?? CreateServiceBusClient;
        cachedClient = conn
            ? clientFactory({ Namespace: subConfig.Namespace, Endpoint: null, UseEmulator: false }, { ConnectionString: conn })
            : clientFactory({ Namespace: subConfig.Namespace, Endpoint: null, UseEmulator: false }, options.Credentials);
        return cachedClient;
    };

    const handler: ServiceBusFunctionHandler = Object.assign(
        async (input: AzureFunctionServiceBusMessage | AzureFunctionServiceBusMessage[] | unknown, context?: AzureFunctionInvocationContext): Promise<AzureFunctionBatchResponse> => {
            const binding = resolveBinding();
        const env = options.Env ?? process.env;
        const started = now();
        const isBatch = Array.isArray(input);
        const rawList: unknown[] = isBatch ? input : [input];
        const items: NormalizedRecordItem[] = rawList.map((raw, index) => {
            const record = ToServiceBusReceivedRecord(raw, context, index);
            const rawObj: AzureFunctionServiceBusMessage = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
                ? (raw as AzureFunctionServiceBusMessage)
                : { body: raw };
            return { Raw: rawObj, Record: record };
        });

        const recordByLock = new Map<string, AzureFunctionServiceBusMessage>(items.map((item) => [item.Record.LockToken, item.Raw]));
        const lazySender = options.Gateway
            ? undefined
            : createLazyScheduleGateway(binding, options, env, () => getOrCreateScheduleClient(binding, env));
        const gateway: ServiceBusGateway = options.Gateway ?? new TriggerContextGateway({
            Records: recordByLock,
            Actions: context?.actions,
            TopicSenderGateway: lazySender,
        });

        const subConfig = ReadAzureSubscriptionConfig(binding.Config);
        const consumer = new ServiceBusTransportConsumer<TPayload>(gateway, binding, { Now: now });
        const runtime = new ConsumerRuntime<TPayload>(
            consumer,
            handlerFactory,
            binding.Policy,
            { Concurrency: options.Concurrency ?? 10, ReceiveBatchSize: 32, IdlePollMinMs: 0, IdlePollMaxMs: 0, ShutdownDrainMs: 0 },
            log,
            now,
        );

        const metrics: InvocationMetrics = { Processed: 0, Completed: 0, Retried: 0, DeadLettered: 0, Failed: 0, NotStarted: 0, DurationMs: 0 };
        const failures = new Set<string>();
        const failureReasons = new Map<string, string>();
        let stopping = false;
        const getRemainingMs = (): number => context?.getRemainingTimeInMillis?.() ?? Math.max(0, defaultTimeoutMs - (now() - started));
        const timer = setTimeout(() => {
            stopping = true;
            void runtime.Stop();
        }, Math.max(0, getRemainingMs() - safetyMs));

        const onAbort = (): void => {
            stopping = true;
            void runtime.Stop();
        };
        context?.abortSignal?.addEventListener('abort', onAbort, { once: true });

        const releaseSkipped = async (skipped: NormalizedRecordItem[]): Promise<void> => {
            for (const item of skipped) {
                failures.add(item.Record.MessageId);
                metrics.NotStarted += 1;
                await gateway.Abandon({
                    TopicName: subConfig.ServiceBusTopicName,
                    SubscriptionName: subConfig.SubscriptionName,
                    RequiresSession: subConfig.RequiresSession,
                    LockToken: item.Record.LockToken,
                    SessionId: item.Record.SessionId,
                }).catch(() => false);
            }
        };

        const processSessionGroup = async (group: NormalizedRecordItem[]): Promise<void> => {
            for (let i = 0; i < group.length; i++) {
                if (stopping || context?.abortSignal?.aborted || getRemainingMs() < safetyMs) {
                    await releaseSkipped(group.slice(i));
                    return;
                }
                const item = group[i];
                try {
                    const delivery = await consumer.Adopt(item.Record);
                    if (delivery === null) {
                        metrics.DeadLettered += 1;
                        continue;
                    }
                    const [result] = await runtime.ProcessBatch([delivery]);
                    tally(metrics, result);
                    if (!succeeded(result)) {
                        failures.add(item.Record.MessageId);
                        if (result?.Kind === 'Failed') {
                            failureReasons.set(item.Record.MessageId, result.Error);
                        } else {
                            failureReasons.set(item.Record.MessageId, `Settlement status: ${result?.Kind ?? 'Unknown'}`);
                        }
                        await releaseSkipped(group.slice(i + 1));
                        return;
                    }
                } catch (error) {
                    const errObj = error instanceof Error ? error : new Error(String(error));
                    log.Error('Azure Function Service Bus record failed', errObj, { messageId: item.Record.MessageId });
                    failures.add(item.Record.MessageId);
                    failureReasons.set(item.Record.MessageId, errObj.message);
                    metrics.Failed += 1;
                    await releaseSkipped(group.slice(i + 1));
                    return;
                }
            }
        };

        try {
            await runLimited(groupBySession(items), options.Concurrency ?? 10, processSessionGroup);
        } finally {
            clearTimeout(timer);
            context?.abortSignal?.removeEventListener('abort', onAbort);
            metrics.DurationMs = now() - started;
            emit(FormatTelemetryLine(binding.Policy.SubscriptionName, metrics, now()));
        }

        if (!isBatch && throwOnSingle && failures.size > 0) {
            const [firstId] = failures;
            throw new Error(failureReasons.get(firstId) ?? `Message ${firstId} did not complete`);
        }

        return {
            batchItemFailures: items
                .filter((item) => failures.has(item.Record.MessageId))
                .map((item) => ({ itemIdentifier: item.Record.MessageId })),
        };
        },
        {
            Close: async (): Promise<void> => {
                if (cachedClient) {
                    const clientToClose = cachedClient;
                    cachedClient = null;
                    await clientToClose.close().catch(() => undefined);
                }
            },
        },
    );
    return handler;
}
