import { LocalCacheManager } from './localCacheManager';
import { QueryInfo } from './queryInfo';
import { Metadata } from './metadata';
import { LogStatus } from './logging';
import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';

/**
 * Wrapper around LocalCacheManager that translates query-specific caching concerns
 * (paging, count, ad-hoc keys, dependency invalidation, entity-change awareness)
 * into LocalCacheManager's generic RunQueryCache methods.
 *
 * Replaces the standalone QueryCache class so that query result caching participates
 * in LCM's unified eviction, TTL, statistics, and optional Redis persistence.
 *
 * ## IMPORTANT — Caching is intentionally BYPASSED for now
 *
 * All Get/Set methods are wired up but short-circuit to no-ops. The reason:
 *
 * Query results cannot be reliably invalidated today. Unlike RunView caching (which
 * tracks individual entities and can invalidate on any row-level mutation), queries
 * are arbitrary SQL that may join, filter, or aggregate across many tables. The
 * `QueryEntity` table maps queries to the entities they reference, but those mappings
 * are LLM-discovered and not guaranteed to be complete. A TTL-only strategy risks
 * serving stale data when the underlying rows change before the TTL expires.
 *
 * The full caching implementation is preserved below so that when we have a reliable
 * invalidation strategy (e.g., entity mutation hooks that can confidently evict all
 * affected query caches with complete QueryEntity coverage), we can enable caching
 * by removing the early returns at the top of each method. Until then, every query
 * execution hits the database to guarantee fresh results.
 */
export class QueryCacheManager extends BaseSingleton<QueryCacheManager> {
    private _connectionPrefix: string = '';

    /** Tracks cache timestamps per fingerprint for computing CacheTTLRemaining */
    private _cacheTimestamps: Map<string, number> = new Map();

    /** Reverse index: normalized entity name → set of fingerprints that depend on it */
    private _queryEntityIndex: Map<string, Set<string>> = new Map();

    protected constructor() {
        super();
    }

    /**
     * Returns the singleton instance of QueryCacheManager.
     */
    public static get Instance(): QueryCacheManager {
        return super.getInstance<QueryCacheManager>();
    }

    /**
     * Initializes (or re-initializes) the connection prefix used for fingerprinting.
     * Idempotent — safe to call multiple times with the same or different prefix.
     */
    public Init(connectionPrefix: string): void {
        this._connectionPrefix = connectionPrefix;
    }

    private get LCM(): LocalCacheManager {
        return LocalCacheManager.Instance;
    }

    // ── Fingerprint generation ──────────────────────────────────────────────

    private Fingerprint(queryId: string, queryName: string, params: Record<string, unknown>): string {
        return this.LCM.GenerateRunQueryFingerprint(queryId, queryName, params, this._connectionPrefix);
    }

    private PagedFingerprint(
        queryId: string, queryName: string, params: Record<string, unknown>,
        startRow: number, maxRows: number,
    ): string {
        return `${this.Fingerprint(queryId, queryName, params)}|page:${startRow}:${maxRows}`;
    }

    private CountFingerprint(queryId: string, queryName: string, params: Record<string, unknown>): string {
        return `${this.Fingerprint(queryId, queryName, params)}|count`;
    }

    private AdhocFingerprint(sql: string): string {
        return `_adhoc_|_|${QueryCacheManager.Fnv1aHash(sql)}|${this._connectionPrefix}`;
    }

    // ── Full-result cache ───────────────────────────────────────────────────

    /**
     * Retrieves cached full (unpaginated) results for a saved query.
     * Returns null on miss or if caching is disabled.
     */
    async Get(
        query: QueryInfo, params: Record<string, unknown>,
    ): Promise<{ results: unknown[]; ttlRemainingMs: number } | null> {
        // BYPASSED — see class-level comment for rationale
        return null;

        /* When caching is enabled, uncomment the block below:
        if (!query.CacheConfig?.enabled) return null;

        const fp = this.Fingerprint(query.ID, query.Name, params);
        const cached = await this.LCM.GetRunQueryResult(fp);
        if (!cached) return null;

        const ttlRemainingMs = this.computeTTLRemaining(fp, query.CacheConfig.ttlMinutes);
        return { results: cached.results, ttlRemainingMs };
        */
    }

    /**
     * Stores full (unpaginated) query results in the cache.
     */
    async Set(
        query: QueryInfo, params: Record<string, unknown>, results: unknown[],
    ): Promise<void> {
        // BYPASSED — see class-level comment for rationale
        return;

        /* When caching is enabled, uncomment the block below:
        const config = query.CacheConfig;
        if (!config?.enabled) return;

        const fp = this.Fingerprint(query.ID, query.Name, params);
        const ttlMs = config.ttlMinutes * 60 * 1000;

        await this.LCM.SetRunQueryResult(
            fp, query.Name, results,
            new Date().toISOString(),
            results.length, query.ID, ttlMs,
        );
        this._cacheTimestamps.set(fp, Date.now());
        this.RegisterEntityDependencies(fp, query);
        */
    }

