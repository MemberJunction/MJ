import { ValidateSubscriptionFilter } from './filter';
import type { SubscriptionFilter } from './filterTypes';
import { WorkQueueConfigurationError } from './errors';
import type { SubscriptionBinding, TransportCapabilities } from './transport';

/** Why this transport cannot express the subscription's filter (spec 03 §4.1), or null when it can. */
export function FilterUnsupportedReason(
    filter: SubscriptionFilter | null,
    capabilities: TransportCapabilities,
): string | null {
    if (filter === null) {
        return null;
    }
    try {
        ValidateSubscriptionFilter(filter, capabilities.Filters);
        return null;
    } catch (error) {
        if (error instanceof WorkQueueConfigurationError) {
            return error.message;
        }
        throw error;
    }
}

/**
 * Why a transport cannot run a subscription as configured, or null when it can. Used when a
 * subscription is saved and when a host starts (capability gating). Rules follow spec 03 §5.
 */
export function SubscriptionUnsupportedReason(
    binding: SubscriptionBinding,
    capabilities: TransportCapabilities,
): string | null {
    const policy = binding.Policy;
    const name = policy.SubscriptionName;
    if (binding.HostType === 'External' && !capabilities.SupportsExternalHosts) {
        return `Subscription '${name}' uses HostType External, which this transport cannot host`;
    }
    if (policy.PartitionMode === 'Ordered' && !capabilities.SupportsOrdered) {
        return `Subscription '${name}': Ordered requires the Database transport`;
    }
    if (policy.BackoffMaxSeconds > capabilities.MaxRetryDelaySeconds) {
        return `Subscription '${name}' has BackoffMaxSeconds ${policy.BackoffMaxSeconds}, above this transport's limit of ${capabilities.MaxRetryDelaySeconds}`;
    }
    const filterReason = FilterUnsupportedReason(binding.Filter, capabilities);
    if (filterReason) {
        return `Subscription '${name}': ${filterReason}`;
    }
    return null;
}
