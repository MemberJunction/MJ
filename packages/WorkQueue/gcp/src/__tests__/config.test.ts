import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import {
    ExtractGcpResourceShortName,
    FormatGcpSubscriptionPath,
    FormatGcpTopicPath,
    ParseGcpTransportConfig,
    ReadGcpSubscriptionConfig,
    ReadGcpTopicConfig,
} from '../config';

describe('GCP config parsing', () => {
    it('parses valid transport configs including emulator mode', () => {
        expect(ParseGcpTransportConfig('{"ProjectId":"mj-wq-prod"}')).toEqual({
            ProjectId: 'mj-wq-prod',
            ApiEndpoint: null,
            UseEmulator: false,
        });
        expect(ParseGcpTransportConfig('{"ProjectId":"mj-wq-local","ApiEndpoint":"localhost:8085","UseEmulator":true}')).toEqual({
            ProjectId: 'mj-wq-local',
            ApiEndpoint: 'localhost:8085',
            UseEmulator: true,
        });
    });

    it('rejects invalid transport configs', () => {
        expect(() => ParseGcpTransportConfig(null)).toThrow(WorkQueueConfigurationError);
        expect(() => ParseGcpTransportConfig('{')).toThrow(WorkQueueConfigurationError);
        expect(() => ParseGcpTransportConfig('[]')).toThrow(WorkQueueConfigurationError);
        expect(() => ParseGcpTransportConfig('{}')).toThrow(WorkQueueConfigurationError);
        expect(() => ParseGcpTransportConfig('{"ProjectId":"mj-wq","UseEmulator":"yes"}')).toThrow(WorkQueueConfigurationError);
    });

    it('reads and validates topic and subscription bindings and formats resource paths', () => {
        expect(ReadGcpTopicConfig({ TopicName: 'email-events' })).toEqual({
            ProjectId: null,
            TopicName: 'email-events',
        });
        expect(() => ReadGcpTopicConfig({})).toThrow(WorkQueueConfigurationError);

        expect(ReadGcpSubscriptionConfig({
            ProjectId: 'mj-wq-prod',
            TopicName: 'email-events',
            SubscriptionName: 'email-sub',
            DeadLetterTopicName: 'email-events-dlq',
            DeadLetterSubscriptionName: 'email-sub-dlq',
            EnableMessageOrdering: true,
            AckDeadlineSeconds: 120,
        })).toEqual({
            ProjectId: 'mj-wq-prod',
            TopicName: 'email-events',
            SubscriptionName: 'email-sub',
            DeadLetterTopicName: 'email-events-dlq',
            DeadLetterSubscriptionName: 'email-sub-dlq',
            EnableMessageOrdering: true,
            AckDeadlineSeconds: 120,
        });

        expect(() => ReadGcpSubscriptionConfig({
            TopicName: 'email-events',
            SubscriptionName: 'email-sub',
            EnableMessageOrdering: 'true',
        })).toThrow(WorkQueueConfigurationError);

        expect(() => ReadGcpSubscriptionConfig({
            TopicName: 'email-events',
            SubscriptionName: 'email-sub',
            EnableMessageOrdering: false,
            AckDeadlineSeconds: 999,
        })).toThrow(WorkQueueConfigurationError);

        expect(FormatGcpTopicPath('p1', 't1')).toBe('projects/p1/topics/t1');
        expect(FormatGcpTopicPath('p1', 'projects/p2/topics/t2')).toBe('projects/p2/topics/t2');
        expect(FormatGcpSubscriptionPath('p1', 's1')).toBe('projects/p1/subscriptions/s1');
        expect(ExtractGcpResourceShortName('projects/p1/subscriptions/s1')).toBe('s1');
    });
});
