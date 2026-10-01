import 'reflect-metadata';
/**
 * Routing of shared-cache events in MJAPI (plan F11): metadata notices trigger a metadata check,
 * everything reaches LocalCacheManager, and only RunView slot changes reach browsers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CacheChangedEvent, ProviderBase } from '@memberjunction/core';

const dispatch = vi.fn();
const publish = vi.fn();
const startSweeper = vi.fn();

/** Intervals StartUserCacheChecks handed to the user cache. */
const userCacheInterval: number[] = [];

vi.mock('@memberjunction/core', () => ({
    CacheCategory: { RunViewCache: 'RunViewCache', RunQueryCache: 'RunQueryCache', DatasetCache: 'DatasetCache', Metadata: 'Metadata', Default: 'default' },
    LocalCacheManager: { Instance: {
        DispatchCacheChange: (e: CacheChangedEvent) => dispatch(e),
        // The metadata sweep takes a fleet lease before doing any work; grant it in tests.
        TryAcquireSharedLease: vi.fn(async () => true),
    } },
    LogStatusEx: vi.fn(),
    LogError: vi.fn(),
    BaseEngineSweeper: { Instance: { Start: (ms: number) => startSweeper(ms) } },
}));
vi.mock('@memberjunction/redis-provider', () => ({ RedisLocalStorageProvider: vi.fn(function (this: Record<string, unknown>, cfg: unknown) { this.cfg = cfg; }) }));
vi.mock('../generic/PubSubManager.js', () => ({ PubSubManager: { Instance: { Publish: (...a: unknown[]) => publish(...a) } } }));
vi.mock('../generic/CacheInvalidationResolver.js', () => ({ CACHE_INVALIDATION_TOPIC: 'CACHE_INVALIDATION' }));
vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { StartStalenessChecks: (ms: number) => userCacheInterval.push(ms) } },
}));

import {
    CacheManagerConfigFromSettings, CreateSharedCacheFromEnvironment, MJAPI_PUBLISH_MODES, ResolveSharedCacheTTLSeconds, RouteSharedCacheEvent,
    StartEngineSweeper,
    StartUserCacheChecks,
    StartMetadataSweep,
    WirePushStatusFanOut,
} from '../sharedCache.js';
import { MJGlobal } from '@memberjunction/global';
import type { PubSubEngine } from 'type-graphql';
import { PublishStatusUpdate, SetPushStatusPublishHook } from '../generic/PushStatusResolver.js';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import type { CacheSettingsConfig } from '../config.js';

function settings(overrides: Partial<CacheSettingsConfig>): CacheSettingsConfig {
    return { maxMemoryMB: 150, maxPercentOfCachePerEntity: 50, defaultTTLSeconds: 0, evictionSweepIntervalSeconds: 300, verboseLogging: false, engineSweepIntervalSeconds: 300, ...overrides };
}

function event(overrides: Partial<CacheChangedEvent>): CacheChangedEvent {
    return { CacheKey: 'k', Category: 'RunViewCache', Action: 'set', Timestamp: 1, SourceServerId: 'peer-server', ...overrides };
}

function provider(isNotice: boolean): ProviderBase {
    return { HandlePeerMetadataNotice: vi.fn(() => isNotice) } as unknown as ProviderBase;
}

