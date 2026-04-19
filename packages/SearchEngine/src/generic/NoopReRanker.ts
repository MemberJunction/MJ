/**
 * @fileoverview Default pass-through re-ranker.
 *
 * Returns the top-N candidates unchanged. Registered as `NoopReRanker` via the MJ
 * class factory so the SearchEngine's re-rank stage always has a concrete class to
 * instantiate, even when no provider-specific re-ranker is configured. Real
 * implementations (Cohere, BGE, Voyage) can subclass `BaseReRanker` and register a
 * separate `DriverClass`; a scope opts in by setting
 * `SearchScope.ScopeConfig.reRanker.driverClass` to that name.
 *
 * See Section 8.3 of plans/search-scopes-rag-plus.md.
 *
 * @module @memberjunction/search-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { BaseReRanker } from './BaseReRanker';
import { SearchResultItem } from './search.types';

/**
 * Pass-through re-ranker. Slices to `topN` and returns the candidate order untouched.
 */
@RegisterClass(BaseReRanker, 'NoopReRanker')
export class NoopReRanker extends BaseReRanker {
    public get DriverClass(): string {
        return 'NoopReRanker';
    }

    public async ReRank(
        _query: string,
        candidates: SearchResultItem[],
        topN: number,
        _contextUser: UserInfo,
        _config?: Record<string, unknown>
    ): Promise<SearchResultItem[]> {
        if (topN <= 0 || candidates.length === 0) return [];
        if (candidates.length <= topN) return candidates;
        return candidates.slice(0, topN);
    }
}

/** Tree-shake prevention helper. Call from consumer `public-api.ts` to guarantee
 * the registration side-effect runs. */
export function LoadNoopReRanker(): void {
    // Reference to ensure the class is not eliminated by bundlers.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = NoopReRanker;
}
