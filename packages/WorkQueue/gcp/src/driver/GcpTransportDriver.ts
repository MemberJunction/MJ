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
import type { GcpTransportConfig } from '../config';
import { PubSubMessagePump, type PubSubMessagePumpOptions } from '../consumer/PubSubMessagePump';
import { PubSubTransportConsumer } from '../consumer/PubSubTransportConsumer';
import { CreatePubSubAdminClients } from '../gateway/adminClient';
import { CreatePubSubDataClients, type GcpCredentialsOption } from '../gateway/pubSubClient';
import type {
    EnsureGcpSubscriptionOptions,
    EnsureGcpTopicOptions,
    GcpSubscriptionProperties,
    GcpTopicProperties,
    PubSubAdminGateway,
} from '../gateway/PubSubAdminGateway';
import type { PubSubGateway } from '../gateway/PubSubGateway';
import { SdkPubSubAdminGateway } from '../gateway/SdkPubSubAdminGateway';
import { SdkPubSubGateway } from '../gateway/SdkPubSubGateway';
import { GcpTransportOperator } from '../operator/GcpTransportOperator';
import { ValidateGcpBindings } from './bindingValidation';
import { GCP_TRANSPORT_CAPABILITIES, GCP_TRANSPORT_NAME } from './capabilities';
import { PublishToPubSub } from './publish';

export interface GcpTransportHealthReport {
    Healthy: boolean;
    ProjectId: string;
    Error?: string;
}

export class GcpTransportDriver implements ITransportDriver {
    public readonly Name = GCP_TRANSPORT_NAME;
    public readonly Capabilities: TransportCapabilities = GCP_TRANSPORT_CAPABILITIES;
    private readonly now: () => number;
    private readonly projectId: string;
    private readonly closeAdmin?: () => Promise<void>;
    private operator: GcpTransportOperator | null = null;

    constructor(
        public readonly Gateway: PubSubGateway,
        public readonly Admin: PubSubAdminGateway,
        options: { Now?: () => number; ProjectId?: string; CloseAdmin?: () => Promise<void> } = {},
    ) {
        this.now = options.Now ?? Date.now;
        this.projectId = options.ProjectId ?? 'unknown-project';
        this.closeAdmin = options.CloseAdmin;
    }

    public static Create(config: GcpTransportConfig, credentials?: GcpCredentialsOption): GcpTransportDriver {
        const dataBundle = CreatePubSubDataClients(config, credentials);
        const adminBundle = CreatePubSubAdminClients(config, credentials);
        return new GcpTransportDriver(
            new SdkPubSubGateway({
                ProjectId: dataBundle.ProjectId,
                Publisher: dataBundle.Publisher,
                Subscriber: dataBundle.Subscriber,
                Close: () => dataBundle.Close(),
            }),
            new SdkPubSubAdminGateway({
                ProjectId: adminBundle.ProjectId,
                Publisher: adminBundle.Publisher,
                Subscriber: adminBundle.Subscriber,
                Close: () => adminBundle.Close(),
            }),
            {
                ProjectId: dataBundle.ProjectId,
                CloseAdmin: () => adminBundle.Close(),
            },
        );
    }

    public Publish(
        topic: TopicBinding,
        messages: WorkMessage[],
        _subscriptions: SubscriptionBinding[],
        _opts?: DatabasePublishOptions,
    ): Promise<PublishResult[]> {
        return PublishToPubSub(this.Gateway, topic, messages);
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        return new PubSubTransportConsumer<TPayload>(this.Gateway, subscription, { Now: this.now });
    }

    public OpenMessagePump<TPayload extends WorkJson>(
        subscription: SubscriptionBinding,
        handlerFactory: () => WorkHandler<TPayload>,
        options: PubSubMessagePumpOptions = {},
    ): PubSubMessagePump<TPayload> {
        return new PubSubMessagePump<TPayload>(this.Gateway, subscription, handlerFactory, {
            Now: this.now,
            ...options,
        });
    }

    public Operator(): ITransportOperator {
        this.operator ??= new GcpTransportOperator(this.Gateway, this.Admin, { Now: this.now });
        return this.operator;
    }

    public ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        return ValidateGcpBindings(this.Admin, topic, subscriptions);
    }

    /** Idempotently provisions a Google Cloud Pub/Sub topic. */
    public EnsureTopic(topicName: string, options?: EnsureGcpTopicOptions): Promise<GcpTopicProperties> {
        return this.Admin.EnsureTopic(topicName, options);
    }

    /** Idempotently provisions a Google Cloud Pub/Sub subscription with optional filter, ordering, and dead-letter policy. */
    public EnsureSubscription(
        topicName: string,
        subscriptionName: string,
        options?: EnsureGcpSubscriptionOptions,
    ): Promise<GcpSubscriptionProperties> {
        return this.Admin.EnsureSubscription(topicName, subscriptionName, options);
    }

    public DeleteTopic(topicName: string): Promise<boolean> {
        return this.Admin.DeleteTopic(topicName);
    }

    public DeleteSubscription(subscriptionName: string): Promise<boolean> {
        return this.Admin.DeleteSubscription(subscriptionName);
    }

    /** Verifies connectivity and management access to the configured Google Cloud Pub/Sub project. */
    public async CheckHealth(): Promise<GcpTransportHealthReport> {
        try {
            const healthy = await this.Admin.CheckHealth();
            return {
                Healthy: healthy,
                ProjectId: this.projectId,
                ...(healthy ? {} : { Error: 'Pub/Sub CheckHealth returned false' }),
            };
        } catch (error) {
            return {
                Healthy: false,
                ProjectId: this.projectId,
                Error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public async Close(): Promise<void> {
        await this.Gateway.Close();
        if (this.closeAdmin) {
            await this.closeAdmin();
        }
    }
}
