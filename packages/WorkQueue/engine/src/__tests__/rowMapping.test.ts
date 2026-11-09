import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import {
    ClampPageSize, DecodeCursorField, EncodeCursor, IsUUID, MessageFromColumns,
    ParseAttributes, ParsePayload, ParsePayloadRef, SerializeProgress, TruncateNote,
} from '../transports/database/rowMapping';
import { ReadSubscriptionIDs, ReadTopicID } from '../transports/database/bindingIds';
import { SubscriptionBindingFixture, TopicBindingFixture } from './fakes';

describe('JSON column parsing', () => {
    it('parses attributes as a string map and rejects other shapes', () => {
        expect(ParseAttributes('{"eventType":"click"}')).toEqual({ eventType: 'click' });
        expect(ParseAttributes(null)).toEqual({});
        expect(() => ParseAttributes('{"n":1}')).toThrow(WorkQueueConfigurationError);
        expect(() => ParseAttributes('[1]')).toThrow(WorkQueueConfigurationError);
    });

    it('parses payloads and payload references', () => {
        expect(ParsePayload('{"importId":"x"}')).toEqual({ importId: 'x' });
        expect(ParsePayload(null)).toBeUndefined();
        expect(ParsePayloadRef('{"Uri":"s3://b/k","SizeBytes":10}')).toEqual({ Uri: 's3://b/k', SizeBytes: 10 });
        expect(() => ParsePayloadRef('{"SizeBytes":10}')).toThrow(WorkQueueConfigurationError);
    });
});

describe('MessageFromColumns', () => {
    it('builds the envelope, omitting absent optional fields', () => {
        const message = MessageFromColumns({
            MessageID: 'm1', PartitionKey: null, Attributes: '{"a":"b"}', Payload: null,
            PayloadRef: null, CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00Z'),
        }, 'import.ready');
        expect(message).toEqual({
            MessageID: 'm1', Topic: 'import.ready', Attributes: { a: 'b' }, PublishedAt: '2026-01-01T00:00:00.000Z',
        });
    });

    it('normalises the SQL Server uppercase MessageID to lowercase so it matches what was published', () => {
        const message = MessageFromColumns({
            MessageID: 'CCCCCCCC-0000-0000-0000-000000000001', PartitionKey: null, Attributes: null, Payload: null,
            PayloadRef: null, CorrelationID: null, PublishedAt: '2026-01-01T00:00:00Z',
        }, 'import.ready');
        expect(message.MessageID).toBe('cccccccc-0000-0000-0000-000000000001');
    });

    it('carries the optional fields when present', () => {
        const message = MessageFromColumns({
            MessageID: 'm1', PartitionKey: 'venue-42', Attributes: null, Payload: '{"n":1}',
            PayloadRef: '{"Uri":"s3://b/k"}', CorrelationID: 'corr', PublishedAt: '2026-01-01T00:00:00Z',
        }, 'import.ready');
        expect(message).toMatchObject({ PartitionKey: 'venue-42', Payload: { n: 1 }, PayloadRef: { Uri: 's3://b/k' }, CorrelationID: 'corr' });
    });
});

describe('SerializeProgress', () => {
    it('drops the checkpoint, then truncates the message, to fit 4,000 characters', () => {
        const big = { Percent: 50, Message: 'm'.repeat(600), Checkpoint: { blob: 'x'.repeat(5000) } };
        const text = SerializeProgress(big);
        expect(text.length).toBeLessThanOrEqual(4000);
        expect(JSON.parse(text)).toEqual({ Percent: 50, Message: 'm'.repeat(500) });
    });

    it('keeps small progress intact', () => {
        expect(JSON.parse(SerializeProgress({ Percent: 10, Checkpoint: { row: 5 } }))).toEqual({ Percent: 10, Checkpoint: { row: 5 } });
    });
});

describe('cursors, UUIDs and page sizes', () => {
    it('round-trips a cursor field and rejects garbage', () => {
        const cursor = EncodeCursor({ DeliveryID: 'abc' });
        expect(DecodeCursorField(cursor, 'DeliveryID')).toBe('abc');
        expect(() => DecodeCursorField('not-base64!', 'DeliveryID')).toThrow(WorkQueueConfigurationError);
        expect(() => DecodeCursorField(cursor, 'PartitionKey')).toThrow(WorkQueueConfigurationError);
    });

    it('recognises UUIDs', () => {
        expect(IsUUID('EEEEEEEE-0000-0000-0000-000000000001')).toBe(true);
        expect(IsUUID('x')).toBe(false);
    });

    it('clamps page sizes to 1-500 with a default of 50', () => {
        expect(ClampPageSize(0)).toBe(50);
        expect(ClampPageSize(-3)).toBe(1);
        expect(ClampPageSize(10000)).toBe(500);
    });

    it('truncates operator notes to the ResolutionNote column', () => {
        expect(TruncateNote('x'.repeat(1500))).toHaveLength(1000);
        expect(TruncateNote(null)).toBeNull();
    });
});

describe('binding IDs', () => {
    it('reads the topic and subscription IDs', () => {
        expect(ReadTopicID(TopicBindingFixture())).toBe('AAAAAAAA-0000-0000-0000-000000000001');
        expect(ReadSubscriptionIDs(SubscriptionBindingFixture())).toEqual({
            SubscriptionID: 'BBBBBBBB-0000-0000-0000-000000000001', TopicID: 'AAAAAAAA-0000-0000-0000-000000000001',
        });
    });

    it('fails with a configuration error when the IDs are missing', () => {
        expect(() => ReadTopicID(TopicBindingFixture({ Config: {} }))).toThrow(WorkQueueConfigurationError);
        expect(() => ReadSubscriptionIDs(SubscriptionBindingFixture({}, { SubscriptionID: ' ' }))).toThrow(WorkQueueConfigurationError);
    });
});
