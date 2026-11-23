import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { ParseAzureTransportConfig, ReadAzureSubscriptionConfig, ReadAzureTopicConfig } from '../config';

describe('ParseAzureTransportConfig', () => {
    it('reads Namespace, optional Endpoint, and UseEmulator flag', () => {
        expect(ParseAzureTransportConfig('{"Namespace":"mj-wq.servicebus.windows.net"}')).toEqual({
            Namespace: 'mj-wq.servicebus.windows.net',
            Endpoint: null,
            UseEmulator: false,
        });
        expect(ParseAzureTransportConfig('{"Namespace":"localhost","Endpoint":"sb://localhost","UseEmulator":true}')).toEqual({
            Namespace: 'localhost',
            Endpoint: 'sb://localhost',
            UseEmulator: true,
        });
    });

    it('accepts Endpoint-only emulator configuration and rejects missing or malformed configs', () => {
        expect(ParseAzureTransportConfig('{"Endpoint":"sb://localhost:5672","UseEmulator":true}')).toEqual({
            Namespace: null,
            Endpoint: 'sb://localhost:5672',
            UseEmulator: true,
        });
        expect(() => ParseAzureTransportConfig(null)).toThrow(WorkQueueConfigurationError);
        expect(() => ParseAzureTransportConfig('not json')).toThrow('Azure transport Configuration is not valid JSON');
        expect(() => ParseAzureTransportConfig('{}')).toThrow("requires 'Namespace' or 'Endpoint'");
        expect(() => ParseAzureTransportConfig('{"Namespace":"bad"}')).toThrow("'Namespace'");
    });
});

describe('ReadAzureTopicConfig', () => {
    it('reads a valid Service Bus topic name and rejects missing/invalid bindings', () => {
        expect(ReadAzureTopicConfig({ ServiceBusTopicName: 'mj-wq-prod-email-events' })).toEqual({
            ServiceBusTopicName: 'mj-wq-prod-email-events',
        });
        expect(() => ReadAzureTopicConfig({})).toThrow("'ServiceBusTopicName'");
        expect(() => ReadAzureTopicConfig({ ServiceBusTopicName: '-bad-' })).toThrow("'ServiceBusTopicName'");
    });
});

describe('ReadAzureSubscriptionConfig', () => {
    it('reads valid subscription bindings with defaults and rejects invalid fields', () => {
        expect(ReadAzureSubscriptionConfig({
            ServiceBusTopicName: 'mj-wq-prod-email-events',
            SubscriptionName: 'email-unsubscribe',
            RequiresSession: true,
        })).toEqual({
            Namespace: null,
            ServiceBusTopicName: 'mj-wq-prod-email-events',
            SubscriptionName: 'email-unsubscribe',
            RequiresSession: true,
            LockDurationSeconds: 60,
        });

        expect(() => ReadAzureSubscriptionConfig({ ServiceBusTopicName: 't', SubscriptionName: 's' })).toThrow("'RequiresSession'");
        expect(() => ReadAzureSubscriptionConfig({
            ServiceBusTopicName: 't',
            SubscriptionName: 's',
            RequiresSession: false,
            LockDurationSeconds: 999,
        })).toThrow("'LockDurationSeconds'");
    });
});
