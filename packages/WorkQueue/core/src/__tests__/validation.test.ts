import { describe, it, expect } from 'vitest';
import {
    BuildWorkMessage,
    CanonicalEnvelope,
    IsReservedAttributeKey,
    IsWorkQueueUuid,
    SerializedEnvelopeBytes,
    ValidatePublishRequest,
} from '../validation';
import type { TopicBinding } from '../transport';
import type { PublishRequest } from '../publishing';
import type { WorkJson } from '../envelope';

const UUID = '6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60';

function topic(overrides: Partial<TopicBinding> = {}): TopicBinding {
    return { TopicName: 'email.events', IsFifo: false, MaxPayloadBytes: 262144, Config: {}, ...overrides };
}

function codeOf(binding: TopicBinding, request: PublishRequest): string | null {
    return ValidatePublishRequest(binding, request)?.Code ?? null;
}

describe('ValidatePublishRequest', () => {
    it('accepts a minimal request and a typical one', () => {
        expect(ValidatePublishRequest(topic(), {})).toBeNull();
        expect(ValidatePublishRequest(topic(), {
            MessageID: UUID,
            Attributes: { eventType: 'click', tenant_id: 'acme-1' },
            Payload: { url: 'https://example.com', count: 2 },
            CorrelationID: 'corr-1',
            DeduplicationKey: 'sg:abc',
            DeduplicationTTLSeconds: 3600,
        })).toBeNull();
    });

    it('rejects a MessageID that is not a UUID', () => {
        expect(codeOf(topic(), { MessageID: 'not-a-uuid' })).toBe('InvalidMessageID');
    });

    it('accepts an upper-case UUID MessageID', () => {
        expect(codeOf(topic(), { MessageID: UUID.toUpperCase() })).toBeNull();
    });

    it('rejects more than 10 attributes', () => {
        const attributes: Record<string, string> = {};
        for (let i = 0; i < 11; i++) {
            attributes[`a${i}`] = 'v';
        }
        expect(codeOf(topic(), { Attributes: attributes })).toBe('InvalidAttributes');
    });

    it('rejects attribute keys outside the allowed pattern, including dotted names', () => {
        expect(codeOf(topic(), { Attributes: { 'bad key': 'v' } })).toBe('InvalidAttributes');
        expect(codeOf(topic(), { Attributes: { ['k'.repeat(65)]: 'v' } })).toBe('InvalidAttributes');
        // A dot would make the attribute unfilterable: filters read 'a.b' as the source.field form (spec 03 §1.1).
        expect(codeOf(topic(), { Attributes: { 'a.b': 'v' } })).toBe('InvalidAttributes');
        expect(codeOf(topic(), { Attributes: { 'a-b_C9': 'v' } })).toBeNull();
    });

    it('rejects reserved attribute prefixes regardless of case', () => {
        expect(codeOf(topic(), { Attributes: { 'mj.partition': 'v' } })).toBe('InvalidAttributes');
        expect(codeOf(topic(), { Attributes: { MJ_Partition: 'v' } })).toBe('InvalidAttributes');
        expect(codeOf(topic(), { Attributes: { mjolnir: 'v' } })).toBeNull();
    });

    it('rejects attribute values longer than 256 characters', () => {
        expect(codeOf(topic(), { Attributes: { k: 'v'.repeat(257) } })).toBe('InvalidAttributes');
        expect(codeOf(topic(), { Attributes: { k: 'v'.repeat(256) } })).toBeNull();
    });

    it('rejects empty attribute values (brokers refuse them and fail the whole batch call)', () => {
        const error = ValidatePublishRequest(topic(), { Attributes: { campaign: '' } });
        expect(error?.Code).toBe('InvalidAttributes');
        expect(error?.Message).toContain("'campaign'");
    });

    it('rejects Payload and PayloadRef together, and an empty PayloadRef Uri', () => {
        expect(codeOf(topic(), { Payload: { a: 1 }, PayloadRef: { Uri: 's3://b/k' } })).toBe('InvalidPayload');
        expect(codeOf(topic(), { PayloadRef: { Uri: '' } })).toBe('InvalidPayload');
        expect(codeOf(topic(), { PayloadRef: { Uri: 's3://bucket/batch-7.jsonl', SizeBytes: 1024 } })).toBeNull();
    });

    it('rejects empty and over-long partition keys', () => {
        expect(codeOf(topic(), { PartitionKey: '' })).toBe('InvalidPartitionKey');
        expect(codeOf(topic(), { PartitionKey: 'p'.repeat(201) })).toBe('InvalidPartitionKey');
        expect(codeOf(topic(), { PartitionKey: 'p'.repeat(200) })).toBeNull();
    });

    it('rejects empty and over-long deduplication keys', () => {
        expect(codeOf(topic(), { DeduplicationKey: '' })).toBe('InvalidDeduplication');
        expect(codeOf(topic(), { DeduplicationKey: 'd'.repeat(201) })).toBe('InvalidDeduplication');
    });

    it('rejects deduplication TTLs out of range, fractional, or without a key', () => {
        expect(codeOf(topic(), { DeduplicationKey: 'k', DeduplicationTTLSeconds: 59 })).toBe('InvalidDeduplication');
        expect(codeOf(topic(), { DeduplicationKey: 'k', DeduplicationTTLSeconds: 2592001 })).toBe('InvalidDeduplication');
        expect(codeOf(topic(), { DeduplicationKey: 'k', DeduplicationTTLSeconds: 90.5 })).toBe('InvalidDeduplication');
        expect(codeOf(topic(), { DeduplicationTTLSeconds: 3600 })).toBe('InvalidDeduplication');
    });

    it('rejects an envelope larger than the topic limit', () => {
        expect(codeOf(topic({ MaxPayloadBytes: 1000 }), { Payload: 'x'.repeat(2000) })).toBe('PayloadTooLarge');
        expect(codeOf(topic({ MaxPayloadBytes: 1000 }), { Payload: 'x'.repeat(100) })).toBeNull();
    });

    it('never allows more than 262144 bytes even when the topic limit is higher', () => {
        expect(codeOf(topic({ MaxPayloadBytes: 999999 }), { Payload: 'x'.repeat(300000) })).toBe('PayloadTooLarge');
    });

    it('rejects a payload that cannot be serialized', () => {
        const cyclic: { [key: string]: WorkJson } = {};
        Reflect.set(cyclic, 'self', cyclic);
        expect(codeOf(topic(), { Payload: cyclic })).toBe('InvalidPayload');
    });

    it('marks every validation error as not retryable', () => {
        expect(ValidatePublishRequest(topic(), { MessageID: 'nope' })?.Retryable).toBe(false);
    });
});

