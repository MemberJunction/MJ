/**
 * @fileoverview Shared HTTP failure classification for web search drivers.
 * @module @memberjunction/web-search-engine
 */

import { HttpError, IsHttpError } from '@memberjunction/network-utils';
import { WebSearchFailureKind, WebSearchProviderResponse } from '../types';

/**
 * Phrases a vendor uses when the *credential* was rejected, matched against the response body.
 *
 * Lowercased, and compared with `String.includes` rather than a regular expression — this package
 * deliberately runs no regex over remote input, and that property is worth more than the brevity.
 *
 * Kept specific enough not to fire on a genuine query rejection: "api key" alone would match a
 * search *for* the phrase, so each entry carries the verb that makes it a credential verdict.
 */
const CREDENTIAL_REJECTION_MARKERS: readonly string[] = [
    // Google Custom Search: HTTP 400 with reason `keyInvalid`
    'api key not valid',
    'keyinvalid',
    'keyexpired',
    'api key expired',
    // Widely used phrasings across the other vendors
    'invalid api key',
    'api key is invalid',
    'invalid_api_key',
    'api_key_invalid',
    'missing api key',
    'no api key',
    'invalid authentication',
    'unauthorized',
];

/**
 * Whether a 400-class body is really an authentication verdict rather than a bad query.
 *
 * Both the extracted detail and the raw serialized body are searched, because the marker is not
 * always in the field {@link describeErrorBody} picks: Google puts `"message": "API key not
 * valid…"` at `error.message` but the machine-readable `"reason": "keyInvalid"` inside
 * `error.errors[]`, which the extractor never reaches.
 */
function isCredentialRejection(detail: string, error: HttpError): boolean {
    const haystack = `${detail} ${serializeBody(error.Data)}`.toLowerCase();
    return CREDENTIAL_REJECTION_MARKERS.some((marker) => haystack.includes(marker));
}

/** Flatten a response body to searchable text, bounded so a large body cannot dominate the scan. */
function serializeBody(data: unknown): string {
    if (typeof data === 'string') {
        return data.slice(0, 2000);
    }
    if (data && typeof data === 'object') {
        try {
            return JSON.stringify(data).slice(0, 2000);
        } catch {
            // Circular or otherwise unserialisable — the extracted detail still carries a verdict.
            return '';
        }
    }
    return '';
}

/**
 * Classify an error thrown by a vendor call into the kind that drives engine failover.
 *
 * The distinction is about **the request, not the vendor**: a 400/422 normally means this query is
 * malformed and every other provider will reject it too, so the engine must stop rather than
 * spend four more paid calls learning the same thing. Everything else — auth, quota, 5xx,
 * timeouts — is specific to this vendor and another may well succeed.
 *
 * A missing or invalid API key is deliberately `transient` in that sense: the request is fine,
 * *this* provider just cannot serve it, so moving on is exactly right.
 *
 * **Status alone does not decide that**, which is why a 400 is inspected before it is trusted.
 * Google Custom Search answers an invalid key with HTTP 400 (`reason: keyInvalid`), not 401 — so
 * classifying by status alone made a dead Google key stop the whole run, on precisely the vendor
 * whose keys are expected to stop working when the API is discontinued on 2027-01-01. Perplexity
 * answers the same condition with 401 and failed over correctly, which is what made the
 * inconsistency easy to miss.
 */
export function ClassifyHttpFailure(error: unknown, vendor: string): WebSearchProviderResponse {
    // Status 0 is HttpError's "the request never produced a response" — a timeout or network
    // failure, which is transient by definition.
    if (IsHttpError(error) && error.Status > 0) {
        const status = error.Status;
        const detail = describeErrorBody(error) || error.message;

        if (status === 400 || status === 422) {
            // An auth verdict dressed as a bad request: another provider may well serve this query.
            if (isCredentialRejection(detail, error)) {
                return Failure(
                    'transient',
                    `${vendor} rejected the API key (HTTP ${status}): ${detail}`,
                );
            }
            return Failure('permanent', `${vendor} rejected the request (HTTP ${status}): ${detail}`);
        }
        if (status === 401 || status === 403) {
            return Failure('transient', `${vendor} rejected the API key (HTTP ${status}): ${detail}`);
        }
        if (status === 429) {
            return Failure('transient', `${vendor} rate limit or quota exceeded: ${detail}`);
        }
        return Failure('transient', `${vendor} API error (HTTP ${status}): ${detail}`);
    }

    const message = error instanceof Error ? error.message : String(error);
    return Failure('transient', `${vendor} request failed: ${message}`);
}

/** @deprecated Use {@link ClassifyHttpFailure}. */
export function classifyHttpFailure(error: unknown, vendor: string): WebSearchProviderResponse {
    return ClassifyHttpFailure(error, vendor);
}

/** Build a failed provider response. */
export function Failure(kind: WebSearchFailureKind, message: string): WebSearchProviderResponse {
    return { Success: false, Hits: [], FailureKind: kind, ErrorMessage: message };
}

/** @deprecated Use {@link Failure}. */
export function failure(kind: WebSearchFailureKind, message: string): WebSearchProviderResponse {
    return Failure(kind, message);
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
export function MapFreshnessWindow<T extends string>(
    window: 'day' | 'week' | 'month' | 'year',
    codes: Record<'day' | 'week' | 'month' | 'year', T>,
): T {
    return codes[window];
}

/** @deprecated Use {@link MapFreshnessWindow}. */
export function mapFreshnessWindow<T extends string>(
    window: 'day' | 'week' | 'month' | 'year',
    codes: Record<'day' | 'week' | 'month' | 'year', T>,
): T {
    return MapFreshnessWindow(window, codes);
}
