import { createHash } from 'node:crypto';

export type AzureEntityKind = 'Topic' | 'Subscription';

export const SERVICE_BUS_TOPIC_MAX_NAME_LENGTH = 260;
export const SERVICE_BUS_SUBSCRIPTION_MAX_NAME_LENGTH = 50;

/** Lowercase; every character outside [a-z0-9_-] becomes '-'; runs of '-' collapse; leading/trailing '-' trimmed. */
export function ToResourceSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Topic: `${prefix}-${environment}-${slug}`. Subscription: the slug alone (a subscription name is scoped to its
 * topic, and the 50-character limit leaves no room for a prefix). Names over the service limit keep a prefix and end
 * with '-' + the first 8 hex chars of SHA-1(logicalName). Terraform (infrastructure/terraform/work-queue/azure/locals.tf)
 * implements the same rule.
 */
export function AzureEntityName(prefix: string, environment: string, logicalName: string, kind: AzureEntityKind): string {
    const base = kind === 'Topic' ? `${prefix}-${environment}-${ToResourceSlug(logicalName)}` : ToResourceSlug(logicalName);
    const max = kind === 'Topic' ? SERVICE_BUS_TOPIC_MAX_NAME_LENGTH : SERVICE_BUS_SUBSCRIPTION_MAX_NAME_LENGTH;
    if (base.length <= max) {
        return base;
    }
    const hash = createHash('sha1').update(logicalName).digest('hex').slice(0, 8);
    return `${base.slice(0, max - hash.length - 1)}-${hash}`;
}
