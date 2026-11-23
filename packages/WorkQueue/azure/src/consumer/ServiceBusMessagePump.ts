import {
    ConsumerRuntime,
    NULL_WORK_LOGGER,
    type ConsumerRuntimeOptions,
    type SubscriptionBinding,
    type WorkHandler,
    type WorkJson,
    type WorkLogger,
} from '@memberjunction/work-queue-core';
import type { ServiceBusGateway } from '../gateway/ServiceBusGateway';
import { ServiceBusTransportConsumer, type ServiceBusConsumerOptions } from './ServiceBusTransportConsumer';

export interface ServiceBusMessagePumpOptions {
    Concurrency?: number;
    ReceiveBatchSize?: number;
    ReceiveWaitSeconds?: number;
    IdlePollMinMs?: number;
    IdlePollMaxMs?: number;
    ShutdownDrainMs?: number;
    LeaseExpiryGraceMs?: number;
    Log?: WorkLogger;
    Now?: () => number;
    OnAdoptError?: ServiceBusConsumerOptions['OnAdoptError'];
}

const DEFAULT_PUMP_RUNTIME_OPTIONS: Required<Pick<ConsumerRuntimeOptions, 'Concurrency' | 'ReceiveBatchSize' | 'ReceiveWaitSeconds' | 'IdlePollMinMs' | 'IdlePollMaxMs' | 'ShutdownDrainMs'>> = {
    Concurrency: 5,
    ReceiveBatchSize: 10,
    ReceiveWaitSeconds: 5,
    IdlePollMinMs: 100,
    IdlePollMaxMs: 2000,
    ShutdownDrainMs: 8000,
};

/**
 * Standalone Azure Service Bus message pump with bounded concurrency, automatic lock renewal,
 * retry/dead-letter handling, structured logging, and graceful drain/shutdown.
 */
export class ServiceBusMessagePump<TPayload extends WorkJson = WorkJson> {
    private readonly consumer: ServiceBusTransportConsumer<TPayload>;
    private readonly runtime: ConsumerRuntime<TPayload>;

    constructor(
        gateway: ServiceBusGateway,
        binding: SubscriptionBinding,
        handlerFactory: () => WorkHandler<TPayload>,
        options: ServiceBusMessagePumpOptions = {},
    ) {
        const now = options.Now ?? Date.now;
        const log = options.Log ?? NULL_WORK_LOGGER;
        this.consumer = new ServiceBusTransportConsumer<TPayload>(gateway, binding, {
            Now: now,
            OnAdoptError: options.OnAdoptError,
        });
        const runtimeOptions: ConsumerRuntimeOptions = {
            Concurrency: options.Concurrency ?? DEFAULT_PUMP_RUNTIME_OPTIONS.Concurrency,
            ReceiveBatchSize: options.ReceiveBatchSize ?? DEFAULT_PUMP_RUNTIME_OPTIONS.ReceiveBatchSize,
            ReceiveWaitSeconds: options.ReceiveWaitSeconds ?? DEFAULT_PUMP_RUNTIME_OPTIONS.ReceiveWaitSeconds,
            IdlePollMinMs: options.IdlePollMinMs ?? DEFAULT_PUMP_RUNTIME_OPTIONS.IdlePollMinMs,
            IdlePollMaxMs: options.IdlePollMaxMs ?? DEFAULT_PUMP_RUNTIME_OPTIONS.IdlePollMaxMs,
            ShutdownDrainMs: options.ShutdownDrainMs ?? DEFAULT_PUMP_RUNTIME_OPTIONS.ShutdownDrainMs,
            ...(options.LeaseExpiryGraceMs !== undefined ? { LeaseExpiryGraceMs: options.LeaseExpiryGraceMs } : {}),
        };
        this.runtime = new ConsumerRuntime<TPayload>(
            this.consumer,
            handlerFactory,
            binding.Policy,
            runtimeOptions,
            log,
            now,
        );
    }

    public get IsRunning(): boolean {
        return this.runtime.IsRunning;
    }

    public get InFlightCount(): number {
        return this.runtime.InFlightCount;
    }

    public Start(): void {
        this.runtime.Start();
    }

    public Kick(): void {
        this.runtime.Kick();
    }

    public async Stop(): Promise<void> {
        await this.runtime.Stop();
        await this.consumer.Close();
    }
}
