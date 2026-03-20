/**
 * Cursor-based pagination strategy.
 * Uses an opaque cursor token from the API response to request the next page.
 * Common in APIs like HubSpot, GitHub GraphQL, Stripe, etc.
 */
import type { PaginationStrategy, PaginationState } from '../../PaginationStrategy.js';

export class CursorPagination implements PaginationStrategy {
    public readonly Type = 'Cursor' as const;

    private readonly cursorParamName: string;
    private readonly cursorResponsePath: string;

    /**
     * @param cursorParamName - query parameter name to send the cursor value (default: 'after')
     * @param cursorResponsePath - dot-separated path to the next cursor in the response body (default: 'paging.next.after')
     */
    constructor(cursorParamName: string = 'after', cursorResponsePath: string = 'paging.next.after') {
        this.cursorParamName = cursorParamName;
        this.cursorResponsePath = cursorResponsePath;
    }

    public BuildPaginationParams(state: PaginationState, _pageSize: number): Record<string, string> {
        if (state.NextCursor) {
            return { [this.cursorParamName]: state.NextCursor };
        }
        return {};
    }

    public ExtractNextState(responseBody: unknown, _responseHeaders: Record<string, string>): PaginationState {
        const cursorValue = this.navigatePath(responseBody, this.cursorResponsePath);
        if (cursorValue != null && typeof cursorValue === 'string' && cursorValue.length > 0) {
            return { HasMore: true, NextCursor: cursorValue };
        }
        return { HasMore: false };
    }

    /**
     * Navigate a dot-separated path through a nested object to extract a value.
     */
    private navigatePath(obj: unknown, path: string): unknown {
        const segments = path.split('.');
        let current: unknown = obj;
        for (const segment of segments) {
            if (current == null || typeof current !== 'object') {
                return undefined;
            }
            current = (current as Record<string, unknown>)[segment];
        }
        return current;
    }
}
