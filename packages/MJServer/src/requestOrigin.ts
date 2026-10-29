/**
 * Request-origin helpers shared by the GraphQL context (`AppContext.RequestOrigin`) and the realtime
 * widget origin allowlist, so an origin read from a request and an origin read from an allowlist are
 * normalized the same way and compare with plain string equality.
 */

/**
 * Shape of a serialized http(s) origin: scheme, host and optional port, with no path, query,
 * fragment or credentials. Applied after {@link NormalizeOrigin}, so it only needs lowercase.
 */
const HTTP_ORIGIN_PATTERN = /^https?:\/\/[^/?#@\s]+$/;

/**
 * Normalizes an origin for stable comparison: trims whitespace, lowercases, and strips trailing
 * slashes. It does not parse the value or rewrite ports, so `https://a.com:443` stays as written.
 * @param origin an origin as written in a header or an allowlist entry
 */
export function NormalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Reads a request's `Origin` header into a normalized origin (`scheme://host[:port]`).
 *
 * Returns undefined when the header is absent, repeated, blank, opaque (`null`, which sandboxed
 * frames and privacy-sensitive redirects send), or anything other than a parseable http(s) origin.
 * Ports are kept as sent: browsers omit default ports from `Origin`, and allowlist entries pass
 * through the same {@link NormalizeOrigin}, so both sides agree without rewriting.
 * @param originHeader the raw `Origin` header value from the request
 */
export function ReadRequestOrigin(originHeader: string | string[] | undefined): string | undefined {
  if (typeof originHeader !== 'string') {
    return undefined;
  }
  const normalized = NormalizeOrigin(originHeader);
  return IsHttpOrigin(normalized) ? normalized : undefined;
}

/** True when a normalized value is a parseable http(s) origin with no path, query, fragment or credentials. */
function IsHttpOrigin(normalized: string): boolean {
  if (!HTTP_ORIGIN_PATTERN.test(normalized)) {
    return false;
  }
  try {
    return new URL(normalized).host.length > 0;
  } catch {
    return false;
  }
}
