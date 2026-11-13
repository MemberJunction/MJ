import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';
import {
    RedisStreamBroadcastProvider,
    type RedisStreamTransport,
    type RedisStreamBroadcastWireMessage,
} from '../broadcast/providers/RedisStreamBroadcastProvider.js';
import {
    AttachRedisClusterPubSub,
    DEFAULT_GRAPHQL_PUBSUB_FANOUT_CHANNEL,
    EXCLUDED_CLUSTER_PUBSUB_TOPICS,
    IsExcludedClusterPubSubTopic,
    type RedisPubSubChannelTransport,
} from '../generic/RedisClusterPubSubEngine.js';
import type { CacheInvalidationPayload } from '../generic/CacheInvalidationResolver.js';
import { WrapSharedCacheWithL1 } from '../sharedCache.js';
import type { RedisLocalStorageProvider } from '@memberjunction/redis-provider';

function MakeTestUser(id: string, roleIds: string[]): UserInfo {
    return {
        ID: id,
        Name: `User ${id}`,
        Email: `${id}@example.com`,
        UserRoles: roleIds.map((r) => ({ UserID: id, RoleID: r, RoleName: r })),
    } as unknown as UserInfo;
}

function MakeInvalidationPayload(overrides: Partial<CacheInvalidationPayload> = {}): CacheInvalidationPayload {
    return {
        entityName: 'Invoices',
        primaryKeyValues: '[{"FieldName":"ID","Value":"inv-1"}]',
        action: 'save',
        sourceServerId: 'srv-1',
        timestamp: new Date('2026-11-11T12:00:00Z'),
        recordData: '{"ID":"inv-1","Total":100}',
        ...overrides,
    };
}

/**
 * In-memory fake implementing both `RedisStreamTransport` and `RedisPubSubChannelTransport`
 * to simulate a shared Redis instance across multiple server replicas.
 */
class InMemoryRedisClusterFake implements RedisStreamTransport, RedisPubSubChannelTransport {
    public KeyPrefix = 'mj-test';
    private _clusterEpoch = 'test-epoch-999';
    private _streamSeq = 0;
    private _streamEntries: Array<{ Sequence: number; PayloadJson: string }> = [];
    private _channelSubscribers = new Map<string, Set<(raw: string) => void>>();

    public async EnsureClusterEpochId(_epochKeySuffix?: string): Promise<string> {
        return this._clusterEpoch;
    }

    public async AppendSequencedStreamEntry(
        _seqKeySuffix: string,
        _streamKeySuffix: string,
        maxLen: number,
        payloadJson: string
    ): Promise<number> {
        this._streamSeq++;
        this._streamEntries.push({ Sequence: this._streamSeq, PayloadJson: payloadJson });
        if (this._streamEntries.length > maxLen) {
            this._streamEntries = this._streamEntries.slice(this._streamEntries.length - maxLen);
        }
        return this._streamSeq;
    }

    public async ReadSequencedStreamSince(
        _streamKeySuffix: string,
        sinceSequence: number,
        maxCount = 5000
    ): Promise<{ CurrentSequence: number; Entries: Array<{ Sequence: number; PayloadJson: string }> }> {
        const matching = this._streamEntries
            .filter((entry) => entry.Sequence > sinceSequence)
            .slice(0, maxCount);
        return {
            CurrentSequence: this._streamSeq,
            Entries: matching,
        };
    }

    public async SubscribeToChannel(channel: string, handler: (raw: string) => void): Promise<() => void> {
        let subs = this._channelSubscribers.get(channel);
        if (!subs) {
            subs = new Set();
            this._channelSubscribers.set(channel, subs);
        }
        subs.add(handler);
        return () => {
            subs?.delete(handler);
        };
    }

    public PublishMessage(channel: string, message: string): void {
        const subs = this._channelSubscribers.get(channel);
        if (subs) {
            for (const handler of Array.from(subs)) {
                try {
                    handler(message);
                } catch {
                    // Suppress handler errors in test fake
                }
            }
        }
    }

