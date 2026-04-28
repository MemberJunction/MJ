/**
 * @fileoverview OpenSearch search provider for the SearchEngine (P5.4).
 *
 * Calls OpenSearch's _search REST endpoint via fetch. OpenSearch's query DSL
 * is largely identical to Elasticsearch 7.x — bool/must/filter trees compose
 * the same way — so the provider mirrors {@link ElasticsearchSearchProvider}'s
 * shape. Distinct class so admins can register and configure each cluster
 * independently and so future divergence (knn vector search, neural search,
 * pipeline aggregations) can land here without touching the ES path.
 *
 * **Connection options** (from `SearchProviderConfig.ProviderConfig`):
 *   - `node` — OpenSearch node URL (e.g. `https://os.example:9200`)
 *   - `username` + `password` — basic auth
 *   - `awsAuthHeader` — pre-signed AWS SigV4 Authorization header for
 *     Amazon OpenSearch Service deployments (caller responsible for
 *     refreshing before expiry)
 *   - `defaultIndex`, `defaultField` — fallbacks when scope is silent
 *
 * @module @memberjunction/search-engine
 */

import { LogError, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseSearchProvider, SearchProviderConfig } from '../generic/ISearchProvider';
import {
    SearchSource,
    SearchFilters,
    SearchResultItem,
    ScopeConstraints,
} from '../generic/search.types';

interface OpenSearchHit {
    _index: string;
    _id: string;
    _score: number;
    _source?: Record<string, unknown>;
}
interface OpenSearchResponse {
    hits?: { hits?: OpenSearchHit[]; total?: { value: number } | number };
}

interface OpenSearchProviderConfig {
    node?: string;
    username?: string;
    password?: string;
    awsAuthHeader?: string;
    defaultIndex?: string;
    defaultField?: string;
}

@RegisterClass(BaseSearchProvider, 'OpenSearchSearchProvider')
export class OpenSearchSearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'fulltext';

    private parsedConfig: OpenSearchProviderConfig | null = null;
    private available = false;

    public override async Initialize(config: SearchProviderConfig, contextUser: UserInfo): Promise<void> {
        await super.Initialize(config, contextUser);
        this.parsedConfig = (config.ProviderConfig as OpenSearchProviderConfig | null) ?? null;
        if (!this.parsedConfig?.node) {
            LogError('OpenSearchSearchProvider: ProviderConfig must include a node URL.');
            return;
        }
    }

    public override async CheckAvailability(_contextUser: UserInfo): Promise<void> {
        if (!this.parsedConfig?.node) { this.available = false; return; }
        try {
            const response = await fetch(`${this.parsedConfig.node.replace(/\/$/, '')}/`, {
                headers: this.buildAuthHeaders(),
            });
            // OpenSearch returns 200 + cluster info on the root endpoint when reachable.
            // 401 means host is up but auth is wrong — operationally available.
            this.available = response.ok || response.status === 401;
            if (!this.available) LogError(`OpenSearchSearchProvider: probe returned ${response.status}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`OpenSearchSearchProvider: probe failed — ${msg}`);
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
        if (!this.parsedConfig?.node) return [];

        const effectiveQuery = scopeConstraints?.QueryTransforms?.[this.SourceType] ?? query;
        const defaultField = this.parsedConfig.defaultField ?? 'content';
        const node = this.parsedConfig.node.replace(/\/$/, '');

        const scopedRows = scopeConstraints?.ExternalIndexes
            ?.filter(r => r.IndexType === 'OpenSearch' && r.ExternalIndexName) ?? [];
        const indexNames = scopedRows.length > 0
            ? scopedRows.map(r => r.ExternalIndexName as string)
            : (this.parsedConfig.defaultIndex ? [this.parsedConfig.defaultIndex] : []);
        if (indexNames.length === 0) return [];

        const filterClauses: unknown[] = [];
        for (const idx of scopedRows) {
            if (idx.MetadataFilter && typeof idx.MetadataFilter === 'object') {
                filterClauses.push(idx.MetadataFilter);
            }
        }

        const url = `${node}/${indexNames.map(encodeURIComponent).join(',')}/_search`;
        const body = {
            size: topK,
            query: {
                bool: {
                    must: [{ match: { [defaultField]: effectiveQuery } }],
                    ...(filterClauses.length > 0 ? { filter: filterClauses } : {}),
                },
            },
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { ...this.buildAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                LogError(`OpenSearchSearchProvider: ${indexNames.join(',')} returned ${response.status}: ${text || response.statusText}`);
                return [];
            }
            const json = await response.json() as OpenSearchResponse;
            const hits = json.hits?.hits ?? [];
            if (hits.length === 0) return [];
            const topScore = Math.max(1, hits[0]._score);

            return hits.slice(0, topK).map((hit, idx) => {
                const src = hit._source ?? {};
                const title = String(src['title'] ?? src[defaultField] ?? hit._id);
                const snippet = String(src[defaultField] ?? '');
                const normalized = hit._score / topScore;
                return {
                    ID: `os-${hit._index}-${hit._id}`,
                    EntityName: hit._index,
                    RecordID: hit._id,
                    SourceType: this.SourceType,
                    ResultType: 'entity-record',
                    Title: title.slice(0, 200),
                    Snippet: snippet.slice(0, 500),
                    Score: normalized,
                    ScoreBreakdown: { FullText: normalized },
                    Tags: [],
                    MatchedAt: new Date(),
                    EntityIcon: 'fa-solid fa-database',
                    RecordName: title.slice(0, 200),
                    RawMetadata: JSON.stringify({ _index: hit._index, _id: hit._id, _rank: idx, _rawScore: hit._score }),
                };
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`OpenSearchSearchProvider.Search failed: ${msg}`);
            return [];
        }
    }

    private buildAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (this.parsedConfig?.awsAuthHeader) {
            headers['Authorization'] = this.parsedConfig.awsAuthHeader;
            return headers;
        }
        if (this.parsedConfig?.username && this.parsedConfig.password) {
            const encoded = Buffer
                .from(`${this.parsedConfig.username}:${this.parsedConfig.password}`)
                .toString('base64');
            headers['Authorization'] = `Basic ${encoded}`;
        }
        return headers;
    }
}

/** Tree-shake prevention helper. */
export function LoadOpenSearchSearchProvider(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = OpenSearchSearchProvider;
}
