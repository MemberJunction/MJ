/**
 * No-pagination strategy.
 * Used when an API returns all records in a single response with no pagination.
 */
import type { PaginationStrategy, PaginationState } from '../../PaginationStrategy.js';

export class NoPagination implements PaginationStrategy {
    public readonly Type = 'None' as const;

    public BuildPaginationParams(_state: PaginationState, _pageSize: number): Record<string, string> {
        return {};
    }

    public ExtractNextState(_responseBody: unknown, _responseHeaders: Record<string, string>): PaginationState {
        return { HasMore: false };
    }
}
