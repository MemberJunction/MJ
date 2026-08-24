/**
 * SSRF (Server-Side Request Forgery) guard utilities.
 *
 * Any server-side code that fetches a caller-controlled URL is a read-SSRF risk: an attacker who can
 * influence the URL (via an AI agent, an Action, a workflow, or an API parameter) could make the
 * server request internal, loopback, link-local, or cloud-metadata endpoints (e.g.
 * `http://169.254.169.254/` — the IMDS credentials endpoint) and read the response back. A scheme
 * check alone does NOT prevent this, and DNS rebinding + HTTP redirects defeat any naive
 * hostname-string check.
 *
 * This module resolves the hostname to ALL of its IP addresses and rejects the request if ANY of
 * them fall in a private/reserved range, and re-validates every redirect hop. It has no third-party
 * dependencies — only `node:dns` and `node:net` — which is why it lives in this low-level package
 * rather than in any one consumer.
 */

import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/**
 * Thrown when a URL is rejected by the guard: malformed, a non-`http(s)` scheme, a hostname that
 * does not resolve, or an address in a private/reserved range.
 *
 * Treat this as a security decision, not a transport failure. It is deliberately a distinct type
 * from `HttpError` so a blocked URL is never retried, never counted as an outage, and can be
 * surfaced to the caller as its own result code.
 *
 * The message is intentionally non-specific ("resolves to a private or reserved address") rather
 * than naming the address it resolved to: echoing that back would turn the guard into an internal
 * network scanner for whoever supplied the URL.
 *
 * @example
 * ```ts
 * try {
 *     const response = await SafeFetch(userSuppliedUrl);
 * } catch (error) {
 *     if (error instanceof SSRFError) {
 *         return { Success: false, ResultCode: 'SSRF_BLOCKED', Message: error.message };
 *     }
 *     throw error;
 * }
 * ```
 */
export class SSRFError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SSRFError";
    }
}

/** Blocked IPv4 CIDR ranges, expressed as `[network, prefixLength]`. */
const BLOCKED_IPV4_CIDRS: ReadonlyArray<readonly [string, number]> = [
    ["0.0.0.0", 8], // "this" network / unspecified
    ["10.0.0.0", 8], // private
    ["100.64.0.0", 10], // carrier-grade NAT
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local (incl. 169.254.169.254 IMDS)
    ["172.16.0.0", 12], // private
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.0.2.0", 24], // TEST-NET-1 (documentation)
    ["192.88.99.0", 24], // 6to4 relay anycast
    ["192.168.0.0", 16], // private
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // TEST-NET-2 (documentation)
    ["203.0.113.0", 24], // TEST-NET-3 (documentation)
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved (incl. 255.255.255.255 broadcast)
];

/**
 * Parses a dotted-quad IPv4 string into an unsigned 32-bit integer.
 * @returns the integer value, or `null` if the string is not a valid IPv4 address.
 */
function parseIPv4(ip: string): number | null {
    const octets = ip.split(".");
    if (octets.length !== 4) {
        return null;
    }
    let value = 0;
    for (const octet of octets) {
        if (!/^\d{1,3}$/.test(octet)) {
            return null;
        }
        const num = Number(octet);
        if (num > 255) {
            return null;
        }
        value = (value << 8) | num;
    }
    return value >>> 0;
}

/** Returns true if the given 32-bit IPv4 value falls within the `[network, prefix]` CIDR. */
function ipv4InCidr(value: number, network: string, prefix: number): boolean {
    const base = parseIPv4(network);
    if (base === null) {
        return false;
    }
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (base & mask);
}

/** Returns true if an IPv4 address (as a 32-bit integer) is in any blocked range. */
function isBlockedIPv4Value(value: number): boolean {
    return BLOCKED_IPV4_CIDRS.some(([network, prefix]) => ipv4InCidr(value, network, prefix));
}

/**
 * Expands an IPv6 string (already validated by `net.isIP`, so shortened `::` forms and embedded
 * IPv4 tails are accepted) into its eight 16-bit groups.
 * @returns the 8-element group array, or `null` if it cannot be parsed.
 */
