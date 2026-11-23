import { describe, it, expect } from 'vitest';
import { GCP_RESOURCE_MAX_NAME_LENGTH, GcpResourceName, ToGcpResourceSlug } from '../names';

describe('GCP Pub/Sub resource naming', () => {
    it('normalizes slugs and enforces letter start and non-goog prefix', () => {
        expect(ToGcpResourceSlug('Email.Events / Prod!')).toBe('email.events-prod');
        expect(GcpResourceName('mjwq', 'prod', 'email.events', 'Topic')).toBe('mjwq-prod-email.events');
        expect(GcpResourceName('mjwq', 'prod', 'email.events', 'DeadLetterTopic')).toBe('mjwq-prod-email.events-dlq');
        expect(GcpResourceName('mjwq', 'prod', 'email.events', 'DeadLetterSubscription')).toBe('mjwq-prod-email.events-dlq-sub');
        expect(GcpResourceName('123', 'prod', 'events', 'Topic')).toMatch(/^[a-zA-Z]/);
        expect(GcpResourceName('goog', 'prod', 'events', 'Topic')).not.toMatch(/^goog/);
    });

    it('truncates names exceeding 255 characters deterministically with hash suffix', () => {
        const longName = 'a'.repeat(300);
        const topic = GcpResourceName('mjwq', 'prod', longName, 'Topic');
        const dlqSub = GcpResourceName('mjwq', 'prod', longName, 'DeadLetterSubscription');
        expect(topic.length).toBeLessThanOrEqual(GCP_RESOURCE_MAX_NAME_LENGTH);
        expect(dlqSub.length).toBeLessThanOrEqual(GCP_RESOURCE_MAX_NAME_LENGTH);
        expect(dlqSub.endsWith('-dlq-sub')).toBe(true);
        expect(GcpResourceName('mjwq', 'prod', longName, 'Topic')).toBe(topic);
    });
});
