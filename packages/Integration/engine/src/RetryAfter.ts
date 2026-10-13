/**
 * @fileoverview Standard `Retry-After` extraction, so a connector that writes no rate-limit code
 * still backs off by the amount the vendor actually asked for.
 *
 * `BaseIntegrationConnector.ExtractRetryAfterMs` returned `undefined` unconditionally and no
 * connector in this repo overrode it. The engine's limiter therefore always fell back to its own
 * multiplicative decrease — correct in direction, but blind to a number the vendor had already
 * supplied in the response.
 *
 * `Retry-After` is defined by RFC 9110 §10.2.3 and is the header a 429 (RFC 6585) and a 503 carry.
 * Parsing it is not a heuristic and not vendor-specific, which is exactly why it belongs in the
 * base class rather than in each connector: there is one correct reading of it, and every HTTP
 * connector benefits from having it read.
 *
 * Deliberately NOT a message-text parser. Guessing a duration out of prose ("try again in a bit")
 * risks inventing a number, and a wrong Retry-After is worse than none — it would freeze the bucket
 * for a made-up interval. Text-shaped signals stay the connector's job (see PheedLoop, whose vendor
 * puts its delay in the body rather than a header); this reads the standard header only.
 */

/**
 * Upper bound on an honored `Retry-After`, in milliseconds (5 minutes).
 *
 * A vendor occasionally returns an enormous or malformed value — a Unix timestamp mistaken for
 * delay-seconds, a date years out. Freezing a sync's token bucket for hours on the strength of one
 * response is a worse failure than backing off by the limiter's own decrease, so anything beyond
 * this is treated as unusable and the limiter's default applies.
 */
export const MAX_HONORED_RETRY_AFTER_MS = 5 * 60_000;

/** Something that might carry HTTP headers, in any of the shapes clients actually produce. */
type HeaderCarrier = {
    headers?: unknown;
    response?: { headers?: unknown; status?: number } | undefined;
    cause?: unknown;
    status?: number;
    statusCode?: number;
};

/**
 * Reads one header by name from a `Headers` instance, a `Map`, or a plain object, case-insensitively.
 * Returns undefined when the container is not one of those or the header is absent.
 */
function readHeader(container: unknown, name: string): string | undefined {
    if (!container || typeof container !== 'object') return undefined;

    // fetch's Headers (and anything else exposing a case-insensitive get)
    const getter = (container as { get?: unknown }).get;
    if (typeof getter === 'function') {
        try {
            const v = (container as { get(k: string): unknown }).get(name);
            if (typeof v === 'string' && v.length > 0) return v;
        } catch { /* not a Headers-like after all */ }
    }

    // Plain object / axios-style header bag. Node lower-cases response header names, but a hand-built
    // object may not, so compare case-insensitively rather than trusting the spelling.
    const target = name.toLowerCase();
    for (const [k, v] of Object.entries(container as Record<string, unknown>)) {
        if (k.toLowerCase() !== target) continue;
        // Node can hand back string[] for a repeated header; the first value is the one that counts.
        const raw = Array.isArray(v) ? v[0] : v;
        if (typeof raw === 'string' && raw.length > 0) return raw;
        if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    }
    return undefined;
}

/**
 * Parses a `Retry-After` value into milliseconds. RFC 9110 permits two forms:
 *   - delay-seconds: a non-negative integer, e.g. `120`
 *   - HTTP-date:     e.g. `Wed, 21 Oct 2015 07:28:00 GMT`
 *
 * @param value the raw header value
 * @param nowMs clock reading used to convert an HTTP-date into a delay; injectable for tests
 * @returns milliseconds to wait, or undefined when the value is unusable
 */
export function ParseRetryAfterValue(value: string | undefined, nowMs: number = Date.now()): number | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;

    // delay-seconds. Accept only a bare integer: a decimal or anything with trailing junk is not
    // what the spec defines, and Number() would happily coerce forms that mean something else.
    if (/^\d+$/.test(trimmed)) {
        const ms = Number(trimmed) * 1000;
        return ms > 0 && ms <= MAX_HONORED_RETRY_AFTER_MS ? ms : undefined;
    }

    // HTTP-date. `Date.parse` is extremely permissive — it happily reads '1.5' as a date and
    // returns a real timestamp — so gate it on the string actually LOOKING like one first.
    // Every form RFC 9110 permits (IMF-fixdate, obsolete RFC 850, asctime) carries a three-letter
    // day or month name AND a digit; the junk that reaches here ('1.5', '30s', '1e3', 'soon')
    // carries at most one of the two. Falling through to a misparsed date would invent a delay,
    // which is the one outcome worse than having none.
    if (!/[A-Za-z]{3}/.test(trimmed) || !/\d/.test(trimmed)) return undefined;

    // A date already in the past means "retry now" — no wait, but also not a parse failure, so it
    // must not fall through to the limiter's default as though nothing was said.
    const at = Date.parse(trimmed);
    if (Number.isNaN(at)) return undefined;
    const ms = at - nowMs;
    if (ms <= 0) return 0;
    return ms <= MAX_HONORED_RETRY_AFTER_MS ? ms : undefined;
}

/**
 * Extracts a `Retry-After` delay, in milliseconds, from a thrown error or a failed response.
 *
 * Walks the shapes HTTP clients actually throw: the error itself carrying `headers`, an axios-style
 * `error.response.headers`, and one level of `error.cause` (how a wrapper preserves the original).
 *
 * @param error the thrown value
 * @param nowMs clock reading for HTTP-date conversion; injectable for tests
 * @returns milliseconds to wait, or undefined when no usable header is present
 */
export function ExtractRetryAfterFromError(error: unknown, nowMs: number = Date.now()): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const e = error as HeaderCarrier;

    const candidates: unknown[] = [
        e.headers,
        e.response?.headers,
        (e.cause as HeaderCarrier | undefined)?.headers,
        (e.cause as HeaderCarrier | undefined)?.response?.headers,
    ];

    for (const container of candidates) {
        const parsed = ParseRetryAfterValue(readHeader(container, 'retry-after'), nowMs);
        if (parsed !== undefined) return parsed;
    }
    return undefined;
}
