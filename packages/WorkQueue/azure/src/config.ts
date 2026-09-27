import { WorkQueueConfigurationError, type WorkJson } from '@memberjunction/work-queue-core';

/** MJ: Work Queue Transports.Configuration for DriverClass 'Azure'. */
export interface AzureTransportConfig {
    /** e.g. contoso.servicebus.windows.net */
    FullyQualifiedNamespace: string;
}

/** A topic's BindingConfig (TopicBinding.Config). */
export interface AzureTopicConfig {
    TopicName: string;
}

/** A subscription's BindingConfig (SubscriptionBinding.Config). */
export interface AzureSubscriptionConfig {
    /** Carried so a thin consumer (Azure Functions) can open its own sender for retry copies without the transport row. */
    FullyQualifiedNamespace: string;
    TopicName: string;
    SubscriptionName: string;
    /** True for Exclusive subscriptions: the Service Bus subscription requires sessions and SessionId = PartitionKey. */
    RequiresSession: boolean;
}

/** Namespace host: a label per DNS segment; the cloud suffix is not pinned (public, government and sovereign clouds differ). */
const NAMESPACE = /^[A-Za-z0-9-]{1,50}(\.[A-Za-z0-9-]{1,63}){2,}$/;
/** Service Bus entity names: letters, digits and . - _ /; a slash is only meaningful for queues, so it is excluded here. */
const TOPIC_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,259}$/;
const SUBSCRIPTION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/;

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

/** Parses MJ: Work Queue Transports.Configuration for DriverClass 'Azure'. */
export function ParseAzureTransportConfig(json: string | null): AzureTransportConfig {
    if (json === null || json.trim() === '') {
        fail("Azure transport Configuration is required and must contain 'FullyQualifiedNamespace'");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        fail('Azure transport Configuration is not valid JSON');
    }
    if (!isRecord(parsed)) {
        fail('Azure transport Configuration must be a JSON object');
    }
    return { FullyQualifiedNamespace: requireString(parsed, 'FullyQualifiedNamespace', 'Azure transport Configuration', NAMESPACE) };
}

export function ReadAzureTopicConfig(config: Record<string, WorkJson>): AzureTopicConfig {
    return { TopicName: requireString(config, 'TopicName', 'Azure topic binding', TOPIC_NAME) };
}

export function ReadAzureSubscriptionConfig(config: Record<string, WorkJson>): AzureSubscriptionConfig {
    const what = 'Azure subscription binding';
    const requiresSession = config['RequiresSession'];
    if (typeof requiresSession !== 'boolean') {
        fail(`${what}: 'RequiresSession' must be a boolean`);
    }
    return {
        FullyQualifiedNamespace: requireString(config, 'FullyQualifiedNamespace', what, NAMESPACE),
        TopicName: requireString(config, 'TopicName', what, TOPIC_NAME),
        SubscriptionName: requireString(config, 'SubscriptionName', what, SUBSCRIPTION_NAME),
        RequiresSession: requiresSession,
    };
}
