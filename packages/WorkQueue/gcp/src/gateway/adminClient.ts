import { v1 } from '@google-cloud/pubsub';
import type { GcpTransportConfig } from '../config';
import { BuildPubSubClientConfig, type GcpCredentialsOption } from './pubSubClient';

export interface GcpAdminClientBundle {
    ProjectId: string;
    Publisher: v1.PublisherClient;
    Subscriber: v1.SubscriberClient;
    Close(): Promise<void>;
}

/** Creates management-plane GAPIC clients for topic/subscription inspection, provisioning, and binding validation. */
export function CreatePubSubAdminClients(config: GcpTransportConfig, credentials?: GcpCredentialsOption): GcpAdminClientBundle {
    const clientConfig = BuildPubSubClientConfig(config, credentials);
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
            ]);
        },
    };
}