describe('shared cache event routing', () => {
    beforeEach(() => {
        dispatch.mockReset();
        publish.mockReset();
    });

    it('publishes RunView rows in full, metadata snapshots as notices, and nothing else', () => {
        expect(MJAPI_PUBLISH_MODES).toEqual({ RunViewCache: 'full', default: 'notice' });
    });

    it('hands a metadata notice to the provider and stops there', () => {
        const p = provider(true);
        RouteSharedCacheEvent(event({ Category: 'default', CacheKey: '___MJCore_Metadata_Timestamps' }), p);
        expect(p.HandlePeerMetadataNotice).toHaveBeenCalledOnce();
        expect(dispatch).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });

    it('dispatches a RunView change and relays it to browsers as an entity invalidation', () => {
        RouteSharedCacheEvent(event({ CacheKey: 'MJ: AI Models|_|_|-1|0|_|_|imr:1' }), provider(false));
        expect(dispatch).toHaveBeenCalledOnce();
        expect(publish).toHaveBeenCalledWith('CACHE_INVALIDATION', expect.objectContaining({ entityName: 'MJ: AI Models', action: 'set', primaryKeyValues: null }));
    });

    it('does not relay other categories or category clears to browsers', () => {
        RouteSharedCacheEvent(event({ Category: 'default', CacheKey: '___MJCore_Metadata_AllMetadata' }), provider(false));
        RouteSharedCacheEvent(event({ Category: 'DatasetCache', CacheKey: 'ds' }), provider(false));
        RouteSharedCacheEvent(event({ Category: 'RunViewCache', CacheKey: 'RunViewCache', Action: 'category_cleared' }), provider(false));
        expect(dispatch).toHaveBeenCalledTimes(3);
        expect(publish).not.toHaveBeenCalled();
    });

    it('ignores notices that arrive before the metadata provider exists', () => {
        RouteSharedCacheEvent(event({ Category: 'default', CacheKey: '___MJCore_Metadata_Timestamps' }), undefined);
        expect(dispatch).toHaveBeenCalledOnce();
        expect(publish).not.toHaveBeenCalled();
    });
});

describe('shared cache configuration', () => {
    it('builds the provider only when REDIS_URL is set, with MJAPI publish modes', () => {
        expect(CreateSharedCacheFromEnvironment(undefined, {})).toBeNull();
        const provider = CreateSharedCacheFromEnvironment(settings({ verboseLogging: true, sharedCacheTTLSeconds: 120 }),
            { REDIS_URL: 'redis://h:1', REDIS_KEY_PREFIX: 'fleet' }) as unknown as { cfg: Record<string, unknown> };
        expect(provider).toBeInstanceOf(RedisLocalStorageProvider);
        expect(provider.cfg).toMatchObject({
            url: 'redis://h:1', keyPrefix: 'fleet', defaultTTLSeconds: 120, enablePubSub: true, enableLogging: true,
            publishModes: { RunViewCache: 'full', default: 'notice' }, defaultPublishMode: 'none',
        });
    });

    it('lets REDIS_TTL_SECONDS override the configured TTL, and ignores junk', () => {
        expect(ResolveSharedCacheTTLSeconds(120, { REDIS_TTL_SECONDS: '60' })).toBe(60);
        expect(ResolveSharedCacheTTLSeconds(120, { REDIS_TTL_SECONDS: '0' })).toBe(0);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(ResolveSharedCacheTTLSeconds(120, { REDIS_TTL_SECONDS: 'soon' })).toBe(120);
        warn.mockRestore();
        expect(ResolveSharedCacheTTLSeconds(undefined, {})).toBeUndefined();
    });

    it('maps cacheSettings onto LocalCacheManager settings', () => {
        expect(CacheManagerConfigFromSettings(settings({ maxMemoryMB: 10, maxPercentOfCachePerEntity: 20, defaultTTLSeconds: 5, evictionSweepIntervalSeconds: 7, verboseLogging: true })))
            .toEqual({ maxSizeBytes: 10 * 1024 * 1024, maxPercentOfCachePerEntity: 20, defaultTTLMs: 5000, evictionSweepIntervalMs: 7000, verboseLogging: true });
        expect(CacheManagerConfigFromSettings(undefined).maxSizeBytes).toBe(150 * 1024 * 1024);
    });

    it('starts the engine sweep at the configured interval, off when 0', () => {
        startSweeper.mockReset();
        expect(StartEngineSweeper(settings({ engineSweepIntervalSeconds: 60 }))).toBe(60_000);
        expect(startSweeper).toHaveBeenLastCalledWith(60_000);
        expect(StartEngineSweeper(undefined)).toBe(300_000);
        expect(StartEngineSweeper(settings({ engineSweepIntervalSeconds: 0 }))).toBe(0);
        expect(startSweeper).toHaveBeenLastCalledWith(0);
    });

    it('starts the user-cache staleness check at the configured interval, off when 0', () => {
        userCacheInterval.length = 0;
        expect(StartUserCacheChecks(settings({ userCacheCheckIntervalSeconds: 60 }))).toBe(60_000);
        expect(StartUserCacheChecks(undefined)).toBe(300_000);
        expect(StartUserCacheChecks(settings({ userCacheCheckIntervalSeconds: 0 }))).toBe(0);
        expect(userCacheInterval).toEqual([60_000, 300_000, 0]);
    });
});

