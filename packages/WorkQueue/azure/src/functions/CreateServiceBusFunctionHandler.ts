import { ConsumerRuntime, type SettleResult, type SubscriptionBinding, type WorkHandler, type WorkJson, type WorkLogger } from '@memberjunction/work-queue-core';
import { ReadAzureSubscriptionConfig } from '../config';
import { ServiceBusTransportConsumer } from '../consumer/ServiceBusTransportConsumer';
import { CreateServiceBusClient, type AzureCredentialOption } from '../gateway/clients';
import { SdkServiceBusGateway } from '../gateway/SdkServiceBusGateway';
import { ParseSubscriptionBindingEnv, SUBSCRIPTION_ENV_VAR } from './bindingEnv';
import { FunctionMessageGateway, type ServiceBusSender } from './FunctionMessageGateway';
import { FormatMetricsLine, type InvocationMetrics } from './metrics';
import { ToReceivedEnvelope, type FunctionsInvocationContextLike, type FunctionsServiceBusMessage } from './functionTypes';

export interface ServiceBusFunctionHandlerOptions {
    Binding?: SubscriptionBinding;
    Env?: Record<string, string | undefined>;
    /** Sender for retry copies. Default: an SDK gateway on the binding's namespace with `Credential` (or DefaultAzureCredential). */
    Sender?: ServiceBusSender;
    Credential?: AzureCredentialOption;
    /** Abort the running handler this long before the host deadline. Default 10,000 ms. */
    TimeoutSafetyMs?: number;
    Log?: WorkLogger;
    EmitMetrics?: (line: string) => void;
    Now?: () => number;
}

export type ServiceBusFunctionHandler = (message: FunctionsServiceBusMessage, context: FunctionsInvocationContextLike) => Promise<void>;

/** Thrown when the message could not be settled by the adapter, so the Functions host abandons it (redelivery). */
export class UnsettledMessageError extends Error {
    constructor(public readonly Result: SettleResult | undefined) {
        super(`Work-queue delivery was not settled: ${Result === undefined ? 'no result' : Result.Kind === 'Failed' ? Result.Error : Result.Kind}`);
        this.name = 'UnsettledMessageError';
    }
}

const JSON_LOGGER: WorkLogger = {
    Info: (message, data) => console.log(JSON.stringify({ level: 'info', message, ...data })),
    Warn: (message, data) => console.warn(JSON.stringify({ level: 'warn', message, ...data })),
    Error: (message, error, data) => console.error(JSON.stringify({ level: 'error', message, error: error?.message, ...data })),
};

function tally(metrics: InvocationMetrics, result: SettleResult | undefined): void {
    metrics.Processed += 1;
    if (result?.Kind === 'Settled') {
        const key = result.Status === 'Completed' ? 'Completed' : result.Status === 'DeadLettered' ? 'DeadLettered' : 'Retried';
        metrics[key] += 1;
    } else {
        metrics.Failed += 1;
    }
}

/**
 * Wraps a WorkHandler as an Azure Functions Service Bus trigger body: one message per invocation, settled by the
 * adapter through the host's message actions (`autoCompleteMessages` must be false). Retry with backoff schedules a
 * targeted copy and completes the original, exactly as the MJ worker consumer does. A message that could not be
 * settled makes the invocation throw, so the host abandons it and Service Bus redelivers.
 */
export function CreateServiceBusFunctionHandler<TPayload extends WorkJson = WorkJson>(
    handlerFactory: () => WorkHandler<TPayload>,
    options: ServiceBusFunctionHandlerOptions = {},
): ServiceBusFunctionHandler {
    const now = options.Now ?? Date.now;
    const log = options.Log ?? JSON_LOGGER;
    const emit = options.EmitMetrics ?? ((line: string) => console.log(line));
    const safetyMs = options.TimeoutSafetyMs ?? 10_000;
    let initialized: { Binding: SubscriptionBinding; Sender: ServiceBusSender } | null = null;

    const initialize = (): { Binding: SubscriptionBinding; Sender: ServiceBusSender } => {
        if (initialized === null) {
            const binding = options.Binding ?? ParseSubscriptionBindingEnv((options.Env ?? process.env)[SUBSCRIPTION_ENV_VAR]);
            const config = ReadAzureSubscriptionConfig(binding.Config);
            const sender = options.Sender ?? new SdkServiceBusGateway(CreateServiceBusClient({ FullyQualifiedNamespace: config.FullyQualifiedNamespace }, options.Credential));
            initialized = { Binding: binding, Sender: sender };
        }
        return initialized;
    };

    return async (message, context) => {
        const { Binding: binding, Sender: sender } = initialize();
        const started = now();
        const receiver = `fn:${context.invocationId ?? started}`;
        const gateway = new FunctionMessageGateway(message, context.actions, sender);
        const consumer = new ServiceBusTransportConsumer<TPayload>(gateway, binding, { Now: now });
        const runtime = new ConsumerRuntime<TPayload>(consumer, handlerFactory, binding.Policy,
            { Concurrency: 1, ReceiveBatchSize: 1, IdlePollMinMs: 0, IdlePollMaxMs: 0, ShutdownDrainMs: 0 }, log, now);
        const metrics: InvocationMetrics = { Processed: 0, Completed: 0, Retried: 0, DeadLettered: 0, Failed: 0, DurationMs: 0 };
        const remaining = context.remainingTimeMs ? context.remainingTimeMs() : null;
        const timer = remaining === null ? null : setTimeout(() => { void runtime.Stop(); }, Math.max(0, remaining - safetyMs));
        let result: SettleResult | undefined;
        try {
            const delivery = await consumer.Adopt(ToReceivedEnvelope(message, receiver));
            if (delivery === null) {
                metrics.DeadLettered += 1;
                metrics.Processed += 1;
                return;
            }
            [result] = await runtime.ProcessBatch([delivery]);
            tally(metrics, result);
        } finally {
            if (timer !== null) {
                clearTimeout(timer);
            }
            metrics.DurationMs = now() - started;
            emit(FormatMetricsLine(binding.Policy.SubscriptionName, metrics, now()));
        }
        if (result?.Kind !== 'Settled') {
            throw new UnsettledMessageError(result);
        }
    };
}