    public TrimStreamExplicitly(retainedCount: number): void {
        if (this._streamEntries.length > retainedCount) {
            this._streamEntries = this._streamEntries.slice(this._streamEntries.length - retainedCount);
        }
    }
}

/**
 * Minimal TypeGraphQL `PubSubEngine` fake for testing subscription fan-out.
 */
class FakeLocalPubSubEngine implements PubSubEngine {
    public PublishedEvents: Array<{ Topic: string; Payload: unknown }> = [];
    private _subscribers = new Map<string, Set<(payload: unknown) => void>>();

    public async publish(topic: string, payload: unknown): Promise<void> {
        this.PublishedEvents.push({ Topic: topic, Payload: payload });
        const subs = this._subscribers.get(topic);
        if (subs) {
            for (const sub of Array.from(subs)) {
                sub(payload);
            }
        }
    }

    public async subscribe(topic: string, onMessage: (payload: unknown) => void): Promise<number> {
        let subs = this._subscribers.get(topic);
        if (!subs) {
            subs = new Set();
            this._subscribers.set(topic, subs);
        }
        subs.add(onMessage);
        return subs.size;
    }

    public async unsubscribe(_subId: number): Promise<void> {
        // No-op for test fake
    }

    public asyncIterator<T = unknown>(_triggers: string | string[]): AsyncIterator<T> {
        throw new Error('Not implemented in fake');
    }
}

