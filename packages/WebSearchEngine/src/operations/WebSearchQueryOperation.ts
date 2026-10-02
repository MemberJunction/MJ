/**
 * @fileoverview `WebSearch.Query` — server implementation of the Web Search remote operation.
 *
 * Exposes WebSearchEngine to client applications through MemberJunction's Remote Operations
 * RPC gateway with `websearch:execute` API scope enforcement.
 *
 * @module @memberjunction/web-search-engine
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    WebSearchQueryOperation,
    type WebSearchQueryInput,
    type WebSearchQueryOutput,
} from '@memberjunction/core-entities';
import { WebSearchEngine } from '../WebSearchEngine';
import type { WebSearchParams } from '../types';

@RegisterClass(BaseRemotableOperation, 'WebSearch.Query')
export class WebSearchQueryServerOperation extends WebSearchQueryOperation {
    protected async InternalExecute(
        input: WebSearchQueryInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<WebSearchQueryOutput> {
        const query = input?.query?.trim();
        if (!query) {
            throw new Error('query is required');
        }

        await WebSearchEngine.Instance.Config(false, user, provider);

        const searchParams: WebSearchParams = {
            Query: query,
            MaxResults: input.maxResults,
            Provider: input.provider,
            IncludeDomains: input.includeDomains,
            ExcludeDomains: input.excludeDomains,
            Freshness: input.freshness,
            Country: input.country,
            Language: input.language,
            SafeSearch: input.safeSearch,
            IncludeAnswer: input.includeAnswer,
        };

        const result = await WebSearchEngine.Instance.Search(searchParams, user);
        if (!result.Success) {
            throw new Error(`${result.ResultCode}: ${result.ErrorMessage ?? 'Search failed'}`);
        }

        return {
            hits: (result.Hits ?? []).map((hit) => ({
                title: hit.Title,
                url: hit.URL,
                snippet: hit.Snippet,
                displayUrl: hit.DisplayURL,
                publishedAt: hit.PublishedAt instanceof Date ? hit.PublishedAt.toISOString() : undefined,
                score: hit.Score,
            })),
            answer: result.Answer,
            providerUsed: result.ProviderUsed ?? '',
            attempts: (result.Attempts ?? []).map((attempt) => ({
                providerName: attempt.ProviderName,
                succeeded: attempt.Succeeded,
                durationMs: attempt.DurationMs,
                hitCount: attempt.HitCount,
                failureKind: attempt.FailureKind,
                errorMessage: attempt.ErrorMessage,
            })),
        };
    }
}

/** Keep the registration from being tree-shaken out of a bundled host. */
export function LoadWebSearchOperations(): void {
    void WebSearchQueryServerOperation;
}
