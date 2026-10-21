import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { ParseAwsTransportConfig, ReadAwsSubscriptionConfig, ReadAwsTopicConfig } from '../config';

const FULL_SUBSCRIPTION = {
    Region: 'us-east-1',
    QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/mj-wq-prod-integration-apply.fifo',
    QueueArn: 'arn:aws:sqs:us-east-1:123456789012:mj-wq-prod-integration-apply.fifo',
    DeadLetterQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/mj-wq-prod-integration-apply-dlq.fifo',
    DeadLetterQueueArn: 'arn:aws:sqs:us-east-1:123456789012:mj-wq-prod-integration-apply-dlq.fifo',
    IsFifo: true,
    SnsSubscriptionArn: 'arn:aws:sns:us-east-1:123456789012:mj-wq-prod-integration-batch-ready.fifo:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
};

describe('ParseAwsTransportConfig', () => {
    it('reads the region and an optional endpoint', () => {
        expect(ParseAwsTransportConfig('{"Region":"us-east-1"}')).toEqual({ Region: 'us-east-1', Endpoint: null });
        expect(ParseAwsTransportConfig('{"Region":"eu-west-2","Endpoint":"http://localhost:4566"}'))
            .toEqual({ Region: 'eu-west-2', Endpoint: 'http://localhost:4566' });
    });

    it('rejects missing or malformed configuration', () => {
        expect(() => ParseAwsTransportConfig(null)).toThrow(WorkQueueConfigurationError);
        expect(() => ParseAwsTransportConfig('not json')).toThrow('AWS transport Configuration is not valid JSON');
        expect(() => ParseAwsTransportConfig('{"Region":"Ohio"}')).toThrow("'Region'");
        expect(() => ParseAwsTransportConfig('{"Region":"us-east-1","Endpoint":"localhost"}')).toThrow("'Endpoint'");
    });
});

describe('ReadAwsTopicConfig', () => {
    it('reads a standard or FIFO topic ARN', () => {
        expect(ReadAwsTopicConfig({ SnsTopicArn: 'arn:aws:sns:us-east-1:123456789012:mj-wq-prod-email-events' }))
            .toEqual({ SnsTopicArn: 'arn:aws:sns:us-east-1:123456789012:mj-wq-prod-email-events' });
        expect(ReadAwsTopicConfig({ SnsTopicArn: 'arn:aws:sns:us-east-1:123456789012:mj-wq-prod-batch.fifo' }).SnsTopicArn)
            .toContain('.fifo');
    });

    it('reports a topic without a binding', () => {
        expect(() => ReadAwsTopicConfig({})).toThrow("'SnsTopicArn'");
    });
});

describe('ReadAwsSubscriptionConfig', () => {
    it('reads a complete binding', () => {
        expect(ReadAwsSubscriptionConfig(FULL_SUBSCRIPTION)).toEqual(FULL_SUBSCRIPTION);
    });

    it('defaults SnsSubscriptionArn to null', () => {
        const { SnsSubscriptionArn: _omitted, ...rest } = FULL_SUBSCRIPTION;
        expect(ReadAwsSubscriptionConfig(rest).SnsSubscriptionArn).toBeNull();
    });

    it('rejects an IsFifo flag that disagrees with the queue ARNs', () => {
        expect(() => ReadAwsSubscriptionConfig({ ...FULL_SUBSCRIPTION, IsFifo: false })).toThrow('IsFifo');
    });

    it('rejects a non-boolean IsFifo', () => {
        expect(() => ReadAwsSubscriptionConfig({ ...FULL_SUBSCRIPTION, IsFifo: 'true' })).toThrow("'IsFifo' must be a boolean");
    });
});
