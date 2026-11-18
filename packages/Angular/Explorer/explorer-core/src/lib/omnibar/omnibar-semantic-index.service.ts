/**
 * @fileoverview Client-only semantic metadata index for Explorer's `Cmd+K` Omnibar (Stage 6C.2).
 *
 * Indexes ONLY browser-resident metadata (Entities, Saved Views, Dashboards, Apps/Nav Items,
 * and Agents) into a `'float32'` {@link SimpleVectorService} using the shared lazy
 * `bge-small-en-v1.5` WASM Web Worker ({@link EdgeAIWorkerHost}).
 *
 * Completely independent of backend RAG embeddings and `SearchService.PreviewSearch`:
 * warm queries complete in `< 15 ms` offline with zero GraphQL calls, and gracefully
 * degrade to `[]` whenever the worker is cold, offline-uncached, or circuit-open.
 *
 * @module @memberjunction/ng-explorer-core
 */

import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { Metadata, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import { DashboardEngine, UserViewEngine } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { SimpleVectorService, type VectorInputEntry } from '@memberjunction/ai-vectors-memory';
import { EdgeAIWorkerHost } from '@memberjunction/ng-conversations';
import type { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import type { MentionSuggestion } from '@memberjunction/ng-composer';
import { firstValueFrom } from 'rxjs';
import { OMNIBAR_NAV_KEY, type OmnibarNavPayload } from './omnibar-provider';
import { CanOpenInDashboardTab } from './omnibar-dashboard-matches';

/** Semantic metadata categories indexed locally in the Omnibar. */
export type OmnibarMetadataKind = 'entity' | 'view' | 'dashboard' | 'app' | 'nav' | 'agent';

/** One browser-resident metadata item indexed in {@link OmnibarSemanticIndexService}. */
export interface OmnibarSemanticEntry {
    Key: string;
    Kind: OmnibarMetadataKind;
    Group: string;
    Title: string;
    Description: string;
    Icon: string;
    Color?: string;
    Nav: OmnibarNavPayload;
    SearchText: string;
}

/** Input sources for building the local semantic metadata index (all optional). */
export interface OmnibarSemanticIndexSources {
    Provider?: IMetadataProvider | null;
    UserId?: string | null;
    Apps?: ApplicationManager | null;
    ExplicitEntries?: ReadonlyArray<OmnibarSemanticEntry>;
}

/** Query options for {@link OmnibarSemanticIndexService.Query}. */
export interface OmnibarSemanticQueryOptions {
    MaxResults?: number;
    MinScore?: number;
    TimeoutMs?: number;
    FilterKinds?: ReadonlyArray<OmnibarMetadataKind>;
}

/** Result returned by {@link OmnibarSemanticIndexService.Query}. */
export interface OmnibarSemanticQueryResult {
    Suggestions: MentionSuggestion[];
    ElapsedMs: number;
}

/** Default minimum cosine similarity for surfacing semantic metadata hits. */
export const OMNIBAR_SEMANTIC_DEFAULT_MIN_SCORE = 0.35;

/** Warm query deadline for semantic Omnibar lookups. */
export const OMNIBAR_SEMANTIC_QUERY_TIMEOUT_MS = 50;

/** Batch size when embedding local metadata items inside the Web Worker. */
const INDEX_EMBED_BATCH_SIZE = 32;

/**
 * Singleton local semantic vector index (`float32` `SimpleVectorService` + shared
 * `bge-small-en-v1.5` WASM worker) powering `< 15 ms` client-only `Cmd+K` Omnibar search.
 */
export class OmnibarSemanticIndexService extends BaseSingleton<OmnibarSemanticIndexService> {
    private vectorService: SimpleVectorService<OmnibarSemanticEntry> | null = null;
    private fingerprint = '';
    private buildPromise: Promise<boolean> | null = null;
    private entryCount = 0;

    protected constructor() {
        super();
    }

    public static get Instance(): OmnibarSemanticIndexService {
        return super.getInstance<OmnibarSemanticIndexService>();
    }

    /** True once the float32 index is populated AND the shared worker is warm. */
    public get IsReady(): boolean {
        return this.vectorService !== null && this.entryCount > 0 && EdgeAIWorkerHost.Instance.IsWarm;
    }

    /** Number of indexed browser-resident metadata items. */
    public get EntryCount(): number {
        return this.entryCount;
    }

    /** Clears the local index (e.g. on sign-out, metadata refresh, or tests). */
    public Clear(): void {
        this.vectorService = null;
        this.fingerprint = '';
        this.buildPromise = null;
        this.entryCount = 0;
    }

    /**
     * Collects browser-resident metadata entries (Entities, Saved Views, Dashboards,
     * Apps/Nav Items, Agents) without issuing any network or GraphQL search calls.
     */
    public async CollectMetadataEntries(sources: OmnibarSemanticIndexSources): Promise<OmnibarSemanticEntry[]> {
        if (sources.ExplicitEntries) {
            return [...sources.ExplicitEntries];
        }
        const entries: OmnibarSemanticEntry[] = [];
        const md = sources.Provider ?? Metadata.Provider;
        const userId = sources.UserId ?? md?.CurrentUser?.ID ?? null;

        // 1. Entities (browser-resident Metadata)
        try {
            const entities: ReadonlyArray<EntityInfo> = md?.Entities ?? [];
            for (const entity of entities) {
                if (entity.IncludeInAPI === false) {
                    continue;
                }
                const desc = (entity.Description ?? '').trim();
                const display = (entity.DisplayName || entity.Name).trim();
                entries.push({
                    Key: `entity:${entity.ID}`,
                    Kind: 'entity',
                    Group: 'Entities',
                    Title: display,
                    Description: desc ? desc.slice(0, 140) : 'Entity — open list view',
                    Icon: entity.Icon || 'fa-solid fa-table',
                    Nav: { kind: 'entity-list', entityName: entity.Name },
                    SearchText: desc ? `${entity.Name} (${display}): ${desc}` : `${entity.Name} (${display}) entity records`,
                });
            }
        } catch {
            // fail-soft on metadata unavailable
        }

        // 2. Saved Views (cached UserViewEngine)
        try {
            const viewEngine = sources.Provider
                ? (UserViewEngine.GetProviderInstance<UserViewEngine>(sources.Provider, UserViewEngine) as UserViewEngine)
                : UserViewEngine.Instance;
            if (viewEngine.Loaded) {
                for (const view of viewEngine.AllViews) {
                    const accessible = !userId || UUIDsEqual(view.UserID, userId) || view.IsShared;
                    if (!accessible || view.UserCanView === false) {
                        continue;
                    }
                    const desc = (view.Description ?? '').trim();
                    const entityName = (view.Entity ?? '').trim();
                    entries.push({
                        Key: `view:${view.ID}`,
                        Kind: 'view',
                        Group: 'Saved Views',
                        Title: view.Name,
                        Description: [entityName, desc].filter(Boolean).join(' · ') || 'Saved view',
                        Icon: 'fa-solid fa-table-list',
                        Nav: { kind: 'view', viewId: view.ID, viewName: view.Name },
                        SearchText: `${view.Name} saved view for ${entityName}: ${desc}`.trim(),
                    });
                }
            }
        } catch {
            // fail-soft
        }

        // 3. Dashboards (cached DashboardEngine)
        try {
            if (userId) {
                const dashEngine = sources.Provider
                    ? (DashboardEngine.GetProviderInstance<DashboardEngine>(sources.Provider, DashboardEngine) as DashboardEngine)
                    : DashboardEngine.Instance;
                if (dashEngine.Loaded) {
                    const openable = dashEngine.GetAccessibleDashboards(userId).filter(CanOpenInDashboardTab);
                    for (const d of openable) {
                        const desc = (d.Description ?? '').trim();
                        const cat = (d.Category ?? '').trim();
                        entries.push({
                            Key: `dashboard:${d.ID}`,
                            Kind: 'dashboard',
                            Group: 'Dashboards',
                            Title: d.Name,
                            Description: [cat, d.User].filter(Boolean).join(' · ') || desc || 'Dashboard',
                            Icon: 'fa-solid fa-gauge-high',
                            Nav: { kind: 'dashboard', dashboardId: d.ID, dashboardName: d.Name },
                            SearchText: `${d.Name} dashboard ${cat ? `(${cat})` : ''}: ${desc}`.trim(),
                        });
                    }
                }
            }
        } catch {
            // fail-soft
        }

        // 4. Apps & Nav Items (ApplicationManager)
        try {
            if (sources.Apps) {
                const apps: BaseApplication[] = await firstValueFrom(sources.Apps.Applications).catch(() => []);
                for (const app of apps) {
                    const desc = (app.Description ?? '').trim();
                    entries.push({
                        Key: `app:${app.ID}`,
                        Kind: 'app',
                        Group: 'Apps',
                        Title: app.Name,
                        Description: desc || 'Switch app',
                        Icon: app.Icon || 'fa-solid fa-grid-2',
                        Color: app.Color || undefined,
                        Nav: { kind: 'app', appId: app.ID, appName: app.Name },
                        SearchText: `${app.Name} application: ${desc}`.trim(),
                    });
                    const navItems = await app.GetNavItems().catch(() => []);
                    for (const item of navItems) {
                        if (!item.Label) {
                            continue;
                        }
                        entries.push({
                            Key: `nav:${app.ID}:${item.Label}`,
                            Kind: 'nav',
                            Group: 'Navigation',
                            Title: `${app.Name} → ${item.Label}`,
                            Description: 'Explorer navigation',
                            Icon: item.Icon || 'fa-solid fa-diagram-next',
                            Nav: { kind: 'nav', appId: app.ID, navItemName: item.Label },
                            SearchText: `${app.Name} ${item.Label} navigation view`,
                        });
                    }
                }
            }
        } catch {
            // fail-soft
        }

        // 5. Agents / Commands (cached AIEngineBase)
        try {
            for (const agent of AIEngineBase.Instance.ReadableAgents) {
                if (agent.Status !== 'Active' || agent.ParentID || agent.InvocationMode === 'Sub-Agent') {
                    continue;
                }
                const agentName = (agent.Name ?? '').trim();
                if (!agentName) {
                    continue;
                }
                const desc = (agent.Description ?? '').trim();
                entries.push({
                    Key: `agent:${agent.ID}`,
                    Kind: 'agent',
                    Group: 'Agents',
                    Title: agentName,
                    Description: desc ? `${desc} · opens chat pre-addressed` : 'Opens chat pre-addressed',
                    Icon: 'fa-solid fa-robot',
                    Nav: { kind: 'agent', agentName },
                    SearchText: `${agentName} AI agent: ${desc}`.trim(),
                });
            }
        } catch {
            // fail-soft
        }

        return entries;
    }

    /**
     * Lazily warms the shared `bge-small-en-v1.5` worker and populates the `'float32'`
     * vector index over browser-resident metadata. Idempotent and safe against
     * repeated calls when the metadata fingerprint has not changed.
     */
    public async BuildOrRefreshIndex(
        sources: OmnibarSemanticIndexSources,
        timeoutMs: number = 30_000
    ): Promise<boolean> {
        const host = EdgeAIWorkerHost.Instance;
        if (!host.IsSupported || host.IsCircuitOpen) {
            return false;
        }

        const entries = await this.CollectMetadataEntries(sources);
        if (entries.length === 0) {
            this.Clear();
            return false;
        }

        const nextFingerprint = this.computeFingerprint(entries);
        if (this.vectorService && this.fingerprint === nextFingerprint && host.IsWarm) {
            return true;
        }
        if (this.buildPromise) {
            return this.buildPromise;
        }

        const work = (async (): Promise<boolean> => {
            const warm = await host.EnsureWarm({ LoadCrossEncoder: false }, timeoutMs);
            if (!warm) {
                return false;
            }

            const service = new SimpleVectorService<OmnibarSemanticEntry>({ Precision: 'float32' });
            const allVectors: VectorInputEntry<OmnibarSemanticEntry>[] = [];

            for (let offset = 0; offset < entries.length; offset += INDEX_EMBED_BATCH_SIZE) {
                const batch = entries.slice(offset, offset + INDEX_EMBED_BATCH_SIZE);
                const vecs = await host.Embed(
                    batch.map((e) => e.SearchText),
                    timeoutMs
                );
                if (!vecs || vecs.length !== batch.length) {
                    return false;
                }
                for (let i = 0; i < batch.length; i++) {
                    allVectors.push({
                        key: batch[i].Key,
                        vector: vecs[i],
                        metadata: batch[i],
                    });
                }
            }

            service.LoadVectors(allVectors);
            this.vectorService = service;
            this.fingerprint = nextFingerprint;
            this.entryCount = allVectors.length;
            return true;
        })();

        this.buildPromise = work;
        try {
            return await work;
        } finally {
            if (this.buildPromise === work) {
                this.buildPromise = null;
            }
        }
    }

    /**
     * Seeds pre-computed embeddings directly into the `'float32'` vector store
     * (useful for offline pre-baked catalogs or deterministic latency benchmarks).
     */
    public LoadPrecomputedEntries(
        entries: ReadonlyArray<{ Entry: OmnibarSemanticEntry; Vector: Float32Array | number[] }>
    ): void {
        if (entries.length === 0) {
            this.Clear();
            return;
        }
        const service = new SimpleVectorService<OmnibarSemanticEntry>({ Precision: 'float32' });
        service.LoadVectors(
            entries.map((item) => ({
                key: item.Entry.Key,
                vector: item.Vector,
                metadata: item.Entry,
            }))
        );
        this.vectorService = service;
        this.fingerprint = this.computeFingerprint(entries.map((e) => e.Entry));
        this.entryCount = entries.length;
    }

    /**
     * Executes a warm `< 15 ms` client-only semantic search against the cached `'float32'`
     * metadata index. Never issues network/GraphQL calls; returns `[]` immediately when
     * the worker or index is cold/unavailable.
     */
    public async Query(
        queryText: string,
        options?: OmnibarSemanticQueryOptions
    ): Promise<OmnibarSemanticQueryResult> {
        const start = performance.now();
        const trimmed = queryText.trim();
        if (!trimmed || !this.vectorService || this.entryCount === 0) {
            return { Suggestions: [], ElapsedMs: performance.now() - start };
        }

        const host = EdgeAIWorkerHost.Instance;
        if (!host.IsWarm) {
            return { Suggestions: [], ElapsedMs: performance.now() - start };
        }

        const timeoutMs = options?.TimeoutMs ?? OMNIBAR_SEMANTIC_QUERY_TIMEOUT_MS;
        const vecs = await host.EmbedIfWarm([trimmed], timeoutMs);
        if (!vecs || vecs.length === 0) {
            return { Suggestions: [], ElapsedMs: performance.now() - start };
        }

        const results = this.QueryByVector(vecs[0], options);
        return {
            Suggestions: results,
            ElapsedMs: performance.now() - start,
        };
    }

    /**
     * Synchronous vector lookup over the cached `'float32'` `SimpleVectorService` store
     * given an already-embedded query vector. Runs in sub-millisecond time.
     */
    public QueryByVector(
        queryVector: Float32Array | number[],
        options?: OmnibarSemanticQueryOptions
    ): MentionSuggestion[] {
        if (!this.vectorService || this.entryCount === 0) {
            return [];
        }
        const maxResults = options?.MaxResults ?? 6;
        const minScore = options?.MinScore ?? OMNIBAR_SEMANTIC_DEFAULT_MIN_SCORE;
        const filterKinds = options?.FilterKinds ? new Set(options.FilterKinds) : null;

        const hits = this.vectorService.FindNearest(
            Array.isArray(queryVector) ? queryVector : Array.from(queryVector),
            maxResults,
            minScore,
            'cosine',
            filterKinds ? (meta) => filterKinds.has(meta.Kind) : undefined
        );

        return hits
            .filter((hit) => hit.metadata != null)
            .map((hit) => this.toSuggestion(hit.metadata!, hit.score));
    }

    private toSuggestion(entry: OmnibarSemanticEntry, score: number): MentionSuggestion {
        return {
            type: entry.Kind,
            id: entry.Key,
            name: entry.Title,
            displayName: entry.Title,
            description: entry.Description,
            icon: entry.Icon,
            color: entry.Color,
            data: {
                [OMNIBAR_NAV_KEY]: entry.Nav,
                group: entry.Group,
                score,
                semanticLocal: true,
            },
        };
    }

    private computeFingerprint(entries: ReadonlyArray<OmnibarSemanticEntry>): string {
        return entries
            .map((e) => `${e.Key}|${e.SearchText}`)
            .sort()
            .join('\n');
    }
}
