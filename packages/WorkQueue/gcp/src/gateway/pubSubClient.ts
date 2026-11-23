import { PubSub, v1, type ClientConfig } from '@google-cloud/pubsub';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { GcpTransportConfig } from '../config';

/** Explicit GCP service-account key or keyfile; undefined uses Application Default Credentials (ADC). */
export type GcpCredentialsOption =
    | { ClientEmail: string; PrivateKey: string; ProjectId?: string }
    | { KeyFilename: string; ProjectId?: string }
    | { CredentialsJson: string; ProjectId?: string };

export interface GcpDataClientBundle {
    ProjectId: string;
    Publisher: v1.PublisherClient;
    Subscriber: v1.SubscriberClient;
    Close(): Promise<void>;
}

function parseServiceAccountJson(json: string): { client_email: string; private_key: string; project_id?: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new WorkQueueConfigurationError('GCP CredentialsJson is not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new WorkQueueConfigurationError('GCP CredentialsJson must be a JSON object');
    }
    const clientEmail = Reflect.get(parsed, 'client_email');
    const privateKey = Reflect.get(parsed, 'private_key');
    const projectId = Reflect.get(parsed, 'project_id');
    if (typeof clientEmail !== 'string' || clientEmail === '' || typeof privateKey !== 'string' || privateKey === '') {
        throw new WorkQueueConfigurationError('GCP CredentialsJson must include non-empty client_email and private_key');
    }
    return {
        client_email: clientEmail,
        private_key: privateKey,
        ...(typeof projectId === 'string' && projectId !== '' ? { project_id: projectId } : {}),
    };
}

/** Builds a @google-cloud/pubsub ClientConfig from transport configuration and optional credentials. */
export function BuildPubSubClientConfig(config: GcpTransportConfig, credentials?: GcpCredentialsOption): ClientConfig {
    const clientConfig: ClientConfig = {
        projectId: credentials?.ProjectId ?? config.ProjectId,
        ...(config.ApiEndpoint ? { apiEndpoint: config.ApiEndpoint } : {}),
        ...(config.UseEmulator ? { emulatorMode: true } : {}),
    };
    if (!credentials) {
        return clientConfig;
    }
    if ('ClientEmail' in credentials) {
        clientConfig.credentials = {
            client_email: credentials.ClientEmail,
            private_key: credentials.PrivateKey,
        };
    } else if ('KeyFilename' in credentials) {
        clientConfig.keyFilename = credentials.KeyFilename;
    } else if ('CredentialsJson' in credentials) {
        const parsed = parseServiceAccountJson(credentials.CredentialsJson);
        if (!credentials.ProjectId && parsed.project_id) {
            clientConfig.projectId = parsed.project_id;
        }
        clientConfig.credentials = {
            client_email: parsed.client_email,
            private_key: parsed.private_key,
        };
    }
    return clientConfig;
}

/** Creates data-plane Pub/Sub GAPIC publisher & subscriber clients without exposing admin operations in Cloud Run entrypoints. */
export function CreatePubSubDataClients(config: GcpTransportConfig, credentials?: GcpCredentialsOption): GcpDataClientBundle {
    const clientConfig = BuildPubSubClientConfig(config, credentials);
    const pubsub = new PubSub(clientConfig);
    const publisher = new v1.PublisherClient({
        projectId: clientConfig.projectId,
        ...(clientConfig.apiEndpoint ? { apiEndpoint: clientConfig.apiEndpoint } : {}),
        ...(clientConfig.credentials ? { credentials: clientConfig.credentials } : {}),
        ...(clientConfig.keyFilename ? { keyFilename: clientConfig.keyFilename } : {}),
    });
    const subscriber = new v1.SubscriberClient({
        projectId: clientConfig.projectId,
        ...(clientConfig.apiEndpoint ? { apiEndpoint: clientConfig.apiEndpoint } : {}),
        ...(clientConfig.credentials ? { credentials: clientConfig.credentials } : {}),
        ...(clientConfig.keyFilename ? { keyFilename: clientConfig.keyFilename } : {}),
    });
    return {
        ProjectId: clientConfig.projectId ?? config.ProjectId,
        Publisher: publisher,
        Subscriber: subscriber,
        async Close(): Promise<void> {
            await Promise.all([
                publisher.close().catch(() => undefined),
                subscriber.close().catch(() => undefined),
                pubsub.close().catch(() => undefined),
            ]);
        },
    };
}
