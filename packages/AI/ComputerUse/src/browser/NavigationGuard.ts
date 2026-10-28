/**
 * Navigation guard that enforces domain allow/block lists.
 *
 * Precedence rules (evaluated in this exact order):
 * 1. BlockedDomains — always wins. If a domain matches, it's blocked.
 * 2. AllowedDomains — if set and non-empty, acts as a whitelist.
 *    Only domains in this list are allowed; all others are implicitly blocked.
 * 3. Open navigation — if AllowedDomains is empty/undefined, all
 *    non-blocked domains are allowed.
 *
 * Supports wildcard patterns:
 * - "*" matches everything
 * - "*.example.com" matches subdomains (foo.example.com, bar.example.com)
 *   AND the bare domain (example.com) itself
 * - "example.com" matches only exact domain
 */

import { NavigationDecision } from '../types/browser.js';

/**
 * Name suffixes that only resolve inside a private network: `localhost` subdomains, and the Docker
 * (`host.docker.internal`), cloud-metadata (`metadata.google.internal`) and Kubernetes (`*.svc`) names.
 */
const PRIVATE_NAME_SUFFIXES = ['.localhost', '.internal', '.local', '.lan', '.corp', '.home.arpa', '.svc'];

export class NavigationGuard {
    private allowedDomains: string[];
    private blockedDomains: string[];

    constructor(allowedDomains?: string[], blockedDomains?: string[]) {
        this.allowedDomains = allowedDomains ?? [];
        this.blockedDomains = blockedDomains ?? [];
    }

    /**
     * Check whether navigation to the given URL is allowed.
     *
     * @param url - The URL to check (full URL or just a domain)
     * @returns NavigationDecision with Allowed, Reason, and Domain
     */
    public CheckNavigation(url: string): NavigationDecision {
        const domain = NavigationGuard.ExtractDomain(url);

        // Rule 1: Blocked always wins
        if (this.isDomainInList(domain, this.blockedDomains)) {
            return new NavigationDecision(
                false,
                `Domain '${domain}' is in the blocked list`,
                domain
            );
        }

        // Rule 2: If allowlist is set and non-empty, domain must be in it
        if (this.allowedDomains.length > 0) {
            if (this.isDomainInList(domain, this.allowedDomains)) {
                return new NavigationDecision(
                    true,
                    `Domain '${domain}' is in the allowed list`,
                    domain
                );
            }
            return new NavigationDecision(
                false,
                `Domain '${domain}' is not in the allowed list`,
                domain
            );
        }

        // Rule 3: No allowlist = open navigation
        return new NavigationDecision(
            true,
            'Open navigation (no allowlist configured)',
            domain
        );
    }

    /**
     * Check if a domain matches any pattern in the given list.
     */
    private isDomainInList(domain: string, patterns: string[]): boolean {
        return patterns.some(pattern => NavigationGuard.MatchesDomain(domain, pattern));
    }

    /**
     * Match a domain against a pattern.
     * Supports:
     * - "*" → matches everything
     * - "*.example.com" → matches subdomains AND bare domain
     * - "example.com" → exact match only
     *
     * This is a static method so it can be reused by AuthHandler
     * for the same domain matching logic.
     */
    public static MatchesDomain(actual: string, pattern: string): boolean {
        if (pattern === '*') return true;

        if (pattern.startsWith('*.')) {
            const suffix = pattern.slice(1); // ".example.com"
            const bareDomain = pattern.slice(2); // "example.com"
            return actual.endsWith(suffix) || actual === bareDomain;
        }

        return actual === pattern;
    }

    /**
     * Whether `hostname` NAMES this machine or a private network: `localhost` (and `*.localhost`), a
     * dotless intranet name, or a loopback, private, shared, link-local or unique-local IP literal.
     * Pass a parsed URL's `hostname`, so numeric IPv4 forms arrive normalized.
     * ponytail: best effort, a hostname test only. A name that RESOLVES to a private address
     * (`127.0.0.1.nip.io`, `localtest.me`, DNS rebinding) passes; real isolation is network egress
     * rules on the machine the browser runs on.
     */
    public static IsPrivateNetworkHost(hostname: string): boolean {
        // A trailing dot names the same host (`localhost.`, `127.0.0.1.`).
        const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
        if (host.includes(':')) {
            return NavigationGuard.isPrivateIPv6(host);
        }
        if (host === 'localhost' || !host.includes('.') || PRIVATE_NAME_SUFFIXES.some((s) => host.endsWith(s))) {
            return true;
        }
        return /^\d+\.\d+\.\d+\.\d+$/.test(host) && NavigationGuard.isPrivateIPv4(host);
    }

    /** Loopback, private, shared, link-local and special-use IPv4 ranges. */
    private static isPrivateIPv4(host: string): boolean {
        const [a, b, c] = host.split('.').map(Number);
        return (
            a === 0 || a === 10 || a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0 && c === 0) ||
            (a === 198 && (b === 18 || b === 19))
        );
    }

    /**
     * An IPv6 literal (as a URL writes it: compressed, IPv4 tails in hex): loopback, unspecified,
     * unique-local, link-local, site-local, IPv4-mapped and IPv4-compatible, or NAT64 carrying a private
     * IPv4. The prefix patterns only mean anything here, never on a name like fda.gov.
     */
    private static isPrivateIPv6(host: string): boolean {
        if (host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89a-f]/.test(host) || host.startsWith('::ffff:')) {
            return true;
        }
        const tail = /^(::|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
        if (!tail) {
            return false;
        }
        if (tail[1] === '::') {
            return true; // IPv4-compatible: deprecated, never a public destination
        }
        const [hi, lo] = [parseInt(tail[2], 16), parseInt(tail[3], 16)];
        return NavigationGuard.isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }

    /**
     * Extract the hostname from a URL string.
     * Handles full URLs and bare domains gracefully.
     */
    public static ExtractDomain(url: string): string {
        try {
            return new URL(url).hostname;
        } catch {
            // If it's not a valid URL, treat it as a bare domain
            return url;
        }
    }
}