    // ── Paged cache ─────────────────────────────────────────────────────────

    /**
     * Retrieves cached results for a specific page of a paged query.
     */
    async GetPaged(
        query: QueryInfo, params: Record<string, unknown>,
        startRow: number, maxRows: number,
    ): Promise<{ results: unknown[]; ttlRemainingMs: number } | null> {
        // BYPASSED — see class-level comment for rationale
        return null;

        /* When caching is enabled, uncomment the block below:
        if (!query.CacheConfig?.enabled) return null;

        const fp = this.PagedFingerprint(query.ID, query.Name, params, startRow, maxRows);
        const cached = await this.LCM.GetRunQueryResult(fp);
        if (!cached) return null;

        const ttlRemainingMs = this.computeTTLRemaining(fp, query.CacheConfig.ttlMinutes);
        return { results: cached.results, ttlRemainingMs };
        */
    }

    /**
     * Stores results for a specific page in the cache.
     */
    async SetPaged(
        query: QueryInfo, params: Record<string, unknown>,
        startRow: number, maxRows: number, results: unknown[],
    ): Promise<void> {
        // BYPASSED — see class-level comment for rationale
        return;

        /* When caching is enabled, uncomment the block below:
        const config = query.CacheConfig;
        if (!config?.enabled) return;

        const fp = this.PagedFingerprint(query.ID, query.Name, params, startRow, maxRows);
        const ttlMs = config.ttlMinutes * 60 * 1000;
        const displayName = `${query.Name} [page ${startRow}+${maxRows}]`;

        await this.LCM.SetRunQueryResult(
            fp, displayName, results,
            new Date().toISOString(), results.length, query.ID, ttlMs,
        );
        this._cacheTimestamps.set(fp, Date.now());
        this.RegisterEntityDependencies(fp, query);
        */
    }

    // ── Count cache ─────────────────────────────────────────────────────────

    /**
     * Retrieves a cached TotalRowCount for a query + params combination.
     */
    async GetTotalRowCount(
        query: QueryInfo, params: Record<string, unknown>,
    ): Promise<number | null> {
        // BYPASSED — see class-level comment for rationale
        return null;

        /* When caching is enabled, uncomment the block below:
        if (!query.CacheConfig?.enabled) return null;

        const fp = this.CountFingerprint(query.ID, query.Name, params);
        const cached = await this.LCM.GetRunQueryResult(fp);
        if (!cached) return null;

        const row = cached.results[0] as { TotalRowCount: number } | undefined;
        return row?.TotalRowCount ?? null;
        */
    }

    /**
     * Stores a TotalRowCount value in the cache, encoded as a single-row result.
     */
    async SetTotalRowCount(
        query: QueryInfo, params: Record<string, unknown>, count: number,
    ): Promise<void> {
        // BYPASSED — see class-level comment for rationale
        return;

        /* When caching is enabled, uncomment the block below:
        const config = query.CacheConfig;
        if (!config?.enabled) return;

        const fp = this.CountFingerprint(query.ID, query.Name, params);
        const ttlMs = config.ttlMinutes * 60 * 1000;

        await this.LCM.SetRunQueryResult(
            fp, `${query.Name} [count]`, [{ TotalRowCount: count }],
            new Date().toISOString(), 1, query.ID, ttlMs,
        );
        this._cacheTimestamps.set(fp, Date.now());
        */
    }

    // ── Ad-hoc cache ────────────────────────────────────────────────────────

    /**
     * Retrieves cached results for an ad-hoc SQL query.
     */
    async GetAdhoc(sql: string, ttlMinutes: number): Promise<{ results: unknown[] } | null> {
        // BYPASSED — see class-level comment for rationale
        return null;

        /* When caching is enabled, uncomment the block below:
        if (ttlMinutes <= 0) return null;

        const fp = this.AdhocFingerprint(sql);
        const cached = await this.LCM.GetRunQueryResult(fp);
        return cached ? { results: cached.results } : null;
        */
    }

