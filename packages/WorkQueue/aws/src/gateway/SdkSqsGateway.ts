import {
    ChangeMessageVisibilityCommand, DeleteMessageCommand, GetQueueAttributesCommand, ReceiveMessageCommand,
    SendMessageCommand, type Message, type SQSClient,
} from '@aws-sdk/client-sqs';
import { ErrorCode, IsAbortError, ToGatewayError } from './errors';
import type { SqsGateway, SqsReceivedMessage, SqsReceiveRequest, SqsSendRequest } from './SqsGateway';

const MISSING_QUEUE_CODES = new Set(['QueueDoesNotExist', 'AWS.SimpleQueueService.NonExistentQueue']);
const STALE_RECEIPT_CODES = new Set(['ReceiptHandleIsInvalid', 'MessageNotInflight']);

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(Math.floor(value), min), max);
}

function isStaleReceipt(error: unknown): boolean {
    const code = ErrorCode(error);
    if (STALE_RECEIPT_CODES.has(code)) {
        return true;
    }
    return code === 'InvalidParameterValue' && error instanceof Error && /receipt ?handle/i.test(error.message);
}

function stringMap(source: Record<string, string | undefined> | undefined): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(source ?? {})) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}

function toReceived(message: Message): SqsReceivedMessage[] {
    if (!message.MessageId || !message.ReceiptHandle || message.Body === undefined) {
        return [];
    }
    const system = message.Attributes ?? {};
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(message.MessageAttributes ?? {})) {
        if (value.StringValue !== undefined) {
            attributes[key] = value.StringValue;
        }
    }
    return [{
        MessageId: message.MessageId,
        ReceiptHandle: message.ReceiptHandle,
        Body: message.Body,
        ReceiveCount: Number(system.ApproximateReceiveCount ?? '1'),
        MessageGroupId: system.MessageGroupId ?? null,
        SentTimestamp: system.SentTimestamp ? Number(system.SentTimestamp) : null,
        Attributes: attributes,
    }];
}

export class SdkSqsGateway implements SqsGateway {
    constructor(private readonly client: SQSClient) {}

    public async Receive(request: SqsReceiveRequest): Promise<SqsReceivedMessage[]> {
        const command = new ReceiveMessageCommand({
            QueueUrl: request.QueueUrl,
            MaxNumberOfMessages: clamp(request.MaxMessages, 1, 10),
            WaitTimeSeconds: clamp(request.WaitTimeSeconds, 0, 20),
            ...(request.VisibilityTimeoutSeconds === null ? {} : { VisibilityTimeout: clamp(request.VisibilityTimeoutSeconds, 0, 43200) }),
            MessageSystemAttributeNames: ['ApproximateReceiveCount', 'MessageGroupId', 'SentTimestamp'],
            MessageAttributeNames: ['All'],
        });
        try {
            const output = await this.client.send(command, { abortSignal: request.Signal });
            return (output.Messages ?? []).flatMap(toReceived);
        } catch (error) {
            if (IsAbortError(error) || request.Signal?.aborted) {
                return [];
            }
            throw ToGatewayError(error, 'SQS ReceiveMessage');
        }
    }

    public async Send(request: SqsSendRequest): Promise<string> {
        const attributes = Object.entries(request.Attributes ?? {});
        const command = new SendMessageCommand({
            QueueUrl: request.QueueUrl,
            MessageBody: request.Body,
            ...(request.MessageGroupId ? { MessageGroupId: request.MessageGroupId } : {}),
            ...(request.MessageDeduplicationId ? { MessageDeduplicationId: request.MessageDeduplicationId } : {}),
            ...(attributes.length > 0
                ? { MessageAttributes: Object.fromEntries(attributes.map(([k, v]) => [k, { DataType: 'String', StringValue: v }])) }
                : {}),
        });
        try {
            const output = await this.client.send(command);
            return output.MessageId ?? '';
        } catch (error) {
            throw ToGatewayError(error, 'SQS SendMessage');
        }
    }

    public async ChangeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<boolean> {
        const command = new ChangeMessageVisibilityCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle, VisibilityTimeout: clamp(seconds, 0, 43200) });
        return this.receiptWrite(() => this.client.send(command), 'SQS ChangeMessageVisibility');
    }

    public async Delete(queueUrl: string, receiptHandle: string): Promise<boolean> {
        const command = new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle });
        return this.receiptWrite(() => this.client.send(command), 'SQS DeleteMessage');
    }

    public async GetAttributes(queueUrl: string): Promise<Record<string, string> | null> {
        try {
            const output = await this.client.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['All'] }));
            return stringMap(output.Attributes);
        } catch (error) {
            if (MISSING_QUEUE_CODES.has(ErrorCode(error))) {
                return null;
            }
            throw ToGatewayError(error, 'SQS GetQueueAttributes');
        }
    }

    private async receiptWrite(write: () => Promise<object>, operation: string): Promise<boolean> {
        try {
            await write();
            return true;
        } catch (error) {
            if (isStaleReceipt(error)) {
                return false;
            }
            throw ToGatewayError(error, operation);
        }
    }
}
