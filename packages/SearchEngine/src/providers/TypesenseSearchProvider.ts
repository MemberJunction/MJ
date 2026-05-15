/**
 * @fileoverview Typesense search provider for the SearchEngine (P5.2).
 *
 * Calls Typesense's REST API directly via fetch — Typesense's surface is small
 * enough that adding the `typesense` SDK as another optional peer would be
 * overhead. Per-collection requests are run concurrently when a scope lists
 * multiple ExternalIndexes; results are merged and returned in score order.
 *
 * **Connection options** (from `SearchProviderConfig.ProviderConfig`):
 *   - `nodeUrl` — Single Typesense node URL (e.g. `https://ts.example:8108`)
 *   - `apiKey` — Typesense API key (sent via `X-TYPESENSE-API-KEY`)
 *   - `defaultCollection` — Fallback when scope doesn't list ExternalIndexes
 *   - `defaultQueryBy` — Comma-separated fields, default `'content,title'`
 *
 * **Scope constraints.** `ExternalIndexes` rows with `IndexType='Typesense'`
 * supply per-collection `ExternalIndexName` and an optional `MetadataFilter`
 * (a Typesense `filter_by` string — already-rendered with SearchContext
 * values via the scope's Nunjucks step).
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

interface TypesenseHit {
    document: Record<string, unknown>;
    text_match: number;
}

interface TypesenseSearchResponse {
    hits?: TypesenseHit[];
    found?: number;
}

interface TypesenseProviderConfig {
    nodeUrl?: string;
    apiKey?: string;
    defaultCollection?: string;
    defaultQueryBy?: string;
}

@RegisterClass(BaseSearchProvider, 'TypesenseSearchProvider')
export class TypesenseSearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'fulltext';

    private parsedConfig: TypesenseProviderConfig | null = null;
    private available = false;

    public override async Initialize(config: SearchProviderConfig, contextUser: UserInfo): Promise<void> {
        await super.Initialize(config, contextUser);
        this.parsedConfig = (config.ProviderConfig as TypesenseProviderConfig | null) ?? null;
        if (!this.parsedConfig?.nodeUrl || !this.parsedConfig.apiKey) {
            LogError('TypesenseSearchProvider: ProviderConfig must include nodeUrl and apiKey.');
            return;
        }
    }

    public override async CheckAvailability(_contextUser: UserInfo): Promise<void> {
        if (!this.parsedConfig?.nodeUrl || !this.parsedConfig.apiKey) {
            this.available = false;
            return;
        }
        try {
            const response = await fetch(`${this.parsedConfig.nodeUrl.replace(/\/$/, '')}/health`, {
                headers: { 'X-TYPESENSE-API-KEY': this.parsedConfig.apiKey },
            });
            this.available = response.ok;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`TypesenseSearchProvider: health check failed — ${msg}`);
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
        if (!this.parsedConfig?.nodeUrl || !this.parsedConfig.apiKey) return [];

        const effectiveQuery = scopeConstraints?.QueryTransforms?.[this.SourceType] ?? query;
        const queryBy = this.parsedConfig.defaultQueryBy ?? 'content,title';
        const node = this.parsedConfig.nodeUrl.replace(/\/$/, '');

        // Resolve target collections from scope ExternalIndexes; fall back to defaultCollection.
        const scopedTypesenseRows = scopeConstraints?.ExternalIndexes
            ?.filter(r => r.IndexType === 'Typesense' && r.ExternalIndexName) ?? [];
        const targets = scopedTypesenseRows.length > 0
            ? scopedTypesenseRows
            : (this.parsedConfig.defaultCollection
                ? [{
                    IndexType: 'Typesense' as const,
                    ExternalIndexName: this.parsedConfig.defaultCollection,
                    MetadataFilter: undefined as unknown,
                }]
                : []);

        if (targets.length === 0) return [];

        // Run all configured collection searches in parallel and merge by text_match score.
        const requests = targets.map(async (idx) => {
            const params = new URLSearchParams({
                q: effectiveQuery,
                query_by: queryBy,
                per_page: String(topK),
            });
            if (idx.MetadataFilter && typeof idx.MetadataFilter === 'string') {
                params.set('filter_by', idx.MetadataFilter);
            }
            const url = `${node}/collections/${encodeURIComponent(idx.ExternalIndexName as string)}/documents/search?${params.toString()}`;
            try {
                const response = await fetch(url, {
                    headers: { 'X-TYPESENSE-API-KEY': this.parsedConfig!.apiKey as string },
                });
                if (!response.ok) {
                    const body = await response.text().catch(() => '');
                    LogError(`TypesenseSearchProvider: ${idx.ExternalIndexName} returned ${response.status}: ${body || response.statusText}`);
                    return { collection: idx.ExternalIndexName as string, hits: [] as TypesenseHit[] };
                }
                const json = await response.json() as TypesenseSearchResponse;
                return { collection: idx.ExternalIndexName as string, hits: json.hits ?? [] };
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(`TypesenseSearchProvider: ${idx.ExternalIndexName} fetch failed — ${msg}`);
                return { collection: idx.ExternalIndexName as string, hits: [] as TypesenseHit[] };
            }
        });

        const results = await Promise.all(requests);
        const merged = results.flatMap(r =>
            r.hits.map(h => ({ collection: r.collection, hit: h })),
        );
        if (merged.length === 0) return [];

        // Normalize text_match to [0, 1] across the merged set so RRF fusion sees
        // comparable scores. text_match is a 64-bit Typesense match score — divide
        // by the top to keep rank order while bounding range.
        const topMatch = Math.max(1, ...merged.map(m => m.hit.text_match));

        return merged
            .sort((a, b) => b.hit.text_match - a.hit.text_match)
            .slice(0, topK)
            .map((m, idx) => {
                const doc = m.hit.document;
                const id = String(doc['id'] ?? `${m.collection}-${idx}`);
                const title = String(doc['title'] ?? doc['name'] ?? id);
                const snippetField = (this.parsedConfig?.defaultQueryBy ?? 'content,title').split(',')[0].trim();
                const snippet = String(doc[snippetField] ?? '');
                const normalized = m.hit.text_match / topMatch;
                return {
                    ID: `ts-${m.collection}-${id}`,
                    EntityName: m.collection,
                    RecordID: id,
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
                    RawMetadata: JSON.stringify({ collection: m.collection, id, _rawMatch: m.hit.text_match }),
                };
            });
    }
}

/** Tree-shake prevention helper. */
export function LoadTypesenseSearchProvider(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = TypesenseSearchProvider;
}
