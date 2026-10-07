import { describe, it, expect, vi } from 'vitest';
import { GetSubscriptionAttributesCommand, GetTopicAttributesCommand, PublishBatchCommand, SNSClient } from '@aws-sdk/client-sns';
import { SdkSnsGateway } from '../gateway/SdkSnsGateway';

const TOPIC = 'arn:aws:sns:us-east-1:123456789012:mj-wq-prod-email-events';
const SUBSCRIPTION = `${TOPIC}:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0`;

/** An SNSClient whose send is scripted. Test-only cast: SNSClient['send'] is heavily overloaded. */
function harness(respond: (command: object) => object): { Gateway: SdkSnsGateway; Commands: object[] } {
    const commands: object[] = [];
    const client = new SNSClient({ region: 'us-east-1' });
    const send = vi.fn(async (command: object) => {
        commands.push(command);
        return respond(command);
    });
    client.send = send as unknown as SNSClient['send'];
    return { Gateway: new SdkSnsGateway(client), Commands: commands };
}

function awsError(name: string): Error {
    const error = new Error(name);
    error.name = name;
    return error;
}

describe('SdkSnsGateway.PublishBatch', () => {
    it('maps entries to the SDK request', async () => {
        const { Gateway, Commands } = harness(() => ({ Successful: [{ Id: '0' }], Failed: [] }));
        await Gateway.PublishBatch(TOPIC, [{ Id: '0', Message: '{}', MessageAttributes: { eventType: 'click' }, MessageGroupId: 'g', MessageDeduplicationId: 'd' }]);
        expect(Commands[0]).toBeInstanceOf(PublishBatchCommand);
        expect((Commands[0] as PublishBatchCommand).input).toEqual({
            TopicArn: TOPIC,
            PublishBatchRequestEntries: [{
                Id: '0', Message: '{}', MessageGroupId: 'g', MessageDeduplicationId: 'd',
                MessageAttributes: { eventType: { DataType: 'String', StringValue: 'click' } },
            }],
        });
    });

    it('reports published, failed and unreported entries per ID', async () => {
        const { Gateway } = harness(() => ({
            Successful: [{ Id: '0' }],
            Failed: [{ Id: '1', Code: 'InvalidParameter', Message: 'bad attribute', SenderFault: true }],
        }));
        const entries = ['0', '1', '2'].map((Id) => ({ Id, Message: '{}', MessageAttributes: {} }));
        expect(await Gateway.PublishBatch(TOPIC, entries)).toEqual([
            { Id: '0', Kind: 'Published' },
            { Id: '1', Kind: 'Failed', Code: 'InvalidParameter', Message: 'bad attribute', SenderFault: true },
            { Id: '2', Kind: 'Failed', Code: 'Unreported', Message: 'SNS reported no result for this entry', SenderFault: false },
        ]);
    });

    it('throws a retryable error when the whole call is throttled', async () => {
        const { Gateway } = harness(() => { throw awsError('Throttling'); });
        await expect(Gateway.PublishBatch(TOPIC, [{ Id: '0', Message: '{}', MessageAttributes: {} }]))
            .rejects.toMatchObject({ Code: 'Throttling', Retryable: true });
    });
});

describe('SdkSnsGateway attributes', () => {
    it('reads topic attributes, or null for a missing topic', async () => {
        const { Gateway, Commands } = harness(() => ({ Attributes: { FifoTopic: 'true' } }));
        expect(await Gateway.GetTopicAttributes(TOPIC)).toEqual({ FifoTopic: 'true' });
        expect(Commands[0]).toBeInstanceOf(GetTopicAttributesCommand);
        expect(await harness(() => { throw awsError('NotFoundException'); }).Gateway.GetTopicAttributes(TOPIC)).toBeNull();
    });

    it('reads subscription attributes, or null for a missing subscription', async () => {
        const { Gateway, Commands } = harness(() => ({ Attributes: { RawMessageDelivery: 'true' } }));
        expect(await Gateway.GetSubscriptionAttributes(SUBSCRIPTION)).toEqual({ RawMessageDelivery: 'true' });
        expect(Commands[0]).toBeInstanceOf(GetSubscriptionAttributesCommand);
        expect(await harness(() => { throw awsError('NotFound'); }).Gateway.GetSubscriptionAttributes(SUBSCRIPTION)).toBeNull();
    });
});
