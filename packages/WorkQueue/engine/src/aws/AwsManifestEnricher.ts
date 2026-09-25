import { SnsFilterPolicyFor } from '@memberjunction/work-queue-aws';
import { WorkQueueConfigurationError, type ManifestSubscription, type TopologyManifest } from '@memberjunction/work-queue-core';

export const AWS_DRIVER_CLASS = 'AWS';

function withAwsExtension(subscription: ManifestSubscription): ManifestSubscription {
    if (subscription.Policy.PartitionMode === 'Ordered') {
        throw new WorkQueueConfigurationError(
            `Subscription '${subscription.Name}': Ordered requires the Database transport; it cannot be exported for the AWS transport`,
        );
    }
    return { ...subscription, DriverArtifacts: { SnsFilterPolicy: SnsFilterPolicyFor(subscription.Filter) } };
}

/**
 * Renders what Terraform must not re-translate. SnsFilterPolicyFor throws WorkQueueConfigurationError for filters SNS
 * cannot express — more than 150 value combinations, a field constrained twice, or a mixed-field OR group (Task 2).
 */
export function EnrichAwsManifest(manifest: TopologyManifest): TopologyManifest {
    return {
        ...manifest,
        Topics: manifest.Topics.map(topic => ({ ...topic, Subscriptions: topic.Subscriptions.map(withAwsExtension) })),
    };
}
