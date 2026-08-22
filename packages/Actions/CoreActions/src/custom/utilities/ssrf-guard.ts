import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/**
 * SSRF (Server-Side Request Forgery) guard utilities.
 *
 * Server-side actions that fetch a caller-controlled URL are a read-SSRF risk: an attacker who can
 * invoke the action (via an AI agent, workflow, or API) could make the server request internal,
 * loopback, link-local, or cloud-metadata endpoints (e.g. `http://169.254.169.254/` — the IMDS
 * credentials endpoint) and read the response back. A scheme check alone does NOT prevent this, and
 * DNS rebinding + HTTP redirects defeat any naive hostname-string check.
 *
 * This module resolves the hostname to ALL of its IP addresses and rejects the request if ANY of
 * them fall in a private/reserved range, and re-validates every redirect hop. It has no third-party
 * dependencies — only `node:dns` and `node:net`.
 */

/** Thrown when a URL is blocked because it resolves to a private or reserved address (or is malformed). */
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
 * Classifies a single resolved IP address (IPv4 or IPv6) as blocked or allowed.
 * Unparseable addresses are treated as blocked (fail closed).
 */
export function isBlockedIPAddress(address: string): boolean {
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
 * Parses and validates a URL for SSRF safety.
 *
 * Rejects any URL whose scheme is not `http`/`https`, and resolves the hostname to ALL of its IP
 * addresses (via `dns.lookup(..., { all: true })`) — throwing {@link SSRFError} if ANY resolved
 * address is in a private, loopback, link-local (incl. cloud-metadata `169.254.169.254`), or
 * reserved range. Literal-IP hostnames are validated the same way. Resolving every address closes
 * the multi-record / DNS-rebinding bypass where only one of several A/AAAA records is public.
 *
 * @param rawUrl - the caller-controlled URL to validate.
 * @returns the parsed {@link URL} when it is safe to fetch.
 * @throws {SSRFError} if the URL is malformed, uses an unsupported scheme, or resolves to a blocked address.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
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
        if (isBlockedIPAddress(address)) {
            throw new SSRFError("URL resolves to a private or reserved address and was blocked");
        }
    }

    return parsed;
}

/**
 * Resolves a hostname to every IP address it maps to. Literal IPs short-circuit to themselves.
 * @throws {SSRFError} if the hostname cannot be resolved (fail closed rather than fetch blindly).
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

/** HTTP status codes that indicate a redirect carrying a `Location` header. */
const REDIRECT_STATUS_CODES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** Options accepted by {@link safeFetch} in addition to the standard `fetch` init. */
export type SafeFetchInit = RequestInit & {
    /** Maximum number of redirect hops to follow (each re-validated). Default: 5. */
    maxRedirects?: number;
};

/**
 * A drop-in replacement for `fetch` that is safe against SSRF.
 *
 * It validates the target with {@link assertPublicUrl}, then fetches with automatic redirects
 * DISABLED (`redirect: 'manual'`). When the response is a 3xx with a `Location` header, it resolves
 * the redirect target against the current URL, re-runs {@link assertPublicUrl} on it, and follows
 * the redirect manually — up to `maxRedirects` hops. Re-validating every hop is what closes the
 * redirect + DNS-rebinding bypass that a one-time hostname check would miss.
 *
 * @param rawUrl - the caller-controlled URL to fetch.
 * @param init - standard `fetch` init plus an optional `maxRedirects` (default 5).
 * @returns the final {@link Response} after following any (validated) redirects.
 * @throws {SSRFError} if any hop's URL is blocked.
 * @throws {Error} if the redirect limit is exceeded.
 */
export async function safeFetch(rawUrl: string, init?: SafeFetchInit): Promise<Response> {
    const maxRedirects = init?.maxRedirects ?? 5;
    const { maxRedirects: _ignored, ...fetchInit } = init ?? {};

    let currentUrl = rawUrl;
    let redirectCount = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const validated = await assertPublicUrl(currentUrl);
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
