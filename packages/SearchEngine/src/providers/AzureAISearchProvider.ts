/**
 * @fileoverview Azure AI Search provider for the SearchEngine (P5.3).
 *
 * Calls Azure AI Search's `docs/search` REST endpoint directly via fetch.
 * Azure AI Search's filter syntax is OData ($filter), passed through as a
 * pre-rendered string from the scope's `MetadataFilter`. Permission /
 * tenant push-down lives entirely in that filter — no post-fusion filtering.
 *
 * **Connection options** (from `SearchProviderConfig.ProviderConfig`):
 *   - `serviceName` — Azure AI Search service short name (combined with
 *     `.search.windows.net`); OR
 *   - `endpoint` — full HTTPS endpoint URL (e.g. `https://my.search.windows.net`)
 *   - `apiKey` — query or admin key (sent via `api-key` header)
 *   - `apiVersion` — API version, default `2024-07-01`
 *   - `defaultIndex` — fallback index when no scope ExternalIndexes
 *   - `defaultSearchFields` — comma-separated `searchFields` (when omitted,
 *     Azure searches all searchable fields)
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

interface AzureSearchHit {
    '@search.score': number;
    [key: string]: unknown;
}
interface AzureSearchResponse {
    value?: AzureSearchHit[];
    '@odata.count'?: number;
}

interface AzureProviderConfig {
    serviceName?: string;
    endpoint?: string;
    apiKey?: string;
    apiVersion?: string;
    defaultIndex?: string;
    defaultSearchFields?: string;
}

@RegisterClass(BaseSearchProvider, 'AzureAISearchProvider')
export class AzureAISearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'fulltext';

    private parsedConfig: AzureProviderConfig | null = null;
    private available = false;

    public override async Initialize(config: SearchProviderConfig, contextUser: UserInfo): Promise<void> {
        await super.Initialize(config, contextUser);
        this.parsedConfig = (config.ProviderConfig as AzureProviderConfig | null) ?? null;
        if (!this.parsedConfig?.apiKey || (!this.parsedConfig.endpoint && !this.parsedConfig.serviceName)) {
            LogError('AzureAISearchProvider: ProviderConfig must include apiKey and either endpoint or serviceName.');
            return;
        }
    }

    public override async CheckAvailability(_contextUser: UserInfo): Promise<void> {
        if (!this.parsedConfig?.apiKey) { this.available = false; return; }
        const endpoint = this.resolveEndpoint();
        if (!endpoint) { this.available = false; return; }
        try {
            // Probe the service-level endpoint with the api-version param. A 200/401 both
            // confirm the host is reachable; we treat any HTTP response as "service is up
            // and credential is at least the right shape" — Azure returns 401 if the key
            // is wrong, which IS reachable.
            const url = `${endpoint}/?api-version=${encodeURIComponent(this.parsedConfig.apiVersion ?? '2024-07-01')}`;
            const response = await fetch(url, { method: 'GET', headers: { 'api-key': this.parsedConfig.apiKey } });
            this.available = response.ok || response.status === 401;
            if (!this.available) {
                LogError(`AzureAISearchProvider: probe returned ${response.status}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`AzureAISearchProvider: probe failed — ${msg}`);
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
        if (!this.parsedConfig?.apiKey) return [];
        const endpoint = this.resolveEndpoint();
        if (!endpoint) return [];

        const effectiveQuery = scopeConstraints?.QueryTransforms?.[this.SourceType] ?? query;
        const apiVersion = this.parsedConfig.apiVersion ?? '2024-07-01';

        const scopedAzureRows = scopeConstraints?.ExternalIndexes
            ?.filter(r => r.IndexType === 'AzureAISearch' && r.ExternalIndexName) ?? [];
        const targets = scopedAzureRows.length > 0
            ? scopedAzureRows
            : (this.parsedConfig.defaultIndex
                ? [{
                    IndexType: 'AzureAISearch' as const,
                    ExternalIndexName: this.parsedConfig.defaultIndex,
                    MetadataFilter: undefined as unknown,
                }]
                : []);
        if (targets.length === 0) return [];

        const requests = targets.map(async (idx) => {
            const url = `${endpoint}/indexes/${encodeURIComponent(idx.ExternalIndexName as string)}/docs/search?api-version=${encodeURIComponent(apiVersion)}`;
            const body: Record<string, unknown> = {
                search: effectiveQuery,
                top: topK,
            };
            if (this.parsedConfig?.defaultSearchFields) {
                body.searchFields = this.parsedConfig.defaultSearchFields;
            }
            if (idx.MetadataFilter && typeof idx.MetadataFilter === 'string') {
                body.filter = idx.MetadataFilter;
            }
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'api-key': this.parsedConfig!.apiKey as string, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!response.ok) {
                    const text = await response.text().catch(() => '');
                    LogError(`AzureAISearchProvider: ${idx.ExternalIndexName} returned ${response.status}: ${text || response.statusText}`);
                    return { index: idx.ExternalIndexName as string, hits: [] as AzureSearchHit[] };
                }
                const json = await response.json() as AzureSearchResponse;
                return { index: idx.ExternalIndexName as string, hits: json.value ?? [] };
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(`AzureAISearchProvider: ${idx.ExternalIndexName} fetch failed — ${msg}`);
                return { index: idx.ExternalIndexName as string, hits: [] as AzureSearchHit[] };
            }
        });

        const results = await Promise.all(requests);
        const merged = results.flatMap(r => r.hits.map(h => ({ index: r.index, hit: h })));
        if (merged.length === 0) return [];

        const topScore = Math.max(1, ...merged.map(m => m.hit['@search.score']));

        return merged
            .sort((a, b) => b.hit['@search.score'] - a.hit['@search.score'])
            .slice(0, topK)
            .map((m) => {
                const id = String(m.hit['id'] ?? m.hit['Id'] ?? m.hit['ID'] ?? '');
                const title = String(m.hit['title'] ?? m.hit['name'] ?? m.hit['Name'] ?? id);
                const snippet = String(m.hit['content'] ?? m.hit['description'] ?? '');
                const normalized = m.hit['@search.score'] / topScore;
                return {
                    ID: `azs-${m.index}-${id}`,
                    EntityName: m.index,
                    RecordID: id,
                    SourceType: this.SourceType,
                    ResultType: 'entity-record',
                    Title: title.slice(0, 200),
                    Snippet: snippet.slice(0, 500),
                    Score: normalized,
                    ScoreBreakdown: { FullText: normalized },
                    Tags: [],
                    MatchedAt: new Date(),
                    EntityIcon: 'fa-solid fa-cloud',
                    RecordName: title.slice(0, 200),
                    RawMetadata: JSON.stringify({ index: m.index, id, _rawScore: m.hit['@search.score'] }),
                };
            });
    }

    /** Resolve the Azure search service base URL from the parsed config. */
    private resolveEndpoint(): string | null {
        if (this.parsedConfig?.endpoint) {
            return this.parsedConfig.endpoint.replace(/\/$/, '');
        }
        if (this.parsedConfig?.serviceName) {
            return `https://${this.parsedConfig.serviceName}.search.windows.net`;
        }
        return null;
    }
}

/** Tree-shake prevention helper. */
export function LoadAzureAISearchProvider(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = AzureAISearchProvider;
}
