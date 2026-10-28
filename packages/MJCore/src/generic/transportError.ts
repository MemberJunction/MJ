/**
 * @fileoverview Tells a failure of the TRANSPORT apart from a server that answered "no".
 *
 * The distinction decides whether a caller may keep serving what it already holds. A timeout,
 * a dead socket or a gateway's 502/503/504 says nothing about the data — the same request a
 * moment later may well succeed, and tearing down a cached snapshot over it is pure loss. A
 * refusal (an API key without the scope, a user without the role, a validation rejection) is
 * a definite answer from the server: it does not heal by waiting, and a cache served over it
 * would hand the caller exactly what the server just declined to hand it.
 *
 * Both the metadata provider and the Explorer's bootstrap classifier use this one definition,
 * so a shape that counts as transport in one place counts as transport everywhere.
 */

/**
 * Substrings that identify a failure of the transport rather than of the request. Matched
 * case-insensitively against every message found on the error (see {@link CollectErrorText}).
 * Deliberately includes the gateway/timeout vocabulary: a metadata-status query timing out
 * behind a reverse proxy says `504` / `Gateway Timeout` and contains neither "network" nor
 * "fetch", the two words a substring check once looked for.
 */
const TRANSPORT_ERROR_SIGNATURES: readonly string[] = [
    'network',
    'fetch',
    'timeout',
    'timed out',
    'gateway',
    'bad gateway',
    'service unavailable',
    'socket hang up',
    'connection closed',
    'connection reset',
    'connection refused',
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'epipe',
    'load failed', // Safari's opaque fetch failure
    'aborterror',
    'the operation was aborted',
    'err_network',
    'err_connection',
];

/** HTTP statuses that mean "the request never got a real answer" — always retryable. */
const TRANSPORT_STATUS_CODES: readonly number[] = [408, 425, 429, 502, 503, 504, 522, 524];

/**
 * Matches a transport status code quoted inside an error message — "status code 504",
 * "HTTP 503", "status: 429". The `\D{0,12}` gap allows the punctuation and filler these
 * messages put between the label and the number without letting an unrelated number through.
 */
const TRANSPORT_STATUS_IN_TEXT = /\b(?:status(?:\s*code)?|http)\D{0,12}(?:408|425|429|502|503|504|522|524)\b/i;

/**
 * True when the error describes the transport failing rather than the server refusing.
 *
 * Checks three independent places, because a GraphQL client can put the interesting part in
 * any of them: an HTTP status (`err.status` / `err.statusCode` / `err.response.status` /
 * `err.networkError.statusCode`), a `networkError` property at all, and the collected message
 * text from the error, its `networkError`, its nested `error` / `cause`, and every entry of a
 * GraphQL `response.errors[]`.
 *
 * Anything else — an authorization denial, a validation rejection, a programming error, an
 * entity missing from metadata — is NOT transport, and callers must let it propagate.
 */
export function IsTransportError(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
        return false;
    }
    const candidate = err as Record<string, unknown>;

    // 1. An HTTP status, wherever the client hung it.
    const statusCandidates = [
        candidate['status'],
        candidate['statusCode'],
        (candidate['response'] as Record<string, unknown> | undefined)?.['status'],
        (candidate['networkError'] as Record<string, unknown> | undefined)?.['statusCode'],
    ];
    for (const status of statusCandidates) {
        if (typeof status === 'number' && TRANSPORT_STATUS_CODES.includes(status)) {
            return true;
        }
    }

    // 2. A `networkError` property at all means the request did not complete.
    if (candidate['networkError'] != null) {
        return true;
    }

    // 3. The text, from everywhere it might hide.
    const text = CollectErrorText(err).toLowerCase();
    if (!text) {
        return false;
    }
    if (TRANSPORT_ERROR_SIGNATURES.some((sig) => text.includes(sig))) {
        return true;
    }
    // 4. A status code quoted IN the text. Apollo's standard message for a failed HTTP round
    //    trip is "Response not successful: Received status code 504" — no adjective anywhere
    //    in it, so the substrings above miss the most common shape of all. The number must sit
    //    next to the words "status" or "http" so that a message merely mentioning 504 for some
    //    other reason is not swept in.
    return TRANSPORT_STATUS_IN_TEXT.test(text);
}

/**
 * Gather every human-readable string attached to an error into one blob for matching.
 *
 * `depth` bounds the walk so a self-referential error object (which GraphQL clients do
 * produce — `err.error === err`) cannot spin here.
 */
export function CollectErrorText(err: unknown, depth = 0): string {
    if (err == null || depth > 3) {
        return '';
    }
    if (typeof err === 'string') {
        return err;
    }
    if (typeof err !== 'object') {
        return '';
    }
    const candidate = err as Record<string, unknown>;
    const parts: string[] = [];

    for (const key of ['message', 'name', 'code', 'reason', 'statusText'] as const) {
        const value = candidate[key];
        if (typeof value === 'string') {
            parts.push(value);
        }
    }

    const response = candidate['response'] as Record<string, unknown> | undefined;
    const graphQLErrors = Array.isArray(candidate['errors'])
        ? candidate['errors']
        : Array.isArray(response?.['errors'])
          ? (response['errors'] as unknown[])
          : [];
    for (const entry of graphQLErrors) {
        parts.push(CollectErrorText(entry, depth + 1));
    }

    for (const key of ['networkError', 'error', 'cause'] as const) {
        if (candidate[key] !== err) {
            parts.push(CollectErrorText(candidate[key], depth + 1));
        }
    }

    return parts.filter((p) => p.length > 0).join(' | ');
}

/**
 * A message for a transport error that carries no `message` of its own — a bare
 * `{ response: { status: 504 } }`, for example. Without this the surfaced text would be empty.
 */
export function DescribeTransportError(err: unknown): string {
    const collected = CollectErrorText(err);
    return collected.length > 0 ? collected : 'The server did not respond.';
}
