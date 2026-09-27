import { describe, it, expect } from 'vitest';
import { ParseEnvelopeBody, SerializeEnvelope, SessionIdFor } from '../envelope';
import { TestMessage } from '../testing/fixtures';

describe('ParseEnvelopeBody', () => {
    it('round-trips a string body and accepts an already-parsed object body', () => {
        const message = TestMessage(1, { PartitionKey: 'k', CorrelationID: 'c', PayloadRef: undefined });
        expect(ParseEnvelopeBody(SerializeEnvelope(message))).toEqual(message);
        expect(ParseEnvelopeBody(JSON.parse(SerializeEnvelope(message)))).toEqual(message);
        expect(ParseEnvelopeBody(new TextEncoder().encode(SerializeEnvelope(message)))).toEqual(message);
    });

    it('returns null for bodies that are not envelopes', () => {
        expect(ParseEnvelopeBody('not json')).toBeNull();
        expect(ParseEnvelopeBody('{"MessageID":""}')).toBeNull();
        expect(ParseEnvelopeBody({ MessageID: 'x', Topic: 't', PublishedAt: 'p', Attributes: { a: 1 } })).toBeNull();
        expect(ParseEnvelopeBody({ MessageID: 'x', Topic: 't', PublishedAt: 'p', Attributes: {}, PayloadRef: {} })).toBeNull();
        expect(ParseEnvelopeBody(42)).toBeNull();
    });
});

describe('SessionIdFor', () => {
    it('uses the partition key, the MessageID without one, and hashes keys over 128 characters', () => {
        expect(SessionIdFor(TestMessage(1, { PartitionKey: 'subscriber-9' }))).toBe('subscriber-9');
        expect(SessionIdFor(TestMessage(2))).toBe(TestMessage(2).MessageID);
        expect(SessionIdFor(TestMessage(3, { PartitionKey: 'k'.repeat(129) }))).toMatch(/^pk-[0-9a-f]{64}$/);
    });
});
