/**
 * @fileoverview Client-side Edge Agent Pre-Discovery service (Stage 6C.1).
 *
 * Uses the shared lazy WASM worker ({@link EdgeAIWorkerHost}) and a float32
 * {@link SimpleVectorService} catalog cache to compute an untrusted advisory
 * {@link EdgePreDiscoveryHint}:
 *   1. Bi-encoder (`Xenova/bge-small-en-v1.5`) cosine top-5 candidate narrowing.
 *   2. Cross-encoder (`Xenova/ms-marco-MiniLM-L-6-v2`) batch=5 reranking +
 *      `logit >= -2.0` confidence gating.
 *
 * Never blocks UI mount or message sending when cold/offline/errored.
 *
 * @module @memberjunction/ng-conversations
 */

import { BaseSingleton, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { SimpleVectorService, type VectorInputEntry } from '@memberjunction/ai-vectors-memory';
import {
    CalibrateEdgeLogitToConfidence,
    EDGE_PRE_DISCOVERY_DEFAULT_MODEL_ID,
    EDGE_PRE_DISCOVERY_LOGIT_THRESHOLD,
    EDGE_PRE_DISCOVERY_TOP_K,
    type EdgePreDiscoveryHint,
} from '@memberjunction/ai-core-plus';
import { EdgeAIWorkerHost } from './edge-ai-worker-host';

/** Minimal agent descriptor needed for client pre-discovery indexing. */
export interface EdgeDiscoveryAgentDescriptor {
    ID: string;
    Name: string | null;
    Description: string | null;
    Status?: string | null;
    InvocationMode?: string | null;
    ParentID?: string | null;
}

/** Options controlling {@link EdgeAgentPreDiscoveryService.PreDiscover}. */
export interface EdgePreDiscoveryOptions {
    /** Per-user/session cache key isolating cached catalog vectors. */
    UserId?: string;
    /** Optional host allow-list narrowing the searchable catalog. */
    AllowedAgentIDs?: ReadonlyArray<string> | null;
    /** Optional running manager agent ID to exclude from candidate targets. */
    ExcludedAgentID?: string | null;
    /** Maximum number of candidate IDs returned in `CandidateAgentIds` (default 5). */
    TopK?: number;
    /** Hard query deadline in ms (default 150ms when warm). */
    TimeoutMs?: number;
    /**
     * When true, awaits cold model initialization if the worker is not yet warm.
     * Defaults to `false` so live message sends never block on cold model downloads.
     */
    WaitForColdLoad?: boolean;
    /** Cross-encoder logit threshold for setting `SuggestedAgentId` (default `-2.0`). */
    LogitThreshold?: number;
}

interface IndexedAgentMetadata {
    ID: string;
    Name: string;
    Description: string;
    Document: string;
}

interface UserCatalogCache {
    Fingerprint: string;
    Vectors: SimpleVectorService<IndexedAgentMetadata>;
    ById: Map<string, IndexedAgentMetadata>;
}

/** Default deadline for live pre-discovery on message submit. */
export const EDGE_PRE_DISCOVERY_QUERY_DEADLINE_MS = 150;

/**
 * Formats an agent entry identically to the verified PoC (`Name: Description`).
 */
export function FormatEdgeAgentDocument(agent: Pick<EdgeDiscoveryAgentDescriptor, 'Name' | 'Description'>): string {
    const name = (agent.Name ?? '').trim();
    const desc = (agent.Description ?? '').trim();
    return desc.length > 0 ? `${name}: ${desc}` : name;
}

/**
 * Filters a client agent list to discoverable top-level active specialists with descriptions,
 * honoring any host `AllowedAgentIDs` and excluding the conversation manager itself.
 */
export function FilterDiscoverableEdgeAgents<T extends EdgeDiscoveryAgentDescriptor>(
    agents: ReadonlyArray<T>,
    options?: Pick<EdgePreDiscoveryOptions, 'AllowedAgentIDs' | 'ExcludedAgentID'>
): T[] {
    const allowedSet = options?.AllowedAgentIDs ? new UUIDSet(options.AllowedAgentIDs) : null;
    const excludedId = options?.ExcludedAgentID ?? null;
    return agents.filter((a) => {
        if (excludedId && UUIDsEqual(a.ID, excludedId)) {
            return false;
        }
        if (a.Status && a.Status !== 'Active') {
            return false;
        }
        if (a.ParentID) {
            return false;
        }
        if (a.InvocationMode === 'Sub-Agent') {
            return false;
        }
        if (!(a.Description ?? '').trim()) {
            return false;
        }
        if (allowedSet && !allowedSet.Has(a.ID)) {
            return false;
        }
        return true;
    });
}

/**
 * Client-side Edge Agent Pre-Discovery engine.
 */
export class EdgeAgentPreDiscoveryService extends BaseSingleton<EdgeAgentPreDiscoveryService> {
    private readonly catalogCaches = new Map<string, UserCatalogCache>();
    private readonly warmUpsInFlight = new Map<string, Promise<boolean>>();

    protected constructor() {
        super();
    }

    public static get Instance(): EdgeAgentPreDiscoveryService {
        return super.getInstance<EdgeAgentPreDiscoveryService>();
    }

    /** Clears all cached user/session agent vector indexes (e.g., on sign-out or tests). */
    public ClearCache(userId?: string): void {
        if (userId !== undefined) {
            this.catalogCaches.delete(userId);
            this.warmUpsInFlight.delete(userId);
        } else {
            this.catalogCaches.clear();
            this.warmUpsInFlight.clear();
        }
    }

    /**
     * Non-blocking post-mount warm-up: loads both `bge-small-en-v1.5` and
     * `ms-marco-MiniLM-L-6-v2` in the lazy Web Worker and pre-embeds the user's
     * discoverable agent catalog into a float32 {@link SimpleVectorService}.
     * Never throws; returns `false` on offline/CSP/timeout.
     */
    public async WarmUpCatalog(
        agents: ReadonlyArray<EdgeDiscoveryAgentDescriptor>,
        userId: string = '__default__',
        timeoutMs: number = 30_000
    ): Promise<boolean> {
        const host = EdgeAIWorkerHost.Instance;
        if (!host.IsSupported || host.IsCircuitOpen) {
            return false;
        }
        const discoverable = FilterDiscoverableEdgeAgents(agents);
        if (discoverable.length === 0) {
            return false;
        }

        const fingerprint = this.computeFingerprint(discoverable);
        const existing = this.catalogCaches.get(userId);
        if (existing && existing.Fingerprint === fingerprint && host.IsCrossEncoderWarm) {
            return true;
        }

        const inflight = this.warmUpsInFlight.get(userId);
        if (inflight) {
            return inflight;
        }

        const work = (async (): Promise<boolean> => {
            const warm = await host.EnsureWarm({ LoadCrossEncoder: true }, timeoutMs);
            if (!warm) {
                return false;
            }
            const indexed = await this.buildCatalogCache(discoverable, fingerprint, timeoutMs);
            if (!indexed) {
                return false;
            }
            this.catalogCaches.set(userId, indexed);
            return true;
        })();

        this.warmUpsInFlight.set(userId, work);
        try {
            return await work;
        } finally {
            if (this.warmUpsInFlight.get(userId) === work) {
                this.warmUpsInFlight.delete(userId);
            }
        }
    }

    /**
     * Computes an untrusted {@link EdgePreDiscoveryHint} for `query` over `agents`.
     *
     * By default (`WaitForColdLoad: false`), returns `null` immediately if the worker
     * or catalog cache is not yet warm so sending a chat message is never delayed.
     * Enforces `TimeoutMs` strictly via deadline racing and fails open to `null`.
     */
    public async PreDiscover(
        query: string,
        agents: ReadonlyArray<EdgeDiscoveryAgentDescriptor>,
        options?: EdgePreDiscoveryOptions
    ): Promise<EdgePreDiscoveryHint | null> {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            return null;
        }
        const host = EdgeAIWorkerHost.Instance;
        if (!host.IsSupported || host.IsCircuitOpen) {
            return null;
        }

        const discoverable = FilterDiscoverableEdgeAgents(agents, options);
        if (discoverable.length < 3) {
            return null;
        }

        const userId = options?.UserId ?? '__default__';
        const waitForCold = options?.WaitForColdLoad === true;
        const timeoutMs = options?.TimeoutMs ?? EDGE_PRE_DISCOVERY_QUERY_DEADLINE_MS;
        const topK = Math.max(1, Math.min(options?.TopK ?? EDGE_PRE_DISCOVERY_TOP_K, discoverable.length));
        const logitThreshold = options?.LogitThreshold ?? EDGE_PRE_DISCOVERY_LOGIT_THRESHOLD;

        if (!waitForCold && !host.IsWarm) {
            return null;
        }

        const fingerprint = this.computeFingerprint(discoverable);
        let cache = this.catalogCaches.get(userId);
        if (!cache || cache.Fingerprint !== fingerprint) {
            if (!waitForCold) {
                // Trigger background re-index without blocking this turn
                void this.WarmUpCatalog(discoverable, userId);
                return null;
            }
            const warm = await host.EnsureWarm({ LoadCrossEncoder: true }, Math.max(timeoutMs, 30_000));
            if (!warm) {
                return null;
            }
            const rebuilt = await this.buildCatalogCache(discoverable, fingerprint, Math.max(timeoutMs, 30_000));
            if (!rebuilt) {
                return null;
            }
            this.catalogCaches.set(userId, rebuilt);
            cache = rebuilt;
        }

        const tStart = Date.now();
        const queryVecs = waitForCold
            ? await host.Embed([trimmedQuery], timeoutMs)
            : await host.EmbedIfWarm([trimmedQuery], timeoutMs);
        if (!queryVecs || queryVecs.length === 0) {
            return null;
        }

        // Stage 1: Float32 SimpleVectorService cosine top-K narrowing
        const nearest = cache.Vectors.FindNearest(Array.from(queryVecs[0]), topK, undefined, 'cosine');
        if (nearest.length === 0) {
            return null;
        }

        const candidateIds = nearest.map((hit) => hit.key);
        const docs = nearest
            .map((hit) => hit.metadata?.Document ?? cache!.ById.get(hit.key)?.Document ?? '')
            .filter((d) => d.length > 0);

        const elapsed = Date.now() - tStart;
        const remainingBudget = Math.max(1, timeoutMs - elapsed);

        // Stage 2: Cross-encoder batch=K reranking if warm (or allowed to cold-load)
        const logits = waitForCold
            ? await host.Rerank(trimmedQuery, docs, remainingBudget)
            : await host.RerankIfWarm(trimmedQuery, docs, remainingBudget);

        if (!logits || logits.length !== candidateIds.length) {
            return {
                CandidateAgentIds: candidateIds,
                ModelId: EDGE_PRE_DISCOVERY_DEFAULT_MODEL_ID,
            };
        }

        let bestIdx = 0;
        let bestLogit = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < logits.length; i++) {
            const val = logits[i];
            if (Number.isFinite(val) && val > bestLogit) {
                bestLogit = val;
                bestIdx = i;
            }
        }

        // Order CandidateAgentIds by cross-encoder score (best first)
        const rerankedOrder = candidateIds
            .map((id, idx) => ({ id, logit: logits[idx] ?? Number.NEGATIVE_INFINITY }))
            .sort((a, b) => b.logit - a.logit)
            .map((item) => item.id);

        const hint: EdgePreDiscoveryHint = {
            CandidateAgentIds: rerankedOrder,
            TopLogit: Number.isFinite(bestLogit) ? Number(bestLogit.toFixed(4)) : undefined,
            ModelId: EDGE_PRE_DISCOVERY_DEFAULT_MODEL_ID,
        };

        if (Number.isFinite(bestLogit) && bestLogit >= logitThreshold) {
            hint.SuggestedAgentId = candidateIds[bestIdx];
            hint.Confidence = CalibrateEdgeLogitToConfidence(bestLogit);
        }

        return hint;
    }

    private async buildCatalogCache(
        agents: ReadonlyArray<EdgeDiscoveryAgentDescriptor>,
        fingerprint: string,
        timeoutMs: number
    ): Promise<UserCatalogCache | null> {
        const docs: IndexedAgentMetadata[] = agents.map((a) => ({
            ID: a.ID,
            Name: a.Name ?? '',
            Description: (a.Description ?? '').trim(),
            Document: FormatEdgeAgentDocument(a),
        }));

        const vectors = await EdgeAIWorkerHost.Instance.Embed(
            docs.map((d) => d.Document),
            timeoutMs
        );
        if (!vectors || vectors.length !== docs.length) {
            return null;
        }

        const service = new SimpleVectorService<IndexedAgentMetadata>({ Precision: 'float32' });
        const entries: VectorInputEntry<IndexedAgentMetadata>[] = docs.map((meta, idx) => ({
            key: meta.ID,
            vector: vectors[idx],
            metadata: meta,
        }));
        service.LoadVectors(entries);

        const byId = new Map<string, IndexedAgentMetadata>(docs.map((d) => [d.ID, d]));
        return { Fingerprint: fingerprint, Vectors: service, ById: byId };
    }

    private computeFingerprint(agents: ReadonlyArray<EdgeDiscoveryAgentDescriptor>): string {
        return agents
            .map((a) => `${a.ID}|${a.Name}|${(a.Description ?? '').trim()}`)
            .sort()
            .join('\n');
    }
}
