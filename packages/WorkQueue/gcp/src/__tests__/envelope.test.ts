import { describe, it, expect } from 'vitest';
import { BodyAsString, OrderingKeyFor, ParseEnvelopeBody, SerializeEnvelope } from '../envelope';
import { TestMessage } from '../testing/fixtures';

describe('GCP Pub/Sub envelope serialization & parsing', () => {
    it('round-trips envelopes from string, Buffer, Uint8Array, and object', () => {
        const msg = TestMessage(1, { PartitionKey: 'tenant-1', CorrelationID: 'corr-1' });
        const json = SerializeEnvelope(msg);
        expect(ParseEnvelopeBody(json)).toEqual(msg);
        expect(ParseEnvelopeBody(Buffer.from(json, 'utf8'))).toEqual(msg);
        expect(ParseEnvelopeBody(new Uint8Array(Buffer.from(json, 'utf8')))).toEqual(msg);
        expect(ParseEnvelopeBody(msg)).toEqual(msg);
    });

    it('returns null for invalid or malformed envelopes', () => {
        expect(ParseEnvelopeBody('not json')).toBeNull();
        expect(ParseEnvelopeBody('[]')).toBeNull();
        expect(ParseEnvelopeBody(JSON.stringify({ Topic: 'x' }))).toBeNull();
        expect(ParseEnvelopeBody(JSON.stringify({ MessageID: '1', Topic: 'x', Attributes: { a: 1 }, PublishedAt: 'now' }))).toBeNull();
        expect(ParseEnvelopeBody(JSON.stringify({ MessageID: '1', Topic: 'x', Attributes: {}, PublishedAt: 'now', PayloadRef: { SizeBytes: 10 } }))).toBeNull();
    });

    it('converts arbitrary bodies to string and hashes oversized ordering keys', () => {
        expect(BodyAsString('hello')).toBe('hello');
        expect(BodyAsString(Buffer.from('buf'))).toBe('buf');
        expect(BodyAsString(new Uint8Array(Buffer.from('u8')))).toBe('u8');
        expect(BodyAsString(undefined)).toBe('');
        expect(BodyAsString({ ok: true })).toBe('{"ok":true}');

        const short = TestMessage(1, { PartitionKey: 'tenant-1' });
        expect(OrderingKeyFor(short)).toBe('tenant-1');
        const huge = TestMessage(2, { PartitionKey: 'k'.repeat(2000) });
        expect(OrderingKeyFor(huge)).toMatch(/^pk-[0-9a-f]{64}$/);
    });
});