describe('Wave 4.4: RedisStreamBroadcastProvider Cluster Monotonic Sequence & Catch-Up', () => {
    let fakeRedis: InMemoryRedisClusterFake;
    let replicaA: RedisStreamBroadcastProvider;
    let replicaB: RedisStreamBroadcastProvider;
    let savedProcessUUID: string;

    beforeEach(async () => {
        savedProcessUUID = MJGlobal.Instance.ProcessUUID;
        fakeRedis = new InMemoryRedisClusterFake();

        replicaA = new RedisStreamBroadcastProvider();
        replicaA.SetLocalProcessIDForTesting('process-replica-a');
        replicaA.Configure({ ringBufferSize: 10 });
        await replicaA.BindTransport(fakeRedis);

        replicaB = new RedisStreamBroadcastProvider();
        replicaB.SetLocalProcessIDForTesting('process-replica-b');
        replicaB.Configure({ ringBufferSize: 10 });
        await replicaB.BindTransport(fakeRedis);
    });

    afterEach(() => {
        replicaA.Dispose();
        replicaB.Dispose();
        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = savedProcessUUID;
    });

    it('exposes identical ServerProcessID across all replicas bound to the same Redis instance', () => {
        expect(replicaA.ServerProcessID).toBe('redis-stream:test-epoch-999');
        expect(replicaB.ServerProcessID).toBe('redis-stream:test-epoch-999');
        expect(replicaA.ServerProcessID).toBe(replicaB.ServerProcessID);
    });

    it('produces strictly monotonic cluster sequences and replicates across peers without self-echo', async () => {
        const deliveredToA: CacheInvalidationPayload[] = [];
        const deliveredToB: CacheInvalidationPayload[] = [];

        const deliverA = (payload: CacheInvalidationPayload) => {
            deliveredToA.push(payload);
        };
        const deliverB = (payload: CacheInvalidationPayload) => {
            deliveredToB.push(payload);
        };

        replicaA.SetLocalPubSubDeliverer(deliverA);
        replicaB.SetLocalPubSubDeliverer(deliverB);

        // Publish alternating on ReplicaA and ReplicaB
        // Simulate Process A
        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = 'process-replica-a';
        const p1 = MakeInvalidationPayload({ primaryKeyValues: 'inv-1' });
        await replicaA.PublishClusterInvalidation(p1, deliverA);

        // Simulate Process B
        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = 'process-replica-b';
        const p2 = MakeInvalidationPayload({ primaryKeyValues: 'inv-2' });
        await replicaB.PublishClusterInvalidation(p2, deliverB);

        // Simulate Process A again
        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = 'process-replica-a';
        const p3 = MakeInvalidationPayload({ primaryKeyValues: 'inv-3' });
        await replicaA.PublishClusterInvalidation(p3, deliverA);

        // Sequence numbers assigned to payloads must be strictly monotonic: 1, 2, 3
        expect(p1.sequence).toBe(1);
        expect(p2.sequence).toBe(2);
        expect(p3.sequence).toBe(3);

        // Replica A must have received p1 (local), p2 (peer), and p3 (local) exactly once
        expect(deliveredToA).toHaveLength(3);
        expect(deliveredToA.map((p) => p.sequence)).toEqual([1, 2, 3]);

        // Replica B must have received p1 (peer), p2 (local), and p3 (peer) exactly once
        expect(deliveredToB).toHaveLength(3);
        expect(deliveredToB.map((p) => p.sequence)).toEqual([1, 2, 3]);

        // Both replicas' CurrentSequence should be 3
        expect(replicaA.CurrentSequence).toBe(3);
        expect(replicaB.CurrentSequence).toBe(3);
    });

    it('catches up missed deltas on a cold-booted ReplicaC directly from Redis Stream', async () => {
        // Publish events 1, 2, 3 from ReplicaA
        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = 'process-replica-a';
        await replicaA.PublishClusterInvalidation(MakeInvalidationPayload({ primaryKeyValues: 'p-1' }), () => undefined);
        await replicaA.PublishClusterInvalidation(MakeInvalidationPayload({ primaryKeyValues: 'p-2' }), () => undefined);
        await replicaA.PublishClusterInvalidation(MakeInvalidationPayload({ primaryKeyValues: 'p-3' }), () => undefined);

        // Cold-boot ReplicaC with 0 events in memory
        const replicaC = new RedisStreamBroadcastProvider();
        replicaC.SetLocalProcessIDForTesting('process-replica-c');
        replicaC.Configure({ ringBufferSize: 10 });
        expect(replicaC.BufferedEventCount).toBe(0);

        await replicaC.BindTransport(fakeRedis);
        const testUser = MakeTestUser('u1', ['Role-Admin']);

        // Query delta since sequence 0
        const catchUp = await replicaC.GetChangesSinceAsync(0, testUser);

        expect(catchUp.RequiresFullRefresh).toBe(false);
        expect(catchUp.CurrentSequence).toBe(3);
        expect(catchUp.ServerProcessID).toBe('redis-stream:test-epoch-999');
        expect(catchUp.Events).toHaveLength(3);
        expect(catchUp.Events.map((e) => e.Sequence)).toEqual([1, 2, 3]);

        // Query delta since sequence 2
        const catchUpSince2 = await replicaC.GetChangesSinceAsync(2, testUser);
        expect(catchUpSince2.RequiresFullRefresh).toBe(false);
        expect(catchUpSince2.Events).toHaveLength(1);
        expect(catchUpSince2.Events[0].Sequence).toBe(3);

        // Query when up-to-date (sinceSequence === 3)
        const catchUpCurrent = await replicaC.GetChangesSinceAsync(3, testUser);
        expect(catchUpCurrent.RequiresFullRefresh).toBe(false);
        expect(catchUpCurrent.Events).toHaveLength(0);

        replicaC.Dispose();
    });

    it('signals RequiresFullRefresh when sinceSequence has fallen off the capped Redis Stream', async () => {
        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = 'process-replica-a';
        for (let i = 1; i <= 5; i++) {
            await replicaA.PublishClusterInvalidation(MakeInvalidationPayload({ primaryKeyValues: `p-${i}` }), () => undefined);
        }

        // Simulate stream retention trimming: retain only sequences 4 and 5
        fakeRedis.TrimStreamExplicitly(2);

        const replicaC = new RedisStreamBroadcastProvider();
        replicaC.Configure({ ringBufferSize: 10 });
        await replicaC.BindTransport(fakeRedis);
        const testUser = MakeTestUser('u1', ['Role-Admin']);

        // Requesting sequence 1, which was trimmed from Redis Stream (oldest available is 4)
        const catchUp = await replicaC.GetChangesSinceAsync(1, testUser);
        expect(catchUp.RequiresFullRefresh).toBe(true);
        expect(catchUp.Events).toHaveLength(0);

        replicaC.Dispose();
    });
});

