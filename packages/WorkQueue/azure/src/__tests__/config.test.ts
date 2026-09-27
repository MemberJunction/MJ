import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { ParseAzureTransportConfig, ReadAzureSubscriptionConfig, ReadAzureTopicConfig } from '../config';

describe('ParseAzureTransportConfig', () => {
    it('reads the namespace', () => {
        expect(ParseAzureTransportConfig('{"FullyQualifiedNamespace":"contoso.servicebus.windows.net"}')).toEqual({ FullyQualifiedNamespace: 'contoso.servicebus.windows.net' });
        expect(ParseAzureTransportConfig('{"FullyQualifiedNamespace":"gov.servicebus.usgovcloudapi.net"}').FullyQualifiedNamespace).toBe('gov.servicebus.usgovcloudapi.net');
    });

    it('rejects missing, malformed and non-object configuration', () => {
        expect(() => ParseAzureTransportConfig(null)).toThrow(WorkQueueConfigurationError);
        expect(() => ParseAzureTransportConfig('{')).toThrow('not valid JSON');
        expect(() => ParseAzureTransportConfig('[]')).toThrow('must be a JSON object');
        expect(() => ParseAzureTransportConfig('{"FullyQualifiedNamespace":"not a host"}')).toThrow("'FullyQualifiedNamespace' is missing or invalid");
        expect(() => ParseAzureTransportConfig('{"FullyQualifiedNamespace":"contoso"}')).toThrow(WorkQueueConfigurationError);
    });
});

describe('binding configs', () => {
    it('reads a topic binding and rejects an invalid entity name', () => {
        expect(ReadAzureTopicConfig({ TopicName: 'mj-wq-prod-email.events' })).toEqual({ TopicName: 'mj-wq-prod-email.events' });
        expect(() => ReadAzureTopicConfig({ TopicName: 'has space' })).toThrow(WorkQueueConfigurationError);
        expect(() => ReadAzureTopicConfig({})).toThrow("'TopicName' is missing or invalid");
    });

    it('reads a subscription binding with its session flag', () => {
        const config = { FullyQualifiedNamespace: 'contoso.servicebus.windows.net', TopicName: 't', SubscriptionName: 's', RequiresSession: true };
        expect(ReadAzureSubscriptionConfig(config)).toEqual(config);
        expect(() => ReadAzureSubscriptionConfig({ ...config, RequiresSession: 'yes' })).toThrow("'RequiresSession' must be a boolean");
        expect(() => ReadAzureSubscriptionConfig({ ...config, SubscriptionName: 'x'.repeat(51) })).toThrow("'SubscriptionName' is missing or invalid");
    });
});
