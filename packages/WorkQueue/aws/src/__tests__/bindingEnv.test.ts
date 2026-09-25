import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { ParseSubscriptionBindingEnv } from '../lambda/bindingEnv';
import { TestSubscriptionBinding } from '../testing/fixtures';

describe('ParseSubscriptionBindingEnv', () => {
    it('parses a binding produced by the Terraform module', () => {
        const binding = TestSubscriptionBinding(true, { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'unsubscribe' }] } });
        expect(ParseSubscriptionBindingEnv(JSON.stringify(binding))).toEqual(binding);
    });

    it('rejects a missing or unparseable value', () => {
        expect(() => ParseSubscriptionBindingEnv(undefined)).toThrow(WorkQueueConfigurationError);
        expect(() => ParseSubscriptionBindingEnv('{')).toThrow('MJ_WQ_SUBSCRIPTION is not valid JSON');
    });

    it('rejects an invalid policy or queue binding', () => {
        const binding = TestSubscriptionBinding(true);
        expect(() => ParseSubscriptionBindingEnv(JSON.stringify({ ...binding, Policy: { ...binding.Policy, PartitionMode: 'Sorted' } })))
            .toThrow("Policy.PartitionMode");
        expect(() => ParseSubscriptionBindingEnv(JSON.stringify({ ...binding, Policy: { ...binding.Policy, LeaseSeconds: '60' } })))
            .toThrow("Policy.LeaseSeconds");
        expect(() => ParseSubscriptionBindingEnv(JSON.stringify({ ...binding, Config: {} }))).toThrow("'IsFifo' must be a boolean");
    });

    it('rejects an Ordered subscription: Ordered requires the Database transport', () => {
        const binding = TestSubscriptionBinding(true);
        expect(() => ParseSubscriptionBindingEnv(JSON.stringify({ ...binding, Policy: { ...binding.Policy, PartitionMode: 'Ordered' } })))
            .toThrow('Ordered requires the Database transport');
    });
});
