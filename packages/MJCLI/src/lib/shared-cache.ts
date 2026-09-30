/**
 * Clearing the shared (Redis) cache after the CLI changes the database.
 *
 * `mj sync push`, `mj codegen` and `mj migrate` write to the database from a process that is not
 * part of the server fleet's cache, so no server hears about the change and each keeps serving what
 * it cached before — indefinitely, because server-side cache hits are never re-validated (#4083).
 * When `REDIS_URL` is configured (in the environment or the dotenv file the CLI loads), these
 * commands clear the cache categories and the metadata snapshot afterwards; every server reloads its
 * engines and re-checks its metadata. `mj cache clear` does the same on demand.
 *
 * A failed clear never fails the command — the database change already succeeded — but it is
 * reported loudly, with the command to run by hand.
 */
import { ClearSharedCacheCategories, SHARED_CACHE_WRITE_CATEGORIES } from '@memberjunction/redis-provider';
import type { RedisProviderConfig, SharedCacheCategoryClear } from '@memberjunction/redis-provider';

/** Setting this to `1`/`true` disables the automatic clear (the explicit command still works). */
export const SKIP_CACHE_CLEAR_ENV = 'MJ_SKIP_SHARED_CACHE_CLEAR';

/** The categories a clear may target: everything a CLI write invalidates, plus the proxy-key store. */
const CLEARABLE_CATEGORIES: readonly string[] = [...SHARED_CACHE_WRITE_CATEGORIES, 'default'];

/** What the user asked to clear, mapped onto the names the cache actually uses. */
export type ResolvedCacheCategories = {
    /** Canonical category names, safe to hand to the store. */
    Categories: string[];
    /** Anything that matched no known category, in the spelling the user gave. */
    Unknown: string[];
};

/**
 * Maps requested category names onto their canonical spelling.
 *
 * Names are accepted case-insensitively because nobody should have to remember that it is
 * `RunViewCache` and not `runviewcache`. But Redis keys ARE case-sensitive, so accepting a
 * spelling and then using it verbatim scanned `{prefix}:runviewcache:*`, matched nothing, and
 * reported a successful clear of 0 keys — the operator is told the fleet will reload and it never
 * does. Accept the spelling, then hand the store the canonical name (plan §22.3).
 */
export function ResolveCacheCategories(requested: readonly string[] | undefined): ResolvedCacheCategories {
    if (!requested?.length) {
        return { Categories: [...SHARED_CACHE_WRITE_CATEGORIES], Unknown: [] };
    }
    const resolved: string[] = [];
    const unknown: string[] = [];
    for (const raw of requested) {
        const canonical = CLEARABLE_CATEGORIES.find(known => known.toLowerCase() === raw.trim().toLowerCase());
        if (canonical) {
            if (!resolved.includes(canonical)) {
                resolved.push(canonical);
            }
        } else {
            unknown.push(raw);
        }
    }
    return { Categories: resolved, Unknown: unknown };
}

/** The category names a clear can be asked for, for error messages and help text. */
export function KnownCacheCategories(): string[] {
    return [...CLEARABLE_CATEGORIES];
}

/** The shared cache the environment points at, or null when none is configured. */
export interface SharedCacheTarget {
    Connection: RedisProviderConfig;
    /** Host, port and key prefix — never credentials. For messages. */
    Description: string;
}

/** What an automatic clear did, for the command's log and result. */
export interface SharedCacheClearReport {
    Ok: boolean;
    Message: string;
    Categories: SharedCacheCategoryClear[];
}

/** Resolves the shared cache from `REDIS_URL` / `REDIS_KEY_PREFIX`, the variables MJAPI reads. */
export function ResolveSharedCacheTarget(env: NodeJS.ProcessEnv = process.env): SharedCacheTarget | null {
    const url = env.REDIS_URL?.trim();
    if (!url) {
        return null;
    }
    const keyPrefix = env.REDIS_KEY_PREFIX || 'mj';
    return { Connection: { url, keyPrefix }, Description: `${DescribeRedisUrl(url)} (prefix "${keyPrefix}")` };
}

/** `host:port/db` of a Redis URL, without user or password. */
export function DescribeRedisUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const db = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
        return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${db}`;
    } catch {
        return '(unparseable REDIS_URL)';
    }
}

/** True when the automatic clear has been switched off by flag or environment. */
export function IsAutomaticClearDisabled(skipFlag: boolean | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
    if (skipFlag) {
        return true;
    }
    const value = env[SKIP_CACHE_CLEAR_ENV]?.trim().toLowerCase();
    return value === '1' || value === 'true';
}

/**
 * Clears the shared cache after `commandName` changed the database. Returns null when there is
 * nothing to do (no `REDIS_URL`, or disabled).
 */
export async function ClearSharedCacheAfterWrite(commandName: string, skipFlag?: boolean): Promise<SharedCacheClearReport | null> {
    const target = ResolveSharedCacheTarget();
    if (!target || IsAutomaticClearDisabled(skipFlag)) {
        return null;
    }
    try {
        const categories = await ClearSharedCacheCategories({
            Connection: target.Connection, Categories: SHARED_CACHE_WRITE_CATEGORIES, IncludeMetadataSnapshot: true,
        });
        const total = categories.reduce((n, c) => n + c.KeyCount, 0);
        // A category can fail on its own: ClearSharedCacheCategories reports per-category Ok/Error
        // and returns normally on a partial failure. Reporting the whole clear as a success then
        // told the operator "servers will reload" about categories that were never cleared, which
        // is the same false-success the per-category outcomes were added to expose (plan §22).
        const failed = categories.filter(c => c.Ok === false);
        if (failed.length > 0) {
            const detail = failed.map(c => `${c.Category} (${c.Error ?? 'unknown error'})`).join('; ');
            return {
                Ok: false,
                Message: `${commandName} changed the database and the shared cache on ${target.Description} was only partly cleared — ` +
                    `${failed.length} of ${categories.length} categories failed: ${detail}. ` +
                    `Servers may serve stale data for those categories until you run: mj cache clear`,
                Categories: categories,
            };
        }
        return {
            Ok: true,
            Message: `Cleared ${total} shared cache entr${total === 1 ? 'y' : 'ies'} on ${target.Description} after ${commandName}; running servers will reload.`,
            Categories: categories,
        };
    } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        return {
            Ok: false,
            Message: `${commandName} changed the database but the shared cache on ${target.Description} could not be cleared (${reason}). ` +
                `Running servers may serve stale data until you run: mj cache clear`,
            Categories: [],
        };
    }
}

/** The subset of the CLI runtime host a clear report is logged through. */
export interface SharedCacheReportSink {
    Log(message: string, level?: 'info' | 'warn' | 'error'): void;
}

/**
 * Logs a clear report and folds it into a plugin command's result: `data.sharedCacheClear`
 * always, and a warning when the clear failed. Returns the result unchanged when there is no report.
 */
export function AppendSharedCacheClear<R extends { data?: Record<string, unknown>; warnings?: string[] }>(
    result: R,
    report: SharedCacheClearReport | null,
    sink: SharedCacheReportSink,
): R {
    if (!report) {
        return result;
    }
    sink.Log(report.Message, report.Ok ? 'info' : 'warn');
    const warnings = report.Ok ? result.warnings : [...(result.warnings ?? []), report.Message];
    return {
        ...result,
        data: { ...(result.data ?? {}), sharedCacheClear: { ok: report.Ok, categories: report.Categories } },
        warnings,
    };
}
