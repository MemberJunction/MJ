import type {
    BindingValidationIssue, DatabasePublishOptions, ITransportConsumer, ITransportDriver, ITransportOperator, PublishResult, SubscriptionBinding,
    TopicBinding, TransportCapabilities, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import type { AzureTransportConfig } from '../config';
import { ServiceBusTransportConsumer } from '../consumer/ServiceBusTransportConsumer';
import { CreateServiceBusAdminClient, CreateServiceBusClient, type AzureCredentialOption } from '../gateway/clients';
import { SdkServiceBusAdminGateway } from '../gateway/SdkServiceBusAdminGateway';
import { SdkServiceBusGateway } from '../gateway/SdkServiceBusGateway';
import type { ServiceBusAdminGateway } from '../gateway/ServiceBusAdminGateway';
import type { ServiceBusGateway } from '../gateway/ServiceBusGateway';
import { AzureTransportOperator } from '../operator/AzureTransportOperator';
import { ValidateAzureBindings } from './bindingValidation';
import { AZURE_TRANSPORT_CAPABILITIES, AZURE_TRANSPORT_NAME } from './capabilities';
import { PublishToServiceBus } from './publish';

export class AzureTransportDriver implements ITransportDriver {
    public readonly Name = AZURE_TRANSPORT_NAME;
    public readonly Capabilities: TransportCapabilities = AZURE_TRANSPORT_CAPABILITIES;
    private readonly now: () => number;
    private operator: AzureTransportOperator | null = null;

    constructor(public readonly Bus: ServiceBusGateway, public readonly Admin: ServiceBusAdminGateway, options: { Now?: () => number } = {}) {
        this.now = options.Now ?? Date.now;
    }

    /** SDK-backed driver; an undefined credential uses DefaultAzureCredential (managed identity first). */
    public static Create(config: AzureTransportConfig, credential?: AzureCredentialOption): AzureTransportDriver {
        return new AzureTransportDriver(
            new SdkServiceBusGateway(CreateServiceBusClient(config, credential)),
            new SdkServiceBusAdminGateway(CreateServiceBusAdminClient(config, credential)),
        );
    }

    public Publish(topic: TopicBinding, messages: WorkMessage[], _subscriptions: SubscriptionBinding[], _opts?: DatabasePublishOptions): Promise<PublishResult[]> {
        return PublishToServiceBus(this.Bus, topic, messages);
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        return new ServiceBusTransportConsumer<TPayload>(this.Bus, subscription, { Now: this.now });
    }

    public Operator(): ITransportOperator {
        this.operator ??= new AzureTransportOperator(this.Bus, this.Admin, { Now: this.now });
        return this.operator;
    }

    public ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        return ValidateAzureBindings(this.Admin, topic, subscriptions);
    }
}
