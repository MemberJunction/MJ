import { WorkQueueConfigurationError, type WorkJson } from '@memberjunction/work-queue-core';

export interface AzureTransportConfig {
    /** Fully qualified Service Bus namespace, e.g. 'mj-wq.servicebus.windows.net'. Null only when Endpoint is used for local emulator. */
    Namespace: string | null;
    /** Custom endpoint / emulator host (e.g. 'sb://localhost' or 'localhost:5672'). Null uses the Azure cloud namespace. */
    Endpoint: string | null;
    /** Enables development emulator mode (disables TLS / uses local emulator endpoint when configured). */
    UseEmulator: boolean;
}

export interface AzureTopicConfig {
    ServiceBusTopicName: string;
}

export interface AzureSubscriptionConfig {
    Namespace: string | null;
    ServiceBusTopicName: string;
    SubscriptionName: string;
    RequiresSession: boolean;
    LockDurationSeconds: number;
}

const NAMESPACE = /^(localhost|[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)$/;
const ENDPOINT = /^(sb|https?):\/\/\S+|^[a-zA-Z0-9.-]+(:\d{1,5})?$/;
const TOPIC_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,258}[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
const SUBSCRIPTION_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,48}[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

export const DEFAULT_LOCK_DURATION_SECONDS = 60;

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

/** Parses MJ: Work Queue Transports.Configuration for DriverClass 'Azure'. */
export function ParseAzureTransportConfig(json: string | null): AzureTransportConfig {
    if (json === null || json.trim() === '') {
        fail("Azure transport Configuration is required and must contain 'Namespace' or 'Endpoint'");
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
    const namespace = optionalString(parsed, 'Namespace', 'Azure transport Configuration', NAMESPACE);
    const endpoint = optionalString(parsed, 'Endpoint', 'Azure transport Configuration', ENDPOINT);
    const useEmulatorRaw = parsed['UseEmulator'];
    if (useEmulatorRaw !== undefined && typeof useEmulatorRaw !== 'boolean') {
        fail("Azure transport Configuration: 'UseEmulator' must be a boolean");
    }
    const useEmulator = useEmulatorRaw === true;
    if (namespace === null && endpoint === null) {
        fail("Azure transport Configuration requires 'Namespace' or 'Endpoint'");
    }
    return {
        Namespace: namespace,
        Endpoint: endpoint,
        UseEmulator: useEmulator,
    };
}

/** Reads a topic's BindingConfig (TopicBinding.Config). */
export function ReadAzureTopicConfig(config: Record<string, WorkJson>): AzureTopicConfig {
    return {
        ServiceBusTopicName: requireString(config, 'ServiceBusTopicName', 'Azure topic binding', TOPIC_NAME),
    };
}

/** Reads a subscription's BindingConfig (SubscriptionBinding.Config). */
export function ReadAzureSubscriptionConfig(config: Record<string, WorkJson>): AzureSubscriptionConfig {
    const what = 'Azure subscription binding';
    const requiresSession = config['RequiresSession'];
    if (typeof requiresSession !== 'boolean') {
        fail(`${what}: 'RequiresSession' must be a boolean`);
    }
    const lockRaw = config['LockDurationSeconds'];
    let lockDurationSeconds = DEFAULT_LOCK_DURATION_SECONDS;
    if (lockRaw !== undefined) {
        if (typeof lockRaw !== 'number' || !Number.isInteger(lockRaw) || lockRaw <= 0 || lockRaw > 300) {
            fail(`${what}: 'LockDurationSeconds' must be an integer between 1 and 300`);
        }
        lockDurationSeconds = lockRaw;
    }
    return {
        Namespace: optionalString(config, 'Namespace', what, NAMESPACE),
        ServiceBusTopicName: requireString(config, 'ServiceBusTopicName', what, TOPIC_NAME),
        SubscriptionName: requireString(config, 'SubscriptionName', what, SUBSCRIPTION_NAME),
        RequiresSession: requiresSession,
        LockDurationSeconds: lockDurationSeconds,
    };
}
