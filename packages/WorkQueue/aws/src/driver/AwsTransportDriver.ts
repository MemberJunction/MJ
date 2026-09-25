import type {
    BindingValidationIssue, DatabasePublishOptions, ITransportConsumer, ITransportDriver, ITransportOperator,
    PublishResult, SubscriptionBinding, TopicBinding, TransportCapabilities, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import type { AwsTransportConfig } from '../config';
import { SqsTransportConsumer } from '../consumer/SqsTransportConsumer';
import { CreateSqsClient, type AwsCredentialsOption } from '../gateway/sqsClient';
import { CreateSnsClient } from '../gateway/snsClient';
import { SdkSnsGateway } from '../gateway/SdkSnsGateway';
import { SdkSqsGateway } from '../gateway/SdkSqsGateway';
import type { SnsGateway } from '../gateway/SnsGateway';
import type { SqsGateway } from '../gateway/SqsGateway';
import { AwsTransportOperator } from '../operator/AwsTransportOperator';
import { ValidateAwsBindings } from './bindingValidation';
import { AWS_TRANSPORT_CAPABILITIES, AWS_TRANSPORT_NAME } from './capabilities';
import { PublishToSns } from './publish';

export class AwsTransportDriver implements ITransportDriver {
    public readonly Name = AWS_TRANSPORT_NAME;
    public readonly Capabilities: TransportCapabilities = AWS_TRANSPORT_CAPABILITIES;
    private readonly now: () => number;
    private operator: AwsTransportOperator | null = null;

    constructor(public readonly Sns: SnsGateway, public readonly Sqs: SqsGateway, options: { Now?: () => number } = {}) {
        this.now = options.Now ?? Date.now;
    }

    public static Create(config: AwsTransportConfig, credentials?: AwsCredentialsOption): AwsTransportDriver {
        return new AwsTransportDriver(
            new SdkSnsGateway(CreateSnsClient(config, credentials)),
            new SdkSqsGateway(CreateSqsClient(config, credentials)),
        );
    }

    public Publish(topic: TopicBinding, messages: WorkMessage[], _subscriptions: SubscriptionBinding[], _opts?: DatabasePublishOptions): Promise<PublishResult[]> {
        return PublishToSns(this.Sns, topic, messages);
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        return new SqsTransportConsumer<TPayload>(this.Sqs, subscription, { Now: this.now });
    }

    public Operator(): ITransportOperator {
        this.operator ??= new AwsTransportOperator(this.Sqs, { Now: this.now });
        return this.operator;
    }

    public ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        return ValidateAwsBindings(this.Sns, this.Sqs, topic, subscriptions);
    }
}
