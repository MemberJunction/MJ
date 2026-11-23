import { WorkQueueConfigurationError, type WorkJson } from '@memberjunction/work-queue-core';

export interface GcpTransportConfig {
    /** GCP Project ID owning the Pub/Sub topics and subscriptions (e.g. 'mj-workqueue-prod'). */
    ProjectId: string;
    /** Optional custom Pub/Sub endpoint (e.g. 'localhost:8085' for emulator or 'us-central1-pubsub.googleapis.com:443'). */
    ApiEndpoint: string | null;
    /** Enables local Pub/Sub emulator mode (uses ApiEndpoint or PUBSUB_EMULATOR_HOST without TLS). */
    UseEmulator: boolean;
}

export interface GcpTopicConfig {
    ProjectId: string | null;
    TopicName: string;
}

export interface GcpSubscriptionConfig {
    ProjectId: string | null;
    TopicName: string;
    SubscriptionName: string;
    DeadLetterTopicName: string | null;
    DeadLetterSubscriptionName: string | null;
    EnableMessageOrdering: boolean;
    AckDeadlineSeconds: number;
}

const PROJECT_ID = /^[a-z][a-z0-9-]{2,62}$|^[a-zA-Z0-9._-]+$/;
const ENDPOINT = /^(https?:\/\/)?[a-zA-Z0-9.-]+(:\d{1,5})?(\/\S*)?$/;
const RESOURCE_ID_OR_PATH = /^(?:projects\/[a-zA-Z0-9._-]+\/(?:topics|subscriptions)\/)?[a-zA-Z][a-zA-Z0-9._~+%-]{2,254}$/;

export const DEFAULT_ACK_DEADLINE_SECONDS = 60;
export const GCP_MIN_ACK_DEADLINE_SECONDS = 10;
export const GCP_MAX_ACK_DEADLINE_SECONDS = 600;

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

/** Normalizes a topic ID or full resource path into `projects/<projectId>/topics/<topicId>`. */
export function FormatGcpTopicPath(projectId: string, topicName: string): string {
    if (topicName.startsWith('projects/')) {
        return topicName;
    }
    return `projects/${projectId}/topics/${topicName}`;
}

/** Normalizes a subscription ID or full resource path into `projects/<projectId>/subscriptions/<subId>`. */
export function FormatGcpSubscriptionPath(projectId: string, subscriptionName: string): string {
    if (subscriptionName.startsWith('projects/')) {
        return subscriptionName;
    }
    return `projects/${projectId}/subscriptions/${subscriptionName}`;
}

/** Extracts the short resource ID from either a full `projects/.../(topics|subscriptions)/<id>` path or a short ID. */
export function ExtractGcpResourceShortName(nameOrPath: string): string {
    const idx = nameOrPath.lastIndexOf('/');
    return idx >= 0 ? nameOrPath.slice(idx + 1) : nameOrPath;
}

/** Parses MJ: Work Queue Transports.Configuration for DriverClass 'GCP'. */
export function ParseGcpTransportConfig(json: string | null): GcpTransportConfig {
    if (json === null || json.trim() === '') {
        fail("GCP transport Configuration is required and must contain 'ProjectId'");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        fail('GCP transport Configuration is not valid JSON');
    }
    if (!isRecord(parsed)) {
        fail('GCP transport Configuration must be a JSON object');
    }
    const projectId = requireString(parsed, 'ProjectId', 'GCP transport Configuration', PROJECT_ID);
    const apiEndpoint = optionalString(parsed, 'ApiEndpoint', 'GCP transport Configuration', ENDPOINT);
    const useEmulatorRaw = parsed['UseEmulator'];
    if (useEmulatorRaw !== undefined && typeof useEmulatorRaw !== 'boolean') {
        fail("GCP transport Configuration: 'UseEmulator' must be a boolean");
    }
    return {
        ProjectId: projectId,
        ApiEndpoint: apiEndpoint,
        UseEmulator: useEmulatorRaw === true,
    };
}

/** Reads a topic's BindingConfig (TopicBinding.Config). */
export function ReadGcpTopicConfig(config: Record<string, WorkJson>): GcpTopicConfig {
    const what = 'GCP topic binding';
    return {
        ProjectId: optionalString(config, 'ProjectId', what, PROJECT_ID),
        TopicName: requireString(config, 'TopicName', what, RESOURCE_ID_OR_PATH),
    };
}

/** Reads a subscription's BindingConfig (SubscriptionBinding.Config). */
export function ReadGcpSubscriptionConfig(config: Record<string, WorkJson>): GcpSubscriptionConfig {
    const what = 'GCP subscription binding';
    const enableOrdering = config['EnableMessageOrdering'];
    if (typeof enableOrdering !== 'boolean') {
        fail(`${what}: 'EnableMessageOrdering' must be a boolean`);
    }
    const ackRaw = config['AckDeadlineSeconds'];
    let ackDeadlineSeconds = DEFAULT_ACK_DEADLINE_SECONDS;
    if (ackRaw !== undefined) {
        if (typeof ackRaw !== 'number' || !Number.isInteger(ackRaw) || ackRaw <= 0 || ackRaw > GCP_MAX_ACK_DEADLINE_SECONDS) {
            fail(`${what}: 'AckDeadlineSeconds' must be an integer between 1 and ${GCP_MAX_ACK_DEADLINE_SECONDS}`);
        }
        ackDeadlineSeconds = ackRaw;
    }
    return {
        ProjectId: optionalString(config, 'ProjectId', what, PROJECT_ID),
        TopicName: requireString(config, 'TopicName', what, RESOURCE_ID_OR_PATH),
        SubscriptionName: requireString(config, 'SubscriptionName', what, RESOURCE_ID_OR_PATH),
        DeadLetterTopicName: optionalString(config, 'DeadLetterTopicName', what, RESOURCE_ID_OR_PATH),
        DeadLetterSubscriptionName: optionalString(config, 'DeadLetterSubscriptionName', what, RESOURCE_ID_OR_PATH),
        EnableMessageOrdering: enableOrdering,
        AckDeadlineSeconds: ackDeadlineSeconds,
    };
}