function parseIPv6(ip: string): number[] | null {
    let addr = ip;
    const zoneIndex = addr.indexOf("%");
    if (zoneIndex !== -1) {
        addr = addr.slice(0, zoneIndex);
    }

    const halves = addr.split("::");
    if (halves.length > 2) {
        return null;
    }

    const head = parseIPv6Groups(halves[0]);
    if (head === null) {
        return null;
    }

    if (halves.length === 1) {
        return head.length === 8 ? head : null;
    }

    const tail = parseIPv6Groups(halves[1]);
    if (tail === null) {
        return null;
    }
    const missing = 8 - head.length - tail.length;
    if (missing < 0) {
        return null;
    }
    return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

/** Parses one side of an IPv6 address (the part before or after `::`) into 16-bit groups. */
function parseIPv6Groups(part: string): number[] | null {
    if (part === "") {
        return [];
    }
    const tokens = part.split(":");
    const groups: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.includes(".")) {
            // Embedded IPv4 tail (e.g. ::ffff:192.168.0.1) — must be the final token.
            if (i !== tokens.length - 1) {
                return null;
            }
            const v4 = parseIPv4(token);
            if (v4 === null) {
                return null;
            }
            groups.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
        } else {
            if (!/^[0-9a-fA-F]{1,4}$/.test(token)) {
                return null;
            }
            groups.push(parseInt(token, 16));
        }
    }
    return groups;
}

/**
 * Determines whether an IPv6 address (given as its 8 groups) is in a blocked range: loopback (`::1`),
 * unspecified (`::`), ULA (`fc00::/7`), link-local (`fe80::/10`), multicast (`ff00::/8`), or an
 * IPv4-mapped/compatible address whose embedded IPv4 is itself blocked (`::ffff:a.b.c.d`, `::a.b.c.d`).
 */
function isBlockedIPv6Groups(groups: number[]): boolean {
    const isUnspecified = groups.every((g) => g === 0);
    if (isUnspecified) {
        return true; // ::
    }
    const isLoopback = groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1;
    if (isLoopback) {
        return true; // ::1
    }

    // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96) — unwrap and apply IPv4 rules.
    const firstFiveZero = groups.slice(0, 5).every((g) => g === 0);
    if (firstFiveZero && (groups[5] === 0xffff || groups[5] === 0)) {
        const embedded = (((groups[6] << 16) >>> 0) | groups[7]) >>> 0;
        if (isBlockedIPv4Value(embedded)) {
            return true;
        }
    }

    if ((groups[0] & 0xfe00) === 0xfc00) {
        return true; // fc00::/7 (unique local address)
    }
    if ((groups[0] & 0xffc0) === 0xfe80) {
        return true; // fe80::/10 (link-local)
    }
    if ((groups[0] & 0xff00) === 0xff00) {
        return true; // ff00::/8 (multicast)
    }
    return false;
}

/**
 * Classifies a single IP address literal as blocked or allowed.
 *
 * This is the pure, synchronous core of the guard — no DNS, no I/O — exposed for callers that have
 * already resolved an address themselves (a proxy allowlist, a webhook source check, a test).
 * For anything URL-shaped, use {@link AssertPublicUrl}, which also handles resolution and the
 * scheme check.
 *
 * Fails closed: anything `net.isIP` does not recognize as a v4 or v6 literal is reported as
 * blocked, so a parsing gap can never silently widen what is reachable.
 *
 * @param address - an IPv4 or IPv6 address literal (no brackets, no port).
 * @returns true when the address falls in a blocked range and must not be fetched.
 *
 * @example
 * ```ts
 * IsBlockedIPAddress('169.254.169.254');   // true  — cloud metadata endpoint
 * IsBlockedIPAddress('10.0.0.5');          // true  — RFC 1918 private
 * IsBlockedIPAddress('::ffff:127.0.0.1');  // true  — IPv4-mapped loopback
 * IsBlockedIPAddress('93.184.216.34');     // false — public
 * IsBlockedIPAddress('not-an-ip');         // true  — fail closed
 * ```
 */
