import { createHash } from 'node:crypto';

export type AwsResourceKind = 'Topic' | 'Queue' | 'DeadLetterQueue';

export const SQS_MAX_NAME_LENGTH = 80;
export const SNS_MAX_NAME_LENGTH = 256;

/** Lowercase; every character outside [a-z0-9_-] becomes '-'; runs of '-' collapse; leading/trailing '-' trimmed. */
export function ToResourceSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * `${prefix}-${environment}-${slug}` + '-dlq' for dead-letter queues + '.fifo' when FIFO.
 * Names over the service limit keep a prefix and end with '-' + the first 8 hex chars of SHA-1(logicalName).
 * Terraform (infrastructure/terraform/work-queue/aws/locals.tf) implements the same rule.
 */
export function AwsResourceName(prefix: string, environment: string, logicalName: string, kind: AwsResourceKind, isFifo: boolean): string {
    const base = `${prefix}-${environment}-${ToResourceSlug(logicalName)}`;
    const suffix = kind === 'DeadLetterQueue' ? '-dlq' : '';
    const fifo = isFifo ? '.fifo' : '';
    const max = kind === 'Topic' ? SNS_MAX_NAME_LENGTH : SQS_MAX_NAME_LENGTH;
    if (base.length + suffix.length + fifo.length <= max) {
        return `${base}${suffix}${fifo}`;
    }
    const hash = createHash('sha1').update(logicalName).digest('hex').slice(0, 8);
    const keep = max - suffix.length - fifo.length - hash.length - 1;
    return `${base.slice(0, keep)}-${hash}${suffix}${fifo}`;
}
