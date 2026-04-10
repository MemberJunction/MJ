/**
 * Integration test: RedisLocalStorageProvider with a real Redis server.
 *
 * Verifies:
 * 1. Shared data visibility (both providers read/write the same Redis keys)
 * 2. Pub/sub message delivery via the Redis channel
 * 3. Self-originated event filtering (events from this process are ignored)
 * 4. Cross-server event delivery (events from a different SourceServerId are received)
 *
 * NOTE: In a single process, both providers share MJGlobal.Instance.ProcessUUID,
 * so the pub/sub filter correctly drops all self-originated events.
 * To test cross-server delivery, we manually publish a message with a different
 * SourceServerId, simulating what another MJAPI process would publish.
 *
 * Requires a real Redis connection — set REDIS_URL env var to run.
 * Skipped automatically if REDIS_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import type { CacheChangedEvent } from '@memberjunction/core';

const REDIS_URL = process.env.REDIS_URL;

const describeRedis = REDIS_URL ? describe : describe.skip;

describeRedis('Integration: Two-Server Pub/Sub', () => {
    let providerA: InstanceType<typeof import('../RedisLocalStorageProvider.js').RedisLocalStorageProvider>;
    let providerB: InstanceType<typeof import('../RedisLocalStorageProvider.js').RedisLocalStorageProvider>;
    let rawPublisher: Redis; // Simulates a different server process

    let RedisLocalStorageProviderClass: typeof import('../RedisLocalStorageProvider.js').RedisLocalStorageProvider;

    const KEY_PREFIX = 'test-integration';
    const PUB_SUB_CHANNEL = `${KEY_PREFIX}:__pubsub__`;

    beforeAll(async () => {
        const mod = await import('../RedisLocalStorageProvider.js');
        RedisLocalStorageProviderClass = mod.RedisLocalStorageProvider;

        providerA = new RedisLocalStorageProviderClass({
            url: REDIS_URL,
            keyPrefix: KEY_PREFIX,
            enablePubSub: true,
            enableLogging: false,
        });

        providerB = new RedisLocalStorageProviderClass({
            url: REDIS_URL,
            keyPrefix: KEY_PREFIX,
            enablePubSub: true,
            enableLogging: false,
        });

        // Raw publisher for simulating cross-server messages
        rawPublisher = new Redis(REDIS_URL!);

        // Wait for all connections
        await new Promise<void>((resolve) => {
            let ready = 0;
            const check = () => { if (++ready >= 3) resolve(); };
            providerA.Client.on('ready', check);
            providerB.Client.on('ready', check);
            rawPublisher.on('ready', check);
            if (providerA.IsConnected) check();
            if (providerB.IsConnected) check();
        });

        // Start pub/sub listeners
        await providerA.StartListening();
        await providerB.StartListening();

        // Give subscriber connections time to establish
        await new Promise(r => setTimeout(r, 500));
    });

    afterAll(async () => {
        try { await providerA.ClearCategory('integration-test'); } catch { /* ignore */ }
        try { await providerA.ClearCategory('integration-clear-test'); } catch { /* ignore */ }
        try { await providerA.ClearCategory('integration-remove-test'); } catch { /* ignore */ }
        await providerA.Disconnect();
        await providerB.Disconnect();
        await rawPublisher.quit();
    });

    it('should verify both providers can ping Redis', async () => {
        expect(await providerA.Ping()).toBe(true);
        expect(await providerB.Ping()).toBe(true);
    });

    it('should share data through Redis (both see the same keys)', async () => {
        const testKey = `shared-key-${Date.now()}`;
        await providerA.SetItem(testKey, 'hello from A', 'integration-test');

        const value = await providerB.GetItem(testKey, 'integration-test');
        expect(value).toBe('hello from A');

        await providerA.Remove(testKey, 'integration-test');
    });

    it('should correctly filter out self-originated events (same ProcessUUID)', async () => {
        // Both providers share the same ProcessUUID in a single process
        // Events from provider A should NOT be received by provider B's OnCacheChanged
        const received: CacheChangedEvent[] = [];
        const unsubscribe = providerB.OnCacheChanged((event) => {
            if (event.Category === 'integration-self-filter') {
                received.push(event);
            }
        });

        await providerA.SetItem('self-test', 'value', 'integration-self-filter');
        await new Promise(r => setTimeout(r, 500));

        // Should be 0 because both providers have the same ProcessUUID
        expect(received.length).toBe(0);

        unsubscribe();
        await providerA.Remove('self-test', 'integration-self-filter');
    });

    it('should deliver events from a different server (different SourceServerId)', async () => {
        // Simulate a message from a different MJAPI instance by publishing
        // directly to the pub/sub channel with a different SourceServerId
        const received: CacheChangedEvent[] = [];
        const unsubscribe = providerB.OnCacheChanged((event) => {
            if (event.Category === 'integration-cross-server') {
                received.push(event);
            }
        });

        const crossServerEvent: CacheChangedEvent = {
            CacheKey: `cross-server-key-${Date.now()}`,
            Category: 'integration-cross-server',
            Action: 'set',
            Timestamp: Date.now(),
            SourceServerId: 'other-server-00000000-0000-4000-b000-000000000002',
            Data: '{"message":"from another server"}',
        };

        // Publish from the raw client (simulating a different server)
        await rawPublisher.publish(PUB_SUB_CHANNEL, JSON.stringify(crossServerEvent));

        await new Promise(r => setTimeout(r, 500));

        expect(received.length).toBeGreaterThanOrEqual(1);
        const event = received.find(e => e.CacheKey === crossServerEvent.CacheKey);
        expect(event).toBeDefined();
        expect(event!.Action).toBe('set');
        expect(event!.SourceServerId).toBe('other-server-00000000-0000-4000-b000-000000000002');
        expect(event!.Data).toBe('{"message":"from another server"}');

        unsubscribe();
    });

    it('should deliver category_cleared events from a different server', async () => {
        const received: CacheChangedEvent[] = [];
        const unsubscribe = providerA.OnCacheChanged((event) => {
            if (event.Action === 'category_cleared') {
                received.push(event);
            }
        });

        const clearEvent: CacheChangedEvent = {
            CacheKey: 'integration-clear-test',
            Category: 'integration-clear-test',
            Action: 'category_cleared',
            Timestamp: Date.now(),
            SourceServerId: 'other-server-00000000-0000-4000-b000-000000000003',
        };

        await rawPublisher.publish(PUB_SUB_CHANNEL, JSON.stringify(clearEvent));
        await new Promise(r => setTimeout(r, 500));

        expect(received.length).toBeGreaterThanOrEqual(1);
        expect(received[0].Action).toBe('category_cleared');

        unsubscribe();
    });

    it('should deliver remove events from a different server', async () => {
        const received: CacheChangedEvent[] = [];
        const unsubscribe = providerA.OnCacheChanged((event) => {
            if (event.Action === 'removed' && event.Category === 'integration-remove-test') {
                received.push(event);
            }
        });

        const removeEvent: CacheChangedEvent = {
            CacheKey: `remove-key-${Date.now()}`,
            Category: 'integration-remove-test',
            Action: 'removed',
            Timestamp: Date.now(),
            SourceServerId: 'other-server-00000000-0000-4000-b000-000000000004',
        };

        await rawPublisher.publish(PUB_SUB_CHANNEL, JSON.stringify(removeEvent));
        await new Promise(r => setTimeout(r, 500));

        expect(received.length).toBeGreaterThanOrEqual(1);
        expect(received[0].Action).toBe('removed');

        unsubscribe();
    });
});
