import { createHash } from 'node:crypto';

export type AzureResourceKind = 'Topic' | 'Subscription' | 'Queue';

export const SERVICE_BUS_TOPIC_MAX_NAME_LENGTH = 260;
export const SERVICE_BUS_SUBSCRIPTION_MAX_NAME_LENGTH = 50;

/** Lowercase; every character outside [a-z0-9_-] becomes '-'; runs of '-' collapse; leading/trailing '-' trimmed. */
export function ToAzureResourceSlug(name: string): string {
    const collapsed = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
    let start = 0;
    let end = collapsed.length;
    while (start < end && (collapsed[start] === '-' || collapsed[start] === '_')) {
        start += 1;
    }
    while (end > start && (collapsed[end - 1] === '-' || collapsed[end - 1] === '_')) {
        end -= 1;
    }
    return collapsed.slice(start, end);
}

/**
 * `${prefix}-${environment}-${slug}`.
 * Names exceeding Azure Service Bus limits (260 for topics/queues, 50 for subscriptions) keep a prefix and end with
 * '-' + the first 8 hex chars of SHA-1(logicalName) so names stay unique and deterministic.
 */
export function AzureResourceName(prefix: string, environment: string, logicalName: string, kind: AzureResourceKind): string {
    const base = `${prefix}-${environment}-${ToAzureResourceSlug(logicalName)}`;
    const max = kind === 'Subscription' ? SERVICE_BUS_SUBSCRIPTION_MAX_NAME_LENGTH : SERVICE_BUS_TOPIC_MAX_NAME_LENGTH;
    if (base.length <= max) {
        return base;
    }
    const hash = createHash('sha1').update(logicalName).digest('hex').slice(0, 8);
    const keep = max - hash.length - 1;
    return `${base.slice(0, keep)}-${hash}`;
}
