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