describe('BuildWorkMessage', () => {
    const publishedAt = new Date('2026-09-16T12:00:00.000Z');

    it('uses a supplied MessageID, otherwise the generator', () => {
        expect(BuildWorkMessage('t', { MessageID: UUID }, publishedAt, () => 'generated').MessageID).toBe(UUID);
        expect(BuildWorkMessage('t', {}, publishedAt, () => 'generated').MessageID).toBe('generated');
    });

    it('omits undefined optional fields and copies attributes', () => {
        const attributes = { eventType: 'open' };
        const message = BuildWorkMessage('email.events', { Attributes: attributes }, publishedAt, () => UUID);
        expect(message).toEqual({ MessageID: UUID, Topic: 'email.events', Attributes: { eventType: 'open' }, PublishedAt: '2026-09-16T12:00:00.000Z' });
        expect(Object.keys(message)).toEqual(['MessageID', 'Topic', 'Attributes', 'PublishedAt']);
        attributes.eventType = 'changed';
        expect(message.Attributes.eventType).toBe('open');
    });

    it('carries every supplied field', () => {
        const message = BuildWorkMessage('integration.batch-ready', {
            PartitionKey: 'integration-42',
            Attributes: {},
            PayloadRef: { Uri: 's3://b/k' },
            CorrelationID: 'c-1',
        }, publishedAt, () => UUID);
        expect(message.PartitionKey).toBe('integration-42');
        expect(message.PayloadRef).toEqual({ Uri: 's3://b/k' });
        expect(message.CorrelationID).toBe('c-1');
        expect(message.Payload).toBeUndefined();
    });
});

describe('CanonicalEnvelope', () => {
    const at = new Date('2026-09-16T12:00:00.000Z');

    it('is insensitive to key order, PublishedAt, MessageID and Topic', () => {
        const first = BuildWorkMessage('t', {
            PartitionKey: 'k', Attributes: { b: '2', a: '1' }, Payload: { y: [1, { q: 1, p: 2 }], x: 'v' }, CorrelationID: 'c',
        }, at, () => UUID);
        const retry = BuildWorkMessage('other', {
            CorrelationID: 'c', Payload: { x: 'v', y: [1, { p: 2, q: 1 }] }, Attributes: { a: '1', b: '2' }, PartitionKey: 'k',
        }, new Date('2026-09-16T12:05:00.000Z'), () => 'another-id');
        expect(CanonicalEnvelope(retry)).toBe(CanonicalEnvelope(first));
        expect(CanonicalEnvelope(first)).toBe(
            '{"Attributes":{"a":"1","b":"2"},"CorrelationID":"c","PartitionKey":"k","Payload":{"x":"v","y":[1,{"p":2,"q":1}]}}',
        );
    });

    it('differs when any compared field differs, and keeps array order', () => {
        const base = BuildWorkMessage('t', { Attributes: { a: '1' }, Payload: [1, 2] }, at, () => UUID);
        const differentValue = BuildWorkMessage('t', { Attributes: { a: '2' }, Payload: [1, 2] }, at, () => UUID);
        const reordered = BuildWorkMessage('t', { Attributes: { a: '1' }, Payload: [2, 1] }, at, () => UUID);
        const withRef = BuildWorkMessage('t', { Attributes: { a: '1' }, PayloadRef: { Uri: 's3://b/k' } }, at, () => UUID);
        expect(CanonicalEnvelope(differentValue)).not.toBe(CanonicalEnvelope(base));
        expect(CanonicalEnvelope(reordered)).not.toBe(CanonicalEnvelope(base));
        expect(CanonicalEnvelope(withRef)).not.toBe(CanonicalEnvelope(base));
    });
});

describe('SerializedEnvelopeBytes and helpers', () => {
    it('counts UTF-8 bytes, not characters', () => {
        const at = new Date('2026-09-16T12:00:00.000Z');
        const plain = BuildWorkMessage('t', { Payload: 'e' }, at, () => UUID);
        const accented = BuildWorkMessage('t', { Payload: 'é' }, at, () => UUID);
        expect(SerializedEnvelopeBytes(accented) - SerializedEnvelopeBytes(plain)).toBe(1);
    });

    it('recognises UUIDs and reserved keys', () => {
        expect(IsWorkQueueUuid(UUID)).toBe(true);
        expect(IsWorkQueueUuid('1234')).toBe(false);
        expect(IsReservedAttributeKey('Mj.Anything')).toBe(true);
        expect(IsReservedAttributeKey('major')).toBe(false);
    });
});