/**
 * The metadata sweep is the backstop for metadata written outside MJ — and nothing else.
 *
 * Metadata staleness is otherwise event-driven: a `BaseEntity` write to a member entity schedules a
 * refresh, a peer's snapshot write publishes a notice, a CLI write clears the cache. None of those
 * fire for raw SQL, so metadata edited directly in the database is never noticed by a running
 * process.
 *
 * It must not become an unconditional poll. A recurring query prevents a serverless database from
 * pausing, and `TrustServerCacheCompletely = true` (every MJ entity, by default) states that the
 * event paths already cover the entity — so there is nothing a query could find.
 */
describe('StartMetadataSweep', () => {
    afterEach(() => {
        StartMetadataSweep(settings({ metadataSweepIntervalSeconds: 0 }), () => undefined);
        vi.useRealTimers();
    });

    it('returns the configured interval, and 0 disables it', () => {
        expect(StartMetadataSweep(settings({ metadataSweepIntervalSeconds: 45 }), () => undefined)).toBe(45_000);
        expect(StartMetadataSweep(settings({ metadataSweepIntervalSeconds: 0 }), () => undefined)).toBe(0);
    });

    it('asks the provider NOTHING when no metadata entity declares drift', async () => {
        vi.useFakeTimers();
        const sweep = vi.fn();
        const provider = {
            MetadataMembersDeclaringDrift: () => [],
            SweepMetadataAgainstDatabase: sweep,
        } as unknown as ProviderBase;

        StartMetadataSweep(settings({ metadataSweepIntervalSeconds: 10 }), () => provider);
        await vi.advanceTimersByTimeAsync(10_000 * 3 + 100);

        expect(sweep).not.toHaveBeenCalled();
    });

    it('sweeps when a metadata entity declares drift', async () => {
        vi.useFakeTimers();
        const sweep = vi.fn().mockResolvedValue({ Declared: ['MJ: Entities'], Checked: true, Refreshed: true });
        const provider = {
            MetadataMembersDeclaringDrift: () => ['MJ: Entities'],
            SweepMetadataAgainstDatabase: sweep,
        } as unknown as ProviderBase;

        StartMetadataSweep(settings({ metadataSweepIntervalSeconds: 10 }), () => provider);
        await vi.advanceTimersByTimeAsync(10_000 + 100);

        expect(sweep).toHaveBeenCalled();
    });
});

/**
 * The push-status fan-out's WIRING (MJ #4222).
 *
 * `pushStatusFanOut.test.ts` covers the pieces — what is worth replicating, that every publish is
 * stamped with the publishing instance, and every branch of `ParseReplicatedStatusUpdate`. What
 * nothing covered is the wiring that joins them to Redis, which is the code that moved into this
 * module: that a channel is actually subscribed, that inbound traffic is parsed against THIS
 * process's id and handed to `PubSubManager`, that a local publish is forwarded on the same
 * channel, and that a Redis failure degrades the feature instead of stopping the server.
 *
 * The parser and the publisher here are the real ones; mocking them would make these tests of the
 * mock rather than of the wiring.
 */
