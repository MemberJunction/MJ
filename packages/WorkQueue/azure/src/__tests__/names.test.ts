import { describe, it, expect } from 'vitest';
import { AzureEntityName, SERVICE_BUS_SUBSCRIPTION_MAX_NAME_LENGTH, ToResourceSlug } from '../names';

describe('AzureEntityName', () => {
    it('prefixes topics and leaves subscriptions bare', () => {
        expect(AzureEntityName('mj-wq', 'prod', 'email.events', 'Topic')).toBe('mj-wq-prod-email-events');
        expect(AzureEntityName('mj-wq', 'prod', 'email.unsubscribe', 'Subscription')).toBe('email-unsubscribe');
    });

    it('slugs like the AWS transport', () => {
        expect(ToResourceSlug('  Email  Events!! ')).toBe('email-events');
        expect(ToResourceSlug('a__b')).toBe('a__b');
    });

    it('shortens over-long names with a hash of the logical name', () => {
        const long = 'a'.repeat(90);
        const name = AzureEntityName('mj-wq', 'prod', long, 'Subscription');
        expect(name).toHaveLength(SERVICE_BUS_SUBSCRIPTION_MAX_NAME_LENGTH);
        expect(name).toMatch(/^a{41}-[0-9a-f]{8}$/);
        expect(AzureEntityName('mj-wq', 'prod', long, 'Subscription')).toBe(name);
    });
});
