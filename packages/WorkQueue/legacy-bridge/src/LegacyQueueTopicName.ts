/** Work-queue topics that legacy queue types route to are named `mjqueue.<queue type slug>`. */
export const LEGACY_QUEUE_TOPIC_PREFIX = 'mjqueue.';

/** HandlerKey of the work-queue subscription that runs routed legacy tasks through their QueueBase driver. */
export const LEGACY_QUEUE_HANDLER_KEY = 'MJQueue.LegacyQueueDriver';

/**
 * Lower-cases the name and collapses every non-alphanumeric run to '-'. Names that differ only in punctuation
 * or case ('AI Action', 'AI-Action') therefore share a topic; the payload still carries the exact queue type
 * name, so the right driver runs. A name with no letters or digits has no usable slug and is rejected, because
 * 'mjqueue.' is not a valid topic name.
 */
export function LegacyQueueTypeSlug(queueTypeName: string): string {
    const slug = queueTypeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug.length === 0) {
        throw new Error(`Queue type name '${queueTypeName}' has no letters or digits, so it has no work-queue topic`);
    }
    return slug;
}

export function LegacyQueueTopicName(queueTypeName: string): string {
    return `${LEGACY_QUEUE_TOPIC_PREFIX}${LegacyQueueTypeSlug(queueTypeName)}`;
}
