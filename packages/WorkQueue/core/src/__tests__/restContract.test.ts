import { describe, it, expect } from 'vitest';
import {
    FromRestPublishRequest,
    IsWorkJson,
    ParseRestPublishBody,
    ParseRestPublishResponse,
    ToRestPublishRequest,
    ToRestPublishResult,
} from '../api/restContract';
import type { PublishRequest } from '../publishing';

const FULL_REQUEST: PublishRequest = {
    MessageID: '6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60',
    PartitionKey: 'integration-42',
    Attributes: { source: 'hubspot' },
    PayloadRef: { Uri: 's3://bucket/batch-3.jsonl', ContentType: 'application/x-ndjson', SizeBytes: 2048, Checksum: 'sha256:abc' },
    CorrelationID: 'corr-7',
    DeduplicationKey: 'batch:3',
    DeduplicationTTLSeconds: 86400,
};

describe('REST request mapping', () => {
    it('round-trips a request and uses camelCase JSON names', () => {
        const json = ToRestPublishRequest(FULL_REQUEST);
        expect(json).toEqual({
            messageId: FULL_REQUEST.MessageID,
            partitionKey: 'integration-42',
            attributes: { source: 'hubspot' },
            payloadRef: { uri: 's3://bucket/batch-3.jsonl', contentType: 'application/x-ndjson', sizeBytes: 2048, checksum: 'sha256:abc' },
            correlationId: 'corr-7',
            deduplicationKey: 'batch:3',
            deduplicationTtlSeconds: 86400,
        });
        expect(FromRestPublishRequest(json)).toEqual(FULL_REQUEST);
        expect(ToRestPublishRequest({})).toEqual({});
    });

    it('parses a valid body', () => {
        const parsed = ParseRestPublishBody({ messages: [{ attributes: { eventType: 'click' }, payload: { url: 'https://x', n: [1, null, true] } }, {}] });
        expect(parsed).toEqual({
            Kind: 'Parsed',
            Requests: [{ Attributes: { eventType: 'click' }, Payload: { url: 'https://x', n: [1, null, true] } }, {}],
        });
    });

    it('rejects malformed bodies with a reason', () => {
        const invalidBodies: unknown[] = [
            null,
            {},
            { messages: [] },
            { messages: Array.from({ length: 101 }, () => ({})) },
            { messages: ['text'] },
            { messages: [{ attributes: { a: 1 } }] },
            { messages: [{ deduplicationTtlSeconds: '60' }] },
            { messages: [{ payloadRef: {} }] },
            { messages: [{ messageId: 7 }] },
        ];
        for (const body of invalidBodies) {
            expect(ParseRestPublishBody(body).Kind).toBe('Invalid');
        }
        expect(ParseRestPublishBody({ messages: [{}, { deduplicationTtlSeconds: 'x' }] })).toEqual({ Kind: 'Invalid', Error: 'messages[1]: "deduplicationTtlSeconds" must be a number' });
    });
});

describe('REST result mapping', () => {
    it('includes an error only when present', () => {
        expect(ToRestPublishResult({ MessageID: 'm1', Status: 'Accepted' })).toEqual({ messageId: 'm1', status: 'Accepted' });
        expect(ToRestPublishResult({ MessageID: 'm2', Status: 'Rejected', Error: { Code: 'InvalidAttributes', Message: 'bad', Retryable: false } }))
            .toEqual({ messageId: 'm2', status: 'Rejected', error: { code: 'InvalidAttributes', message: 'bad', retryable: false } });
    });

    it('parses responses and rejects count mismatches or malformed items', () => {
        expect(ParseRestPublishResponse({ results: [{ messageId: 'm1', status: 'accepted' }] }, 1)).toEqual([{ MessageID: 'm1', Status: 'Accepted' }]);
        expect(ParseRestPublishResponse({ results: [] }, 1)).toBeNull();
        expect(ParseRestPublishResponse({ results: [{ messageId: 'm1', status: 'maybe' }] }, 1)).toBeNull();
        expect(ParseRestPublishResponse({ results: [{ status: 'Accepted' }] }, 1)).toBeNull();
        expect(ParseRestPublishResponse('nope', 1)).toBeNull();
    });

    it('recognises JSON values', () => {
        expect(IsWorkJson({ a: [1, 'b', null, { c: false }] })).toBe(true);
        expect(IsWorkJson(Number.NaN)).toBe(false);
        expect(IsWorkJson(undefined)).toBe(false);
    });
});
