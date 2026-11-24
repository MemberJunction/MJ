import { createHash } from 'node:crypto';

export type GcpResourceKind = 'Topic' | 'Subscription' | 'DeadLetterTopic' | 'DeadLetterSubscription';

export const GCP_RESOURCE_MAX_NAME_LENGTH = 255;

/** Lowercase; characters outside [a-z0-9._~%-] become '-'; runs of '-' collapse; leading/trailing '-' trimmed. */
export function ToGcpResourceSlug(name: string): string {
    const collapsed = name.toLowerCase().replace(/[^a-z0-9._~%-]/g, '-').replace(/-+/g, '-');
    let start = 0;
    let end = collapsed.length;
    while (start < end && (collapsed[start] === '-' || collapsed[start] === '_' || collapsed[start] === '.')) {
        start += 1;
    }
    while (end > start && (collapsed[end - 1] === '-' || collapsed[end - 1] === '_' || collapsed[end - 1] === '.')) {
        end -= 1;
    }
    return collapsed.slice(start, end);
}

/**
 * Deterministic Google Cloud Pub/Sub resource ID (`${prefix}-${environment}-${slug}`, with `-dlq` / `-dlq-sub` suffixes
 * for dead-letter resources). Guarantees Pub/Sub naming rules: starts with a letter, never starts with `goog`, and is
 * <= 255 characters (with deterministic 8-char SHA-1 suffix when truncated).
 */
export function GcpResourceName(prefix: string, environment: string, logicalName: string, kind: GcpResourceKind): string {
    const slug = ToGcpResourceSlug(logicalName);
    const suffix = kind === 'DeadLetterTopic' ? '-dlq' : kind === 'DeadLetterSubscription' ? '-dlq-sub' : '';
    let raw = `${ToGcpResourceSlug(prefix)}-${ToGcpResourceSlug(environment)}-${slug}${suffix}`;
    if (!/^[a-zA-Z]/.test(raw) || raw.startsWith('goog')) {
        raw = `wq-${raw}`;
    }
    if (raw.length <= GCP_RESOURCE_MAX_NAME_LENGTH) {
        return raw;
    }
    const hash = createHash('sha1').update(`${kind}:${logicalName}`).digest('hex').slice(0, 8);
    const keep = GCP_RESOURCE_MAX_NAME_LENGTH - hash.length - suffix.length - 1;
    return `${raw.slice(0, keep)}-${hash}${suffix}`;
}