describe('Wave 4.4: AttachRedisClusterPubSub Cross-Replica GraphQL Subscription Bridge', () => {
    let fakeRedis: InMemoryRedisClusterFake;
    let engineA: FakeLocalPubSubEngine;
    let engineB: FakeLocalPubSubEngine;
    let savedProcessUUID: string;

    beforeEach(() => {
        savedProcessUUID = MJGlobal.Instance.ProcessUUID;
        fakeRedis = new InMemoryRedisClusterFake();
        engineA = new FakeLocalPubSubEngine();
        engineB = new FakeLocalPubSubEngine();
    });

    afterEach(() => {
        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = savedProcessUUID;
    });

    it('bridges PIPELINE_PROGRESS and generic subscription topics from Replica A to Replica B', async () => {
        const bridgeA = await AttachRedisClusterPubSub(engineA, fakeRedis, { SourceProcessId: 'replica-process-a' });
        const bridgeB = await AttachRedisClusterPubSub(engineB, fakeRedis, { SourceProcessId: 'replica-process-b' });

        const receivedOnB: unknown[] = [];
        await engineB.subscribe('PIPELINE_PROGRESS', (payload) => {
            receivedOnB.push(payload);
        });

        const receivedOnA: unknown[] = [];
        await engineA.subscribe('PIPELINE_PROGRESS', (payload) => {
            receivedOnA.push(payload);
        });

        // Publish from Replica A
        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = 'replica-process-a';
        await engineA.publish('PIPELINE_PROGRESS', { runId: 'run-123', progress: 50, message: 'Step 2' });

        // Local subscriber on Replica A received it
        expect(receivedOnA).toHaveLength(1);
        expect(receivedOnA[0]).toEqual({ runId: 'run-123', progress: 50, message: 'Step 2' });

        // Remote subscriber on Replica B received it via Redis
        expect(receivedOnB).toHaveLength(1);
        expect(receivedOnB[0]).toEqual({ runId: 'run-123', progress: 50, message: 'Step 2' });

        bridgeA.Dispose();
        bridgeB.Dispose();
    });

    it('suppresses self-echo so local publishing node does not receive a duplicate message from Redis', async () => {
        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = 'replica-process-a';
        const bridgeA = await AttachRedisClusterPubSub(engineA, fakeRedis);

        const subscriberEvents: unknown[] = [];
        await engineA.subscribe('TASK_GRAPH_FRAMES', (payload) => {
            subscriberEvents.push(payload);
        });

        // Publish on engineA
        await engineA.publish('TASK_GRAPH_FRAMES', { graphId: 'graph-1', frame: 'frame-data' });

        // Subscriber should be called exactly once (from local publish), not twice
        expect(subscriberEvents).toHaveLength(1);

        bridgeA.Dispose();
    });

    it('does NOT broadcast excluded topics with bespoke replication bridges', async () => {
        const publishedRedisMessages: Array<{ channel: string; message: string }> = [];
        const spyPublish = vi.spyOn(fakeRedis, 'PublishMessage').mockImplementation((channel, message) => {
            publishedRedisMessages.push({ channel, message });
        });

        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = 'replica-process-a';
        const bridgeA = await AttachRedisClusterPubSub(engineA, fakeRedis);

        for (const excludedTopic of EXCLUDED_CLUSTER_PUBSUB_TOPICS) {
            await engineA.publish(excludedTopic, { test: true });
        }
        await engineA.publish('PUSH_STATUS_UPDATES:session:abc1234', { test: true });

        // None of the excluded topics should have generated a message on Redis
        expect(publishedRedisMessages).toHaveLength(0);

        // A non-excluded topic SHOULD generate a message on Redis
        await engineA.publish('CLIENT_TOOL_REQUEST', { toolName: 'sql_query' });
        expect(publishedRedisMessages).toHaveLength(1);
        expect(publishedRedisMessages[0].channel).toBe(DEFAULT_GRAPHQL_PUBSUB_FANOUT_CHANNEL);

        const parsedEnvelope = JSON.parse(publishedRedisMessages[0].message) as { Topic: string; Payload: unknown };
        expect(parsedEnvelope.Topic).toBe('CLIENT_TOOL_REQUEST');

        spyPublish.mockRestore();
        bridgeA.Dispose();
    });

    it('correctly identifies excluded cluster pubsub topics via IsExcludedClusterPubSubTopic', () => {
        expect(IsExcludedClusterPubSubTopic('CACHE_INVALIDATION')).toBe(true);
        expect(IsExcludedClusterPubSubTopic('PUSH_STATUS_UPDATES')).toBe(true);
        expect(IsExcludedClusterPubSubTopic('PUSH_STATUS_UPDATES:session:xyz')).toBe(true);
        expect(IsExcludedClusterPubSubTopic('HANDOFF_OFFER')).toBe(true);
        expect(IsExcludedClusterPubSubTopic('REALTIME_SESSION_EVENTS')).toBe(true);

        expect(IsExcludedClusterPubSubTopic('PIPELINE_PROGRESS')).toBe(false);
        expect(IsExcludedClusterPubSubTopic('INTEGRATION_PROGRESS')).toBe(false);
        expect(IsExcludedClusterPubSubTopic('TASK_GRAPH_FRAMES')).toBe(false);
        expect(IsExcludedClusterPubSubTopic('CLIENT_TOOL_REQUEST')).toBe(false);
        expect(IsExcludedClusterPubSubTopic('SEARCH_STREAM')).toBe(false);
        expect(IsExcludedClusterPubSubTopic('REMOTE_OP_PROGRESS')).toBe(false);
        expect(IsExcludedClusterPubSubTopic('CUSTOM_TOPIC')).toBe(false);
    });

    it('tolerates Redis publish error without disrupting local GraphQL subscription delivery', async () => {
        const spyPublish = vi.spyOn(fakeRedis, 'PublishMessage').mockImplementation(() => {
            throw new Error('Simulated Redis network disconnection');
        });

        (MJGlobal.Instance as unknown as { _processUUID?: string })._processUUID = 'replica-process-a';
        const bridgeA = await AttachRedisClusterPubSub(engineA, fakeRedis);

        const localReceived: unknown[] = [];
        await engineA.subscribe('SEARCH_STREAM', (payload) => {
            localReceived.push(payload);
        });

        // Publish should succeed locally even if Redis throws
        await expect(
            engineA.publish('SEARCH_STREAM', { query: 'test', results: [] })
        ).resolves.toBeUndefined();

        expect(localReceived).toHaveLength(1);

        spyPublish.mockRestore();
        bridgeA.Dispose();
    });
});

describe('Wave 4.4: WrapSharedCacheWithL1 fallback safety', () => {
    it('returns the underlying RedisLocalStorageProvider when TwoTierCacheStorageProvider is not exported', () => {
        const fakeRedis = { Mock: 'RedisProvider' } as unknown as RedisLocalStorageProvider;
        const result = WrapSharedCacheWithL1(fakeRedis, { maxMemoryMB: 200 });
        expect(result).toBe(fakeRedis);
    });
});
