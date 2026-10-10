import type { SqsReceivedMessage } from '../gateway/SqsGateway';

/** The fields of an SQS record in a Lambda event that the adapter reads (no @types/aws-lambda dependency). */
export interface SqsLambdaRecord {
    messageId: string;
    receiptHandle: string;
    body: string;
    attributes: { ApproximateReceiveCount: string; SentTimestamp?: string; MessageGroupId?: string };
    messageAttributes: Record<string, { stringValue?: string; dataType: string }>;
    eventSourceARN: string;
}

export interface SqsLambdaEvent {
    Records: SqsLambdaRecord[];
}

/** Partial batch response. Requires FunctionResponseTypes = ["ReportBatchItemFailures"] on the event source mapping. */
export interface SqsBatchResponse {
    batchItemFailures: { itemIdentifier: string }[];
}

export interface LambdaContextLike {
    getRemainingTimeInMillis(): number;
    awsRequestId?: string;
}

export function ToSqsReceivedMessage(record: SqsLambdaRecord): SqsReceivedMessage {
    const attributes: Record<string, string> = {};
    for (const [name, value] of Object.entries(record.messageAttributes)) {
        if (value.stringValue !== undefined) {
            attributes[name] = value.stringValue;
        }
    }
    return {
        MessageId: record.messageId,
        ReceiptHandle: record.receiptHandle,
        Body: record.body,
        ReceiveCount: Number(record.attributes.ApproximateReceiveCount),
        MessageGroupId: record.attributes.MessageGroupId ?? null,
        SentTimestamp: record.attributes.SentTimestamp ? Number(record.attributes.SentTimestamp) : null,
        Attributes: attributes,
    };
}
