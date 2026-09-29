/**
 * The shared (Redis) cache wiring for an MJAPI process: which provider to build, what it
 * publishes, and what the process does with events from other servers.
 *
 * See plans/engine-cache-architecture-plan.md (F11, N1).
 */
import { BaseEngineSweeper, CacheCategory, LocalCacheManager, LogStatusEx } from '@memberjunction/core';
import type { CacheChangedEvent, LocalCacheManagerConfig, ProviderBase } from '@memberjunction/core';
import type { CacheSettingsConfig } from './config.js';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import type { CachePublishMode } from '@memberjunction/redis-provider';
import { PubSubManager } from './generic/PubSubManager.js';
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
 * first read (plan N1).
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

/** `LocalCacheManager` settings from `cacheSettings` in mj.config.cjs (plan N5). */
/**
 * The warm-up lease MJAPI hands to `StartupManager`, in milliseconds (plan §16.3 #21 — it used to
 * be a constant no host could change).
 */
export function WarmupLeaseMsFromSettings(settings: CacheSettingsConfig | undefined): number {
    return (settings?.startupWarmupLeaseSeconds ?? 30) * 1000;
}

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

/**
 * Starts the periodic user-cache staleness check at `cacheSettings.userCacheCheckIntervalSeconds`
 * (default 300; 0 leaves it off). The cache refreshes on MJ writes by itself — this covers users
 * and roles changed outside MJ (plan §15).
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
