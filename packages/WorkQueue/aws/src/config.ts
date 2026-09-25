import { WorkQueueConfigurationError, type WorkJson } from '@memberjunction/work-queue-core';

export interface AwsTransportConfig {
    Region: string;
    /** Custom endpoint, e.g. LocalStack. Null uses the AWS default endpoints. */
    Endpoint: string | null;
}

export interface AwsTopicConfig {
    SnsTopicArn: string;
}

export interface AwsSubscriptionConfig {
    Region: string;
    QueueUrl: string;
    QueueArn: string;
    DeadLetterQueueUrl: string;
    DeadLetterQueueArn: string;
    IsFifo: boolean;
    /** Used by binding validation to compare raw delivery and filter policy. Null skips those checks. */
    SnsSubscriptionArn: string | null;
}

const REGION = /^[a-z]{2}(-[a-z]+)+-\d{1,2}$/;
const ENDPOINT = /^https?:\/\/\S+$/;
const QUEUE_URL = /^https?:\/\/\S+\/\d{12}\/[A-Za-z0-9_-]{1,75}(\.fifo)?$/;
const SNS_TOPIC_ARN = /^arn:aws[a-z-]*:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,251}(\.fifo)?$/;
const SQS_ARN = /^arn:aws[a-z-]*:sqs:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,75}(\.fifo)?$/;
const SNS_SUBSCRIPTION_ARN = /^arn:aws[a-z-]*:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_.-]+:[0-9a-f-]{36}$/;

function fail(message: string): never {
    throw new WorkQueueConfigurationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(source: Record<string, unknown>, key: string, what: string, pattern: RegExp): string {
    const value = source[key];
    if (typeof value !== 'string' || !pattern.test(value)) {
        fail(`${what}: '${key}' is missing or invalid`);
    }
    return value;
}

function optionalString(source: Record<string, unknown>, key: string, what: string, pattern: RegExp): string | null {
    return source[key] === undefined || source[key] === null ? null : requireString(source, key, what, pattern);
}

/** Parses MJ: Work Queue Transports.Configuration for DriverClass 'AWS'. */
export function ParseAwsTransportConfig(json: string | null): AwsTransportConfig {
    if (json === null || json.trim() === '') {
        fail("AWS transport Configuration is required and must contain 'Region'");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        fail('AWS transport Configuration is not valid JSON');
    }
    if (!isRecord(parsed)) {
        fail('AWS transport Configuration must be a JSON object');
    }
    return {
        Region: requireString(parsed, 'Region', 'AWS transport Configuration', REGION),
        Endpoint: optionalString(parsed, 'Endpoint', 'AWS transport Configuration', ENDPOINT),
    };
}

/** Reads a topic's BindingConfig (TopicBinding.Config). */
export function ReadAwsTopicConfig(config: Record<string, WorkJson>): AwsTopicConfig {
    return { SnsTopicArn: requireString(config, 'SnsTopicArn', 'AWS topic binding', SNS_TOPIC_ARN) };
}

/** Reads a subscription's BindingConfig (SubscriptionBinding.Config). */
export function ReadAwsSubscriptionConfig(config: Record<string, WorkJson>): AwsSubscriptionConfig {
    const what = 'AWS subscription binding';
    const isFifo = config['IsFifo'];
    if (typeof isFifo !== 'boolean') {
        fail(`${what}: 'IsFifo' must be a boolean`);
    }
    const result: AwsSubscriptionConfig = {
        Region: requireString(config, 'Region', what, REGION),
        QueueUrl: requireString(config, 'QueueUrl', what, QUEUE_URL),
        QueueArn: requireString(config, 'QueueArn', what, SQS_ARN),
        DeadLetterQueueUrl: requireString(config, 'DeadLetterQueueUrl', what, QUEUE_URL),
        DeadLetterQueueArn: requireString(config, 'DeadLetterQueueArn', what, SQS_ARN),
        IsFifo: isFifo,
        SnsSubscriptionArn: optionalString(config, 'SnsSubscriptionArn', what, SNS_SUBSCRIPTION_ARN),
    };
    const arnsFifo = [result.QueueArn, result.DeadLetterQueueArn].map((arn) => arn.endsWith('.fifo'));
    if (arnsFifo.some((fifo) => fifo !== isFifo)) {
        fail(`${what}: 'IsFifo' is ${isFifo} but the queue and dead-letter queue ARNs disagree`);
    }
    return result;
}
