/**
 * Everything an MJAPI process does with its shared (Redis) connection: which provider to build,
 * what it publishes, what it does with events from other servers, and which periodic jobs the
 * connection's leases coordinate.
 *
 * Two independent consumers share the one connection and its one subscriber:
 * {@link WireSharedCacheEvents} for cache invalidation, and {@link WirePushStatusFanOut} for
 * cross-instance push-status delivery (MJ #4222). Both live here rather than at the call site so
 * that "what is our Redis used for" has a single answer.
 *
 */
import { BaseEngineSweeper, CacheCategory, LocalCacheManager, LogError, LogStatusEx } from '@memberjunction/core';
import type { CacheChangedEvent, LocalCacheManagerConfig, ProviderBase } from '@memberjunction/core';
import type { CacheSettingsConfig } from './config.js';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import type { CachePublishMode } from '@memberjunction/redis-provider';
import { MJGlobal } from '@memberjunction/global';
import { PubSubManager } from './generic/PubSubManager.js';
import { PUSH_STATUS_UPDATES_TOPIC, SetPushStatusPublishHook, ParseReplicatedStatusUpdate } from './generic/PushStatusResolver.js';
import { CACHE_INVALIDATION_TOPIC } from './generic/CacheInvalidationResolver.js';
import { UserCache } from '@memberjunction/generic-database-provider';

/**
 * What an MJAPI process publishes, per category.
 *
 * - RunView slots carry their rows: engines on other servers apply them directly.
 * - Writes without a category (the provider's metadata snapshot, ~2 MB compressed) publish a
 *   notice only: other servers re-check their metadata against the database and adopt the shared
 *   snapshot, so the value never needs to travel.
 * - Everything else (dataset slots, query slots, registry) has no subscriber and publishes nothing.
 * Category clears are always published.
 */
export const MJAPI_PUBLISH_MODES: Readonly<Record<string, CachePublishMode>> = {
    [CacheCategory.RunViewCache]: 'full',
    [CacheCategory.Default]: 'notice',
};

/** Options for {@link CreateSharedCacheProvider}. */
export interface SharedCacheProviderOptions {
    Url: string;
    KeyPrefix: string;
    DefaultTTLSeconds?: number;
    EnableLogging: boolean;
}

/**
 * Expiry for the shared Redis cache: `REDIS_TTL_SECONDS` when it holds a non-negative integer,
 * otherwise `cacheSettings.sharedCacheTTLSeconds`, otherwise `undefined` (the provider's default).
 */
export function ResolveSharedCacheTTLSeconds(configured: number | undefined, env: NodeJS.ProcessEnv = process.env): number | undefined {
  const fromEnv = env.REDIS_TTL_SECONDS;
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    const parsed = Number(fromEnv);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
    console.warn(`REDIS_TTL_SECONDS="${fromEnv}" is not a non-negative integer; ignoring it`);
  }
  return configured;
}

/**
 * The shared cache the environment asks for (`REDIS_URL`, `REDIS_KEY_PREFIX`, `REDIS_TTL_SECONDS`),
 * or null. Built before the database provider so metadata and startup engines use it from the
 * first read.
 */
export function CreateSharedCacheFromEnvironment(settings: CacheSettingsConfig | undefined, env: NodeJS.ProcessEnv = process.env): RedisLocalStorageProvider | null {
    if (!env.REDIS_URL) {
        return null;
    }
    return CreateSharedCacheProvider({
        Url: env.REDIS_URL,
        KeyPrefix: env.REDIS_KEY_PREFIX || 'mj',
        DefaultTTLSeconds: ResolveSharedCacheTTLSeconds(settings?.sharedCacheTTLSeconds, env),
        EnableLogging: settings?.verboseLogging ?? false,
    });
}

/**
 * The warm-up lease MJAPI hands to `StartupManager`, in milliseconds, from
 * `cacheSettings.startupWarmupLeaseSeconds` (default 30).
 */
export function WarmupLeaseMsFromSettings(settings: CacheSettingsConfig | undefined): number {
    return (settings?.startupWarmupLeaseSeconds ?? 30) * 1000;
}

/** `LocalCacheManager` settings from `cacheSettings` in mj.config.cjs. */
export function CacheManagerConfigFromSettings(settings: CacheSettingsConfig | undefined): Partial<LocalCacheManagerConfig> {
    return {
        maxSizeBytes: (settings?.maxMemoryMB ?? 150) * 1024 * 1024,
        maxPercentOfCachePerEntity: settings?.maxPercentOfCachePerEntity ?? 50,
        defaultTTLMs: (settings?.defaultTTLSeconds ?? 0) * 1000,
        evictionSweepIntervalMs: (settings?.evictionSweepIntervalSeconds ?? 300) * 1000,
        verboseLogging: settings?.verboseLogging ?? false,
    };
}

