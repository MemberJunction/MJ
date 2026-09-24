import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { ParseJsonObject, ValidateSubscriptionFields, ValidateTopicFields, ValidateTransportFields } from '../entities/validation';
import {
    SUBSCRIPTION_ROW_FIXTURE as SUBSCRIPTION_ROW,
    TOPIC_ROW_FIXTURE as TOPIC_ROW,
    TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW,
} from '../testing/rowFixtures';

describe('ParseJsonObject', () => {
    it('returns an empty object for null or blank text', () => {
        expect(ParseJsonObject(null, 'x')).toEqual({});
        expect(ParseJsonObject('  ', 'x')).toEqual({});
    });

    it('parses objects and rejects arrays, scalars and invalid JSON', () => {
        expect(ParseJsonObject('{"Region":"us-east-1"}', 'x')).toEqual({ Region: 'us-east-1' });
        expect(() => ParseJsonObject('[1]', 'Topic t BindingConfig')).toThrow('Topic t BindingConfig must be a JSON object');
        expect(() => ParseJsonObject('{', 'x')).toThrow(WorkQueueConfigurationError);
    });
});

describe('ValidateTransportFields', () => {
    it('accepts a valid transport and rejects non-object configuration', () => {
        expect(ValidateTransportFields(TRANSPORT_ROW)).toEqual([]);
        expect(ValidateTransportFields({ ...TRANSPORT_ROW, Configuration: '"x"' })[0].Field).toBe('Configuration');
    });
});

describe('ValidateTopicFields', () => {
    it('accepts dotted lowercase names', () => {
        expect(ValidateTopicFields(TOPIC_ROW)).toEqual([]);
        expect(ValidateTopicFields({ ...TOPIC_ROW, Name: 'email.events-v2' })).toEqual([]);
    });

    it('rejects names with spaces, capitals or dangling separators', () => {
        for (const name of ['Email Events', 'Email.events', 'email.', '.email']) {
            expect(ValidateTopicFields({ ...TOPIC_ROW, Name: name })[0].Field).toBe('Name');
        }
    });

    it('rejects a non-object binding', () => {
        expect(ValidateTopicFields({ ...TOPIC_ROW, BindingConfig: '[]' })[0].Field).toBe('BindingConfig');
    });
});

describe('ValidateSubscriptionFields', () => {
    it('accepts a valid subscription', () => {
        expect(ValidateSubscriptionFields(SUBSCRIPTION_ROW)).toEqual([]);
    });

    it('requires a handler key for MJ workers but not external hosts', () => {
        expect(ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, HandlerKey: '  ' })[0].Field).toBe('HandlerKey');
        expect(ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, HostType: 'External', HandlerKey: null })).toEqual([]);
    });

    it('accepts a CompositeFilterDescriptor filter in the supported subset', () => {
        const filter = '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"click"}]}';
        expect(ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, Filter: filter })).toEqual([]);
    });

    it('reports a filter that is not a CompositeFilterDescriptor or uses an unsupported operator', () => {
        expect(ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, Filter: '{"eventType":"click"}' })[0].Field).toBe('Filter');
        const contains = '{"logic":"and","filters":[{"field":"url","operator":"contains","value":"x"}]}';
        const issue = ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, Filter: contains })[0];
        expect(issue.Field).toBe('Filter');
        expect(issue.Message).toContain('contains');
    });

    it('checks backoff ordering and positive optional durations', () => {
        const fields = ValidateSubscriptionFields({
            ...SUBSCRIPTION_ROW, BackoffBaseSeconds: 60, BackoffMaxSeconds: 10, MaxProcessingSeconds: 0,
        }).map(i => i.Field);
        expect(fields).toEqual(['BackoffMaxSeconds', 'MaxProcessingSeconds']);
    });
});
