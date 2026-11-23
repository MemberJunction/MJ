import { describe, it, expect } from 'vitest';
import {
    AzureResourceName,
    SERVICE_BUS_SUBSCRIPTION_MAX_NAME_LENGTH,
    SERVICE_BUS_TOPIC_MAX_NAME_LENGTH,
    ToAzureResourceSlug,
} from '../names';

describe('ToAzureResourceSlug and AzureResourceName', () => {
    it('normalizes dotted names into lowercase slugs', () => {
        expect(ToAzureResourceSlug('Email.Events_V2')).toBe('email-events_v2');
        expect(ToAzureResourceSlug('---Hello..World---')).toBe('hello-world');
    });

    it('builds deterministic names within Azure Service Bus topic and subscription limits', () => {
        expect(AzureResourceName('mj-wq', 'prod', 'email.events', 'Topic')).toBe('mj-wq-prod-email-events');
        expect(AzureResourceName('mj-wq', 'prod', 'email.unsubscribe', 'Subscription')).toBe('mj-wq-prod-email-unsubscribe');

        const longLogical = 'very.long.domain.namespace.subscription.name.exceeding.fifty.characters';
        const subName = AzureResourceName('mj-wq', 'prod', longLogical, 'Subscription');
        expect(subName.length).toBeLessThanOrEqual(SERVICE_BUS_SUBSCRIPTION_MAX_NAME_LENGTH);
        expect(subName).toBe(AzureResourceName('mj-wq', 'prod', longLogical, 'Subscription'));

        const veryLongTopic = 'a.'.repeat(200) + 'events';
        const topicName = AzureResourceName('mj-wq', 'prod', veryLongTopic, 'Topic');
        expect(topicName.length).toBeLessThanOrEqual(SERVICE_BUS_TOPIC_MAX_NAME_LENGTH);
    });
});
