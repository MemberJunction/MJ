import { describe, it, expect, beforeEach } from 'vitest';
import { BuildPublishEntry, ChunkEntries, EntryBytes, PublishToSns } from '../driver/publish';
import { AwsGatewayError } from '../gateway/errors';
import { FakeSnsGateway } from '../testing/fakes';
import { TestAwsResources, TestMessage, TestTopicBinding } from '../testing/fixtures';

let sns: FakeSnsGateway;

beforeEach(() => {
    sns = new FakeSnsGateway();
});

describe('BuildPublishEntry', () => {
    it('maps a message on a standard topic: body, attributes, no group or dedup ID', () => {
        const message = TestMessage(1, { Attributes: { eventType: 'click', provider: 'sendgrid' } });
        expect(BuildPublishEntry(message, 0, false)).toEqual({
            Id: '0', Message: JSON.stringify(message), MessageAttributes: { eventType: 'click', provider: 'sendgrid' },
        });
    });

    it('sets group and deduplication IDs on a FIFO topic', () => {
        const keyed = TestMessage(2, { PartitionKey: 'subscriber-9' });
        expect(BuildPublishEntry(keyed, 3, true)).toMatchObject({ Id: '3', MessageGroupId: 'subscriber-9', MessageDeduplicationId: keyed.MessageID });
        const unkeyed = TestMessage(3);
        expect(BuildPublishEntry(unkeyed, 4, true).MessageGroupId).toBe(unkeyed.MessageID);
    });
});

describe('ChunkEntries', () => {
    it('splits at ten entries', () => {
        const entries = Array.from({ length: 23 }, (_, i) => BuildPublishEntry(TestMessage(i), i, false));
        expect(ChunkEntries(entries).map((chunk) => chunk.length)).toEqual([10, 10, 3]);
    });

    it('splits before a request would exceed 262,144 bytes', () => {
        const big = 'x'.repeat(100_000);
        const entries = [0, 1, 2].map((i) => BuildPublishEntry(TestMessage(i, { Payload: big }), i, false));
        expect(EntryBytes(entries[0])).toBeGreaterThan(100_000);
        expect(ChunkEntries(entries).map((chunk) => chunk.length)).toEqual([2, 1]);
    });
});

describe('PublishToSns', () => {
    it('publishes every chunk and accepts every message in input order', async () => {
        const messages = Array.from({ length: 12 }, (_, i) => TestMessage(i));
        const results = await PublishToSns(sns, TestTopicBinding(true), messages);
        expect(sns.Batches).toHaveLength(2);
        expect(sns.Batches[0].TopicArn).toBe(TestAwsResources(true).TopicArn);
        expect(results.map((r) => r.Status)).toEqual(Array(12).fill('Accepted'));
        expect(results.map((r) => r.MessageID)).toEqual(messages.map((m) => m.MessageID));
    });

    it('maps per-entry failures by sender fault', async () => {
        const messages = [TestMessage(1), TestMessage(2), TestMessage(3)];
        sns.FailedEntries.set(messages[0].MessageID, { Code: 'InvalidParameter', Message: 'bad', SenderFault: true });
        sns.FailedEntries.set(messages[2].MessageID, { Code: 'InternalError', Message: 'try again', SenderFault: false });
        const results = await PublishToSns(sns, TestTopicBinding(true), messages);
        expect(results[0]).toEqual({ MessageID: messages[0].MessageID, Status: 'Rejected', Error: { Code: 'TransportRejected', Message: 'SNS InvalidParameter: bad', Retryable: false } });
        expect(results[1].Status).toBe('Accepted');
        expect(results[2]).toEqual({ MessageID: messages[2].MessageID, Status: 'Rejected', Error: { Code: 'TransportUnavailable', Message: 'SNS InternalError: try again', Retryable: true } });
    });

    it('rejects a whole chunk when the call fails, carrying the retryable flag', async () => {
        sns.ThrowOnPublish = new AwsGatewayError('SNS PublishBatch failed: Throttling', 'Throttling', true);
        const results = await PublishToSns(sns, TestTopicBinding(false), [TestMessage(1), TestMessage(2)]);
        expect(results.every((r) => r.Status === 'Rejected' && r.Error?.Code === 'TransportUnavailable' && r.Error.Retryable)).toBe(true);
    });

    it('rejects every message of an unbound topic without calling SNS', async () => {
        const results = await PublishToSns(sns, TestTopicBinding(true, { Config: {} }), [TestMessage(1)]);
        expect(results[0].Error).toMatchObject({ Code: 'TopicUnbound', Retryable: true });
        expect(sns.Batches).toHaveLength(0);
    });

    it('rejects an empty attribute value before the call so the batch is not poisoned', async () => {
        const empty = TestMessage(1, { Attributes: { eventType: '' } });
        const results = await PublishToSns(sns, TestTopicBinding(false), [empty, TestMessage(2)]);
        expect(results.map((r) => r.Error?.Code ?? r.Status)).toEqual(['InvalidAttributes', 'Accepted']);
        expect(sns.Batches).toHaveLength(1);
        expect(sns.Batches[0].Entries).toHaveLength(1);
    });

    it('never puts two messages of one key in one FIFO batch', async () => {
        const messages = [TestMessage(1, { PartitionKey: 'k' }), TestMessage(2, { PartitionKey: 'k' }), TestMessage(3, { PartitionKey: 'other' })];
        const results = await PublishToSns(sns, TestTopicBinding(true), messages);
        expect(results.map((r) => r.Status)).toEqual(['Accepted', 'Accepted', 'Accepted']);
        expect(sns.Batches.map((batch) => batch.Entries.map((e) => e.MessageGroupId))).toEqual([['k'], ['k', 'other']]);
    });

    it('does not send the tail of a key after one of its messages fails', async () => {
        const messages = [TestMessage(1, { PartitionKey: 'k' }), TestMessage(2, { PartitionKey: 'k' }), TestMessage(3, { PartitionKey: 'other' })];
        sns.FailedEntries.set(messages[0].MessageID, { Code: 'InternalError', Message: 'try again', SenderFault: false });
        const results = await PublishToSns(sns, TestTopicBinding(true), messages);
        expect(results.map((r) => r.Status)).toEqual(['Rejected', 'Rejected', 'Accepted']);
        expect(results[1].Error).toMatchObject({ Code: 'TransportUnavailable', Retryable: true });
        const sentGroups = sns.Batches.flatMap((batch) => batch.Entries.map((e) => e.MessageGroupId));
        expect(sentGroups).toEqual(['k', 'other']);
    });

    it('rejects oversized envelopes and too many attributes but publishes the rest', async () => {
        const tooBig = TestMessage(1, { Payload: 'x'.repeat(262_144) });
        const tooManyAttributes = TestMessage(2, { Attributes: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`a${i}`, 'v'])) });
        const fine = TestMessage(3);
        const results = await PublishToSns(sns, TestTopicBinding(true), [tooBig, tooManyAttributes, fine]);
        expect(results.map((r) => r.Error?.Code ?? r.Status)).toEqual(['PayloadTooLarge', 'InvalidAttributes', 'Accepted']);
        expect(sns.Batches[0].Entries).toHaveLength(1);
    });
});