export function IsBlockedIPAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) {
        const value = parseIPv4(address);
        return value === null ? true : isBlockedIPv4Value(value);
    }
    if (family === 6) {
        const groups = parseIPv6(address);
        return groups === null ? true : isBlockedIPv6Groups(groups);
    }
    // Not a recognizable IP literal — fail closed.
    return true;
}

/** Strips the surrounding brackets from an IPv6 literal hostname (e.g. `[::1]` -> `::1`). */
function stripIPv6Brackets(hostname: string): string {
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
        return hostname.slice(1, -1);
    }
    return hostname;
}

/**
 * Validates a URL for SSRF safety, resolving its hostname to check where it actually points.
 *
 * Four checks, in order — any one of them rejects:
 * 1. The URL parses at all.
 * 2. The scheme is `http` or `https`. This blocks `file://`, `gopher://`, `ftp://`, and the rest,
 *    which are otherwise a rich source of SSRF primitives.
 * 3. The hostname resolves. A name that does not is rejected rather than handed to `fetch`.
 * 4. EVERY address it resolves to is public. Literal-IP hosts — including bracketed IPv6 such as
 *    `[::1]` — are checked the same way.
 *
 * Checking every address, rather than the first, is what closes the multi-record bypass: an
 * attacker controlling DNS can publish one public A record alongside `127.0.0.1` and rely on the
 * resolver picking whichever it likes.
 *
 * IMPORTANT — validation alone is not protection. There is an unavoidable gap between this check
 * and the connection that follows, during which DNS can change (a classic rebinding race). Prefer
 * {@link SafeFetch}, which re-validates every redirect hop; see the package README's
 * "What this does not protect against" section for the residual risk and how to close it.
 *
 * @param rawUrl - the caller-controlled URL to validate.
 * @returns the parsed {@link URL}, ready to fetch.
 * @throws {SSRFError} when the URL is malformed, uses an unsupported scheme, fails to resolve, or
 *   resolves to any private or reserved address.
 *
 * @example Validating without fetching
 * ```ts
 * // e.g. checking a batch of links before probing them
 * for (const link of links) {
 *     try {
 *         await AssertPublicUrl(link.url);
 *         link.valid = true;
 *     } catch (error) {
 *         if (!(error instanceof SSRFError)) throw error;
 *         link.valid = false;                 // one bad URL must not fail the whole batch
 *         link.reason = error.message;
 *     }
 * }
 * ```
 */
export async function AssertPublicUrl(rawUrl: string): Promise<URL> {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new SSRFError(`Invalid URL: ${rawUrl}`);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new SSRFError(`Unsupported URL scheme '${parsed.protocol}' — only http and https are allowed`);
    }

    const hostname = stripIPv6Brackets(parsed.hostname);
    if (!hostname) {
        throw new SSRFError("URL has no hostname");
    }

    const addresses = await resolveAllAddresses(hostname);
    for (const address of addresses) {
        if (IsBlockedIPAddress(address)) {
            throw new SSRFError("URL resolves to a private or reserved address and was blocked");
        }
    }

    return parsed;
}

/**
 * Resolves a hostname to every IP address it maps to.
 *
 * Uses `dns.lookup(host, { all: true })` rather than `dns.resolve4`/`resolve6` so the answer
 * matches what the OS resolver — and therefore `fetch` — will actually use, including `/etc/hosts`
 * entries and any local resolver policy. Literal IPs short-circuit to themselves.
 *
 * @param hostname - the host to resolve (IPv6 literals already unbracketed).
 * @returns every address the hostname maps to; never empty.
 * @throws {SSRFError} when the hostname cannot be resolved — failing closed rather than handing an
 *   unverified name to `fetch`.
 */
