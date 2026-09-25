import { describe, it, expect } from 'vitest';
import type { WorkMessage } from '@memberjunction/work-queue-core';
import { IsWorkJson, MessageGroupIdFor, ParseEnvelopeBody, SerializeEnvelope } from '../envelope';

const MESSAGE: WorkMessage = {
    MessageID: '5b0c7f4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    Topic: 'integration.batch-ready',
    PartitionKey: 'integration-42',
    Attributes: { source: 'hubspot' },
    PayloadRef: { Uri: 's3://staging/batch-7.jsonl', SizeBytes: 1024 },
    CorrelationID: 'corr-1',
    PublishedAt: '2026-09-16T12:00:00.000Z',
};

describe('envelope serialization', () => {
    it('round-trips a message', () => {
        expect(ParseEnvelopeBody(SerializeEnvelope(MESSAGE))).toEqual(MESSAGE);
    });

    it('returns null for text that is not JSON or not an envelope', () => {
        expect(ParseEnvelopeBody('not json')).toBeNull();
        expect(ParseEnvelopeBody('[1,2]')).toBeNull();
        expect(ParseEnvelopeBody('{"Topic":"x","Attributes":{},"PublishedAt":"t"}')).toBeNull();
    });

    it('rejects non-string attribute values and non-string optional scalars', () => {
        expect(ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, Attributes: { a: 1 } }))).toBeNull();
        expect(ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, PartitionKey: 42 }))).toBeNull();
        expect(ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, CorrelationID: false }))).toBeNull();
    });

    it('drops unknown fields', () => {
        const parsed = ParseEnvelopeBody(JSON.stringify({ ...MESSAGE, Extra: 'ignored' }));
        expect(parsed).toEqual(MESSAGE);
    });
});

describe('MessageGroupIdFor', () => {
    it('uses the partition key, or the message ID without one', () => {
        expect(MessageGroupIdFor(MESSAGE)).toBe('integration-42');
        const { PartitionKey: _omitted, ...unkeyed } = MESSAGE;
        expect(MessageGroupIdFor(unkeyed)).toBe(MESSAGE.MessageID);
    });

    it('hashes keys that are too long or not printable ASCII', () => {
        expect(MessageGroupIdFor({ ...MESSAGE, PartitionKey: 'x'.repeat(129) }))
            .toBe('pk-0ec9eb33e74510bcdd1f2ea55206e82f21649c5c2becbf2b433eb475b34c01bd');
        expect(MessageGroupIdFor({ ...MESSAGE, PartitionKey: 'café' })).toMatch(/^pk-[0-9a-f]{64}$/);
    });
});

describe('IsWorkJson', () => {
    it('accepts nested JSON values and rejects functions and undefined', () => {
        expect(IsWorkJson({ a: [1, 'two', null, { b: true }] })).toBe(true);
        expect(IsWorkJson(undefined)).toBe(false);
        expect(IsWorkJson({ f: () => 1 })).toBe(false);
    });
});
