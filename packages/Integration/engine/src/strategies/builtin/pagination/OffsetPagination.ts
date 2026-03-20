/**
 * Offset-based pagination strategy.
 * Uses a numeric offset and limit to paginate through records.
 * Common in SQL-backed APIs and some REST APIs.
 */
import type { PaginationStrategy, PaginationState } from '../../PaginationStrategy.js';

export class OffsetPagination implements PaginationStrategy {
    public readonly Type = 'Offset' as const;

    private readonly offsetParamName: string;
    private readonly limitParamName: string;

    /** Tracks the current offset internally since ExtractNextState does not receive state */
    private currentOffset: number = 0;
    /** Tracks page size from BuildPaginationParams for use in ExtractNextState */
    private currentPageSize: number = 0;

    /**
     * @param offsetParamName - query parameter name for the offset (default: 'offset')
     * @param limitParamName - query parameter name for the limit/page size (default: 'limit')
     */
    constructor(offsetParamName: string = 'offset', limitParamName: string = 'limit') {
        this.offsetParamName = offsetParamName;
        this.limitParamName = limitParamName;
    }

    public BuildPaginationParams(state: PaginationState, pageSize: number): Record<string, string> {
        this.currentOffset = state.NextOffset ?? 0;
        this.currentPageSize = pageSize;
        return {
            [this.offsetParamName]: String(this.currentOffset),
            [this.limitParamName]: String(pageSize),
        };
    }

    public ExtractNextState(responseBody: unknown, _responseHeaders: Record<string, string>): PaginationState {
        const count = this.extractRecordCount(responseBody);
        if (count == null) {
            return { HasMore: false };
        }
        if (count >= this.currentPageSize) {
            return { HasMore: true, NextOffset: this.currentOffset + count };
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
