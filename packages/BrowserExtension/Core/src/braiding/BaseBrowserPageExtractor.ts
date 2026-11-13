/**
 * @fileoverview Abstract base class for pluggable browser page signal extractors
 * in the MemberJunction Browser Extension.
 *
 * Open Apps can register custom subclasses via `@RegisterClass(BaseBrowserPageExtractor, '<Key>')`
 * and reference them in `BrowserContextRuleSpec.CustomExtractorClass`.
 *
 * @module @memberjunction/browser-extension-core
 */

import type {
    BrowserContextRuleSpec,
    BrowserContextSignalSpec,
    BrowserPageStateSnapshot,
} from '../types/extension-types.js';

/**
 * Deterministic linear-time ($O(n)$) helper that strips trailing `'/'` characters
 * from a string without polynomial backtracking regular expressions.
 */
export function StripTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 47 /* '/' */) {
        end--;
    }
    return value.slice(0, end);
}

/**
 * Result of extracting signals and candidate field values from a {@link BrowserPageStateSnapshot}
 * for a given {@link BrowserContextRuleSpec}.
 */
export interface ExtractedPageSignals {
    /** Map of signal index or key (`signal_0`, `HostnameRoot`, etc.) to extracted string values. */
    SignalsByKey: Record<string, string>;
    /** Extracted candidate entity field values (e.g. `{ Name: 'Acme Corp', Website: 'https://acme.com' }`). */
    CandidateEntityFields: Record<string, string>;
}

/**
 * Base class for page signal & field extractors used by {@link BrowserContextEngine}.
 */
export abstract class BaseBrowserPageExtractor {
    /**
     * Extracts matching signal values and candidate entity field values from a page snapshot.
     *
     * @param snapshot The sanitized page state snapshot.
     * @param rule The context rule being evaluated.
     */
    public abstract Extract(
        snapshot: BrowserPageStateSnapshot,
        rule: BrowserContextRuleSpec
    ): ExtractedPageSignals;

    /**
     * Extracts a single signal value from a page snapshot according to its {@link BrowserContextSignalSpec}.
     */
    public ExtractSingleSignal(
        snapshot: BrowserPageStateSnapshot,
        signal: BrowserContextSignalSpec
    ): string | null {
        let rawValue: string | null = null;

        switch (signal.Source) {
            case 'FullUrl':
                rawValue = this.normalizeUrlForLookup(snapshot.Url);
                break;
            case 'HostnameRoot':
                rawValue = this.extractRegistrableDomain(snapshot.Hostname || snapshot.Url);
                break;
            case 'UrlRegexGroup':
                if (signal.SelectorOrPattern) {
                    try {
                        const re = new RegExp(signal.SelectorOrPattern, 'i');
                        const match = re.exec(snapshot.Url);
                        rawValue = match ? (match[1] ?? match[0] ?? null) : null;
                    } catch {
                        rawValue = null;
                    }
                }
                break;
            case 'OpenGraph':
                if (signal.SelectorOrPattern) {
                    const key = signal.SelectorOrPattern.toLowerCase();
                    rawValue =
                        snapshot.OpenGraph[key] ??
                        snapshot.OpenGraph[`og:${key}`] ??
                        null;
                }
                break;
            case 'SchemaOrgJsonLd':
                rawValue = this.extractFromSchemaOrg(snapshot.SchemaOrgEntities, signal.SelectorOrPattern);
                break;
            case 'MetaTag':
                if (signal.SelectorOrPattern) {
                    const key = signal.SelectorOrPattern.toLowerCase();
                    rawValue = snapshot.MetaTags[key] ?? null;
                }
                break;
            case 'DomCssSelector':
            case 'DomXPath':
                if (signal.SelectorOrPattern) {
                    rawValue = snapshot.CapturedSignals[signal.SelectorOrPattern] ?? null;
                }
                break;
        }

        if (rawValue === null || rawValue === undefined) {
            return null;
        }
        return this.applyNormalization(rawValue, signal.Normalize);
    }

    /**
     * Normalizes a URL for entity lookup (strips query string, hash, and trailing slash).
     */
    protected normalizeUrlForLookup(url: string): string {
        if (!url) {
            return '';
        }
        try {
            const parsed = new URL(url);
            const cleanPath = StripTrailingSlashes(parsed.pathname);
            return `${parsed.origin}${cleanPath}`;
        } catch {
            return StripTrailingSlashes(url.trim());
        }
    }

    /**
     * Extracts the registrable root domain (e.g. `app.hubspot.com` -> `hubspot.com`, `www.acme.co.uk` -> `acme.co.uk`).
     */
    protected extractRegistrableDomain(hostnameOrUrl: string): string {
        let host = hostnameOrUrl.trim().toLowerCase();
        if (host.includes('://')) {
            try {
                host = new URL(host).hostname.toLowerCase();
            } catch {
                // keep as-is
            }
        }
        if (host.startsWith('www.')) {
            host = host.slice(4);
        }
        const parts = host.split('.').filter((p) => p.length > 0);
        if (parts.length <= 2) {
            return parts.join('.');
        }
        const multiPartTlds = new Set(['co.uk', 'org.uk', 'gov.uk', 'com.au', 'co.jp', 'co.nz', 'com.br']);
        const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
        if (multiPartTlds.has(lastTwo) && parts.length >= 3) {
            return `${parts[parts.length - 3]}.${lastTwo}`;
        }
        return lastTwo;
    }

    protected extractFromSchemaOrg(
        entities: Record<string, unknown>[],
        pathPattern?: string
    ): string | null {
        if (!entities || entities.length === 0) {
            return null;
        }
        if (!pathPattern) {
            const first = entities[0];
            const nameVal = first?.['name'];
            return typeof nameVal === 'string' ? nameVal : null;
        }

        // Supports Type.field (e.g. "Person.name" or "Organization.url") or simple "name"
        const [maybeType, maybeProp] = pathPattern.includes('.')
            ? pathPattern.split('.', 2)
            : [null, pathPattern];

        for (const entity of entities) {
            const entityType = typeof entity['@type'] === 'string' ? entity['@type'] : '';
            if (maybeType && entityType.toLowerCase() !== maybeType.toLowerCase()) {
                continue;
            }
            const val = maybeProp ? entity[maybeProp] : undefined;
            if (typeof val === 'string' && val.trim().length > 0) {
                return val.trim();
            }
        }
        return null;
    }

    protected applyNormalization(
        value: string,
        normalize?: BrowserContextSignalSpec['Normalize']
    ): string {
        const trimmed = value.trim();
        switch (normalize) {
            case 'Lowercase':
                return trimmed.toLowerCase();
            case 'StripTrailingSlash':
                return StripTrailingSlashes(trimmed);
            case 'HostnameRoot':
                return this.extractRegistrableDomain(trimmed);
            case 'Trim':
            default:
                return trimmed;
        }
    }
}
