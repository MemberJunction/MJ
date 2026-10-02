/**
 * @fileoverview Clearing the shared cache from a process that is not a cache participant.
 *
 * Writers outside the server fleet — `mj sync push`, `mj codegen`, `mj migrate` — change the
 * database without touching the shared Redis cache, so every server keeps serving what it cached
 * before. Clearing the affected categories through a {@link RedisLocalStorageProvider} fixes that
 * bluntly: the keys go, and each clear publishes `category_cleared`, which makes every server
 * reload what its engines hold.
 *
 * @module @memberjunction/redis-provider
 */
import { RedisLocalStorageProvider, RedisProviderConfig } from './RedisLocalStorageProvider.js';

/** Categories a database-changing tool clears by default. */
export const SHARED_CACHE_WRITE_CATEGORIES: readonly string[] = ['RunViewCache', 'RunQueryCache', 'DatasetCache', 'Metadata'];

/** The category the provider's metadata snapshot is stored in. */
const SNAPSHOT_CATEGORY = 'default';

/**
 * Substring shared by every key of the provider's metadata snapshot
 * (`___MJCore_Metadata_Timestamps`, `_AllMetadata`, …).
 *
 * Dataset keys (`___MJCore_Metadata<connection>__DATASET__<name>`) contain it too, since
 * `GetDatasetCacheKey` builds on the same root. Current builds write those to
 * `ProviderBase.DatasetCacheCategory` instead, where the ordinary category clear removes them, but a
 * Redis instance that served an older build still holds some here.
 *
 * Do not narrow this to the snapshot's own suffixes: matching the whole marker is what sweeps those
 * older dataset keys.
 */
const SNAPSHOT_KEY_MARKER = '___MJCore_Metadata';

/** The snapshot key whose change tells a server to re-check its metadata (it is written last). */
const SNAPSHOT_TIMESTAMPS_SUFFIX = '___MJCore_Metadata_Timestamps';

/** Outcome of clearing one category. */
export interface SharedCacheCategoryClear {
    Category: string;
    /** Keys present in the category just before it was cleared (or that would be, on a dry run). */
    KeyCount: number;
    /** False when the clear itself failed; `KeyCount` is then what was found, not what went. */
    Ok: boolean;
    /** Why it failed, when it did. */
    Error?: string;
}

/** Options for {@link ClearSharedCacheCategories}. */
export interface SharedCacheClearOptions {
    /** Connection and key prefix. Pub/sub is always enabled for the clear, whatever this says. */
    Connection: RedisProviderConfig;
    /** Categories to clear; defaults to {@link SHARED_CACHE_WRITE_CATEGORIES}. */
    Categories?: readonly string[];
    /** Count the keys without deleting anything or notifying anyone. */
    DryRun?: boolean;
    /**
     * Also remove the metadata snapshot, which makes every server re-check its metadata against the
     * database. Defaults to true when `Categories` is not given (the tool default), false otherwise.
     */
    IncludeMetadataSnapshot?: boolean;
}

/**
 * Clears cache categories on a shared Redis and notifies every subscribed server.
 *
 * @throws when Redis cannot be reached, so the caller can tell a clear that happened from one that
 *   did not. Per-category failures after a successful connection are logged by the provider.
 */
export async function ClearSharedCacheCategories(options: SharedCacheClearOptions): Promise<SharedCacheCategoryClear[]> {
    const provider = new RedisLocalStorageProvider({
        ...options.Connection,
        enablePubSub: true,
        enableLogging: options.Connection.enableLogging ?? false,
        maxRetries: options.Connection.maxRetries ?? 2,
    });
    try {
        if (!(await provider.Ping())) {
            throw new Error('Redis did not answer PING');
        }
        const results: SharedCacheCategoryClear[] = [];
        for (const category of options.Categories ?? SHARED_CACHE_WRITE_CATEGORIES) {
            const keys = await provider.GetCategoryKeys(category);
            const outcome = options.DryRun ? { Ok: true } : await provider.ClearCategoryChecked(category);
            results.push({ Category: category, KeyCount: keys.length, Ok: outcome.Ok, Error: outcome.Error });
        }
        if (options.IncludeMetadataSnapshot ?? options.Categories === undefined) {
            const removed = await removeMetadataSnapshot(provider, options.DryRun === true);
            results.push({ Category: SNAPSHOT_CATEGORY, KeyCount: removed, Ok: true });
        }
        await flushNotifications(provider);
        return results;
    } finally {
        await provider.Disconnect();
    }
}

async function removeKeys(provider: RedisLocalStorageProvider, keys: readonly string[], category: string): Promise<void> {
    for (const key of keys) {
        await provider.Remove(key, category);
    }
}

/**
 * Removes the metadata snapshot, and with it any dataset keys an older build left in this category
 * (see {@link SNAPSHOT_KEY_MARKER}). The timestamps key goes last: removing it is the notice that
 * makes servers re-check their metadata.
 * @returns How many keys were (or, on a dry run, would be) removed.
 */
async function removeMetadataSnapshot(provider: RedisLocalStorageProvider, dryRun: boolean): Promise<number> {
    const keys = (await provider.GetCategoryKeys(SNAPSHOT_CATEGORY)).filter(k => k.includes(SNAPSHOT_KEY_MARKER));
    if (!dryRun) {
        const timestamps = keys.filter(k => k.endsWith(SNAPSHOT_TIMESTAMPS_SUFFIX));
        await removeKeys(provider, keys.filter(k => !k.endsWith(SNAPSHOT_TIMESTAMPS_SUFFIX)), SNAPSHOT_CATEGORY);
        await removeKeys(provider, timestamps, SNAPSHOT_CATEGORY);
    }
    return keys.length;
}

/**
 * Notifications are published without waiting. A round trip after them guarantees they reached the
 * server before the connection closes.
 */
async function flushNotifications(provider: RedisLocalStorageProvider): Promise<void> {
    await provider.Ping();
}
