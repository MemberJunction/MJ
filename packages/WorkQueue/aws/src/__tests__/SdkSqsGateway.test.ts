import { describe, it, expect, vi } from 'vitest';
import {
    ChangeMessageVisibilityCommand, DeleteMessageCommand, GetQueueAttributesCommand, ReceiveMessageCommand,
    SendMessageCommand, SQSClient,
} from '@aws-sdk/client-sqs';
import { SdkSqsGateway } from '../gateway/SdkSqsGateway';
import { AwsGatewayError } from '../gateway/errors';

const URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/mj-wq-prod-email-unsubscribe';

interface Harness {
    Gateway: SdkSqsGateway;
    Commands: object[];
    Options: (object | undefined)[];
}

/** An SQSClient whose send is scripted. Test-only cast: SQSClient['send'] is heavily overloaded. */
function harness(respond: (command: object) => object): Harness {
    const commands: object[] = [];
    const options: (object | undefined)[] = [];
    const client = new SQSClient({ region: 'us-east-1' });
    const send = vi.fn(async (command: object, sendOptions?: object) => {
        commands.push(command);
        options.push(sendOptions);
        return respond(command);
    });
    client.send = send as unknown as SQSClient['send'];
    return { Gateway: new SdkSqsGateway(client), Commands: commands, Options: options };
}

function awsError(name: string, message: string = name): Error {
    const error = new Error(message);
    error.name = name;
    return error;
}

describe('SdkSqsGateway.Receive', () => {
    it('maps received messages and asks for system and message attributes', async () => {
        const signal = new AbortController().signal;
        const { Gateway, Commands, Options } = harness(() => ({
            Messages: [{
                MessageId: 'm-1', ReceiptHandle: 'r-1', Body: '{"v":1}',
                Attributes: { ApproximateReceiveCount: '3', MessageGroupId: 'g-1', SentTimestamp: '1800000000000' },
                MessageAttributes: { mj_replay: { DataType: 'String', StringValue: '1' } },
            }],
        }));
        const received = await Gateway.Receive({ QueueUrl: URL, MaxMessages: 5, WaitTimeSeconds: 20, VisibilityTimeoutSeconds: 60, Signal: signal });
        expect(received).toEqual([{
            MessageId: 'm-1', ReceiptHandle: 'r-1', Body: '{"v":1}', ReceiveCount: 3, MessageGroupId: 'g-1',
            SentTimestamp: 1800000000000, Attributes: { mj_replay: '1' },
        }]);
        expect(Commands[0]).toBeInstanceOf(ReceiveMessageCommand);
        expect((Commands[0] as ReceiveMessageCommand).input).toEqual({
            QueueUrl: URL, MaxNumberOfMessages: 5, WaitTimeSeconds: 20, VisibilityTimeout: 60,
            MessageSystemAttributeNames: ['ApproximateReceiveCount', 'MessageGroupId', 'SentTimestamp'],
            MessageAttributeNames: ['All'],
        });
        expect(Options[0]).toEqual({ abortSignal: signal });
    });

    it('clamps batch size and wait time, and omits a null visibility timeout', async () => {
        const { Gateway, Commands } = harness(() => ({}));
        expect(await Gateway.Receive({ QueueUrl: URL, MaxMessages: 25, WaitTimeSeconds: 30, VisibilityTimeoutSeconds: null })).toEqual([]);
        const input = (Commands[0] as ReceiveMessageCommand).input;
        expect(input.MaxNumberOfMessages).toBe(10);
        expect(input.WaitTimeSeconds).toBe(20);
        expect(input.VisibilityTimeout).toBeUndefined();
    });

    it('returns no messages when the long poll is aborted', async () => {
        const { Gateway } = harness(() => { throw awsError('AbortError'); });
        expect(await Gateway.Receive({ QueueUrl: URL, MaxMessages: 1, WaitTimeSeconds: 20, VisibilityTimeoutSeconds: null })).toEqual([]);
    });
});

describe('SdkSqsGateway writes', () => {
    it('sends with attributes, group and deduplication IDs and returns the MessageId', async () => {
        const { Gateway, Commands } = harness(() => ({ MessageId: 'm-9' }));
        const id = await Gateway.Send({
            QueueUrl: URL, Body: '{}', Attributes: { mj_dead_letter_reason: 'Fatal' },
            MessageGroupId: 'g', MessageDeduplicationId: 'd',
        });
        expect(id).toBe('m-9');
        expect(Commands[0]).toBeInstanceOf(SendMessageCommand);
        expect((Commands[0] as SendMessageCommand).input).toEqual({
            QueueUrl: URL, MessageBody: '{}', MessageGroupId: 'g', MessageDeduplicationId: 'd',
            MessageAttributes: { mj_dead_letter_reason: { DataType: 'String', StringValue: 'Fatal' } },
        });
    });

    it('changes visibility and deletes with the receipt handle', async () => {
        const { Gateway, Commands } = harness(() => ({}));
        expect(await Gateway.ChangeVisibility(URL, 'r-1', 90)).toBe(true);
        expect(await Gateway.Delete(URL, 'r-1')).toBe(true);
        expect(Commands[0]).toBeInstanceOf(ChangeMessageVisibilityCommand);
        expect((Commands[0] as ChangeMessageVisibilityCommand).input).toEqual({ QueueUrl: URL, ReceiptHandle: 'r-1', VisibilityTimeout: 90 });
        expect(Commands[1]).toBeInstanceOf(DeleteMessageCommand);
    });

    it('reports a stale receipt handle as false', async () => {
        expect(await harness(() => { throw awsError('ReceiptHandleIsInvalid'); }).Gateway.Delete(URL, 'r')).toBe(false);
        expect(await harness(() => { throw awsError('MessageNotInflight'); }).Gateway.ChangeVisibility(URL, 'r', 1)).toBe(false);
        const expired = awsError('InvalidParameterValue', 'Value r for parameter ReceiptHandle is invalid. Reason: The receipt handle has expired.');
        expect(await harness(() => { throw expired; }).Gateway.Delete(URL, 'r')).toBe(false);
    });

    it('throws AwsGatewayError for other failures', async () => {
        const throttled = harness(() => { throw awsError('ThrottlingException'); });
        await expect(throttled.Gateway.Send({ QueueUrl: URL, Body: '{}' })).rejects.toMatchObject({ Code: 'ThrottlingException', Retryable: true });
        const denied = harness(() => { throw awsError('AccessDenied'); });
        await expect(denied.Gateway.Delete(URL, 'r')).rejects.toBeInstanceOf(AwsGatewayError);
    });
});

describe('SdkSqsGateway.GetAttributes', () => {
    it('returns every attribute, or null for a missing queue', async () => {
        const { Gateway, Commands } = harness(() => ({ Attributes: { FifoQueue: 'true', VisibilityTimeout: '60' } }));
        expect(await Gateway.GetAttributes(URL)).toEqual({ FifoQueue: 'true', VisibilityTimeout: '60' });
        expect(Commands[0]).toBeInstanceOf(GetQueueAttributesCommand);
        expect((Commands[0] as GetQueueAttributesCommand).input).toEqual({ QueueUrl: URL, AttributeNames: ['All'] });
        expect(await harness(() => { throw awsError('QueueDoesNotExist'); }).Gateway.GetAttributes(URL)).toBeNull();
    });
});
