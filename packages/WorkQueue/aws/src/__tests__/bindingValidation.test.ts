import { describe, it, expect, beforeEach } from 'vitest';
import { ExpectedMaxReceiveCount, RequiresFifoTopic, ValidateAwsBindings } from '../driver/bindingValidation';
import { FakeSnsGateway, FakeSqsGateway } from '../testing/fakes';
import { SeedValidAwsResources, TestAwsResources, TestPolicy, TestSubscriptionBinding, TestTopicBinding } from '../testing/fixtures';

let sns: FakeSnsGateway;
let sqs: FakeSqsGateway;

beforeEach(() => {
    sns = new FakeSnsGateway();
    sqs = new FakeSqsGateway();
});

function messages(issues: { Severity: string; Message: string }[]): string[] {
    return issues.map((issue) => `${issue.Severity}: ${issue.Message}`);
}

describe('ExpectedMaxReceiveCount and RequiresFifoTopic', () => {
    it('uses MaxAttempts + 5 for every queue', () => {
        expect(ExpectedMaxReceiveCount(TestPolicy({ MaxAttempts: 5, PartitionMode: 'Exclusive' }))).toBe(10);
        expect(ExpectedMaxReceiveCount(TestPolicy({ MaxAttempts: 1, PartitionMode: 'None' }))).toBe(6);
    });

    it('requires FIFO as soon as one subscription is Exclusive', () => {
        const none = TestSubscriptionBinding(false, { Policy: { PartitionMode: 'None' } });
        expect(RequiresFifoTopic([none])).toBe(false);
        expect(RequiresFifoTopic([none, TestSubscriptionBinding(false, { Policy: { PartitionMode: 'Exclusive' } })])).toBe(true);
    });
});

describe('ValidateAwsBindings', () => {
    it('reports nothing for resources provisioned as expected', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'unsubscribe' }] } });
        SeedValidAwsResources(sns, sqs, topic, subscription);
        expect(await ValidateAwsBindings(sns, sqs, topic, [subscription])).toEqual([]);
    });

    it('reports an unbound topic and a missing topic', async () => {
        const unbound = await ValidateAwsBindings(sns, sqs, TestTopicBinding(true, { Config: {} }), []);
        expect(messages(unbound)).toEqual([expect.stringMatching(/^Error: TopicUnbound: .*'SnsTopicArn'/)]);
        const missing = await ValidateAwsBindings(sns, sqs, TestTopicBinding(true), []);
        expect(messages(missing)).toEqual([`Error: SNS topic ${TestAwsResources(true).TopicArn} does not exist`]);
    });

    it('reports a FIFO mismatch and a partitioned subscription on a standard topic', async () => {
        const topic = TestTopicBinding(false);
        const subscription = TestSubscriptionBinding(false, { Policy: { PartitionMode: 'Exclusive' } });
        SeedValidAwsResources(sns, sqs, topic, subscription);
        sns.TopicAttributes.set(TestAwsResources(false).TopicArn, { FifoTopic: 'true' });
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            'Error: SNS topic FifoTopic is true but the topic binding says IsFifo false',
            'Error: Topic must be FIFO: it has an Exclusive subscription (03 W7)',
        ]);
    });

    it('reports missing queues', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true);
        sns.TopicAttributes.set(TestAwsResources(true).TopicArn, { FifoTopic: 'true' });
        const issues = messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]));
        expect(issues).toContain(`Error: SQS queue ${TestAwsResources(true).QueueUrl} does not exist`);
        expect(issues).toContain(`Error: SQS dead-letter queue ${TestAwsResources(true).DeadLetterQueueUrl} does not exist`);
    });

    it('rejects an Ordered subscription: Ordered requires the Database transport', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Policy: { PartitionMode: 'Ordered' } });
        SeedValidAwsResources(sns, sqs, topic, subscription);
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            'Error: Ordered requires the Database transport; this subscription cannot run on the AWS transport',
        ]);
    });

    it('reports a redrive policy that targets the wrong queue, and warns about a drifted count', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Policy: { MaxAttempts: 5 } });
        const resources = TestAwsResources(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        sqs.AddQueue(resources.QueueUrl, {
            Fifo: true, VisibilityTimeoutSeconds: 60,
            Attributes: { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: 'arn:aws:sqs:us-east-1:123456789012:other.fifo', maxReceiveCount: 7 }), MaximumMessageSize: '262144' },
        });
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            `Error: Redrive policy targets arn:aws:sqs:us-east-1:123456789012:other.fifo, expected ${resources.DeadLetterQueueArn}`,
            'Warning: Redrive maxReceiveCount is 7 but the policy expects 10 (MaxAttempts + 5): policy drift — re-apply Terraform',
        ]);
    });

    it('warns about a short visibility timeout and a small maximum message size', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Policy: { LeaseSeconds: 120 } });
        const resources = TestAwsResources(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        sqs.AddQueue(resources.QueueUrl, {
            Fifo: true, VisibilityTimeoutSeconds: 60,
            Attributes: { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: resources.DeadLetterQueueArn, maxReceiveCount: 10 }), MaximumMessageSize: '65536' },
        });
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            'Warning: Queue VisibilityTimeout 60 is below LeaseSeconds 120',
            'Warning: Queue MaximumMessageSize 65536 is below 262144',
        ]);
    });

    it('reports SNS subscription drift', async () => {
        const topic = TestTopicBinding(true);
        const subscription = TestSubscriptionBinding(true, { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'unsubscribe' }] } });
        const resources = TestAwsResources(true);
        SeedValidAwsResources(sns, sqs, topic, subscription);
        sns.SubscriptionAttributes.set(resources.SnsSubscriptionArn, {
            RawMessageDelivery: 'false', Endpoint: 'arn:aws:sqs:us-east-1:123456789012:elsewhere.fifo', TopicArn: resources.TopicArn,
            FilterPolicy: '{"eventType":["click"]}',
        });
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [subscription]))).toEqual([
            'Error: SNS subscription RawMessageDelivery must be true',
            `Error: SNS subscription endpoint is arn:aws:sqs:us-east-1:123456789012:elsewhere.fifo, expected ${resources.QueueArn}`,
            'Error: SNS filter policy {"eventType":["click"]} differs from the subscription filter {"eventType":["unsubscribe"]}',
        ]);
    });

    it('only warns when the SNS subscription ARN is not bound', async () => {
        const topic = TestTopicBinding(true);
        const bound = TestSubscriptionBinding(true);
        SeedValidAwsResources(sns, sqs, topic, bound);
        const { SnsSubscriptionArn: _omitted, ...config } = bound.Config;
        const unbound = { ...bound, Config: config };
        expect(messages(await ValidateAwsBindings(sns, sqs, topic, [unbound]))).toEqual([
            'Warning: SnsSubscriptionArn is not bound; raw delivery and filter policy were not checked',
        ]);
    });
});
