import {
    ParseSubscriptionFilter, WorkQueueConfigurationError, type HostType, type SubscriptionBinding, type SubscriptionPolicy, type WorkJson,
} from '@memberjunction/work-queue-core';
import { ReadAwsSubscriptionConfig } from '../config';
import { AWS_TRANSPORT_CAPABILITIES } from '../driver/capabilities';

export const SUBSCRIPTION_ENV_VAR = 'MJ_WQ_SUBSCRIPTION';

type Raw = Record<string, unknown>;

function fail(message: string): never {
    throw new WorkQueueConfigurationError(`${SUBSCRIPTION_ENV_VAR}: ${message}`);
}

function isRecord(value: unknown): value is Raw {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(source: Raw, key: string): string {
    const value = source[key];
    return typeof value === 'string' && value !== '' ? value : fail(`Policy.${key} must be a non-empty string`);
}

function int(source: Raw, key: string, optional: boolean): number | undefined {
    const value = source[key];
    if (value === undefined && optional) {
        return undefined;
    }
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fail(`Policy.${key} must be a non-negative integer`);
}

function oneOf<T extends string>(source: Raw, key: string, allowed: readonly T[], hint?: string): T {
    const value = source[key];
    const match = allowed.find((candidate) => candidate === value);
    return match ?? fail(`Policy.${key} must be one of ${allowed.join(', ')}${hint ? ` (${hint})` : ''}`);
}

function readPolicy(raw: unknown): SubscriptionPolicy {
    if (!isRecord(raw)) {
        fail('Policy must be an object');
    }
    const policy: SubscriptionPolicy = {
        SubscriptionName: str(raw, 'SubscriptionName'),
        TopicName: str(raw, 'TopicName'),
        PartitionMode: oneOf(raw, 'PartitionMode', ['None', 'Exclusive'] as const, 'Ordered requires the Database transport'),
        MaxAttempts: int(raw, 'MaxAttempts', false) ?? 0,
        BackoffBaseSeconds: int(raw, 'BackoffBaseSeconds', false) ?? 0,
        BackoffMaxSeconds: int(raw, 'BackoffMaxSeconds', false) ?? 0,
        LeaseSeconds: int(raw, 'LeaseSeconds', false) ?? 0,
        HeartbeatMode: oneOf(raw, 'HeartbeatMode', ['Auto', 'Manual'] as const),
    };
    const maxProcessing = int(raw, 'MaxProcessingSeconds', true);
    if (maxProcessing !== undefined) policy.MaxProcessingSeconds = maxProcessing;
    return policy;
}

/** Parses and validates the SubscriptionBinding JSON that Terraform writes into the function's environment. */
export function ParseSubscriptionBindingEnv(value: string | undefined): SubscriptionBinding {
    if (value === undefined || value.trim() === '') {
        fail('environment variable is not set');
    }
    let raw: unknown;
    try {
        raw = JSON.parse(value);
    } catch {
        throw new WorkQueueConfigurationError(`${SUBSCRIPTION_ENV_VAR} is not valid JSON`);
    }
    if (!isRecord(raw) || !isRecord(raw['Config'])) {
        fail('must be an object with Policy, Filter, HostType and Config');
    }
    const hostType: HostType = raw['HostType'] === 'MJWorker' ? 'MJWorker' : raw['HostType'] === 'External' ? 'External' : fail('HostType must be MJWorker or External');
    const filterJson = raw['Filter'] === null || raw['Filter'] === undefined ? null : JSON.stringify(raw['Filter']);
    // Config values are JSON from JSON.parse; ReadAwsSubscriptionConfig validates every field it uses.
    const config = raw['Config'] as Record<string, WorkJson>;
    ReadAwsSubscriptionConfig(config);
    // ParseSubscriptionFilter enforces 03 §4.1 against what this transport accepts, so a filter SNS cannot express
    // fails at cold start rather than silently matching everything.
    const filter = ParseSubscriptionFilter(filterJson, AWS_TRANSPORT_CAPABILITIES.Filters);
    return { Policy: readPolicy(raw['Policy']), Filter: filter, HostType: hostType, Config: config };
}