/**
 * Starts the periodic engine-vs-database sweep (plan Phase 3.1) at
 * `cacheSettings.engineSweepIntervalSeconds` (default 300; 0 leaves it off).
 * @returns The interval in milliseconds, 0 when disabled.
 */
export function StartEngineSweeper(settings: CacheSettingsConfig | undefined): number {
    const intervalMs = (settings?.engineSweepIntervalSeconds ?? 300) * 1000;
    BaseEngineSweeper.Instance.Start(intervalMs);
    return intervalMs;
}

/** The periodic metadata sweep, so a restart or a config change can replace it. @internal */
let metadataSweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the periodic metadata-vs-database sweep at `cacheSettings.metadataSweepIntervalSeconds`
 * (default 300; 0 leaves it off).
 *
 * The sweep asks the database **nothing** unless one of the entities the metadata is built from
 * declares `TrustServerCacheCompletely = false` — see `ProviderBase.SweepMetadataAgainstDatabase`.
 * On a stock installation no metadata entity declares it, so the timer ticks and costs nothing. It
 * exists for installations that write metadata tables directly, where no event is ever raised and
 * nothing else would notice.
 *
 * One process per interval does the work, via a shared lease: a process that refreshes writes a new
 * snapshot and publishes a notice, which the others act on, so there is no value in each of them
 * asking the database the same question.
 *
 * @returns The interval in milliseconds, 0 when disabled.
 */
export function StartMetadataSweep(settings: CacheSettingsConfig | undefined, metadataProvider: () => ProviderBase | undefined): number {
    if (metadataSweepTimer) {
        clearInterval(metadataSweepTimer);
        metadataSweepTimer = null;
    }
    const intervalMs = (settings?.metadataSweepIntervalSeconds ?? 300) * 1000;
    if (intervalMs <= 0) {
        return 0;
    }
    const leaseMs = Math.max(5_000, intervalMs - 5_000);
    const timer = setInterval(() => void runMetadataSweep(metadataProvider(), leaseMs), intervalMs);
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
        (timer as { unref(): void }).unref();
    }
    metadataSweepTimer = timer;
    return intervalMs;
}

