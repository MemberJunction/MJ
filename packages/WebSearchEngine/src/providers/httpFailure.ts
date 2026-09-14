/**
 * @fileoverview Shared HTTP failure classification for web search drivers.
 * @module @memberjunction/web-search-engine
 */

import { HttpError, IsHttpError } from '@memberjunction/network-utils';
import { WebSearchFailureKind, WebSearchProviderResponse } from '../types';

/**
 * Classify an error thrown by a vendor call into the kind that drives engine failover.
 *
 * The distinction is about **the request, not the vendor**: a 400/422 means this query is
 * malformed and every other provider will reject it too, so the engine must stop rather than
 * spend four more paid calls learning the same thing. Everything else — auth, quota, 5xx,
 * timeouts — is specific to this vendor and another may well succeed.
 *
 * A missing or invalid API key is deliberately `transient` in that sense: the request is fine,
 * *this* provider just cannot serve it, so moving on is exactly right.
 */
export function classifyHttpFailure(error: unknown, vendor: string): WebSearchProviderResponse {
    // Status 0 is HttpError's "the request never produced a response" — a timeout or network
    // failure, which is transient by definition.
    if (IsHttpError(error) && error.Status > 0) {
        const status = error.Status;
        const detail = describeErrorBody(error) || error.message;

        if (status === 400 || status === 422) {
            return failure('permanent', `${vendor} rejected the request (HTTP ${status}): ${detail}`);
        }
        if (status === 401 || status === 403) {
            return failure('transient', `${vendor} rejected the API key (HTTP ${status}): ${detail}`);
        }
        if (status === 429) {
            return failure('transient', `${vendor} rate limit or quota exceeded: ${detail}`);
        }
        return failure('transient', `${vendor} API error (HTTP ${status}): ${detail}`);
    }

    const message = error instanceof Error ? error.message : String(error);
    return failure('transient', `${vendor} request failed: ${message}`);
}

/** Build a failed provider response. */
export function failure(kind: WebSearchFailureKind, message: string): WebSearchProviderResponse {
    return { Success: false, Hits: [], FailureKind: kind, ErrorMessage: message };
}

/** Pull whatever explanation an error body carries, without assuming a shape. */
function describeErrorBody(error: HttpError): string {
    const data: unknown = error.Data;
    if (typeof data === 'string') {
        return data.slice(0, 500);
    }
    if (data && typeof data === 'object') {
        const record = data as Record<string, unknown>;
        for (const key of ['detail', 'message', 'error']) {
            const value = record[key];
            if (typeof value === 'string' && value.length > 0) {
                return value;
            }
            // Several vendors nest as { error: { message | detail } }.
            if (value && typeof value === 'object') {
                const nested = value as Record<string, unknown>;
                for (const nestedKey of ['message', 'detail', 'code']) {
                    const nestedValue = nested[nestedKey];
                    if (typeof nestedValue === 'string' && nestedValue.length > 0) {
                        return nestedValue;
                    }
                }
            }
        }
    }
    return '';
}

/** Map a relative freshness window onto a vendor's own code table. */
export function mapFreshnessWindow<T extends string>(
    window: 'day' | 'week' | 'month' | 'year',
    codes: Record<'day' | 'week' | 'month' | 'year', T>,
): T {
    return codes[window];
}