async function resolveAllAddresses(hostname: string): Promise<string[]> {
    try {
        const records = await dns.lookup(hostname, { all: true });
        if (records.length === 0) {
            throw new SSRFError(`Hostname '${hostname}' did not resolve to any address`);
        }
        return records.map((record) => record.address);
    } catch (error) {
        if (error instanceof SSRFError) {
            throw error;
        }
        throw new SSRFError(`Unable to resolve hostname '${hostname}': ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Status codes that carry a `Location` header worth following. 3xx codes absent from this set
 * (300 Multiple Choices, 304 Not Modified, 305 Use Proxy) are returned to the caller as-is.
 */
const REDIRECT_STATUS_CODES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * Everything the standard `fetch` init accepts, plus a redirect cap.
 *
 * `redirect` is deliberately not honored: {@link SafeFetch} always drives redirects manually so it
 * can re-validate each hop, and silently accepting `redirect: 'follow'` would hand that back to the
 * platform and defeat the guard.
 */
export type SafeFetchInit = RequestInit & {
    /** Maximum number of redirect hops to follow (each re-validated). Default: 5. */
    MaxRedirects?: number;
};

/**
 * A drop-in replacement for `fetch` that is safe against SSRF. **This is the function to reach for**
 * whenever the URL is not one you hard-coded.
 *
 * Two things make it safe where a one-time hostname check is not:
 *
 * 1. **Every hop is validated.** Automatic redirects are disabled (`redirect: 'manual'`) and each
 *    3xx `Location` is resolved against the current URL and re-run through {@link AssertPublicUrl}
 *    before being followed. A public URL that 302s to `http://169.254.169.254/` is caught on the
 *    second hop, which is exactly what a naive check misses.
 * 2. **Every address is checked**, not just the first — see {@link AssertPublicUrl}.
 *
 * Intermediate response bodies are cancelled as it goes, so following a chain does not leak
 * sockets.
 *
 * @param rawUrl - the caller-controlled URL to fetch.
 * @param init - standard `fetch` init, plus an optional `MaxRedirects` (default 5). Any `redirect`
 *   value is ignored; redirects are always driven manually.
 * @returns the final {@link Response}, after following any redirects that passed validation. The
 *   body is unread, so the caller chooses `.json()`, `.text()`, `.arrayBuffer()`, and so on.
 * @throws {SSRFError} when the initial URL — or any hop — is malformed, uses a non-http(s) scheme,
 *   fails to resolve, or resolves to a private or reserved address.
 * @throws {Error} when the redirect limit is exceeded.
 *
 * @example Fetching an untrusted URL
 * ```ts
 * const response = await SafeFetch(userSuppliedUrl, {
 *     headers: { 'User-Agent': 'MemberJunction/1.0' },
 *     signal: AbortSignal.timeout(10000),
 *     MaxRedirects: 5,
 * });
 * if (!response.ok) return { Success: false, ResultCode: `HTTP_${response.status}` };
 * const html = await response.text();
 * ```
 *
 * @example Reporting a block distinctly from a fetch failure
 * ```ts
 * try {
 *     return await SafeFetch(url);
 * } catch (error) {
 *     if (error instanceof SSRFError) {
 *         // A security decision — do not retry, do not treat as an outage.
 *         return { Success: false, ResultCode: 'SSRF_BLOCKED' };
 *     }
 *     throw error;
 * }
 * ```
 */
export async function SafeFetch(rawUrl: string, init?: SafeFetchInit): Promise<Response> {
    const maxRedirects = init?.MaxRedirects ?? 5;
    const { MaxRedirects: _ignored, ...fetchInit } = init ?? {};

    let currentUrl = rawUrl;
    let redirectCount = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const validated = await AssertPublicUrl(currentUrl);
        const response = await fetch(validated.href, { ...fetchInit, redirect: "manual" });

        if (!REDIRECT_STATUS_CODES.has(response.status)) {
            return response;
        }

        const location = response.headers.get("location");
        if (!location) {
            // A redirect status with no Location header — nothing to follow; hand it back.
            return response;
        }

        if (redirectCount >= maxRedirects) {
            void response.body?.cancel();
            throw new Error(`Exceeded maximum of ${maxRedirects} redirects while fetching ${rawUrl}`);
        }

        // Release the intermediate response body before following the next hop.
        void response.body?.cancel();
        redirectCount++;
        currentUrl = new URL(location, validated).href;
    }
}
