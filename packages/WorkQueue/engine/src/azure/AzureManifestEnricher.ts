import { AzureSqlFilterFor } from '@memberjunction/work-queue-azure';
import {
    WorkQueueConfigurationError,
    type ManifestSubscription,
    type TopologyManifest,
} from '@memberjunction/work-queue-core';

export const AZURE_DRIVER_CLASS = 'Azure';

function withAzureExtension(subscription: ManifestSubscription): ManifestSubscription {
    if (subscription.Policy.PartitionMode === 'Ordered') {
        throw new WorkQueueConfigurationError(
            `Subscription '${subscription.Name}': Ordered requires the Database transport; it cannot be exported for the Azure transport`,
        );
    }
    return {
        ...subscription,
        DriverArtifacts: {
            SqlFilterExpression: AzureSqlFilterFor(subscription.Filter),
        },
    };
}

/** Renders Azure Service Bus SQL92 filter expressions for every subscription on an Azure manifest. */
export function EnrichAzureManifest(manifest: TopologyManifest): TopologyManifest {
    return {
        ...manifest,
        Topics: manifest.Topics.map((topic) => ({
            ...topic,
            Subscriptions: topic.Subscriptions.map(withAzureExtension),
        })),
    };
}