describe('push-status fan-out wiring', () => {
    /** A stand-in for the shared cache provider, capturing what the fan-out does to it. */
    class FakeSharedCache {
        public SubscribedChannel: string | undefined;
        public Published: Array<{ channel: string; payload: string }> = [];
        private inboundHandler: ((raw: string) => void) | undefined;
        constructor(private subscribeFails = false) {}

        public SubscribeToChannel = vi.fn(async (channel: string, handler: (raw: string) => void) => {
            if (this.subscribeFails) {
                throw new Error('redis is down');
            }
            this.SubscribedChannel = channel;
            this.inboundHandler = handler;
            return () => undefined;
        });

        public PublishMessage = vi.fn((channel: string, payload: string) => {
            this.Published.push({ channel, payload });
        });

        /** Simulates Redis delivering a message on the subscribed channel. */
        public Deliver(raw: string): void {
            this.inboundHandler?.(raw);
        }

        public AsProvider(): RedisLocalStorageProvider {
            return this as unknown as RedisLocalStorageProvider;
        }
    }

    /** A PubSubEngine the real publisher can publish locally on, which these tests ignore. */
    function localTopic(): PubSubEngine {
        return { publish: vi.fn(async () => undefined) } as unknown as PubSubEngine;
    }

    beforeEach(() => {
        publish.mockReset();
        SetPushStatusPublishHook(undefined);
    });
    afterEach(() => {
        SetPushStatusPublishHook(undefined);
    });

    it('subscribes to the push-status channel on the shared connection', async () => {
        const redis = new FakeSharedCache();
        await WirePushStatusFanOut(redis.AsProvider());

        expect(redis.SubscribeToChannel).toHaveBeenCalledTimes(1);
        expect(redis.SubscribedChannel).toBe('push-status-updates');
    });

    it("hands a PEER's update to this process's local topic, identity fields intact", async () => {
        const redis = new FakeSharedCache();
        await WirePushStatusFanOut(redis.AsProvider());

        redis.Deliver(JSON.stringify({
            sessionId: 'session-1', ownerUserId: 'user-1', message: 'done', SourceServerId: 'some-other-replica',
        }));

        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith('PUSH_STATUS_UPDATES', {
            sessionId: 'session-1', ownerUserId: 'user-1', message: 'done', SourceServerId: 'some-other-replica',
        });
    });

    it("drops this process's own update echoed back, so a push is not delivered twice", async () => {
        // The parser owns the comparison; this pins that the wiring gives it THIS process's id.
        const redis = new FakeSharedCache();
        await WirePushStatusFanOut(redis.AsProvider());

        redis.Deliver(JSON.stringify({
            sessionId: 'session-1', ownerUserId: 'user-1', message: 'done',
            SourceServerId: MJGlobal.Instance.ProcessUUID,
        }));

        expect(publish).not.toHaveBeenCalled();
    });

    it('forwards a real local publish onto the same channel', async () => {
        const redis = new FakeSharedCache();
        await WirePushStatusFanOut(redis.AsProvider());

        PublishStatusUpdate(localTopic(), { sessionId: 'session-9', ownerUserId: 'user-9', message: 'agent finished' });

        expect(redis.Published).toHaveLength(1);
        expect(redis.Published[0].channel).toBe('push-status-updates');
        expect(JSON.parse(redis.Published[0].payload)).toEqual({
            sessionId: 'session-9', ownerUserId: 'user-9', message: 'agent finished',
            SourceServerId: MJGlobal.Instance.ProcessUUID,
        });
    });

    it('degrades instead of stopping the server when Redis cannot subscribe', async () => {
        const redis = new FakeSharedCache(true);

        await expect(WirePushStatusFanOut(redis.AsProvider())).resolves.toBeUndefined();

        // No hook may be left pointing at a connection it could not subscribe on.
        PublishStatusUpdate(localTopic(), { sessionId: 's', ownerUserId: 'u', message: 'x' });
        expect(redis.PublishMessage).not.toHaveBeenCalled();
    });
});