    /**
     * Stores ad-hoc SQL query results in the cache.
     */
    async SetAdhoc(sql: string, ttlMinutes: number, results: unknown[]): Promise<void> {
        // BYPASSED — see class-level comment for rationale
        return;

        /* When caching is enabled, uncomment the block below:
        if (ttlMinutes <= 0) return;

        const fp = this.AdhocFingerprint(sql);
        const ttlMs = ttlMinutes * 60 * 1000;

        await this.LCM.SetRunQueryResult(
            fp, 'Ad-Hoc Query', results,
            new Date().toISOString(), results.length, undefined, ttlMs,
        );
        this._cacheTimestamps.set(fp, Date.now());
        */
    }

    // ── Invalidation ────────────────────────────────────────────────────────

    /**
     * Invalidates all cache entries (full, paged, count) for a single query by name.
     */
    async InvalidateQuery(queryName: string): Promise<void> {
        // No-op while caching is bypassed, but safe to call unconditionally
        await this.LCM.InvalidateQueryCaches(queryName);
    }

    /**
     * Invalidates cache entries for a query and all queries that transitively depend on it.
     */
    async InvalidateWithDependents(
        query: QueryInfo,
        visited = new Set<string>(),
    ): Promise<void> {
        // No-op while caching is bypassed (nothing in cache to invalidate),
        // but the traversal logic is preserved for when caching is enabled.
        if (visited.has(query.ID)) return;
        visited.add(query.ID);

        await this.LCM.InvalidateQueryCaches(query.Name);

        const dependents = query.Dependents;
        if (dependents && dependents.length > 0) {
            for (const dep of dependents) {
                const depQuery = this.FindQueryById(dep.QueryID);
                if (depQuery) {
                    await this.InvalidateWithDependents(depQuery, visited);
                }
            }
        }
    }

    // ── Entity-change invalidation ──────────────────────────────────────────

    /**
     * Called when an entity changes (save/delete). Invalidates all query cache entries
     * that depend on the changed entity via QueryEntity mappings.
     *
     * While caching is bypassed the reverse index will always be empty, so this is
     * effectively a no-op. Kept wired up so enabling caching requires no caller changes.
     */
    async HandleEntityChange(entityName: string): Promise<void> {
        const normalized = entityName.trim().toLowerCase();
        const fingerprints = this._queryEntityIndex.get(normalized);
        if (!fingerprints || fingerprints.size === 0) return;

        const fpArray = [...fingerprints];
        for (const fp of fpArray) {
            await this.LCM.InvalidateRunQueryResult(fp);
            this._cacheTimestamps.delete(fp);
        }
        fingerprints.clear();

        LogStatus(`QueryCacheManager: invalidated ${fpArray.length} cache entries for entity "${entityName}"`);
    }

    // ── Entity dependency registration (private) ────────────────────────────

    private RegisterEntityDependencies(fingerprint: string, query: QueryInfo): void {
        const entityNames = this.GetTransitiveEntityDependencies(query);
        for (const name of entityNames) {
            const normalized = name.trim().toLowerCase();
            if (!this._queryEntityIndex.has(normalized)) {
                this._queryEntityIndex.set(normalized, new Set());
            }
            this._queryEntityIndex.get(normalized)!.add(fingerprint);
        }
    }

    private GetTransitiveEntityDependencies(
        query: QueryInfo, visited = new Set<string>(),
    ): string[] {
        if (visited.has(query.ID)) return [];
        visited.add(query.ID);

        const entities: string[] = [];

        // Direct entity mappings from QueryEntity table
        const queryEntities = query.Entities;
        if (queryEntities) {
            for (const qe of queryEntities) {
                if (qe.Entity) {
                    entities.push(qe.Entity);
                }
            }
        }

        // Walk composition dependencies for transitive entity mappings
        const dependencies = query.Dependencies;
        if (dependencies) {
            for (const dep of dependencies) {
                const depQuery = this.FindQueryById(dep.DependsOnQueryID);
                if (depQuery) {
                    entities.push(...this.GetTransitiveEntityDependencies(depQuery, visited));
                }
            }
        }

        return [...new Set(entities)];
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private FindQueryById(queryId: string): QueryInfo | undefined {
        return Metadata.Provider.Queries.find(
            (q: QueryInfo) => UUIDsEqual(q.ID, queryId),
        );
    }

    private computeTTLRemaining(fingerprint: string, ttlMinutes: number): number {
        const cachedAt = this._cacheTimestamps.get(fingerprint) ?? 0;
        const ttlMs = ttlMinutes * 60 * 1000;
        return Math.max(0, (cachedAt + ttlMs) - Date.now());
    }

    /**
     * FNV-1a 32-bit hash — fast, deterministic, good distribution for cache keys.
     */
    private static Fnv1aHash(input: string): string {
        let hash = 0x811c9dc5; // FNV offset basis
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = (hash * 0x01000193) >>> 0; // FNV prime, keep as uint32
        }
        return hash.toString(16);
    }
}
