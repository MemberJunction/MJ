import { describe, it, expect } from 'vitest';
import { ToRestPublishResult } from '@memberjunction/work-queue-core';
import {
    BodyErrorResult, DEFAULT_BODY_LIMIT, DEFAULT_MAX_BATCH, IsValidTopicName, ParsePublishBody, ParseServerSettings, ToPublishResponseBody,
} from '../publishRequests';

describe('ParsePublishBody', () => {
    it("maps every camelCase field onto a PublishRequest through core's shared mapping", () => {
        const parsed = ParsePublishBody({
            messages: [{
                messageId: 'BBBBBBBB-2222-4222-8222-000000000001', partitionKey: 'subscriber-9',
                attributes: { eventType: 'click' }, payload: { url: 'https://x', n: [1, 2] },
                correlationId: 'corr-1', deduplicationKey: 'sg:abc', deduplicationTtlSeconds: 3600,
            }, {
                payloadRef: { uri: 's3://bucket/batch-7.jsonl', contentType: 'application/jsonl', sizeBytes: 1024, checksum: 'sha256:ab' },
            }],
        }, 100);
        expect(parsed).toEqual({
            Success: true,
            Requests: [{
                MessageID: 'BBBBBBBB-2222-4222-8222-000000000001', PartitionKey: 'subscriber-9',
                Attributes: { eventType: 'click' }, Payload: { url: 'https://x', n: [1, 2] }, CorrelationID: 'corr-1',
                DeduplicationKey: 'sg:abc', DeduplicationTTLSeconds: 3600,
            }, {
                PayloadRef: { Uri: 's3://bucket/batch-7.jsonl', ContentType: 'application/jsonl', SizeBytes: 1024, Checksum: 'sha256:ab' },
            }],
        });
    });

    it('rejects a body that is not an object with a messages array', () => {
        expect(ParsePublishBody([], 100).Success).toBe(false);
        expect(ParsePublishBody({ topic: 'x' }, 100).Success).toBe(false);
        expect(ParsePublishBody(null, 100).Success).toBe(false);
    });

    it("applies the extension's MaxBatch on top of core's 1–100", () => {
        expect(ParsePublishBody({ messages: [] }, 3).Success).toBe(false);
        expect(ParsePublishBody({ messages: [{}, {}, {}] }, 3).Success).toBe(true);
        expect(ParsePublishBody({ messages: [{}, {}, {}, {}] }, 3)).toEqual({ Success: false, Error: '"messages" must contain between 1 and 3 items' });
    });

    it('reports the offending item when a property has the wrong JSON type', () => {
        const parsed = ParsePublishBody({ messages: [{}, { correlationId: 7 }] }, 100);
        expect(parsed.Success).toBe(false);
        expect(parsed.Success ? '' : parsed.Error).toContain('messages[1]');
    });
});

describe('IsValidTopicName', () => {
    it('accepts dotted names and refuses anything that could break a log line or a path', () => {
        expect(IsValidTopicName('email.events')).toBe(true);
        expect(IsValidTopicName('Integration_Batch-Ready.v2')).toBe(true);
        expect(IsValidTopicName('')).toBe(false);
        expect(IsValidTopicName('email.events\nFAKE LOG LINE')).toBe(false);
        expect(IsValidTopicName('../admin')).toBe(false);
        expect(IsValidTopicName('a b')).toBe(false);
        expect(IsValidTopicName('x'.repeat(201))).toBe(false);
    });
});

describe('ParseServerSettings', () => {
    it('defaults the batch size and body limit', () => {
        expect(ParseServerSettings({})).toEqual({ MaxBatch: DEFAULT_MAX_BATCH, BodyLimit: DEFAULT_BODY_LIMIT });
    });

    it('accepts overrides and rejects an invalid batch size', () => {
        expect(ParseServerSettings({ MaxBatch: 25, BodyLimit: ' 5mb ' })).toEqual({ MaxBatch: 25, BodyLimit: '5mb' });
        expect(() => ParseServerSettings({ MaxBatch: 500 })).toThrow('Settings.MaxBatch must be an integer between 1 and 100');
    });
});

describe('ToPublishResponseBody', () => {
    it("is core's ToRestPublishResult per item — PascalCase status values, camelCase fields (03 §9)", () => {
        const results = [
            { MessageID: 'm-1', Status: 'Accepted' as const },
            { MessageID: 'm-0', Status: 'Duplicate' as const },
            { MessageID: 'm-3', Status: 'Rejected' as const, Error: { Code: 'PayloadTooLarge', Message: 'too big', Retryable: false } },
        ];
        const body = ToPublishResponseBody(results);
        expect(body).toEqual({ results: results.map(ToRestPublishResult) });
        expect(body.results.map(r => r.status)).toEqual(['Accepted', 'Duplicate', 'Rejected']);
        expect(body.results[2].error).toEqual({ code: 'PayloadTooLarge', message: 'too big', retryable: false });
    });
});

describe('BodyErrorResult', () => {
    it('tells an oversized body, malformed JSON and an unreadable body apart', () => {
        expect(BodyErrorResult({ status: 413, type: 'entity.too.large' }, '30mb')).toEqual({ Status: 413, Body: { error: 'Request body exceeds 30mb' } });
        expect(BodyErrorResult({ status: 400, type: 'entity.parse.failed' }, '30mb')).toEqual({ Status: 400, Body: { error: 'Request body must be valid JSON' } });
        expect(BodyErrorResult(new SyntaxError('Unexpected token'), '30mb')).toEqual({ Status: 400, Body: { error: 'Request body must be valid JSON' } });
        expect(BodyErrorResult({ status: 415, type: 'charset.unsupported' }, '30mb')).toEqual({ Status: 400, Body: { error: 'Request body could not be read' } });
        expect(BodyErrorResult(new Error('request aborted'), '30mb')).toEqual({ Status: 400, Body: { error: 'Request body could not be read' } });
    });
});
