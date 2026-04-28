/**
 * @fileoverview Elasticsearch search provider for the SearchEngine (P5.1).
 *
 * Translates a query plus a SearchScope's `ExternalIndexes` constraint into an
 * Elasticsearch search request. Each `MJ: Search Scope External Indexes` row
 * with `IndexType='Elasticsearch'` and a non-empty `ExternalIndexName` becomes
 * a target index in the request. The scope's rendered `MetadataFilter` (a JSON
 * object the scope author authored as ES filter DSL) is composed into the
 * top-level `bool.filter` so permission predicates and tenant-scoping push down
 * to the engine — no post-fusion filtering.
 *
 * **Connection.** Reads from `SearchProviderConfig.ProviderConfig`:
 *   - `node` — Elasticsearch node URL (e.g. `https://es.example.internal:9200`)
 *   - `apiKey` — base64-encoded API key (preferred)
 *   - `username` + `password` — basic auth fallback
 *   - `cloudId` — Elastic Cloud deployment ID, when used in place of `node`
 *   - `defaultField` — field to match against when the scope/provider doesn't
 *     specify one (default: `content`)
 *
 * **Optional peer dep.** `@elastic/elasticsearch` is in `optionalDependencies`
 * and loaded via dynamic import per CLAUDE.md rule #8 case 2 — consumers who
 * don't use Elasticsearch don't pay the bundle cost.
 *
 * @module @memberjunction/search-engine
 */

import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseSearchProvider, SearchProviderConfig } from '../generic/ISearchProvider';
import {
    SearchSource,
    SearchFilters,
    SearchResultItem,
    ScopeConstraints,
} from '../generic/search.types';

/** Minimal subset of the Elasticsearch JS client surface this provider uses. */
interface ElasticsearchClientLike {
    search(params: {
        index: string | string[];
        size?: number;
        query?: Record<string, unknown>;
    }): Promise<{
        hits: {
            hits: Array<{
                _index: string;
                _id: string;
                _score: number;
                _source?: Record<string, unknown>;
            }>;
        };
    }>;
    ping(): Promise<unknown>;
}

interface ElasticsearchClientCtor {
    new (opts: {
        node?: string;
        cloud?: { id: string };
        auth?: { apiKey?: string; username?: string; password?: string };
    }): ElasticsearchClientLike;
}

/**
 * Lazy-loader for the Elasticsearch SDK. Memoized so the dynamic import cost is
 * paid once per process even when many SearchProvider records reference the
 * same driver.
 */
