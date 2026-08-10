/**
 * URL normalization for trace keying and replay guards, so two visits differing
 * only by record id, volatile token, param order, or hash fragment compare equal:
 * UUIDs become the literal token `{uuid}`, the hash fragment is dropped, caller-
 * named volatile params are dropped, and the rest are sorted by name.
 *
 * Pure and app-agnostic — `volatileParams` is the only app-specific input.
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
