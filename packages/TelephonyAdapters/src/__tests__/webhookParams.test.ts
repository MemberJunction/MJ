import { describe, it, expect } from 'vitest';
import { CoerceWebhookParams } from '../telephony/webhookParams.js';

describe('CoerceWebhookParams', () => {
    it('keeps strings and stringifies numbers and booleans', () => {
        const params = CoerceWebhookParams({ CallSid: 'CA1', duration: 12, answered: true, nested: { a: 1 }, list: ['x'], empty: null });
        expect({ ...params }).toEqual({ CallSid: 'CA1', duration: '12', answered: 'true' });
    });

    it('returns an empty map for a non-object body', () => {
        for (const body of [undefined, null, 'text', 42]) {
            expect(Object.keys(CoerceWebhookParams(body))).toEqual([]);
        }
    });

    it('never copies prototype-reaching keys', () => {
        const hostile = JSON.parse('{"__proto__":"polluted","constructor":"x","prototype":"y","CallSid":"CA2"}') as Record<string, unknown>;
        const params = CoerceWebhookParams(hostile);
        expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
        expect(Object.keys(params)).toEqual(['CallSid']);
        expect(params['CallSid']).toBe('CA2');
        expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });
});