let clientCtorPromise: Promise<ElasticsearchClientCtor> | null = null;
async function loadElasticsearchClient(): Promise<ElasticsearchClientCtor> {
    if (!clientCtorPromise) {
        clientCtorPromise = (async () => {
            try {
                const mod = await import('@elastic/elasticsearch' as string) as { Client: ElasticsearchClientCtor };
                return mod.Client;
            } catch (err) {
                throw new Error(
                    `ElasticsearchSearchProvider: '@elastic/elasticsearch' is not installed. Add it to your project's dependencies if you intend to use this provider. Underlying error: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        })();
    }
    return clientCtorPromise;
}

interface ElasticsearchProviderConfig {
    node?: string;
    apiKey?: string;
    username?: string;
    password?: string;
    cloudId?: string;
    defaultField?: string;
    /** Optional default index name when a scope doesn't list ExternalIndexes. */
    defaultIndex?: string;
}

@RegisterClass(BaseSearchProvider, 'ElasticsearchSearchProvider')
export class ElasticsearchSearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'fulltext';

    private client: ElasticsearchClientLike | null = null;
    private available = false;
    private parsedConfig: ElasticsearchProviderConfig | null = null;

    public override async Initialize(config: SearchProviderConfig, contextUser: UserInfo): Promise<void> {
        await super.Initialize(config, contextUser);
        this.parsedConfig = (config.ProviderConfig as ElasticsearchProviderConfig | null) ?? null;
        if (!this.parsedConfig) {
            LogError('ElasticsearchSearchProvider: ProviderConfig is empty — set node + apiKey/username+password in the SearchProvider record.');
            return;
        }

        try {
            const Client = await loadElasticsearchClient();
            const opts: ConstructorParameters<ElasticsearchClientCtor>[0] = {};
            if (this.parsedConfig.cloudId) {
                opts.cloud = { id: this.parsedConfig.cloudId };
            } else if (this.parsedConfig.node) {
                opts.node = this.parsedConfig.node;
            }
            if (this.parsedConfig.apiKey) {
                opts.auth = { apiKey: this.parsedConfig.apiKey };
            } else if (this.parsedConfig.username && this.parsedConfig.password) {
                opts.auth = { username: this.parsedConfig.username, password: this.parsedConfig.password };
            }
            this.client = new Client(opts);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ElasticsearchSearchProvider: Initialize failed — ${msg}`);
            this.client = null;
        }
    }

    public override async CheckAvailability(_contextUser: UserInfo): Promise<void> {
        if (!this.client) {
            this.available = false;
            return;
        }
        try {
            await this.client.ping();
            this.available = true;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ElasticsearchSearchProvider: ping failed — ${msg}`);
            this.available = false;
        }
    }

    public override IsAvailable(): boolean {
        return this.available;
    }

    public async Search(
        query: string,
        topK: number,
        _filters: SearchFilters | undefined,
        _contextUser: UserInfo,
        scopeConstraints?: ScopeConstraints,
    ): Promise<SearchResultItem[]> {
        if (!this.client || !this.parsedConfig) return [];

        // Determine target indexes: prefer scope-supplied, else providerConfig.defaultIndex
        const scopedIndexes = scopeConstraints?.ExternalIndexes
            ?.filter(r => r.IndexType === 'Elasticsearch' && r.ExternalIndexName)
            .map(r => r.ExternalIndexName as string) ?? [];

        const target: string[] = scopedIndexes.length > 0
            ? scopedIndexes
            : (this.parsedConfig.defaultIndex ? [this.parsedConfig.defaultIndex] : []);

        if (target.length === 0) {
            // No index to query — fail closed (silently empty), matching VectorSearchProvider's pattern.
            return [];
        }

        // Honor per-provider query rewrite from the scope.
        const effectiveQuery = scopeConstraints?.QueryTransforms?.[this.SourceType] ?? query;
        const defaultField = this.parsedConfig.defaultField ?? 'content';

        // Build the query: a multi_match across name + content by default. Scope's
        // MetadataFilter (already-rendered ES filter DSL) is composed into bool.filter
        // for permission / tenant push-down.
        const filterClauses: unknown[] = [];
        for (const idx of scopeConstraints?.ExternalIndexes ?? []) {
            if (idx.IndexType !== 'Elasticsearch') continue;
            if (idx.MetadataFilter && typeof idx.MetadataFilter === 'object') {
                filterClauses.push(idx.MetadataFilter);
            }
        }

        const queryBody: Record<string, unknown> = {
            bool: {
                must: [
                    { match: { [defaultField]: effectiveQuery } },
                ],
                ...(filterClauses.length > 0 ? { filter: filterClauses } : {}),
            },
        };

        try {
            const response = await this.client.search({
                index: target,
                size: topK,
                query: queryBody,
            });

            // Normalize ES _score to [0, 1] with a soft cap so RRF fusion sees comparable
            // values across providers. The cap is `topResultScore || 1` — preserves rank
            // order and gives fusion a roughly-comparable distribution.
            const hits = response.hits.hits;
            const topScore = Math.max(1, hits[0]?._score ?? 1);

            return hits.map((hit, idx) => {
                const src = hit._source ?? {};
                const title = (src['title'] as string | undefined) ?? (src[defaultField] as string | undefined) ?? hit._id;
                const snippet = (src[defaultField] as string | undefined) ?? '';
                return {
                    ID: `es-${hit._index}-${hit._id}`,
                    EntityName: hit._index,
                    RecordID: hit._id,
                    SourceType: this.SourceType,
                    ResultType: 'entity-record',
                    Title: title.slice(0, 200),
                    Snippet: snippet.slice(0, 500),
                    Score: hit._score / topScore,
                    ScoreBreakdown: { FullText: hit._score / topScore },
                    Tags: [],
                    MatchedAt: new Date(),
                    EntityIcon: 'fa-solid fa-database',
                    RecordName: title.slice(0, 200),
                    RawMetadata: JSON.stringify({ _index: hit._index, _id: hit._id, _rank: idx, _rawScore: hit._score }),
                };
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ElasticsearchSearchProvider.Search failed: ${msg}`);
            return [];
        }
    }
}

/** Tree-shake prevention helper. */
export function LoadElasticsearchSearchProvider(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = ElasticsearchSearchProvider;
}

/** Test-only: clear the memoized SDK loader so each test installs its own mock. */
export function __resetElasticsearchClientLoaderForTests(): void {
    clientCtorPromise = null;
}
