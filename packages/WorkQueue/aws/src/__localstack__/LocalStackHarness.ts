import { CreateTopicCommand, DeleteTopicCommand, SNSClient, SubscribeCommand } from '@aws-sdk/client-sns';
import { CreateQueueCommand, DeleteQueueCommand, GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { ITransportDriver, SubscriptionBinding, TopicBinding } from '@memberjunction/work-queue-core';
import { BuildSubscriptionBinding, BuildTopicBinding, type ConformanceHarness, type ConformanceTraits, type SubscriptionBindingOverrides } from '@memberjunction/work-queue-core/testing';
import { ExpectedMaxReceiveCount } from '../driver/bindingValidation';
import { AWS_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { AwsTransportDriver } from '../driver/AwsTransportDriver';
import { SnsFilterPolicyFor } from '../filterPolicy';
import { AwsResourceName } from '../names';

const ENDPOINT = process.env.LOCALSTACK_ENDPOINT ?? 'http://localhost:4566';
const REGION = 'us-east-1';
const CREDENTIALS = { accessKeyId: 'test', secretAccessKey: 'test' };

interface Created {
    Topics: string[];
    Queues: string[];
}

export class LocalStackHarness implements ConformanceHarness {
    public readonly Capabilities = AWS_TRANSPORT_CAPABILITIES;
    public readonly Traits: ConformanceTraits = {
        ReleaseConsumesAttempt: true,
        ExpiredLeaseDeadLetters: false,
        ReceiveWaitSeconds: 2,
        // LocalStack keeps accepting a receipt handle after its visibility timeout expired and the message was
        // re-received, so a stale lease is never fenced there. Real SQS FIFO rejects it ("The receipt handle has
        // expired"), which SdkSqsGateway maps to LeaseLost / Lost. Confirm against AWS, not here (README, Testing).
        EnvironmentSkips: {
            C07: 'LocalStack does not expire SQS receipt handles, so a stale lease token is not fenced',
            C09: 'LocalStack does not expire SQS receipt handles, so extending a lost lease still succeeds',
        },
    };
    private readonly sns = new SNSClient({ region: REGION, endpoint: ENDPOINT, credentials: CREDENTIALS });
    private readonly sqs = new SQSClient({ region: REGION, endpoint: ENDPOINT, credentials: CREDENTIALS });
    private readonly created = new WeakMap<ITransportDriver, Created>();

    public async CreateDriver(): Promise<ITransportDriver> {
        const driver = AwsTransportDriver.Create({ Region: REGION, Endpoint: ENDPOINT }, CREDENTIALS);
        this.created.set(driver, { Topics: [], Queues: [] });
        return driver;
    }

    public async CreateTopic(driver: ITransportDriver, name: string, overrides: Partial<TopicBinding> = {}): Promise<TopicBinding> {
        const binding = BuildTopicBinding(name, overrides);
        const output = await this.sns.send(new CreateTopicCommand({
            Name: AwsResourceName('wqc', 'ls', name, 'Topic', binding.IsFifo),
            Attributes: binding.IsFifo ? { FifoTopic: 'true', ContentBasedDeduplication: 'false' } : {},
        }));
        const arn = this.required(output.TopicArn, 'TopicArn');
        this.track(driver).Topics.push(arn);
        return { ...binding, Config: { SnsTopicArn: arn } };
    }

    public async CreateSubscription(driver: ITransportDriver, topic: TopicBinding, name: string, overrides: SubscriptionBindingOverrides = {}): Promise<SubscriptionBinding> {
        const binding = BuildSubscriptionBinding(topic, name, overrides);
        const fifo = topic.IsFifo ? { FifoQueue: 'true' } : {};
        const dlqUrl = await this.createQueue(driver, AwsResourceName('wqc', 'ls', name, 'DeadLetterQueue', topic.IsFifo), fifo);
        const dlqArn = await this.queueArn(dlqUrl);
        const queueUrl = await this.createQueue(driver, AwsResourceName('wqc', 'ls', name, 'Queue', topic.IsFifo), {
            ...fifo,
            VisibilityTimeout: String(binding.Policy.LeaseSeconds),
            RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: ExpectedMaxReceiveCount(binding.Policy) }),
        });
        const queueArn = await this.queueArn(queueUrl);
        const topicArn = String(topic.Config['SnsTopicArn']);
        const policy = SnsFilterPolicyFor(binding.Filter);
        const subscription = await this.sns.send(new SubscribeCommand({
            TopicArn: topicArn, Protocol: 'sqs', Endpoint: queueArn, ReturnSubscriptionArn: true,
            Attributes: { RawMessageDelivery: 'true', ...(policy ? { FilterPolicy: policy, FilterPolicyScope: 'MessageAttributes' } : {}) },
        }));
        return {
            ...binding,
            Config: {
                Region: REGION, QueueUrl: queueUrl, QueueArn: queueArn, DeadLetterQueueUrl: dlqUrl, DeadLetterQueueArn: dlqArn,
                IsFifo: topic.IsFifo, SnsSubscriptionArn: this.required(subscription.SubscriptionArn, 'SubscriptionArn'),
            },
        };
    }

    public async AdvanceTime(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    public async Dispose(driver: ITransportDriver): Promise<void> {
        const created = this.created.get(driver);
        for (const url of created?.Queues ?? []) {
            await this.sqs.send(new DeleteQueueCommand({ QueueUrl: url }));
        }
        for (const arn of created?.Topics ?? []) {
            await this.sns.send(new DeleteTopicCommand({ TopicArn: arn }));
        }
    }

    private async createQueue(driver: ITransportDriver, name: string, attributes: Record<string, string>): Promise<string> {
        const output = await this.sqs.send(new CreateQueueCommand({ QueueName: name, Attributes: attributes }));
        const url = this.required(output.QueueUrl, 'QueueUrl');
        this.track(driver).Queues.push(url);
        return url;
    }

    private async queueArn(url: string): Promise<string> {
        const output = await this.sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['QueueArn'] }));
        return this.required(output.Attributes?.QueueArn, 'QueueArn');
    }

    private track(driver: ITransportDriver): Created {
        const created = this.created.get(driver);
        if (!created) {
            throw new Error('Driver was not created by this harness');
        }
        return created;
    }

    private required(value: string | undefined, what: string): string {
        if (!value) {
            throw new Error(`LocalStack returned no ${what}`);
        }
        return value;
    }
}