/** One sweep: take the fleet lease only when there is something to check. @internal */
async function runMetadataSweep(provider: ProviderBase | undefined, leaseMs: number): Promise<void> {
    if (!provider) {
        return;
    }
    try {
        // The lease is taken only when an entity declares drift, so a stock installation costs no
        // Redis round trip either — the provider answers from its own membership set.
        const declared = provider.MetadataMembersDeclaringDrift();
        if (declared.length === 0) {
            return;
        }
        if (!(await LocalCacheManager.Instance.TryAcquireSharedLease('metadata-sweep', leaseMs))) {
            return;
        }
        const result = await provider.SweepMetadataAgainstDatabase();
        if (result.Refreshed) {
            LogStatusEx({ message: `[MJAPI] metadata sweep reloaded metadata; entities declaring drift: ${result.Declared.join(', ')}`, verboseOnly: false });
        }
    } catch (e) {
        LogError(`[MJAPI] metadata sweep failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/**
 * Starts the periodic user-cache staleness check at `cacheSettings.userCacheCheckIntervalSeconds`
 * (default 300; 0 leaves it off). The cache refreshes on MJ writes by itself — this covers users
 * and roles changed outside MJ.
 * @returns The interval in milliseconds, 0 when disabled.
 */
export function StartUserCacheChecks(settings: CacheSettingsConfig | undefined): number {
    const intervalMs = (settings?.userCacheCheckIntervalSeconds ?? 300) * 1000;
    UserCache.Instance.StartStalenessChecks(intervalMs);
    return intervalMs;
}

/** Builds the Redis provider MJAPI uses as its shared cache. Pub/sub starts with {@link WireSharedCacheEvents}. */
export function CreateSharedCacheProvider(options: SharedCacheProviderOptions): RedisLocalStorageProvider {
    // The provider's own config keys stay as the package declares them.
    return new RedisLocalStorageProvider({
        url: options.Url,
        keyPrefix: options.KeyPrefix,
        defaultTTLSeconds: options.DefaultTTLSeconds,
        enablePubSub: true,
        enableLogging: options.EnableLogging,
        publishModes: MJAPI_PUBLISH_MODES,
        defaultPublishMode: 'none',
    });
}

/**
 * Subscribes to other servers' cache events and routes them. Called before the database provider
 * exists (so engines hear peers while they load); `metadataProvider` is resolved per event.
 * 1. a metadata-snapshot notice → a metadata staleness check on this process's provider, and
 *    nothing further (a consumed notice returns here);
 * 2. every other event → `LocalCacheManager.DispatchCacheChange` (engines, the user cache, and
 *    RunView callbacks);
 * 3. RunView slot changes → an entity-level invalidation to connected browsers.
 */
export async function WireSharedCacheEvents(redis: RedisLocalStorageProvider, metadataProvider: () => ProviderBase | undefined): Promise<void> {
    await redis.StartListening();
    redis.OnCacheChanged((event) => RouteSharedCacheEvent(event, metadataProvider()));
}

/** One incoming event, routed as described on {@link WireSharedCacheEvents}. */
export function RouteSharedCacheEvent(event: CacheChangedEvent, metadataProvider: ProviderBase | undefined): void {
    const source = event.SourceServerId ? event.SourceServerId.substring(0, 8) : 'unknown';
    LogStatusEx({ message: `[MJAPI] shared cache event: ${event.Category}/${event.Action} "${event.CacheKey}" from ${source}`, verboseOnly: true });

    if (metadataProvider?.HandlePeerMetadataNotice(event)) {
        return;
    }
    LocalCacheManager.Instance.DispatchCacheChange(event);
    relayRunViewChangeToBrowsers(event);
}

/**
 * Browsers only care about entity data. A RunView slot key starts with the entity name
 * (`Entity|Filter|…`); other categories' keys are not entity names and used to reach browsers as
 * invalidations for "entities" such as `___MJCore_Metadata_AllMetadata`.
 */
function relayRunViewChangeToBrowsers(event: CacheChangedEvent): void {
    if (event.Category !== CacheCategory.RunViewCache || event.Action === 'category_cleared') {
        return;
    }
    const entityName = event.CacheKey ? event.CacheKey.split('|')[0] : '';
    if (!entityName) {
        return;
    }
    PubSubManager.Instance.Publish(CACHE_INVALIDATION_TOPIC, {
        entityName,
        primaryKeyValues: null, // entity-level invalidation
        action: event.Action,
        sourceServerId: event.SourceServerId || 'unknown',
        timestamp: new Date(),
    });
}

/** Redis channel carrying replicated push-status updates between server instances. */
const PUSH_STATUS_FANOUT_CHANNEL = 'push-status-updates';

/**
 * Replicate push-status updates across server instances over Redis (MJ #4222).
 *
 * Outbound: every locally-published update is forwarded on a shared channel. Inbound: a message
 * from another instance is republished onto THIS instance's local topic, where the normal
 * subscription filter decides who receives it — so the identity gate (`ownerUserId` vs. the
 * connection's authenticated user) still applies to a replicated message exactly as it does to a
 * local one. The replica has no say in who sees what.
 *
 * Republishing goes straight to `PubSubManager`, never back through `publishStatusUpdate`, so an
 * inbound message cannot be re-broadcast and loop. `SourceServerId` guards the remaining case: a
 * publisher also receives its own message from Redis.
 *
 * The channel rides the same connection and subscriber as cache invalidation, and is namespaced
 * with the provider's key prefix — so replicas configured with different `REDIS_KEY_PREFIX`
 * values stop replicating to each other, exactly as their caches do.
 *
 * @param redis The shared cache provider, already built by {@link CreateSharedCacheFromEnvironment}.
 */
export async function WirePushStatusFanOut(redis: RedisLocalStorageProvider): Promise<void> {
    try {
        await redis.SubscribeToChannel(PUSH_STATUS_FANOUT_CHANNEL, (raw: string) => {
            try {
                const payload = ParseReplicatedStatusUpdate(raw, MJGlobal.Instance.ProcessUUID);
                if (!payload) {
                    return;
                }
                // Rebuilt as a plain record: the topic's publish signature takes an index-signature
                // type, and listing the fields keeps the wire shape explicit at the one place it
                // crosses hosts.
                PubSubManager.Instance.Publish(PUSH_STATUS_UPDATES_TOPIC, {
                    sessionId: payload.sessionId,
                    ownerUserId: payload.ownerUserId,
                    message: payload.message,
                    SourceServerId: payload.SourceServerId,
                });
            } catch (err) {
                // A malformed message on a shared channel must not take down the subscriber.
                LogError('Error processing push-status fan-out message', undefined, err);
            }
        });

        SetPushStatusPublishHook((payload) => {
            redis.PublishMessage(PUSH_STATUS_FANOUT_CHANNEL, JSON.stringify(payload));
        });

        // Printed unconditionally, not verbose-gated. "Is fan-out actually on?" is the first
        // question anyone debugging a hung conversation behind a load balancer asks, and a silent
        // default left no way to answer it.
        console.log('[MJAPI] Push-status updates: cross-instance fan-out enabled via Redis');
    } catch (err) {
        // Single-instance delivery still works, and the durable tail query covers the rest.
        // Degraded, not broken — so this must not stop the server from starting.
        console.warn(`Push-status fan-out unavailable: ${(err as Error).message}`);
    }
}
