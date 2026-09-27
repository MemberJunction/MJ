import { ServiceBusRuleSqlFor } from '@memberjunction/work-queue-azure';
import { WorkQueueConfigurationError, type ManifestSubscription, type TopologyManifest } from '@memberjunction/work-queue-core';

export const AZURE_DRIVER_CLASS = 'Azure';

function withAzureArtifacts(subscription: ManifestSubscription): ManifestSubscription {
    if (subscription.Policy.PartitionMode === 'Ordered') {
        throw new WorkQueueConfigurationError(
            `Subscription '${subscription.Name}': Ordered requires the Database transport; it cannot be exported for the Azure transport`,
        );
    }
    return {
        ...subscription,
        DriverArtifacts: {
            ServiceBusRuleSql: ServiceBusRuleSqlFor(subscription.Filter, subscription.Name),
            RequiresSession: subscription.Policy.PartitionMode === 'Exclusive',
        },
    };
}

/**
 * Renders what Terraform must not re-translate: the subscription's SQL rule (targeting clause + filter) and whether
 * the Service Bus subscription requires sessions. ServiceBusRuleSqlFor throws WorkQueueConfigurationError for a filter
 * outside the 03 §4.1 subset (a field constrained twice, a mixed-field OR group).
 */
export function EnrichAzureManifest(manifest: TopologyManifest): TopologyManifest {
    return {
        ...manifest,
        Topics: manifest.Topics.map(topic => ({ ...topic, Subscriptions: topic.Subscriptions.map(withAzureArtifacts) })),
    };
}
