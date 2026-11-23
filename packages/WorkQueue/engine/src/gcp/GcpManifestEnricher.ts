import {
    WorkQueueConfigurationError,
    type ManifestSubscription,
    type TopologyManifest,
} from '@memberjunction/work-queue-core';
import { GcpPubSubFilterFor } from '@memberjunction/work-queue-gcp';

export const GCP_DRIVER_CLASS = 'GCP';

function withGcpExtension(subscription: ManifestSubscription): ManifestSubscription {
    if (subscription.Policy.PartitionMode === 'Ordered') {
        throw new WorkQueueConfigurationError(
            `Subscription '${subscription.Name}': Ordered requires the Database transport; it cannot be exported for the GCP transport`,
        );
    }
    return {
        ...subscription,
        DriverArtifacts: {
            PubSubFilter: GcpPubSubFilterFor(subscription.Filter),
        },
    };
}

/** Renders Google Cloud Pub/Sub subscription filter expressions for every subscription on a GCP manifest. */
export function EnrichGcpManifest(manifest: TopologyManifest): TopologyManifest {
    return {
        ...manifest,
        Topics: manifest.Topics.map((topic) => ({
            ...topic,
            Subscriptions: topic.Subscriptions.map(withGcpExtension),
        })),
    };
}
