import { describe, it, expect } from 'vitest';
import { AwsResourceName, SQS_MAX_NAME_LENGTH, ToResourceSlug } from '../names';

describe('ToResourceSlug', () => {
    it('lowercases, replaces unsupported characters and trims hyphens', () => {
        expect(ToResourceSlug('Email.Unsubscribe  Handler!')).toBe('email-unsubscribe-handler');
    });
});

describe('AwsResourceName', () => {
    it('names a standard queue', () => {
        expect(AwsResourceName('mj-wq', 'prod', 'email.unsubscribe', 'Queue', false)).toBe('mj-wq-prod-email-unsubscribe');
    });

    it('names a FIFO dead-letter queue', () => {
        expect(AwsResourceName('mj-wq', 'prod', 'Integration Apply', 'DeadLetterQueue', true)).toBe('mj-wq-prod-integration-apply-dlq.fifo');
    });

    it('names a FIFO topic', () => {
        expect(AwsResourceName('mj-wq', 'prod', 'email.events', 'Topic', true)).toBe('mj-wq-prod-email-events.fifo');
    });

    it('shortens an over-long queue name with a stable hash of the logical name', () => {
        const name = AwsResourceName('mj-wq', 'prod', 'a'.repeat(90), 'Queue', true);
        expect(name).toBe(`mj-wq-prod-${'a'.repeat(55)}-ec270642.fifo`);
        expect(name).toHaveLength(SQS_MAX_NAME_LENGTH);
    });
});
