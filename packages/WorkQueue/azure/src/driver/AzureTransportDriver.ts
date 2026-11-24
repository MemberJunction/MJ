import type {
    BindingValidationIssue,
    DatabasePublishOptions,
    ITransportConsumer,
    ITransportDriver,
    ITransportOperator,
    PublishResult,
    SubscriptionBinding,
    TopicBinding,
    TransportCapabilities,
    WorkHandler,
    WorkJson,
    WorkMessage,
} from '@memberjunction/work-queue-core';
import type { AzureTransportConfig } from '../config';
import { ServiceBusMessagePump, type ServiceBusMessagePumpOptions } from '../consumer/ServiceBusMessagePump';
import { ServiceBusTransportConsumer } from '../consumer/ServiceBusTransportConsumer';
import { CreateServiceBusAdminClient } from '../gateway/adminClient';
import { SdkServiceBusAdminGateway } from '../gateway/SdkServiceBusAdminGateway';
import { SdkServiceBusGateway } from '../gateway/SdkServiceBusGateway';
import type {
    AzureSubscriptionProperties,
    AzureTopicProperties,
    EnsureAzureSubscriptionOptions,
    EnsureAzureTopicOptions,
    ServiceBusAdminGateway,
} from '../gateway/ServiceBusAdminGateway';
import type { ServiceBusGateway } from '../gateway/ServiceBusGateway';
import { CreateServiceBusClient, type AzureCredentialsOption } from '../gateway/serviceBusClient';
import { AzureTransportOperator } from '../operator/AzureTransportOperator';
import { ValidateAzureBindings } from './bindingValidation';
import { AZURE_TRANSPORT_CAPABILITIES, AZURE_TRANSPORT_NAME } from './capabilities';
import { PublishToServiceBus } from './publish';

export interface AzureTransportHealthReport {
    Healthy: boolean;
    Namespace: string | null;
    MessagingSku: 'Basic' | 'Standard' | 'Premium' | null;
    Error?: string;
}

export class AzureTransportDriver implements ITransportDriver {
    public readonly Name = AZURE_TRANSPORT_NAME;
    public readonly Capabilities: TransportCapabilities = AZURE_TRANSPORT_CAPABILITIES;
    private readonly now: () => number;
    private operator: AzureTransportOperator | null = null;

    constructor(
        public readonly Gateway: ServiceBusGateway,
        public readonly Admin: ServiceBusAdminGateway,
        options: { Now?: () => number } = {},
    ) {
        this.now = options.Now ?? Date.now;
    }

    public static Create(config: AzureTransportConfig, credentials?: AzureCredentialsOption): AzureTransportDriver {
        return new AzureTransportDriver(
            new SdkServiceBusGateway(CreateServiceBusClient(config, credentials)),
            new SdkServiceBusAdminGateway(CreateServiceBusAdminClient(config, credentials)),
        );
    }

    public Publish(
        topic: TopicBinding,
        messages: WorkMessage[],
        _subscriptions: SubscriptionBinding[],
        _opts?: DatabasePublishOptions,
    ): Promise<PublishResult[]> {
        return PublishToServiceBus(this.Gateway, topic, messages);
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        return new ServiceBusTransportConsumer<TPayload>(this.Gateway, subscription, { Now: this.now });
    }

    public OpenMessagePump<TPayload extends WorkJson>(
        subscription: SubscriptionBinding,
        handlerFactory: () => WorkHandler<TPayload>,
        options: ServiceBusMessagePumpOptions = {},
    ): ServiceBusMessagePump<TPayload> {
        return new ServiceBusMessagePump<TPayload>(this.Gateway, subscription, handlerFactory, {
            Now: this.now,
            ...options,
        });
    }

    public Operator(): ITransportOperator {
        this.operator ??= new AzureTransportOperator(this.Gateway, this.Admin, { Now: this.now });
        return this.operator;
    }

    public ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        return ValidateAzureBindings(this.Admin, topic, subscriptions);
    }

    /** Idempotently provisions an Azure Service Bus topic. */
    public EnsureTopic(topicName: string, options?: EnsureAzureTopicOptions): Promise<AzureTopicProperties> {
        return this.Admin.EnsureTopic(topicName, options);
    }

    /** Idempotently provisions an Azure Service Bus subscription and optional SQL filter rule. */
    public EnsureSubscription(
        topicName: string,
        subscriptionName: string,
        options?: EnsureAzureSubscriptionOptions,
    ): Promise<AzureSubscriptionProperties> {
        return this.Admin.EnsureSubscription(topicName, subscriptionName, options);
    }

    public DeleteTopic(topicName: string): Promise<boolean> {
        return this.Admin.DeleteTopic(topicName);
    }

    public DeleteSubscription(topicName: string, subscriptionName: string): Promise<boolean> {
        return this.Admin.DeleteSubscription(topicName, subscriptionName);
    }

    /** Verifies connectivity and management access to the configured Service Bus namespace. */
    public async CheckHealth(): Promise<AzureTransportHealthReport> {
        try {
            const props = await this.Admin.GetNamespaceProperties();
            return {
                Healthy: true,
                Namespace: props.Name,
                MessagingSku: props.MessagingSku,
            };
        } catch (error) {
            return {
                Healthy: false,
                Namespace: null,
                MessagingSku: null,
                Error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public async Close(): Promise<void> {
        await this.Gateway.Close();
    }
}
