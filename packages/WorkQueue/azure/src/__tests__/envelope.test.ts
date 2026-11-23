import { describe, it, expect } from 'vitest';
import type { WorkMessage } from '@memberjunction/work-queue-core';
import { BodyAsString, ParseEnvelopeBody, SerializeEnvelope, SessionIdFor } from '../envelope';

const VALID: WorkMessage = {
    MessageID: '11111111-1111-4111-8111-111111111111',
    Topic: 'email.events',
    PartitionKey: 'tenant-1',
    Attributes: { eventType: 'click' },
    Payload: { count: 2 },
    CorrelationID: 'corr-1',
    PublishedAt: '2026-09-16T12:00:00.000Z',
};

describe('envelope helpers', () => {
    it('serializes and parses string, Buffer, and pre-parsed object bodies', () => {
        const json = SerializeEnvelope(VALID);
        expect(ParseEnvelopeBody(json)).toEqual(VALID);
        expect(ParseEnvelopeBody(Buffer.from(json, 'utf8'))).toEqual(VALID);
        expect(ParseEnvelopeBody({ ...VALID })).toEqual(VALID);
    });

    it('returns null for malformed or non-envelope payloads', () => {
        expect(ParseEnvelopeBody('not-json')).toBeNull();
        expect(ParseEnvelopeBody({ MessageID: '', Topic: 'a', Attributes: {}, PublishedAt: 'x' })).toBeNull();
        expect(ParseEnvelopeBody({ MessageID: '1', Topic: 'a', Attributes: { k: 1 }, PublishedAt: 'x' })).toBeNull();
        expect(ParseEnvelopeBody({ ...VALID, PayloadRef: { ContentType: 'application/json' } })).toBeNull();
    });

    it('derives SessionId safely even for long or whitespace keys', () => {
        expect(SessionIdFor(VALID)).toBe('tenant-1');
        expect(SessionIdFor({ ...VALID, PartitionKey: undefined })).toBe(VALID.MessageID);
        const hashed = SessionIdFor({ ...VALID, PartitionKey: 'tenant with spaces' });
        expect(hashed).toMatch(/^pk-[0-9a-f]{64}$/);
    });

    it('converts arbitrary bodies to string safely', () => {
        expect(BodyAsString('hello')).toBe('hello');
        expect(BodyAsString(Buffer.from('buf', 'utf8'))).toBe('buf');
        expect(BodyAsString({ a: 1 })).toBe('{"a":1}');
        expect(BodyAsString(undefined)).toBe('');
    });
});
