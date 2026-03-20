/**
 * Page-number-based pagination strategy.
 * Uses a page number and page size to paginate through records.
 * Common in traditional REST APIs.
 */
import type { PaginationStrategy, PaginationState } from '../../PaginationStrategy.js';

export class PageNumberPagination implements PaginationStrategy {
    public readonly Type = 'PageNumber' as const;

    private readonly pageParamName: string;
    private readonly pageSizeParamName: string;

    /** Tracks the current page internally since ExtractNextState does not receive state */
    private currentPage: number = 1;
    /** Tracks page size from BuildPaginationParams for use in ExtractNextState */
    private currentPageSize: number = 0;

    /**
     * @param pageParamName - query parameter name for the page number (default: 'page')
     * @param pageSizeParamName - query parameter name for the page size (default: 'pageSize')
     */
    constructor(pageParamName: string = 'page', pageSizeParamName: string = 'pageSize') {
        this.pageParamName = pageParamName;
        this.pageSizeParamName = pageSizeParamName;
    }

    public BuildPaginationParams(state: PaginationState, pageSize: number): Record<string, string> {
        this.currentPage = state.NextPage ?? 1;
        this.currentPageSize = pageSize;
        return {
            [this.pageParamName]: String(this.currentPage),
            [this.pageSizeParamName]: String(pageSize),
        };
    }

    public ExtractNextState(responseBody: unknown, _responseHeaders: Record<string, string>): PaginationState {
        const count = this.extractRecordCount(responseBody);
        if (count != null && count > 0 && count >= this.currentPageSize) {
            return { HasMore: true, NextPage: this.currentPage + 1 };
        }
        return { HasMore: false };
    }

    /**
     * Try to determine the number of records in the response.
     * Handles: arrays, objects with results/data/records arrays.
     */
    private extractRecordCount(responseBody: unknown): number | null {
        if (Array.isArray(responseBody)) {
            return responseBody.length;
        }
        if (responseBody != null && typeof responseBody === 'object') {
            const body = responseBody as Record<string, unknown>;
            for (const key of ['results', 'data', 'records', 'items', 'values']) {
                if (Array.isArray(body[key])) {
                    return (body[key] as unknown[]).length;
                }
            }
        }
        return null;
    }
}
