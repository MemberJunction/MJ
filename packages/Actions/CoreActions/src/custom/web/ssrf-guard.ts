import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

/**
 * SSRF protection for the outbound-fetch web actions (URL Metadata Extractor, Web Page Content,
 * URL Link Validator). These actions take a fully user-/agent-supplied URL and are reachable by
 * any authenticated principal via RunAction, so without a guard they can be steered at cloud
 * instance-metadata endpoints (169.254.169.254), loopback, and internal-network hosts.
 *
 * The guard resolves the target hostname via DNS and rejects any address in a private, loopback,
 * link-local, CGNAT, unique-local or otherwise reserved range, and re-applies the check on every
 * HTTP redirect hop (a public host that 302s to an internal target would otherwise bypass an
 * initial-URL-only check).
 *
 * Note: this does not fully close DNS-rebinding (resolve-then-connect races); pinning the
 * resolved IP for the connection is a larger change. It does close the direct-URL and
 * redirect-to-internal vectors, which are the exploitable ones here.
 */

export class SsrfBlockedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SsrfBlockedError';
    }
}

/** Hostnames that must never be reachable regardless of what they resolve to. */
const BLOCKED_HOST_LITERALS = new Set<string>(['metadata.google.internal', 'metadata.goog']);

/** True if an IPv4 literal falls in a private / loopback / link-local / reserved range. */
function isBlockedIPv4(ip: string): boolean {
    const parts = ip.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return true; // malformed → fail closed
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8 "this host"
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 IMDS)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 protocol assignments
    if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
    return false;
}

/** True if an IPv6 literal falls in a loopback / link-local / unique-local / mapped-private range. */
function isBlockedIPv6(ip: string): boolean {
    const addr = ip.toLowerCase().split('%')[0]; // strip any zone id
    if (addr === '::' || addr === '::1') return true; // unspecified / loopback
    if (addr.startsWith('fe80')) return true; // link-local fe80::/10
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique-local fc00::/7
    // IPv4-mapped / -compatible: ::ffff:a.b.c.d or ::a.b.c.d — check the embedded v4
    const mapped = addr.match(/(?:::ffff:|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isBlockedIPv4(mapped[1]);
    return false;
}

/** True if the given IP literal is in a blocked range (fails closed on anything unrecognized). */
export function isBlockedIp(ip: string): boolean {
    const family = isIP(ip);
    if (family === 4) return isBlockedIPv4(ip);
    if (family === 6) return isBlockedIPv6(ip);
    return true; // not a valid IP literal → block
}

/**
 * Synchronous host check for HTTP-client redirect hooks (e.g. axios `beforeRedirect`), which
 * cannot await DNS. Blocks metadata hostnames and any literal-IP redirect target in a reserved
 * range (the common `302 → http://169.254.169.254/...` IMDS bypass). Non-literal hostnames are
 * re-validated by {@link assertPublicHttpUrl} on the fetch path.
 */
export function isBlockedRedirectHost(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (BLOCKED_HOST_LITERALS.has(h)) return true;
    if (isIP(h)) return isBlockedIp(h);
    return false;
}

/**
 * Parse + scheme-check a URL, then DNS-resolve it and reject when ANY resolved address is in a
 * private/reserved range. Returns the parsed URL on success; throws {@link SsrfBlockedError}
 * otherwise.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new SsrfBlockedError(`Invalid URL: ${rawUrl}`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new SsrfBlockedError(`Blocked URL scheme: ${url.protocol}`);
    }

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (BLOCKED_HOST_LITERALS.has(hostname)) {
        throw new SsrfBlockedError(`Blocked host: ${hostname}`);
    }

    if (isIP(hostname)) {
        if (isBlockedIp(hostname)) {
            throw new SsrfBlockedError(`Blocked address: ${hostname}`);
        }
        return url;
    }

    let addrs: Array<{ address: string }>;
    try {
        addrs = await dns.lookup(hostname, { all: true });
    } catch {
        throw new SsrfBlockedError(`DNS resolution failed for ${hostname}`);
    }
    if (!addrs.length) {
        throw new SsrfBlockedError(`No addresses resolved for ${hostname}`);
    }
    for (const a of addrs) {
        if (isBlockedIp(a.address)) {
            throw new SsrfBlockedError(`Blocked address for ${hostname}: ${a.address}`);
        }
    }
    return url;
}

/**
 * `fetch()` wrapper that validates the initial URL and re-validates every redirect hop against
 * {@link assertPublicHttpUrl} (following redirects manually, bounded by `maxRedirects`). Use this
 * instead of a bare `fetch` for any request to a user-supplied URL.
 */
export async function ssrfSafeFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
    let current = (await assertPublicHttpUrl(rawUrl)).toString();
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const resp = await fetch(current, { ...init, redirect: 'manual' });
        if (resp.status >= 300 && resp.status < 400) {
            const location = resp.headers.get('location');
            if (!location) {
                return resp; // redirect with no Location — hand back as-is
            }
            const next = new URL(location, current).toString();
            current = (await assertPublicHttpUrl(next)).toString(); // re-validate each hop
            continue;
        }
        return resp;
    }
    throw new SsrfBlockedError(`Too many redirects for ${rawUrl}`);
}
