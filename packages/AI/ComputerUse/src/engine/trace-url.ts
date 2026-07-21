/**
 * URL normalization for trace keying and replay guards (CU-C1/C4).
 *
 * Stagehand's field lesson: URL-keyed caches are defeated by per-record UUIDs
 * in URLs (Explorer URLs are full of them). We normalize a URL so two visits
 * that differ only by record id / volatile token / param order / hash fragment
 * compare EQUAL:
 *
 *   1. UUIDs anywhere in the path or query become the literal token `{uuid}`
 *      (case-normalized — the UUID guide's cross-platform casing concern is
 *      moot once the value is a fixed token).
 *   2. The hash fragment is always dropped (SPA in-page anchors aren't identity).
 *   3. Volatile query params (per-visit tokens, timestamps — named by the
 *      caller's AppProfile) are dropped.
 *   4. Remaining query params are sorted by name for order-independence.
 *
 * Pure and app-agnostic: the only app-specific input is the `volatileParams`
 * list the caller threads through from the AppProfile.
 */

/** Matches a UUID (any version) anywhere in a string; global + case-insensitive. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The token a UUID is replaced with — stable across visits/platforms. */
export const UUID_TOKEN = '{uuid}';

/**
 * Normalize a URL for stable trace keying / comparison. Returns the input
 * (trimmed) unchanged when it can't be parsed as a URL — a best-effort that
 * never throws.
 */
export function normalizeTraceUrl(url: string, volatileParams: string[] = []): string {
    const raw = (url ?? '').trim();
    if (!raw) {
        return '';
    }

    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        // Not an absolute URL — normalize UUIDs in the raw string at least, so a
        // path-only pattern (e.g. '/app/record/<uuid>') still keys stably.
        return raw.replace(UUID_RE, UUID_TOKEN);
    }

    const volatile = new Set(volatileParams.map(p => p.toLowerCase()));
    const params: [string, string][] = [];
    parsed.searchParams.forEach((value, name) => {
        if (!volatile.has(name.toLowerCase())) {
            params.push([name, value.replace(UUID_RE, UUID_TOKEN)]);
        }
    });
    params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    const path = parsed.pathname.replace(UUID_RE, UUID_TOKEN);
    const query = params.length > 0
        ? '?' + params.map(([n, v]) => `${n}=${v}`).join('&')
        : '';
    // Hash fragment is intentionally dropped.
    return `${parsed.origin}${path}${query}`;
}

/**
 * Whether an actual URL satisfies a recorded URL pattern. Both are normalized,
 * then the pattern is matched as a substring of the actual — so a full-URL
 * pattern matches exactly and a path-fragment pattern (e.g. `/app/data`)
 * matches any URL containing it. An empty pattern matches anything (no
 * constraint recorded).
 */
export function traceUrlMatches(pattern: string, actualUrl: string, volatileParams: string[] = []): boolean {
    const p = normalizeTraceUrl(pattern, volatileParams);
    if (!p) {
        return true;
    }
    const a = normalizeTraceUrl(actualUrl, volatileParams);
    return a.includes(p);
}
